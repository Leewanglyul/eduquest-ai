import crypto from "node:crypto";

import { maskClue } from "./clues";
import { GENERATOR_VERSION } from "./constants";
import type { WorkGrid } from "./grid";
import { numberStarts } from "./number";
import { resolveOptions } from "./options";
import { runAttempt } from "./place";
import { mixSeed, mulberry32 } from "./prng";
import { comparePuzzles, computeStats, scorePuzzle } from "./score";
import { selectWords, type Candidate } from "./select";
import type {
  CrosswordInputEntry,
  CrosswordPuzzle,
  GenerateResult,
  GeneratorOptions,
  PlacedWord,
  PuzzleStats,
  UnplacedEntry,
} from "./types";
import { validatePuzzle } from "./validate";

/** Canonical text of a puzzle: what the placement hash covers (version, size, every word with its place). */
export function canonicalPuzzleText(puzzle: CrosswordPuzzle): string {
  const words = [...puzzle.words]
    .sort((a, b) => a.number - b.number || a.direction.localeCompare(b.direction))
    .map((w) => `${w.number}|${w.direction}|${w.row}|${w.col}|${w.answer}|${w.entryId}`);
  return [`v${GENERATOR_VERSION}`, `${puzzle.rows}x${puzzle.cols}`, ...words].join("\n");
}

/** sha256 of the canonical text. A save compares it with the hash of the preview (docs/m2/04 §4.3). */
export function placementHash(puzzle: CrosswordPuzzle): string {
  return crypto.createHash("sha256").update(canonicalPuzzleText(puzzle)).digest("hex");
}

/** Trims the working board to its bounding box, numbers the words and attaches the (masked) clues. */
function toPuzzle(grid: WorkGrid, byId: Map<string, Candidate>, maskClues: boolean): { puzzle: CrosswordPuzzle; masked: string[] } {
  const cells = grid.words.flatMap((w) =>
    w.chars.map((_, k) => ({
      r: w.row + (w.direction === "down" ? k : 0),
      c: w.col + (w.direction === "across" ? k : 0),
    })),
  );
  const minR = Math.min(...cells.map((p) => p.r));
  const maxR = Math.max(...cells.map((p) => p.r));
  const minC = Math.min(...cells.map((p) => p.c));
  const maxC = Math.max(...cells.map((p) => p.c));

  const moved = grid.words.map((w) => ({ ...w, row: w.row - minR, col: w.col - minC }));
  const numbers = numberStarts(moved);
  const masked: string[] = [];

  const words: PlacedWord[] = moved
    .map((w) => {
      const source = byId.get(w.entryId) as Candidate;
      const clue = maskClues ? maskClue(source.clue, source.answer) : { clue: source.clue, masked: false };
      if (clue.masked) masked.push(w.entryId);
      return {
        entryId: w.entryId,
        answer: source.answer,
        clue: clue.clue,
        row: w.row,
        col: w.col,
        direction: w.direction,
        number: numbers.get(`${w.row},${w.col}`) as number,
        single: w.single,
      };
    })
    .sort((a, b) => a.number - b.number || a.direction.localeCompare(b.direction));

  return { puzzle: { rows: maxR - minR + 1, cols: maxC - minC + 1, words }, masked };
}

/**
 * Generates a free-form crossword from content entries (docs/m2/04-crossword-generator.md).
 *
 * Deterministic: the same entries (in any order), options and seed give the same puzzle and the same
 * placement hash. The search runs `maxAttempts` independent greedy attempts and keeps the best; an optional
 * time budget may end it early, which the result reports (`truncated`, `attemptsRun`) so the same run can be
 * repeated exactly with `maxAttempts = attemptsRun`.
 *
 * Every attempt's puzzle goes through the independent validator; an invalid one is a bug and is never returned.
 */
export function generateCrossword(entries: readonly CrosswordInputEntry[], rawOptions: GeneratorOptions): GenerateResult {
  const options = resolveOptions(rawOptions);
  const selection = selectWords(entries, options, mulberry32(mixSeed(options.seed, 0)));
  const byId = new Map<string, Candidate>([...selection.multi, ...selection.singles].map((c) => [c.entryId, c]));
  const unplaced: UnplacedEntry[] = [...selection.notSelected];
  const base = { excluded: selection.excluded, seed: options.seed };

  if (selection.multi.length === 0) {
    return {
      ok: false,
      reason: "NO_ELIGIBLE_WORDS",
      placedWords: 0,
      unplaced: [...unplaced, ...selection.singles.map((w) => ({ entryId: w.entryId, reason: "NO_MATCHING_CELL" as const }))],
      attemptsRun: 0,
      truncated: false,
      ...base,
    };
  }

  const started = Date.now();
  let best: { puzzle: CrosswordPuzzle; stats: PuzzleStats; placed: Set<string>; masked: string[] } | null = null;
  let attemptsRun = 0;
  let truncated = false;

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    if (options.timeBudgetMs !== null && attempt > 0 && Date.now() - started > options.timeBudgetMs) {
      truncated = true;
      break;
    }
    const rng = mulberry32(mixSeed(options.seed, attempt + 1));
    const result = runAttempt(selection.multi, selection.singles, options, rng, attempt);
    attemptsRun += 1;

    const { puzzle, masked } = toPuzzle(result.grid, byId, options.maskClues);
    const valid = validatePuzzle(puzzle, { maxGrid: options.gridSize });
    if (!valid.ok) {
      // The placer and the validator disagree: a bug. Fail loudly rather than hand out a broken puzzle.
      throw new Error(`crossword generator produced an invalid puzzle: ${valid.errors.map((e) => `${e.code} ${e.message}`).join("; ")}`);
    }
    const stats = computeStats(puzzle);
    if (best === null || comparePuzzles(stats, best.stats) > 0) best = { puzzle, stats, placed: result.placed, masked };
  }

  const best_ = best as NonNullable<typeof best>;
  for (const w of selection.multi) {
    if (best_.placed.has(w.entryId)) continue;
    const shares = [...best_.placed].some((id) => (byId.get(id) as Candidate).chars.some((c) => w.chars.includes(c)));
    unplaced.push({ entryId: w.entryId, reason: shares ? "NO_LEGAL_POSITION" : "NO_CROSSING" });
  }
  for (const w of selection.singles) {
    if (!best_.placed.has(w.entryId)) unplaced.push({ entryId: w.entryId, reason: "NO_MATCHING_CELL" });
  }

  if (best_.stats.words < options.minWords) {
    return { ok: false, reason: "NOT_ENOUGH_WORDS", placedWords: best_.stats.words, unplaced, attemptsRun, truncated, ...base };
  }

  return {
    ok: true,
    puzzle: best_.puzzle,
    stats: best_.stats,
    score: scorePuzzle(best_.stats, selection.multi.length + selection.singles.length),
    placementHash: placementHash(best_.puzzle),
    unplaced,
    maskedClueIds: best_.masked,
    attemptsRun,
    truncated,
    ...base,
  };
}
