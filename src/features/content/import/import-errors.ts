import {
  ANSWER_MAX_LEN,
  ANSWER_MIN_LEN,
  DEFINITION_MAX_CHARS,
  MAX_CONTENT_CSV_BYTES,
  MAX_CONTENT_ROWS,
  MAX_SET_ENTRIES,
  SET_TITLE_MAX_CHARS,
  TERM_MAX_CHARS,
  type ContentRowErrorCode,
  type ContentRowWarningCode,
  type RowIssueContext,
} from "./content-schemas";

export type ContentImportErrorCode =
  | "FILE_MISSING"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "ENCODING_INVALID"
  | "ENCODING_UTF16"
  | "DELIMITER_UNSUPPORTED"
  | "CSV_MALFORMED"
  | "MISSING_HEADER"
  | "DUPLICATE_HEADER"
  | "NO_DATA_ROWS"
  | "TOO_MANY_ROWS"
  | "NO_VALID_ROWS"
  | "MODE_INVALID"
  | "TITLE_INVALID"
  | "TITLE_DUPLICATE"
  | "SET_NOT_FOUND"
  | "SET_ARCHIVED"
  | "SET_TOO_LARGE"
  | "REPLACE_NOT_CONFIRMED"
  | "CLASSROOM_INVALID"
  | "FORBIDDEN"
  | "BATCH_NOT_FOUND"
  | "COMMIT_TOKEN_INVALID"
  | "BATCH_EXPIRED"
  | "ROWS_CHANGED"
  | "BATCH_PERSIST_FAILED";

export type ErrorMessageContext = {
  /** TOO_MANY_ROWS: rows found in the file. */
  count?: number;
  /** SET_TOO_LARGE */
  current?: number;
  add?: number;
};

const kb = (bytes: number) => Math.floor(bytes / 1024);

/** File-level and commit-level messages. The only place these texts live. */
export function contentErrorMessage(code: ContentImportErrorCode, ctx: ErrorMessageContext = {}): string {
  switch (code) {
    case "FILE_MISSING":
      return "CSV 파일을 선택해 주세요.";
    case "EMPTY_FILE":
      return "비어 있는 파일입니다.";
    case "FILE_TOO_LARGE":
      return `파일이 너무 큽니다. 최대 ${kb(MAX_CONTENT_CSV_BYTES)}KB까지 올릴 수 있습니다.`;
    case "ENCODING_INVALID":
      return "파일 인코딩을 읽을 수 없습니다. 엑셀에서 ‘CSV UTF-8(쉼표로 분리)’ 형식으로 다시 저장해 주세요.";
    case "ENCODING_UTF16":
      return "UTF-16 형식의 파일입니다. ‘CSV UTF-8(쉼표로 분리)’ 형식으로 다시 저장해 주세요.";
    case "DELIMITER_UNSUPPORTED":
      return "쉼표(,)로 구분된 CSV 파일만 올릴 수 있습니다. 탭이나 세미콜론으로 구분된 파일은 쉼표로 다시 저장해 주세요.";
    case "CSV_MALFORMED":
      return "따옴표가 닫히지 않았습니다.";
    case "MISSING_HEADER":
      return "첫 줄에 term(용어)와 definition(뜻) 열이 필요합니다.";
    case "DUPLICATE_HEADER":
      return "같은 이름의 열이 두 번 있습니다.";
    case "NO_DATA_ROWS":
      return "단어 행이 없습니다.";
    case "TOO_MANY_ROWS":
      return `단어가 ${ctx.count ?? MAX_CONTENT_ROWS + 1}개입니다. 한 번에 최대 ${MAX_CONTENT_ROWS}개까지 올릴 수 있습니다. 파일을 ${MAX_CONTENT_ROWS}개 이하로 나누어 올려 주세요.`;
    case "NO_VALID_ROWS":
      return "저장할 수 있는 단어가 없습니다. 오류를 고친 뒤 다시 올려 주세요.";
    case "MODE_INVALID":
      return "올바르지 않은 저장 방식입니다.";
    case "TITLE_INVALID":
      return `세트 이름은 1~${SET_TITLE_MAX_CHARS}자로 입력해 주세요.`;
    case "TITLE_DUPLICATE":
      return "같은 이름의 세트가 이미 있습니다.";
    case "SET_NOT_FOUND":
      return "단어 세트를 찾을 수 없습니다.";
    case "SET_ARCHIVED":
      return "보관된 세트는 수정할 수 없습니다.";
    case "SET_TOO_LARGE":
      return `세트에는 단어를 최대 ${MAX_SET_ENTRIES}개까지 담을 수 있습니다. (현재 ${ctx.current ?? 0}개, 추가 ${ctx.add ?? 0}개)`;
    case "REPLACE_NOT_CONFIRMED":
      return "기존 단어를 보관 처리하려면 확인란을 선택해 주세요.";
    case "CLASSROOM_INVALID":
      return "학급을 찾을 수 없거나 사용할 수 없습니다.";
    case "FORBIDDEN":
      return "해당 작업 권한이 없습니다.";
    // Same wording as the M1 batch flow (batch-service.ts) on purpose.
    case "BATCH_NOT_FOUND":
      return "유효한 미리보기를 찾을 수 없거나 이미 사용되었습니다.";
    case "COMMIT_TOKEN_INVALID":
      return "확인 토큰이 올바르지 않습니다.";
    case "BATCH_EXPIRED":
      return "미리보기가 만료되었습니다. 다시 미리보기를 실행해 주세요.";
    case "ROWS_CHANGED":
      return "미리보기 이후 파일 내용이 변경되었습니다.";
    case "BATCH_PERSIST_FAILED":
      return "미리보기를 저장하지 못했습니다.";
  }
}

