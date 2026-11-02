import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/components/student/play-api";
import { checkWithOneRetry, decidePoll } from "@/components/student/team-board";
import type { TeamState } from "@/features/crossword/play/types";

// M2-3.4 P3 L3: the board's team-mode decisions (the board calls exactly these functions).

const used = { checks: 1, reveals: 0, chosung: 0, wrongSubmits: 0 };
const st = (over: Partial<TeamState>): TeamState => ({ revision: 4, status: "in_progress", changed: false, helpOpen: false, used, ...over });
const none = new Map<string, string | null>();

describe("decidePoll: applying one team-state answer", () => {
  it("an unchanged answer moves only revision, help state and shared counters", () => {
    const d = decidePoll({ state: st({ helpOpen: true }), unconfirmed: none, composing: [], current: { "0,0": "사" }, previous: null });
    expect(d).toEqual({ revision: 4, helpOpen: true, used, completed: false });
  });

  it("merge: server cells, then this student's unconfirmed cells, then the composing word kept as shown", () => {
    const d = decidePoll({
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
    const composing = decidePoll({ state, unconfirmed: none, composing: ["1,1"], current: {}, previous: null });
    expect(composing.grid?.cells).toEqual({});
    const after = decidePoll({ state, unconfirmed: none, composing: [], current: {}, previous: null });
    expect(after.grid?.cells).toEqual({ "1,1": "일" });
  });

  it("revealed cells: unconfirmed cells that became given are discarded and never shown as typed", () => {
    const d = decidePoll({
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
    const remote = decidePoll({
      state: st({ changed: true, cells: { "0,0": "새" }, given: {}, otherKeys: ["0,0"] }),
      unconfirmed: none, composing: [], current: { "0,0": "사" }, previous,
    });
    expect(remote.grid?.teammateChanged).toBe(true);
    const ownSave = decidePoll({
      state: st({ changed: true, cells: { "0,0": "새" }, given: {}, otherKeys: [] }),
      unconfirmed: none, composing: [], current: { "0,0": "새" }, previous,
    });
    expect(ownSave.grid?.teammateChanged).toBe(false);
    const first = decidePoll({
      state: st({ changed: true, cells: { "0,0": "새" }, given: {}, otherKeys: ["0,0"] }),
      unconfirmed: none, composing: [], current: {}, previous: null,
    });
    expect(first.grid?.teammateChanged).toBe(false);
  });

  it("completed is reported so the board freezes", () => {
    expect(decidePoll({ state: st({ status: "completed" }), unconfirmed: none, composing: [], current: {}, previous: null }).completed).toBe(true);
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
