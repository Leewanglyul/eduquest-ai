import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BODY_KEYS } from "@/features/crossword/play/schemas";
import { SaveQueue, type QueueSnapshot, type SaveRequest, type SendOutcome } from "@/components/student/save-queue";

type Sent = { request: SaveRequest; keepalive: boolean };

function setup(initialRevision = 0) {
  const sent: Sent[] = [];
  const snapshots: QueueSnapshot[] = [];
  let outcomes: SendOutcome[] = [];
  let revision = initialRevision;
  let gate: (() => void) | null = null;
  let hold = false;

  const send = vi.fn(async (request: SaveRequest, options: { keepalive: boolean }): Promise<SendOutcome> => {
    sent.push({ request, keepalive: options.keepalive });
    if (hold) await new Promise<void>((resolve) => { gate = resolve; });
    const next = outcomes.shift();
    if (next) return next;
    revision += Object.keys(request.patch).length > 0 ? 1 : 0;
    return { kind: "ok", revision };
  });
  const queue = new SaveQueue({ send, onChange: (s) => snapshots.push(s), initialRevision });
  return {
    queue, sent, snapshots, send,
    states: () => snapshots.map((s) => s.state),
    script: (...o: SendOutcome[]) => { outcomes = o; },
    holdNext: () => { hold = true; },
    release: () => { hold = false; gate?.(); },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SaveQueue: debounce, merge, order (doc 08 C.6)", () => {
  it("sends one merged patch two seconds after the last change", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    await vi.advanceTimersByTimeAsync(1500);
    t.queue.setCell("0,1", "과");
    t.queue.setCell("0,0", "삭"); // the newest value of a cell wins
    await vi.advanceTimersByTimeAsync(1999);
    expect(t.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].request.patch).toEqual({ "0,0": "삭", "0,1": "과" });
    expect(t.sent[0].keepalive).toBe(false);
  });

  it("a request body is exactly { patch, activeMs }: no selection, word or clue can ride along", async () => {
    const t = setup();
    t.queue.setCell("1,1", "일");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(Object.keys(t.sent[0].request).sort()).toEqual([...BODY_KEYS.save]);
  });

  it("an emptied cell is sent as null", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    t.queue.setCell("0,0", null);
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent[0].request.patch).toEqual({ "0,0": null });
  });

  it("one request in flight at a time; changes made meanwhile go in the next one, in order", async () => {
    const t = setup();
    t.holdNext();
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent).toHaveLength(1);
    t.queue.setCell("0,1", "과");
    t.queue.flushNow(); // refused: still in flight
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.sent).toHaveLength(1);
    t.release();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2100);
    expect(t.sent.map((s) => s.request.patch)).toEqual([{ "0,0": "사" }, { "0,1": "과" }]);
  });

  it("flushNow with nothing to send does nothing", async () => {
    const t = setup();
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(10);
    expect(t.sent).toHaveLength(0);
  });

  it("page hide: a keepalive request goes out at once", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    t.queue.flushNow({ keepalive: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent[0].keepalive).toBe(true);
  });

  it("active time is reported and capped at 30 s per save; the rest goes with the next one", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    t.queue.addActiveMs(45_000);
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent[0].request.activeMs).toBe(30_000);
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent[1].request).toEqual({ patch: {}, activeMs: 15_000 });
  });

  it("a reveal discards our copy of the cell", async () => {
    const t = setup();
    t.queue.setCell("0,1", "가");
    t.queue.discard("0,1");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent).toHaveLength(0);
    expect(t.queue.snapshot.pendingCells).toBe(0);
  });

  it("tracks the confirmed revision for check, reveal and submit", async () => {
    const t = setup(7);
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.queue.snapshot.revision).toBe(8);
  });
});

