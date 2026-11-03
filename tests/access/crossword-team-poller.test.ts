import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeamPoller, type ApplyResult, type PollOutcome } from "@/components/student/team-poller";
import type { TeamState } from "@/features/crossword/play/types";

// M2-3.4 P3 checkpoint: TeamPoller cadence and rules (P3-D3, readiness section 2), with a fake fetch and fake timers.

const state = (revision: number, extra: Partial<TeamState> = {}): TeamState => ({
  revision, status: "in_progress", changed: false, helpOpen: false,
  used: { checks: 0, reveals: 0, chosung: 0, wrongSubmits: 0 }, ...extra,
});

function setup(initialKnown: number | null = 0) {
  const calls: (number | null)[] = [];
  const seen: TeamState[] = [];
  const stops: unknown[] = [];
  let outcomes: PollOutcome[] = [];
  let revision = initialKnown ?? 0;
  let hold = false;
  let gate: (() => void) | null = null;
  const fetchState = vi.fn(async (known: number | null): Promise<PollOutcome> => {
    calls.push(known);
    if (hold) await new Promise<void>((resolve) => { gate = resolve; });
    return outcomes.shift() ?? { kind: "ok", state: state(revision) };
  });
  const poller = new TeamPoller({ fetchState, onState: (s) => { seen.push(s); return "applied"; }, onStop: (c) => stops.push(c), initialKnown });
  return {
    poller, calls, seen, stops,
    script: (...o: PollOutcome[]) => { outcomes = o; },
    bump: (to: number) => { revision = to; },
    holdNext: () => { hold = true; },
    release: () => { hold = false; gate?.(); },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("cadence", () => {
  it("polls every four seconds once started", async () => {
    const t = setup();
    t.poller.start();
    await vi.advanceTimersByTimeAsync(3999);
    expect(t.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(t.calls).toHaveLength(2);
    t.poller.dispose();
  });

  it("never runs two requests at once; a poll asked for meanwhile runs right after", async () => {
    const t = setup();
    t.holdNext();
    const first = t.poller.pollNow();
    await vi.advanceTimersByTimeAsync(0);
    const second = t.poller.pollNow();
    const third = t.poller.pollNow();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.calls).toHaveLength(1); // still waiting for the first
    t.release();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([first, second, third]);
    expect(t.calls).toHaveLength(2); // one queued follow-up, not one per request
    t.poller.dispose();
  });

  it("pauses while hidden and polls at once when visible again", async () => {
    const t = setup();
    t.poller.start();
    t.poller.setVisible(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls).toHaveLength(0);
    t.poller.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(t.calls).toHaveLength(2);
    t.poller.dispose();
  });

  it("pauses while offline and polls at once when back online", async () => {
    const t = setup();
    t.poller.start();
    t.poller.setOnline(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls).toHaveLength(0);
    t.poller.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(1);
    t.poller.dispose();
  });
});

describe("stopping and backoff", () => {
  it("stops after reporting a completed attempt", async () => {
    const t = setup();
    t.script({ kind: "ok", state: state(5, { status: "completed", participation: { me: true, all: true } }) });
    await t.poller.pollNow();
    expect(t.seen.at(-1)?.status).toBe("completed");
    expect(t.poller.active).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    await t.poller.pollNow();
    expect(t.calls).toHaveLength(1);
  });

  it("stops on a refusal (404 NOT_FOUND) and reports it once", async () => {
    const t = setup();
    t.script({ kind: "rejected", code: "NOT_FOUND" });
    t.poller.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(t.stops).toEqual(["NOT_FOUND"]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls).toHaveLength(1);
  });

  it("backs off 1, 2, 4 s on network failures and returns to four seconds after a success", async () => {
    const t = setup();
    t.script({ kind: "offline" }, { kind: "offline" }, { kind: "offline" });
    await t.poller.pollNow(); // failure 1
    await vi.advanceTimersByTimeAsync(1000); // failure 2
    expect(t.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000); // failure 3
    expect(t.calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(3999);
    expect(t.calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1); // after 4 s: success
    expect(t.calls).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(4000);
    expect(t.calls).toHaveLength(5);
    t.poller.dispose();
  });

  it("after dispose nothing runs and a late answer is ignored", async () => {
    const t = setup();
    t.holdNext();
    void t.poller.pollNow();
    await vi.advanceTimersByTimeAsync(0);
    t.poller.dispose();
    t.release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.seen).toHaveLength(0);
    expect(t.calls).toHaveLength(1);
  });
});

describe("known revision", () => {
  it("sends the revision of the last team-state answer, and only that answer moves it", async () => {
    const t = setup(null);
    t.bump(3);
    await t.poller.pollNow();
    expect(t.calls[0]).toBeNull();
    expect(t.poller.known).toBe(3);
    t.bump(7);
    await t.poller.pollNow();
    expect(t.calls[1]).toBe(3);
    expect(t.poller.known).toBe(7);
    t.script({ kind: "offline" });
    await t.poller.pollNow();
    expect(t.poller.known).toBe(7); // a failed poll does not move it
    t.poller.dispose();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Gate 3 C-4 (2026-11-03): the known revision means "the board fully applied it", not "the answer arrived"
// ---------------------------------------------------------------------------------------------------------------

function applySetup(results: (ApplyResult | "throw")[], opts: { revision?: number; degradedAfter?: number } = {}) {
  const calls: (number | null)[] = [];
  const health: boolean[] = [];
  let outcomes: PollOutcome[] = [];
  let revision = opts.revision ?? 5;
  const fetchState = vi.fn(async (known: number | null): Promise<PollOutcome> => {
    calls.push(known);
    return outcomes.shift() ?? { kind: "ok", state: state(revision, { changed: known !== revision }) };
  });
  const onState = vi.fn((): ApplyResult => {
    const r = results.shift() ?? "applied";
    if (r === "throw") throw new Error("apply failed");
    return r;
  });
  const poller = new TeamPoller({
    fetchState, onState, onStop: () => {}, onHealth: (d) => health.push(d), initialKnown: null, degradedAfter: opts.degradedAfter,
  });
  return { poller, calls, health, onState, script: (...o: PollOutcome[]) => { outcomes = o; }, bump: (to: number) => { revision = to; } };
}

describe("C-4: apply results move the known revision", () => {
  it("applied: known becomes the answer's revision and the next request sends it", async () => {
    const t = applySetup(["applied"]);
    await t.poller.pollNow();
    expect(t.poller.known).toBe(5);
    await t.poller.pollNow();
    expect(t.calls).toEqual([null, 5]);
    t.poller.dispose();
  });

  it("partial: known becomes null, so the next request asks for the whole grid (T2)", async () => {
    const t = applySetup(["applied", "partial"]);
    await t.poller.pollNow();
    t.bump(6);
    await t.poller.pollNow(); // revision 6 arrives, but cells were held
    expect(t.poller.known).toBeNull();
    await t.poller.pollNow();
    expect(t.calls).toEqual([null, 5, null]);
    t.poller.dispose();
  });

  it("partial is never re-sent as known: the old bug's changed=false answer cannot happen", async () => {
    const t = applySetup(["partial", "applied"]);
    await t.poller.pollNow();
    await t.poller.pollNow();
    // both requests got the whole grid (changed=true); the second one, fully applied, finally moves known
    expect(t.calls).toEqual([null, null]);
    expect(t.poller.known).toBe(5);
    t.poller.dispose();
  });

  it("skipped: known becomes null and the whole grid is asked for at once, without waiting four seconds (T6)", async () => {
    const t = applySetup(["skipped", "applied"]);
    await t.poller.pollNow();
    expect(t.calls).toEqual([null, null]); // the immediate second request
    expect(t.poller.known).toBe(5);
    t.poller.dispose();
  });

  it("skipped answers in a row re-poll at once at most twice, then wait for the normal interval", async () => {
    const t = applySetup(["skipped", "skipped", "skipped", "applied"]);
    await t.poller.pollNow();
    expect(t.calls).toHaveLength(3);
    t.poller.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(t.calls).toHaveLength(4);
    expect(t.poller.known).toBe(5);
    t.poller.dispose();
  });

  it("resync while a poll is in flight: the next request still asks for the whole grid", async () => {
    let release: (() => void) | null = null;
    const calls: (number | null)[] = [];
    const poller = new TeamPoller({
      fetchState: async (known) => {
        calls.push(known);
        if (calls.length === 2) await new Promise<void>((r) => { release = r; });
        return { kind: "ok", state: state(9, { changed: known !== 9 }) };
      },
      onState: () => "applied", onStop: () => {}, initialKnown: null,
    });
    await poller.pollNow(); // known = 9
    const inFlight = poller.pollNow(); // sends 9 and waits
    const resync = poller.resync();
    release!();
    await inFlight;
    await resync;
    expect(calls).toEqual([null, 9, null]);
    poller.dispose();
  });
});

describe("C-4: polling survives an error while applying an answer (T5)", () => {
  it("the error is caught, known becomes null and the next poll runs on schedule", async () => {
    const t = applySetup(["applied", "throw", "applied"]);
    t.poller.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(t.poller.known).toBe(5);
    await vi.advanceTimersByTimeAsync(4000);
    expect(t.onState).toHaveBeenCalledTimes(2);
    expect(t.poller.known).toBeNull();
    expect(t.poller.active).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.calls.length).toBeGreaterThanOrEqual(3);
    expect(t.calls[2]).toBeNull(); // the whole grid after the failure
    expect(t.poller.known).toBe(5);
    t.poller.dispose();
  });
});

describe("C-4: degraded sync after three failures in a row", () => {
  it("network, server and apply failures count together; the third reports degraded once", async () => {
    const t = applySetup(["throw"]);
    t.script({ kind: "offline" }, { kind: "offline" });
    await t.poller.pollNow(); // network
    await t.poller.pollNow(); // server (5xx is "offline" too)
    expect(t.health).toEqual([]);
    await t.poller.pollNow(); // apply error
    expect(t.health).toEqual([true]);
    expect(t.poller.isDegraded).toBe(true);
    t.script({ kind: "offline" });
    await t.poller.pollNow();
    expect(t.health).toEqual([true]); // reported once, not on every failure
    t.poller.dispose();
  });

  it("the first good answer clears it", async () => {
    const t = applySetup([]);
    t.script({ kind: "offline" }, { kind: "offline" }, { kind: "offline" });
    for (let i = 0; i < 3; i += 1) await t.poller.pollNow();
    expect(t.health).toEqual([true]);
    await t.poller.pollNow();
    expect(t.health).toEqual([true, false]);
    expect(t.poller.isDegraded).toBe(false);
    t.poller.dispose();
  });

  it("an unchanged answer (changed = false) is a good answer, never a failure", async () => {
    const t = applySetup([]);
    await t.poller.pollNow(); // whole grid, applied
    t.script({ kind: "offline" }, { kind: "offline" });
    await t.poller.pollNow();
    await t.poller.pollNow();
    for (let i = 0; i < 5; i += 1) await t.poller.pollNow(); // changed = false each time
    expect(t.calls.slice(3)).toEqual([5, 5, 5, 5, 5]);
    expect(t.health).toEqual([]);
    t.poller.dispose();
  });

  it("partial and skipped answers are good answers too", async () => {
    const t = applySetup(["partial", "skipped", "partial"]);
    t.script({ kind: "offline" }, { kind: "offline" });
    await t.poller.pollNow();
    await t.poller.pollNow();
    await t.poller.pollNow();
    expect(t.health).toEqual([]);
    t.poller.dispose();
  });
});
