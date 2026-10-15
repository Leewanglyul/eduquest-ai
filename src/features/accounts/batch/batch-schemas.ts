import { z } from "zod";
import { studentGradeSchema } from "../domain";

export const MAX_BATCH_ROWS = 200;
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
    }
  | { ok: false; line: number; studentName: string; studentNo: string; error: string };

export type BatchSummary = {
  batchId: string;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchRowResult[];
};
