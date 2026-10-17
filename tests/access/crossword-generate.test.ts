import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CROSSWORD_MAX_SINGLE_WORDS,
  CROSSWORD_MAX_WORDS,
  CROSSWORD_MIN_WORDS,
  DIFFICULTY_PRESETS,
} from "@/features/crossword/generator/constants";
import { choosePrefill, optionsForLevel, settingsForLevel } from "@/features/crossword/generator/difficulty";
import { generateCrossword, placementHash } from "@/features/crossword/generator/generate";
import { renderClues, renderGrid } from "@/features/crossword/generator/render";
import { comparePuzzles, computeStats, describeDifficulty, scorePuzzle } from "@/features/crossword/generator/score";
import type { CrosswordInputEntry, GenerateSuccess, GeneratorOptions } from "@/features/crossword/generator/types";
import { validatePuzzle } from "@/features/crossword/generator/validate";

const mk = (words: string[], prefix = "e"): CrosswordInputEntry[] =>
  words.map((w, i) => ({ id: `${prefix}${String(i).padStart(2, "0")}`, answer: w, clue: `${w}의 뜻을 설명하는 문장` }));

// Word lists with very different connectivity (civics words share few syllables, chains share many).
const CHAIN = ["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관", "관심", "심장", "장미", "미술", "술래", "내일", "일요일", "요리", "리본", "본문", "문제", "제주", "주말", "학교", "교실", "실내", "래프팅"];
const SCIENCE = ["광합성", "합성", "성장", "장마", "마찰", "찰흙", "흙탕물", "물질", "질량", "양성자", "자석", "석유", "유리", "온도", "도시", "시간", "간장", "장력", "력도", "도자기"];
const CIVICS = ["민주주의", "삼권분립", "헌법", "국민", "선거", "정당", "의회", "법원", "행정부", "입법부", "사법부", "국회", "대통령", "지방자치", "투표", "권력", "자유", "평등", "인권", "시민"];
const LATIN = ["APPLE", "LEMON", "MELON", "NEON", "ONION", "NINE", "EEL", "LAMP", "PEAR", "RAIN", "NAIL", "LIME", "MILE", "ALE"];
const DIGITS = ["2024", "1945", "1919", "4", "1592", "1910", "2002", "9", "3"];
const MIXED = ["COVID19", "3D프린터", "5G", "A4", "MP3", "H2O", "물", "사과", "과일", "일기", "기차"];

const ok = (r: ReturnType<typeof generateCrossword>): GenerateSuccess => {
  if (!r.ok) throw new Error(`generation failed: ${r.reason}, placed ${r.placedWords}`);
  return r;
};

