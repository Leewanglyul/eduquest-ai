import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CrosswordPlayBoard } from "@/components/student/crossword-play-board";
import { TeamSyncNotice } from "@/components/student/team-notice";
import { isValidCellChar } from "@/features/crossword/play/cells";
import { ImeController, type ImeEvent, type Intent } from "@/features/crossword/play/ime/controller";
import { PLAY_ERROR_MESSAGES, PLAY_TEXT } from "@/features/crossword/play/messages";
import type { CrosswordInputMode, PlayLimits, PlayPayload, PlayWord } from "@/features/crossword/play/types";

// Gate 3 PLAY-E5-1 (2026-11-03): the puzzle input mode on the client (T7, T8, T10) and the individual-mode regression
// of the C-4 fix (T11). The server side is supabase/tests/00019_crossword_play_input_mode.test.sql.

const root = process.cwd();
const src = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");

const text = (data: string): ImeEvent => ({ type: "input", inputType: "insertText", data, isComposing: false, value: data });
const start = (): ImeEvent => ({ type: "compositionstart" });
const upd = (data: string): ImeEvent => ({ type: "compositionupdate", data });
const end = (data: string, value?: string): ImeEvent => ({ type: "compositionend", data, value });

/** Types into a 3-cell word and returns what was written and what was refused. */
function typeInto(mode: CrosswordInputMode | undefined, events: ImeEvent[]) {
  const c = new ImeController({ length: 3, selected: 0, cells: ["", "", ""] }, mode ? { inputMode: mode } : {});
  const written: string[] = [];
  const rejected: { char: string; reason: string }[] = [];
  for (const e of events) {
    for (const it of c.handle(e) as Intent[]) {
      if (it.kind === "commit") for (const w of it.writes) written.push(w.char);
      if (it.kind === "reject") rejected.push({ char: it.char, reason: it.reason });
    }
  }
  return { written, rejected };
}

describe("T7/T8: the character rule per input mode", () => {
  it("hangul: one complete syllable only", () => {
    for (const ch of ["사", "과", "힣", "가"]) expect(isValidCellChar(ch, "hangul"), ch).toBe(true);
    for (const ch of ["H", "R", "A", "Z", "0", "7", "h", "ㅅ", "ㅏ", "사과", "", " ", "!", "😀"]) expect(isValidCellChar(ch, "hangul"), ch).toBe(false);
  });

  it("mixed: a syllable, an upper-case latin letter or a digit, as before", () => {
    for (const ch of ["사", "H", "R", "A", "0", "7"]) expect(isValidCellChar(ch, "mixed"), ch).toBe(true);
    for (const ch of ["h", "ㅅ", "사과", "AB", "", "!"]) expect(isValidCellChar(ch, "mixed"), ch).toBe(false);
  });

  it("the default stays mixed, so nothing that does not pass a mode changes", () => {
    expect(isValidCellChar("H")).toBe(true);
    expect(isValidCellChar("7")).toBe(true);
  });
});

describe("T7: the IME controller in a Hangul-only puzzle", () => {
  it("H, R, lowercase h and a digit are refused as invalid, nothing is written", () => {
    const r = typeInto("hangul", [text("H"), text("R"), text("h"), text("1")]);
    expect(r.written).toEqual([]);
    expect(r.rejected).toEqual([
      { char: "H", reason: "invalid" },
      { char: "R", reason: "invalid" },
      { char: "H", reason: "invalid" }, // lowercase is upper-cased first, then refused
      { char: "1", reason: "invalid" },
    ]);
  });

  it("a composed syllable is written as before", () => {
    expect(typeInto("hangul", [start(), upd("ㅂ"), upd("보"), upd("복"), end("복", "복")]).written).toEqual(["복"]);
  });

  it("a paste of 복HR writes 복 and refuses H and R", () => {
    const r = typeInto("hangul", [{ type: "paste", text: "복HR" }]);
    expect(r.written).toEqual(["복"]);
    expect(r.rejected.map((x) => x.char)).toEqual(["H", "R"]);
  });

  it("a lone jamo is still refused as jamo (its own message)", () => {
    expect(typeInto("hangul", [text("ㅅ")]).rejected).toEqual([{ char: "ㅅ", reason: "jamo" }]);
  });
});

