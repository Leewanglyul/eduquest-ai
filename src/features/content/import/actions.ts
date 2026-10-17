"use server";

import { writeAuditLog } from "@/lib/audit/log";
import { requireTeacherArea } from "@/lib/rbac/guards";
import { IdentityError } from "@/features/identity/errors";
import {
  CONTENT_IMPORT_MODES,
  MAX_SET_ENTRIES,
  type ContentImportMode,
  type ContentPreviewIssue,
  type PreparedContentRow,
} from "./content-schemas";
import { parseContentCsv } from "./csv-parse";
import { ContentImportError } from "./import-errors";
import {
  commitContentImport,
  createContentImportPreview,
  type ContentImportResult,
  type ImportActor,
  type ImportTarget,
} from "./import-service";
import { normalizeSetTitle } from "./normalize";
import { buildContentPreview, type ContentPreview } from "./preview";
import { readContentSource } from "./read-file";
import { requireLinkableClassroom, requireManageableContentSet } from "../sets/access";
import { loadLiveAnswers, ownerHasLiveTitle, previousImportOf } from "../sets/queries";

/** What the preview screen needs; plain data so it can cross the server action boundary. */
export type ContentPreviewView = {
  mode: ContentImportMode;
  /** Title of the target set (append/replace) or the new set (create). */
  title: string;
  /** Live entries of the target set before the import (0 for create). */
  liveCount: number;
  /** replace: entries that will be archived. */
  willArchive: number;
  valid: PreparedContentRow[];
  invalid: ContentPreviewIssue[];
  counts: ContentPreview["counts"];
  setSize: ContentPreview["setSize"];
  notices: string[];
};

export type ContentPreviewState = {
  ok: boolean;
  error?: string;
  preview?: ContentPreviewView;
  /** Present only when there is at least one row to add. */
  batchId?: string;
  commitToken?: string;
  expiresAt?: string;
};

export type ContentRunState = {
  ok: boolean;
  error?: string;
  result?: ContentImportResult & { mode: ContentImportMode; title: string };
};

type Actor = Awaited<ReturnType<typeof requireTeacherArea>>;

/** Unauthenticated / non-teacher callers get an error state; nothing is created or stored. */
async function authorize(): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  try {
    return { ok: true, actor: await requireTeacherArea() };
  } catch (error) {
    if (error instanceof IdentityError) return { ok: false, error: error.message };
    throw error;
  }
}

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

/**
 * Reads the destination from the form and checks it against the actor: the target set (append/replace) must
 * be visible, writable, not archived and not in an archived classroom; a classroom for a new set must be
 * one the actor teaches and not archived. Both preview and commit run this, so the check is repeated at commit.
 */
async function resolveTarget(
  formData: FormData,
  actor: Actor,
): Promise<{ target: ImportTarget; title: string; liveCount: number }> {
  const mode = text(formData, "mode") as ContentImportMode;
  if (!CONTENT_IMPORT_MODES.includes(mode)) throw new ContentImportError("MODE_INVALID");

  if (mode === "create") {
    const title = normalizeSetTitle(text(formData, "newSetTitle"));
    const classroomId = text(formData, "classroomId") || null;
    if (classroomId) await requireLinkableClassroom(actor, classroomId);
    return { target: { mode, setId: null, newSetTitle: title, classroomId }, title, liveCount: 0 };
  }

  const setId = text(formData, "setId");
  if (!setId) throw new ContentImportError("SET_NOT_FOUND");
  const set = await requireManageableContentSet(actor, setId);
  const { count } = await loadLiveAnswers(set.id);
  // The classroom link is chosen when the set is created; an import never changes it.
  return { target: { mode, setId: set.id, newSetTitle: null, classroomId: null }, title: set.title, liveCount: count };
}

const stateError = (error: unknown): { ok: false; error: string } | null =>
  error instanceof ContentImportError ? { ok: false, error: error.message } : null;

