/**
 * Pure helpers for the teacher review screens (no I/O, no React): the grid cells, the clue lists, the warning list and
 * the Korean labels. Kept apart from the components so they can be tested without a browser.
 */
import { MASK_CHAR } from "../generator/constants";
import type { ExclusionReason, UnplacedReason } from "../generator/types";

export type ViewWord = {
  number: number;
  direction: "across" | "down";
  row: number;
  col: number;
  answer: string;
  clue: string;
  single?: boolean;
};

export type GridCell = {
  filled: boolean;
  /** The solution character (teacher area only). */
  char: string | null;
  /** The clue number that starts in this cell, if any. */
  number: number | null;
};

/** The board as rows x cols cells. A one-character word has a cell of its own only through the word it sits on. */
export function buildGrid(rows: number, cols: number, words: readonly ViewWord[]): GridCell[][] {
  const grid: GridCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ filled: false, char: null, number: null })),
  );
  for (const w of words) {
    const chars = Array.from(w.answer);
    chars.forEach((ch, k) => {
      const r = w.row + (w.direction === "down" ? k : 0);
      const c = w.col + (w.direction === "across" ? k : 0);
      if (r < 0 || c < 0 || r >= rows || c >= cols) return;
      grid[r][c].filled = true;
      grid[r][c].char = ch;
    });
    if (w.row >= 0 && w.col >= 0 && w.row < rows && w.col < cols)
      grid[w.row][w.col].number = w.number;
  }
  return grid;
}

export type ClueLine = {
  number: number;
  direction: "across" | "down";
  clue: string;
  length: number;
  key: string;
};

/** Across and Down clue lists in number order, each with the length shown as `(n)` (doc 04 §2.5). */
export function splitClues(words: readonly ViewWord[]): { across: ClueLine[]; down: ClueLine[] } {
  const line = (w: ViewWord): ClueLine => ({
    number: w.number,
    direction: w.direction,
    clue: w.clue,
    length: Array.from(w.answer).length,
    key: `${w.number}-${w.direction}`,
  });
  const byNumber = (a: ClueLine, b: ClueLine) => a.number - b.number;
  return {
    across: words
      .filter((w) => w.direction === "across")
      .map(line)
      .sort(byNumber),
    down: words
      .filter((w) => w.direction === "down")
      .map(line)
      .sort(byNumber),
  };
}

export type ReviewWarningCode =
  | "MASKED_CLUES"
  | "DUPLICATE_CLUES"
  | "WEAK_CONNECTION"
  | "TRUNCATED"
  | "UNPLACED_WORDS"
  | "EXCLUDED_WORDS";

export type ReviewWarning = {
  code: ReviewWarningCode;
  text: string;
  /** Keys ("number-direction") of the words the warning is about. */
  wordKeys: string[];
};

const keyOf = (w: Pick<ViewWord, "number" | "direction">) => `${w.number}-${w.direction}`;

/** Crossings per multi-cell word: cells it shares with a word of the other direction. */
export function crossingsByWord(words: readonly ViewWord[]): Map<string, number> {
  const multi = words.filter((w) => Array.from(w.answer).length >= 2);
  const cells = (w: ViewWord) =>
    Array.from(w.answer).map(
      (_, k) =>
        `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`,
    );
  const owner = new Map<string, ViewWord[]>();
  for (const w of multi) for (const c of cells(w)) owner.set(c, [...(owner.get(c) ?? []), w]);
  const result = new Map<string, number>();
  for (const w of multi) {
    result.set(
      keyOf(w),
      cells(w).filter((c) => (owner.get(c) ?? []).some((o) => o.direction !== w.direction)).length,
    );
  }
  return result;
}

const normalizeClue = (clue: string) =>
  clue.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Review warnings computed from the words (doc 04 §3.4): clues that were masked, identical clue texts, and a word with a
 * single crossing in an otherwise well connected puzzle. Generation-only facts (words left out, unplaced, truncated)
 * are passed in; a saved draft does not have them.
 */
