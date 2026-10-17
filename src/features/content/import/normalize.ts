import {
  ANSWER_GRID_SAFE_PATTERN,
  SET_TITLE_MAX_CHARS,
  type ContentScript,
} from "./content-schemas";
import { ContentImportError } from "./import-errors";

/** Counts characters as code points (an emoji or a Hangul syllable is one). */
export const charLength = (value: string): number => Array.from(value).length;

// NUL and other C0/C1 controls except tab, LF and CR (those are whitespace, handled below).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Soft hyphen, zero-width characters and marks, bidi embeddings/isolates, word joiner, BOM.
const INVISIBLE_CHARS = /[­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const WHITESPACE_RUN = /[\s 　]+/g;

export type CleanTextResult = {
  text: string;
  /** Control or invisible characters were removed. */
  controlRemoved: boolean;
  /** A line break or a run of whitespace was collapsed (plain trimming does not count). */
  whitespaceChanged: boolean;
};

/**
 * Display cleaning for term and definition: remove controls/invisible characters, NFC, collapse
 * whitespace, trim. NFC matters because macOS and some copy-paste produce decomposed Hangul.
 */
export function cleanText(input: string): CleanTextResult {
  const withoutControls = input.replace(CONTROL_CHARS, "").replace(INVISIBLE_CHARS, "");
  const controlRemoved = withoutControls !== input;

  const composed = withoutControls.normalize("NFC");
  const trimmed = composed.trim();
  const collapsed = trimmed.replace(WHITESPACE_RUN, " ");
  return { text: collapsed, controlRemoved, whitespaceChanged: collapsed !== trimmed };
}

/** Titles of word sets: same cleaning, 1..SET_TITLE_MAX_CHARS characters. */
export function normalizeSetTitle(input: string): string {
  const { text } = cleanText(input);
  const length = charLength(text);
  if (length < 1 || length > SET_TITLE_MAX_CHARS) throw new ContentImportError("TITLE_INVALID");
  return text;
}

// Separators that are never grid cells: space, hyphens and dashes, apostrophes, period, middle dots, underscore.
const ANSWER_SEPARATORS = /[ \-‐-―'’.·ㆍ_]/g;
// Hangul jamo: conjoining, compatibility, extended-A and extended-B.
const JAMO = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/;

/** Fullwidth ASCII (U+FF01..U+FF5E) to ASCII. Not NFKC: that would also rewrite circled digits and ㈜. */
function foldFullwidth(value: string): string {
  return value.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** ASCII-only upper-casing, independent of locale. */
const upperAscii = (value: string) => value.replace(/[a-z]/g, (c) => c.toUpperCase());

/** Removes separators and folds case, without validating. Shared by `deriveAnswer` and the clue check. */
export function squash(value: string): string {
  return upperAscii(foldFullwidth(value.normalize("NFC")).replace(ANSWER_SEPARATORS, ""));
}

export type AnswerDerivation =
  | { ok: true; answer: string; length: number; script: ContentScript }
  | { ok: false; code: "ANSWER_JAMO" }
  | { ok: false; code: "ANSWER_NUMERIC_LIKE" }
  | { ok: false; code: "ANSWER_INVALID_CHAR"; chars: string[] };

const SIGNS_AND_POINTS = /[+\-\u2010-\u2015.,]/;

/**
 * Terms that are numbers, not words (decision P3): a decimal point or comma between digits anywhere
 * (1.5, 3.14, 1,000), or a term made only of digits with signs, dots, commas or hyphens (-5, 2024-10-17,
 * a phone number). Removing the separators would turn them into other numbers (1.5 -> 15). Plain digits
 * (2024) and digits next to letters (3D, COVID-19) stay valid.
 */
export function isNumericLike(cleanTerm: string): boolean {
  const folded = foldFullwidth(cleanTerm.normalize("NFC"));
  if (/\d[.,]\d/.test(folded)) return true;
  const compact = folded.replace(/\s+/g, "");
  return /^[+\-\u2010-\u2015.,\d]+$/.test(compact) && /\d/.test(compact) && SIGNS_AND_POINTS.test(compact);
}

export function scriptOf(answer: string): ContentScript {
  if (/^[가-힣]+$/.test(answer)) return "hangul";
  if (/^[A-Z]+$/.test(answer)) return "latin";
  if (/^[0-9]+$/.test(answer)) return "digit";
  return "mixed";
}

/**
 * Grid form of a cleaned term. Length bounds are checked by the caller (row-rules), so that
 * "too short" and "too long" are reported with their own messages.
 */
export function deriveAnswer(cleanTerm: string): AnswerDerivation {
  if (isNumericLike(cleanTerm)) return { ok: false, code: "ANSWER_NUMERIC_LIKE" };
  const answer = squash(cleanTerm);
  if (JAMO.test(answer)) return { ok: false, code: "ANSWER_JAMO" };

  if (!ANSWER_GRID_SAFE_PATTERN.test(answer) && answer !== "") {
    const bad = Array.from(new Set(Array.from(answer).filter((c) => !/[가-힣A-Z0-9]/.test(c))));
    return { ok: false, code: "ANSWER_INVALID_CHAR", chars: bad.slice(0, 5) };
  }
  return { ok: true, answer, length: charLength(answer), script: scriptOf(answer) };
}
