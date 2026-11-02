import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SaveQueue, type QueueSnapshot, type SaveRequest, type SendOutcome } from "@/components/student/save-queue";

// M2-3.4 P3 checkpoint: the two SaveQueue additions for team mode, unconfirmed() (K-1 overlay) and recoverLocked (K-5),
// and proof that a queue built without recoverLocked (individual mode) behaves exactly as before.

function setup(options: { recoverLocked?: () => Promise<ReadonlySet<string>> } = {}) {
  const sent: SaveRequest[] = [];
  const snapshots: QueueSnapshot[] = [];
  let outcomes: SendOutcome[] = [];
  let revision = 0;
  let gate: (() => void) | null = null;
  let hold = false;
  const send = vi.fn(async (request: SaveRequest): Promise<SendOutcome> => {
    sent.push(request);
    if (hold) await new Promise<void>((resolve) => { gate = resolve; });
    const next = outcomes.shift();
    if (next) return next;
    revision += 1;
    return { kind: "ok", revision };
  });
  const queue = new SaveQueue({ send, onChange: (s) => snapshots.push(s), initialRevision: 0, ...options });
  return {
    queue, sent, snapshots,
    last: () => snapshots[snapshots.length - 1],
    script: (...o: SendOutcome[]) => { outcomes = o; },
    holdNext: () => { hold = true; },
    release: () => { hold = false; gate?.(); },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("unconfirmed(): what the board overlays on polled cells (K-1)", () => {
  it("holds waiting cells, then in-flight cells, and is empty once confirmed", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    expect([...t.queue.unconfirmed()]).toEqual([["0,0", "사"]]);
    t.holdNext();
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent).toHaveLength(1);
    expect([...t.queue.unconfirmed()]).toEqual([["0,0", "사"]]); // in flight, not confirmed yet
    t.queue.setCell("0,1", "과");
    expect(Object.fromEntries(t.queue.unconfirmed())).toEqual({ "0,0": "사", "0,1": "과" });
    t.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(Object.fromEntries(t.queue.unconfirmed())).toEqual({ "0,1": "과" });
  });

  it("a newer waiting value of a cell wins over its in-flight value", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    t.holdNext();
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    t.queue.setCell("0,0", "삭");
    expect(t.queue.unconfirmed().get("0,0")).toBe("삭");
    t.queue.setCell("0,0", null);
    expect(t.queue.unconfirmed().get("0,0")).toBeNull();
    t.release();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("is a copy: changing it does not change the queue", () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    t.queue.unconfirmed().delete("0,0");
    expect(t.queue.unconfirmed().has("0,0")).toBe(true);
  });
});

describe("recoverLocked: a teammate revealed a cell I was saving (K-5)", () => {
  it("drops only the newly given cells and resends the rest, without blocking", async () => {
    const recoverLocked = vi.fn(async () => new Set(["0,1"]));
    const t = setup({ recoverLocked });
    t.script({ kind: "rejected", code: "LOCKED_CELL" });
    t.queue.setCell("0,0", "사");
    t.queue.setCell("0,1", "과");
    t.queue.setCell("0,2", "일");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(recoverLocked).toHaveBeenCalledTimes(1);
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1].patch).toEqual({ "0,0": "사", "0,2": "일" });
    expect(t.last().blocked).toBeNull();
    expect(t.last().state).toBe("saved");
    expect(t.queue.unconfirmed().size).toBe(0);
  });

  it("when every refused cell is given, the queue settles as saved and sends nothing more", async () => {
    const t = setup({ recoverLocked: async () => new Set(["0,0", "0,1"]) });
    t.script({ kind: "rejected", code: "LOCKED_CELL" });
    t.queue.setCell("0,0", "사");
    t.queue.setCell("0,1", "과");
    const idle = t.queue.idle();
    await vi.advanceTimersByTimeAsync(0);
    expect(await idle).toBe(true);
    expect(t.sent).toHaveLength(1);
    expect(t.last().blocked).toBeNull();
    expect(t.last().state).toBe("saved");
  });

  it("a cell typed while the refused save was in flight is kept unless it is given", async () => {
    const t = setup({ recoverLocked: async () => new Set(["0,0"]) });
    t.script({ kind: "rejected", code: "LOCKED_CELL" });
    t.queue.setCell("0,0", "사");
    t.holdNext();
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    t.queue.setCell("1,1", "도");
    t.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent[1].patch).toEqual({ "1,1": "도" });
  });

  it("when none of the refused cells is given, or recovery fails, the queue blocks exactly as before", async () => {
    const none = setup({ recoverLocked: async () => new Set(["9,9"]) });
    none.script({ kind: "rejected", code: "LOCKED_CELL" });
    none.queue.setCell("0,0", "사");
    none.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(none.last().blocked).toBe("LOCKED_CELL");
    expect(none.sent).toHaveLength(1);

    const failing = setup({ recoverLocked: async () => { throw new Error("poll failed"); } });
    failing.script({ kind: "rejected", code: "LOCKED_CELL" });
    failing.queue.setCell("0,0", "사");
    failing.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(failing.last().blocked).toBe("LOCKED_CELL");
    expect(failing.sent).toHaveLength(1);
  });

  it("other refusals are not recovered: READONLY still blocks and recoverLocked is not asked", async () => {
    const recoverLocked = vi.fn(async () => new Set(["0,0"]));
    const t = setup({ recoverLocked });
    t.script({ kind: "rejected", code: "READONLY" });
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(recoverLocked).not.toHaveBeenCalled();
    expect(t.last().blocked).toBe("READONLY");
  });
});

