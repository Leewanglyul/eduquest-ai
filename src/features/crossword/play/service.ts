import "server-only";

import { isCrosswordPlayEnabled } from "@/lib/flags";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { requireAttemptId, requirePlayAccess } from "./access";
import { PlayError, unwrapPlay } from "./errors";
import { pickNextPlayable, sortPlayable, stateOf, type PlayableRow } from "./list";
import type { ResultView } from "./result";
import { loadPlayPayload } from "./payload";
import { chooseFrozenPrefill, type PuzzleStructure } from "./prefill";
import type { CheckResult, CheckScope, Direction, PlayPayload, SubmitResult } from "./types";

/**
 * Thin wrappers over the fn_crossword_play_* functions. The student id always comes from the caller's session
 * (see getStudentIdForProfile); the attempt is found from the assignment, never from a client-sent id. Rules,
 * limits and the key live in the database functions; nothing here reads an answer.
 */

export type { PlayableRow, PlayableState } from "./list";

/**
 * The student's puzzle list: open assignments, plus closed ones that already have an attempt, in the fixed order of
 * list.ts. The student id is the caller's session student; nothing else selects rows.
 */
export async function listPlayable(studentId: string): Promise<PlayableRow[]> {
  const rows = unwrapPlay<
    {
      assignment_id: string; puzzle_id: string; title: string; classroom_id: string; classroom_name: string;
      level: "easy" | "normal" | "hard"; word_count: number; total_cells: number; closes_at: string | null;
      attempt_id: string | null; attempt_status: "in_progress" | "completed" | null; filled_count: number; readonly: boolean;
    }[]
  >(await createSupabaseAdminClient().rpc("fn_crossword_play_list", { p_student_id: studentId }));
  const mapped = rows.map((r) => ({
    assignmentId: r.assignment_id,
    puzzleId: r.puzzle_id,
    title: r.title,
    classroomId: r.classroom_id,
    classroomName: r.classroom_name,
    level: r.level,
    wordCount: r.word_count,
    totalCells: r.total_cells,
    closesAt: r.closes_at,
    attemptId: r.attempt_id,
    attemptStatus: r.attempt_status,
    filledCount: r.filled_count,
    readonly: r.readonly,
  }));
  return sortPlayable(mapped.map((r) => ({ ...r, state: stateOf(r) }) satisfies PlayableRow));
}

/** The pre-filled cells, chosen from lengths and positions only (no answer is read) and frozen at attempt creation. */
async function chooseAttemptPrefill(puzzleId: string): Promise<string[]> {
  const db = createSupabaseAdminClient();
  const [puzzle, words] = await Promise.all([
    db.from("crossword_puzzles").select("rows, cols, seed, settings").eq("id", puzzleId).single(),
    db.from("crossword_words").select("number, direction, row, col, length, single").eq("puzzle_id", puzzleId),
  ]);
  if (puzzle.error || words.error) return [];
  const play = (puzzle.data.settings as { play?: { prefillPercent?: number } } | null)?.play;
  const percent = Number(play?.prefillPercent ?? 0);
  const structure: PuzzleStructure = {
    rows: puzzle.data.rows,
    cols: puzzle.data.cols,
    words: (words.data ?? []).map((w) => ({
      number: w.number, direction: w.direction, row: w.row, col: w.col, length: w.length ?? 1, single: w.single ?? false,
    })),
  };
  return chooseFrozenPrefill(structure, percent, Number(puzzle.data.seed));
}

/**
 * Opens a puzzle: creates the attempt on the first visit, resumes it afterwards (also from a second tab or device).
 * A closed assignment resumes an existing attempt read-only; without one it is refused.
 */
export async function startOrResume(studentId: string, assignmentId: string): Promise<PlayPayload> {
  // Second, defensive gate (m2/12 F-1): this is the only function that creates an attempt (student data). It must not
  // run while Student Play is off, even if a future caller forgets the page or route check.
  if (!isCrosswordPlayEnabled()) throw new PlayError("NOT_FOUND");
  const access = await requirePlayAccess(studentId, assignmentId);
  const prefill = access.readonly ? [] : await chooseAttemptPrefill(access.puzzleId);
  unwrapPlay(
    await createSupabaseAdminClient().rpc("fn_crossword_play_start", {
      p_student_id: studentId,
      p_assignment_id: assignmentId,
      p_prefill_keys: prefill,
    }),
  );
  return loadPlayPayload(studentId, assignmentId);
}

export async function getPlayState(studentId: string, assignmentId: string): Promise<PlayPayload> {
  return loadPlayPayload(studentId, assignmentId);
}

