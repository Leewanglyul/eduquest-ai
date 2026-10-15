import crypto from "node:crypto";

import { writeAuditLog } from "@/lib/audit/log";
import { provisionStudentAccount } from "../provisioning";
import { AccountProvisioningError } from "../errors";
import { BatchError } from "./batch-errors";
import {
  batchRunInputSchema,
  type BatchRow,
  type BatchRowResult,
  type BatchSummary,
} from "./batch-schemas";

type RunBatchInput = {
  schoolId: string;
  actorId: string;
  rows: { line: number; row: BatchRow }[];
};

/**
 * Provisions students sequentially. Each row is independent: a failure is recorded
 * and does not abort the rest (provisionStudentAccount rolls back its own partial state).
 */
export async function runStudentBatch(input: RunBatchInput): Promise<BatchSummary> {
  if (input.rows.length === 0) {
    throw new BatchError("NO_VALID_ROWS", "생성할 유효한 학생이 없습니다.");
  }
  batchRunInputSchema.parse({ rows: input.rows.map((r) => r.row) });

  const batchId = crypto.randomUUID();
  await writeAuditLog({
    actorId: input.actorId,
    action: "student.batch_started",
    resourceType: "batch",
    resourceId: batchId,
    metadata: { schoolId: input.schoolId, total: input.rows.length },
  });

  const results: BatchRowResult[] = [];
  for (const { line, row } of input.rows) {
    try {
      const account = await provisionStudentAccount({
        schoolId: input.schoolId,
        actorId: input.actorId,
        studentName: row.studentName,
        studentNo: row.studentNo,
        grade: row.grade,
      });
      results.push({
        ok: true,
        line,
        studentId: account.studentId,
        username: account.username,
        temporaryPassword: account.temporaryPassword,
        studentName: row.studentName,
        studentNo: row.studentNo,
        grade: row.grade,
      });
    } catch (error) {
      results.push({
        ok: false,
        line,
        studentName: row.studentName,
        studentNo: row.studentNo,
        error:
          error instanceof AccountProvisioningError
            ? error.message
            : "알 수 없는 오류가 발생했습니다.",
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  await writeAuditLog({
    actorId: input.actorId,
    action: "student.batch_completed",
    resourceType: "batch",
    resourceId: batchId,
    metadata: {
      schoolId: input.schoolId,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
    },
  });

  return { batchId, total: results.length, succeeded, failed: results.length - succeeded, results };
}
