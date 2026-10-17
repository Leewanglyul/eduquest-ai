/**
 * Types of the student play side. There is deliberately NO field that can carry an answer: PlayWord has no
 * `answer`, a check result is a status, and the only letters a payload holds are `given` (prefilled and
 * revealed cells) and the student's own `cells`.
 */
import type { CheckMode } from "../generator/constants";

export type Direction = "across" | "down";

/** "row,col", zero-based, the key used in cells, prefill_keys and revealed_keys. */
export type CellKey = string;

export type PlayWord = {
  number: number;
  direction: Direction;
  row: number;
  col: number;
  length: number;
  /** A one-cell word: it sits on a cell of another word. */
  single: boolean;
  clue: string;
};

export type AttemptStatus = "in_progress" | "completed";

/** What the save indicator shows (PM SP-3): saving, saved, or offline (the changes are kept and will be retried). */
export const SAVE_STATES = ["saving", "saved", "offline"] as const;
export type SaveState = (typeof SAVE_STATES)[number];

export type PlayLimits = {
  checkMode: CheckMode;
  /** null = unlimited */
  checksAllowed: number | null;
  checksRemaining: number | null;
  revealsAllowed: number;
  revealsRemaining: number;
  chosungAllowed: boolean;
};

/** Everything the browser receives for a puzzle (doc 08 C.3). Version 1. */
export type PlayPayload = {
  v: 1;
  assignmentId: string;
  attempt: { status: AttemptStatus; revision: number };
  puzzle: { title: string; rows: number; cols: number; words: PlayWord[] };
  /** Letters the student was given: prefilled and revealed cells. */
  given: Record<CellKey, string>;
  /** The student's own typed letters. */
  cells: Record<CellKey, string>;
  limits: PlayLimits;
  readonly: boolean;
  closesAt: string | null;
};

export type CheckStatus = "ok" | "wrong" | "empty";
export type CheckScope = "cell" | "word" | "puzzle";
export type CheckResult = { key: CellKey; status: CheckStatus };

export type SubmitResult =
  | { result: "completed"; justCompleted: boolean }
  | { result: "incomplete"; empty: number }
  | { result: "wrong"; wrongCells?: number };

/** What the cell on screen is (doc 08 C.7). checked-* are client-only overlays and are not part of this. */
export type CellState = "empty" | "typed" | "pending" | "given" | "revealed";

/** The stable codes of the database errors (the part after CROSSWORD_PLAY_). */
export const PLAY_ERROR_CODES = [
  "NOT_FOUND",
  "NOT_OPEN_YET",
  "CLOSED",
  "READONLY",
  "BAD_CELL",
  "BAD_CHAR",
  "BAD_PATCH",
  "PATCH_TOO_LARGE",
  "LOCKED_CELL",
  "STALE",
  "CHECK_NOT_ALLOWED",
  "CHECK_LIMIT",
  "CHECK_RATE",
  "REVEAL_NOT_ALLOWED",
  "REVEAL_LIMIT",
  "CHOSUNG_NOT_ALLOWED",
  "CHOSUNG_UNAVAILABLE",
  "SUBMIT_COOLDOWN",
] as const;
export type PlayErrorCode = (typeof PLAY_ERROR_CODES)[number];
