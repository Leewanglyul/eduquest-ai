"use client";

/**
 * The one team notice (P3 D9): at most one is visible; a new one replaces it and restarts the timer instead of stacking;
 * it hides itself after about five seconds. It sits in the status area, never on a cell (P3-D2, CE-11), and says what
 * happened without saying who ("다른 팀원이 수정했어요", E-3).
 */
import { useEffect, useState } from "react";

export const TEAM_NOTICE_MS = 5000;

export function TeamNotice({ text, stamp }: { text: string | null; stamp: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!text || stamp === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), TEAM_NOTICE_MS);
    return () => clearTimeout(t);
  }, [text, stamp]);
  return (
    <p role="status" aria-live="polite" data-team-notice={visible ? "shown" : "hidden"} className="mt-2 min-h-6 text-sm text-slate-800">
      {visible && text ? text : ""}
    </p>
  );
}

/**
 * Gate 3 C-4: team polling failed three times in a row. One neutral line in the status area ("팀 화면을 맞추는 중이에요"),
 * never on a cell, never about a teammate; it goes away with the next good poll.
 */
export function TeamSyncNotice({ degraded, text }: { degraded: boolean; text: string }) {
  return degraded ? (
    <p role="status" aria-live="polite" data-team-sync="degraded" className="mt-1 text-sm text-slate-800">
      {text}
    </p>
  ) : null;
}
