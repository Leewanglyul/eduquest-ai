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
