/**
 * Refresh of the teacher's in-class view (M2-3.4 TP-0, PD-5). Plain TypeScript, tested with fake timers.
 *
 *  - every 10 s while the page is visible; paused while hidden; at once when visible again;
 *  - one request at a time: a refresh asked for while one is running is not sent twice;
 *  - a failed refresh keeps the last good data on screen and reports one neutral failure; the next tick tries again;
 *  - after dispose nothing runs and late answers are ignored.
 */
import type { Timers } from "@/components/student/save-queue";

export type RefreshOutcome<T> = { ok: true; data: T } | { ok: false };

export type LiveRefresherOptions<T> = {
  load: () => Promise<RefreshOutcome<T>>;
  onData: (data: T) => void;
  /** true = the last refresh failed (the screen keeps the last good data and shows a neutral line). */
  onFailure: (failed: boolean) => void;
  intervalMs?: number;
  timers?: Timers;
};

const DEFAULT_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class LiveRefresher<T> {
  private readonly options: LiveRefresherOptions<T>;
  private readonly intervalMs: number;
  private readonly timers: Timers;
  private timer: unknown = null;
  private running: Promise<void> | null = null;
  private visible = true;
  private disposed = false;

  constructor(options: LiveRefresherOptions<T>) {
    this.options = options;
    this.intervalMs = options.intervalMs ?? 10_000;
    this.timers = options.timers ?? DEFAULT_TIMERS;
  }

  get busy(): boolean {
    return this.running !== null;
  }

  start(): void {
    this.schedule();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.clear();
    else void this.refreshNow();
  }

  /** Manual or on-visible refresh. While one is running, the running one is returned (no second request). */
  refreshNow(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.running) return this.running;
    this.clear();
    this.running = this.run().finally(() => {
      this.running = null;
      this.schedule();
    });
    return this.running;
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }

  private async run(): Promise<void> {
    let outcome: RefreshOutcome<T>;
    try {
      outcome = await this.options.load();
    } catch {
      outcome = { ok: false };
    }
    if (this.disposed) return;
    if (outcome.ok) {
      this.options.onData(outcome.data);
      this.options.onFailure(false);
    } else this.options.onFailure(true);
  }

  private schedule(): void {
    if (this.disposed || !this.visible) return;
    this.clear();
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.refreshNow();
    }, this.intervalMs);
  }

  private clear(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }
}
