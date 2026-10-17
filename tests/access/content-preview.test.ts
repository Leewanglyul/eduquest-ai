import { describe, expect, it } from "vitest";

import {
  ANSWER_MAX_LEN,
  ANSWER_MIN_LEN,
  DEFINITION_MAX_CHARS,
  MAX_CONTENT_CSV_BYTES,
  MAX_CONTENT_ROWS,
  MAX_SET_ENTRIES,
  NORMALIZER_VERSION,
  SET_TITLE_MAX_CHARS,
  TERM_MAX_CHARS,
  type RawContentRow,
} from "@/features/content/import/content-schemas";
import {
  ContentImportError,
  contentErrorMessage,
  mapDatabaseErrorCode,
  rowIssueMessage,
  type ContentImportErrorCode,
} from "@/features/content/import/import-errors";
import { parseContentCsv } from "@/features/content/import/csv-parse";
import { assertPreviewCommittable, buildContentPreview, toCommitRows } from "@/features/content/import/preview";

const rows = (...pairs: [string, string][]): RawContentRow[] =>
  pairs.map(([term, definition], i) => ({ line: i + 2, term, definition }));

describe("M2-1.3 preview: duplicates inside the file", () => {
  it("keeps the first occurrence and names its row", () => {
    const p = buildContentPreview(rows(["사과", "과일"], ["포도", "과일"], ["사과", "과일"]), { mode: "create" });
    expect(p.valid.map((r) => r.term)).toEqual(["사과", "포도"]);
    expect(p.invalid).toHaveLength(1);
    expect(p.invalid[0]).toMatchObject({ line: 4, term: "사과", errors: ["DUP_IN_FILE"] });
    expect(p.invalid[0].messages).toEqual(["같은 정답이 2행에 이미 있습니다."]);
  });

  it("distinguishes a conflicting definition", () => {
    const p = buildContentPreview(rows(["사과", "과일"], ["사과", "회사 이름"]), { mode: "create" });
    expect(p.invalid[0].errors).toEqual(["DUP_IN_FILE_CONFLICT"]);
    expect(p.invalid[0].messages[0]).toBe("같은 정답이 2행에 있고 뜻이 다릅니다. 하나만 남겨 주세요.");
  });

  it("treats case, spaces, separators and NFC variants as one key", () => {
    const p = buildContentPreview(
      rows(["Apple", "a"], ["APPLE ", "a"], ["apple", "a"], ["A-pple", "a"], ["사과", "a"], ["사과".normalize("NFD"), "a"]),
      { mode: "create" },
    );
    expect(p.valid.map((r) => r.answer)).toEqual(["APPLE", "사과"]);
    expect(p.invalid.map((i) => i.line)).toEqual([3, 4, 5, 7]);
  });

  it("does not let a rejected row reserve its answer", () => {
    // Row 2 is invalid (empty definition); row 3 has the same answer and must still be accepted.
    const p = buildContentPreview(rows(["사과", ""], ["사과", "과일"]), { mode: "create" });
    expect(p.valid.map((r) => r.line)).toEqual([3]);
    expect(p.invalid.map((i) => i.line)).toEqual([2]);
  });
});

describe("M2-1.3 preview: against the existing set", () => {
  const existing = new Set(["사과"]);

  it("append flags answers already in the set", () => {
    const p = buildContentPreview(rows(["사과", "과일"], ["포도", "과일"]), {
      mode: "append",
      existingAnswers: existing,
      liveCount: 1,
    });
    expect(p.valid.map((r) => r.term)).toEqual(["포도"]);
    expect(p.invalid[0]).toMatchObject({ errors: ["DUP_EXISTING"], messages: ["이미 세트에 있는 단어입니다. 건너뜁니다."] });
  });

  it("create and replace ignore the existing set", () => {
    for (const mode of ["create", "replace"] as const) {
      const p = buildContentPreview(rows(["사과", "과일"]), { mode, existingAnswers: existing, liveCount: 150 });
      expect(p.valid).toHaveLength(1);
      expect(p.setSize.current).toBe(0);
    }
  });
});

