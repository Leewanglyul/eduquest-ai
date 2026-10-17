import { lengthOf } from "./chars";
import { numberStarts } from "./number";
import type { CrosswordPuzzle, Direction, PlacedWord, ValidationError, ValidationResult } from "./types";

/**
 * Checks a finished puzzle without using anything the placer uses (no WorkGrid, no placement rules): it rebuilds
 * the board from the words and verifies the properties of docs/m2/04-crossword-generator.md §1.1.
 *
 *  - every word is inside the board, letters agree where words share a cell;
 *  - reading every horizontal and vertical run of two or more filled cells gives exactly the multi-cell words
 *    (no accidental words, none missing, no two words of one direction touching);
 *  - a one-character word sits on a cell of a multi-cell word and takes the direction that word does not use;
 *  - no answer and no (cell, direction) is used twice;
 *  - the puzzle is connected, trimmed to its bounding box, numbered in reading order, and fits `maxGrid`.
 *
 * It runs after every attempt of the generator and again whenever a puzzle is saved or published.
 */
export function validatePuzzle(puzzle: CrosswordPuzzle, options: { maxGrid?: number } = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const add = (code: ValidationError["code"], message: string) => errors.push({ code, message });
  const { rows, cols, words } = puzzle;

  if (words.length === 0) {
    add("EMPTY_PUZZLE", "no words");
    return { ok: false, errors };
  }
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    add("BAD_SIZE", `bad size ${rows}x${cols}`);
    return { ok: false, errors };
  }
  if (options.maxGrid !== undefined && (rows > options.maxGrid || cols > options.maxGrid)) {
    add("EXCEEDS_GRID", `${rows}x${cols} is larger than ${options.maxGrid}`);
  }

  // Cells of every word.
  const cellsOf = (w: PlacedWord) => {
    const chars = Array.from(w.answer);
    return chars.map((ch, k) => ({
      r: w.row + (w.direction === "down" ? k : 0),
      c: w.col + (w.direction === "across" ? k : 0),
      ch,
    }));
  };

  const board = new Map<string, string>();
  const used = new Map<string, number>(); // "r,c,direction" -> word index
  const seenAnswers = new Set<string>();
  const multi: { w: PlacedWord; i: number }[] = [];
  const singles: { w: PlacedWord; i: number }[] = [];

  words.forEach((w, i) => {
    const n = lengthOf(w.answer);
    if (n === 0 || (w.direction !== "across" && w.direction !== "down")) {
      add("BAD_WORD", `word ${i} is empty or has no direction`);
      return;
    }
    if (w.single !== (n === 1)) {
      add("BAD_WORD", `word ${w.answer} is ${n} long but single=${w.single}`);
      return;
    }
    if (seenAnswers.has(w.answer)) add("DUPLICATE_ANSWER", `answer ${w.answer} appears twice`);
    seenAnswers.add(w.answer);

    (w.single ? singles : multi).push({ w, i });
    for (const { r, c, ch } of cellsOf(w)) {
      if (r < 0 || c < 0 || r >= rows || c >= cols) {
        add("OUT_OF_BOUNDS", `${w.answer} leaves the ${rows}x${cols} board at (${r},${c})`);
        continue;
      }
      if (!w.single) {
        const key = `${r},${c}`;
        const existing = board.get(key);
        if (existing !== undefined && existing !== ch) add("LETTER_CONFLICT", `(${r},${c}) holds ${existing} and ${ch}`);
        board.set(key, ch);
      }
      const slot = `${r},${c},${w.direction}`;
      if (used.has(slot)) add("DUPLICATE_WORD", `two ${w.direction} words use (${r},${c})`);
      used.set(slot, i);
    }
  });
  if (errors.some((e) => e.code === "BAD_WORD" || e.code === "OUT_OF_BOUNDS")) return { ok: false, errors };

  // Runs of two or more cells must be exactly the multi-cell words.
  const runKey = (direction: Direction, r: number, c: number, len: number) => `${direction}:${r},${c}:${len}`;
  const expected = new Map<string, string>();
  for (const { w } of multi) expected.set(runKey(w.direction, w.row, w.col, lengthOf(w.answer)), w.answer);

  const seenRuns = new Map<string, string>();
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      for (const direction of ["across", "down"] as const) {
        const pr = direction === "down" ? r - 1 : r;
        const pc = direction === "across" ? c - 1 : c;
        if (board.has(`${pr},${pc}`)) continue; // not the start of a run
        if (!board.has(`${r},${c}`)) continue;
        let len = 0;
        let text = "";
        while (board.has(`${r + (direction === "down" ? len : 0)},${c + (direction === "across" ? len : 0)}`)) {
          text += board.get(`${r + (direction === "down" ? len : 0)},${c + (direction === "across" ? len : 0)}`);
          len += 1;
        }
        if (len >= 2) seenRuns.set(runKey(direction, r, c, len), text);
      }
    }
  }
  for (const [key, text] of seenRuns) {
    if (!expected.has(key)) add("UNINTENDED_RUN", `the board reads "${text}" at ${key}, which is not a word`);
    else if (expected.get(key) !== text) add("UNINTENDED_RUN", `the board reads "${text}" at ${key}, expected "${expected.get(key)}"`);
  }
  for (const [key, answer] of expected) {
    if (!seenRuns.has(key)) add("MISSING_RUN", `${answer} at ${key} is not a complete run on the board`);
  }

  // One-character words.
  for (const { w } of singles) {
    const key = `${w.row},${w.col}`;
    if (!board.has(key)) {
      add("SINGLE_NOT_ON_WORD", `single ${w.answer} at (${w.row},${w.col}) is not on a word`);
      continue;
    }
    if (board.get(key) !== w.answer) add("LETTER_CONFLICT", `single ${w.answer} at (${w.row},${w.col}) differs from ${board.get(key)}`);
    const sameDirectionMulti = multi.some(({ w: m }) => cellsOf(m).some((cell) => cell.r === w.row && cell.c === w.col) && m.direction === w.direction);
    if (sameDirectionMulti) add("SINGLE_COLLIDES", `single ${w.answer} at (${w.row},${w.col}) is on a ${w.direction} word already`);
  }

  // Connected: multi-cell words linked through shared cells.
  if (multi.length > 0) {
    const cellWords = new Map<string, number[]>();
    multi.forEach(({ w }, mi) => {
      for (const { r, c } of cellsOf(w)) cellWords.set(`${r},${c}`, [...(cellWords.get(`${r},${c}`) ?? []), mi]);
    });
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const mi = queue.pop() as number;
      for (const { r, c } of cellsOf(multi[mi].w)) {
        for (const other of cellWords.get(`${r},${c}`) ?? []) {
          if (!seen.has(other)) {
            seen.add(other);
            queue.push(other);
          }
        }
      }
    }
    if (seen.size !== multi.length) add("DISCONNECTED", `${multi.length - seen.size} word(s) are not connected to the rest`);
  }

  // Trimmed to the bounding box.
  const filled = [...board.keys()].map((k) => k.split(",").map(Number));
  if (filled.length > 0) {
    const minR = Math.min(...filled.map((p) => p[0]));
    const maxR = Math.max(...filled.map((p) => p[0]));
    const minC = Math.min(...filled.map((p) => p[1]));
    const maxC = Math.max(...filled.map((p) => p[1]));
    if (minR !== 0 || minC !== 0 || maxR !== rows - 1 || maxC !== cols - 1) {
      add("NOT_TRIMMED", `the words span rows ${minR}-${maxR}, columns ${minC}-${maxC} on a ${rows}x${cols} board`);
    }
  }

  // Numbering.
  const numbers = numberStarts(words.map((w) => ({ row: w.row, col: w.col, direction: w.direction })));
  for (const w of words) {
    if (numbers.get(`${w.row},${w.col}`) !== w.number) {
      add("BAD_NUMBERING", `${w.answer} is numbered ${w.number}, expected ${numbers.get(`${w.row},${w.col}`)}`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