export function computeReviewWarnings(
  words: readonly ViewWord[],
  extra: { truncated?: boolean; unplaced?: number; excluded?: number } = {},
): ReviewWarning[] {
  const warnings: ReviewWarning[] = [];

  const masked = words.filter((w) => w.clue.includes(MASK_CHAR));
  if (masked.length > 0) {
    warnings.push({
      code: "MASKED_CLUES",
      text: `뜻에 정답이 들어 있어 ○로 가린 힌트가 ${masked.length}개 있습니다. 힌트 문장을 고쳐 쓰면 더 자연스럽습니다.`,
      wordKeys: masked.map(keyOf),
    });
  }

  const groups = new Map<string, ViewWord[]>();
  for (const w of words)
    groups.set(normalizeClue(w.clue), [...(groups.get(normalizeClue(w.clue)) ?? []), w]);
  const dup = [...groups.values()].filter((g) => g.length > 1).flat();
  if (dup.length > 0) {
    warnings.push({
      code: "DUPLICATE_CLUES",
      text: `같은 힌트가 ${dup.length}개 단어에 쓰였습니다. 학생이 구분할 수 있게 고쳐 주세요.`,
      wordKeys: dup.map(keyOf),
    });
  }

  const crossings = crossingsByWord(words);
  const counts = [...crossings.values()];
  const average = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  if (average >= 1.3) {
    const weak = words.filter((w) => crossings.get(keyOf(w)) === 1);
    if (weak.length > 0) {
      warnings.push({
        code: "WEAK_CONNECTION",
        text: `다른 단어와 한 칸만 겹치는 단어가 ${weak.length}개 있습니다. 이 단어는 한 글자만 알면 정답이 드러날 수 있습니다.`,
        wordKeys: weak.map(keyOf),
      });
    }
  }

  if (extra.truncated) {
    warnings.push({
      code: "TRUNCATED",
      text: "시간 제한으로 탐색을 일찍 멈춰 더 좋은 배치가 있을 수 있습니다. 다시 생성해 보세요.",
      wordKeys: [],
    });
  }
  if (extra.unplaced && extra.unplaced > 0) {
    warnings.push({
      code: "UNPLACED_WORDS",
      text: `${extra.unplaced}개 단어는 퍼즐에 들어가지 못했습니다. 아래 목록에서 이유를 확인하세요.`,
      wordKeys: [],
    });
  }
  if (extra.excluded && extra.excluded > 0) {
    warnings.push({
      code: "EXCLUDED_WORDS",
      text: `${extra.excluded}개 단어는 퍼즐에 쓸 수 없어 제외했습니다. 아래 목록에서 이유를 확인하세요.`,
      wordKeys: [],
    });
  }
  return warnings;
}

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  EMPTY_ANSWER: "정답이 비어 있음",
  INVALID_CHARACTERS: "이모지·기호·공백이 들어 있음",
  SCRIPT_NOT_ALLOWED: "선택하지 않은 글자 종류",
  TOO_SHORT: "너무 짧음",
  TOO_LONG: "퍼즐 칸보다 김",
  DUPLICATE_ANSWER: "같은 정답이 이미 있음",
  EXCLUDED_BY_TEACHER: "직접 제외함",
};

export const UNPLACED_LABEL: Record<UnplacedReason, string> = {
  NOT_SELECTED: "단어 수 제한으로 선택되지 않음",
  NO_CROSSING: "다른 단어와 겹치는 글자가 없음",
  NO_LEGAL_POSITION: "겹칠 수 있는 자리가 없음",
  NO_MATCHING_CELL: "한 글자 단어를 놓을 칸이 없음",
};

export const LEVEL_LABEL = { easy: "쉬움", normal: "보통", hard: "어려움" } as const;
export const STATUS_LABEL = { draft: "초안", published: "배포됨", archived: "보관됨" } as const;
export const DIRECTION_LABEL = { across: "가로", down: "세로" } as const;
