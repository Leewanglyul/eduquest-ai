/**
 * Errors of the crossword teacher backend (docs/m2/05-m2-2-2-teacher-review-plan.md §4.9, §5.1).
 * One catalogue: the database raises `CROSSWORD_<CODE>` (P0001) and this file turns it into a code and a Korean message.
 */

export type CrosswordErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SET_NOT_FOUND"
  | "SET_ARCHIVED"
  | "SET_EMPTY"
  | "SET_CHANGED"
  | "CLASSROOM_INVALID"
  | "CLASSROOM_ARCHIVED"
  | "NOT_ENOUGH_WORDS"
  | "NO_ELIGIBLE_WORDS"
  | "TOO_FEW_WORDS"
  | "WORD_COUNT"
  | "TICKET_INVALID"
  | "TITLE_INVALID"
  | "CLUE_INVALID"
  | "WORD_NOT_FOUND"
  | "NOT_DRAFT"
  | "NOT_PUBLISHED"
  | "PUBLISHED_IMMUTABLE"
  | "VERSION_EXISTS"
  | "VERSION_SOURCE_INVALID"
  | "RESTORE_NOT_ALLOWED"
  | "RESAVE_NOT_ALLOWED"
  | "ALREADY_ARCHIVED"
  | "NOT_ARCHIVED"
  | "ALREADY_ASSIGNED"
  | "ASSIGNMENT_NOT_OPEN"
  | "WINDOW_INVALID"
  | "INVALID_GRID"
  | "PERSIST_FAILED";

export type ErrorContext = {
  /** NOT_ENOUGH_WORDS: how many words the best attempt placed. */
  placed?: number;
};

export function crosswordErrorMessage(code: CrosswordErrorCode, ctx: ErrorContext = {}): string {
  switch (code) {
    case "INVALID_INPUT":
      return "입력 값이 올바르지 않습니다.";
    case "FORBIDDEN":
      return "해당 작업 권한이 없습니다.";
    case "NOT_FOUND":
      return "퍼즐을 찾을 수 없습니다.";
    case "SET_NOT_FOUND":
      return "단어 세트를 찾을 수 없습니다.";
    case "SET_ARCHIVED":
      return "보관된 세트로는 퍼즐을 만들 수 없습니다.";
    case "SET_EMPTY":
      return "세트에 단어가 없습니다.";
    case "SET_CHANGED":
      return "미리보기 이후 세트가 바뀌었습니다. 다시 생성해 주세요.";
    case "CLASSROOM_INVALID":
      return "학급을 찾을 수 없거나 사용할 수 없습니다.";
    case "CLASSROOM_ARCHIVED":
      return "보관된 학급에는 퍼즐을 배포할 수 없습니다.";
    case "NOT_ENOUGH_WORDS":
      return `퍼즐에 들어간 단어가 ${ctx.placed ?? 0}개뿐입니다. 서로 겹치는 단어가 5개 이상 필요합니다. 같은 글자가 들어간 단어를 더 추가해 보세요.`;
    case "NO_ELIGIBLE_WORDS":
      return "퍼즐에 쓸 수 있는 단어가 없습니다.";
    case "TOO_FEW_WORDS":
    case "WORD_COUNT":
      return "퍼즐에는 서로 겹치는 단어가 5개 이상 필요합니다.";
    case "TICKET_INVALID":
      return "미리보기가 만료되었거나 이미 사용되었습니다. 다시 생성해 주세요.";
    case "TITLE_INVALID":
      return "퍼즐 이름은 1~80자로 입력해 주세요.";
    case "CLUE_INVALID":
      return "힌트는 1~200자로 입력해 주세요.";
    case "WORD_NOT_FOUND":
      return "퍼즐에서 해당 단어를 찾을 수 없습니다.";
    case "NOT_DRAFT":
      return "초안만 수정하거나 배포할 수 있습니다.";
    case "NOT_PUBLISHED":
      return "배포된 퍼즐만 다른 학급에 추가할 수 있습니다.";
    case "PUBLISHED_IMMUTABLE":
      return "배포된 퍼즐은 수정할 수 없습니다. 새 버전을 만들어 주세요.";
    case "VERSION_EXISTS":
      return "이 퍼즐에는 이미 작성 중인 초안이나 더 새로운 버전이 있습니다.";
    case "VERSION_SOURCE_INVALID":
      return "배포한 적이 있는 퍼즐에서만 새 버전을 만들 수 있습니다. 초안은 바로 수정해 주세요.";
    case "RESTORE_NOT_ALLOWED":
      return "배포한 적이 있는 퍼즐은 복원할 수 없습니다. 새 버전을 만들어 주세요.";
    case "RESAVE_NOT_ALLOWED":
      return "새 버전의 퍼즐 구조는 바꿀 수 없습니다. 새 퍼즐로 만들어 주세요.";
    case "ALREADY_ARCHIVED":
      return "이미 보관된 퍼즐입니다.";
    case "NOT_ARCHIVED":
      return "보관되지 않은 퍼즐입니다.";
    case "ALREADY_ASSIGNED":
      return "이미 배포한 학급이 포함되어 있습니다.";
    case "ASSIGNMENT_NOT_OPEN":
      return "이미 닫힌 배포입니다.";
    case "WINDOW_INVALID":
      return "마감 시각은 시작 시각보다 늦어야 합니다.";
    case "INVALID_GRID":
      return "퍼즐 구조가 올바르지 않아 저장할 수 없습니다. 다시 생성해 주세요.";
    case "PERSIST_FAILED":
      return "퍼즐을 저장하지 못했습니다.";
  }
}

