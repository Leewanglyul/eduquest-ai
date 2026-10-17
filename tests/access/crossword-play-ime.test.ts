import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ImeController, type ImeEvent, type Intent } from "@/features/crossword/play/ime/controller";

// --- a tiny stand-in for the hook: applies intents to a cell array and records what happened -----------------------

type Applied = { cells: string[]; preview: string; selected: number; atEnd: boolean; rejected: string[]; overflow: number; commitLog: string[]; deletes: number[] };

function newBoard(n: number, init: string[] = []): Applied {
  return { cells: Array.from({ length: n }, (_, i) => init[i] ?? ""), preview: "", selected: 0, atEnd: false, rejected: [], overflow: 0, commitLog: [], deletes: [] };
}
function apply(b: Applied, intents: Intent[]): void {
  for (const it of intents) {
    switch (it.kind) {
      case "preview": b.preview = it.cells.map((c) => c.char).join(""); break;
      case "commit":
        for (const w of it.writes) { b.cells[w.index] = w.char; b.commitLog.push(w.char); }
        break;
      case "delete": b.cells[it.index] = ""; b.deletes.push(it.index); break;
      case "select": b.selected = it.index; b.atEnd = it.atEnd; break;
      case "reject": b.rejected.push(it.char); break;
      case "overflow": b.overflow++; break;
    }
  }
}
function run(c: ImeController, b: Applied, events: ImeEvent[]): Intent[] {
  const all: Intent[] = [];
  for (const e of events) { const i = c.handle(e); apply(b, i); all.push(...i); }
  return all;
}
const make = (n: number, over: { selected?: number; cells?: string[]; locked?: boolean[] } = {}) => {
  const cells = over.cells ?? Array(n).fill("");
  const c = new ImeController({ length: n, selected: over.selected ?? 0, cells, locked: over.locked });
  const b = newBoard(n, cells);
  b.selected = over.selected ?? 0;
  return { c, b };
};

// event builders
const start = (): ImeEvent => ({ type: "compositionstart" });
const upd = (data: string): ImeEvent => ({ type: "compositionupdate", data });
const end = (data: string, value?: string): ImeEvent => ({ type: "compositionend", data, value });
const inputComp = (data: string, value: string): ImeEvent => ({ type: "input", inputType: "insertCompositionText", data, isComposing: true, value });
const text = (data: string, value = data, inputType = "insertText"): ImeEvent => ({ type: "input", inputType, data, isComposing: false, value });
const key = (k: string, over: Partial<Extract<ImeEvent, { type: "keydown" }>> = {}): ImeEvent => ({ type: "keydown", key: k, keyCode: 0, isComposing: false, valueEmpty: true, ...over });

