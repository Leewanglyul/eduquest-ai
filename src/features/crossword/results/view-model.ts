import type { ProgressRow, ProgressState } from "./types";

/**
 * Words of the teacher progress view. Neutral on purpose (CE-11, product note 01): help is "도구를 활용", never a
 * penalty, a score, a rank or a "late" label; nothing here compares students. The list keeps the order the database
 * gives (student number, then name); there is no sort by progress, help or time.
 */
export const PROGRESS_STATE_LABEL: Record<ProgressState, { icon: string; text: string }> = {
  not_started: { icon: "○", text: "시작 전" },
  in_progress: { icon: "◐", text: "푸는 중" },
  completed: { icon: "●", text: "완료" },
};

/**
 * Which progress view the TV-1 page shows (R2 E). Individual: the per-student table as before. Team mode: the attempt is
 * shared, so a per-student "filled / total" would show the team's grid as each student's own work; the page shows no
 * per-student figures and sends the teacher to the in-class view (status only). Team mode with team play switched off:
 * an "unavailable" notice, never a misleading table.
 */
export type ProgressViewKind = "individual" | "team" | "team_disabled";

export function progressViewKind(playMode: "individual" | "team", collabEnabled: boolean): ProgressViewKind {
  if (playMode === "individual") return "individual";
  return collabEnabled ? "team" : "team_disabled";
}

export const TEAM_PROGRESS_TEXT = {
  team: "팀 활동입니다. 팀이 함께 한 판을 풀기 때문에 학생별 진행 칸 수는 보여 주지 않아요. 학생별 상태는 '수업 중 보기'에서 볼 수 있어요.",
  disabled: "팀 활동이 꺼져 있어 이 활동의 진행 상황을 보여 줄 수 없어요.",
} as const;

export const PROGRESS_TEXT = {
  title: "진행 상황",
  note: "학생이 입력한 글자와 정답은 이 화면에 표시되지 않습니다. 이 표는 자동으로 갱신되지 않으니 필요하면 새로고침하세요.",
  empty: "이 학급에 등록된 학생이 없습니다.",
  asOf: "기준 시각",
  reload: "새로고침",
  columns: {
    no: "번호",
    name: "이름",
    state: "상태",
    progress: "진행",
    lastActivity: "마지막 활동",
    tools: "도구를 활용",
    wrong: "틀린 제출",
  },
} as const;

export function progressText(row: Pick<ProgressRow, "filledCount" | "totalCells">): string {
  return `${row.filledCount} / ${row.totalCells}칸`;
}

/** "확인 2 · 알려주기 1 · 초성 0", or "없음" when none was used. */
export function toolsText(row: Pick<ProgressRow, "checksUsed" | "revealsUsed" | "chosungUsed">): string {
  if (row.checksUsed + row.revealsUsed + row.chosungUsed === 0) return "없음";
  return `확인 ${row.checksUsed} · 알려주기 ${row.revealsUsed} · 초성 ${row.chosungUsed}`;
}

export function wrongSubmitsText(row: Pick<ProgressRow, "wrongSubmits">): string {
  return `${row.wrongSubmits}번`;
}

/** Korean school time. "-" when there is nothing yet. */
export function whenText(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return parts;
}

/** The time shown for "last activity": the completion time when finished, else the last save. */
export function lastActivityOf(row: Pick<ProgressRow, "lastSavedAt" | "completedAt">): string | null {
  return row.completedAt ?? row.lastSavedAt;
}
