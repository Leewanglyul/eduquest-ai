/**
 * Autosave queue for the play board (doc 08 C.6, PM SP-3). Plain TypeScript, no DOM and no React, so it can be tested
 * with a fake sender and fake timers.
 *
 * Contract:
 *  - Cell changes are collected in a dirty map and sent as ONE merge patch a little after the last change (and on
 *    request: blur, page hidden, before a check or submit). One request is in flight at a time, in order.
 *  - What is sent is exactly { patch, activeMs }. Never the selected cell, the current word or the current clue.
 *  - The indicator has the three states of SP-3: "saving" (changes not yet confirmed), "saved", "offline" (the last
 *    attempt failed on the network; nothing is lost, it is retried with back-off and at once when the browser says it
 *    is back online). When the server REFUSES the save (closed, read-only) `blocked` carries the code and the board
 *    shows that notice instead of the indicator; retrying would not help.
 *  - Nothing is written to browser storage: cells are not copied to localStorage on shared school devices.
 */
import type { PlayErrorCode, SaveState } from "@/features/crossword/play/types";

export type SaveRequest = { patch: Record<string, string | null>; activeMs: number };

export type SendOutcome =
  | { kind: "ok"; revision: number }
  | { kind: "offline" }
  | { kind: "rejected"; code: PlayErrorCode | null };

export type QueueSnapshot = {
  state: SaveState;
  /** Revision the server confirmed last; the base revision for check, reveal and submit. */
  revision: number;
  /** The server refused saves (for example the assignment closed): show this instead of the indicator. */
  blocked: PlayErrorCode | "UNKNOWN" | null;
  /** Cells waiting to be saved. */
  pendingCells: number;
};

export type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

export type SaveQueueOptions = {
  send: (request: SaveRequest, options: { keepalive: boolean }) => Promise<SendOutcome>;
  onChange: (snapshot: QueueSnapshot) => void;
  initialRevision: number;
  debounceMs?: number;
  backoffMs?: readonly number[];
  maxActiveMsPerSave?: number;
  timers?: Timers;
  /**
   * Team mode only (K-5). When a save is refused with LOCKED_CELL, a teammate has revealed one of the cells: this
   * returns the keys that are now given; they are dropped and the rest is sent again instead of blocking the queue.
   * Without it (individual mode) LOCKED_CELL blocks, as before.
   */
  recoverLocked?: () => Promise<ReadonlySet<string>>;
};

