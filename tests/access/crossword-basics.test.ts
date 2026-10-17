import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { analyseAnswer, lengthOf, scriptOfChar } from "@/features/crossword/generator/chars";
import { maskClue } from "@/features/crossword/generator/clues";
import {
  CROSSWORD_DEFAULT_ATTEMPTS,
  CROSSWORD_MAX_ATTEMPTS,
  CROSSWORD_MAX_GRID,
  CROSSWORD_MAX_SINGLE_WORDS,
  CROSSWORD_MAX_WORD_LEN,
  CROSSWORD_MAX_WORDS,
  CROSSWORD_MIN_GRID,
  CROSSWORD_MIN_WORD_LEN,
  CROSSWORD_MIN_WORDS,
  CROSSWORD_SCRIPTS,
  GENERATOR_VERSION,
  MASK_CHAR,
} from "@/features/crossword/generator/constants";
import { resolveOptions } from "@/features/crossword/generator/options";
import { mixSeed, mulberry32, shuffled } from "@/features/crossword/generator/prng";
import { selectWords } from "@/features/crossword/generator/select";
import { ANSWER_MAX_LEN } from "@/features/content/import/content-schemas";

const entry = (id: string, answer: string, clue = `${answer} 뜻`) => ({ id, answer, clue });
const select = (entries: ReturnType<typeof entry>[], over: Parameters<typeof resolveOptions>[0] extends infer T ? Partial<T> : never = {}) =>
  selectWords(entries, resolveOptions({ seed: 1, gridSize: 15, ...over }), mulberry32(1));

describe("M2-2.1 constants", () => {
  it("are pinned", () => {
    expect(GENERATOR_VERSION).toBe(1);
    expect(CROSSWORD_MIN_WORDS).toBe(5);
    expect(CROSSWORD_MAX_WORDS).toBe(25);
    expect(CROSSWORD_MAX_SINGLE_WORDS).toBe(5);
    expect(CROSSWORD_MIN_WORD_LEN).toBe(1); // decision C1
    expect(CROSSWORD_MAX_WORD_LEN).toBe(15);
    expect([CROSSWORD_MIN_GRID, CROSSWORD_MAX_GRID]).toEqual([5, 15]);
    expect(CROSSWORD_DEFAULT_ATTEMPTS).toBeLessThanOrEqual(CROSSWORD_MAX_ATTEMPTS);
    expect([...CROSSWORD_SCRIPTS]).toEqual(["hangul", "latin", "digit"]); // decision C7
    expect(MASK_CHAR).toBe("○");
  });

  it("never allow a longer word than a word set can hold", () => {
    expect(CROSSWORD_MAX_WORD_LEN).toBe(ANSWER_MAX_LEN);
    expect(CROSSWORD_MAX_GRID).toBeGreaterThanOrEqual(CROSSWORD_MAX_WORD_LEN);
  });
});

describe("M2-2.1 seeded random numbers", () => {
  it("match the reference mulberry32 values (so every machine gets the same puzzle)", () => {
    const r = mulberry32(1);
    expect([r.next(), r.next(), r.next()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    expect(mulberry32(0xffffffff).next()).toBe(0.8964226141106337);
    expect(mulberry32(42).nextInt(10)).toBe(6);
  });

  it("stay in range and repeat for the same seed", () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    for (let i = 0; i < 1000; i += 1) {
      const x = a.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      expect(b.next()).toBe(x);
      expect(mulberry32(i).nextInt(7)).toBeLessThan(7);
    }
  });

  it("mix a seed with a stream number into independent seeds", () => {
    expect([mixSeed(1, 0), mixSeed(1, 1), mixSeed(0, 0)]).toEqual([3713564832, 1397235283, 4094976984]);
    expect(new Set(Array.from({ length: 200 }, (_, i) => mixSeed(5, i))).size).toBe(200);
  });

  it("shuffle without losing items and without touching the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(input, mulberry32(3));
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(shuffled(input, mulberry32(3))).toEqual(out);
  });

  it("never uses Math.random", () => {
    const dir = path.resolve(import.meta.dirname, "../../src/features/crossword/generator");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      expect(fs.readFileSync(path.join(dir, file), "utf8"), file).not.toMatch(/Math\.random\s*\(/);
    }
  });
});

