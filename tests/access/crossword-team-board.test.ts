import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/components/student/play-api";
import { applyResultOf, checkWithOneRetry, decidePoll, makeLockedRecovery, teacherCallDeadline } from "@/components/student/team-board";
import type { TeamState } from "@/features/crossword/play/types";

// M2-3.4 P3 L3: the board's team-mode decisions (the board calls exactly these functions).

const used = { checks: 1, reveals: 0, chosung: 0, wrongSubmits: 0 };
const st = (over: Partial<TeamState>): TeamState => ({ revision: 4, status: "in_progress", changed: false, helpOpen: false, used, ...over });
const none = new Map<string, string | null>();

describe("decidePoll: applying one team-state answer", () => {
  it("an unchanged answer moves only revision, help state and shared counters", () => {
    const d = decidePoll({ acknowledged: 0, state: st({ helpOpen: true }), unconfirmed: none, composing: [], current: { "0,0": "사" }, previous: null });
    expect(d).toEqual({ revision: 4, helpOpen: true, used, completed: false, ignored: false });
  });

  it("merge: server cells, then this student's unconfirmed cells, then the composing word kept as shown", () => {
    const d = decidePoll({ acknowledged: 0,
      state: st({ changed: true, cells: { "0,0": "사", "0,1": "과", "1,1": "일" }, given: {}, otherKeys: ["1,1"] }),
      unconfirmed: new Map<string, string | null>([["0,1", "고"]]),
      composing: ["1,1", "1,2"],
      current: { "1,1": "이" },
      previous: null,
    });
    expect(d.grid?.cells).toEqual({ "0,0": "사", "0,1": "고", "1,1": "이" });
  });

  it("IME protection: a teammate's letter in the cell being composed waits until composition ends", () => {
    const state = st({ changed: true, cells: { "1,1": "일" }, given: {}, otherKeys: ["1,1"] });
    const composing = decidePoll({ acknowledged: 0, state, unconfirmed: none, composing: ["1,1"], current: {}, previous: null });
    expect(composing.grid?.cells).toEqual({});
    // Gate 3 C-4: the held cell makes this answer partial, so the poller does not count revision 4 as known
    expect(composing.grid?.held).toEqual(["1,1"]);
    expect(applyResultOf(composing)).toBe("partial");
    // the board's resync after the composition asks for the whole grid again and applies it in full
    const after = decidePoll({ acknowledged: 0, state, unconfirmed: none, composing: [], current: {}, previous: null });
    expect(after.grid?.cells).toEqual({ "1,1": "일" });
    expect(after.grid?.held).toEqual([]);
    expect(applyResultOf(after)).toBe("applied");
  });

  it("revealed cells: unconfirmed cells that became given are discarded and never shown as typed", () => {
    const d = decidePoll({ acknowledged: 0,
      state: st({ changed: true, cells: {}, given: { "0,1": "과" }, otherKeys: [] }),
      unconfirmed: new Map<string, string | null>([["0,1", "고"], ["0,0", "사"]]),
      composing: [],
      current: { "0,1": "고", "0,0": "사" },
      previous: null,
    });
    expect(d.grid?.discard).toEqual(["0,1"]);
    expect(d.grid?.cells).toEqual({ "0,0": "사" });
    expect(d.grid?.changedKeys).toContain("0,1");
  });

  it("teammate notice: only for a real remote change to a cell this student wrote", () => {
    const previous = { cells: { "0,0": "사" }, otherKeys: [] };
    const remote = decidePoll({ acknowledged: 0,
      state: st({ changed: true, cells: { "0,0": "새" }, given: {}, otherKeys: ["0,0"] }),
      unconfirmed: none, composing: [], current: { "0,0": "사" }, previous,
    });
    expect(remote.grid?.teammateChanged).toBe(true);
    const ownSave = decidePoll({ acknowledged: 0,
      state: st({ changed: true, cells: { "0,0": "새" }, given: {}, otherKeys: [] }),
      unconfirmed: none, composing: [], current: { "0,0": "새" }, previous,
    });
    expect(ownSave.grid?.teammateChanged).toBe(false);
    const first = decidePoll({ acknowledged: 0,
      state: st({ changed: true, cells: { "0,0": "새" }, given: {}, otherKeys: ["0,0"] }),
      unconfirmed: none, composing: [], current: {}, previous: null,
    });
    expect(first.grid?.teammateChanged).toBe(false);
  });

  it("completed is reported so the board freezes", () => {
    expect(decidePoll({ acknowledged: 0, state: st({ status: "completed" }), unconfirmed: none, composing: [], current: {}, previous: null }).completed).toBe(true);
  });
});

