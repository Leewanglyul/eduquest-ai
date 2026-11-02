"use client";

/**
 * Teacher team setup of one assignment (M2-3.4 TP-0, T-1 and T-2): the play mode, the teams, and the classroom's
 * students without a team. Manual grouping only: no random or ability-based grouping, no labels about students, no
 * comparison (TPS 3). The database decides every rule (max 4, locks after start, owner and co-teacher only); this
 * screen only hides controls the viewer cannot use and shows the database's answer.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignStudentAction,
  createTeamAction,
  deleteTeamAction,
  setPlayModeAction,
  unassignStudentAction,
} from "@/features/crossword/teams/actions";
import { LIVE_TEXT } from "@/features/crossword/teams/live";
import { TEAM_MAX, type TeamSetup } from "@/features/crossword/teams/types";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_WARN, INPUT } from "./crossword-ui";
import { useCrosswordAction } from "./use-crossword-action";

type Props = {
  assignmentId: string;
  playMode: "individual" | "team";
  setup: TeamSetup;
  /** Owner or co-teacher. A school admin sees the same screen read-only. */
  canWrite: boolean;
};

export function CrosswordTeamSetup({ assignmentId, playMode, setup, canWrite }: Props) {
  const router = useRouter();
  const mode = useCrosswordAction(setPlayModeAction);
  const create = useCrosswordAction(createTeamAction);
  const remove = useCrosswordAction(deleteTeamAction);
  const assign = useCrosswordAction(assignStudentAction);
  const unassign = useCrosswordAction(unassignStudentAction);
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState<Record<string, string>>({});

  const states = [mode.state, create.state, remove.state, assign.state, unassign.state];
  useEffect(() => {
    if (states.some((s) => s?.ok)) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, states);
  useEffect(() => {
    if (create.state?.ok) setLabel("");
  }, [create.state]);

  const error = states.find((s) => s && !s.ok);
  const busy = mode.pending || create.pending || remove.pending || assign.pending || unassign.pending;
  const anyStarted = setup.teams.some((t) => t.started);
  const open = setup.teams.filter((t) => t.memberCount < TEAM_MAX);

  return (
    <div className="space-y-6" data-screen="teacher-only">
      {!canWrite ? <p className="rounded border border-slate-400 bg-slate-50 p-3 text-sm">{LIVE_TEXT.readOnlyViewer}</p> : null}
      {error && !error.ok ? (
        <p role="alert" className="rounded border border-amber-700 bg-amber-50 p-3 text-sm">
          {error.error}
        </p>
      ) : null}

      <section aria-labelledby="mode-title" className="space-y-2">
        <h2 id="mode-title" className="text-base font-semibold">
          활동 방식
        </h2>
        <p className="text-sm">지금: {playMode === "team" ? "팀 활동" : "개인 활동"}</p>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={playMode === "individual" ? BTN_PRIMARY : BTN_SECONDARY}
              disabled={busy || playMode === "individual" || anyStarted}
              onClick={() => mode.submit({ assignmentId, mode: "individual" })}
            >
              개인 활동
            </button>
            <button
              type="button"
              className={playMode === "team" ? BTN_PRIMARY : BTN_SECONDARY}
              disabled={busy || playMode === "team"}
              onClick={() => mode.submit({ assignmentId, mode: "team" })}
            >
              팀 활동
            </button>
          </div>
        ) : null}
        <p className="text-xs text-slate-700">학생이 시작한 뒤에는 활동 방식과 팀에서 학생을 빼는 것을 바꿀 수 없어요. 늦게 온 학생은 시작한 팀에도 넣을 수 있어요.</p>
      </section>

      {playMode === "team" ? (
        <>
          <section aria-labelledby="teams-title" className="space-y-3">
            <h2 id="teams-title" className="text-base font-semibold">
              팀
            </h2>
            {canWrite ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (label.trim()) create.submit({ assignmentId, label: label.trim() });
                }}
              >
                <label className="min-w-0 flex-1 text-sm font-medium">
                  새 팀 이름 (1~20자)
                  <input value={label} maxLength={20} onChange={(e) => setLabel(e.target.value)} className={INPUT} />
                </label>
                <button type="submit" className={BTN_PRIMARY} disabled={busy || !label.trim()}>
                  팀 만들기
                </button>
              </form>
            ) : null}
            {setup.teams.length === 0 ? <p className="text-sm">아직 팀이 없어요.</p> : null}
            <ul className="grid gap-3 md:grid-cols-2">
              {setup.teams.map((t) => (
                <li key={t.teamId} className="rounded border border-slate-400 p-3" data-team-started={t.started ? "true" : "false"}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{t.label}</h3>
                    <span className="text-sm">
                      {t.memberCount}/{TEAM_MAX}명{t.started ? " · 시작함" : ""}
                    </span>
                  </div>
                  {t.underMin ? <p className="text-sm text-amber-800">3명보다 적어요. 그래도 시작할 수 있어요.</p> : null}
                  <ul className="mt-2 space-y-1">
                    {t.members.map((m) => (
                      <li key={m.studentId} className="flex min-h-11 items-center justify-between gap-2 text-sm">
                        <span>
                          {m.displayName} ({m.studentNo})
                        </span>
                        {canWrite && !t.started ? (
                          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => unassign.submit({ teamId: t.teamId, studentId: m.studentId })}>
                            빼기
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {canWrite && !t.started ? (
                    <button
                      type="button"
                      className={`${BTN_WARN} mt-2`}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`${t.label}을(를) 지울까요?`)) remove.submit({ teamId: t.teamId });
                      }}
                    >
                      팀 지우기
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="unassigned-title" className="space-y-2">
            <h2 id="unassigned-title" className="text-base font-semibold">
              {LIVE_TEXT.waiting} ({setup.unassigned.length}명)
            </h2>
            {setup.unassigned.length === 0 ? <p className="text-sm">모든 학생에게 팀이 있어요.</p> : null}
            <ul className="space-y-1">
              {setup.unassigned.map((s) => (
                <li key={s.studentId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {s.displayName} ({s.studentNo})
                  </span>
                  {canWrite && open.length > 0 ? (
                    <span className="flex items-center gap-2">
                      <select
                        aria-label={`${s.displayName} 학생을 넣을 팀`}
                        className={INPUT}
                        value={target[s.studentId] ?? open[0].teamId}
                        onChange={(e) => setTarget((x) => ({ ...x, [s.studentId]: e.target.value }))}
                      >
                        {open.map((t) => (
                          <option key={t.teamId} value={t.teamId}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={BTN_SECONDARY}
                        disabled={busy}
                        onClick={() => assign.submit({ teamId: target[s.studentId] ?? open[0].teamId, studentId: s.studentId })}
                      >
                        넣기
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
