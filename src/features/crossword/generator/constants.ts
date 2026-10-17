/**
 * Crossword generator constants (docs/m2/04-crossword-generator.md §2.8, §3). One place for every limit;
 * the pages that come later receive these numbers as props, as the CSV import does.
 */

/** Bump when the placement or numbering rules change: it is part of the placement hash. */
export const GENERATOR_VERSION = 1;

/** Multi-cell words a puzzle needs before it is worth showing (one-cell words do not count). */
export const CROSSWORD_MIN_WORDS = 5;
export const CROSSWORD_MAX_WORDS = 25;
/** Extra one-cell words (decision C1) on top of CROSSWORD_MAX_WORDS. */
export const CROSSWORD_MAX_SINGLE_WORDS = 5;

/** Decision C1: one-character answers are allowed. They become one-cell words (see single in types.ts). */
export const CROSSWORD_MIN_WORD_LEN = 1;
/** Equal to ANSWER_MAX_LEN of the word sets (the longest answer a set can hold). */
export const CROSSWORD_MAX_WORD_LEN = 15;

export const CROSSWORD_MIN_GRID = 5;
export const CROSSWORD_MAX_GRID = 15;

/** Restarts of the greedy placement. The number of attempts, not time, decides the result (determinism). */
export const CROSSWORD_DEFAULT_ATTEMPTS = 150;
export const CROSSWORD_MAX_ATTEMPTS = 300;
/** Safety valve for a request; when it ends the search early the result says `truncated`. */
export const CROSSWORD_TIME_BUDGET_MS = 800;

/** Decision C7: Hangul syllables, Latin letters and digits. Emoji and symbols are never allowed. */
export const CROSSWORD_SCRIPTS = ["hangul", "latin", "digit"] as const;

export const MASK_CHAR = "○";

export type DifficultyLevel = "easy" | "normal" | "hard";
export type CheckMode = "anytime" | "onRequest" | "submitOnly";

export type DifficultyPreset = {
  gridSize: number;
  /** Upper bound of multi-cell words; the lower bound of a puzzle is CROSSWORD_MIN_WORDS. */
  maxWords: number;
  maxWordLen: number;
  /** Share of cells the student sees filled in (never a whole word). */
  prefillPercent: number;
  revealsPerStudent: number;
  checkMode: CheckMode;
  chosungAllowed: boolean;
};

/** Starting values for the PM (decision C2); a teacher may change any of them. */
export const DIFFICULTY_PRESETS: Record<DifficultyLevel, DifficultyPreset> = {
  easy: { gridSize: 10, maxWords: 10, maxWordLen: 5, prefillPercent: 25, revealsPerStudent: 3, checkMode: "anytime", chosungAllowed: true },
  normal: { gridSize: 13, maxWords: 16, maxWordLen: 8, prefillPercent: 10, revealsPerStudent: 1, checkMode: "onRequest", chosungAllowed: true },
  hard: { gridSize: 15, maxWords: 25, maxWordLen: 15, prefillPercent: 0, revealsPerStudent: 0, checkMode: "submitOnly", chosungAllowed: false },
};
