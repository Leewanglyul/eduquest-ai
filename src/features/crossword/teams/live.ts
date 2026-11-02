/**
 * The in-class view model (M2-3.4 TP-0, TPS 7 and 7.1, OX-4). Pure: no database, no server module.
 *
 * It keeps ONLY what running the room needs: session state, team state, each student's not started / in progress /
 * completed, open teacher calls, operational blocked state and the team's last progress time. It never copies a
 * progress count, a tool count, a contribution figure, a balance, letters or a per-student time, and it never orders
 * students by anything but the roster (TV-1 M-7).
 */
import type { ProgressRow, ProgressState } from "../results/types";
import type { LiveSession, LiveState, LiveStudent, LiveTeam, LiveView, TeamSetup, TeamStudent } from "./types";

export type LiveAssignment = {
  status: "open" | "closed";
  opensAt: string | null;
  closesAt: string | null;
  playMode: "individual" | "team";
};

export function sessionOf(a: LiveAssignment, now: Date): LiveSession {
  if (a.status === "closed") return "closed";
  if (a.closesAt && Date.parse(a.closesAt) <= now.getTime()) return "closed";
  if (a.opensAt && Date.parse(a.opensAt) > now.getTime()) return "scheduled";
  return "open";
}

/** Roster order: student number, then name. Never progress, help, time or contribution. */
export const rosterOrder = (a: { studentNo: string; displayName: string }, b: { studentNo: string; displayName: string }) =>
  a.studentNo.localeCompare(b.studentNo, "ko", { numeric: true }) || a.displayName.localeCompare(b.displayName, "ko");

const stateOf = (s: ProgressState | undefined): LiveState => s ?? "not_started";

export function buildLiveView(input: {
  assignment: LiveAssignment;
  setup: TeamSetup;
  progress: readonly ProgressRow[];
  now: Date;
}): LiveView {
  const byStudent = new Map(input.progress.map((p) => [p.studentId, p]));
  const toStudent = (s: TeamStudent): LiveStudent => ({
    displayName: s.displayName,
    studentNo: s.studentNo,
    state: stateOf(byStudent.get(s.studentId)?.state),
  });
  const session = sessionOf(input.assignment, input.now);
  const team = input.assignment.playMode === "team";

  const teams: LiveTeam[] = team
    ? input.setup.teams.map((t) => {
        const members = t.members.map(toStudent).sort(rosterOrder);
        const saved = t.members
          .map((m) => byStudent.get(m.studentId)?.lastSavedAt ?? null)
          .filter((x): x is string => x !== null)
          .sort();
        const state: LiveState = members.some((m) => m.state === "completed")
          ? "completed"
          : t.started || members.some((m) => m.state === "in_progress")
            ? "in_progress"
            : "not_started";
        return {
          teamId: t.teamId,
          label: t.label,
          state,
          // A completed team or a closed session has no active call: nothing to answer, no resolve control (R2 H)
          helpOpen: t.helpOpen && state !== "completed" && session !== "closed",
          blocked: t.memberCount === 0 ? "no_members" : null,
          lastProgressAt: saved.length > 0 ? saved[saved.length - 1] : null,
          members,
        };
      })
    : [];

  const students = (team ? input.setup.unassigned : [...input.setup.unassigned, ...input.setup.teams.flatMap((t) => t.members)])
    .map(toStudent)
    .sort(rosterOrder);

  const sessionBlocked: LiveView["sessionBlocked"] = [];
  if (session === "scheduled") sessionBlocked.push("not_open");
  if (team && session === "open" && input.setup.unassigned.length > 0) sessionBlocked.push("unassigned");

  return { mode: input.assignment.playMode, session, sessionBlocked, teams, students, asOf: input.now.toISOString() };
}

export const LIVE_TEXT = {
  title: "수업 중 보기",
  teamsTitle: "팀 구성",
  teacherOnly: "교사용 화면입니다. 학생 화면이나 큰 화면에 띄우지 마세요.",
  session: { scheduled: "아직 열리지 않음", open: "진행 중", closed: "닫힘" } as Record<LiveSession, string>,
  state: { not_started: "시작 전", in_progress: "하는 중", completed: "완료" } as Record<LiveState, string>,
  helpOpen: "도움 요청",
  resolve: "확인했어요",
  blockedNoMembers: "팀원이 없어 시작할 수 없어요",
  blockedNotOpen: "아직 열리지 않아 학생이 시작할 수 없어요",
  blockedUnassigned: "팀이 없는 학생이 있어요",
  waiting: "팀 배정 대기",
  lastProgress: "마지막 진행",
  asOf: "마지막 갱신",
  refresh: "새로 고침",
  refreshFailed: "최신 상태를 불러오지 못했어요. 마지막으로 받은 내용을 보여 주고 있어요.",
  close: "활동 닫기",
  closeConfirm: "이 활동을 닫을까요? 학생은 더 이상 고칠 수 없게 돼요.",
  readOnlyViewer: "보기 전용입니다. 팀 변경과 도움 요청 확인은 담당 교사만 할 수 있어요.",
} as const;
