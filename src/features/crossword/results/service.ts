import "server-only";

import { isTeacherArea, type ClassroomActor } from "@/features/classrooms/domain";
import { isUuid } from "@/features/content/sets/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CrosswordError, mapDatabaseErrorCode } from "../messages";
import type { ProgressRow, ProgressState } from "./types";

/**
 * Teacher visibility of Student Play progress (TV-1, docs/m2/14 and 16). The only teacher-side code that reads attempt
 * data, and it does so through one database function whose result type is an allow-list: counts, states and times. It
 * can never return typed letters, answers, cell keys or event details, because the function does not select them.
 *
 * Authorization is the function's: the actor is the signed-in teacher or admin taken from the session (never from a
 * request), and the function lets in only the classroom's owner, a co-teacher of that classroom, or the school's admin.
 * An unknown assignment and one the actor may not read both come back as NOT_FOUND.
 */
export async function getAssignmentProgress(actor: ClassroomActor, assignmentId: string): Promise<ProgressRow[]> {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  if (!isUuid(assignmentId)) throw new CrosswordError("NOT_FOUND");

  const { data, error } = await createSupabaseAdminClient().rpc("fn_crossword_assignment_progress", {
    p_actor_id: actor.id,
    p_school_id: actor.school_id,
    p_assignment_id: assignmentId,
  });
  if (error) {
    const code = mapDatabaseErrorCode(error.message);
    if (code) throw new CrosswordError(code);
    throw error;
  }

  return (data ?? []).map((r) => ({
    studentId: r.student_id,
    studentNo: r.student_no,
    displayName: r.display_name,
    state: r.state as ProgressState,
    filledCount: r.filled_count,
    totalCells: r.total_cells,
    lastSavedAt: r.last_saved_at ?? null,
    completedAt: r.completed_at ?? null,
    checksUsed: r.checks_used,
    revealsUsed: r.reveals_used,
    chosungUsed: r.chosung_used,
    wrongSubmits: r.wrong_submits,
  }));
}
