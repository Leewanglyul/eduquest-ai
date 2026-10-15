import { BatchError } from "./batch-errors";
import { MAX_BATCH_ROWS, MAX_CSV_BYTES } from "./batch-schemas";

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (inQuotes) throw new BatchError("CSV_MALFORMED", "따옴표가 닫히지 않았습니다.");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES = {
  studentName: ["이름", "성명", "name", "studentname"],
  studentNo: ["학번", "번호", "studentno", "student_no"],
  grade: ["학년", "grade"],
} as const;

export type RawStudentRow = { line: number; studentName: string; studentNo: string; grade: string };

/** Parses CSV text with a required header row into raw rows (line = 1-based file line). */
export function parseStudentCsv(text: string): RawStudentRow[] {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) {
    throw new BatchError("TOO_MANY_ROWS", "파일이 너무 큽니다.");
  }
  const table = parseCsv(text);
  if (table.length === 0) throw new BatchError("EMPTY_FILE", "비어 있는 파일입니다.");

  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = { studentName: -1, studentNo: -1, grade: -1 };
  for (const key of Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]) {
    const aliases: readonly string[] = HEADER_ALIASES[key];
    idx[key] = header.findIndex((h) => aliases.includes(h));
    if (idx[key] < 0) {
      throw new BatchError("MISSING_HEADER", "헤더에 이름, 학번, 학년 열이 필요합니다.");
    }
  }

  const body = table.slice(1);
  if (body.length === 0) throw new BatchError("EMPTY_FILE", "학생 행이 없습니다.");
  if (body.length > MAX_BATCH_ROWS) {
    throw new BatchError("TOO_MANY_ROWS", `한 번에 최대 ${MAX_BATCH_ROWS}명까지 만들 수 있습니다.`);
  }

  return body.map((cells, i) => ({
    line: i + 2,
    studentName: cells[idx.studentName] ?? "",
    studentNo: cells[idx.studentNo] ?? "",
    grade: cells[idx.grade] ?? "",
  }));
}