describe("freeze(): the team completed the puzzle (K-9)", () => {
  it("discards unsent cells and never sends again", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    t.queue.freeze();
    expect(t.queue.unconfirmed().size).toBe(0);
    expect(t.last().blocked).toBe("READONLY");
    t.queue.setCell("0,1", "과");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.sent).toHaveLength(0);
    expect(await t.queue.idle()).toBe(false);
  });

  it("a save in flight when frozen is not put back or retried, whatever the answer", async () => {
    for (const outcome of [{ kind: "offline" } as const, { kind: "rejected", code: "READONLY" } as const, undefined]) {
      const t = setup();
      if (outcome) t.script(outcome);
      t.queue.setCell("0,0", "사");
      t.holdNext();
      t.queue.flushNow();
      await vi.advanceTimersByTimeAsync(0);
      t.queue.freeze();
      t.release();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(t.sent).toHaveLength(1);
      expect(t.queue.unconfirmed().size).toBe(0);
      expect(t.last().blocked).toBe("READONLY");
    }
  });

  it("a pending idle() wait resolves false at freeze", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    t.queue.setOnline(false);
    t.script({ kind: "offline" });
    const wait = t.queue.idle();
    await vi.advanceTimersByTimeAsync(0);
    t.queue.freeze();
    expect(await wait).toBe(false);
  });
});

describe("individual mode (no recoverLocked) is unchanged", () => {
  it("LOCKED_CELL blocks, keeps the cells and sends nothing more", async () => {
    const t = setup();
    t.script({ kind: "rejected", code: "LOCKED_CELL" });
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.last().blocked).toBe("LOCKED_CELL");
    t.queue.setCell("0,1", "과"); // ignored once blocked
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.sent).toHaveLength(1);
  });

  it("offline backs off and keeps the cells; back online retries at once", async () => {
    const t = setup();
    t.script({ kind: "offline" }, { kind: "offline" });
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.last().state).toBe("offline");
    expect(t.queue.unconfirmed().get("0,0")).toBe("사");
    await vi.advanceTimersByTimeAsync(1000); // first backoff step
    expect(t.sent).toHaveLength(2);
    t.queue.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent).toHaveLength(3);
    expect(t.last().state).toBe("saved");
    expect(t.queue.unconfirmed().size).toBe(0);
  });
});

describe("R2 D: LOCKED_CELL recovery is bounded to one attempt per refused batch", () => {
  it("a second LOCKED_CELL on the resend does not loop: the queue blocks and keeps the unknown cells", async () => {
    const recoverLocked = vi.fn(async () => new Set(["0,1"]));
    const t = setup({ recoverLocked });
    t.script({ kind: "rejected", code: "LOCKED_CELL" }, { kind: "rejected", code: "LOCKED_CELL" });
    t.queue.setCell("0,0", "사");
    t.queue.setCell("0,1", "과");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recoverLocked).toHaveBeenCalledTimes(1);
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1].patch).toEqual({ "0,0": "사" });
    expect(t.last().blocked).toBe("LOCKED_CELL");
    expect(t.queue.unconfirmed().get("0,0")).toBe("사"); // not silently discarded
  });

  it("a key the recovery does not report as given is never dropped", async () => {
    const t = setup({ recoverLocked: async () => new Set(["0,1"]) });
    t.script({ kind: "rejected", code: "LOCKED_CELL" });
    t.queue.setCell("0,0", "사");
    t.queue.setCell("0,1", "과");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent[1].patch).toEqual({ "0,0": "사" });
  });

  it("after a successful save the next refused batch may recover once again", async () => {
    const recoverLocked = vi.fn(async () => new Set(["0,1", "1,1"]));
    const t = setup({ recoverLocked });
    t.script({ kind: "rejected", code: "LOCKED_CELL" }); // batch 1: recovered, resend succeeds
    t.queue.setCell("0,0", "사");
    t.queue.setCell("0,1", "과");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.last().blocked).toBeNull();
    t.script({ kind: "rejected", code: "LOCKED_CELL" }); // batch 2: a new refusal, recovered again
    t.queue.setCell("1,1", "일");
    t.queue.setCell("1,2", "기");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(recoverLocked).toHaveBeenCalledTimes(2);
    expect(t.last().blocked).toBeNull();
  });
});
