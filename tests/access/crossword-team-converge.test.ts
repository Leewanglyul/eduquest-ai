import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SaveQueue } from "@/components/student/save-queue";
import { applyResultOf, decidePoll } from "@/components/student/team-board";
import { TeamPoller, type ApplyResult } from "@/components/student/team-poller";
import type { TeamSnapshot } from "@/features/crossword/play/team";
import type { CellKey, TeamState } from "@/features/crossword/play/types";

// Gate 3 C-4 (2026-11-03): boards of one team against ONE fake server, with the real SaveQueue, TeamPoller and
// decidePoll. The fake server follows the SQL functions: a save bumps the revision only when a value really changes and
// records the writer; team state returns cells only when the known revision differs (fn_crossword_team_state).
// Every request reads or writes the server when it ARRIVES and answers later, so answers can overtake each other.

type Delay = () => number;

class FakeServer {
  revision = 0;
  cells: Record<CellKey, string> = {};
  given: Record<CellKey, string> = {};
  writers: Record<CellKey, string> = {};

  save(student: string, patch: Record<CellKey, string | null>): number {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if ((this.cells[k] ?? null) === v) continue;
      changed = true;
      if (v === null) {
        delete this.cells[k];
        delete this.writers[k];
      } else {
        this.cells[k] = v;
        this.writers[k] = student;
      }
    }
    if (changed) this.revision += 1;
    return this.revision;
  }

  state(student: string, known: number | null): TeamState {
    const changed = known !== this.revision;
    const out: TeamState = { revision: this.revision, status: "in_progress", changed, helpOpen: false, used: { checks: 0, reveals: 0, chosung: 0, wrongSubmits: 0 } };
    if (changed) {
      out.cells = { ...this.cells };
      out.given = { ...this.given };
      out.otherKeys = Object.keys(this.writers).filter((k) => this.writers[k] !== student).sort();
    }
    return out;
  }
}

/** A delay on the fake clock; zero answers on the next microtask (so a test can simply await a poll). */
const wait = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** The board's team-mode state and its applyTeamState / onSettled, without React (crossword-play-board.tsx). */
class Board {
  current: Record<CellKey, string> = {};
  given: Record<CellKey, string> = {};
  snapshot: TeamSnapshot | null = null;
  /** The selected word's cells while a composition is open (K-2), else empty. */
  composing: CellKey[] = [];
  pending: { key: CellKey; ch: string } | null = null;
  resyncNeeded = false;
  notices = 0;
  results: ApplyResult[] = [];
  requests: (number | null)[] = [];
  readonly queue: SaveQueue;
  readonly poller: TeamPoller;

  constructor(
    readonly id: string,
    server: FakeServer,
    delays: { arrive: Delay; answer: Delay } = { arrive: () => 0, answer: () => 0 },
  ) {
    this.queue = new SaveQueue({
      initialRevision: server.revision,
      onChange: () => {},
      send: async ({ patch }) => {
        const [arrive, answer] = [delays.arrive(), delays.answer()];
        await wait(arrive);
        const revision = server.save(id, patch);
        await wait(answer);
        return { kind: "ok", revision };
      },
    });
    this.poller = new TeamPoller({
      initialKnown: null,
      onStop: () => {},
      onState: (s) => this.apply(s),
      fetchState: async (known) => {
        this.requests.push(known);
        const [arrive, answer] = [delays.arrive(), delays.answer()];
        await wait(arrive);
        const s = server.state(id, known);
        await wait(answer);
        return { kind: "ok", state: s };
      },
    });
  }

  apply(s: TeamState): ApplyResult {
    const d = decidePoll({
      state: s,
      unconfirmed: this.queue.unconfirmed(),
      composing: this.composing,
      current: this.current,
      previous: this.snapshot,
      acknowledged: this.queue.snapshot.revision,
    });
    const result = applyResultOf(d);
    this.results.push(result);
    if (d.ignored) return result;
    if (d.grid) {
      for (const k of d.grid.discard) this.queue.discard(k);
      this.snapshot = d.grid.snapshot;
      this.current = d.grid.cells;
      this.given = d.grid.given;
      if (d.grid.teammateChanged) this.notices += 1;
      if (d.grid.held.length > 0) this.resyncNeeded = true;
    }
    return result;
  }

  /** use-grid-input's onSettled: after an event, with no composition open. */
  private settled(): void {
    if (this.composing.length > 0 || !this.resyncNeeded) return;
    this.resyncNeeded = false;
    void this.poller.resync();
  }

  /** A finished letter (no composition), as typed latin letters or a paste arrive. */
  type(key: CellKey, ch: string | null): void {
    if (ch === null) delete this.current[key];
    else this.current[key] = ch;
    this.queue.setCell(key, ch);
    this.settled();
  }

  /** A Korean syllable is being composed in `key` of `word`; nothing is committed yet. */
  compose(word: CellKey[], key: CellKey, ch: string): void {
    this.composing = word;
    this.pending = { key, ch };
  }

