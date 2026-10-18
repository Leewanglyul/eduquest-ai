/**
 * Optional recorder of the IME events seen by the play board, for the real-device validation (doc 08 G.5, G.6).
 * Switched on only by opening the board with ?imetrace=1. Everything stays in the browser's memory until the tester
 * presses "download"; nothing is sent anywhere and nothing is stored in the browser. It records what the tester typed,
 * so use it with test accounts only. The file has the shape of the fixtures in tests/fixtures/ime, so a recorded run
 * can be replayed through the controller as it is.
 */
import type { ImeEvent, ImeWord } from "@/features/crossword/play/ime/controller";

export type TraceEvent = ImeEvent | { type: "setWord"; word: ImeWord } | { type: "flush" };
export type TimedTraceEvent = TraceEvent & { t: number };

export type TraceMeta = {
  device: string;
  keyboardApp: string;
  predictionStrip: boolean;
  orientation: string;
  viewport: [number, number];
  userAgent: string;
  note: string;
};

export const MAX_TRACE_EVENTS = 20_000;

export class ImeTrace {
  private events: TimedTraceEvent[] = [];
  private t0 = 0;

  get size(): number {
    return this.events.length;
  }

  record = (event: TraceEvent): void => {
    if (this.events.length >= MAX_TRACE_EVENTS) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.events.length === 0) this.t0 = now;
    this.events.push({ ...event, t: Math.round(now - this.t0) });
  };

  clear(): void {
    this.events = [];
  }

  /** The recording in the fixture format (one run, case "board"). */
  toFixture(meta: TraceMeta): object {
    return {
      source: {
        trace: "play-board",
        labVersion: 3,
        device: meta.device,
        keyboardApp: meta.keyboardApp,
        predictionStrip: meta.predictionStrip,
        orientation: meta.orientation,
        viewport: meta.viewport,
        userAgent: meta.userAgent,
        savedAt: new Date().toISOString(),
      },
      runs: [
        {
          id: "board#0",
          case: "board",
          n: 0,
          expected: "",
          got: "",
          testerVerdict: "",
          note: meta.note,
          autoPass: false,
          focusLost: 0,
          events: this.events,
        },
      ],
    };
  }
}
