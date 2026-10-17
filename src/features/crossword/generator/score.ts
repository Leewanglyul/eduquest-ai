import { lengthOf } from "./chars";
import type { CrosswordPuzzle, DifficultySettings, PuzzleScore, PuzzleStats } from "./types";

/** Counts and ratios of a finished puzzle (docs/m2/04-crossword-generator.md §3.2, §2.4). */
export function computeStats(puzzle: CrosswordPuzzle): PuzzleStats {
  const multi = puzzle.words.filter((w) => !w.single);
  const singles = puzzle.words.length - multi.length;

  const cellWords = new Map<string, number>();
  for (const w of multi) {
    const n = lengthOf(w.answer);
    for (let k = 0; k < n; k += 1) {
      const key = `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`;
      cellWords.set(key, (cellWords.get(key) ?? 0) + 1);
    }
  }
  const crossings = [...cellWords.values()].filter((n) => n >= 2).length;
  const lengths = multi.map((w) => lengthOf(w.answer));
  const area = puzzle.rows * puzzle.cols;

  return {
    words: multi.length,
    singleWords: singles,
    totalWords: puzzle.words.length,
    across: multi.filter((w) => w.direction === "across").length,
    down: multi.filter((w) => w.direction === "down").length,
    crossings,
    cells: cellWords.size,
    rows: puzzle.rows,
    cols: puzzle.cols,
    area,
    fillRatio: area === 0 ? 0 : cellWords.size / area,
    avgWordLength: lengths.length === 0 ? 0 : lengths.reduce((a, b) => a + b, 0) / lengths.length,
    avgCrossingsPerWord: multi.length === 0 ? 0 : (2 * crossings) / multi.length,
    shortest: lengths.length === 0 ? 0 : Math.min(...lengths),
    longest: lengths.length === 0 ? 0 : Math.max(...lengths),
  };
}

/**
 * Orders two puzzles of the same word list: more words placed, then more crossings, then a smaller area, then
 * an aspect ratio closer to 1. Positive when `a` is better, negative when `b` is, 0 when they tie (the earlier
 * attempt is kept, which keeps the search deterministic).
 */
export function comparePuzzles(a: PuzzleStats, b: PuzzleStats): number {
  return (
    a.totalWords - b.totalWords ||
    a.crossings - b.crossings ||
    b.area - a.area ||
    Math.abs(b.rows - b.cols) - Math.abs(a.rows - a.cols)
  );
}

/** A 0..100 quality figure for showing and for comparing puzzles of one word list; not a difficulty. */
export function scorePuzzle(stats: PuzzleStats, selectedWords: number): PuzzleScore {
  const placedRatio = selectedWords === 0 ? 0 : Math.min(1, stats.totalWords / selectedWords);
  const connectivity = Math.min(1, stats.avgCrossingsPerWord / 2);
  const compactness = Math.min(1, stats.fillRatio / 0.5);
  const quality = Math.round(60 * placedRatio + 25 * connectivity + 15 * compactness);
  return { placedRatio, quality: Math.max(0, Math.min(100, quality)) };
}

/**
 * Descriptive difficulty, 0..100 (docs/m2/04-crossword-generator.md §3.2). Longer words and more words make a
 * puzzle harder; more crossings, pre-filled cells, reveals and early checking make it easier. It is a number to
 * put next to a puzzle, not a promise; the weights are tested only for ordering.
 */
/** Fewer checks make a puzzle harder: none 10, otherwise 10 minus the allowance (3 checks 7, 5 checks 5), unlimited 0. */
function checkPenalty(settings: DifficultySettings): number {
  if (settings.checkMode === "submitOnly" || settings.checksAllowed === 0) return 10;
  if (settings.checksAllowed === null) return 0;
  return Math.max(0, 10 - settings.checksAllowed);
}

export function describeDifficulty(stats: PuzzleStats, settings: DifficultySettings): number {
  const raw =
    3 * stats.avgWordLength +
    1 * stats.words -
    6 * stats.avgCrossingsPerWord -
    0.5 * settings.prefillPercent -
    4 * settings.revealsPerStudent +
    checkPenalty(settings);
  return Math.max(0, Math.min(100, Math.round(raw)));
}
