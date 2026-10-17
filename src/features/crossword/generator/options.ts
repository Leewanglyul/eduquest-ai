import {
  CROSSWORD_DEFAULT_ATTEMPTS,
  CROSSWORD_MAX_ATTEMPTS,
  CROSSWORD_MAX_GRID,
  CROSSWORD_MAX_SINGLE_WORDS,
  CROSSWORD_MAX_WORD_LEN,
  CROSSWORD_MAX_WORDS,
  CROSSWORD_MIN_GRID,
  CROSSWORD_MIN_WORD_LEN,
  CROSSWORD_MIN_WORDS,
  CROSSWORD_SCRIPTS,
} from "./constants";
import type { GeneratorOptions, Script } from "./types";

export type ResolvedOptions = {
  seed: number;
  gridSize: number;
  maxWords: number;
  minWords: number;
  minWordLen: number;
  maxWordLen: number;
  maxSingleWords: number;
  scripts: ReadonlySet<Script>;
  pinnedIds: ReadonlySet<string>;
  excludedIds: ReadonlySet<string>;
  maskClues: boolean;
  maxAttempts: number;
  timeBudgetMs: number | null;
};

const integer = (name: string, value: number, min: number, max: number) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max} (got ${value})`);
  }
  return value;
};

/** Fills the defaults and refuses values the generator cannot honour. Programming errors throw; word lists never do. */
export function resolveOptions(options: GeneratorOptions): ResolvedOptions {
  const gridSize = integer("gridSize", options.gridSize, CROSSWORD_MIN_GRID, CROSSWORD_MAX_GRID);
  const minWordLen = integer("minWordLen", options.minWordLen ?? CROSSWORD_MIN_WORD_LEN, 1, CROSSWORD_MAX_WORD_LEN);
  const maxWordLen = integer("maxWordLen", Math.min(options.maxWordLen ?? CROSSWORD_MAX_WORD_LEN, gridSize), minWordLen, CROSSWORD_MAX_WORD_LEN);
  const scripts = new Set<Script>(options.scripts ?? CROSSWORD_SCRIPTS);
  if (scripts.size === 0) throw new RangeError("scripts must not be empty");

  return {
    seed: integer("seed", options.seed, 0, 0xffffffff),
    gridSize,
    maxWords: integer("maxWords", options.maxWords ?? CROSSWORD_MAX_WORDS, 1, CROSSWORD_MAX_WORDS),
    minWords: integer("minWords", options.minWords ?? CROSSWORD_MIN_WORDS, 1, CROSSWORD_MAX_WORDS),
    minWordLen,
    maxWordLen,
    maxSingleWords: integer("maxSingleWords", options.maxSingleWords ?? CROSSWORD_MAX_SINGLE_WORDS, 0, CROSSWORD_MAX_SINGLE_WORDS),
    scripts,
    pinnedIds: options.pinnedIds ?? new Set(),
    excludedIds: options.excludedIds ?? new Set(),
    maskClues: options.maskClues ?? true,
    maxAttempts: integer("maxAttempts", options.maxAttempts ?? CROSSWORD_DEFAULT_ATTEMPTS, 1, CROSSWORD_MAX_ATTEMPTS),
    timeBudgetMs: options.timeBudgetMs ?? null,
  };
}
