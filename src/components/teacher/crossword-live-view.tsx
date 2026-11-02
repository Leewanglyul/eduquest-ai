"use client";

/**
 * The teacher's in-class view (M2-3.4 TP-0, T-3 to T-6; TPS 7.1, OX-4, OX-10, PD-5). Phone width first. It shows ONLY
 * what running the room needs: session state, team state, each student's not started / in progress / completed, open
 * teacher calls, operational blocked state, the last-updated time, a manual refresh and closing the assignment.
 * No progress figure, contribution, balance, ranking, letters, clue or per-student time; students in roster order.
 * Teacher-only: it is not meant for a projector (OX-12).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { closeCrosswordAssignmentAction } from "@/features/crossword/review/actions";
import { loadLiveViewAction, resolveTeamHelpAction } from "@/features/crossword/teams/actions";
import { LIVE_TEXT } from "@/features/crossword/teams/live";
import type { LiveStudent, LiveView } from "@/features/crossword/teams/types";
import { whenText } from "@/features/crossword/results/view-model";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_WARN } from "./crossword-ui";
import { LiveRefresher } from "./live-refresher";
import { useCrosswordAction } from "./use-crossword-action";

type Props = {
  puzzleId: string;
  assignmentId: string;
  initial: LiveView;
  /** Owner or co-teacher: may mark a call as handled. A school admin views read-only. */
  canWrite: boolean;
};

function StudentLine({ s }: { s: LiveStudent }) {
  return (
    <li className="flex min-h-10 items-center justify-between gap-2 text-sm" data-live-state={s.state}>
      <span>
        {s.displayName} ({s.studentNo})
      </span>
      <span className="font-medium">{LIVE_TEXT.state[s.state]}</span>
    </li>
  );
}

export function CrosswordLiveView({ puzzleId, assignmentId, initial, canWrite }: Props) {
  const [view, setView] = useState<LiveView>(initial);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const resolve = useCrosswordAction(resolveTeamHelpAction);
  const close = useCrosswordAction(closeCrosswordAssignmentAction);
  const refresher = useRef<LiveRefresher<LiveView> | null>(null);

  const r = useMemo(
    () =>
      new LiveRefresher<LiveView>({
        load: async () => {
          setBusy(true);
          try {
            const res = await loadLiveViewAction({ puzzleId, assignmentId });
            return res.ok ? { ok: true, data: res.data } : { ok: false };
          } finally {
            setBusy(false);
          }
        },
        onData: setView,
        onFailure: setFailed,
      }),
    [puzzleId, assignmentId],
  );

  useEffect(() => {
    refresher.current = r;
    r.start();
    const onVisibility = () => r.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      r.dispose();
    };
  }, [r]);

  useEffect(() => {
    if (resolve.state?.ok || close.state?.ok) void refresher.current?.refreshNow();
  }, [resolve.state, close.state]);

  const error = [resolve.state, close.state].find((s) => s && !s.ok);

  return (
    <div className="space-y-4" data-screen="teacher-only">
      <p className="text-xs text-slate-700">{LIVE_TEXT.teacherOnly}</p>
      {!canWrite ? <p className="rounded border border-slate-400 bg-slate-50 p-2 text-sm">{LIVE_TEXT.readOnlyViewer}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold" data-live-session={view.session}>
          {LIVE_TEXT.session[view.session]}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs" data-live-asof={view.asOf}>
            {LIVE_TEXT.asOf} {whenText(view.asOf)}
          </span>
          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void r.refreshNow()}>
            {LIVE_TEXT.refresh}
          </button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {failed ? LIVE_TEXT.refreshFailed : ""}
      </p>
      {error && !error.ok ? (
        <p role="alert" className="rounded border border-amber-700 bg-amber-50 p-2 text-sm">
          {error.error}
        </p>
      ) : null}

      {view.sessionBlocked.length > 0 ? (
        <ul className="space-y-1 rounded border border-amber-700 bg-amber-50 p-2 text-sm" aria-label="시작을 막는 것">
          {view.sessionBlocked.map((b) => (
            <li key={b} data-live-blocked={b}>
              {b === "not_open" ? LIVE_TEXT.blockedNotOpen : LIVE_TEXT.blockedUnassigned}
            </li>
          ))}
        </ul>
      ) : null}

      {view.teams.length > 0 ? (
        <ul className="space-y-3" aria-label="팀">
          {view.teams.map((t) => (
            <li key={t.teamId} className="rounded border border-slate-400 p-3" data-live-team-state={t.state}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{t.label}</h2>
                <span className="text-sm font-medium">{LIVE_TEXT.state[t.state]}</span>
              </div>
              {t.helpOpen ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded bg-amber-100 p-2" data-live-help="open">
                  <span className="text-sm font-semibold">{LIVE_TEXT.helpOpen}</span>
                  {canWrite ? (
                    <button type="button" className={BTN_PRIMARY} disabled={resolve.pending} onClick={() => resolve.submit({ assignmentId, teamId: t.teamId })}>
                      {LIVE_TEXT.resolve}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {t.blocked === "no_members" ? (
                <p className="mt-1 text-sm text-amber-800" data-live-blocked="no_members">
                  {LIVE_TEXT.blockedNoMembers}
                </p>
              ) : null}
              {t.lastProgressAt ? (
                <p className="mt-1 text-xs text-slate-700">
                  {LIVE_TEXT.lastProgress} {whenText(t.lastProgressAt)}
                </p>
              ) : null}
              <ul className="mt-2">
                {t.members.map((m) => (
                  <StudentLine key={`${t.teamId}-${m.studentNo}`} s={m} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}

      {view.students.length > 0 ? (
        <section aria-labelledby="live-students">
          <h2 id="live-students" className="text-base font-semibold">
            {view.mode === "team" ? LIVE_TEXT.waiting : "학생"}
          </h2>
          <ul>
            {view.students.map((s) => (
              <StudentLine key={s.studentNo} s={s} />
            ))}
          </ul>
        </section>
      ) : null}

      {view.session !== "closed" ? (
        <button
          type="button"
          className={BTN_WARN}
          disabled={close.pending}
          onClick={() => {
            if (window.confirm(LIVE_TEXT.closeConfirm)) close.submit({ id: assignmentId });
          }}
        >
          {LIVE_TEXT.close}
        </button>
      ) : null}
    </div>
  );
}
