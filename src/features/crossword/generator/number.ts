import type { Direction } from "./types";

type Start = { row: number; col: number; direction: Direction };

/**
 * Crossword numbering: walk the grid row by row, left to right; a cell that starts a word (across or down,
 * including a one-cell word) gets the next number, and every word starting there shares it. Returns the number
 * for each start cell key "row,col".
 */
export function numberStarts(starts: readonly Start[]): Map<string, number> {
  const keys = [...new Set(starts.map((s) => `${s.row},${s.col}`))]
    .map((k) => k.split(",").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numbers = new Map<string, number>();
  keys.forEach(([r, c], i) => numbers.set(`${r},${c}`, i + 1));
  return numbers;
}