describe("T8: the IME controller in a mixed puzzle", () => {
  it("latin letters and digits are still written", () => {
    expect(typeInto("mixed", [text("H"), text("r"), text("7")]).written).toEqual(["H", "R", "7"]);
  });
  it("without a mode the controller behaves as mixed (earlier callers)", () => {
    expect(typeInto(undefined, [text("H")]).written).toEqual(["H"]);
  });
});

describe("the refusal messages", () => {
  it("hangul and mixed wording, and the jamo message unchanged", () => {
    expect(PLAY_TEXT.invalidChar("hangul")).toBe("한글 한 글자를 입력해 주세요.");
    expect(PLAY_TEXT.invalidChar("mixed")).toBe("그 글자는 쓸 수 없어요.");
    expect(PLAY_ERROR_MESSAGES.BAD_CHAR).toBe("글자를 완성해 주세요.");
  });

  it("the board picks the message from the payload's input mode on both input paths", () => {
    const board = code("src/components/student/crossword-play-board.tsx");
    expect(board).toContain('it.reason === "jamo" ? PLAY_ERROR_MESSAGES.BAD_CHAR : PLAY_TEXT.invalidChar(puzzle.inputMode)');
    expect(board).toContain("isValidCellChar(c, puzzle.inputMode)");
    expect(board).toContain("inputMode: puzzle.inputMode");
    expect(board).not.toContain('"그 글자는 쓸 수 없어요."'); // only through PLAY_TEXT.invalidChar
  });
});

