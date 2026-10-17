import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PlayError, unwrapPlay } from "./errors";
import { requireAttemptId, requirePlayAccess } from "./access";
import type { CheckMode } from "../generator/constants";
import type { PlayLimits, PlayPayload, PlayWord } from "./types";

type LimitsRow = { checkMode: CheckMode; checksAllowed: number | null; revealsAllowed: number; chosungAllowed: boolean };

/**
 * Everything the browser gets for a puzzle (doc 08 C.3), built FIELD BY FIELD from explicit column lists. It never
 * spreads a database row, never selects crossword_words.answer, and calls no function that reads answers
 * (fn_crossword_play_wordcells is internal). The only letters in it are `given` (prefilled and revealed cells, from
 * fn_crossword_play_given) and the student's own `cells`.
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

  return {
    v: 1,
    assignmentId,
    attempt: { status: attempt.status, revision: Number(attempt.revision) },
    puzzle: { title: puzzle.title, rows: puzzle.rows, cols: puzzle.cols, words },
    given,
    cells: attempt.cells as Record<string, string>,
    limits,
    readonly: access.readonly || attempt.status === "completed",
    closesAt: assignmentRes.data.closes_at,
  };
}
