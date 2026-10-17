import { describe, expect, it } from "vitest";

import {
  ANSWER_MAX_LEN,
  ANSWER_MIN_LEN,
  DEFINITION_MAX_CHARS,
  SET_TITLE_MAX_CHARS,
  TERM_MAX_CHARS,
  type RawContentRow,
} from "@/features/content/import/content-schemas";
import { ContentImportError } from "@/features/content/import/import-errors";
import { cleanText, deriveAnswer, normalizeSetTitle } from "@/features/content/import/normalize";
import { evaluateRow } from "@/features/content/import/row-rules";

const raw = (term: string, definition = "뜻", line = 2): RawContentRow => ({ line, term, definition });

/** The accepted row, or a failure with the error codes. */
function accept(term: string, definition = "뜻") {
  const result = evaluateRow(raw(term, definition));
  if (!result.ok) throw new Error(`rejected: ${result.errors.map((e) => e.code).join(",")}`);
  return result.row;
}
const rejectCodes = (term: string, definition = "뜻") => {
  const result = evaluateRow(raw(term, definition));
  return result.ok ? [] : result.errors.map((e) => e.code);
};

describe("M2-1.3 display cleaning", () => {
  it("composes decomposed Hangul (NFD from macOS) into the same text and answer", () => {
    const decomposed = "사과".normalize("NFD");
    expect(decomposed).not.toBe("사과");
    expect(cleanText(decomposed).text).toBe("사과");
    expect(accept(decomposed).answer).toBe("사과");
  });

  it("trims silently but reports collapsed whitespace and line breaks", () => {
    expect(cleanText("  사과  ")).toEqual({ text: "사과", controlRemoved: false, whitespaceChanged: false });
    expect(cleanText("a  b").whitespaceChanged).toBe(true);
    expect(cleanText("a\nb")).toMatchObject({ text: "a b", whitespaceChanged: true });
    expect(cleanText("a 　b").text).toBe("a b");
  });

  it("removes NUL, controls, zero-width and bidi characters", () => {
    const dirty = "사\u0000과​‮\u0007﻿";
    expect(cleanText(dirty)).toMatchObject({ text: "사과", controlRemoved: true });
    expect(cleanText("사과").controlRemoved).toBe(false);
  });

  it("never lets NUL or bidi characters reach the output", () => {
    const row = accept("사\u0000과", "뜻‮\u0000");
    expect(row.term).toBe("사과");
    expect(row.definition).toBe("뜻");
    expect(row.warnings).toContain("CONTROL_CHARS_REMOVED");
    // eslint-disable-next-line no-control-regex
    expect(`${row.term}${row.definition}${row.answer}`).not.toMatch(/[\u0000‮]/);
  });

  it("is idempotent", () => {
    for (const s of ["  Ice   Cream ", "사\u0000과", "a\nb", "ＡＢＣ", "사과".normalize("NFD")]) {
      const once = cleanText(s).text;
      expect(cleanText(once).text).toBe(once);
    }
  });
});

