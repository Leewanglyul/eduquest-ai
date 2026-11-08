import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isInputValidationMessage } from "@/components/student/crossword-play-board";
import { SaveQueue, type SaveRequest } from "@/components/student/save-queue";
import { wordCells, wordForSelection, type Selection } from "@/features/crossword/play/cells";
import { ImeController, type ImeEvent, type Intent } from "@/features/crossword/play/ime/controller";
import { PLAY_ERROR_MESSAGES, PLAY_TEXT } from "@/features/crossword/play/messages";
import type { PlayWord } from "@/features/crossword/play/types";

// Gate 3 IME-3 (2026-11-07), at board level: the real ImeController and the real SaveQueue (fake sender), driven the way
// crossword-play-board drives them. There is no DOM in this suite, so the board's React parts are mirrored here:
// applyIntents (commit, delete, select, reject) and the effect that points the controller at the selected word after
// every move, unless a composition is open. The static checks at the end tie these rules to the board's source.

const root = process.cwd();
const code = (p: string) =>
  fs.readFileSync(path.join(root, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");

const W = (number: number, direction: "across" | "down", row: number, col: number, length: number): PlayWord => ({
  number, direction, row, col, length, single: false, clue: `단서 ${number}`,
});
// two words of the local test puzzle: 1 down (0,0)-(1,0), 6 across (3,2)-(3,3)
const WORDS = [W(1, "down", 0, 0, 2), W(6, "across", 3, 2, 2)];

class BoardModel {
  cells: Record<string, string>;
  sel: Selection;
  message = "";
  readonly sent: SaveRequest[] = [];
  readonly queue: SaveQueue;
  private readonly controller = new ImeController(undefined, { inputMode: "hangul" });
  private activeKeys: string[] = [];
  private shown: string | null = null;

  constructor(cells: Record<string, string>, sel: Selection, private readonly given: Record<string, string> = {}) {
    this.cells = { ...cells };
    this.sel = sel;
    let revision = 21;
    this.queue = new SaveQueue({
      send: async (request) => {
        this.sent.push(request);
        return { kind: "ok", revision: ++revision };
      },
      onChange: () => {},
      initialRevision: revision,
      debounceMs: 60_000, // nothing leaves before the test asks
    });
    this.effect();
  }

  /** crossword-play-board: "keep the controller pointed at the selected word" */
  private effect(): void {
    const word = wordForSelection(WORDS, this.sel);
    if (!word) return;
    const keys = wordCells(word);
    this.activeKeys = keys;
    if (this.controller.state.composing) return;
    const id = `${word.number}${word.direction}${this.sel.key}`;
    if (id === this.shown) return; // deps: word number, direction and sel.key
    this.shown = id;
    this.controller.setWord({
      length: keys.length,
      selected: Math.max(0, keys.indexOf(this.sel.key)),
      cells: keys.map((k) => this.cells[k] ?? this.given[k] ?? ""),
      locked: keys.map((k) => Boolean(this.given[k])),
    });
  }

  /** crossword-play-board: applyIntents */
  private apply(intents: Intent[]): void {
    const keys = this.activeKeys;
    for (const it of intents) {
      if (it.kind === "commit") {
        for (const w of it.writes) this.cells[keys[w.index]] = w.char;
        for (const w of it.writes) this.queue.setCell(keys[w.index], w.char);
        if (!intents.some((x) => x.kind === "reject")) this.message = isInputValidationMessage(this.message) ? "" : this.message;
      } else if (it.kind === "delete") {
        delete this.cells[keys[it.index]];
        this.queue.setCell(keys[it.index], null);
      } else if (it.kind === "select") {
        this.sel = { key: keys[it.index], direction: this.sel.direction };
      } else if (it.kind === "reject") {
        this.message = it.reason === "jamo" ? PLAY_ERROR_MESSAGES.BAD_CHAR : PLAY_TEXT.invalidChar("hangul");
      }
    }
  }

  /** One browser event, then React's render and effects before the next one (React 18 flushes them for discrete events). */
  event(e: ImeEvent): void {
    this.apply(this.controller.handle(e));
    this.effect();
  }

  /** The recorded step "board: setWord" is the effect itself; the model runs it after every event. */
  replay(steps: (ImeEvent | { type: "setWord" })[]): void {
    for (const s of steps) if (s.type !== "setWord") this.event(s);
  }

  async saved(): Promise<SaveRequest[]> {
    await this.queue.idle();
    return this.sent;
  }
}

type Fixture = { events: (ImeEvent | { type: "setWord"; selected: number })[]; expectedWithFix: { patchKeys: string[] } };
const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/ime/windows-chrome-blur-tail.json"), "utf8")) as Fixture;

const start = (): ImeEvent => ({ type: "compositionstart" });
const upd = (data: string): ImeEvent => ({ type: "compositionupdate", data });
const comp = (data: string): ImeEvent => ({ type: "input", inputType: "insertCompositionText", data, isComposing: true, value: data });
const del = (): ImeEvent => ({ type: "input", inputType: "deleteContentBackward", data: null, isComposing: false, value: "" });
const key = (k: string, valueEmpty = true): ImeEvent => ({ type: "keydown", key: k, keyCode: 0, isComposing: false, valueEmpty });
const text = (data: string): ImeEvent => ({ type: "input", inputType: "insertText", data, isComposing: false, value: data });

describe("board level: the recorded IME-3 sequence", () => {
  it("A. empty next cell: 0,0=해, 1,0 stays empty, one cell in the save", async () => {
    const b = new BoardModel({ "1,1": "가" }, { key: "0,0", direction: "down" });
    b.replay(fixture.events);
    expect(b.sel.key).toBe("1,0"); // blur committed 0,0 and moved on, as in the browser
    expect(b.cells["0,0"]).toBe("해");
    expect(b.cells["1,0"]).toBeUndefined();
    const sent = await b.saved();
    expect(sent).toHaveLength(1);
    expect(sent[0].patch).toEqual({ "0,0": "해" });
    expect(Object.keys(sent[0].patch)).toEqual(fixture.expectedWithFix.patchKeys); // patchCount 1
  });

  it("B. a teammate's letter in the next cell is kept and never sent", async () => {
    // 6 across: compose in 3,2; 3,3 already holds the teammate's 바
    const b = new BoardModel({ "3,3": "바" }, { key: "3,2", direction: "across" });
    b.replay([start(), upd("ㄷ"), comp("ㄷ"), upd("달"), comp("달"), { type: "blur" }, { type: "setWord" }, { type: "compositionend", data: "달", value: "달" }, del()]);
    expect(b.sel.key).toBe("3,3");
    expect(b.cells).toEqual({ "3,2": "달", "3,3": "바" });
    const sent = await b.saved();
    expect(sent).toHaveLength(1);
    expect(sent[0].patch).toEqual({ "3,2": "달" }); // no "3,3": null, so the server keeps the teammate's cell
  });

  it("C. after the tail, the student's own Backspace deletes as before", async () => {
    const b = new BoardModel({}, { key: "0,0", direction: "down" });
    b.replay(fixture.events);
    b.event(key("Backspace", false));
    b.event(del());
    expect(b.cells["0,0"]).toBeUndefined(); // 1,0 was empty: Backspace stepped back and deleted 0,0
    expect(b.sel.key).toBe("0,0");
    const sent = await b.saved();
    expect(sent).toHaveLength(1);
    expect(sent[0].patch).toEqual({ "0,0": null });
  });

  it("D. an accepted letter clears the refusal line, and only that kind of line", () => {
    const b = new BoardModel({}, { key: "0,0", direction: "down" });
    b.event(text("H"));
    expect(b.message).toBe("한글 한 글자를 입력해 주세요.");
    expect(b.cells).toEqual({});
    b.replay([start(), upd("해"), comp("해"), { type: "compositionend", data: "해", value: "해" }]);
    expect(b.cells["0,0"]).toBe("해");
    expect(b.message).toBe("");

    const keep = new BoardModel({}, { key: "0,0", direction: "down" });
    for (const other of [PLAY_TEXT.saveOffline, PLAY_TEXT.teamSyncDegraded, PLAY_TEXT.teamCompleted, "다시 볼 칸이 2개 있어요."]) {
      keep.message = other;
      keep.replay([start(), upd("해"), { type: "compositionend", data: "해", value: "해" }]);
      expect(keep.message).toBe(other);
    }
  });

  it("D2. a paste with a refused character keeps the refusal line in the same batch", () => {
    const b = new BoardModel({}, { key: "0,0", direction: "down" });
    b.event({ type: "paste", text: "해H" });
    expect(b.cells["0,0"]).toBe("해");
    expect(b.message).toBe("한글 한 글자를 입력해 주세요.");
  });
});

describe("isInputValidationMessage", () => {
  it("only the refusal lines for a typed character", () => {
    for (const m of [PLAY_TEXT.invalidChar("hangul"), PLAY_TEXT.invalidChar("mixed"), PLAY_ERROR_MESSAGES.BAD_CHAR]) {
      expect(isInputValidationMessage(m), m).toBe(true);
    }
    for (const m of ["", PLAY_TEXT.saveOffline, PLAY_TEXT.teamSyncDegraded, PLAY_TEXT.teamCompleted, PLAY_TEXT.checkBusy, PLAY_ERROR_MESSAGES.LOCKED_CELL, "초성을 보여 줬어요."]) {
      expect(isInputValidationMessage(m), m).toBe(false);
    }
  });
});

describe("the model above follows the board's source", () => {
  const b = code("src/components/student/crossword-play-board.tsx");
  it("the effect sets the word unless a composition is open, with the selected index and the cells", () => {
    expect(b).toMatch(/useEffect\(\(\) => \{\n\s+if \(!word\) return;\n\s+const keys = wordCells\(word\);\n\s+activeKeys\.current = keys;\n\s+if \(grid\.isComposing\(\)\) return;\n\s+grid\.setWord\(\{\n\s+length: keys\.length,\n\s+selected: Math\.max\(0, keys\.indexOf\(sel\.key\)\),\n\s+cells: keys\.map\(\(k\) => cells\[k\] \?\? given\[k\] \?\? ""\),/);
    expect(b).toContain("}, [word?.number, word?.direction, sel.key, traceOn]);");
  });
  it("commit writes the cells and the queue, and clears only a refusal line when the batch has no refusal", () => {
    expect(b).toContain("for (const w of it.writes) queue.setCell(keys[w.index], w.char);");
    expect(b).toContain('if (!intents.some((x) => x.kind === "reject")) setMessage(clearInputValidation);');
    expect(b).toContain("if (writes.length > 0) setMessage(clearInputValidation);");
    expect(b).toContain("const clearInputValidation = (message: string) => (isInputValidationMessage(message) ? \"\" : message);");
  });
  it("delete sends null for the cell; select moves the selection in the same direction", () => {
    expect(b).toContain("queue.setCell(k, null);");
    expect(b).toContain("setSel({ key: keys[it.index], direction: dirRef.current });");
  });
});

describe("the fake sender sees exactly what the queue sends", () => {
  it("no request until asked, one after", async () => {
    const b = new BoardModel({}, { key: "0,0", direction: "down" });
    b.replay([start(), upd("해"), { type: "compositionend", data: "해", value: "해" }]);
    expect(b.sent).toHaveLength(0);
    const sent = await b.saved();
    expect(sent).toHaveLength(1);
    expect(sent[0].patch).toEqual({ "0,0": "해" });
  });
});