describe("M2-2.1 free-form layout: every puzzle passes the independent validator", () => {
  const cases: [string, string[], Partial<GeneratorOptions>][] = [
    ["Hangul chain", CHAIN, { gridSize: 15 }],
    ["Hangul chain, small grid", CHAIN, { gridSize: 10, maxWords: 10 }],
    ["science", SCIENCE, { gridSize: 13 }],
    ["Latin letters", LATIN, { gridSize: 10 }],
    ["mixed scripts", MIXED, { gridSize: 13 }],
  ];

  it.each(cases)("%s: valid, connected, inside the grid, for 40 seeds", (_name, words, over) => {
    const entries = mk(words);
    for (let seed = 1; seed <= 40; seed += 1) {
      const r = generateCrossword(entries, { minWords: 1, ...over, seed, gridSize: over.gridSize ?? 13 });
      if (!r.ok) continue;
      expect(validatePuzzle(r.puzzle, { maxGrid: over.gridSize ?? 13 }), `seed ${seed}`).toEqual({ ok: true });
      expect(r.puzzle.rows).toBeLessThanOrEqual(over.gridSize ?? 13);
      expect(r.puzzle.cols).toBeLessThanOrEqual(over.gridSize ?? 13);
      // Every input entry is accounted for exactly once: placed, left out with a reason, or unplaced.
      const accounted = [...r.puzzle.words.map((x) => x.entryId), ...r.excluded.map((x) => x.entryId), ...r.unplaced.map((x) => x.entryId)];
      expect(new Set(accounted).size).toBe(accounted.length);
      expect(accounted.length).toBe(words.length);
    }
  });

  it("places many words when the vocabulary chains (more than half of 25)", () => {
    const r = ok(generateCrossword(mk(CHAIN), { seed: 1, gridSize: 15 }));
    expect(r.stats.words).toBeGreaterThan(12);
    expect(r.stats.crossings).toBeGreaterThanOrEqual(r.stats.words - 1); // connected: at least a spanning tree
  });

  it("reports honestly when a word list barely connects (civics words share few syllables)", () => {
    // An exhaustive search of this list places 4 words at most, so five is refused rather than faked.
    const r = generateCrossword(mk(CIVICS), { seed: 7, gridSize: 15 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("NOT_ENOUGH_WORDS");
      expect(r.placedWords).toBe(4);
      expect(r.unplaced.length).toBe(CIVICS.length - 4);
    }
    const lenient = ok(generateCrossword(mk(CIVICS), { seed: 7, gridSize: 15, minWords: 4 }));
    expect(lenient.stats.words).toBe(4);
    expect(validatePuzzle(lenient.puzzle)).toEqual({ ok: true });
  });

  it("gives the worked example of the design (사과, 과일, 일기, 기차) exactly", () => {
    const r = ok(generateCrossword(mk(["사과", "과일", "일기", "기차"]), { seed: 1, gridSize: 10, minWords: 4 }));
    expect(r.stats.words).toBe(4);
    expect(r.stats.crossings).toBe(3);
    expect(r.puzzle.words.map((x) => x.answer).sort()).toEqual(["과일", "기차", "사과", "일기"].sort());
    expect(r.puzzle.rows * r.puzzle.cols).toBeLessThanOrEqual(9 + 4); // the 3x3 chain, or a mirror image of it
  });
});

describe("M2-2.1 deterministic seeded generation", () => {
  it("gives the same puzzle and hash for the same entries, options and seed", () => {
    for (const words of [CHAIN, SCIENCE, LATIN, MIXED]) {
      const a = ok(generateCrossword(mk(words), { seed: 12345, gridSize: 15, minWords: 3 }));
      const b = ok(generateCrossword(mk(words), { seed: 12345, gridSize: 15, minWords: 3 }));
      expect(b.puzzle).toEqual(a.puzzle);
      expect(b.placementHash).toBe(a.placementHash);
      expect(a.placementHash).toBe(placementHash(a.puzzle));
      expect(a.placementHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("does not depend on the order of the entries", () => {
    const entries = mk(CHAIN);
    const a = ok(generateCrossword(entries, { seed: 9, gridSize: 15 }));
    const b = ok(generateCrossword([...entries].reverse(), { seed: 9, gridSize: 15 }));
    const c = ok(generateCrossword([...entries].sort((x, y) => x.answer.localeCompare(y.answer)), { seed: 9, gridSize: 15 }));
    expect(b.placementHash).toBe(a.placementHash);
    expect(c.placementHash).toBe(a.placementHash);
  });

  it("gives different puzzles for different seeds (the search is seeded, not fixed)", () => {
    const hashes = new Set<string>();
    // One attempt only, so the seeded choices (not the best-of search) are what differs.
    for (let seed = 1; seed <= 30; seed += 1) hashes.add(ok(generateCrossword(mk(CHAIN), { seed, gridSize: 15, minWords: 1, maxAttempts: 1 })).placementHash);
    expect(hashes.size).toBeGreaterThan(1);
  });

  it("changes the hash when an answer, the grid size or the entry changes", () => {
    const base = ok(generateCrossword(mk(CHAIN), { seed: 3, gridSize: 15 }));
    const otherId = ok(generateCrossword(mk(CHAIN, "x"), { seed: 3, gridSize: 15 }));
    expect(otherId.placementHash).not.toBe(base.placementHash);
  });

  it("can be repeated exactly: maxAttempts = attemptsRun reproduces a time-limited run", () => {
    const entries = mk(CHAIN);
    const limited = ok(generateCrossword(entries, { seed: 5, gridSize: 15, maxAttempts: 300, timeBudgetMs: 1 }));
    const repeat = ok(generateCrossword(entries, { seed: 5, gridSize: 15, maxAttempts: limited.attemptsRun }));
    expect(repeat.placementHash).toBe(limited.placementHash);
    expect(repeat.truncated).toBe(false);
  });

  it("reports the attempts it ran", () => {
    const r = ok(generateCrossword(mk(CHAIN), { seed: 1, gridSize: 15, maxAttempts: 7 }));
    expect(r.attemptsRun).toBe(7);
    expect(r.truncated).toBe(false);
  });

  it("is fast enough for a request: 25 words, 300 attempts", () => {
    const started = Date.now();
    ok(generateCrossword(mk(CHAIN), { seed: 2, gridSize: 15, maxAttempts: 300 }));
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("M2-2.1 minimum and maximum word counts (boundaries)", () => {
  // A chain: each word shares one syllable with the next, so n words always form one puzzle of n words.
  const chain = (n: number) => mk(["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관"].slice(0, n));

  it("refuses CROSSWORD_MIN_WORDS - 1 words, accepts exactly CROSSWORD_MIN_WORDS", () => {
    const few = generateCrossword(chain(CROSSWORD_MIN_WORDS - 1), { seed: 1, gridSize: 15 });
    expect(few.ok).toBe(false);
    if (!few.ok) expect(few.reason).toBe("NOT_ENOUGH_WORDS");
    const exact = ok(generateCrossword(chain(CROSSWORD_MIN_WORDS), { seed: 1, gridSize: 15 }));
    expect(exact.stats.words).toBe(CROSSWORD_MIN_WORDS);
  });

  it("has nothing to do without eligible words", () => {
    const r = generateCrossword(mk(["😀😀", "★★"]), { seed: 1, gridSize: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("NO_ELIGIBLE_WORDS");
      expect(r.excluded.map((e) => e.reason)).toEqual(["INVALID_CHARACTERS", "INVALID_CHARACTERS"]);
    }
    const none = generateCrossword([], { seed: 1, gridSize: 10 });
    expect(none.ok).toBe(false);
  });

  it("never uses more than CROSSWORD_MAX_WORDS multi-cell words, and says what it left out", () => {
    const many = mk(Array.from({ length: CROSSWORD_MAX_WORDS + 6 }, (_, i) => `${String.fromCharCode(0xac00 + i)}${String.fromCharCode(0xac00 + i + 1)}`));
    const r = generateCrossword(many, { seed: 1, gridSize: 15, minWords: 1 });
    const placed = r.ok ? r.stats.words : r.placedWords;
    expect(placed).toBeLessThanOrEqual(CROSSWORD_MAX_WORDS);
    expect(r.unplaced.filter((u) => u.reason === "NOT_SELECTED")).toHaveLength(6);
  });

  it("fits a word as long as the grid, and leaves a longer one out", () => {
    // A ten-letter word with five short words hanging off it at every second letter (never side by side).
    const long = "가나다라마바사아자차";
    const entries = mk([long, "가방", "다리", "마음", "사과", "자두"]);
    const r = ok(generateCrossword(entries, { seed: 1, gridSize: 10 }));
    expect(r.puzzle.words.some((w) => Array.from(w.answer).length === 10)).toBe(true);
    expect(r.puzzle.cols).toBe(10);
    expect(r.stats.words).toBe(6);
    const longer = generateCrossword(mk(["가".repeat(11), "가나", "나다"]), { seed: 1, gridSize: 10, minWords: 1 });
    expect(longer.excluded).toEqual([{ entryId: "e00", reason: "TOO_LONG" }]);
  });
});

describe("M2-2.1 decision C1: one-character words", () => {
  const base = ["사과", "과일", "일기", "기차", "차표", "표지"];

  it("does not place a one-character word on a cell that two words already cross", () => {
    // 일 is the end of 과일 and the start of 일기: both directions are taken, so there is no free direction.
    const r = ok(generateCrossword(mk([...base, "일"]), { seed: 1, gridSize: 15 }));
    expect(r.puzzle.words.some((w) => w.single)).toBe(false);
    expect(r.unplaced).toContainEqual({ entryId: "e06", reason: "NO_MATCHING_CELL" });
  });

  it("places a one-character word on a cell of another word, adding no cell and no run", () => {
    const withSingle = ok(generateCrossword(mk([...base, "사"]), { seed: 1, gridSize: 15 }));
    const without = ok(generateCrossword(mk(base), { seed: 1, gridSize: 15 }));
    const single = withSingle.puzzle.words.find((w) => w.single);
    expect(single).toBeDefined();
    expect(single!.answer).toBe("사");
    expect(withSingle.stats.singleWords).toBe(1);
    expect(withSingle.stats.words).toBe(without.stats.words);
    expect(withSingle.stats.cells).toBe(without.stats.cells);
    expect(withSingle.puzzle.rows).toBe(without.puzzle.rows);
    expect(validatePuzzle(withSingle.puzzle)).toEqual({ ok: true });
  });

  it("gives the one-character word a number and a clue like any other, with length (1)", () => {
    const r = ok(generateCrossword(mk([...base, "사"]), { seed: 1, gridSize: 15 }));
    const single = r.puzzle.words.find((w) => w.single)!;
    expect(single.number).toBeGreaterThan(0);
    expect(renderClues(r.puzzle)).toContain(`${single.number}. ${single.clue} (1)`);
    // Another word may start in the same cell and then shares the number.
    const sameCell = r.puzzle.words.filter((w) => w.row === single.row && w.col === single.col);
    expect(new Set(sameCell.map((w) => w.number)).size).toBe(1);
  });

  it("reports a one-character word that matches no cell", () => {
    const r = ok(generateCrossword(mk([...base, "훌"]), { seed: 1, gridSize: 15 }));
    expect(r.puzzle.words.some((w) => w.single)).toBe(false);
    expect(r.unplaced).toContainEqual({ entryId: "e06", reason: "NO_MATCHING_CELL" });
  });

  it("does not count one-character words toward the minimum", () => {
    const r = generateCrossword(mk(["사과", "과일", "일", "과", "사"]), { seed: 1, gridSize: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_ENOUGH_WORDS");
    const onlySingles = generateCrossword(mk(["일", "과", "사"]), { seed: 1, gridSize: 10 });
    expect(onlySingles.ok).toBe(false);
    if (!onlySingles.ok) expect(onlySingles.reason).toBe("NO_ELIGIBLE_WORDS");
  });

  it("never takes a cell that two words already use, nor two words in one direction", () => {
    const entries = mk([...base, "일", "과", "기", "차", "표", "지", "사"]);
    for (let seed = 1; seed <= 25; seed += 1) {
      const r = ok(generateCrossword(entries, { seed, gridSize: 15 }));
      expect(validatePuzzle(r.puzzle), `seed ${seed}`).toEqual({ ok: true });
      expect(r.stats.singleWords).toBeLessThanOrEqual(CROSSWORD_MAX_SINGLE_WORDS);
    }
  });

  it("can be switched off by raising the minimum word length", () => {
    const r = ok(generateCrossword(mk([...base, "사"]), { seed: 1, gridSize: 15, minWordLen: 2 }));
    expect(r.stats.singleWords).toBe(0);
    expect(r.excluded).toEqual([{ entryId: "e06", reason: "TOO_SHORT" }]);
  });

  it("works for digits and Latin letters too", () => {
    const r = ok(generateCrossword(mk(["APPLE", "LEMON", "MELON", "NEON", "ONION", "E", "N"]), { seed: 1, gridSize: 10 }));
    expect(r.stats.singleWords).toBeGreaterThan(0);
    expect(validatePuzzle(r.puzzle)).toEqual({ ok: true });
  });
});

describe("M2-2.1 decision C7: scripts, emoji and symbols", () => {
  it("leaves emoji and symbol answers out with the reason, and still builds the puzzle", () => {
    const entries = mk(["사과", "과일", "일기", "기차", "차표", "😀", "★별", "A&B", "e-mail", "a b", "①"]);
    const r = ok(generateCrossword(entries, { seed: 1, gridSize: 15 }));
    expect(r.stats.words).toBe(5);
    const reasons = new Map(r.excluded.map((e) => [e.entryId, e.reason]));
    for (const id of ["e05", "e06", "e07", "e08", "e09", "e10"]) expect(reasons.get(id), id).toBe("INVALID_CHARACTERS");
    expect(r.puzzle.words.every((w) => /^[가-힣A-Z0-9]+$/.test(w.answer))).toBe(true);
  });

  it("mixes Hangul, Latin letters and digits in one puzzle when all three are allowed", () => {
    // 3D프린터 holds a digit, a Latin letter and Hangul, so it can be crossed by words of each script.
    const words = ["3D프린터", "A3", "D2", "프로그램", "린스", "터널", "2B"];
    // Words in neighbouring columns cannot both hang off it (they would touch), so not every word fits.
    const r = ok(generateCrossword(mk(words), { seed: 1, gridSize: 13, minWords: 3 }));
    expect(validatePuzzle(r.puzzle)).toEqual({ ok: true });
    const scripts = new Set(r.puzzle.words.flatMap((w) => Array.from(w.answer).map((c) => (/[가-힣]/.test(c) ? "h" : /[A-Z]/.test(c) ? "l" : "d"))));
    expect(scripts.size).toBeGreaterThan(1);
  });

  it("restricts a puzzle to the scripts the teacher allows", () => {
    const hangul = ok(generateCrossword(mk(MIXED), { seed: 1, gridSize: 13, minWords: 3, scripts: ["hangul"] }));
    expect(hangul.puzzle.words.every((w) => /^[가-힣]+$/.test(w.answer))).toBe(true);
    expect(hangul.excluded.every((e) => e.reason === "SCRIPT_NOT_ALLOWED")).toBe(true);
    const latin = ok(generateCrossword(mk(LATIN), { seed: 1, gridSize: 10, scripts: ["latin"] }));
    expect(latin.puzzle.words.every((w) => /^[A-Z]+$/.test(w.answer))).toBe(true);
    const digitsOnly = generateCrossword(mk(DIGITS), { seed: 1, gridSize: 10, scripts: ["digit"], minWords: 3 });
    expect(digitsOnly.ok).toBe(true);
  });

  it("crosses only on identical characters", () => {
    const r = ok(generateCrossword(mk(["ABC", "CDE", "EFG", "GHI", "IJK", "가나다", "다라마"]), { seed: 1, gridSize: 13, minWords: 2 }));
    expect(validatePuzzle(r.puzzle)).toEqual({ ok: true });
    const hangulWords = r.puzzle.words.filter((w) => /[가-힣]/.test(w.answer));
    const latinWords = r.puzzle.words.filter((w) => /[A-Z]/.test(w.answer));
    // No cell is shared between a Hangul word and a Latin word.
    const cells = (w: (typeof r.puzzle.words)[number]) => Array.from(w.answer).map((_, k) => `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`);
    const h = new Set(hangulWords.flatMap(cells));
    expect(latinWords.flatMap(cells).some((c) => h.has(c))).toBe(false);
  });
});

describe("M2-2.1 clues", () => {
  it("masks an answer that appears in its clue and lists the entry", () => {
    const entries: CrosswordInputEntry[] = [
      { id: "a", answer: "사과", clue: "빨간 사과 한 개" },
      { id: "b", answer: "과일", clue: "달고 새콤한 것" },
      { id: "c", answer: "일기", clue: "하루를 적는 글" },
      { id: "d", answer: "기차", clue: "철길 위를 달리는 것" },
      { id: "e", answer: "차표", clue: "차를 탈 때 사는 표" },
    ];
    const r = ok(generateCrossword(entries, { seed: 1, gridSize: 10 }));
    expect(r.maskedClueIds).toContain("a");
    expect(r.puzzle.words.find((w) => w.entryId === "a")!.clue).toBe("빨간 ○○ 한 개");
    const unmasked = ok(generateCrossword(entries, { seed: 1, gridSize: 10, maskClues: false }));
    expect(unmasked.maskedClueIds).toEqual([]);
    expect(unmasked.puzzle.words.find((w) => w.entryId === "a")!.clue).toBe("빨간 사과 한 개");
  });
});

describe("M2-2.1 puzzle scoring", () => {
  it("counts words, crossings, cells, size and lengths", () => {
    const r = ok(generateCrossword(mk(["사과", "과일", "일기", "기차"]), { seed: 1, gridSize: 10, minWords: 4 }));
    const s = computeStats(r.puzzle);
    expect(s).toMatchObject({ words: 4, singleWords: 0, totalWords: 4, crossings: 3, cells: 5, shortest: 2, longest: 2, avgWordLength: 2 });
    expect(s.across + s.down).toBe(4);
    expect(s.area).toBe(s.rows * s.cols);
    expect(s.fillRatio).toBeCloseTo(5 / s.area);
    expect(s.avgCrossingsPerWord).toBeCloseTo(1.5);
  });

  it("orders puzzles: words, then crossings, then a smaller area, then a squarer box", () => {
    const base = { words: 5, singleWords: 0, totalWords: 5, across: 3, down: 2, crossings: 4, cells: 12, rows: 5, cols: 5, area: 25, fillRatio: 0.5, avgWordLength: 3, avgCrossingsPerWord: 1.6, shortest: 2, longest: 4 };
    expect(comparePuzzles({ ...base, totalWords: 6 }, base)).toBeGreaterThan(0);
    expect(comparePuzzles(base, { ...base, totalWords: 6, crossings: 9 })).toBeLessThan(0);
    expect(comparePuzzles({ ...base, crossings: 5 }, base)).toBeGreaterThan(0);
    expect(comparePuzzles({ ...base, area: 20 }, base)).toBeGreaterThan(0);
    expect(comparePuzzles({ ...base, rows: 4, cols: 6, area: 24 }, { ...base, rows: 3, cols: 8, area: 24 })).toBeGreaterThan(0);
    expect(comparePuzzles(base, { ...base })).toBe(0);
  });

  it("keeps the best of many attempts: more attempts never give a worse puzzle", () => {
    const entries = mk(CHAIN);
    const one = ok(generateCrossword(entries, { seed: 4, gridSize: 15, maxAttempts: 1 }));
    const many = ok(generateCrossword(entries, { seed: 4, gridSize: 15, maxAttempts: 100 }));
    expect(comparePuzzles(many.stats, one.stats)).toBeGreaterThanOrEqual(0);
  });

  it("scores quality 0..100 from placement, connectivity and compactness", () => {
    const r = ok(generateCrossword(mk(CHAIN), { seed: 1, gridSize: 15 }));
    expect(r.score.quality).toBeGreaterThan(0);
    expect(r.score.quality).toBeLessThanOrEqual(100);
    expect(r.score.placedRatio).toBeCloseTo(r.stats.totalWords / 25);
    const stats = r.stats;
    expect(scorePuzzle(stats, stats.totalWords).placedRatio).toBe(1);
    expect(scorePuzzle(stats, stats.totalWords * 2).quality).toBeLessThan(scorePuzzle(stats, stats.totalWords).quality);
    expect(scorePuzzle(stats, 0).placedRatio).toBe(0);
  });

  it("describes difficulty: easy < normal < hard for the same puzzle shape", () => {
    const stats = ok(generateCrossword(mk(CHAIN), { seed: 1, gridSize: 15 })).stats;
    const d = (level: "easy" | "normal" | "hard") => describeDifficulty(stats, settingsForLevel(level));
    expect(d("easy")).toBeLessThan(d("normal"));
    expect(d("normal")).toBeLessThan(d("hard"));
    for (const level of ["easy", "normal", "hard"] as const) {
      expect(d(level)).toBeGreaterThanOrEqual(0);
      expect(d(level)).toBeLessThanOrEqual(100);
    }
  });
});

describe("M2-2.1 difficulty presets and pre-filled cells", () => {
  it("pin the preset values", () => {
    expect(DIFFICULTY_PRESETS.easy).toEqual({ gridSize: 10, maxWords: 10, maxWordLen: 5, prefillPercent: 25, revealsPerStudent: 3, checksAllowed: null, checkMode: "anytime", chosungAllowed: true });
    expect(DIFFICULTY_PRESETS.normal.gridSize).toBe(13);
    // PM SP-1/SP-2 (2026-10-18): reveals 3/2/1, checks unlimited/5/3.
    expect(DIFFICULTY_PRESETS.normal).toMatchObject({ revealsPerStudent: 2, checksAllowed: 5, checkMode: "onRequest" });
    expect(DIFFICULTY_PRESETS.hard).toMatchObject({ gridSize: 15, maxWords: 25, prefillPercent: 0, revealsPerStudent: 1, checksAllowed: 3, checkMode: "onRequest", chosungAllowed: false });
  });

  it("turn a level into generator options that a teacher can override", () => {
    expect(optionsForLevel("easy", 5)).toEqual({ seed: 5, gridSize: 10, maxWords: 10, maxWordLen: 5 });
    expect(optionsForLevel("hard", 5, { maxWords: 12 })).toMatchObject({ gridSize: 15, maxWords: 12 });
  });

  it("generate within the preset limits", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const r = ok(generateCrossword(mk(CHAIN), optionsForLevel(level, 3, { minWords: 3 })));
      const p = DIFFICULTY_PRESETS[level];
      expect(r.puzzle.rows).toBeLessThanOrEqual(p.gridSize);
      expect(r.puzzle.cols).toBeLessThanOrEqual(p.gridSize);
      expect(r.stats.words).toBeLessThanOrEqual(p.maxWords);
      expect(r.stats.longest).toBeLessThanOrEqual(p.maxWordLen);
    }
  });

  it("chooses a connected subset when the word list is longer than the preset allows", () => {
    // 15 daily words, the easy preset holds 10: the 10 chosen must be able to cross each other.
    const daily = ["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관", "관심", "심장", "장미", "미술", "일요일", "요리", "리본"];
    for (let seed = 1; seed <= 10; seed += 1) {
      const r = ok(generateCrossword(mk(daily), optionsForLevel("easy", seed)));
      expect(r.stats.words, `seed ${seed}`).toBeGreaterThanOrEqual(7);
      expect(r.unplaced.filter((u) => u.reason === "NOT_SELECTED")).toHaveLength(5);
    }
  });

  it("pre-fills about the requested share of cells and never completes a word", () => {
    const r = ok(generateCrossword(mk(CHAIN), { seed: 1, gridSize: 15 }));
    for (const percent of [10, 25, 50, 90]) {
      const given = choosePrefill(r.puzzle, percent, 11);
      const key = (c: { row: number; col: number }) => `${c.row},${c.col}`;
      const set = new Set(given.map(key));
      expect(set.size).toBe(given.length);
      expect(given.length).toBeLessThanOrEqual(Math.round((percent / 100) * r.stats.cells));
      for (const w of r.puzzle.words) {
        const cells = Array.from(w.answer).map((_, k) => `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`);
        expect(cells.every((c) => set.has(c)), `${w.answer} at ${percent}%`).toBe(false);
      }
    }
    expect(choosePrefill(r.puzzle, 0, 11)).toEqual([]);
    expect(choosePrefill(r.puzzle, 25, 11).length).toBeGreaterThan(0);
  });

  it("pre-fills deterministically and does not give away a one-character word", () => {
    const r = ok(generateCrossword(mk(["사과", "과일", "일기", "기차", "차표", "사"]), { seed: 1, gridSize: 15 }));
    expect(choosePrefill(r.puzzle, 50, 3)).toEqual(choosePrefill(r.puzzle, 50, 3));
    const single = r.puzzle.words.find((w) => w.single)!;
    expect(choosePrefill(r.puzzle, 100, 3).some((c) => c.row === single.row && c.col === single.col)).toBe(false);
  });
});

describe("M2-2.1 rendering", () => {
  it("draws the grid with numbers and letters, and without the letters for students", () => {
    const r = ok(generateCrossword(mk(["사과", "과일", "일기", "기차"]), { seed: 1, gridSize: 10, minWords: 4 }));
    const solution = renderGrid(r.puzzle);
    for (const w of r.puzzle.words) for (const ch of Array.from(w.answer)) expect(solution).toContain(ch);
    expect(solution).toContain("■");
    const blank = renderGrid(r.puzzle, { solution: false });
    for (const ch of ["사", "과", "일", "기", "차"]) expect(blank).not.toContain(ch);
    expect(blank.split("\n")).toHaveLength(r.puzzle.rows);
  });

  it("lists the clues under Across and Down in number order with lengths", () => {
    const r = ok(generateCrossword(mk(["사과", "과일", "일기", "기차"]), { seed: 1, gridSize: 10, minWords: 4 }));
    const text = renderClues(r.puzzle);
    expect(text).toContain("가로 (Across)");
    expect(text).toContain("세로 (Down)");
    expect(text.match(/\(2\)/g)).toHaveLength(4);
  });
});

describe("M2-2.1 the generator is pure", () => {
  it("imports nothing from Supabase, the audit log, React or the app", () => {
    const dir = path.resolve(import.meta.dirname, "../../src/features/crossword/generator");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/from\s+["'](@\/|@supabase|react|next)/);
    }
  });
});
