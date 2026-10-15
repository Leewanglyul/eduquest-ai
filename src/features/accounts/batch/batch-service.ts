import crypto from "node:crypto";

import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { provisionStudentAccount } from "../provisioning";
import { AccountProvisioningError } from "../errors";
import { EnrollmentError } from "@/features/enrollments/errors";
import { addStudentToClassroom } from "@/features/enrollments/service";
import { BatchError } from "./batch-errors";
import {
  batchRunInputSchema,
  type BatchRow,
  type BatchRowResult,
  type BatchSummary,
} from "./batch-schemas";

export const COMMIT_TOKEN_TTL_MINUTES = 15;

type RowInput = { line: number; row: BatchRow };

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** The classroom is part of the hash so a preview token cannot be replayed against another classroom. */
function hashRows(rows: RowInput[], classroomId: string | null): string {
  return sha256(
    JSON.stringify([classroomId, rows.map(({ row }) => [row.studentName, row.studentNo, row.grade])]),
  );
}

export type BatchPreviewTicket = { batchId: string; commitToken: string; expiresAt: string };

/** Stores a previewed batch and returns a single-use commit token (only its hash is persisted). */
export async function createBatchPreview(input: {
  schoolId: string;
  actorId: string;
  classroomId?: string | null;
  rows: RowInput[];
}): Promise<BatchPreviewTicket> {
  if (input.rows.length === 0) {
    throw new BatchError("NO_VALID_ROWS", "생성할 유효한 학생이 없습니다.");
  }
  batchRunInputSchema.parse({ rows: input.rows.map((r) => r.row) });

  const commitToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + COMMIT_TOKEN_TTL_MINUTES * 60_000).toISOString();

  const { data, error } = await createSupabaseAdminClient()
    .from("account_batches")
    .insert({
      school_id: input.schoolId,
      actor_id: input.actorId,
      commit_token_hash: sha256(commitToken),
      rows_hash: hashRows(input.rows, input.classroomId ?? null),
      total_rows: input.rows.length,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new BatchError("BATCH_PERSIST_FAILED", "미리보기를 저장하지 못했습니다.");
  }

  return { batchId: data.id, commitToken, expiresAt };
}

/**
 * Commits a previewed batch. The token is single-use: the batch is claimed atomically
 * (previewed -> running) before any account is created. Each row is independent; a failure
 * is recorded and does not abort the rest (provisionStudentAccount rolls back its own state).
 */
export async function commitStudentBatch(input: {
  batchId: string;
  commitToken: string;
  schoolId: string;
  actorId: string;
  /** Enroll every created student into this classroom (validated by the caller beforehand). */
  classroomId?: string | null;
  actor?: Parameters<typeof addStudentToClassroom>[0];
  rows: RowInput[];
}): Promise<BatchSummary> {
  if (input.rows.length === 0) {
    throw new BatchError("NO_VALID_ROWS", "생성할 유효한 학생이 없습니다.");
  }
  batchRunInputSchema.parse({ rows: input.rows.map((r) => r.row) });

  const admin = createSupabaseAdminClient();
  const { data: batch } = await admin
    .from("account_batches")
    .select("id, status, rows_hash, commit_token_hash, expires_at")
    .eq("id", input.batchId)
    .eq("actor_id", input.actorId)
    .eq("school_id", input.schoolId)
    .maybeSingle();

  if (!batch || batch.status !== "previewed") {
    throw new BatchError("BATCH_NOT_FOUND", "유효한 미리보기를 찾을 수 없거나 이미 사용되었습니다.");
  }
  const given = Buffer.from(sha256(input.commitToken));
  const stored = Buffer.from(batch.commit_token_hash);
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    throw new BatchError("COMMIT_TOKEN_INVALID", "확인 토큰이 올바르지 않습니다.");
  }
  if (new Date(batch.expires_at).getTime() < Date.now()) {
    await admin.from("account_batches").update({ status: "expired" }).eq("id", batch.id);
    throw new BatchError("BATCH_EXPIRED", "미리보기가 만료되었습니다. 다시 미리보기를 실행해 주세요.");
  }
  if (batch.rows_hash !== hashRows(input.rows, input.classroomId ?? null)) {
    throw new BatchError("ROWS_CHANGED", "미리보기 이후 파일 내용이 변경되었습니다.");
  }

  // Atomic single-use claim.
  const { data: claimed } = await admin
    .from("account_batches")
    .update({ status: "running" })
    .eq("id", batch.id)
    .eq("status", "previewed")
    .select("id");
  if (!claimed || claimed.length !== 1) {
    throw new BatchError("BATCH_NOT_FOUND", "유효한 미리보기를 찾을 수 없거나 이미 사용되었습니다.");
  }

  await writeAuditLog({
    actorId: input.actorId,
    action: "student.batch_started",
    resourceType: "batch",
    resourceId: batch.id,
    metadata: { schoolId: input.schoolId, total: input.rows.length, classroomId: input.classroomId ?? null },
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
      let enrollmentError: string | undefined;
      if (input.classroomId && input.actor) {
        try {
          await addStudentToClassroom(input.actor, {
            classroomId: input.classroomId,
            studentId: account.studentId,
          });
        } catch (enrollError) {
          // Account exists; keep its credential row and flag the enrollment failure.
          enrollmentError =
            enrollError instanceof EnrollmentError ? enrollError.message : "학급 등록에 실패했습니다.";
        }
      }
      results.push({
        ok: true,
        line,
        studentId: account.studentId,
        username: account.username,
        temporaryPassword: account.temporaryPassword,
        studentName: row.studentName,
        studentNo: row.studentNo,
        grade: row.grade,
        ...(enrollmentError ? { enrollmentError } : {}),
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
  const failed = results.length - succeeded;

  await admin
    .from("account_batches")
    .update({
      status: "completed",
      succeeded_rows: succeeded,
      failed_rows: failed,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batch.id);

  await writeAuditLog({
    actorId: input.actorId,
    action: "student.batch_completed",
    resourceType: "batch",
    resourceId: batch.id,
    metadata: {
      schoolId: input.schoolId,
      total: results.length,
      succeeded,
      failed,
      classroomId: input.classroomId ?? null,
      enrollmentFailed: results.filter((r) => r.ok && r.enrollmentError).length,
    },
  });

  return { batchId: batch.id, classroomId: input.classroomId ?? null, total: results.length, succeeded, failed, results };
}
