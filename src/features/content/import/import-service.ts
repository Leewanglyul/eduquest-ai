import crypto from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  COMMIT_TOKEN_TTL_MINUTES,
  MAX_ACTIVE_PREVIEWS,
  PREVIEW_CLEANUP_GRACE_HOURS,
  contentRunInputSchema,
  type ContentImportMode,
  type PreparedContentRow,
} from "./content-schemas";
import { ContentImportError, mapDatabaseErrorCode } from "./import-errors";
import { toCommitRows } from "./preview";
import { hashContentRows, sha256Hex } from "./rows-hash";

/** Where an import goes. `newSetTitle` is already normalised; `classroomId` applies to `create` only. */
export type ImportTarget = {
  mode: ContentImportMode;
  setId: string | null;
  newSetTitle: string | null;
  classroomId: string | null;
};

export type ImportActor = { id: string; school_id: string };

export type ImportSource = { sha256: string; byteLength: number };

export type ContentPreviewTicket = { batchId: string; commitToken: string; expiresAt: string };

export type ContentImportResult = {
  setId: string;
  created: boolean;
  accepted: number;
  skipped: number;
  archived: number;
};

/** The one place rows are turned into the hash AND the database payload, so the two cannot drift apart. */
export function buildCommitPayload(target: ImportTarget, rows: PreparedContentRow[]) {
  return {
    rowsHash: hashContentRows({ ...target, rows }),
    rpcRows: toCommitRows(rows) as unknown as Json,
  };
}

/**
 * Deletes previews that were never committed and expired more than the grace period ago. Completed
 * imports are kept (they are the history). Returns the number of deleted tickets. Never throws: this is
 * housekeeping and must not block a preview.
 */
export async function cleanupContentImportBatches(): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().rpc("fn_cleanup_content_import_batches", {
    p_grace: `${PREVIEW_CLEANUP_GRACE_HOURS} hours`,
  });
  if (error) {
    console.error("[content-import] cleanup failed", { code: error.code, message: error.message });
    return 0;
  }
  return data ?? 0;
}

/** Keeps at most MAX_ACTIVE_PREVIEWS live previews per teacher: the oldest ones are marked expired. */
async function limitActivePreviews(actorId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("content_import_batches")
    .select("id")
    .eq("actor_id", actorId)
    .eq("status", "previewed")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;
  const excess = (data ?? []).length - (MAX_ACTIVE_PREVIEWS - 1);
  if (excess <= 0) return;
  const ids = (data ?? []).slice(0, excess).map((r) => r.id);
  await admin.from("content_import_batches").update({ status: "expired" }).in("id", ids);
}

/**
 * Stores a previewed import and returns a single-use commit token (only its sha256 is persisted). The stored
 * rows hash covers mode, target, title, classroom and the prepared rows.
 */
export async function createContentImportPreview(input: {
  actor: ImportActor;
  target: ImportTarget;
  rows: PreparedContentRow[];
  source: ImportSource;
}): Promise<ContentPreviewTicket> {
  if (input.rows.length === 0) throw new ContentImportError("NO_VALID_ROWS");
  contentRunInputSchema.parse({ rows: input.rows });
  if (input.source.byteLength <= 0) throw new ContentImportError("EMPTY_FILE");

  await cleanupContentImportBatches();
  await limitActivePreviews(input.actor.id);

  const commitToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + COMMIT_TOKEN_TTL_MINUTES * 60_000).toISOString();
  const { rowsHash } = buildCommitPayload(input.target, input.rows);

  const { data, error } = await createSupabaseAdminClient()
    .from("content_import_batches")
    .insert({
      school_id: input.actor.school_id,
      actor_id: input.actor.id,
      set_id: input.target.setId,
      mode: input.target.mode,
      commit_token_hash: sha256Hex(commitToken),
      rows_hash: rowsHash,
      source_sha256: input.source.sha256,
      source_bytes: input.source.byteLength,
      total_rows: input.rows.length,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) throw new ContentImportError("BATCH_PERSIST_FAILED");

  return { batchId: data.id, commitToken, expiresAt };
}

/**
 * Commits a previewed import through fn_commit_content_import: one transaction that claims the single-use
 * token, recomputes the rows hash from the rows it inserts, authorises the actor, applies the mode and writes
 * the audit rows. Database exception codes are mapped to ContentImportError; anything unknown is rethrown.
 */
export async function commitContentImport(input: {
  actor: ImportActor;
  batchId: string;
  commitToken: string;
  target: ImportTarget;
  rows: PreparedContentRow[];
  maxSetEntries: number;
}): Promise<ContentImportResult> {
  if (input.rows.length === 0) throw new ContentImportError("NO_VALID_ROWS");
  contentRunInputSchema.parse({ rows: input.rows });
  if (!input.batchId || !input.commitToken) throw new ContentImportError("BATCH_NOT_FOUND");

  const { rowsHash, rpcRows } = buildCommitPayload(input.target, input.rows);
  // The generated argument types are not nullable; the function accepts NULL for the target it does not use.
  const nullable = (value: string | null) => value as unknown as string;

  const { data, error } = await createSupabaseAdminClient().rpc("fn_commit_content_import", {
    p_batch_id: input.batchId,
    p_actor_id: input.actor.id,
    p_school_id: input.actor.school_id,
    p_token_hash: sha256Hex(input.commitToken),
    p_rows_hash: rowsHash,
    p_mode: input.target.mode,
    p_set_id: nullable(input.target.setId),
    p_new_title: nullable(input.target.newSetTitle),
    p_classroom_id: nullable(input.target.classroomId),
    p_rows: rpcRows,
    p_max_entries: input.maxSetEntries,
  });

  if (error) {
    const code = mapDatabaseErrorCode(error.message);
    if (code) throw new ContentImportError(code);
    throw error;
  }

  const result = data as { status?: string; setId?: string; created?: boolean; accepted?: number; skipped?: number; archived?: number } | null;
  if (result?.status === "expired") throw new ContentImportError("BATCH_EXPIRED");
  if (result?.status !== "completed" || !result.setId) throw new ContentImportError("BATCH_PERSIST_FAILED");

  return {
    setId: result.setId,
    created: result.created === true,
    accepted: result.accepted ?? 0,
    skipped: result.skipped ?? 0,
    archived: result.archived ?? 0,
  };
}
