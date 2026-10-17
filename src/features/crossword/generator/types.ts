import type { CheckMode } from "./constants";

export type Direction = "across" | "down";
export type Script = "hangul" | "latin" | "digit";

/** What the generator needs from a content entry: the grid answer and the clue (the definition). */
export type CrosswordInputEntry = { id: string; answer: string; clue: string };

export type PlacedWord = {
  entryId: string;
  /** NFC, ASCII upper-case; Hangul syllables, A-Z and 0-9 only. */
  answer: string;
  /** The clue as shown to students (masked when the option is on). */
  clue: string;
  row: number;
  col: number;
  direction: Direction;
  /** Shared by the across and down word that start in the same cell. */
  number: number;
  /**
   * A one-character word (decision C1). It has no cells of its own: it sits on a cell of another word,
   * in the direction that word does not use, so it adds a clue without adding a run of two or more cells.
   */
  single: boolean;
};

export type CrosswordPuzzle = { rows: number; cols: number; words: PlacedWord[] };

export type GeneratorOptions = {
  /** Unsigned 32-bit seed. */
  seed: number;
  gridSize: number;
  /** Multi-cell words at most (one-cell words are extra, see CROSSWORD_MAX_SINGLE_WORDS). */
  maxWords?: number;
  /** A puzzle with fewer multi-cell words is refused. */
  minWords?: number;
  minWordLen?: number;
  maxWordLen?: number;
  maxSingleWords?: number;
  scripts?: readonly Script[];
  pinnedIds?: ReadonlySet<string>;
  excludedIds?: ReadonlySet<string>;
  maskClues?: boolean;
  maxAttempts?: number;
  /** Optional safety valve; when it stops the search the result has `truncated: true`. */
  timeBudgetMs?: number;
};

export type ExclusionReason =
  | "EMPTY_ANSWER"
  | "INVALID_CHARACTERS"
  | "SCRIPT_NOT_ALLOWED"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "DUPLICATE_ANSWER"
  | "EXCLUDED_BY_TEACHER";

export type UnplacedReason = "NOT_SELECTED" | "NO_CROSSING" | "NO_LEGAL_POSITION" | "NO_MATCHING_CELL";

export type ExcludedEntry = { entryId: string; reason: ExclusionReason; detail?: string };
export type UnplacedEntry = { entryId: string; reason: UnplacedReason };

export type PuzzleStats = {
  /** Words with two or more cells. */
  words: number;
  singleWords: number;
  totalWords: number;
  across: number;
  down: number;
  /** Cells where two multi-cell words cross. */
  crossings: number;
  /** Filled cells. */
  cells: number;
  rows: number;
  cols: number;
  area: number;
  fillRatio: number;
  avgWordLength: number;
  avgCrossingsPerWord: number;
  shortest: number;
  longest: number;
};

export type PuzzleScore = {
  /** Placed words / selected words, 0..1. */
  placedRatio: number;
  /** 0..100: how complete, connected and compact the puzzle is. For comparing puzzles of one word list. */
  quality: number;
};

export type ValidationError = { code: ValidationCode; message: string };
export type ValidationCode =
  | "EMPTY_PUZZLE"
  | "BAD_SIZE"
  | "BAD_WORD"
  | "OUT_OF_BOUNDS"
  | "LETTER_CONFLICT"
  | "UNINTENDED_RUN"
  | "MISSING_RUN"
  | "DUPLICATE_ANSWER"
  | "DUPLICATE_WORD"
  | "SINGLE_NOT_ON_WORD"
  | "SINGLE_COLLIDES"
  | "DISCONNECTED"
  | "BAD_NUMBERING"
  | "NOT_TRIMMED"
  | "EXCEEDS_GRID";

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

export type DifficultySettings = {
  prefillPercent: number;
  revealsPerStudent: number;
  checkMode: CheckMode;
};

export type GenerateSuccess = {
  ok: true;
  puzzle: CrosswordPuzzle;
  stats: PuzzleStats;
  score: PuzzleScore;
  placementHash: string;
  excluded: ExcludedEntry[];
  unplaced: UnplacedEntry[];
  /** Entry ids whose clue contained the answer and was masked. */
  maskedClueIds: string[];
  seed: number;
  attemptsRun: number;
  truncated: boolean;
};

export type GenerateFailureReason = "NO_ELIGIBLE_WORDS" | "NOT_ENOUGH_WORDS";

export type GenerateFailure = {
  ok: false;
  reason: GenerateFailureReason;
  /** How many multi-cell words the best attempt could place. */
  placedWords: number;
  excluded: ExcludedEntry[];
  unplaced: UnplacedEntry[];
  seed: number;
  attemptsRun: number;
  truncated: boolean;
};

export type GenerateResult = GenerateSuccess | GenerateFailure;
