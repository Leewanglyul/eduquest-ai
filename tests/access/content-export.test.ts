import { describe, expect, it } from "vitest";

import {
  buildContentExportCsv,
  contentDisposition,
  exportFileName,
} from "@/features/content/export/export-csv";
import { parseContentCsv } from "@/features/content/import/csv-parse";
import { buildContentPreview } from "@/features/content/import/preview";
import { stripFormulaGuard } from "@/features/content/import/normalize";
import { evaluateRow } from "@/features/content/import/row-rules";

// ---------------------------------------------------------------------------------------------
// M2-1.5: the CSV the export writes, and that the importer reads it back unchanged. Pure functions;
// the route, the audit row and the full export -> import flow are in content-export-flow.test.ts.
// ---------------------------------------------------------------------------------------------

const tricky: [string, string][] = [
  ["사과", "빨간색이나 초록색의 둥근 과일"],
  ["도서관", '책을 빌리는 곳, "조용히" 하는 곳'],
  ["ice cream", "차가운 간식"],
  ["Wi-Fi", "무선 통신"],
  ["-포도", "하이픈으로 시작하는 용어"],
  ["물", "=1+1"],
  ["눈", "+5도"],
  ["산", "-5도 아래"],
  ["강", "@home 으로 시작"],
  ["달", "'작은따옴표로 시작"],
  ["별", "끝에 쉼표,"],
  ["해", '따옴표 "만" 있는 뜻'],
  ["COVID-19", "감염병"],
  ["3D 프린터", "입체 인쇄기"],
  ["O'Neil", "사람 이름"],
];

const lines = (csv: string) => csv.split("\r\n");

describe("M2-1.5 export format", () => {
  it("writes the import format: BOM, header, CRLF, one row per entry, a final line end", () => {
    const csv = buildContentExportCsv([
      { term: "사과", definition: "과일" },
      { term: "배", definition: "과일, 달다" },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿term,definition\r\n사과,과일\r\n배,"과일, 달다"\r\n');
    expect(lines(csv).at(-1)).toBe("");
  });

  it("exports an empty set as a header only", () => {
    expect(buildContentExportCsv([])).toBe("﻿term,definition\r\n");
  });

  it("neutralises cells a spreadsheet would run as formulas, and quotes commas, quotes and line ends", () => {
    const csv = buildContentExportCsv([
      { term: "a", definition: "=SUM(A1)" },
      { term: "b", definition: "+1" },
      { term: "-c", definition: "@x" },
      { term: "d", definition: 'say "hi", ok' },
    ]);
    expect(lines(csv).slice(1, 5)).toEqual(["a,'=SUM(A1)", "b,'+1", "'-c,'@x", 'd,"say ""hi"", ok"']);
  });
});

describe("M2-1.5 file name", () => {
  const day = new Date("2026-10-17T03:00:00Z");

  it("uses the title and the date", () => {
    expect(exportFileName("3학년 과학 1단원", day)).toBe("3학년 과학 1단원-20261017.csv");
  });

  it("removes what Windows and headers cannot hold, and never returns an empty name", () => {
    expect(exportFileName('a/b\\c:d*e?f"g<h>i|j', day)).toBe("a_b_c_d_e_f_g_h_i_j-20261017.csv");
    expect(exportFileName("  끝에 점...  ", day)).toBe("끝에 점-20261017.csv");
    expect(exportFileName("...", day)).toBe("word-set-20261017.csv");
    expect(exportFileName("가".repeat(200), day).length).toBeLessThanOrEqual(80 + "-20261017.csv".length);
  });

  it("sets Content-Disposition with an ASCII fallback and the UTF-8 name", () => {
    const header = contentDisposition("사회 1단원 (복습)-20261017.csv");
    expect(header).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(header).toContain("filename*=UTF-8''%EC%82%AC%ED%9A%8C%20");
    expect(header).toContain("%28%EB%B3%B5%EC%8A%B5%29"); // ( ) are encoded too
    expect(header).not.toMatch(/filename="[^"]*[^\x20-\x7e]/);
    expect(contentDisposition('a"b\\c.csv')).toContain('filename="a_b_c.csv"');
  });
});

describe("M2-1.5 formula guard on import", () => {
  it("removes the apostrophe only in front of = + - @", () => {
    expect(stripFormulaGuard("'=1+1")).toBe("=1+1");
    expect(stripFormulaGuard("'+5")).toBe("+5");
    expect(stripFormulaGuard("'-c")).toBe("-c");
    expect(stripFormulaGuard("'@x")).toBe("@x");
    for (const keep of ["'작은따옴표", "'", "''=x", " '=x", "=x", "plain", "a'=b", ""]) {
      expect(stripFormulaGuard(keep), keep).toBe(keep);
    }
  });

  it("is applied to the term and the definition of a row", () => {
    const r = evaluateRow({ line: 2, term: "'-포도", definition: "'=1+1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.term).toBe("-포도");
      expect(r.row.definition).toBe("=1+1");
      expect(r.row.answer).toBe("포도");
      expect(r.row.warnings).toContain("FORMULA_PREFIX");
    }
  });
});

describe("M2-1.5 round trip (export -> parse -> validate)", () => {
  it("gives back every term and definition unchanged, in order, with the same answers", () => {
    const stored = tricky.map(([term, definition], i) => {
      const r = evaluateRow({ line: i + 2, term, definition });
      if (!r.ok) throw new Error(`fixture ${term} rejected: ${r.errors.map((e) => e.code).join()}`);
      return r.row;
    });

    const csv = buildContentExportCsv(stored);
    const parsed = parseContentCsv(csv);
    const preview = buildContentPreview(parsed.rows, { mode: "create" });

    expect(preview.invalid).toEqual([]);
    expect(preview.valid.map((r) => [r.term, r.definition, r.answer, r.answerLength, r.script])).toEqual(
      stored.map((r) => [r.term, r.definition, r.answer, r.answerLength, r.script]),
    );
    expect(parsed.notices).toEqual([]);
  });

  it("is stable: exporting what was imported gives the same bytes", () => {
    const first = tricky.map(([term, definition], i) => {
      const r = evaluateRow({ line: i + 2, term, definition });
      if (!r.ok) throw new Error(term);
      return r.row;
    });
    const csv1 = buildContentExportCsv(first);
    const again = buildContentPreview(parseContentCsv(csv1).rows, { mode: "create" }).valid;
    expect(buildContentExportCsv(again)).toBe(csv1);
  });

  it("survives a spreadsheet-style save that adds nothing but a BOM and CRLF (already in the format)", () => {
    const csv = buildContentExportCsv([{ term: "사과", definition: "과일" }]);
    expect(parseContentCsv(csv).rows).toEqual([{ line: 2, term: "사과", definition: "과일" }]);
    expect(parseContentCsv(csv.replace(/^﻿/, "")).rows).toEqual([{ line: 2, term: "사과", definition: "과일" }]);
  });
});