describe("SaveQueue: the three save states (PM SP-3)", () => {
  it("saved -> saving -> saved", async () => {
    const t = setup();
    expect(t.queue.snapshot.state).toBe("saved");
    t.queue.setCell("0,0", "사");
    expect(t.queue.snapshot.state).toBe("saving");
    await vi.advanceTimersByTimeAsync(2100);
    expect(t.queue.snapshot.state).toBe("saved");
    expect(new Set(t.states())).toEqual(new Set(["saving", "saved"]));
  });

  it("a network failure is offline: nothing is lost, it is retried with back-off, then saved", async () => {
    const t = setup();
    t.script({ kind: "offline" }, { kind: "offline" });
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.queue.snapshot.state).toBe("offline");
    expect(t.queue.snapshot.pendingCells).toBe(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(t.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2); // 1 s
    expect(t.sent).toHaveLength(2);
    expect(t.queue.snapshot.state).toBe("offline");
    await vi.advanceTimersByTimeAsync(2001); // 2 s
    expect(t.sent).toHaveLength(3);
    expect(t.queue.snapshot.state).toBe("saved");
    expect(t.sent[2].request.patch).toEqual({ "0,0": "사" });
  });

  it("cells typed while offline join the retry, and a newer value of a cell wins", async () => {
    const t = setup();
    t.script({ kind: "offline" });
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    t.queue.setCell("0,0", "삭");
    t.queue.setCell("0,1", "과");
    expect(t.queue.snapshot.state).toBe("offline");
    await vi.advanceTimersByTimeAsync(1100);
    expect(t.sent[1].request.patch).toEqual({ "0,0": "삭", "0,1": "과" });
    expect(t.queue.snapshot.state).toBe("saved");
  });

  it("coming back online retries at once", async () => {
    const t = setup();
    t.script({ kind: "offline" });
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.queue.snapshot.state).toBe("offline");
    t.queue.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent).toHaveLength(2);
    expect(t.queue.snapshot.state).toBe("saved");
  });

  it("the browser going offline with unsaved cells shows offline before any request fails", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    t.queue.setOnline(false);
    expect(t.queue.snapshot.state).toBe("offline");
  });

  it("a thrown fetch error counts as offline, not a crash", async () => {
    const sent: unknown[] = [];
    const queue = new SaveQueue({
      send: async () => { sent.push(1); throw new Error("network"); },
      onChange: () => {},
      initialRevision: 0,
    });
    queue.setCell("0,0", "사");
    queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.snapshot.state).toBe("offline");
  });

  it("a refusal by the server (closed, read-only) is blocked, not retried, and is not called offline", async () => {
    const t = setup();
    t.script({ kind: "rejected", code: "READONLY" });
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.queue.snapshot.blocked).toBe("READONLY");
    expect(t.queue.snapshot.state).not.toBe("offline");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.sent).toHaveLength(1);
    t.queue.setCell("0,1", "과"); // ignored once blocked
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.sent).toHaveLength(1);
  });

  it("only the three states exist", async () => {
    const t = setup();
    t.script({ kind: "offline" });
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(5000);
    for (const s of t.states()) expect(["saving", "saved", "offline"]).toContain(s);
  });
});

describe("SaveQueue.idle(): tools work on SAVED state", () => {
  it("resolves true at once when nothing is waiting", async () => {
    const t = setup();
    await expect(t.queue.idle()).resolves.toBe(true);
  });

  it("flushes and resolves true once the cells are saved", async () => {
    const t = setup();
    t.queue.setCell("0,0", "사");
    const p = t.queue.idle();
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe(true);
    expect(t.sent).toHaveLength(1);
  });

  it("resolves false while offline, so a check is not run against stale cells", async () => {
    const t = setup();
    t.script({ kind: "offline" });
    t.queue.setCell("0,0", "사");
    const p = t.queue.idle();
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe(false);
  });

  it("resolves false when blocked", async () => {
    const t = setup();
    t.script({ kind: "rejected", code: null });
    t.queue.setCell("0,0", "사");
    t.queue.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.queue.snapshot.blocked).toBe("UNKNOWN");
    await expect(t.queue.idle()).resolves.toBe(false);
  });
});
