/**
 * Frozen pre-filled cells, chosen WITHOUT reading any answer (doc 08 C.9 rule 1).
 *
 * choosePrefill() reads only the LENGTH of each answer (it needs cell geometry and which cells would complete a word),
 * never the letters. So the server builds a placeholder puzzle from answer-free structure and gets the same keys it
 * would get from the real one; a test pins this. The keys are stored once, at attempt creation, so a later change of
 * choosePrefill cannot move cells under a student who is mid-puzzle.
 */
import { choosePrefill } from "../generator/difficulty";
import type { CrosswordPuzzle } from "../generator/types";
import { cellKey } from "./cells";
import type { CellKey, PlayWord } from "./types";

export type PuzzleStructure = {
  rows: number;
  cols: number;
  words: readonly Pick<PlayWord, "number" | "direction" | "row" | "col" | "length" | "single">[];
};

/** A puzzle with the right geometry and placeholder letters. */
export function placeholderPuzzle(structure: PuzzleStructure): CrosswordPuzzle {
  return {
    rows: structure.rows,
    cols: structure.cols,
    words: structure.words.map((w, i) => ({
      entryId: `placeholder-${i}`,
      answer: "가".repeat(w.length),
      clue: "",
      row: w.row,
      col: w.col,
      direction: w.direction,
      number: w.number,
      single: w.single,
    })),
  };
}

/** The cell keys to give the student, sorted by row then column. Empty when percent <= 0. */
export function chooseFrozenPrefill(structure: PuzzleStructure, percent: number, seed: number): CellKey[] {
  return choosePrefill(placeholderPuzzle(structure), percent, seed).map((c) => cellKey(c.row, c.col));
}