describe("IME controller: composition (synthetic, shaped like the Windows traces)", () => {
  it("one syllable per composition (sa, gwa)", () => {
    const { c, b } = make(2);
    run(c, b, [start(), upd("ㅅ"), upd("사"), end("사", "사")]);
    expect(b.cells).toEqual(["사", ""]);
    expect(b.selected).toBe(1);
    run(c, b, [start(), upd("ㄱ"), upd("고"), upd("과"), end("과", "사과")]);
    expect(b.cells).toEqual(["사", "과"]);
    expect(b.commitLog).toEqual(["사", "과"]); // each syllable commits exactly once
    expect(b.atEnd).toBe(true);
  });

  it("pending text is shown, not committed, until the composition ends (R5)", () => {
    const { c, b } = make(3);
    run(c, b, [start(), upd("ㅅ")]);
    expect(b.preview).toBe("ㅅ");
    expect(b.cells).toEqual(["", "", ""]);
    expect(c.state.composing).toBe(true);
    run(c, b, [upd("사")]);
    expect(b.preview).toBe("사");
    expect(b.selected).toBe(0); // the selection does not advance mid-composition
  });

  it("R1: syllable hand-off in one tick (안 + ㅏ -> 아, 나) commits once each and does not allow a reset in between", () => {
    const { c, b } = make(2);
    run(c, b, [start(), upd("ㅇ"), inputComp("ㅇ", "ㅇ"), upd("아"), inputComp("아", "아"), upd("안"), inputComp("안", "안"), upd("아"), inputComp("아", "아")]);
    run(c, b, [end("아", "아")]);
    expect(b.cells).toEqual(["아", ""]);
    // the very next event, same tick: the new composition starts, the value still holds the committed syllable
    run(c, b, [start(), upd("나"), inputComp("나", "아나")]);
    expect(c.canResetInput()).toBe(false); // R2: a deferred reset scheduled by compositionend must skip now
    expect(b.preview).toBe("나");
    run(c, b, [end("나", "아나")]);
    expect(b.cells).toEqual(["아", "나"]);
    expect(b.commitLog).toEqual(["아", "나"]);
    expect(c.canResetInput()).toBe(true);
  });

  it("R2: input.value may be reset only when no composition is open, and the tracked length restarts", () => {
    const { c, b } = make(2);
    run(c, b, [start(), upd("가")]);
    expect(c.canResetInput()).toBe(false);
    run(c, b, [end("가", "가")]);
    expect(c.canResetInput()).toBe(true);
    c.inputWasReset();
    // a direct (non-composition) keyboard now sends finished text: only the part after the reset is committed
    run(c, b, [text("나", "나")]);
    expect(b.cells).toEqual(["가", "나"]);
  });

  it("tracks the committed part of the value, so a stale prefix is not committed again", () => {
    const { c, b } = make(3);
    run(c, b, [start(), upd("가"), end("가", "가")]); // value stays "가" (no reset yet)
    run(c, b, [text("나", "가나")]);
    expect(b.cells).toEqual(["가", "나", ""]);
    expect(b.commitLog).toEqual(["가", "나"]);
  });

  it("R3: Backspace inside a composition only shortens the pending text; no cell changes", () => {
    const { c, b } = make(1);
    const intents = run(c, b, [start(), upd("ㅅ"), upd("사"), upd("산"), upd("사"), upd("ㅅ"), upd("사"), end("사", "사")]);
    expect(b.cells).toEqual(["사"]);
    expect(b.commitLog).toEqual(["사"]);
    expect(b.deletes).toEqual([]);
    expect(intents.filter((i) => i.kind === "delete")).toHaveLength(0);
  });

  it("R3: unwinding to nothing cancels the composition (empty update + deleteContentBackward), then a new one starts clean", () => {
    const { c, b } = make(2);
    run(c, b, [start(), upd("ㅅ"), upd("")]);
    run(c, b, [{ type: "input", inputType: "deleteContentBackward", data: "", isComposing: false, value: "" }]);
    expect(c.state.composing).toBe(false);
    expect(b.preview).toBe("");
    expect(b.cells).toEqual(["", ""]);
    // Chrome then also sends an empty compositionend: nothing to commit, nothing doubled
    run(c, b, [end("", "")]);
    expect(b.commitLog).toEqual([]);
    run(c, b, [start(), upd("ㄴ"), upd("나"), end("나", "나")]);
    expect(b.cells).toEqual(["나", ""]);
    expect(b.commitLog).toEqual(["나"]);
  });

  it("R3 without compositionend (Edge): the next compositionstart does not double-commit", () => {
    const { c, b } = make(2);
    run(c, b, [start(), upd("ㅅ"), upd("")]);
    run(c, b, [{ type: "input", inputType: "deleteContentBackward", data: "", isComposing: false, value: "" }]);
    run(c, b, [start(), upd("ㄴ"), upd("나"), end("나", "나")]);
    expect(b.cells).toEqual(["나", ""]);
    expect(b.commitLog).toEqual(["나"]);
  });

  it("R7: keys do nothing while composing (Process / keyCode 229 / isComposing)", () => {
    const { c, b } = make(3, { cells: ["가", "", ""], selected: 1 });
    run(c, b, [start(), upd("ㄴ")]);
    const before = JSON.stringify(b);
    expect(c.handle(key("Process", { keyCode: 229 }))).toEqual([]);
    expect(c.handle(key("Backspace", { isComposing: true }))).toEqual([]);
    expect(c.handle(key("ArrowRight", { isComposing: true }))).toEqual([]);
    expect(c.handle(key("Enter", { keyCode: 229 }))).toEqual([]);
    expect(JSON.stringify(b)).toBe(before);
    expect(c.state.pending).toBe("ㄴ");
  });

  it("R8: a lone jamo is rejected and never committed; the selection stays", () => {
    const { c, b } = make(2);
    run(c, b, [start(), upd("ㅅ"), end("ㅅ", "ㅅ")]);
    expect(b.cells).toEqual(["", ""]);
    expect(b.rejected).toEqual(["ㅅ"]);
    expect(b.selected).toBe(0);
    expect(b.commitLog).toEqual([]);
  });

  it("R5: a long composition across several syllables is previewed over the cells and committed at the end", () => {
    const { c, b } = make(3);
    run(c, b, [start(), upd("사"), upd("사과"), upd("사과나")]);
    expect(b.preview).toBe("사과나");
    expect(b.cells).toEqual(["", "", ""]);
    run(c, b, [end("사과나", "사과나")]);
    expect(b.cells).toEqual(["사", "과", "나"]);
    expect(b.atEnd).toBe(true);
    expect(b.selected).toBe(2);
  });

  it("R5: a long composition is clamped at the end of the word", () => {
    const { c, b } = make(2, { selected: 1 });
    run(c, b, [start(), upd("사과나")]);
    expect(b.preview).toBe("사"); // one cell left
    run(c, b, [end("사과나", "사과나")]);
    expect(b.cells).toEqual(["", "사"]);
    expect(b.overflow).toBe(1);
    expect(b.atEnd).toBe(true);
  });

  it("R6: blur commits a pending syllable once; the compositionend that follows does not commit it again", () => {
    const { c, b } = make(3);
    run(c, b, [start(), upd("나")]);
    run(c, b, [{ type: "blur" }]);
    expect(b.cells).toEqual(["나", "", ""]);
    run(c, b, [end("나", "나")]);
    expect(b.commitLog).toEqual(["나"]);
    expect(b.cells).toEqual(["나", "", ""]);
  });

  it("R6: tapping another cell mid-composition commits the pending syllable at its own cell, then moves", () => {
    const { c, b } = make(3);
    run(c, b, [start(), upd("가")]);
    run(c, b, [{ type: "select", index: 2 }]);
    expect(b.cells).toEqual(["가", "", ""]);
    expect(b.selected).toBe(2);
    run(c, b, [end("가", "가")]);
    expect(b.commitLog).toEqual(["가"]);
  });

  it("R6: flush() (save, submit, page hide) commits the pending syllable exactly once", () => {
    const { c, b } = make(2);
    run(c, b, [start(), upd("과")]);
    apply(b, c.flush());
    apply(b, c.flush());
    expect(b.cells).toEqual(["과", ""]);
    expect(b.commitLog).toEqual(["과"]);
  });

  it("a repeated compositionend (some browsers) does not commit twice", () => {
    const { c, b } = make(2);
    run(c, b, [start(), upd("사"), end("사", "사"), end("사", "사")]);
    expect(b.commitLog).toEqual(["사"]);
  });

  it("a composition event without compositionstart (some Android keyboards) still works", () => {
    const { c, b } = make(2);
    run(c, b, [upd("사"), end("사", "사")]);
    expect(b.cells).toEqual(["사", ""]);
    expect(b.commitLog).toEqual(["사"]);
  });
});

