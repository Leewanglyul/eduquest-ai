import crypto from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CrosswordError } from "../messages";
import {
  MAX_LIVE_PREVIEW_TICKETS,
  PREVIEW_TICKET_CLEANUP_GRACE_HOURS,
  PREVIEW_TICKET_TTL_MINUTES,
} from "./constants";

export type PreviewTicket = { ticketId: string; ticketToken: string; expiresAt: string };

export const sha256Hex = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

/**
 * Deletes expired and used tickets older than the grace period. Housekeeping: it never throws and never blocks a
 * preview (same as the CSV import cleanup).
 */
export async function cleanupPreviewTickets(): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().rpc("fn_cleanup_crossword_tickets", {
    p_grace: `${PREVIEW_TICKET_CLEANUP_GRACE_HOURS} hours`,
  });
  if (error) {
    console.error("[crossword] ticket cleanup failed", {
      code: error.code,
      message: error.message,
    });
    return 0;
  }
  return data ?? 0;
}

/** Keeps at most MAX_LIVE_PREVIEW_TICKETS live tickets per teacher: the oldest ones are expired. */
async function limitLiveTickets(actorId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("crossword_preview_tickets")
    .select("id")
    .eq("actor_id", actorId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;
  const excess = (data ?? []).length - (MAX_LIVE_PREVIEW_TICKETS - 1);
  if (excess <= 0) return;
  const ids = (data ?? []).slice(0, excess).map((r) => r.id);
  await admin
    .from("crossword_preview_tickets")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .in("id", ids);
}

/**
 * Stores a preview ticket for a generated puzzle and returns the single-use token (only its sha256 is persisted).
 * The ticket holds hashes and ids only: never a word, an answer or a clue. Regenerating makes a new ticket; it does
 * not consume an older one.
 */
export async function createPreviewTicket(input: {
  actor: { id: string; school_id: string };
  setId: string;
  placementHash: string;
}): Promise<PreviewTicket> {
  await cleanupPreviewTickets();
  await limitLiveTickets(input.actor.id);

  const ticketToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PREVIEW_TICKET_TTL_MINUTES * 60_000).toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from("crossword_preview_tickets")
    .insert({
      school_id: input.actor.school_id,
      actor_id: input.actor.id,
      set_id: input.setId,
      token_hash: sha256Hex(ticketToken),
      placement_hash: input.placementHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) throw new CrosswordError("PERSIST_FAILED");
  return { ticketId: data.id, ticketToken, expiresAt };
}
