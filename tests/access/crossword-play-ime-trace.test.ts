import { describe, expect, it } from "vitest";

import { ImeController, type ImeEvent, type ImeWord, type Intent } from "@/features/crossword/play/ime/controller";
import { ImeTrace, MAX_TRACE_EVENTS, type TimedTraceEvent, type TraceEvent } from "@/components/student/ime-trace";

// The board can record the IME events of a real device (?imetrace=1) so a failure on a Galaxy tablet becomes a fixture.
// These tests pin that a recording replays through the controller to the same cells, and that the file has the
// fixture shape the other IME tests read.

const META = { device: "S24 / Samsung Internet", keyboardApp: "삼성 키보드", predictionStrip: true, orientation: "portrait-primary", viewport: [412, 800] as [number, number], userAgent: "test", note: "" };

/** What the hook does: record, then hand the event to the controller. */
function liveSession(word: ImeWord, steps: TraceEvent[]) {
  const trace = new ImeTrace();
  const c = new ImeController();
  const cells = Array.from({ length: word.length }, (_, i) => word.cells[i] ?? "");
  const apply = (intents: Intent[]) => {
    for (const it of intents) {
      if (it.kind === "commit") for (const w of it.writes) cells[w.index] = w.char;
      if (it.kind === "delete") cells[it.index] = "";
    }
  };
  const feed = (e: TraceEvent) => {
    trace.record(e);
    if (e.type === "setWord") c.setWord(e.word);
    else if (e.type === "flush") apply(c.flush());
    else apply(c.handle(e));
  };
  feed({ type: "setWord", word });
  for (const s of steps) feed(s);
  return { trace, cells };
}

function replay(events: TimedTraceEvent[]) {
  const c = new ImeController();
  let cells: string[] = [];
  for (const { t: _t, ...e } of events) {
    const ev = e as TraceEvent;
    if (ev.type === "setWord") {
      c.setWord(ev.word);
      cells = Array.from({ length: ev.word.length }, (_, i) => ev.word.cells[i] ?? "");
      continue;
    }
    const intents = ev.type === "flush" ? c.flush() : c.handle(ev as ImeEvent);
    for (const it of intents) {
      if (it.kind === "commit") for (const w of it.writes) cells[w.index] = w.char;
      if (it.kind === "delete") cells[it.index] = "";
    }
  }
  return cells;
}

const STEPS: TraceEvent[] = [
  { type: "compositionstart" },
  { type: "compositionupdate", data: "ㅇ" },
  { type: "compositionupdate", data: "아" },
  { type: "compositionupdate", data: "안" },
  { type: "compositionupdate", data: "아" },
  { type: "compositionend", data: "아", value: "아" },
  { type: "compositionstart" },
  { type: "compositionupdate", data: "나" },
  { type: "input", inputType: "insertCompositionText", data: "나", isComposing: true, value: "아나" },
  { type: "flush" },
];

describe("IME trace recorder", () => {
  it("a recording replays through the controller to the same cells", () => {
    const word: ImeWord = { length: 3, selected: 0, cells: ["", "", ""], locked: [false, false, false] };
    const live = liveSession(word, STEPS);
    expect(live.cells).toEqual(["아", "나", ""]);
    const fixture = live.trace.toFixture(META) as { runs: { events: TimedTraceEvent[] }[] };
    expect(replay(fixture.runs[0].events)).toEqual(["아", "나", ""]);
  });

  it("the file has the fixture shape and carries the device facts", () => {
    const { trace } = liveSession({ length: 2, selected: 0, cells: ["", ""] }, STEPS);
    const f = JSON.parse(JSON.stringify(trace.toFixture(META)));
    expect(Object.keys(f)).toEqual(["source", "runs"]);
    expect(f.source).toMatchObject({ trace: "play-board", labVersion: 3, device: "S24 / Samsung Internet", keyboardApp: "삼성 키보드", predictionStrip: true, orientation: "portrait-primary", viewport: [412, 800] });
    expect(Object.keys(f.runs[0]).sort()).toEqual(["autoPass", "case", "events", "expected", "focusLost", "got", "id", "n", "note", "testerVerdict"]);
    expect(f.runs[0].events[0]).toMatchObject({ type: "setWord" });
    const times = f.runs[0].events.map((e: { t: number }) => e.t);
    expect(times).toEqual([...times].sort((a: number, b: number) => a - b));
  });

  it("clear empties it, and it stops growing at the cap", () => {
    const t = new ImeTrace();
    t.record({ type: "blur" });
    expect(t.size).toBe(1);
    t.clear();
    expect(t.size).toBe(0);
    for (let i = 0; i < MAX_TRACE_EVENTS + 50; i++) t.record({ type: "blur" });
    expect(t.size).toBe(MAX_TRACE_EVENTS);
  });

  it("the recorder is off unless the page asks for it, and nothing is sent or stored", async () => {
    const fs = await import("node:fs");
    const board = fs.readFileSync("src/components/student/crossword-play-board.tsx", "utf8");
    expect(board).toMatch(/get\("imetrace"\) === "1"/);
    expect(board).toMatch(/traceOn\s*\?\s*\(e\)\s*=>/);
    const rec = fs.readFileSync("src/components/student/ime-trace.ts", "utf8");
    expect(rec.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB/);
  });
});
