import { describe, expect, it } from "vitest";

import { generateCrossword } from "@/features/crossword/generator/generate";
import {
  EXCLUSION_LABEL,
  UNPLACED_LABEL,
  buildGrid,
  computeReviewWarnings,
  crossingsByWord,
  splitClues,
  type ViewWord,
} from "@/features/crossword/review/view-model";

// The worked example of doc 04 §2.7 on a 3 x 3 board:  사 과 ■ / ■ 일 기 / ■ ■ 차
const W = (
  number: number,
  direction: "across" | "down",
  row: number,
  col: number,
  answer: string,
  clue = `${answer} 힌트`,
): ViewWord => ({
  number,
  direction,
  row,
  col,
  answer,
  clue,
});
const EXAMPLE = [
  W(1, "across", 0, 0, "사과"),
  W(2, "down", 0, 1, "과일"),
  W(3, "across", 1, 1, "일기"),
  W(4, "down", 1, 2, "기차"),
];

describe("grid view model", () => {
  it("fills exactly the cells of the words and numbers the start cells", () => {
    const grid = buildGrid(3, 3, EXAMPLE);
    expect(grid.map((row) => row.map((c) => (c.filled ? c.char : "·")).join(""))).toEqual(
      ["사과·", "·일기", "··차"].map((r) => r.slice(0, 3)),
    );
    expect(grid[0][0].number).toBe(1);
    expect(grid[0][1].number).toBe(2);
    expect(grid[1][1].number).toBe(3);
    expect(grid[1][2].number).toBe(4);
    expect(grid[2][2].number).toBeNull();
    expect(grid[0][2].filled).toBe(false);
  });

  it("matches a generated puzzle: every word letter appears on the board", () => {
    const entries = [
      "사과",
      "과일",
      "일기",
      "기차",
      "차표",
      "표지",
      "지도",
      "도서관",
      "관심",
      "심장",
    ].map((a, i) => ({ id: `e${i}`, answer: a, clue: `뜻 ${i}` }));
    const r = generateCrossword(entries, { seed: 3, gridSize: 13, maskClues: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const grid = buildGrid(r.puzzle.rows, r.puzzle.cols, r.puzzle.words);
    expect(grid).toHaveLength(r.puzzle.rows);
    expect(grid.every((row) => row.length === r.puzzle.cols)).toBe(true);
    const filled = grid.flat().filter((c) => c.filled).length;
    expect(filled).toBe(r.stats.cells);
  });

  it("ignores cells outside the board instead of throwing", () => {
    expect(() => buildGrid(2, 2, [W(1, "across", 0, 0, "사과나무")])).not.toThrow();
  });
});

describe("clue lists", () => {
  it("splits across and down, in number order, with the length", () => {
    const { across, down } = splitClues([...EXAMPLE].reverse());
    expect(across.map((c) => [c.number, c.length])).toEqual([
      [1, 2],
      [3, 2],
    ]);
    expect(down.map((c) => [c.number, c.length])).toEqual([
      [2, 2],
      [4, 2],
    ]);
  });
});

describe("review warnings", () => {
  it("counts crossings per word", () => {
    const c = crossingsByWord(EXAMPLE);
    expect(c.get("1-across")).toBe(1);
    expect(c.get("2-down")).toBe(2);
    expect(c.get("3-across")).toBe(2);
    expect(c.get("4-down")).toBe(1);
  });

  it("flags masked clues and identical clues", () => {
    const words = [
      W(1, "across", 0, 0, "사과", "○○는 과일"),
      W(2, "down", 0, 1, "과일", "같은 힌트"),
      W(3, "across", 1, 1, "일기", " 같은  힌트 "),
    ];
    const codes = computeReviewWarnings(words).map((w) => w.code);
    expect(codes).toContain("MASKED_CLUES");
    expect(codes).toContain("DUPLICATE_CLUES");
    const dup = computeReviewWarnings(words).find((w) => w.code === "DUPLICATE_CLUES")!;
    expect(dup.wordKeys.sort()).toEqual(["2-down", "3-across"]);
  });

  it("flags a single-crossing word only in an otherwise well connected puzzle", () => {
    // 사과 and 기차 cross once, 과일 and 일기 twice: average 1.5 >= 1.3
    const dense = computeReviewWarnings(EXAMPLE);
    expect(dense.find((w) => w.code === "WEAK_CONNECTION")?.wordKeys).toEqual([
      "1-across",
      "4-down",
    ]);
    // a chain where every word has one crossing: average 1 < 1.3, no weak-connection noise
    const chain = [W(1, "across", 0, 0, "사과"), W(2, "down", 0, 1, "과일")];
    expect(computeReviewWarnings(chain).some((w) => w.code === "WEAK_CONNECTION")).toBe(false);
  });

  it("adds the generation facts only when they are given", () => {
    expect(
      computeReviewWarnings(
        EXAMPLE.map((w) => ({ ...w, clue: `다른 힌트 ${w.number}` })),
        {},
      ).map((w) => w.code),
    ).toEqual(["WEAK_CONNECTION"]);
    const codes = computeReviewWarnings(EXAMPLE, { truncated: true, unplaced: 2, excluded: 1 }).map(
      (w) => w.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining(["TRUNCATED", "UNPLACED_WORDS", "EXCLUDED_WORDS"]),
    );
  });

  it("has a Korean label for every reason the generator can give", () => {
    for (const label of [...Object.values(EXCLUSION_LABEL), ...Object.values(UNPLACED_LABEL)])
      expect(label).toMatch(/[가-힣]/);
    expect(Object.keys(EXCLUSION_LABEL)).toHaveLength(7);
    expect(Object.keys(UNPLACED_LABEL)).toHaveLength(4);
  });
});