  /** compositionend (or blur, select, paste): commit the pending syllable, or nothing when it was cancelled. */
  endComposition(commit = true): void {
    const p = this.pending;
    this.composing = [];
    this.pending = null;
    if (commit && p) {
      this.current[p.key] = p.ch;
      this.queue.setCell(p.key, p.ch);
    }
    this.settled();
  }

  dispose(): void {
    this.poller.dispose();
    this.queue.dispose();
  }
}

/** What a student sees in the typed cells: the server's cells without the given ones. */
const typed = (server: FakeServer) => Object.fromEntries(Object.entries(server.cells).filter(([k]) => server.given[k] === undefined));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------------------------------------------
// T3: the hosted C-4 replay (G3 퍼즐 T, 1팀, revision 11)
// ---------------------------------------------------------------------------------------------------------------

describe("T3: hosted C-4 replay", () => {
  const DOWN: CellKey[] = ["1,2", "2,2", "3,2"]; // the word the right screen was composing in

  /** Revision 10: the right screen's 과/수/원 saved; then the left screen saves 복/H/R as revision 11. */
  async function replay() {
    const server = new FakeServer();
    server.given = { "3,3": "분", "3,4": "열" };
    server.save("left", { "0,3": "우", "1,3": "주" });
    const right = new Board("right", server);
    await right.poller.pollNow();
    right.type("1,2", "과");
    right.type("2,2", "수");
    right.type("3,2", "원");
    await vi.advanceTimersByTimeAsync(3000); // the debounced save lands
    await right.poller.pollNow();
    expect(right.current).toEqual({ "0,3": "우", "1,2": "과", "1,3": "주", "2,2": "수", "3,2": "원" });
    right.compose(DOWN, "1,2", "과"); // an open syllable, left alone (no key, no tap) as on the hosted screen
    server.save("left", { "1,2": "복", "2,2": "H", "3,2": "R" });
    server.revision = 11; // the hosted revision, for the record
    await right.poller.pollNow(); // revision 11 arrives while composing
    return { server, right };
  }

  it("reproduces the stale screen: revision 11 is held, and under the old contract every later poll is changed = false", async () => {
    const { server, right } = await replay();
    expect(right.current).toEqual({ "0,3": "우", "1,2": "과", "1,3": "주", "2,2": "수", "3,2": "원" });
    expect(right.results.at(-1)).toBe("partial");
    // the old poller recorded 11 as known on arrival: the server then never sends the cells again
    expect(server.state("right", 11).changed).toBe(false);
    // the fixed poller does not: known is null, so the next answer carries the whole grid
    expect(right.poller.known).toBeNull();
    right.dispose();
  });

  it("after the composition ends, the full resync makes the screen equal to the server (우/복/주/H/R)", async () => {
    const { server, right } = await replay();
    right.endComposition(false); // the syllable was cancelled: no own input to keep
    await vi.advanceTimersByTimeAsync(0);
    expect(right.requests.at(-1)).toBeNull();
    expect(right.current).toEqual({ "0,3": "우", "1,2": "복", "1,3": "주", "2,2": "H", "3,2": "R" });
    expect(right.current).toEqual(typed(server));
    expect(right.given).toEqual({ "3,3": "분", "3,4": "열" });
    expect(right.poller.known).toBe(11);
    right.dispose();
  });

  it("the composed syllable is kept as this student's input; the rest of the word is not kept stale", async () => {
    const { server, right } = await replay();
    right.compose(DOWN, "1,2", "가");
    right.endComposition(true); // commits 가 into 1,2 (unsaved yet)
    await vi.advanceTimersByTimeAsync(0);
    expect(right.current).toEqual({ "0,3": "우", "1,2": "가", "1,3": "주", "2,2": "H", "3,2": "R" });
    await vi.advanceTimersByTimeAsync(10_000); // the save lands, the next poll confirms it
    expect(server.cells["1,2"]).toBe("가");
    expect(right.current).toEqual(typed(server));
    right.dispose();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T1: composition hold + teammate save + compositionend resync, with two boards
// ---------------------------------------------------------------------------------------------------------------

describe("T1: composition hold, teammate save, resync", () => {
  it("B's word is held while composing, then resynced: both boards equal the server", async () => {
    const server = new FakeServer();
    const a = new Board("a", server);
    const b = new Board("b", server);
    a.poller.start();
    b.poller.start();
    b.compose(["0,0", "0,1", "0,2"], "0,0", "사");
    a.type("0,1", "과");
    a.type("0,2", "일");
    await vi.advanceTimersByTimeAsync(12_000); // A's save lands; B polls while composing
    expect(b.results).toContain("partial");
    expect(b.current["0,1"]).toBeUndefined(); // held: the cells B had (empty) stay while composing
    b.endComposition(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(b.current).toEqual({ "0,0": "사", "0,1": "과", "0,2": "일" });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(a.current).toEqual(typed(server));
    expect(b.current).toEqual(typed(server));
    a.dispose();
    b.dispose();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T6: a skipped answer resyncs at once, with no rollback and no false teammate notice
// ---------------------------------------------------------------------------------------------------------------

describe("T6: skipped answer", () => {
  it("a poll read before this student's save lands is skipped, the whole grid follows at once, and no notice is shown", async () => {
    const server = new FakeServer();
    let slowPoll = false;
    const a = new Board("a", server, { arrive: () => 0, answer: () => (slowPoll ? 2500 : 0) });
    a.type("0,0", "사");
    await vi.advanceTimersByTimeAsync(2000); // saved at revision 1
    await a.poller.pollNow();
    expect(a.current).toEqual({ "0,0": "사" });

    a.type("0,0", "새");
    slowPoll = true;
    const late = a.poller.pollNow(); // reads revision 1 now, answers in 2.5 s
    slowPoll = false;
    await vi.advanceTimersByTimeAsync(2000); // the save of 새 is acknowledged at revision 2 first
    expect(a.queue.snapshot.revision).toBe(2);
    await vi.advanceTimersByTimeAsync(600);
    await late;
    expect(a.results).toContain("skipped");
    expect(a.requests.at(-1)).toBeNull(); // the immediate whole-grid request
    expect(a.current).toEqual({ "0,0": "새" }); // never rolled back to 사
    expect(a.notices).toBe(0);
    expect(a.poller.known).toBe(2);
    a.dispose();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T4a: found by T4 (seed 70): this student's save lands, a teammate overwrites the cell, and the poll answer with the
// teammate's letter arrives BEFORE this student's own save acknowledgement
// ---------------------------------------------------------------------------------------------------------------

describe("T4a: own save overtaken by a teammate before its acknowledgement", () => {
  it("the unsaved overlay makes the answer partial, so the teammate's letter is shown once the save is acknowledged", async () => {
    const server = new FakeServer();
    let slowAck = false;
    const a = new Board("a", server, { arrive: () => 0, answer: () => (slowAck ? 3000 : 0) });
    const b = new Board("b", server);
    await a.poller.pollNow();
    slowAck = true;
    a.type("2,1", "라");
    await vi.advanceTimersByTimeAsync(2000); // A's save reaches the server (revision 1); its answer is 3 s away
    slowAck = false;
    b.type("2,1", "마");
    await vi.advanceTimersByTimeAsync(2000); // B overwrites (revision 2)
    await a.poller.pollNow(); // A sees revision 2 while its own save is still unacknowledged
    expect(a.current["2,1"]).toBe("라"); // own input stays on screen (K-1)
    expect(a.results.at(-1)).toBe("partial");
    expect(a.poller.known).toBeNull();
    await vi.advanceTimersByTimeAsync(1000); // the acknowledgement (revision 1) arrives
    await a.poller.pollNow();
    expect(a.current).toEqual({ "2,1": "마" });
    expect(a.current).toEqual(typed(server));
    a.dispose();
    b.dispose();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T4: two boards, random interleavings
// ---------------------------------------------------------------------------------------------------------------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACROSS: CellKey[] = ["1,0", "1,1", "1,2", "1,3"];
const DOWNW: CellKey[] = ["0,1", "1,1", "2,1", "3,1"];
const WORDS = [ACROSS, DOWNW];
const LETTERS = ["가", "나", "다", "라", "마", "바"];

describe("T4: two boards against one fake server converge", () => {
  it("300 random runs (typing, held compositions, clears, overtaking answers): both boards equal the server once idle", async () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const r = rng(seed);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
      const server = new FakeServer();
      const delays = { arrive: () => Math.floor(r() * 800), answer: () => Math.floor(r() * 1500) };
      const boards = [new Board("a", server, delays), new Board("b", server, delays)];
      for (const b of boards) b.poller.start();

      for (let step = 0; step < 40; step += 1) {
        const b = pick(boards);
        const op = r();
        if (op < 0.3) {
          if (b.composing.length === 0) b.type(pick(pick(WORDS)), r() < 0.15 ? null : pick(LETTERS));
        } else if (op < 0.5) {
          if (b.composing.length === 0) {
            const w = pick(WORDS);
            b.compose(w, pick(w), pick(LETTERS));
          }
        } else if (op < 0.65) {
          if (b.composing.length > 0) b.endComposition(r() < 0.8);
        } else {
          await vi.advanceTimersByTimeAsync(Math.floor(r() * 5000));
        }
      }
      for (const b of boards) if (b.composing.length > 0) b.endComposition(true);
      await vi.advanceTimersByTimeAsync(40_000); // idle: saves land, at least two polls each

      const want = typed(server);
      for (const b of boards) {
        expect(b.queue.unconfirmed().size, `seed ${seed} ${b.id} queue`).toBe(0);
        expect(b.current, `seed ${seed} ${b.id}`).toEqual(want);
      }
      for (const b of boards) b.dispose();
    }
  }, 120_000);
});