describe("M2-1.3 preview: set size", () => {
  it("append counts the live entries; exactly the cap fits, one more does not", () => {
    const fits = buildContentPreview(rows(["사과", "a"], ["포도", "a"]), { mode: "append", liveCount: MAX_SET_ENTRIES - 2 });
    expect(fits.setSize).toMatchObject({ current: MAX_SET_ENTRIES - 2, add: 2, max: MAX_SET_ENTRIES, exceeds: false });
    expect(() => assertPreviewCommittable(fits)).not.toThrow();

    const over = buildContentPreview(rows(["사과", "a"], ["포도", "a"]), { mode: "append", liveCount: MAX_SET_ENTRIES - 1 });
    expect(over.setSize.exceeds).toBe(true);
    try {
      assertPreviewCommittable(over);
      expect.unreachable();
    } catch (e) {
      expect((e as ContentImportError).code).toBe("SET_TOO_LARGE");
      expect((e as ContentImportError).message).toBe(
        `세트에는 단어를 최대 ${MAX_SET_ENTRIES}개까지 담을 수 있습니다. (현재 ${MAX_SET_ENTRIES - 1}개, 추가 2개)`,
      );
    }
  });
});

describe("M2-1.3 preview: partial files", () => {
  it("returns valid rows with the rejected ones listed", () => {
    const p = buildContentPreview(rows(["사과", "과일"], ["", "x"], ["물", "x"], ["포도", "과일"]), { mode: "create" });
    expect(p.valid.map((r) => r.term)).toEqual(["사과", "포도"]);
    expect(p.invalid.map((i) => [i.line, i.errors])).toEqual([
      [3, ["TERM_EMPTY"]],
      [4, ["ANSWER_TOO_SHORT"]],
    ]);
    expect(p.counts).toEqual({ total: 4, accepted: 2, withWarnings: 0, rejected: 2 });
    expect(() => assertPreviewCommittable(p)).not.toThrow();
  });

  it("has nothing to commit when no row is valid", () => {
    const p = buildContentPreview(rows(["", "x"]), { mode: "create" });
    expect(p.valid).toHaveLength(0);
    expect(() => assertPreviewCommittable(p)).toThrowError(ContentImportError);
    try {
      assertPreviewCommittable(p);
    } catch (e) {
      expect((e as ContentImportError).code).toBe("NO_VALID_ROWS");
    }
  });

  it("counts rows that carry warnings", () => {
    const p = buildContentPreview(rows(["사과", "빨간 사과"], ["포도", "과일"]), { mode: "create" });
    expect(p.counts.withWarnings).toBe(1);
  });

  it("runs end to end from CSV text, row numbers included", () => {
    const text = "term,definition\n사과,과일\n\n사과(과일),x\n포도,과일\n";
    const p = buildContentPreview(parseContentCsv(text).rows, { mode: "create" });
    expect(p.valid.map((r) => [r.line, r.answer])).toEqual([
      [2, "사과"],
      [5, "포도"],
    ]);
    expect(p.invalid.map((i) => i.line)).toEqual([4]);
  });
});

describe("M2-1.3 commit rows", () => {
  it("builds the jsonb shape the database function reads", () => {
    const p = buildContentPreview(rows(["ice cream", "차가운 간식"]), { mode: "create" });
    expect(toCommitRows(p.valid)).toEqual([
      {
        term: "ice cream",
        definition: "차가운 간식",
        answer: "ICECREAM",
        script: "latin",
        normalizerVersion: NORMALIZER_VERSION,
        line: 2,
      },
    ]);
  });
});