/** Step 1: validate the file and store a preview ticket. Nothing but the ticket is written. */
export async function previewContentImportAction(
  _prev: ContentPreviewState,
  formData: FormData,
): Promise<ContentPreviewState> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const actor = auth.actor;

  try {
    const { target, title, liveCount } = await resolveTarget(formData, actor);
    if (target.mode === "create" && (await ownerHasLiveTitle(actor.id, title))) {
      throw new ContentImportError("TITLE_DUPLICATE");
    }

    const source = await readContentSource(formData);
    const parsed = parseContentCsv(source.text);

    const existing = target.mode === "append" && target.setId ? await loadLiveAnswers(target.setId) : null;
    const preview = buildContentPreview(parsed.rows, {
      mode: target.mode,
      existingAnswers: existing?.answers,
      liveCount: existing?.count ?? 0,
      maxSetEntries: MAX_SET_ENTRIES,
    });
    if (preview.setSize.exceeds) {
      throw new ContentImportError("SET_TOO_LARGE", { current: preview.setSize.current, add: preview.setSize.add });
    }

    const notices = [...parsed.notices];
    if (target.setId) {
      const previous = await previousImportOf(target.setId, source.sha256);
      if (previous) notices.push(`이 파일은 ${previous.slice(0, 10)}에 이미 올렸습니다.`);
    }

    const view: ContentPreviewView = {
      mode: target.mode,
      title,
      liveCount,
      willArchive: target.mode === "replace" ? liveCount : 0,
      valid: preview.valid,
      invalid: preview.invalid,
      counts: preview.counts,
      setSize: preview.setSize,
      notices,
    };
    if (preview.valid.length === 0) return { ok: true, preview: view };

    const ticket = await createContentImportPreview({
      actor: { id: actor.id, school_id: actor.school_id },
      target,
      rows: preview.commitRows,
      source: { sha256: source.sha256, byteLength: source.byteLength },
    });
    return { ok: true, preview: view, ...ticket };
  } catch (error) {
    const state = stateError(error);
    if (state) return state;
    throw error;
  }
}

async function auditRejection(actor: ImportActor, target: ImportTarget | null, batchId: string, code: string) {
  await writeAuditLog({
    actorId: actor.id,
    action: "content_set.import_rejected",
    resourceType: "content_set",
    resourceId: target?.setId ?? null,
    metadata: { schoolId: actor.school_id, batchId: batchId.slice(0, 64), code, mode: target?.mode ?? null },
  });
}

/**
 * Step 2: re-reads and re-validates the file on the server (the client preview is never trusted), then commits
 * through the database function, which claims the single-use token and recomputes the rows hash.
 */
export async function commitContentImportAction(
  _prev: ContentRunState,
  formData: FormData,
): Promise<ContentRunState> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const actor = auth.actor;
  const batchId = text(formData, "batchId");
  let target: ImportTarget | null = null;

  try {
    const resolved = await resolveTarget(formData, actor);
    target = resolved.target;
    if (target.mode === "replace" && text(formData, "confirmReplace") !== "true") {
      throw new ContentImportError("REPLACE_NOT_CONFIRMED");
    }

    const source = await readContentSource(formData);
    const parsed = parseContentCsv(source.text);
    // No existing answers here on purpose: the rows (and their hash) are the file's valid rows, as at preview;
    // the database skips an answer that is already live.
    const { commitRows } = buildContentPreview(parsed.rows, { mode: target.mode, maxSetEntries: MAX_SET_ENTRIES });

    const result = await commitContentImport({
      actor: { id: actor.id, school_id: actor.school_id },
      batchId,
      commitToken: text(formData, "commitToken"),
      target,
      rows: commitRows,
      maxSetEntries: MAX_SET_ENTRIES,
    });
    return { ok: true, result: { ...result, mode: target.mode, title: resolved.title } };
  } catch (error) {
    if (error instanceof ContentImportError) {
      await auditRejection(actor, target, batchId, error.code);
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
