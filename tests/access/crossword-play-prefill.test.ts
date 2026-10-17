import { describe, expect, it } from "vitest";

import { DIFFICULTY_PRESETS } from "@/features/crossword/generator/constants";
import { choosePrefill } from "@/features/crossword/generator/difficulty";
import { generateCrossword } from "@/features/crossword/generator/generate";
import type { CrosswordInputEntry, CrosswordPuzzle } from "@/features/crossword/generator/types";
import { lengthOf } from "@/features/crossword/generator/chars";
import { allCells, cellKey, wordCells } from "@/features/crossword/play/cells";
import { chooseFrozenPrefill, placeholderPuzzle, type PuzzleStructure } from "@/features/crossword/play/prefill";

const CHAIN = ["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관", "관심", "심장", "장미", "미술", "술래", "내일", "일요일"];
const LATIN = ["APPLE", "LEMON", "MELON", "NEON", "ONION", "NINE", "EEL", "LAMP", "PEAR", "RAIN", "NAIL", "LIME", "MILE", "ALE"];

const entries = (words: string[]): CrosswordInputEntry[] =>
  words.map((w, i) => ({ id: `e${String(i).padStart(2, "0")}`, answer: w, clue: `${w}의 뜻을 설명하는 문장` }));

/** The answer-free structure the server keeps for prefill: geometry and lengths only. */
const structureOf = (p: CrosswordPuzzle): PuzzleStructure => ({
  rows: p.rows,
  cols: p.cols,
  words: p.words.map((w) => ({ number: w.number, direction: w.direction, row: w.row, col: w.col, length: lengthOf(w.answer), single: w.single })),
});

function puzzles(): { name: string; seed: number; puzzle: CrosswordPuzzle }[] {
  const out: { name: string; seed: number; puzzle: CrosswordPuzzle }[] = [];
  for (const [name, words] of [["chain", CHAIN], ["latin", LATIN]] as const) {
    for (let seed = 1; seed <= 12; seed++) {
      const r = generateCrossword(entries([...words]), { seed, gridSize: 13, minWords: 1 });
      if (r.ok) out.push({ name, seed, puzzle: r.puzzle });
    }
  }
  return out;
}

describe("prefill without reading an answer", () => {
  const set = puzzles();

  it("the fixtures produce puzzles", () => {
    expect(set.length).toBeGreaterThanOrEqual(10);
  });

  it("placeholder puzzles have the same geometry and no real letters", () => {
    for (const { puzzle } of set) {
      const ph = placeholderPuzzle(structureOf(puzzle));
      expect(ph.words.map((w) => [w.row, w.col, w.direction, Array.from(w.answer).length, w.single])).toEqual(
        puzzle.words.map((w) => [w.row, w.col, w.direction, lengthOf(w.answer), w.single]),
      );
      for (const w of ph.words) expect(new Set(Array.from(w.answer))).toEqual(new Set(["가"]));
    }
  });

  it("real answers and placeholders give identical cells, for every preset share and many seeds", () => {
    const percents = [0, 10, DIFFICULTY_PRESETS.normal.prefillPercent, DIFFICULTY_PRESETS.easy.prefillPercent, 50, 100];
    for (const { puzzle, seed } of set) {
      for (const percent of percents) {
        const real = choosePrefill(puzzle, percent, seed).map((c) => cellKey(c.row, c.col));
        const frozen = chooseFrozenPrefill(structureOf(puzzle), percent, seed);
        expect(frozen).toEqual(real);
      }
    }
  });

  it("never completes a word, so every word is still asked for (one-cell words included)", () => {
    for (const { puzzle, seed } of set) {
      const structure = structureOf(puzzle);
      for (const percent of [10, 25, 50, 100]) {
        const given = new Set(chooseFrozenPrefill(structure, percent, seed));
        for (const w of structure.words) {
          const keys = wordCells({ ...w });
          expect(keys.every((k) => given.has(k)), `${w.number}${w.direction} at ${percent}%`).toBe(false);
        }
      }
    }
  });

  it("uses only cells of the puzzle, sorted, and about the asked share", () => {
    for (const { puzzle, seed } of set) {
      const structure = structureOf(puzzle);
      const cells = allCells(structure.words.map((w) => ({ ...w, clue: "" })));
      const keys = chooseFrozenPrefill(structure, 25, seed);
      expect(keys.every((k) => cells.includes(k))).toBe(true);
      expect(keys).toEqual([...keys].sort((a, b) => {
        const [ar, ac] = a.split(",").map(Number);
        const [br, bc] = b.split(",").map(Number);
        return ar - br || ac - bc;
      }));
      expect(keys.length).toBeLessThanOrEqual(Math.round(0.25 * cells.length));
    }
  });

  it("is deterministic, and changes with the seed", () => {
    const { puzzle, seed } = set[0];
    const s = structureOf(puzzle);
    expect(chooseFrozenPrefill(s, 25, seed)).toEqual(chooseFrozenPrefill(s, 25, seed));
    expect(chooseFrozenPrefill(s, 0, seed)).toEqual([]);
    const variants = new Set(Array.from({ length: 12 }, (_, k) => chooseFrozenPrefill(s, 25, seed + k).join("|")));
    expect(variants.size).toBeGreaterThan(1);
  });
});
