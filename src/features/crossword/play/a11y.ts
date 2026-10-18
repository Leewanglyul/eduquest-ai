/**
 * Accessible names for the play board (WCAG 2.2 AA, doc 08 D). Pure, so the exact wording is tested.
 * Example: "가로 1번, 2글자, 첫 번째 칸, 입력됨".
 */
import type { CellState, CheckStatus, Direction } from "./types";

const ORDINAL = ["첫 번째", "두 번째", "세 번째", "네 번째", "다섯 번째", "여섯 번째", "일곱 번째", "여덟 번째", "아홉 번째", "열 번째", "열한 번째", "열두 번째", "열세 번째", "열네 번째", "열다섯 번째"];

/** 1-based position as a Korean ordinal ("첫 번째", "두 번째" ...). */
export const ordinalKo = (position: number): string => ORDINAL[position - 1] ?? `${position}번째`;

export const directionKo = (d: Direction): string => (d === "across" ? "가로" : "세로");

const STATE_KO: Record<CellState, string> = {
  empty: "비어 있음",
  typed: "입력됨",
  pending: "조합 중",
  given: "알려 준 칸",
  revealed: "알려 준 칸",
};

const MARK_KO: Record<CheckStatus, string> = { ok: "맞음", wrong: "다시 보기", empty: "아직 비어 있음" };

export function wordName(word: { number: number; direction: Direction; length: number }): string {
  return `${directionKo(word.direction)} ${word.number}번, ${word.length}글자`;
}

export function cellAccessibleName(input: {
  word: { number: number; direction: Direction; length: number };
  index: number; // 0-based position inside the word
  state: CellState;
  mark?: CheckStatus;
  /** The letter in the cell, so a screen reader user hears what is there (their own letter or one they were given). */
  letter?: string;
}): string {
  const parts = [wordName(input.word), `${ordinalKo(input.index + 1)} 칸`, STATE_KO[input.state]];
  if (input.letter) parts.push(input.letter);
  if (input.mark) parts.push(MARK_KO[input.mark]);
  return parts.join(", ");
}

/** Spoken when the selection moves: the word, its clue and where inside it the student is. */
export function selectionAnnouncement(word: { number: number; direction: Direction; length: number; clue: string }, index: number): string {
  return `${wordName(word)}, ${ordinalKo(index + 1)} 칸. 단서: ${word.clue}`;
}
