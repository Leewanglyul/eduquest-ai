import { describe, expect, it } from "vitest";

import { parseContentCsv } from "@/features/content/import/csv-parse";
import { tokenizeCsv } from "@/features/content/import/csv-records";
import { ContentImportError, type ContentImportErrorCode } from "@/features/content/import/import-errors";

const codeOf = (fn: () => unknown): ContentImportErrorCode | undefined => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ContentImportError) return e.code;
    throw e;
  }
  return undefined;
};

describe("M2-1.3 tokenizer", () => {
  it("removes a BOM and reads CRLF, LF and CR", () => {
    for (const nl of ["\r\n", "\n", "\r"]) {
      const records = tokenizeCsv(`﻿a,b${nl}c,d${nl}`);
      expect(records.map((r) => r.cells)).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
    }
  });

  it("reads quoted commas, escaped quotes and line breaks inside quotes", () => {
    const [row] = tokenizeCsv('"a, b","say ""hi""","line1\nline2"');
    expect(row.cells).toEqual(["a, b", 'say "hi"', "line1\nline2"]);
  });

  it("refuses text right after a closing quote instead of merging it into the value (R4)", () => {
    expect(codeOf(() => tokenizeCsv('"abc"def,x'))).toBe("CSV_QUOTE_MISPLACED");
    expect(codeOf(() => tokenizeCsv('a,"abc"def'))).toBe("CSV_QUOTE_MISPLACED");
    expect(codeOf(() => tokenizeCsv('"abc" ,x'))).toBe("CSV_QUOTE_MISPLACED");
    expect(codeOf(() => tokenizeCsv('"",x\n"" "y"'))).toBe("CSV_QUOTE_MISPLACED");
  });

  it("accepts a closing quote followed by a comma, a line end or the end of the file", () => {
    expect(tokenizeCsv('"a","b"\n"c","d"\r\n"e","f"').map((r) => r.cells)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
    expect(tokenizeCsv('"say ""hi""",x')[0].cells).toEqual(['say "hi"', "x"]);
  });

  it("refuses an unclosed quote", () => {
    expect(() => tokenizeCsv('a,"b')).toThrowError(ContentImportError);
    expect(codeOf(() => tokenizeCsv('a,"b'))).toBe("CSV_MALFORMED");
  });

  it("counts blank records in the row numbers", () => {
    const records = tokenizeCsv("h1,h2\n\n,\nx,y\n");
    expect(records.map((r) => [r.line, r.blank])).toEqual([
      [1, false],
      [2, true],
      [3, true],
      [4, false],
    ]);
  });
});

describe("M2-1.3 header", () => {
  it("finds columns by name in any order, case and space insensitive", () => {
    const { rows } = parseContentCsv(" Definition , TERM \n뜻,사과\n");
    expect(rows).toEqual([{ line: 2, term: "사과", definition: "뜻" }]);
  });

  it("accepts the Korean aliases", () => {
    expect(parseContentCsv("용어,뜻\n사과,과일").rows).toHaveLength(1);
    expect(parseContentCsv("단어,설명\n사과,과일").rows).toHaveLength(1);
    expect(parseContentCsv("정답,힌트\n사과,과일").rows).toHaveLength(1);
  });

  it("accepts a BOM before the header", () => {
    expect(parseContentCsv("﻿term,definition\n사과,과일").rows).toHaveLength(1);
  });

  it("requires a header: a file of data rows is refused (decision D12)", () => {
    expect(codeOf(() => parseContentCsv("민주주의,국민이 주인이 되는 정치 체제\n삼권분립,권력을 나누는 원칙"))).toBe(
      "MISSING_HEADER",
    );
  });

  it("refuses a missing column", () => {
    expect(codeOf(() => parseContentCsv("term,meaning\n사과,과일"))).toBe("MISSING_HEADER");
    expect(codeOf(() => parseContentCsv("definition,x\n과일,y"))).toBe("MISSING_HEADER");
  });

  it("refuses a repeated column name", () => {
    expect(codeOf(() => parseContentCsv("term,term,definition\na,b,c"))).toBe("DUPLICATE_HEADER");
    expect(codeOf(() => parseContentCsv("term,단어,definition\na,b,c"))).toBe("DUPLICATE_HEADER");
  });

  it("refuses a header only file", () => {
    expect(codeOf(() => parseContentCsv("term,definition\n"))).toBe("NO_DATA_ROWS");
  });

  it("refuses semicolon and tab separated files", () => {
    expect(codeOf(() => parseContentCsv("term;definition\n사과;과일"))).toBe("DELIMITER_UNSUPPORTED");
    expect(codeOf(() => parseContentCsv("term\tdefinition\n사과\t과일"))).toBe("DELIMITER_UNSUPPORTED");
  });

  it("refuses empty and blank-only files", () => {
    expect(codeOf(() => parseContentCsv(""))).toBe("EMPTY_FILE");
    expect(codeOf(() => parseContentCsv("\n\n ,\n"))).toBe("EMPTY_FILE");
  });

  it("ignores extra columns with a notice", () => {
    const { rows, notices } = parseContentCsv("term,definition,note,level\n사과,과일,x,1");
    expect(rows).toEqual([{ line: 2, term: "사과", definition: "과일" }]);
    expect(notices).toEqual(["term, definition 외의 열 2개는 무시됩니다."]);
  });
});

describe("M2-1.3 rows", () => {
  it("numbers rows like a spreadsheet, counting blank rows", () => {
    const { rows } = parseContentCsv("term,definition\n사과,a\n\n배,b\n");
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
  });

  it("keeps a record with an embedded line break as one row", () => {
    const { rows } = parseContentCsv('term,definition\n사과,"첫 줄\n둘째 줄"\n배,b');
    expect(rows).toHaveLength(2);
    expect(rows[0].definition).toBe("첫 줄\n둘째 줄");
    expect(rows[1].line).toBe(3);
  });

  it("flags a row with too few cells but keeps an empty cell as empty", () => {
    const { rows } = parseContentCsv("term,definition\n사과\n배,\n");
    expect(rows[0].tooFewColumns).toBe(true);
    expect(rows[1].tooFewColumns).toBeUndefined();
    expect(rows[1].definition).toBe("");
  });

  it("reports a misplaced quote as a file error", () => {
    expect(codeOf(() => parseContentCsv('term,definition\n"사과"x,과일'))).toBe("CSV_QUOTE_MISPLACED");
  });

  it("reads the example from the PM brief once it has a header", () => {
    const { rows } = parseContentCsv("term,definition\n민주주의,국민이 주인이 되는 정치 체제\n삼권분립,권력을 나누는 원칙\n");
    expect(rows.map((r) => r.term)).toEqual(["민주주의", "삼권분립"]);
  });
});