export class ContentImportError extends Error {
  code: ContentImportErrorCode;

  constructor(code: ContentImportErrorCode, context: ErrorMessageContext = {}) {
    super(contentErrorMessage(code, context));
    this.name = "ContentImportError";
    this.code = code;
  }
}

/** Row-level messages (errors and warnings). The UI prefixes each with "{line}행:". */
export function rowIssueMessage(
  code: ContentRowErrorCode | ContentRowWarningCode,
  ctx: RowIssueContext = {},
): string {
  switch (code) {
    case "ROW_TOO_FEW_COLUMNS":
      return "열이 부족합니다. 용어와 뜻을 모두 입력해 주세요.";
    case "TERM_EMPTY":
      return "용어가 비어 있습니다.";
    case "TERM_TOO_LONG":
      return `용어가 너무 깁니다. (최대 ${TERM_MAX_CHARS}자)`;
    case "DEFINITION_EMPTY":
      return "뜻이 비어 있습니다.";
    case "DEFINITION_TOO_LONG":
      return `뜻이 너무 깁니다. (최대 ${DEFINITION_MAX_CHARS}자)`;
    case "ANSWER_TOO_SHORT":
      return `낱말 퍼즐 정답은 최소 ${ANSWER_MIN_LEN}글자여야 합니다.`;
    case "ANSWER_TOO_LONG":
      return `낱말 퍼즐 정답은 최대 ${ANSWER_MAX_LEN}글자까지 가능합니다. (현재 ${ctx.length ?? ANSWER_MAX_LEN + 1}글자)`;
    case "ANSWER_INVALID_CHAR":
      return `정답에 쓸 수 없는 문자가 있습니다: ${(ctx.chars ?? []).join(" ")}. 한글, 영문, 숫자만 사용할 수 있습니다.`;
    case "ANSWER_JAMO":
      return "자음/모음만 따로 쓴 글자는 정답에 쓸 수 없습니다. 완성된 글자로 입력해 주세요.";
    case "DUP_IN_FILE":
      return `같은 정답이 ${ctx.firstLine ?? 0}행에 이미 있습니다.`;
    case "DUP_IN_FILE_CONFLICT":
      return `같은 정답이 ${ctx.firstLine ?? 0}행에 있고 뜻이 다릅니다. 하나만 남겨 주세요.`;
    case "DUP_EXISTING":
      return "이미 세트에 있는 단어입니다. 건너뜁니다.";
    case "ANSWER_MIXED_SCRIPT":
      return "한글과 영문/숫자가 섞여 있습니다. 퍼즐 종류에 따라 제외될 수 있습니다.";
    case "DEFINITION_CONTAINS_ANSWER":
      return "뜻에 정답이 그대로 들어 있습니다.";
    case "FORMULA_PREFIX":
      return "뜻이 수식 기호(=, +, -, @)로 시작합니다. 그대로 저장되며, 내려받을 때는 안전하게 변환됩니다.";
    case "CONTROL_CHARS_REMOVED":
      return "보이지 않는 제어 문자를 제거했습니다.";
    case "WHITESPACE_NORMALISED":
      return "줄바꿈이나 반복된 공백을 하나의 공백으로 바꿨습니다.";
  }
}

/** Notice for header-extra columns (not an error). */
export const extraColumnsNotice = (n: number) => `term, definition 외의 열 ${n}개는 무시됩니다.`;

/**
 * Maps the stable exception codes raised by fn_commit_content_import (and the 23505 on titles) to
 * ContentImportError codes. Returns null for anything unknown so the caller rethrows it.
 */
export function mapDatabaseErrorCode(message: string | null | undefined): ContentImportErrorCode | null {
  switch ((message ?? "").trim()) {
    case "CONTENT_BATCH_NOT_FOUND":
      return "BATCH_NOT_FOUND";
    case "CONTENT_TOKEN_INVALID":
      return "COMMIT_TOKEN_INVALID";
    case "CONTENT_ROWS_CHANGED":
      return "ROWS_CHANGED";
    case "CONTENT_FORBIDDEN":
      return "FORBIDDEN";
    case "CONTENT_MODE_INVALID":
      return "MODE_INVALID";
    case "CONTENT_NO_ROWS":
      return "NO_VALID_ROWS";
    case "CONTENT_TITLE_INVALID":
      return "TITLE_INVALID";
    case "CONTENT_TITLE_DUPLICATE":
      return "TITLE_DUPLICATE";
    case "CONTENT_CLASSROOM_INVALID":
      return "CLASSROOM_INVALID";
    case "CONTENT_SET_NOT_FOUND":
      return "SET_NOT_FOUND";
    case "CONTENT_SET_ARCHIVED":
      return "SET_ARCHIVED";
    case "CONTENT_SET_TOO_LARGE":
      return "SET_TOO_LARGE";
    default:
      return null;
  }
}