describe("M2-1.3 messages", () => {
  const codes: ContentImportErrorCode[] = [
    "FILE_MISSING",
    "EMPTY_FILE",
    "FILE_TOO_LARGE",
    "ENCODING_INVALID",
    "ENCODING_UTF16",
    "DELIMITER_UNSUPPORTED",
    "CSV_MALFORMED",
    "MISSING_HEADER",
    "DUPLICATE_HEADER",
    "NO_DATA_ROWS",
    "TOO_MANY_ROWS",
    "NO_VALID_ROWS",
    "MODE_INVALID",
    "TITLE_INVALID",
    "TITLE_DUPLICATE",
    "SET_NOT_FOUND",
    "SET_ARCHIVED",
    "SET_TOO_LARGE",
    "REPLACE_NOT_CONFIRMED",
    "CLASSROOM_INVALID",
    "FORBIDDEN",
    "BATCH_NOT_FOUND",
    "COMMIT_TOKEN_INVALID",
    "BATCH_EXPIRED",
    "ROWS_CHANGED",
    "BATCH_PERSIST_FAILED",
  ];

  it("has a Korean message for every error code", () => {
    for (const code of codes) {
      const message = contentErrorMessage(code, { count: 101, current: 1, add: 2 });
      expect(message, code).toMatch(/[가-힣]/);
      expect(new ContentImportError(code).message).toBe(contentErrorMessage(code));
    }
  });

  it("pins the file-level texts of the design (§4.8)", () => {
    const expected: Partial<Record<ContentImportErrorCode, string>> = {
      FILE_MISSING: "CSV 파일을 선택해 주세요.",
      EMPTY_FILE: "비어 있는 파일입니다.",
      FILE_TOO_LARGE: `파일이 너무 큽니다. 최대 ${MAX_CONTENT_CSV_BYTES / 1024}KB까지 올릴 수 있습니다.`,
      ENCODING_UTF16: "UTF-16 형식의 파일입니다. ‘CSV UTF-8(쉼표로 분리)’ 형식으로 다시 저장해 주세요.",
      DELIMITER_UNSUPPORTED:
        "쉼표(,)로 구분된 CSV 파일만 올릴 수 있습니다. 탭이나 세미콜론으로 구분된 파일은 쉼표로 다시 저장해 주세요.",
      CSV_MALFORMED: "따옴표가 닫히지 않았습니다.",
      MISSING_HEADER: "첫 줄에 term(용어)와 definition(뜻) 열이 필요합니다.",
      DUPLICATE_HEADER: "같은 이름의 열이 두 번 있습니다.",
      NO_DATA_ROWS: "단어 행이 없습니다.",
      NO_VALID_ROWS: "저장할 수 있는 단어가 없습니다. 오류를 고친 뒤 다시 올려 주세요.",
      MODE_INVALID: "올바르지 않은 저장 방식입니다.",
      TITLE_INVALID: `세트 이름은 1~${SET_TITLE_MAX_CHARS}자로 입력해 주세요.`,
      TITLE_DUPLICATE: "같은 이름의 세트가 이미 있습니다.",
      SET_NOT_FOUND: "단어 세트를 찾을 수 없습니다.",
      SET_ARCHIVED: "보관된 세트는 수정할 수 없습니다.",
      REPLACE_NOT_CONFIRMED: "기존 단어를 보관 처리하려면 확인란을 선택해 주세요.",
      FORBIDDEN: "해당 작업 권한이 없습니다.",
      // Identical to the M1 batch flow.
      BATCH_NOT_FOUND: "유효한 미리보기를 찾을 수 없거나 이미 사용되었습니다.",
      COMMIT_TOKEN_INVALID: "확인 토큰이 올바르지 않습니다.",
      BATCH_EXPIRED: "미리보기가 만료되었습니다. 다시 미리보기를 실행해 주세요.",
      ROWS_CHANGED: "미리보기 이후 파일 내용이 변경되었습니다.",
      BATCH_PERSIST_FAILED: "미리보기를 저장하지 못했습니다.",
    };
    for (const [code, text] of Object.entries(expected)) {
      expect(contentErrorMessage(code as ContentImportErrorCode), code).toBe(text);
    }
  });

  it("pins the too-many-rows text", () => {
    expect(contentErrorMessage("TOO_MANY_ROWS", { count: MAX_CONTENT_ROWS + 1 })).toBe(
      `단어가 ${MAX_CONTENT_ROWS + 1}개입니다. 한 번에 최대 ${MAX_CONTENT_ROWS}개까지 올릴 수 있습니다. 파일을 ${MAX_CONTENT_ROWS}개 이하로 나누어 올려 주세요.`,
    );
  });

  it("pins the row-level texts of the design (§4.8)", () => {
    expect(rowIssueMessage("TERM_EMPTY")).toBe("용어가 비어 있습니다.");
    expect(rowIssueMessage("TERM_TOO_LONG")).toBe(`용어가 너무 깁니다. (최대 ${TERM_MAX_CHARS}자)`);
    expect(rowIssueMessage("DEFINITION_EMPTY")).toBe("뜻이 비어 있습니다.");
    expect(rowIssueMessage("DEFINITION_TOO_LONG")).toBe(`뜻이 너무 깁니다. (최대 ${DEFINITION_MAX_CHARS}자)`);
    expect(rowIssueMessage("ROW_TOO_FEW_COLUMNS")).toBe("열이 부족합니다. 용어와 뜻을 모두 입력해 주세요.");
    expect(rowIssueMessage("ANSWER_TOO_SHORT")).toBe(`낱말 퍼즐 정답은 최소 ${ANSWER_MIN_LEN}글자여야 합니다.`);
    expect(rowIssueMessage("ANSWER_TOO_LONG", { length: 16 })).toBe(
      `낱말 퍼즐 정답은 최대 ${ANSWER_MAX_LEN}글자까지 가능합니다. (현재 16글자)`,
    );
    expect(rowIssueMessage("ANSWER_INVALID_CHAR", { chars: ["(", ")"] })).toBe(
      "정답에 쓸 수 없는 문자가 있습니다: ( ). 한글, 영문, 숫자만 사용할 수 있습니다.",
    );
    expect(rowIssueMessage("ANSWER_JAMO")).toBe("자음/모음만 따로 쓴 글자는 정답에 쓸 수 없습니다. 완성된 글자로 입력해 주세요.");
    expect(rowIssueMessage("ANSWER_MIXED_SCRIPT")).toBe("한글과 영문/숫자가 섞여 있습니다. 퍼즐 종류에 따라 제외될 수 있습니다.");
    expect(rowIssueMessage("DEFINITION_CONTAINS_ANSWER")).toBe("뜻에 정답이 그대로 들어 있습니다.");
    expect(rowIssueMessage("FORMULA_PREFIX")).toBe(
      "뜻이 수식 기호(=, +, -, @)로 시작합니다. 그대로 저장되며, 내려받을 때는 안전하게 변환됩니다.",
    );
    expect(rowIssueMessage("CONTROL_CHARS_REMOVED")).toBe("보이지 않는 제어 문자를 제거했습니다.");
    expect(rowIssueMessage("WHITESPACE_NORMALISED")).toBe("줄바꿈이나 반복된 공백을 하나의 공백으로 바꿨습니다.");
  });
});

