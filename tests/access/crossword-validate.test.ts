import { describe, expect, it } from "vitest";

import { validatePuzzle } from "@/features/crossword/generator/validate";
import type { CrosswordPuzzle, PlacedWord, ValidationCode } from "@/features/crossword/generator/types";

// The independent validator, tested on puzzles written by hand (it shares no code with the placer).

const w = (answer: string, row: number, col: number, direction: "across" | "down", number: number, over: Partial<PlacedWord> = {}): PlacedWord => ({
  entryId: `id-${answer}-${direction}`,
  answer,
  clue: `${answer} 뜻`,
  row,
  col,
  direction,
  number,
  single: Array.from(answer).length === 1,
  ...over,
});

/**
 *   사1 과2  ■
 *    ■ 일3 기4
 *    ■  ■ 차
 */
const good = (): CrosswordPuzzle => ({
  rows: 3,
  cols: 3,
  words: [w("사과", 0, 0, "across", 1), w("과일", 0, 1, "down", 2), w("일기", 1, 1, "across", 3), w("기차", 1, 2, "down", 4)],
});

const codes = (p: CrosswordPuzzle, maxGrid?: number): ValidationCode[] => {
  const r = validatePuzzle(p, { maxGrid });
  return r.ok ? [] : [...new Set(r.errors.map((e) => e.code))];
};

describe("M2-2.1 validator: valid puzzles", () => {
  it("accepts the worked example of the design", () => {
    expect(validatePuzzle(good())).toEqual({ ok: true });
  });

  it("accepts a one-character word on a cell of another word, in the free direction", () => {
    const p = good();
    // 일 (1,1) belongs to the down word 과일 and the across word 일기: both directions are used, so use 사 (0,0): across only.
    p.words.push(w("사", 0, 0, "down", 1));
    expect(validatePuzzle(p)).toEqual({ ok: true });
  });

  it("accepts a puzzle exactly as large as the grid size, and rejects it one size smaller", () => {
    expect(codes(good(), 3)).toEqual([]);
    expect(codes(good(), 2)).toEqual(["EXCEEDS_GRID"]);
  });
});

describe("M2-2.1 validator: broken puzzles", () => {
  it("rejects an empty puzzle and a bad size", () => {
    expect(codes({ rows: 3, cols: 3, words: [] })).toEqual(["EMPTY_PUZZLE"]);
    expect(codes({ ...good(), rows: 0 })).toEqual(["BAD_SIZE"]);
  });

  it("rejects a word that leaves the board", () => {
    const p = good();
    p.cols = 2;
    expect(codes(p)).toContain("OUT_OF_BOUNDS");
  });

  it("rejects two words that disagree about a letter", () => {
    const p = good();
    p.words[1] = w("고일", 0, 1, "down", 2); // 고 where 사과 has 과
    expect(codes(p)).toContain("LETTER_CONFLICT");
  });

  it("rejects an accidental word: a parallel word touching another reads as extra runs", () => {
    const p: CrosswordPuzzle = {
      rows: 2,
      cols: 2,
      words: [w("사과", 0, 0, "across", 1), w("나무", 1, 0, "across", 3)],
    };
    // Columns read 사나 and 과무, which are not words.
    expect(codes(p)).toContain("UNINTENDED_RUN");
  });

  it("rejects two words of one direction that touch end to end", () => {
    const p: CrosswordPuzzle = {
      rows: 1,
      cols: 4,
      words: [w("사과", 0, 0, "across", 1), w("나무", 0, 2, "across", 2)],
    };
    const c = codes(p);
    expect(c).toContain("UNINTENDED_RUN");
    expect(c).toContain("MISSING_RUN");
  });

  it("rejects two words of one direction on the same cell", () => {
    const p: CrosswordPuzzle = {
      rows: 1,
      cols: 3,
      words: [w("사과나", 0, 0, "across", 1), w("사과", 0, 0, "across", 1, { entryId: "other" })],
    };
    expect(codes(p)).toContain("DUPLICATE_WORD");
  });

  it("rejects the same answer twice", () => {
    const p: CrosswordPuzzle = {
      rows: 3,
      cols: 3,
      words: [w("사과", 0, 0, "across", 1), w("사과", 0, 1, "down", 2, { entryId: "other" })],
    };
    expect(codes(p)).toContain("DUPLICATE_ANSWER");
  });

  it("rejects a puzzle in two pieces", () => {
    const p: CrosswordPuzzle = {
      rows: 3,
      cols: 4,
      words: [w("사과", 0, 0, "across", 1), w("나무", 2, 2, "across", 2)],
    };
    expect(codes(p)).toEqual(["DISCONNECTED"]);
  });

  it("rejects a puzzle that is not trimmed to its words", () => {
    const p = good();
    p.rows = 5;
    p.cols = 5;
    expect(codes(p)).toEqual(["NOT_TRIMMED"]);
  });

  it("rejects wrong numbering", () => {
    const p = good();
    p.words[2] = { ...p.words[2], number: 9 };
    expect(codes(p)).toEqual(["BAD_NUMBERING"]);
    const q = good();
    q.words[1] = { ...q.words[1], number: 1 }; // 과일 starts at (0,1), which is number 2
    expect(codes(q)).toEqual(["BAD_NUMBERING"]);
  });

  it("rejects a word whose single flag disagrees with its length, and empty words", () => {
    const p = good();
    p.words[0] = { ...p.words[0], single: true };
    expect(codes(p)).toContain("BAD_WORD");
    const q = good();
    q.words[0] = { ...q.words[0], answer: "" };
    expect(codes(q)).toContain("BAD_WORD");
  });

  it("rejects a one-character word that is not on a word, differs from its cell, or doubles a direction", () => {
    const floating = good();
    floating.words.push(w("물", 2, 0, "across", 5));
    expect(codes(floating)).toContain("SINGLE_NOT_ON_WORD");

    const wrongLetter = good();
    wrongLetter.words.push(w("물", 0, 0, "down", 1));
    expect(codes(wrongLetter)).toContain("LETTER_CONFLICT");

    const sameDirection = good();
    sameDirection.words.push(w("사", 0, 0, "across", 1)); // 사과 already runs across here
    const c = codes(sameDirection);
    expect(c).toContain("SINGLE_COLLIDES");
  });
});