describe("M2-2.1 answers (decision C7: Hangul, Latin, digits; no emoji, no symbols)", () => {
  it("accepts Hangul, Latin letters, digits and their mixtures", () => {
    for (const a of ["사과", "ICE", "2024", "COVID19", "3D프린터", "물", "A", "7"]) {
      const r = analyseAnswer(a);
      expect(r.ok, a).toBe(true);
    }
  });

  it("upper-cases ASCII and composes decomposed Hangul", () => {
    const r = analyseAnswer("ice");
    expect(r.ok && r.answer).toBe("ICE");
    const d = analyseAnswer("사과".normalize("NFD"));
    expect(d.ok && d.answer).toBe("사과");
    expect(d.ok && d.chars).toEqual(["사", "과"]);
  });

  it("rejects emoji and symbols and says which characters", () => {
    for (const a of ["😀", "사과😀", "★별", "A&B", "a b", "사과!", "e-mail", "①", "㈜", "ＡＢＣ", "ㄱㄴ", "café", "한자漢字", "​사과"]) {
      const r = analyseAnswer(a);
      expect(r.ok, a).toBe(false);
      if (!r.ok) expect(r.reason).toBe("INVALID_CHARACTERS");
    }
    const emoji = analyseAnswer("사과😀");
    expect(!emoji.ok && emoji.reason === "INVALID_CHARACTERS" && emoji.bad).toEqual(["😀"]);
  });

  it("rejects an empty answer", () => {
    expect(analyseAnswer("")).toEqual({ ok: false, reason: "EMPTY_ANSWER" });
  });

  it("counts code points: a syllable is one cell", () => {
    expect(lengthOf("대한민국")).toBe(4);
    expect(lengthOf("ICE")).toBe(3);
    expect(scriptOfChar("가")).toBe("hangul");
    expect(scriptOfChar("Z")).toBe("latin");
    expect(scriptOfChar("0")).toBe("digit");
    expect(scriptOfChar("z")).toBeNull();
    expect(scriptOfChar("😀")).toBeNull();
  });
});

describe("M2-2.1 options", () => {
  it("fill the defaults", () => {
    const o = resolveOptions({ seed: 5, gridSize: 10 });
    expect(o).toMatchObject({ maxWords: 25, minWords: 5, minWordLen: 1, maxWordLen: 10, maxSingleWords: 5, maskClues: true, maxAttempts: CROSSWORD_DEFAULT_ATTEMPTS, timeBudgetMs: null });
    expect([...o.scripts]).toEqual(["hangul", "latin", "digit"]);
  });

  it("cap the word length at the grid size", () => {
    expect(resolveOptions({ seed: 1, gridSize: 8, maxWordLen: 15 }).maxWordLen).toBe(8);
  });

  it("refuse values the generator cannot honour", () => {
    const bad: Partial<Parameters<typeof resolveOptions>[0]>[] = [
      { gridSize: CROSSWORD_MIN_GRID - 1 },
      { gridSize: CROSSWORD_MAX_GRID + 1 },
      { gridSize: 10.5 },
      { seed: -1 },
      { seed: 2 ** 32 },
      { seed: 1.5 },
      { maxWords: 0 },
      { maxWords: CROSSWORD_MAX_WORDS + 1 },
      { maxAttempts: 0 },
      { maxAttempts: CROSSWORD_MAX_ATTEMPTS + 1 },
      { scripts: [] },
      { minWordLen: 0 },
      { maxSingleWords: CROSSWORD_MAX_SINGLE_WORDS + 1 },
    ];
    for (const b of bad) expect(() => resolveOptions({ seed: 1, gridSize: 10, ...b }), JSON.stringify(b)).toThrow(RangeError);
    expect(() => resolveOptions({ seed: 0xffffffff, gridSize: CROSSWORD_MAX_GRID })).not.toThrow();
    expect(() => resolveOptions({ seed: 0, gridSize: CROSSWORD_MIN_GRID })).not.toThrow();
  });
});

