import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DIFFICULTY_PRESETS } from "@/features/crossword/generator/constants";
import { chosungOf } from "@/features/crossword/play/chosung";
import {
  allCells,
  allFilled,
  cellKey,
  filledCount,
  firstOpenCell,
  isCellKey,
  isLoneJamo,
  isValidCellChar,
  moveSelection,
  normalizeTyped,
  parseCellKey,
  selectCell,
  stepClue,
  wordCells,
  wordForSelection,
  wordsAt,
} from "@/features/crossword/play/cells";
import * as constants from "@/features/crossword/play/constants";
import {
  PLAY_ERROR_MESSAGES,
  PLAY_TEXT,
  playErrorCode,
  playMessage,
  toolsSummary,
} from "@/features/crossword/play/messages";
import { PLAY_ERROR_CODES, type PlayWord } from "@/features/crossword/play/types";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/20261019000003_fn_crossword_play.sql"), "utf8");

// The worked example of doc 04 §2.7 plus 차례: 3 x 4, six distinct cells.
const W = (number: number, direction: "across" | "down", row: number, col: number, length: number, single = false): PlayWord => ({
  number, direction, row, col, length, single, clue: `단서 ${number}`,
});
const WORDS: PlayWord[] = [
  W(1, "across", 0, 0, 2),
  W(2, "down", 0, 1, 2),
  W(3, "across", 1, 1, 2),
  W(4, "down", 1, 2, 2),
  W(5, "across", 2, 2, 2),
];

describe("play constants are pinned to the database functions", () => {
  it("matches the limits written in migration 20261019000003", () => {
    expect(constants.PLAY_SAVE_GRACE_S).toBe(120);
    expect(sql).toContain("interval '120 seconds'");
    expect(constants.PLAY_MAX_PATCH_CELLS).toBe(225);
    expect(sql).toContain("> 225");
    expect(constants.PLAY_ACTIVE_MS_MAX_PER_SAVE).toBe(30000);
    expect(sql).toContain("30000::bigint");
    expect(constants.PLAY_CHECKS_PER_MINUTE).toBe(60);
    expect(sql).toContain("interval '60 seconds'");
    expect(sql).toContain("v_count > 60");
    expect(constants.PLAY_SUBMIT_COOLDOWN_S).toBe(30);
    expect(sql).toContain("interval '30 seconds'");
    expect(constants.PLAY_SUBMIT_COOLDOWN_AFTER_WRONG).toBe(3);
    expect(sql).toContain("r.submits_used >= 3");
    expect(constants.PLAY_MAX_EVENT_WORDS).toBe(2);
  });

  it("the default allowances equal the generator presets (PM SP-1/SP-2)", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      expect(constants.PLAY_DEFAULT_ALLOWANCES[level].reveals).toBe(DIFFICULTY_PRESETS[level].revealsPerStudent);
      expect(constants.PLAY_DEFAULT_ALLOWANCES[level].checks).toBe(DIFFICULTY_PRESETS[level].checksAllowed);
    }
    expect(constants.PLAY_DEFAULT_ALLOWANCES).toEqual({
      easy: { reveals: 3, checks: null },
      normal: { reveals: 2, checks: 5 },
      hard: { reveals: 1, checks: 3 },
    });
  });

  it("the save debounce is the two seconds of the plan", () => {
    expect(constants.PLAY_SAVE_DEBOUNCE_MS).toBe(2000);
  });
});

describe("chosung (same rule as fn_crossword_chosung)", () => {
  // The same list is asserted in supabase/tests/00013_crossword_play.test.sql.
  const GOLDEN: [string, string | null][] = [
    ["사과", "ㅅㄱ"],
    ["까치", "ㄲㅊ"],
    ["쌍둥이", "ㅆㄷㅇ"],
    ["빵", "ㅃ"],
    ["쫓다", "ㅉㄷ"],
    ["닭고기", "ㄷㄱㄱ"],
    ["대한민국", "ㄷㅎㅁㄱ"],
    ["뜨개질", "ㄸㄱㅈ"],
    ["ABC", "A"],
    ["A1", null],
    ["2024", null],
    ["3D프린터", null],
    ["", null],
  ];
  it.each(GOLDEN)("%s -> %s", (answer, expected) => {
    expect(chosungOf(answer)).toBe(expected);
  });

  it("covers every Hangul syllable: the initial of any block is one of the 19 consonants", () => {
    const initials = new Set<string>();
    for (let code = 0xac00; code <= 0xd7a3; code++) initials.add(chosungOf(String.fromCodePoint(code)) as string);
    expect(initials.size).toBe(19);
  });
});

