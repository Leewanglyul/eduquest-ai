import "server-only";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ClassroomActor } from "@/features/classrooms/domain";
import { EnrollmentError } from "@/features/enrollments/errors";
import { requireManageableClassroom } from "@/features/enrollments/service";
import { AccountProvisioningError } from "./errors";
import { generateTemporaryPassword } from "./credentials";

const reissueSchema = z
  .object({ classroomId: z.string().uuid(), studentId: z.string().uuid() })
  .strict();

export type ReissuedCredential = {
  studentId: string;
  studentName: string;
  username: string;
  /** Shown once to the teacher; never stored or logged. */
  temporaryPassword: string;
};

/**
 * Teacher-initiated temporary password reissue.
 *
 * Permission = the same gate as roster management: the actor must be an owner / co-teacher / admin
 * of a NON-archived classroom in the student's school, and the student must be actively enrolled
 * in that classroom. (Not-visible classrooms surface as NOT_FOUND.)
 *
 * Effects: new random temporary password, must_change_password = true, lock/attempt counters
 * cleared, every existing session of the student revoked, `student.password_reissued` audited
 * (the password itself is never written to the audit log).
 */
export async function reissueStudentPassword(
  actor: ClassroomActor,
  rawInput: unknown,
): Promise<ReissuedCredential> {
  const parsed = reissueSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new EnrollmentError("VALIDATION_FAILED", "입력값을 확인해 주세요.");
  }
  const { classroomId, studentId } = parsed.data;

  const classroom = await requireManageableClassroom(actor, classroomId);
  const admin = createSupabaseAdminClient();

  const { data: enrollment } = await admin
    .from("classroom_enrollments")
    .select("id")
    .eq("classroom_id", classroom.id)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();
  if (!enrollment) {
    throw new EnrollmentError("ENROLLMENT_NOT_FOUND", "학급에 등록된 학생이 아닙니다.");
  }

  const { data: student } = await admin
    .from("students")
    .select("id, profile_id")
    .eq("id", studentId)
    .eq("school_id", classroom.schoolId)
    .maybeSingle();
  const { data: account } = student
    ? await admin
        .from("student_accounts")
        .select("id, username")
        .eq("student_id", student.id)
        .maybeSingle()
    : { data: null };
  if (!student || !account) {
    throw new EnrollmentError("STUDENT_NOT_FOUND", "학생 계정을 찾을 수 없습니다.");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", student.profile_id)
    .single();

  const fail = () =>
    new AccountProvisioningError(
      "PASSWORD_REISSUE_FAILED",
      "임시 비밀번호를 재발급하지 못했습니다. 다시 시도해 주세요.",
    );

  // Order matters for failure safety: force the change FIRST. If a later step fails, the student is
  // merely forced to change a password (harmless); the teacher sees an error and retries.
  const { error: flagError } = await admin
    .from("student_accounts")
    .update({ must_change_password: true, failed_attempts: 0, locked_until: null })
    .eq("id", account.id);
  if (flagError) throw fail();

  const temporaryPassword = generateTemporaryPassword();
  const { error: passwordError } = await admin.auth.admin.updateUserById(student.profile_id, {
    password: temporaryPassword,
  });
  if (passwordError) throw fail();

  // Without this an old (or stolen) session could finish the forced change without the new password.
  const { error: revokeError } = await admin.rpc("fn_revoke_user_sessions", {
    p_user_id: student.profile_id,
  });
  if (revokeError) throw fail();

  await writeAuditLog({
    actorId: actor.id,
    action: "student.password_reissued",
    resourceType: "account",
    resourceId: account.id,
    classroomId: classroom.id,
    metadata: { studentId: student.id, classroomId: classroom.id, schoolId: classroom.schoolId },
  });

  return {
    studentId: student.id,
    studentName: profile?.display_name ?? "",
    username: account.username,
    temporaryPassword,
  };
}
