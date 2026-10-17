/**
 * Korean texts of the student play side. Its own catalogue: the teacher catalogue (crossword/messages.ts) is not
 * extended. Rules (pinned by tests): nothing here sounds like a score, a penalty or a comparison, and no message
 * can carry an answer or a letter of the key.
 */
import { PLAY_ERROR_CODES, type PlayErrorCode } from "./types";

export const PLAY_ERROR_PREFIX = "CROSSWORD_PLAY_";

const MESSAGES: Record<PlayErrorCode, string> = {
  NOT_FOUND: "찾을 수 없는 퍼즐이에요.",
  NOT_OPEN_YET: "아직 열리지 않은 퍼즐이에요.",
  CLOSED: "수업에서 닫힌 퍼즐입니다.",
  READONLY: "이 퍼즐은 지금 고칠 수 없어요.",
  BAD_CELL: "그 칸은 이 퍼즐에 없어요.",
  BAD_CHAR: "글자를 완성해 주세요.",
  BAD_PATCH: "저장하지 못했어요. 다시 시도해 주세요.",
  PATCH_TOO_LARGE: "한 번에 너무 많이 바뀌었어요. 잠시 뒤에 다시 저장할게요.",
  LOCKED_CELL: "이미 알려 준 칸이라 바꿀 수 없어요.",
  STALE: "다른 곳에서 퍼즐이 바뀌었어요. 화면을 새로 고칠게요.",
  CHECK_NOT_ALLOWED: "이 퍼즐에서는 이 방식으로 확인할 수 없어요.",
  CHECK_LIMIT: "확인할 수 있는 횟수를 모두 사용했어요.",
  CHECK_RATE: "잠시 뒤에 다시 확인해 주세요.",
  REVEAL_NOT_ALLOWED: "이 퍼즐에서는 글자를 알려 주지 않아요.",
  REVEAL_LIMIT: "글자 알려주기를 모두 사용했어요.",
  CHOSUNG_NOT_ALLOWED: "이 퍼즐에서는 초성을 보여 주지 않아요.",
  CHOSUNG_UNAVAILABLE: "이 낱말은 초성을 보여 줄 수 없어요.",
  SUBMIT_COOLDOWN: "조금만 더 살펴볼까요?",
};

const FALLBACK = "잠시 문제가 생겼어요. 다시 시도해 주세요.";

/** "CROSSWORD_PLAY_STALE" -> "STALE"; anything else -> null. */
export function playErrorCode(message: string | null | undefined): PlayErrorCode | null {
  if (!message || !message.startsWith(PLAY_ERROR_PREFIX)) return null;
  const code = message.slice(PLAY_ERROR_PREFIX.length);
  return (PLAY_ERROR_CODES as readonly string[]).includes(code) ? (code as PlayErrorCode) : null;
}

/** Text for a code. SUBMIT_COOLDOWN says the wait plainly when the seconds are known (the database hint). */
export function playMessage(code: PlayErrorCode | null, seconds?: number): string {
  if (!code) return FALLBACK;
  if (code === "SUBMIT_COOLDOWN" && seconds !== undefined && Number.isFinite(seconds) && seconds > 0) {
    return `${MESSAGES.SUBMIT_COOLDOWN} ${Math.ceil(seconds)}초 뒤에 다시 제출할 수 있어요.`;
  }
  return MESSAGES[code];
}

export const PLAY_ERROR_MESSAGES: Readonly<Record<PlayErrorCode, string>> = MESSAGES;

export type ToolUse = { checks: number; reveals: number; chosung: number };

/**
 * The result screen's line about help (doc 08 D). Tools, not a penalty: no minus, no fraction, no "left".
 * Zero use reads as doing it alone.
 */
export function toolsSummary(use: ToolUse): string {
  const parts: string[] = [];
  if (use.checks > 0) parts.push(`확인 ${use.checks}번`);
  if (use.reveals > 0) parts.push(`글자 알려주기 ${use.reveals}번`);
  if (use.chosung > 0) parts.push(`초성 ${use.chosung}번`);
  return parts.length === 0 ? "도구 없이 스스로 풀었어요" : `도구를 활용했어요: ${parts.join(", ")}`;
}

export const PLAY_TEXT = {
  completed: "퍼즐을 완성했어요!",
  incompleteCell: (empty: number) => `아직 빈 칸이 ${empty}개 있어요.`,
  wrongSome: "아직 틀린 칸이 있어요. 조금만 더 살펴볼까요?",
  wrongCount: (n: number) => `틀린 칸이 ${n}개 있어요. 조금만 더 살펴볼까요?`,
  closedBanner: "수업에서 닫힌 퍼즐입니다.",
  // PM SP-3: the three save states
  saveSaved: "저장됨",
  saveSaving: "저장 중",
  saveOffline: "오프라인 · 아직 저장되지 않았어요",
  saveOfflineHelp: "연결되면 자동으로 저장돼요. 이 화면을 닫지 마세요.",
  composing: "조합 중",
  nextPuzzle: (title: string) => `다음 퍼즐 풀기: ${title}`,
  otherPuzzles: "다른 퍼즐 보기",
  home: "학생 홈",
} as const;
