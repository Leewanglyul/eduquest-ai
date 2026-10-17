import type { Script } from "./types";

/** Number of grid cells of an answer: Unicode code points (a Hangul syllable block is one). */
export const lengthOf = (answer: string): number => Array.from(answer).length;

/** Script of one character, or null when it cannot be a grid cell (decision C7: no emoji, no symbols). */
export function scriptOfChar(ch: string): Script | null {
  if (/^[가-힣]$/.test(ch)) return "hangul";
  if (/^[A-Z]$/.test(ch)) return "latin";
  if (/^[0-9]$/.test(ch)) return "digit";
  return null;
}

const upperAscii = (value: string) => value.replace(/[a-z]/g, (c) => c.toUpperCase());

export type AnswerAnalysis =
  | { ok: true; answer: string; chars: string[]; scripts: Set<Script> }
  | { ok: false; reason: "EMPTY_ANSWER" }
  | { ok: false; reason: "INVALID_CHARACTERS"; bad: string[] };

/**
 * Normalises an answer the way the word sets do (NFC, ASCII upper-case) and checks that every character
 * can be a grid cell. Spaces, hyphens, emoji, symbols, Hangul jamo and non-ASCII letters are rejected: the
 * word sets already refuse them, and the generator does not trust its input.
 */
export function analyseAnswer(raw: string): AnswerAnalysis {
  const answer = upperAscii(raw.normalize("NFC"));
  const chars = Array.from(answer);
  if (chars.length === 0) return { ok: false, reason: "EMPTY_ANSWER" };

  const bad = [...new Set(chars.filter((c) => scriptOfChar(c) === null))];
  if (bad.length > 0) return { ok: false, reason: "INVALID_CHARACTERS", bad: bad.slice(0, 5) };

  return { ok: true, answer, chars, scripts: new Set(chars.map((c) => scriptOfChar(c) as Script)) };
}
