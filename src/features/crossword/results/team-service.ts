import "server-only";

import { isTeacherArea, type ClassroomActor } from "@/features/classrooms/domain";
import { isUuid } from "@/features/content/sets/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CrosswordError, mapDatabaseErrorCode } from "../messages";
import { getPuzzleDetail } from "../review/service";
import { buildLiveView } from "../teams/live";
import type { LiveView, TeamRow, TeamSetup, TeamStudent } from "../teams/types";
import { getAssignmentProgress } from "./service";

/**
 * Teacher side of team play (M2-3.4 TP-0). Thin wrappers over the P2 team functions; every rule and every
 * authorisation decision is the database's (P2 D-1): the classroom's owner and co-teachers may change teams, the
 * school admin may only read, anyone else gets NOT_FOUND. The actor always comes from the session.
 *
 * Like results/service.ts (TV-1) this is the only teacher-side code that maps raw function rows; the screens get the
 * mapped shapes of teams/types.ts.
 */

function unwrap<T>(result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) {
    const code = mapDatabaseErrorCode(result.error.message);
    if (code) throw new CrosswordError(code);
    throw result.error;
  }
  return result.data as T;
}

function requireIds(actor: ClassroomActor, ...ids: string[]) {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  for (const id of ids) if (!isUuid(id)) throw new CrosswordError("NOT_FOUND");
}

const rpc = (fn: string, actor: ClassroomActor, args: Record<string, unknown>) =>
  createSupabaseAdminClient().rpc(fn as never, { p_actor_id: actor.id, p_school_id: actor.school_id, ...args } as never);

type ListRow = {
  team_id: string | null;
  label: string | null;
  started: boolean | null;
  member_count: number | null;
  under_min: boolean | null;
  help_open: boolean | null;
  student_id: string | null;
  student_no: string | null;
  display_name: string | null;
};

/**
 * Teams of an assignment and the classroom's students without a team. This is also the access gate of the teacher
 * team screens: owner, co-teacher and school admin pass (read); anyone else gets NOT_FOUND.
 */
export async function getTeamSetup(actor: ClassroomActor, assignmentId: string): Promise<TeamSetup> {
  requireIds(actor, assignmentId);
  const rows = unwrap<ListRow[]>(await rpc("fn_crossword_team_list", actor, { p_assignment_id: assignmentId })) ?? [];
  const teams = new Map<string, TeamRow>();
  const unassigned: TeamStudent[] = [];
  for (const r of rows) {
    const student: TeamStudent | null =
      r.student_id && r.student_no !== null && r.display_name !== null
        ? { studentId: r.student_id, studentNo: r.student_no, displayName: r.display_name }
        : null;
    if (r.team_id === null) {
      if (student) unassigned.push(student);
      continue;
    }
    let team = teams.get(r.team_id);
    if (!team) {
      team = {
        teamId: r.team_id,
        label: r.label ?? "",
        started: r.started === true,
        memberCount: Number(r.member_count ?? 0),
        underMin: r.under_min === true,
        helpOpen: r.help_open === true,
        members: [],
      };
      teams.set(r.team_id, team);
    }
    if (student) team.members.push(student);
  }
  return { teams: [...teams.values()], unassigned };
}

export async function setPlayMode(actor: ClassroomActor, assignmentId: string, mode: "individual" | "team") {
  requireIds(actor, assignmentId);
  return unwrap<{ assignmentId: string; playMode: string }>(
    await rpc("fn_set_crossword_assignment_mode", actor, { p_assignment_id: assignmentId, p_mode: mode }),
  );
}

export async function createTeam(actor: ClassroomActor, assignmentId: string, label: string) {
  requireIds(actor, assignmentId);
  return unwrap<{ teamId: string; label: string }>(await rpc("fn_crossword_team_create", actor, { p_assignment_id: assignmentId, p_label: label }));
}

export async function deleteTeam(actor: ClassroomActor, teamId: string) {
  requireIds(actor, teamId);
  return unwrap<{ teamId: string }>(await rpc("fn_crossword_team_delete", actor, { p_team_id: teamId }));
}

export async function assignStudent(actor: ClassroomActor, teamId: string, studentId: string) {
  requireIds(actor, teamId, studentId);
  const r = unwrap<{ moved: boolean }>(await rpc("fn_crossword_team_assign", actor, { p_team_id: teamId, p_student_id: studentId }));
  return { moved: r.moved === true };
}

export async function unassignStudent(actor: ClassroomActor, teamId: string, studentId: string) {
  requireIds(actor, teamId, studentId);
  const r = unwrap<{ removed: boolean }>(await rpc("fn_crossword_team_unassign", actor, { p_team_id: teamId, p_student_id: studentId }));
  return { removed: r.removed === true };
}

/**
 * The in-class view. The team list runs FIRST: it is the assignment-scoped access gate (owner, co-teacher, school
 * admin). The puzzle detail (for the assignment window and mode) and TV-1 progress are read only after it passed.
 */
export async function getLiveView(actor: ClassroomActor, puzzleId: string, assignmentId: string, now = new Date()): Promise<LiveView> {
  requireIds(actor, puzzleId, assignmentId);
  const setup = await getTeamSetup(actor, assignmentId);
  const detail = await getPuzzleDetail(actor, puzzleId);
  const assignment = detail?.assignments.find((a) => a.id === assignmentId);
  if (!assignment) throw new CrosswordError("NOT_FOUND");
  const progress = await getAssignmentProgress(actor, assignmentId);
  return buildLiveView({
    assignment: { status: assignment.status, opensAt: assignment.opensAt, closesAt: assignment.closesAt, playMode: assignment.playMode },
    setup,
    progress,
    now,
  });
}