describe("T10: the payload carries only the puzzle-level mode", () => {
  it("payload.ts asks fn_crossword_play_input_mode and keeps only 'hangul' or 'mixed'", () => {
    const p = code("src/features/crossword/play/payload.ts");
    expect(p).toContain('db.rpc("fn_crossword_play_input_mode", { p_puzzle_id: access.puzzleId })');
    expect(p).toContain('rawMode === "hangul" ? "hangul" : "mixed"');
    expect(p).toMatch(/puzzle: \{ title: puzzle\.title, rows: puzzle\.rows, cols: puzzle\.cols, words, inputMode \}/);
    expect(p).not.toMatch(/answer|solution/i);
    expect(p).not.toContain("fn_crossword_play_wordcells");
  });

  it("the type is one word for the whole puzzle: no per-cell mode anywhere in the play types", () => {
    const t = code("src/features/crossword/play/types.ts");
    expect(t).toContain('export type CrosswordInputMode = "hangul" | "mixed";');
    expect(t).toContain("inputMode: CrosswordInputMode");
    expect(t.match(/inputMode/g)).toHaveLength(1);
    expect(t).not.toMatch(/cellModes|modes:|expected[A-Z]/);
  });

  it("migration 34 adds one function and replaces the save, nothing else", () => {
    const m = src("supabase/migrations/20261103000001_crossword_play_input_mode.sql").replace(/^\s*--.*$/gm, "");
    expect(m.match(/CREATE (OR REPLACE )?FUNCTION/g)).toEqual(["CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"]);
    expect(m).toMatch(/FUNCTION public\.fn_crossword_play_input_mode\(p_puzzle_id uuid\)\nRETURNS text\nLANGUAGE sql\nSTABLE\nSET search_path = pg_catalog, public/);
    expect(m).not.toContain("SECURITY DEFINER");
    // outside the two function bodies: only the two headers, one REVOKE and one GRANT; no table, row or other object
    const outside = m.replace(/AS \$\$[\s\S]*?\$\$;/g, "AS <body>;").split(";").map((x) => x.trim()).filter(Boolean);
    expect(outside.map((x) => x.split(/\s+/).slice(0, 3).join(" "))).toEqual([
      "CREATE FUNCTION public.fn_crossword_play_input_mode(p_puzzle_id",
      "CREATE OR REPLACE",
      "REVOKE ALL ON",
      "GRANT EXECUTE ON",
    ]);
    expect(outside.join(" ")).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|TABLE|COLUMN|TRIGGER|INDEX)\b/i);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The board, statically: both modes render; the degraded line is team-only and hidden by default
// ---------------------------------------------------------------------------------------------------------------

const W = (number: number, direction: "across" | "down", row: number, col: number, length: number): PlayWord => ({
  number, direction, row, col, length, single: false, clue: `단서 ${number}`,
});
const LIMITS: PlayLimits = { checkMode: "anytime", checksAllowed: 5, checksRemaining: 3, revealsAllowed: 2, revealsRemaining: 1, chosungAllowed: true };
const payload = (inputMode: CrosswordInputMode, over: Partial<PlayPayload> = {}): PlayPayload => ({
  v: 1, assignmentId: "a1", attempt: { status: "in_progress", revision: 3 },
  puzzle: { title: "세포 퍼즐", rows: 2, cols: 2, words: [W(1, "across", 0, 0, 2), W(2, "down", 0, 1, 2)], inputMode },
  given: {}, cells: {}, limits: LIMITS, readonly: false, closesAt: null, ...over,
});
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("degraded sync notice", () => {
  it("says nothing until degraded, then one neutral status line", () => {
    expect(renderToStaticMarkup(<TeamSyncNotice degraded={false} text={PLAY_TEXT.teamSyncDegraded} />)).toBe("");
    const html = renderToStaticMarkup(<TeamSyncNotice degraded text={PLAY_TEXT.teamSyncDegraded} />);
    expect(html).toContain('role="status"');
    expect(plain(html)).toBe("팀 화면을 맞추는 중이에요");
  });

  it("the board starts without it, in team and individual mode, in both input modes", () => {
    for (const mode of ["hangul", "mixed"] as const) {
      for (const p of [payload(mode), payload(mode, { team: { label: "1팀", memberCount: 3 } })]) {
        const t = plain(renderToStaticMarkup(<CrosswordPlayBoard payload={p} />));
        expect(t).toContain("세포 퍼즐");
        expect(t).not.toContain(PLAY_TEXT.teamSyncDegraded);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T11: individual mode is unchanged by the C-4 fix
// ---------------------------------------------------------------------------------------------------------------

describe("T11: individual-mode regression", () => {
  const board = code("src/components/student/crossword-play-board.tsx");

  it("the poller is created only in team mode, and only it can resync", () => {
    expect(board).toMatch(/useEffect\(\(\) => \{\n\s+if \(!team \|\| payload\.readonly \|\| payload\.attempt\.status === "completed"\) return;\n\s+const poller = new TeamPoller\(/);
    expect(board.match(/new TeamPoller\(/g)).toHaveLength(1);
    // the resync goes through pollerRef, which individual mode never sets
    expect(board).toContain("if (!resyncNeeded.current || !pollerRef.current) return;");
  });

  it("STALE in individual mode still reloads; team mode still polls instead", () => {
    expect(board).toMatch(/if \(r\.code === "STALE" && team\) \{[\s\S]*?void pollerRef\.current\?\.pollNow\(\);[\s\S]*?return;\n\s+\}\n\s+if \(r\.code === "STALE"\) \{\n\s+setMessage\(playMessage\("STALE"\)\);\n\s+setTimeout\(\(\) => window\.location\.reload\(\), 1200\);/);
  });

  it("the save queue keeps LOCKED_CELL recovery for team mode only", () => {
    expect(board).toMatch(/\.\.\.\(payload\.team\n\s+\? \{\n\s+recoverLocked:/);
  });
});