export class CrosswordError extends Error {
  code: CrosswordErrorCode;

  constructor(code: CrosswordErrorCode, context: ErrorContext = {}) {
    super(crosswordErrorMessage(code, context));
    this.name = "CrosswordError";
    this.code = code;
  }
}

/** Validator codes of fn_crossword_validate_words: all mean "the grid is not a valid crossword". */
const GRID_CODES = new Set([
  "EMPTY",
  "BAD_WORD",
  "DUPLICATE",
  "OUT_OF_BOUNDS",
  "LETTER_CONFLICT",
  "UNINTENDED_RUN",
  "MISSING_RUN",
  "SINGLE_INVALID",
  "DISCONNECTED",
  "NOT_TRIMMED",
  "BAD_NUMBERING",
]);

const DIRECT_CODES = new Set<string>([
  "FORBIDDEN",
  "NOT_FOUND",
  "SET_NOT_FOUND",
  "SET_ARCHIVED",
  "CLASSROOM_INVALID",
  "CLASSROOM_ARCHIVED",
  "TOO_FEW_WORDS",
  "WORD_COUNT",
  "TICKET_INVALID",
  "TITLE_INVALID",
  "CLUE_INVALID",
  "WORD_NOT_FOUND",
  "NOT_DRAFT",
  "NOT_PUBLISHED",
  "PUBLISHED_IMMUTABLE",
  "VERSION_EXISTS",
  "VERSION_SOURCE_INVALID",
  "RESTORE_NOT_ALLOWED",
  "RESAVE_NOT_ALLOWED",
  "ALREADY_ARCHIVED",
  "NOT_ARCHIVED",
  "ALREADY_ASSIGNED",
  "ASSIGNMENT_NOT_OPEN",
  "WINDOW_INVALID",
]);

/** Maps a database exception message ("CROSSWORD_NOT_DRAFT") to a code; null when it is not one of ours. */
export function mapDatabaseErrorCode(
  message: string | undefined | null,
): CrosswordErrorCode | null {
  const match = /CROSSWORD_([A-Z_]+)/.exec(message ?? "");
  if (!match) return null;
  const code = match[1];
  // The save compares the preview's placement hash with the words the server regenerated: a difference means the set changed.
  if (code === "HASH_MISMATCH") return "SET_CHANGED";
  if (GRID_CODES.has(code)) return "INVALID_GRID";
  return DIRECT_CODES.has(code) ? (code as CrosswordErrorCode) : null;
}
