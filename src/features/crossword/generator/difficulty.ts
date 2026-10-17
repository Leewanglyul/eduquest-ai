import { DIFFICULTY_PRESETS, type DifficultyLevel, type DifficultyPreset } from "./constants";
import { mixSeed, mulberry32, shuffled } from "./prng";
import type { CrosswordPuzzle, DifficultySettings, GeneratorOptions } from "./types";

/** Generator options for a preset (docs/m2/04 §3.1). Any field can be overridden by the teacher. */
export function optionsForLevel(level: DifficultyLevel, seed: number, overrides: Partial<GeneratorOptions> = {}): GeneratorOptions {
  const preset = DIFFICULTY_PRESETS[level];
  return { seed, gridSize: preset.gridSize, maxWords: preset.maxWords, maxWordLen: preset.maxWordLen, ...overrides };
}

/** The play-side settings of a preset, for the descriptive difficulty and the student payload. */
export function settingsForLevel(level: DifficultyLevel): DifficultySettings & Pick<DifficultyPreset, "chosungAllowed"> {
  const p = DIFFICULTY_PRESETS[level];
  return { prefillPercent: p.prefillPercent, revealsPerStudent: p.revealsPerStudent, checkMode: p.checkMode, chosungAllowed: p.chosungAllowed };
}

export type PrefilledCell = { row: number; col: number };

/**
 * Cells the student sees already filled in. About `percent` of the cells, chosen with the seed, but never so
 * many that a word becomes complete: a pre-filled puzzle must still ask for every word. One-cell words count
 * as words, so their cell is never given away.
 */
export function choosePrefill(puzzle: CrosswordPuzzle, percent: number, seed: number): PrefilledCell[] {
  if (percent <= 0) return [];

  const wordCells = puzzle.words.map((w) =>
    Array.from(w.answer).map((_, k) => `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`),
  );
  const all = [...new Set(wordCells.flat())].sort((a, b) => {
    const [ar, ac] = a.split(",").map(Number);
    const [br, bc] = b.split(",").map(Number);
    return ar - br || ac - bc;
  });
  const target = Math.round((Math.min(100, percent) / 100) * all.length);

  const chosen = new Set<string>();
  for (const cell of shuffled(all, mulberry32(mixSeed(seed, 0x5eed)))) {
    if (chosen.size >= target) break;
    const trial = new Set(chosen).add(cell);
    if (wordCells.some((cells) => cells.every((c) => trial.has(c)))) continue; // would complete a word
    chosen.add(cell);
  }
  return [...chosen]
    .map((k) => k.split(",").map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([row, col]) => ({ row, col }));
}