export async function savePatch(
  studentId: string,
  assignmentId: string,
  patch: Record<string, string | null>,
  activeMs: number,
): Promise<{ revision: number; filled: number }> {
  const attemptId = await requireAttemptId(studentId, assignmentId);
  return unwrapPlay(
    await createSupabaseAdminClient().rpc("fn_crossword_play_save", {
      p_student_id: studentId,
      p_attempt_id: attemptId,
      p_patch: patch as Json,
      p_active_ms: activeMs,
    }),
  );
}

export async function check(
  studentId: string,
  assignmentId: string,
  input: { scope: CheckScope; keys: string[]; baseRevision: number },
): Promise<{ results: CheckResult[]; checksUsed: number; checksRemaining: number | null }> {
  const attemptId = await requireAttemptId(studentId, assignmentId);
  return unwrapPlay(
    await createSupabaseAdminClient().rpc("fn_crossword_play_check", {
      p_student_id: studentId,
      p_attempt_id: attemptId,
      p_scope: input.scope,
      p_keys: input.keys,
      p_base_revision: input.baseRevision,
    }),
  );
}

export async function reveal(
  studentId: string,
  assignmentId: string,
  input: { key: string; baseRevision: number },
): Promise<{ key: string; char: string; revealsRemaining: number; revision: number }> {
  const attemptId = await requireAttemptId(studentId, assignmentId);
  return unwrapPlay(
    await createSupabaseAdminClient().rpc("fn_crossword_play_reveal", {
      p_student_id: studentId,
      p_attempt_id: attemptId,
      p_key: input.key,
      p_base_revision: input.baseRevision,
    }),
  );
}

export async function chosung(
  studentId: string,
  assignmentId: string,
  input: { number: number; direction: Direction },
): Promise<{ chosung: string }> {
  const attemptId = await requireAttemptId(studentId, assignmentId);
  return unwrapPlay(
    await createSupabaseAdminClient().rpc("fn_crossword_play_chosung", {
      p_student_id: studentId,
      p_attempt_id: attemptId,
      p_number: input.number,
      p_direction: input.direction,
    }),
  );
}

export async function submit(studentId: string, assignmentId: string, baseRevision: number): Promise<SubmitResult> {
  const attemptId = await requireAttemptId(studentId, assignmentId);
  return unwrapPlay(
    await createSupabaseAdminClient().rpc("fn_crossword_play_submit", {
      p_student_id: studentId,
      p_attempt_id: attemptId,
      p_base_revision: baseRevision,
    }),
  );
}

/**
 * Data for the result screen of an attempt that is completed or closed. Returns "playing" for an attempt that is still
 * open and in progress (the page then sends the student back to the board). The letters are the student's own cells plus
 * the cells they were given: no answer is read, and nothing is marked right or wrong.
 */
export async function loadResult(studentId: string, assignmentId: string): Promise<ResultView | { status: "playing" }> {
  const access = await requirePlayAccess(studentId, assignmentId);
  const attemptId = await requireAttemptId(studentId, assignmentId);
  const db = createSupabaseAdminClient();

  const [attemptRes, puzzleRes, wordsRes] = await Promise.all([
    db.from("crossword_attempts").select("status, cells, checks_used, reveals_used, chosung_used, active_seconds").eq("id", attemptId).single(),
    db.from("crossword_puzzles").select("title, rows, cols").eq("id", access.puzzleId).single(),
    db.from("crossword_words").select("number, direction, row, col, length, single, clue").eq("puzzle_id", access.puzzleId).order("number").order("direction"),
  ]);
  if (attemptRes.error || puzzleRes.error || wordsRes.error) throw new PlayError("NOT_FOUND");
  const attempt = attemptRes.data;
  if (attempt.status !== "completed" && !access.readonly) return { status: "playing" };

  const given = unwrapPlay<Record<string, string>>(
    await db.rpc("fn_crossword_play_given", { p_student_id: studentId, p_attempt_id: attemptId }),
  );
  const words = (wordsRes.data ?? []).map((w) => ({
    number: w.number, direction: w.direction, row: w.row, col: w.col, length: w.length ?? 1, single: w.single ?? false, clue: w.clue,
  }));
  const list = await listPlayable(studentId);
  const next = pickNextPlayable(list, assignmentId);

  return {
    assignmentId,
    title: puzzleRes.data.title,
    status: attempt.status === "completed" ? "completed" : "closed",
    rows: puzzleRes.data.rows,
    cols: puzzleRes.data.cols,
    words,
    letters: { ...(attempt.cells as Record<string, string>), ...given },
    givenKeys: Object.keys(given),
    wordCount: words.length,
    tools: { checks: attempt.checks_used, reveals: attempt.reveals_used, chosung: attempt.chosung_used },
    activeSeconds: attempt.active_seconds ?? 0,
    growth: null,
    next: next ? { assignmentId: next.assignmentId, title: next.title, state: next.state } : null,
    hasOtherPuzzles: list.some((r) => r.assignmentId !== assignmentId),
  };
}
