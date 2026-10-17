import type { ReactNode } from "react";

/**
 * Shared look of the crossword screens, chosen for small phones (360-400px) and for keyboard users:
 * every button, input and checkbox row is at least 44px tall, inputs are 16px on phones (iOS zooms smaller ones),
 * focus is always visible, and the warning button uses amber-700 (amber-600 with white text is below 4.5:1).
 */
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";
const BTN = `inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${FOCUS}`;

export const BTN_PRIMARY = `${BTN} bg-slate-900 text-white`;
export const BTN_SECONDARY = `${BTN} border border-slate-900`;
export const BTN_WARN = `${BTN} bg-amber-700 text-white`;
export const INPUT = `block w-full min-h-11 rounded-md border border-slate-400 px-2 py-1 text-base sm:text-sm ${FOCUS}`;
export const CHECK_ROW = "flex min-h-11 items-center gap-2 text-sm";
export const CHECK_BOX = "h-6 w-6 shrink-0";

/**
 * A wide table or board inside a box that scrolls sideways on a phone instead of widening the page. A scrollable box
 * must be reachable with the keyboard, so it takes focus and has a name.
 */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`max-w-full overflow-x-auto ${FOCUS}`}
    >
      {children}
    </div>
  );
}