describe("cells", () => {
  it("keys", () => {
    expect(cellKey(2, 3)).toBe("2,3");
    expect(parseCellKey("2,3")).toEqual({ row: 2, col: 3 });
    expect(parseCellKey("2;3")).toBeNull();
    expect(parseCellKey("-1,0")).toBeNull();
    expect(isCellKey("14,14")).toBe(true);
    expect(isCellKey("100,0")).toBe(false);
  });

  it("word cells, crossings counted once", () => {
    expect(wordCells(WORDS[0])).toEqual(["0,0", "0,1"]);
    expect(wordCells(WORDS[1])).toEqual(["0,1", "1,1"]);
    expect(allCells(WORDS)).toEqual(["0,0", "0,1", "1,1", "1,2", "2,2", "2,3"]);
    expect(wordsAt(WORDS, "0,1").map((w) => w.number)).toEqual([1, 2]);
    expect(wordsAt(WORDS, "0,0").map((w) => w.number)).toEqual([1]);
  });

  it("a one-cell word has one key and shares the cell of its host", () => {
    const single = W(6, "down", 0, 0, 1, true); // sits on 0,0, the direction the host (across) does not use
    expect(wordCells(single)).toEqual(["0,0"]);
    expect(wordsAt([...WORDS, single], "0,0").map((w) => `${w.number}${w.direction}`)).toEqual(["1across", "6down"]);
    expect(allCells([...WORDS, single])).toHaveLength(6);
  });

  it("character rule is the database rule: one NFC [가-힣A-Z0-9]", () => {
    for (const ok of ["사", "A", "Z", "0", "9", "힣", "가"]) expect(isValidCellChar(ok)).toBe(true);
    for (const bad of ["", "ㅅ", "a", "사과", " ", "😀", "-", "ᄉ", "é"]) expect(isValidCellChar(bad)).toBe(false);
    expect(isLoneJamo("ㅅ")).toBe(true);
    expect(isLoneJamo("ᄉ")).toBe(true); // conjoining jamo (NFD)
    expect(isLoneJamo("사")).toBe(false);
    expect(isLoneJamo("a")).toBe(false);
  });

  it("normalizeTyped: NFC, upper-case ASCII, no zero-width space", () => {
    expect(normalizeTyped("사")).toBe("사"); // NFD 사
    expect(normalizeTyped("a1")).toBe("A1");
    expect(normalizeTyped("​가")).toBe("가");
  });

  it("progress counts filled cells, never correct ones", () => {
    expect(filledCount(WORDS, {}, {})).toBe(0);
    expect(filledCount(WORDS, { "0,0": "X", "0,1": "Y" }, { "2,3": "례" })).toBe(3);
    expect(allFilled(WORDS, { "0,0": "a", "0,1": "b", "1,1": "c", "1,2": "d" }, { "2,2": "차", "2,3": "례" })).toBe(true);
    expect(allFilled(WORDS, { "0,0": "a" }, {})).toBe(false);
  });

  it("navigation: tap toggles direction at a crossing, Tab walks the clues", () => {
    const s1 = selectCell(WORDS, null, "0,1");
    expect(s1).toEqual({ key: "0,1", direction: "across" });
    expect(selectCell(WORDS, s1, "0,1")).toEqual({ key: "0,1", direction: "down" });
    expect(selectCell(WORDS, s1, "0,0")).toEqual({ key: "0,0", direction: "across" });
    expect(selectCell(WORDS, null, "9,9")).toBeNull();
    expect(wordForSelection(WORDS, { key: "0,1", direction: "down" })?.number).toBe(2);
    expect(stepClue(WORDS, { key: "0,0", direction: "across" }, 1)).toEqual({ key: "0,1", direction: "down" });
    expect(stepClue(WORDS, { key: "2,2", direction: "across" }, 1)).toEqual({ key: "0,0", direction: "across" });
    expect(stepClue(WORDS, { key: "0,0", direction: "across" }, -1)).toEqual({ key: "2,2", direction: "across" });
  });

  it("arrows move to the nearest cell of the puzzle and stop at the edge", () => {
    expect(moveSelection(WORDS, { key: "0,0", direction: "across" }, "right").key).toBe("0,1");
    expect(moveSelection(WORDS, { key: "0,1", direction: "across" }, "down").key).toBe("1,1");
    expect(moveSelection(WORDS, { key: "0,0", direction: "across" }, "up").key).toBe("0,0");
    expect(moveSelection(WORDS, { key: "2,3", direction: "across" }, "right").key).toBe("2,3");
  });

  it("firstOpenCell skips cells that already hold something", () => {
    expect(firstOpenCell(WORDS[0], { "0,0": "사" }, {})).toBe("0,1");
    expect(firstOpenCell(WORDS[0], {}, { "0,0": "사" })).toBe("0,1");
    expect(firstOpenCell(WORDS[0], { "0,0": "사", "0,1": "과" }, {})).toBe("0,0");
  });
});