const DEFAULT_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class SaveQueue {
  private readonly send: SaveQueueOptions["send"];
  private readonly onChange: SaveQueueOptions["onChange"];
  private readonly debounceMs: number;
  private readonly backoff: readonly number[];
  private readonly maxActive: number;
  private readonly timers: Timers;
  private readonly recoverLocked: SaveQueueOptions["recoverLocked"];

  private dirty = new Map<string, string | null>();
  private sending: Record<string, string | null> = {};
  private frozen = false;
  private activeMs = 0;
  private revision: number;
  private inFlight = false;
  private offline = false;
  private blocked: QueueSnapshot["blocked"] = null;
  private failures = 0;
  private timer: unknown = null;
  private waiters: ((saved: boolean) => void)[] = [];

  constructor(options: SaveQueueOptions) {
    this.send = options.send;
    this.onChange = options.onChange;
    this.debounceMs = options.debounceMs ?? 2000;
    this.backoff = options.backoffMs ?? [1000, 2000, 4000, 8000, 16000, 30000];
    this.maxActive = options.maxActiveMsPerSave ?? 30_000;
    this.timers = options.timers ?? DEFAULT_TIMERS;
    this.revision = options.initialRevision;
    this.recoverLocked = options.recoverLocked;
  }

  /** Cells typed here that the server has not confirmed yet (in flight or waiting); the newest value of a cell wins. */
  unconfirmed(): Map<string, string | null> {
    return new Map([...Object.entries(this.sending), ...this.dirty]);
  }

  get snapshot(): QueueSnapshot {
    const state: SaveState = this.offline ? "offline" : this.dirty.size > 0 || this.inFlight ? "saving" : "saved";
    return { state, revision: this.revision, blocked: this.blocked, pendingCells: this.dirty.size };
  }

  /** A cell changed (null = emptied). The newest value of a cell wins. */
  setCell(key: string, char: string | null): void {
    if (this.blocked) return;
    this.dirty.set(key, char);
    this.changed();
    if (!this.offline) this.schedule(this.debounceMs);
  }

  /** The server now holds this cell itself (a reveal): do not send our copy. */
  discard(key: string): void {
    this.dirty.delete(key);
    this.changed();
  }

  /** Visible, recently active time to report with the next save. */
  addActiveMs(ms: number): void {
    if (ms > 0) this.activeMs += ms;
  }

  /** Send now (blur, page hidden, tool click, periodic). Does nothing when there is nothing to send. */
  flushNow(options: { keepalive?: boolean } = {}): void {
    this.clearTimer();
    void this.run(Boolean(options.keepalive));
  }

  /** The browser's online/offline signal. Back online: retry immediately. */
  setOnline(online: boolean): void {
    if (!online) {
      if (this.dirty.size > 0 || this.inFlight) {
        this.offline = true;
        this.changed();
      }
      return;
    }
    if (this.offline) {
      this.failures = 0;
      this.offline = false;
      this.changed();
      this.flushNow();
    }
  }

  /**
   * Resolves true when everything is saved (nothing dirty, nothing in flight); false when that cannot happen now
   * (offline or blocked). Used before a check, a reveal or a submit, which work on SAVED state.
   */
  idle(): Promise<boolean> {
    if (this.blocked) return Promise.resolve(false);
    if (this.dirty.size === 0 && !this.inFlight) return Promise.resolve(!this.offline);
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      if (!this.inFlight && !this.offline) this.flushNow();
    });
  }

  dispose(): void {
    this.clearTimer();
    this.settle(false);
  }

  /**
   * Team mode (K-9): the team has completed the puzzle. Unsent cells are discarded, no timer runs and nothing is ever
   * sent again; the board is read-only from here on.
   */
  freeze(): void {
    this.frozen = true;
    this.clearTimer();
    this.dirty = new Map();
    this.activeMs = 0;
    this.offline = false;
    this.blocked = "READONLY";
    this.changed();
    this.settle(false);
  }

  // ---------------------------------------------------------------------------------------------------------

  private async run(keepalive: boolean): Promise<void> {
    if (this.inFlight || this.blocked) return;
    if (this.dirty.size === 0 && this.activeMs < 1000) {
      this.settleIfDone();
      return;
    }
    const patch = Object.fromEntries(this.dirty);
    const activeMs = Math.min(this.activeMs, this.maxActive);
    this.dirty = new Map();
    this.sending = patch;
    this.inFlight = true;
    this.changed();

    let outcome: SendOutcome;
    try {
      outcome = await this.send({ patch, activeMs }, { keepalive });
    } catch {
      outcome = { kind: "offline" };
    }
    this.inFlight = false;
    this.sending = {};
    if (this.frozen) {
      // frozen while this save was in flight: whatever the answer, nothing is put back and nothing is retried
      if (outcome.kind === "ok") this.revision = Math.max(this.revision, outcome.revision);
      this.changed();
      return;
    }

    if (outcome.kind === "ok") {
      this.activeMs = Math.max(0, this.activeMs - activeMs);
      this.revision = Math.max(this.revision, outcome.revision);
      this.failures = 0;
      this.offline = false;
      this.changed();
      if (this.dirty.size > 0) this.schedule(this.debounceMs);
      else this.settleIfDone();
      return;
    }

    // Not confirmed: put the cells back UNDER anything typed meanwhile (the newest value wins).
    for (const [k, v] of Object.entries(patch)) if (!this.dirty.has(k)) this.dirty.set(k, v);

    if (outcome.kind === "rejected") {
      if (outcome.code === "LOCKED_CELL" && this.recoverLocked && (await this.dropLocked(Object.keys(patch)))) return;
      this.blocked = outcome.code ?? "UNKNOWN";
      this.changed();
      this.settle(false);
      return;
    }
    this.offline = true;
    this.failures += 1;
    this.changed();
    this.settle(false);
    this.schedule(this.backoff[Math.min(this.failures - 1, this.backoff.length - 1)]);
  }

  /**
   * K-5: ask the board which cells are given now, drop those from what is waiting and send the rest. Returns false when
   * none of the refused cells is given (the refusal has another cause), so the queue blocks as before.
   */
  private async dropLocked(keys: string[]): Promise<boolean> {
    this.inFlight = true; // nothing else is sent while the board refreshes what is given
    let locked: ReadonlySet<string>;
    try {
      locked = await this.recoverLocked!();
    } catch {
      locked = new Set();
    }
    this.inFlight = false;
    const dropped = keys.filter((k) => locked.has(k));
    if (dropped.length === 0) return false;
    for (const k of dropped) this.dirty.delete(k);
    this.changed();
    if (this.dirty.size > 0) this.schedule(0);
    else this.settleIfDone();
    return true;
  }

  private schedule(ms: number): void {
    this.clearTimer();
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.run(false);
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }

  private settleIfDone(): void {
    if (this.dirty.size === 0 && !this.inFlight) this.settle(!this.offline && !this.blocked);
  }

  private settle(saved: boolean): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w(saved);
  }

  private changed(): void {
    this.onChange(this.snapshot);
  }
}
