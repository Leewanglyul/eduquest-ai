import "server-only";

import type { ClassroomActor } from "@/features/classrooms/domain";
import { isUuid } from "@/features/content/sets/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CrosswordError, mapDatabaseErrorCode } from "../messages";
import { getTeamSetup } from "./team-service";

/**
 * Resolving a team's open "선생님 부르기" call (M2-3.4 TP-0, G2, D-9).
 *
 * GATE 3 CONTRACT-GAP WORKAROUND, approved by the PM on 2026-11-02 and NOT a precedent for direct table access:
 * fn_crossword_team_list returns only whether a call is open, while fn_crossword_team_help_resolve needs its id. So:
 *   1. the authorised, assignment-scoped team list runs first and must contain the team;
 *   2. ONE narrow server-side read selects only the id of the team's open call (no student, no requester, nothing else);
 *   3. zero rows = nothing to resolve (a no-op, e.g. a colleague resolved it); one row = the existing resolve function,
 *      which checks the actor again; more than one = a controlled error, nothing is changed;
 *   4. the id never leaves this function.
 */
export async function resolveTeamHelp(
  actor: ClassroomActor,
  assignmentId: string,
  teamId: string,
): Promise<{ resolved: boolean }> {
  if (!isUuid(assignmentId) || !isUuid(teamId)) throw new CrosswordError("NOT_FOUND");
  const setup = await getTeamSetup(actor, assignmentId);
  if (!setup.teams.some((t) => t.teamId === teamId)) throw new CrosswordError("NOT_FOUND");

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("crossword_team_help_requests")
    .select("id")
    .eq("team_id", teamId)
    .is("resolved_at", null)
    .limit(2);
  if (error) throw error;
  const open = data ?? [];
  if (open.length === 0) return { resolved: false };
  if (open.length > 1) throw new CrosswordError("HELP_STATE_INVALID");

  const res = await db.rpc("fn_crossword_team_help_resolve", {
    p_actor_id: actor.id,
    p_school_id: actor.school_id,
    p_request_id: open[0].id,
  });
  if (res.error) {
    const code = mapDatabaseErrorCode(res.error.message);
    if (code) throw new CrosswordError(code);
    throw res.error;
  }
  return { resolved: true };
}
