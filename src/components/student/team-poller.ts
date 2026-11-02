/**
 * Polling of the shared team attempt (P3-D3, Gate 2 E-9). Plain TypeScript like SaveQueue: no DOM and no React, so it
 * is tested with a fake fetch and fake timers.
 *
 * Contract:
 *  - one poll every 4 s while the page is visible; paused while hidden or offline; a poll at once when it becomes
 *    visible or online again;
 *  - one request at a time: a poll asked for while one is running runs right after it;
 *  - the known revision advances ONLY from team-state answers (never from this student's own saves), so a teammate's
 *    save just before ours is never skipped;
 *  - a network failure or a 5xx backs off (1, 2, 4, 8, 16, 30 s); a refusal (not found, flag off, access lost) stops
 *    polling and is reported once; a completed attempt is reported and then polling stops;
 *  - after dispose nothing runs and late answers are ignored.
 */
import type { PlayErrorCode, TeamState } from "@/features/crossword/play/types";
import type { Timers } from "./save-queue";

export type PollOutcome =
  | { kind: "ok"; state: TeamState }
  | { kind: "offline" }
  | { kind: "rejected"; code: PlayErrorCode | null };

export type TeamPollerOptions = {
  fetchState: (known: number | null) => Promise<PollOutcome>;
  onState: (state: TeamState) => void;
  /** Polling stopped for good because the server refused (the board shows "not available"). */
  onStop: (code: PlayErrorCode | null) => void;
  initialKnown: number | null;
  intervalMs?: number;
  backoffMs?: readonly number[];
  timers?: Timers;
};

const DEFAULT_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class TeamPoller {
  private readonly fetchState: TeamPollerOptions["fetchState"];
  private readonly onState: TeamPollerOptions["onState"];
  private readonly onStop: TeamPollerOptions["onStop"];
  private readonly intervalMs: number;
  private readonly backoff: readonly number[];
  private readonly timers: Timers;

  private knownRevision: number | null;
  private timer: unknown = null;
  private inFlight = false;
  private again = false;
  private visible = true;
  private online = true;
  private stopped = false;
  private disposed = false;
  private failures = 0;
  private waiters: (() => void)[] = [];

  constructor(options: TeamPollerOptions) {
    this.fetchState = options.fetchState;
    this.onState = options.onState;
    this.onStop = options.onStop;
    this.intervalMs = options.intervalMs ?? 4000;
    this.backoff = options.backoffMs ?? [1000, 2000, 4000, 8000, 16000, 30000];
    this.timers = options.timers ?? DEFAULT_TIMERS;
    this.knownRevision = options.initialKnown;
  }

  /** The revision of the last team-state answer. */
  get known(): number | null {
    return this.knownRevision;
  }

  get active(): boolean {
    return !this.stopped && !this.disposed;
  }

  /** First poll after one interval: the board already holds a fresh payload. */
  start(): void {
    this.schedule(this.intervalMs);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.clearTimer();
    else void this.pollNow();
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (!online) this.clearTimer();
    else void this.pollNow();
  }

  /** Poll now (after a STALE check, a refused save, a reconnect). Resolves when a poll that started after this call ends. */
  pollNow(): Promise<void> {
    if (!this.active) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      if (this.inFlight) this.again = true;
      else void this.run();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.release();
  }

  // ---------------------------------------------------------------------------------------------------------

  private async run(): Promise<void> {
    if (!this.active) return this.release();
    this.inFlight = true;
    this.clearTimer();
    let outcome: PollOutcome;
    try {
      outcome = await this.fetchState(this.knownRevision);
    } catch {
      outcome = { kind: "offline" };
    }
    this.inFlight = false;
    if (this.disposed) return this.release();

    if (outcome.kind === "ok") {
      this.failures = 0;
      this.knownRevision = outcome.state.revision;
      this.onState(outcome.state);
      if (outcome.state.status === "completed") this.stopped = true;
    } else if (outcome.kind === "offline") {
      this.failures += 1;
    } else {
      this.stopped = true;
      this.onStop(outcome.code);
    }

    if (this.again && this.active) {
      this.again = false;
      return this.run();
    }
    this.again = false;
    this.release();
    if (!this.active || !this.visible || !this.online) return;
    this.schedule(this.failures > 0 ? this.backoff[Math.min(this.failures - 1, this.backoff.length - 1)] : this.intervalMs);
  }

  private schedule(ms: number): void {
    if (!this.active) return;
    this.clearTimer();
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (!this.inFlight) void this.run();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }

  private release(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }
}
