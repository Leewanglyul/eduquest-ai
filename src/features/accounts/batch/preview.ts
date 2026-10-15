import { batchRowSchema, type BatchRow } from "./batch-schemas";
import type { RawStudentRow } from "./csv-parse";

export type PreviewRow = { line: number; row: BatchRow };
export type PreviewIssue = { line: number; studentNo: string; errors: string[] };

export type BatchPreview = {
  valid: PreviewRow[];
  invalid: PreviewIssue[];
};

/** Validates rows and flags duplicate student numbers inside the file (first occurrence wins). */
export function buildPreview(raw: RawStudentRow[]): BatchPreview {
  const valid: PreviewRow[] = [];
  const invalid: PreviewIssue[] = [];
  const seen = new Map<string, number>();

  for (const r of raw) {
    const parsed = batchRowSchema.safeParse(r);
    if (!parsed.success) {
      invalid.push({
        line: r.line,
        studentNo: r.studentNo.trim(),
        errors: parsed.error.issues.map((i) => i.message),
      });
      continue;
    }

    const firstLine = seen.get(parsed.data.studentNo);
    if (firstLine !== undefined) {
      invalid.push({
        line: r.line,
        studentNo: parsed.data.studentNo,
        errors: [`학번이 ${firstLine}행과 중복됩니다.`],
      });
      continue;
    }

    seen.set(parsed.data.studentNo, r.line);
    valid.push({ line: r.line, row: parsed.data });
  }

  return { valid, invalid };
}
