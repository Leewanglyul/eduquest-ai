import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PlayError, unwrapPlay } from "./errors";

export const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/**
 * The student behind a session profile. The id is NEVER taken from a URL, a form or a request body: callers pass
 * the profile of the signed-in user (session-derived identity) and get the student id from the database.
 */
export async function getStudentIdForProfile(profileId: string): Promise<string> {
  const { data } = await createSupabaseAdminClient().from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (!data) throw new PlayError("NOT_FOUND");
  return data.id;
}

export type PlayAccess = { reason: "OPEN" | "CLOSED"; puzzleId: string; readonly: boolean; saveAllowed: boolean };

/**
 * The one access rule (doc 08 A): enrolled, classroom live, assignment open and inside its window, puzzle published
 * (a closed assignment stays viewable when the student already has an attempt). A malformed id is "not found", the
 * same as an id that does not exist, so nothing about other assignments can be learned.
 */
export async function requirePlayAccess(studentId: string, assignmentId: string): Promise<PlayAccess> {
  if (!isUuid(assignmentId)) throw new PlayError("NOT_FOUND");
  const rows = unwrapPlay<
    { ok: boolean; reason: string; puzzle_id: string | null; readonly: boolean; save_allowed: boolean }[]
  >(
    await createSupabaseAdminClient().rpc("fn_crossword_play_access", {
      p_student_id: studentId,
      p_assignment_id: assignmentId,
    }),
  );
  const row = rows[0];
  if (!row || !row.ok || !row.puzzle_id) {
    throw new PlayError(row?.reason === "CLOSED" ? "CLOSED" : row?.reason === "NOT_OPEN_YET" ? "NOT_OPEN_YET" : "NOT_FOUND");
  }
  return { reason: row.reason === "OPEN" ? "OPEN" : "CLOSED", puzzleId: row.puzzle_id, readonly: row.readonly, saveAllowed: row.save_allowed };
}

/** The attempt of this student for this assignment; the client never sends an attempt id. */
export async function requireAttemptId(studentId: string, assignmentId: string): Promise<string> {
  if (!isUuid(assignmentId)) throw new PlayError("NOT_FOUND");
  const { data } = await createSupabaseAdminClient()
    .from("crossword_attempt_members")
    .select("attempt_id")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!data) throw new PlayError("NOT_FOUND");
  return data.attempt_id;
}