describe("IME controller: finished text and keys", () => {
  it("a keyboard that sends finished text (no composition events) commits it", () => {
    const { c, b } = make(2);
    run(c, b, [text("사"), text("과", "과")]);
    expect(b.cells).toEqual(["사", "과"]);
  });

  it("insertReplacementText (prediction strip) commits the replacement", () => {
    const { c, b } = make(2);
    run(c, b, [{ type: "input", inputType: "insertReplacementText", data: "사과", isComposing: false, value: "사과" }]);
    expect(b.cells).toEqual(["사", "과"]);
  });

  it("NFD input is normalized to one syllable", () => {
    const { c, b } = make(1);
    run(c, b, [text("사")]);
    expect(b.cells).toEqual(["사"]);
  });

  it("Latin and digits: lower-case is upper-cased, digits kept; space, symbol and emoji are rejected", () => {
    const { c, b } = make(2);
    run(c, b, [text("a"), text("1", "1")]);
    expect(b.cells).toEqual(["A", "1"]);
    const { c: c2, b: b2 } = make(2);
    run(c2, b2, [text(" "), text("-"), text("😀")]);
    expect(b2.cells).toEqual(["", ""]);
    expect(b2.rejected).toHaveLength(3);
    expect(b2.selected).toBe(0);
  });

  it("paste is clamped at the end of the word", () => {
    const { c, b } = make(3);
    run(c, b, [{ type: "paste", text: "사과나무" }]);
    expect(b.cells).toEqual(["사", "과", "나"]);
    expect(b.overflow).toBe(1);
    expect(b.atEnd).toBe(true);
  });

  it("paste commits a pending syllable first, then pastes after it", () => {
    const { c, b } = make(4);
    run(c, b, [start(), upd("가"), { type: "paste", text: "나다" }]);
    expect(b.cells).toEqual(["가", "나", "다", ""]);
  });

  it("Backspace outside a composition empties the cell, or steps back and empties the previous one", () => {
    const { c, b } = make(3, { cells: ["사", "과", ""], selected: 2 });
    run(c, b, [key("Backspace")]);
    expect(b.cells).toEqual(["사", "", ""]);
    expect(b.selected).toBe(1);
    const { c: c2, b: b2 } = make(3, { cells: ["사", "과", ""], selected: 1 });
    run(c2, b2, [key("Backspace")]);
    expect(b2.cells).toEqual(["사", "", ""]);
    expect(b2.selected).toBe(1);
    run(c2, b2, [key("Backspace")]);
    expect(b2.cells).toEqual(["", "", ""]);
    expect(b2.selected).toBe(0);
    run(c2, b2, [key("Backspace")]);
    expect(b2.selected).toBe(0); // nothing left to do at the start
  });

  it("a Backspace that arrives as input/deleteContent (no keydown) does the same", () => {
    const { c, b } = make(2, { cells: ["사", "과"], selected: 1 });
    run(c, b, [{ type: "input", inputType: "deleteContentBackward", data: null, isComposing: false, value: "" }]);
    expect(b.cells).toEqual(["사", ""]);
  });

  it("Backspace with text still in the proxy input is left to the input (no cell change)", () => {
    const { c, b } = make(2, { cells: ["사", ""], selected: 1 });
    run(c, b, [key("Backspace", { valueEmpty: false })]);
    expect(b.cells).toEqual(["사", ""]);
  });

  it("arrows move the selection by one cell outside a composition", () => {
    const { c, b } = make(3, { selected: 1 });
    run(c, b, [key("ArrowRight")]);
    expect(b.selected).toBe(2);
    run(c, b, [key("ArrowRight")]);
    expect(b.selected).toBe(2);
    run(c, b, [key("ArrowLeft"), key("ArrowLeft"), key("ArrowLeft")]);
    expect(b.selected).toBe(0);
  });

  it("locked cells (prefilled or revealed) are skipped by typing and left alone by Backspace and arrows", () => {
    const { c, b } = make(4, { cells: ["", "례", "", ""], locked: [false, true, false, false] });
    run(c, b, [start(), upd("가나다"), end("가나다", "가나다")]);
    expect(b.cells).toEqual(["가", "례", "나", "다"]);
    expect(b.commitLog).toEqual(["가", "나", "다"]);
    const { c: c2, b: b2 } = make(3, { cells: ["", "례", ""], locked: [false, true, false] });
    run(c2, b2, [start(), upd("가나")]);
    expect(b2.preview).toBe("가나");
    run(c2, b2, [end("가나", "가나")]);
    expect(b2.cells).toEqual(["가", "례", "나"]);
    // Backspace from the last cell steps over the locked one
    run(c2, b2, [key("Backspace"), key("Backspace")]);
    expect(b2.cells).toEqual(["", "례", ""]);
    // arrows hop over it
    const { c: c3, b: b3 } = make(3, { cells: ["", "례", ""], locked: [false, true, false], selected: 0 });
    run(c3, b3, [key("ArrowRight")]);
    expect(b3.selected).toBe(2);
  });

  it("a one-cell word: the first syllable commits, the next is overflow", () => {
    const { c, b } = make(1);
    run(c, b, [start(), upd("가나"), end("가나", "가나")]);
    expect(b.cells).toEqual(["가"]);
    expect(b.overflow).toBe(1);
  });

  it("setWord points the controller at another word and drops anything pending", () => {
    const { c, b } = make(2);
    run(c, b, [start(), upd("가")]);
    c.setWord({ length: 3, selected: 2, cells: ["", "", ""] });
    expect(c.state.composing).toBe(false);
    expect(c.state.selected).toBe(2);
    expect(c.canResetInput()).toBe(true);
  });
});

