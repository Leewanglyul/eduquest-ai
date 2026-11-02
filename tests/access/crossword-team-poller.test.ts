import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeamPoller, type PollOutcome } from "@/components/student/team-poller";
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
  const poller = new TeamPoller({ fetchState, onState: (s) => seen.push(s), onStop: (c) => stops.push(c), initialKnown });
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
