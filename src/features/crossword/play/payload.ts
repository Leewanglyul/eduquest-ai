import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PlayError, unwrapPlay } from "./errors";
import { requireAttemptId, requirePlayAccess } from "./access";
import type { CheckMode } from "../generator/constants";
import type { CrosswordInputMode, PlayLimits, PlayPayload, PlayWord, TeamInfo } from "./types";

type LimitsRow = { checkMode: CheckMode; checksAllowed: number | null; revealsAllowed: number; chosungAllowed: boolean };

/**
 * Everything the browser gets for a puzzle (doc 08 C.3), built FIELD BY FIELD from explicit column lists. It never
 * spreads a database row, never selects crossword_words.answer, and calls no function that reads answers
 * (fn_crossword_play_wordcells is internal). The only letters in it are `given` (prefilled and revealed cells, from
 * fn_crossword_play_given) and the student's own `cells`. `inputMode` is one word for the whole puzzle
 * (fn_crossword_play_input_mode returns "hangul" or "mixed", never a letter or a cell).
 */
export async function loadPlayPayload(studentId: string, assignmentId: string): Promise<PlayPayload> {
  const access = await requirePlayAccess(studentId, assignmentId);
  const attemptId = await requireAttemptId(studentId, assignmentId);
  const db = createSupabaseAdminClient();

  const [attemptRes, puzzleRes, wordsRes, assignmentRes] = await Promise.all([
    db.from("crossword_attempts").select("id, status, cells, revision, checks_used, reveals_used").eq("id", attemptId).single(),
    db.from("crossword_puzzles").select("title, rows, cols").eq("id", access.puzzleId).single(),
    db
      .from("crossword_words")
      .select("number, direction, row, col, length, single, clue")
      .eq("puzzle_id", access.puzzleId)
      .order("number")
      .order("direction"),
    db.from("crossword_assignments").select("closes_at").eq("id", assignmentId).single(),
  ]);
  if (attemptRes.error || puzzleRes.error || wordsRes.error || assignmentRes.error) throw new PlayError("NOT_FOUND");
  const attempt = attemptRes.data;
  const puzzle = puzzleRes.data;

  const given = unwrapPlay<Record<string, string>>(
    await db.rpc("fn_crossword_play_given", { p_student_id: studentId, p_attempt_id: attemptId }),
  );
  const rawLimits = unwrapPlay<LimitsRow>(await db.rpc("fn_crossword_attempt_limits", { p_attempt_id: attemptId }));
  const rawMode = unwrapPlay<string>(await db.rpc("fn_crossword_play_input_mode", { p_puzzle_id: access.puzzleId }));
  const inputMode: CrosswordInputMode = rawMode === "hangul" ? "hangul" : "mixed";

  const words: PlayWord[] = (wordsRes.data ?? []).map((w) => ({
    number: w.number,
    direction: w.direction,
    row: w.row,
    col: w.col,
    length: w.length ?? 1,
    single: w.single ?? false,
    clue: w.clue,
  }));

  const limits: PlayLimits = {
    checkMode: rawLimits.checkMode,
    checksAllowed: rawLimits.checksAllowed,
    checksRemaining: rawLimits.checksAllowed === null ? null : Math.max(0, rawLimits.checksAllowed - attempt.checks_used),
    revealsAllowed: rawLimits.revealsAllowed,
    revealsRemaining: Math.max(0, rawLimits.revealsAllowed - attempt.reveals_used),
    chosungAllowed: rawLimits.chosungAllowed,
  };

  const team = access.team ? await loadTeamInfo(attemptId) : null;

  return {
    v: 1,
    assignmentId,
    attempt: { status: attempt.status, revision: Number(attempt.revision) },
    puzzle: { title: puzzle.title, rows: puzzle.rows, cols: puzzle.cols, words, inputMode },
    given,
    cells: attempt.cells as Record<string, string>,
    limits,
    readonly: access.readonly || attempt.status === "completed",
    closesAt: assignmentRes.data.closes_at,
    // Team mode only: an individual payload keeps exactly its earlier fields.
    ...(team ? { team } : {}),
  };
}

/**
 * The team of a shared attempt, as the student may see it: the label and the number of its members who are still
 * actively enrolled (P3-D1). No member name or id leaves this function.
 */
export async function loadTeamInfo(attemptId: string): Promise<TeamInfo> {
  const db = createSupabaseAdminClient();
  const teamRes = await db
    .from("crossword_teams")
    .select("label, assignment_id, crossword_team_members(student_id)")
    .eq("attempt_id", attemptId)
    .single();
  if (teamRes.error || !teamRes.data) throw new PlayError("NOT_FOUND");
  const members = ((teamRes.data.crossword_team_members ?? []) as { student_id: string }[]).map((m) => m.student_id);
  const assignment = await db.from("crossword_assignments").select("classroom_id").eq("id", teamRes.data.assignment_id).single();
  if (assignment.error) throw new PlayError("NOT_FOUND");
  let memberCount = 0;
  if (members.length > 0) {
    const { count } = await db
      .from("classroom_enrollments")
      .select("student_id", { count: "exact", head: true })
      .eq("classroom_id", assignment.data.classroom_id)
      .eq("status", "active")
      .in("student_id", members);
    memberCount = count ?? 0;
  }
  return { label: teamRes.data.label, memberCount };
}
