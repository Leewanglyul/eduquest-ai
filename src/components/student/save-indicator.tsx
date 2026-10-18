/**
 * The save indicator (PM SP-3): saving, saved, offline. A text status with an icon, a polite live region, and the real
 * reason when the server refuses saving (closed, signed out) instead of the indicator. Colour is never the only signal.
 */
import { PLAY_TEXT, playMessage } from "@/features/crossword/play/messages";
import type { QueueSnapshot } from "./save-queue";

export function blockedText(code: NonNullable<QueueSnapshot["blocked"]>): string {
  if (code === "UNKNOWN") return PLAY_TEXT.blockedUnknown;
  if (code === "READONLY" || code === "CLOSED") return PLAY_TEXT.closedBanner;
  return playMessage(code);
}

const LOOK = {
  saved: { icon: "✓", text: PLAY_TEXT.saveSaved, tone: "border-slate-400 bg-white text-slate-900" },
  saving: { icon: "…", text: PLAY_TEXT.saveSaving, tone: "border-slate-400 bg-slate-50 text-slate-900" },
  offline: { icon: "!", text: PLAY_TEXT.saveOffline, tone: "border-amber-800 bg-amber-50 text-amber-950" },
} as const;

export function SaveIndicator({ snapshot }: { snapshot: QueueSnapshot }) {
  if (snapshot.blocked) {
    return (
      <p role="status" aria-live="polite" data-save-state="blocked" className="rounded border border-slate-600 bg-slate-100 px-3 py-2 text-sm">
        <span aria-hidden="true">▣ </span>
        {blockedText(snapshot.blocked)}
      </p>
    );
  }
  const look = LOOK[snapshot.state];
  return (
    <div>
      <p
        role="status"
        aria-live="polite"
        data-save-state={snapshot.state}
        className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-sm ${look.tone}`}
      >
        <span aria-hidden="true" className="font-bold">
          {look.icon}
        </span>
        {look.text}
      </p>
      {snapshot.state === "offline" ? <p className="mt-1 text-sm text-slate-900">{PLAY_TEXT.saveOfflineHelp}</p> : null}
    </div>
  );
}