// --- replay of traces recorded by the IME lab on real keyboards ------------------------------------------------------

type Run = { id: string; case: string; n: number; expected: string; got: string; testerVerdict: string; autoPass: boolean; focusLost: number; events: ImeEvent[] };
type Fixture = { source: { trace: string; labVersion: number; device: string }; runs: Run[] };
const fixture = (name: string): Fixture =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/ime", `${name}.json`), "utf8"));

function replay(r: Run) {
  const { c, b } = make(r.n);
  // The recorded `value` of every event already reflects whatever the lab did to the input, so the replay feeds the
  // events as they are and does not simulate a reset of its own.
  for (const e of r.events) apply(b, c.handle(e));
  apply(b, c.flush()); // the lab flushes a pending syllable when the tester presses "end"
  return { b, c };
}

describe("IME controller replays real keyboard traces (Windows 11, Microsoft Korean IME)", () => {
  it("the fixtures are present and name their source", () => {
    for (const name of ["windows-edge-v2", "windows-edge-v1-handoff", "windows-chrome-v1"]) {
      const f = fixture(name);
      expect(f.source.device).toMatch(/Windows 11/);
      expect(f.runs.length).toBeGreaterThan(0);
    }
  });

  it("lab v2, Edge: every clean run ends with the expected cells and commits each character once", () => {
    const f = fixture("windows-edge-v2");
    const clean = f.runs.filter((r) => r.autoPass && r.testerVerdict === "pass");
    expect(clean.map((r) => r.case).sort()).toEqual(["c2", "c3", "c5", "c8", "c9"].sort());
    for (const r of clean) {
      const { b } = replay(r);
      expect(b.cells.join(""), `${r.id} ${r.expected}`).toBe(r.expected);
    }
  });

  it("lab v2, Edge: syllable hand-off (c3 아나) commits 아 then 나, once each", () => {
    const r = fixture("windows-edge-v2").runs.find((x) => x.case === "c3")!;
    const { b } = replay(r);
    expect(b.commitLog.filter((ch) => ch !== " ")).toEqual(["아", "나"]);
    expect(b.cells).toEqual(["아", "나"]);
  });

  it("lab v2, Edge: fast typing (c5 대한민국) loses and doubles nothing", () => {
    const r = fixture("windows-edge-v2").runs.find((x) => x.case === "c5")!;
    const { b } = replay(r);
    expect(b.cells.join("")).toBe("대한민국");
    expect(b.commitLog.join("")).toBe("대한민국");
  });

  it("lab v2, Edge: paste (c9) is clamped to three cells", () => {
    const r = fixture("windows-edge-v2").runs.find((x) => x.case === "c9")!;
    expect(replay(r).b.cells).toEqual(["사", "과", "나"]);
  });

  it("regression, lab v1 Edge: the hand-off that v1 broke (아나) gives 아 and 나 and never allows a reset mid-composition", () => {
    const r = fixture("windows-edge-v1-handoff").runs.find((x) => x.case === "c3")!;
    // This v1 run was recorded with a lab that reset the value itself; only the events matter here.
    const { c, b } = make(r.n);
    let sawOpenWhileResetAsked = false;
    for (const [i, e] of r.events.entries()) {
      apply(b, c.handle(e));
      const next = r.events[i + 1];
      if (e.type === "compositionend" && next?.type === "compositionstart") {
        apply(b, c.handle(next));
        // a reset scheduled by the end of 아 would now run: the controller must refuse
        if (!c.canResetInput()) sawOpenWhileResetAsked = true;
      }
    }
    apply(b, c.flush());
    expect(sawOpenWhileResetAsked).toBe(true);
    expect(b.cells.slice(0, 2).join("")).toBe("아나");
  });

  it("regression, lab v1 Chrome: c8 (가, 나 and a click away mid-composition) keeps both syllables", () => {
    const r = fixture("windows-chrome-v1").runs.find((x) => x.case === "c8")!;
    const { b } = replay(r);
    expect(b.cells.join("")).toBe("가나");
    expect(b.commitLog.join("")).toBe("가나");
  });

  it("lab v1 Chrome: the clean runs (사과, 아나) still replay correctly", () => {
    for (const r of fixture("windows-chrome-v1").runs.filter((x) => x.autoPass)) {
      expect(replay(r).b.cells.join(""), r.id).toBe(r.expected);
    }
  });
});
