/**
 * Words the student screens use for levels, states and actions. Plain statements about the puzzle and the student's
 * own progress; nothing here is a score, a grade or a comparison (Progress -> Growth first).
 */
import type { PlayableState } from "./list";

export const LEVEL_LABEL = { easy: "쉬움", normal: "보통", hard: "어려움" } as const;

/** The icon is decoration (aria-hidden); the words carry the meaning, never the colour alone. */
export const STATE_LABEL: Record<PlayableState, { icon: string; text: string; action: string }> = {
  new: { icon: "○", text: "새 퍼즐", action: "시작하기" },
  in_progress: { icon: "◐", text: "이어하기", action: "이어하기" },
  closed: { icon: "▣", text: "마감", action: "결과 보기" },
  completed: { icon: "✓", text: "완료", action: "결과 보기" },
};

const KST = "Asia/Seoul";

/** "10월 20일 오후 3:00까지" (Korean time), or null when there is no closing time. */
export function formatClosing(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return `${date} ${time}까지`;
}

/** Active time as the student reads it: "약 12분", "1분 미만", or null when nothing was recorded. */
export function formatMinutes(activeSeconds: number): string | null {
  if (!Number.isFinite(activeSeconds) || activeSeconds <= 0) return null;
  if (activeSeconds < 60) return "1분 미만";
  return `약 ${Math.round(activeSeconds / 60)}분`;
}