describe("M2-1.3 answer derivation (examples from the design)", () => {
  it.each([
    ["사과", "사과", 2, "hangul"],
    ["도서관", "도서관", 3, "hangul"],
    ["ice cream", "ICECREAM", 8, "latin"],
    ["  Ice   Cream ", "ICECREAM", 8, "latin"],
    ["e-mail", "EMAIL", 5, "latin"],
    ["O'Neil", "ONEIL", 5, "latin"],
    ["O’Neil", "ONEIL", 5, "latin"],
    ["ＡＢＣ", "ABC", 3, "latin"],
    ["3.14", "314", 3, "digit"],
    ["3D 프린터", "3D프린터", 5, "mixed"],
    ["대한 민국", "대한민국", 4, "hangul"],
    ["물", "물", 1, "hangul"],
    ["배", "배", 1, "hangul"],
    ["A", "A", 1, "latin"],
    ["한·중", "한중", 2, "hangul"],
    ["한ㆍ중", "한중", 2, "hangul"],
    ["-사과", "사과", 2, "hangul"],
  ])("%s -> %s", (term, answer, length, script) => {
    const row = accept(term);
    expect(row.answer).toBe(answer);
    expect(row.answerLength).toBe(length);
    expect(row.script).toBe(script);
  });

  it("keeps the display term as written (cleaned), not the answer form", () => {
    expect(accept("  Ice   Cream ").term).toBe("Ice Cream");
    expect(accept("ＡＢＣ").term).toBe("ＡＢＣ");
  });

  it("rejects characters a crossword cell cannot hold and lists them", () => {
    const result = evaluateRow(raw("사과(과일)"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("ANSWER_INVALID_CHAR");
      expect(result.errors[0].context?.chars).toEqual(["(", ")"]);
    }
    expect(rejectCodes("한국어韓國語")).toEqual(["ANSWER_INVALID_CHAR"]);
    expect(rejectCodes("①②")).toEqual(["ANSWER_INVALID_CHAR"]);
    expect(rejectCodes("㈜대한")).toEqual(["ANSWER_INVALID_CHAR"]);
    expect(rejectCodes("hello!")).toEqual(["ANSWER_INVALID_CHAR"]);
    expect(rejectCodes("cafés")).toEqual(["ANSWER_INVALID_CHAR"]);
  });

  it("lists at most five offending characters, each once", () => {
    const d = deriveAnswer("!@#$%^&*(!!");
    expect(d.ok).toBe(false);
    if (!d.ok && d.code === "ANSWER_INVALID_CHAR") expect(d.chars).toHaveLength(5);
  });

  it("rejects stand-alone jamo", () => {
    expect(rejectCodes("ㄱㄴㄷ")).toEqual(["ANSWER_JAMO"]);
    expect(rejectCodes("가ㅏ")).toEqual(["ANSWER_JAMO"]);
    expect(rejectCodes("ᄀᄀ")).toEqual(["ANSWER_JAMO"]);
    // A conjoining L+V+T sequence is composed by NFC into one real syllable (각), so it is not jamo.
    expect(accept("각가").answer).toBe("각가");
  });

  it("warns on mixed script but still accepts", () => {
    expect(accept("3D 프린터").warnings).toContain("ANSWER_MIXED_SCRIPT");
    expect(accept("사과").warnings).not.toContain("ANSWER_MIXED_SCRIPT");
  });
});

describe("M2-1.3 boundaries (written with the constants)", () => {
  const latin = (n: number) => "A".repeat(n);

  it("answer length: min - 1 fails, min and max pass, max + 1 fails", () => {
    // One below the minimum is an answer with nothing left after removing separators.
    expect(ANSWER_MIN_LEN).toBe(1);
    expect(rejectCodes("--")).toEqual(["ANSWER_TOO_SHORT"]);
    expect(rejectCodes(latin(ANSWER_MIN_LEN))).toEqual([]);
    expect(rejectCodes(latin(ANSWER_MAX_LEN))).toEqual([]);
    expect(rejectCodes(latin(ANSWER_MAX_LEN + 1))).toEqual(["ANSWER_TOO_LONG"]);
  });

  it("counts Hangul syllables, not code units or bytes", () => {
    expect(rejectCodes("가".repeat(ANSWER_MAX_LEN))).toEqual([]);
    expect(rejectCodes("가".repeat(ANSWER_MAX_LEN + 1))).toEqual(["ANSWER_TOO_LONG"]);
  });

  it("reports the length of a too long answer", () => {
    const result = evaluateRow(raw(latin(ANSWER_MAX_LEN + 1)));
    expect(!result.ok && result.errors[0].context?.length).toBe(ANSWER_MAX_LEN + 1);
  });

  it("an answer made only of separators is too short", () => {
    expect(rejectCodes("---")).toEqual(["ANSWER_TOO_SHORT"]);
  });

  it("term length: max passes, max + 1 fails", () => {
    const padded = (n: number) => `가나${"-".repeat(n - 2)}`;
    expect(rejectCodes(padded(TERM_MAX_CHARS))).toEqual([]);
    expect(rejectCodes(padded(TERM_MAX_CHARS + 1))).toEqual(["TERM_TOO_LONG"]);
  });

  it("definition length: max passes, max + 1 fails", () => {
    expect(rejectCodes("사과", "x".repeat(DEFINITION_MAX_CHARS))).toEqual([]);
    expect(rejectCodes("사과", "x".repeat(DEFINITION_MAX_CHARS + 1))).toEqual(["DEFINITION_TOO_LONG"]);
  });

  it("set title: 1..max characters", () => {
    expect(normalizeSetTitle("  3학년  과학 ")).toBe("3학년 과학");
    expect(normalizeSetTitle("가".repeat(SET_TITLE_MAX_CHARS))).toHaveLength(SET_TITLE_MAX_CHARS);
    for (const bad of ["", "   ", "가".repeat(SET_TITLE_MAX_CHARS + 1)]) {
      expect(() => normalizeSetTitle(bad)).toThrowError(ContentImportError);
    }
  });
});

describe("M2-1.3 field rules", () => {
  it("rejects empty term and empty definition and reports both", () => {
    expect(rejectCodes("", "")).toEqual(["TERM_EMPTY", "DEFINITION_EMPTY"]);
    expect(rejectCodes("   ", "뜻")).toEqual(["TERM_EMPTY"]);
    expect(rejectCodes("사과", "   ")).toEqual(["DEFINITION_EMPTY"]);
  });

  it("rejects a record with too few cells", () => {
    const result = evaluateRow({ line: 5, term: "사과", definition: "", tooFewColumns: true });
    expect(!result.ok && result.errors.map((e) => e.code)).toEqual(["ROW_TOO_FEW_COLUMNS"]);
  });

  it("collects several errors on one row", () => {
    expect(rejectCodes("물!", "")).toEqual(["DEFINITION_EMPTY", "ANSWER_INVALID_CHAR"]);
  });
});

describe("M2-1.3 warnings", () => {
  it("warns when the clue contains the answer", () => {
    expect(accept("사과", "빨간 사과 맛").warnings).toContain("DEFINITION_CONTAINS_ANSWER");
    expect(accept("ice cream", "Ice  Cream is cold").warnings).toContain("DEFINITION_CONTAINS_ANSWER");
    expect(accept("사과", "과일의 한 종류").warnings).not.toContain("DEFINITION_CONTAINS_ANSWER");
  });

  it("warns on a definition that looks like a spreadsheet formula and stores it verbatim", () => {
    for (const d of ["=1+1", "+5", "-5도", "@home", '=HYPERLINK("http://x")']) {
      const row = accept("사과", d);
      expect(row.warnings).toContain("FORMULA_PREFIX");
      expect(row.definition).toBe(d);
    }
    expect(evaluateRow(raw("사과", "\t=x"))).toMatchObject({ ok: true });
    expect(accept("사과", "정상 뜻").warnings).not.toContain("FORMULA_PREFIX");
  });

  it("rejects a formula as a term (not a valid answer)", () => {
    expect(rejectCodes("=SUM(A1)")).toEqual(["ANSWER_INVALID_CHAR"]);
  });

  it("warns on collapsed whitespace", () => {
    expect(accept("사과", "줄1\n줄2").warnings).toContain("WHITESPACE_NORMALISED");
    expect(accept("사과", "  뜻  ").warnings).toEqual([]);
  });

  it("keeps characters that are legal text but dangerous markup untouched", () => {
    expect(accept("사과", "x < 5 & y > 3").definition).toBe("x < 5 & y > 3");
  });
});
