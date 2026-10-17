/**
 * Pure cell helpers for the play board: keys, the cells of a word, character rules, progress and navigation.
 * No DOM, no database, no answers.
 */
import type { CellKey, Direction, PlayWord } from "./types";

export const cellKey = (row: number, col: number): CellKey => `${row},${col}`;

export function parseCellKey(key: string): { row: number; col: number } | null {
  const m = /^(\d{1,2}),(\d{1,2})$/.exec(key);
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
}

export const isCellKey = (key: string): boolean => parseCellKey(key) !== null;

/** The keys a word occupies, in reading order. A one-cell word has one key (the cell it sits on). */
export function wordCells(word: Pick<PlayWord, "row" | "col" | "direction" | "length">): CellKey[] {
  return Array.from({ length: word.length }, (_, k) =>
    cellKey(word.row + (word.direction === "down" ? k : 0), word.col + (word.direction === "across" ? k : 0)),
  );
}

/** Every distinct cell of the puzzle (crossings counted once), sorted by row then column. */
export function allCells(words: readonly PlayWord[]): CellKey[] {
  return [...new Set(words.flatMap(wordCells))].sort(compareKeys);
}

export function compareKeys(a: string, b: string): number {
  const pa = parseCellKey(a);
  const pb = parseCellKey(b);
  if (!pa || !pb) return a.localeCompare(b);
  return pa.row - pb.row || pa.col - pb.col;
}

/** The words that pass through a cell (one or two). */
export function wordsAt(words: readonly PlayWord[], key: CellKey): PlayWord[] {
  return words.filter((w) => wordCells(w).includes(key));
}

// ---------------------------------------------------------------------------------------------------------
// Characters (the same rule as the SQL save function: one NFC [가-힣A-Z0-9])
// ---------------------------------------------------------------------------------------------------------

const ZERO_WIDTH_SPACE = /​/g;

/** NFC, ASCII upper-case, no zero-width space (the lab's Backspace sentinel). Does not drop anything else. */
export function normalizeTyped(raw: string): string {
  return raw.replace(ZERO_WIDTH_SPACE, "").normalize("NFC").replace(/[a-z]/g, (c) => c.toUpperCase());
}

/** True for exactly one finished syllable, one upper-case Latin letter or one digit. */
export const isValidCellChar = (ch: string): boolean => /^[가-힣A-Z0-9]$/.test(ch);

/** A lone jamo (a syllable that was not finished). */
export const isLoneJamo = (ch: string): boolean => /^[ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]$/.test(ch);

// ---------------------------------------------------------------------------------------------------------
// Progress (filled cells, never correct cells: a correct count would be a free check)
// ---------------------------------------------------------------------------------------------------------

export function filledCount(
  words: readonly PlayWord[],
  cells: Readonly<Record<CellKey, string>>,
  given: Readonly<Record<CellKey, string>>,
): number {
  return allCells(words).filter((k) => Boolean(cells[k]) || Boolean(given[k])).length;
}

/** The submit button is enabled when every cell holds something. The client cannot know more. */
export function allFilled(
  words: readonly PlayWord[],
  cells: Readonly<Record<CellKey, string>>,
  given: Readonly<Record<CellKey, string>>,
): boolean {
  return filledCount(words, cells, given) === allCells(words).length;
}

// ---------------------------------------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------------------------------------

export type Selection = { key: CellKey; direction: Direction };

/** Clue order: by number, across before down. */
export function sortedWords(words: readonly PlayWord[]): PlayWord[] {
  return [...words].sort((a, b) => a.number - b.number || (a.direction === b.direction ? 0 : a.direction === "across" ? -1 : 1));
}

/**
 * The word a selection points at: the word through the cell in the wanted direction, else the other one.
 * A one-cell word is reached through the direction its host word does not use.
 */
export function wordForSelection(words: readonly PlayWord[], sel: Selection): PlayWord | null {
  const here = wordsAt(words, sel.key);
  if (here.length === 0) return null;
  return here.find((w) => w.direction === sel.direction) ?? here[0];
}

/** A tap on the selected cell toggles the direction when two words cross there; a tap elsewhere keeps it if possible. */
export function selectCell(words: readonly PlayWord[], current: Selection | null, key: CellKey): Selection | null {
  const here = wordsAt(words, key);
  if (here.length === 0) return null;
  if (current && current.key === key && here.length > 1) {
    return { key, direction: current.direction === "across" ? "down" : "across" };
  }
  const keep = current ? here.find((w) => w.direction === current.direction) : undefined;
  return { key, direction: (keep ?? here[0]).direction };
}

/** Tab / Shift+Tab: the first cell of the next (or previous) clue, wrapping around. */
export function stepClue(words: readonly PlayWord[], sel: Selection, delta: 1 | -1): Selection | null {
  const order = sortedWords(words);
  if (order.length === 0) return null;
  const cur = wordForSelection(words, sel);
  const at = cur ? order.findIndex((w) => w.number === cur.number && w.direction === cur.direction) : -1;
  const next = order[(at + delta + order.length) % order.length];
  return { key: wordCells(next)[0], direction: next.direction };
}

/** Arrow keys: the nearest cell of the puzzle in that direction, or the same cell at the edge. */
export function moveSelection(
  words: readonly PlayWord[],
  sel: Selection,
  arrow: "up" | "down" | "left" | "right",
): Selection {
  const p = parseCellKey(sel.key);
  if (!p) return sel;
  const cells = new Set(allCells(words));
  const dr = arrow === "up" ? -1 : arrow === "down" ? 1 : 0;
  const dc = arrow === "left" ? -1 : arrow === "right" ? 1 : 0;
  for (let r = p.row + dr, c = p.col + dc; r >= 0 && c >= 0 && r < 100 && c < 100; r += dr, c += dc) {
    const key = cellKey(r, c);
    if (cells.has(key)) return selectCell(words, { key: sel.key, direction: dr !== 0 ? "down" : "across" }, key) ?? sel;
    if (Math.abs(r - p.row) > 15 || Math.abs(c - p.col) > 15) break;
  }
  return sel;
}

/** The first cell of a word that holds nothing yet, else its first cell (for "start here" after Tab). */
export function firstOpenCell(
  word: PlayWord,
  cells: Readonly<Record<CellKey, string>>,
  given: Readonly<Record<CellKey, string>>,
): CellKey {
  const keys = wordCells(word);
  return keys.find((k) => !cells[k] && !given[k]) ?? keys[0];
}