describe("checkWithOneRetry (K-6, P3-D6)", () => {
  type R = ApiResult<{ ok: true }>;
  const STALE: R = { ok: false, kind: "rejected", code: "STALE", status: 409 };
  const OK: R = { ok: true, data: { ok: true } };
  const run = (answers: R[], team = true, open = true) => {
    const check = vi.fn(async () => answers.shift()!);
    const pollNow = vi.fn(async () => {});
    const nextRevision = vi.fn(async () => 9);
    const result = checkWithOneRetry({ team, check, firstRevision: 4, pollNow, nextRevision, stillOpen: () => open });
    return { result, check, pollNow, nextRevision };
  };

  it("team: STALE polls, takes the new revision and retries exactly once", async () => {
    const t = run([STALE, OK]);
    expect(await t.result).toEqual(OK);
    expect(t.check.mock.calls.map((c) => (c as unknown as [number])[0])).toEqual([4, 9]);
    expect(t.pollNow).toHaveBeenCalledTimes(1);
  });

  it("team: a second STALE is 'busy', never a third try", async () => {
    const t = run([STALE, STALE, OK]);
    expect(await t.result).toEqual({ ok: false, kind: "busy" });
    expect(t.check).toHaveBeenCalledTimes(2);
  });

  it("team: the team completed during the poll, so no retry is sent", async () => {
    const t = run([STALE, OK], true, false);
    expect(await t.result).toEqual({ ok: false, kind: "skipped" });
    expect(t.check).toHaveBeenCalledTimes(1);
  });

  it("individual mode never retries: the STALE goes back to the board (which reloads)", async () => {
    const t = run([STALE, OK], false);
    expect(await t.result).toEqual(STALE);
    expect(t.check).toHaveBeenCalledTimes(1);
    expect(t.pollNow).not.toHaveBeenCalled();
  });

  it("other answers are passed through unchanged", async () => {
    const limit: R = { ok: false, kind: "rejected", code: "CHECK_LIMIT", status: 403 };
    expect(await run([limit]).result).toEqual(limit);
    expect(await run([{ ok: false, kind: "offline" }]).result).toEqual({ ok: false, kind: "offline" });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// R2 findings (2026-11-03)
// ---------------------------------------------------------------------------------------------------------------

describe("R2 C: a poll answer older than this student's acknowledged save is ignored", () => {
  it("poll for revision 10 in flight, save acknowledged 11, poll 10 arrives: ignored, no rollback, no notice", () => {
    // before: the student typed 0,0 = 새, the save was acknowledged at revision 11 (queue empty again)
    const previous = { cells: { "0,0": "사" }, otherKeys: [] };
    const late = decidePoll({
      acknowledged: 11,
      state: st({ revision: 10, changed: true, cells: { "0,0": "사" }, given: {}, otherKeys: ["0,0"] }),
      unconfirmed: none,
      composing: [],
      current: { "0,0": "새" },
      previous,
    });
    expect(late.ignored).toBe(true);
    expect(late.grid).toBeUndefined(); // nothing to apply: the screen keeps 새
    // the next answer at 11 or above is applied normally
    const fresh = decidePoll({
      acknowledged: 11,
      state: st({ revision: 11, changed: true, cells: { "0,0": "새" }, given: {}, otherKeys: [] }),
      unconfirmed: none,
      composing: [],
      current: { "0,0": "새" },
      previous,
    });
    expect(fresh.ignored).toBe(false);
    expect(fresh.grid?.cells).toEqual({ "0,0": "새" });
    expect(fresh.grid?.teammateChanged).toBe(false);
  });

  it("an ignored answer still reports a completion", () => {
    expect(decidePoll({ acknowledged: 9, state: st({ revision: 8, status: "completed" }), unconfirmed: none, composing: [], current: {}, previous: null })).toMatchObject({ ignored: true, completed: true });
  });
});

describe("R2 D: LOCKED_CELL recovery reads the current team state first", () => {
  it("polls before reading given, so a stale given copy is never used", async () => {
    let given: Record<string, string> = {}; // stale: the teammate's reveal is not known yet
    const order: string[] = [];
    const recover = makeLockedRecovery(
      async () => { order.push("poll"); given = { "0,1": "과" }; },
      () => { order.push("read"); return given; },
    );
    expect([...(await recover())]).toEqual(["0,1"]);
    expect(order).toEqual(["poll", "read"]);
  });
});

describe("R2 H: the teacher-call wait comes from the server's seconds", () => {
  it("starts from retryAfterSeconds, and a later refusal replaces it with the server's new value", () => {
    expect(teacherCallDeadline(1_000, 42)).toBe(43_000);
    expect(teacherCallDeadline(50_000, 7)).toBe(57_000); // resynchronised, not added to the old one
    expect(teacherCallDeadline(1_000, undefined)).toBeNull(); // no server value: no invented countdown
    expect(teacherCallDeadline(1_000, 0)).toBeNull();
  });
});

describe("R2 G: individual assignment with team play ON keeps the individual STALE path", () => {
  it("team = false (an individual payload never has `team`, even with the switch on): no poll, no retry, the STALE goes to the reload path", async () => {
    const STALE: ApiResult<{ ok: true }> = { ok: false, kind: "rejected", code: "STALE", status: 409 };
    const check = vi.fn(async () => STALE);
    const pollNow = vi.fn(async () => {});
    const r = await checkWithOneRetry({ team: false, check, firstRevision: 1, pollNow, nextRevision: async () => 2, stillOpen: () => true });
    expect(r).toBe(STALE);
    expect(check).toHaveBeenCalledTimes(1);
    expect(pollNow).not.toHaveBeenCalled();
  });
});

describe("Gate 3 C-4: applyResultOf", () => {
  const base = { unconfirmed: none, previous: null };
  it("an unchanged answer is applied", () => {
    expect(applyResultOf(decidePoll({ ...base, acknowledged: 0, state: st({}), composing: ["0,0"], current: {} }))).toBe("applied");
  });
  it("an answer older than the acknowledged save is skipped", () => {
    expect(applyResultOf(decidePoll({ ...base, acknowledged: 9, state: st({ revision: 8, changed: true, cells: {}, given: {} }), composing: [], current: {} }))).toBe("skipped");
  });
  it("a composed cell that matches the server is not held", () => {
    const d = decidePoll({ ...base, acknowledged: 0, state: st({ changed: true, cells: { "0,0": "사" }, given: {} }), composing: ["0,0", "0,1"], current: { "0,0": "사" } });
    expect(d.grid?.held).toEqual([]);
    expect(applyResultOf(d)).toBe("applied");
  });
  it("this student's own unsaved cell is kept on screen and not held, but the answer is still partial", () => {
    const unconfirmed = new Map<string, string | null>([["0,0", "새"]]);
    const d = decidePoll({ acknowledged: 0, unconfirmed, previous: null, state: st({ changed: true, cells: { "0,0": "사" }, given: {} }), composing: ["0,0"], current: { "0,0": "새" } });
    expect(d.grid?.cells["0,0"]).toBe("새"); // real input, kept (K-1)
    expect(d.grid?.held).toEqual([]); // no composition resync needed for it
    expect(d.grid?.overlaid).toEqual(["0,0"]);
    expect(applyResultOf(d)).toBe("partial"); // T4 seed 70: the server may hold a later letter once this save lands
  });
  it("unsaved input equal to the server's letter is not a difference", () => {
    const unconfirmed = new Map<string, string | null>([["0,0", "사"]]);
    const d = decidePoll({ acknowledged: 0, unconfirmed, previous: null, state: st({ changed: true, cells: { "0,0": "사" }, given: {} }), composing: [], current: { "0,0": "사" } });
    expect(d.grid?.overlaid).toEqual([]);
    expect(applyResultOf(d)).toBe("applied");
  });
  it("a given cell is never held", () => {
    const d = decidePoll({ ...base, acknowledged: 0, state: st({ changed: true, cells: {}, given: { "0,0": "사" } }), composing: ["0,0"], current: { "0,0": "가" } });
    expect(d.grid?.held).toEqual([]);
  });
});