describe("messages: Growth First wording", () => {
  const all = [
    ...Object.values(PLAY_ERROR_MESSAGES),
    playMessage("SUBMIT_COOLDOWN", 17),
    playMessage(null),
    toolsSummary({ checks: 3, reveals: 1, chosung: 2 }),
    toolsSummary({ checks: 0, reveals: 0, chosung: 0 }),
    PLAY_TEXT.completed,
    PLAY_TEXT.incompleteCell(3),
    PLAY_TEXT.wrongSome,
    PLAY_TEXT.wrongCount(2),
    PLAY_TEXT.closedBanner,
    PLAY_TEXT.nextPuzzle("광합성"),
  ];

  it("every database error code has a Korean message", () => {
    for (const code of PLAY_ERROR_CODES) {
      expect(PLAY_ERROR_MESSAGES[code], code).toMatch(/[가-힣]/);
    }
    expect(Object.keys(PLAY_ERROR_MESSAGES).sort()).toEqual([...PLAY_ERROR_CODES].sort());
  });

  it("no message sounds like a score, a penalty, a rank or a fraction", () => {
    for (const m of all) {
      expect(m).not.toMatch(/점수|감점|벌점|패널티|페널티|순위|등수|랭킹|실패|탈락|꼴찌/);
      expect(m).not.toMatch(/\d+\s*\/\s*\d+/);
      expect(m).not.toMatch(/[−–-]\s*\d/);
    }
  });

  it("the tools line is about tools used, with no 'remaining' wording", () => {
    expect(toolsSummary({ checks: 3, reveals: 1, chosung: 2 })).toBe("도구를 활용했어요: 확인 3번, 글자 알려주기 1번, 초성 2번");
    expect(toolsSummary({ checks: 0, reveals: 2, chosung: 0 })).toBe("도구를 활용했어요: 글자 알려주기 2번");
    expect(toolsSummary({ checks: 0, reveals: 0, chosung: 0 })).toBe("도구 없이 스스로 풀었어요");
  });

  it("the cooldown text says the wait plainly and stays supportive", () => {
    expect(playMessage("SUBMIT_COOLDOWN", 17)).toBe("조금만 더 살펴볼까요? 17초 뒤에 다시 제출할 수 있어요.");
    expect(playMessage("SUBMIT_COOLDOWN")).toBe("조금만 더 살펴볼까요?");
  });

  it("maps a database message to a code", () => {
    expect(playErrorCode("CROSSWORD_PLAY_STALE")).toBe("STALE");
    expect(playErrorCode("CROSSWORD_PLAY_NOPE")).toBeNull();
    expect(playErrorCode("something else")).toBeNull();
    expect(playErrorCode(undefined)).toBeNull();
    expect(playMessage(null)).toMatch(/다시 시도/);
  });

  it("no message can carry an answer: the texts are fixed strings, only a count or a title is interpolated", () => {
    const src = fs
      .readFileSync(path.join(root, "src/features/crossword/play/messages.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/answer|expected|solution/i);
  });
});

describe("play code never handles an answer (static)", () => {
  const dir = path.join(root, "src/features/crossword/play");
  const files = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]));
  const code = (f: string) =>
    fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");

  it("only the placeholder builder mentions 'answer', and only to write a placeholder", () => {
    for (const f of files(dir)) {
      const c = code(f);
      if (path.basename(f) === "prefill.ts") {
        const lines = c.split("\n").filter((l) => /answer/i.test(l));
        expect(lines.every((l) => /answer: "가"\.repeat\(w\.length\)/.test(l)), f).toBe(true);
      } else {
        expect(c, f).not.toMatch(/answer|solution/i);
      }
    }
  });

  // F3 added the server modules next to the pure core; they are checked by crossword-play-static.test.ts.
  const SERVER_MODULES = new Set(["errors.ts", "access.ts", "payload.ts", "service.ts", "api-guard.ts"]);
  it("no database client, no select-star and no browser storage in the pure play core", () => {
    for (const f of files(dir).filter((x) => !SERVER_MODULES.has(path.basename(x)))) {
      const c = code(f);
      expect(c, f).not.toMatch(/supabase|createClient|server-only|select\(\s*["']\*/);
      expect(c, f).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });
});