describe("M2-1.3 database error mapping", () => {
  it("maps every code raised by fn_commit_content_import and rejects unknown text", () => {
    expect(mapDatabaseErrorCode("CONTENT_BATCH_NOT_FOUND")).toBe("BATCH_NOT_FOUND");
    expect(mapDatabaseErrorCode("CONTENT_TOKEN_INVALID")).toBe("COMMIT_TOKEN_INVALID");
    expect(mapDatabaseErrorCode("CONTENT_ROWS_CHANGED")).toBe("ROWS_CHANGED");
    expect(mapDatabaseErrorCode("CONTENT_FORBIDDEN")).toBe("FORBIDDEN");
    expect(mapDatabaseErrorCode("CONTENT_MODE_INVALID")).toBe("MODE_INVALID");
    expect(mapDatabaseErrorCode("CONTENT_NO_ROWS")).toBe("NO_VALID_ROWS");
    expect(mapDatabaseErrorCode("CONTENT_TITLE_INVALID")).toBe("TITLE_INVALID");
    expect(mapDatabaseErrorCode("CONTENT_TITLE_DUPLICATE")).toBe("TITLE_DUPLICATE");
    expect(mapDatabaseErrorCode("CONTENT_CLASSROOM_INVALID")).toBe("CLASSROOM_INVALID");
    expect(mapDatabaseErrorCode("CONTENT_SET_NOT_FOUND")).toBe("SET_NOT_FOUND");
    expect(mapDatabaseErrorCode("CONTENT_SET_ARCHIVED")).toBe("SET_ARCHIVED");
    expect(mapDatabaseErrorCode("CONTENT_SET_TOO_LARGE")).toBe("SET_TOO_LARGE");
    expect(mapDatabaseErrorCode("permission denied for table x")).toBeNull();
    expect(mapDatabaseErrorCode(undefined)).toBeNull();
  });
});