describe("M2-2.1 choosing the words", () => {
  it("gives every unusable entry a reason", () => {
    const { multi, singles, excluded } = select(
      [entry("a", "사과"), entry("b", ""), entry("c", "😀😀"), entry("d", "사과"), entry("e", "도서관"), entry("f", "물"), entry("g", "수박")],
      { excludedIds: new Set(["g"]) },
    );
    expect(multi.map((w) => w.entryId)).toEqual(["a", "e"]);
    expect(singles.map((w) => w.entryId)).toEqual(["f"]);
    expect(excluded).toEqual([
      { entryId: "b", reason: "EMPTY_ANSWER" },
      { entryId: "c", reason: "INVALID_CHARACTERS", detail: "😀" },
      { entryId: "d", reason: "DUPLICATE_ANSWER" },
      { entryId: "g", reason: "EXCLUDED_BY_TEACHER" },
    ]);
  });

  it("allows one-character words by default (decision C1) and refuses them when the minimum is raised", () => {
    expect(select([entry("a", "물")]).singles).toHaveLength(1);
    const raised = select([entry("a", "물")], { minWordLen: 2 });
    expect(raised.singles).toHaveLength(0);
    expect(raised.excluded).toEqual([{ entryId: "a", reason: "TOO_SHORT" }]);
  });

  it("applies the length limits at their boundaries (and caps them at the grid size)", () => {
    const len = (n: number) => "가".repeat(n);
    const at = select([entry("ok", len(10))], { gridSize: 10 });
    expect(at.multi).toHaveLength(1);
    const over = select([entry("over", len(11))], { gridSize: 10 });
    expect(over.excluded).toEqual([{ entryId: "over", reason: "TOO_LONG" }]);
    const limited = select([entry("a", len(5)), entry("b", len(6))], { maxWordLen: 5 });
    expect(limited.multi.map((w) => w.entryId)).toEqual(["a"]);
    expect(limited.excluded).toEqual([{ entryId: "b", reason: "TOO_LONG" }]);
    const max = select([entry("m", len(CROSSWORD_MAX_WORD_LEN))], { gridSize: CROSSWORD_MAX_GRID });
    expect(max.multi).toHaveLength(1);
  });

  it("switches scripts on and off per puzzle (a mixed answer needs all its scripts)", () => {
    const entries = [entry("h", "사과"), entry("l", "APPLE"), entry("d", "2024"), entry("m", "3D프린터")];
    expect(select(entries).multi).toHaveLength(4);
    const hangulOnly = select(entries, { scripts: ["hangul"] });
    expect(hangulOnly.multi.map((w) => w.entryId)).toEqual(["h"]);
    expect(hangulOnly.excluded.map((e) => [e.entryId, e.reason])).toEqual([
      ["d", "SCRIPT_NOT_ALLOWED"],
      ["l", "SCRIPT_NOT_ALLOWED"],
      ["m", "SCRIPT_NOT_ALLOWED"],
    ]);
    const noDigits = select(entries, { scripts: ["hangul", "latin"] });
    expect(noDigits.multi.map((w) => w.entryId)).toEqual(["h", "l"]);
  });

  it("does not depend on the order of the input", () => {
    const entries = ["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관"].map((w, i) => entry(`e${i}`, w));
    const a = select(entries);
    const b = select([...entries].reverse());
    expect(b.multi.map((w) => w.entryId)).toEqual(a.multi.map((w) => w.entryId));
  });

  it("keeps pinned words when there are too many, and reports the rest as not selected", () => {
    const words = ["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관", "관심", "심장"];
    const entries = words.map((w, i) => entry(`e${i}`, w));
    const r = select(entries, { maxWords: 5, pinnedIds: new Set(["e9"]) });
    expect(r.multi).toHaveLength(5);
    expect(r.multi.map((w) => w.entryId)).toContain("e9");
    expect(r.notSelected).toHaveLength(5);
    expect(new Set([...r.multi.map((w) => w.entryId), ...r.notSelected.map((w) => w.entryId)]).size).toBe(10);
  });

  it("limits one-character words", () => {
    const singles = Array.from({ length: CROSSWORD_MAX_SINGLE_WORDS + 3 }, (_, i) => entry(`s${i}`, String.fromCharCode(0xac00 + i)));
    const r = select(singles);
    expect(r.singles).toHaveLength(CROSSWORD_MAX_SINGLE_WORDS);
    expect(r.notSelected).toHaveLength(3);
  });
});

describe("M2-2.1 clue masking", () => {
  it("replaces the answer in the clue with one ○ per cell, ignoring ASCII case", () => {
    expect(maskClue("빨간 사과 한 개", "사과")).toEqual({ clue: "빨간 ○○ 한 개", masked: true });
    expect(maskClue("Ice cream is cold", "ICE CREAM".replace(" ", ""))).toEqual({ clue: "Ice cream is cold", masked: false });
    expect(maskClue("An Apple a day, apple pie", "APPLE")).toEqual({ clue: "An ○○○○○ a day, ○○○○○ pie", masked: true });
  });

  it("leaves clues without the answer, and one-character answers, alone", () => {
    expect(maskClue("과일의 한 종류", "사과")).toEqual({ clue: "과일의 한 종류", masked: false });
    expect(maskClue("마시는 물", "물")).toEqual({ clue: "마시는 물", masked: false });
  });
});
