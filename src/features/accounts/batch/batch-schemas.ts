import { z } from "zod";
import { studentGradeSchema } from "../domain";

/**
 * Pilot cap: students per CSV import. Single source of truth for the CSV parser (preview and
 * commit both re-parse server-side), the zod run schema and the UI text (passed as a prop).
 * See docs/pilot/01-batch-size-cap-plan.md.
 */
export const MAX_BATCH_ROWS = 30;
export const MAX_CSV_BYTES = 256 * 1024;

export const batchRowSchema = z.object({
  studentName: z.string().trim().min(1, "이름이 비어 있습니다.").max(80, "이름이 너무 깁니다."),
  studentNo: z.string().trim().min(1, "학번이 비어 있습니다.").max(40, "학번이 너무 깁니다."),
  grade: studentGradeSchema,
});

export type BatchRow = z.infer<typeof batchRowSchema>;

export const batchRunInputSchema = z.object({
  rows: z.array(batchRowSchema).min(1).max(MAX_BATCH_ROWS),
});

export type BatchRowResult =
  | {
      ok: true;
      line: number;
      studentId: string;
      username: string;
      temporaryPassword: string;
      studentName: string;
      studentNo: string;
      grade: string;
      /** Account was created but the classroom enrollment failed. */
      enrollmentError?: string;
    }
  | { ok: false; line: number; studentName: string; studentNo: string; error: string };

export type BatchSummary = {
  batchId: string;
  classroomId: string | null;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchRowResult[];
};
