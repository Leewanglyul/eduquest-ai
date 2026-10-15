import "server-only";

import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClassroomForActor } from "@/features/classrooms/queries";
import {
  canManageRoster,
  isArchived,
  isTeacherArea,
  type ClassroomActor,
  type ClassroomWithRole,
} from "@/features/classrooms/domain";
import { EnrollmentError, type EnrollmentErrorCode } from "./errors";
import { enrollmentSchema, transferSchema } from "./schemas";

type Parsable<T> = {
  safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
};

function parse<T>(schema: Parsable<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new EnrollmentError("VALIDATION_FAILED", result.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
  }
  return result.data;
}

/**
 * Permission gate for every write: teacher-area actor, classroom visible to the actor
 * (school boundary enforced by getClassroomForActor), roster management allowed, not archived.
 * Not-visible is reported as NOT_FOUND so existence is not leaked.
 */
export async function requireManageableClassroom(
  actor: ClassroomActor,
  classroomId: string,
): Promise<ClassroomWithRole> {
  if (!isTeacherArea(actor.role)) throw new EnrollmentError("FORBIDDEN", "해당 작업 권한이 없습니다.");
  const classroom = await getClassroomForActor(actor, classroomId);
  if (!classroom) throw new EnrollmentError("NOT_FOUND", "학급을 찾을 수 없습니다.");
  if (!canManageRoster(classroom.role)) throw new EnrollmentError("FORBIDDEN", "해당 작업 권한이 없습니다.");
  if (isArchived(classroom)) throw new EnrollmentError("ARCHIVED", "보관된 학급은 수정할 수 없습니다.");
  return classroom;
}

/** Adds a student to the roster, reactivating a previously removed enrollment. */
export async function addStudentToClassroom(actor: ClassroomActor, rawInput: unknown): Promise<string> {
  const input = parse(enrollmentSchema, rawInput);
  const classroom = await requireManageableClassroom(actor, input.classroomId);
  const admin = createSupabaseAdminClient();

  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("id", input.studentId)
    .eq("school_id", classroom.schoolId)
    .maybeSingle();
  if (!student) throw new EnrollmentError("STUDENT_NOT_FOUND", "학생을 찾을 수 없습니다.");

  const { data: existing } = await admin
    .from("classroom_enrollments")
    .select("id, status")
    .eq("classroom_id", classroom.id)
    .eq("student_id", input.studentId)
    .maybeSingle();

  if (existing?.status === "active") {
    throw new EnrollmentError("ENROLLMENT_EXISTS", "이미 학급에 등록된 학생입니다.");
  }

  if (existing) {
    const { data: reactivated, error } = await admin
      .from("classroom_enrollments")
      .update({ status: "active", removed_at: null, enrolled_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("status", "removed")
      .select("id");
    if (error) throw new EnrollmentError("PERSIST_FAILED", "학생을 다시 등록하지 못했습니다.");
    if (!reactivated || reactivated.length === 0) {
      throw new EnrollmentError("ENROLLMENT_EXISTS", "이미 학급에 등록된 학생입니다.");
    }

    await writeAuditLog({
      actorId: actor.id,
      action: "enrollment.reactivated",
      resourceType: "enrollment",
      resourceId: existing.id,
      classroomId: classroom.id,
      metadata: { studentId: input.studentId },
    });
    return existing.id;
  }

  const { data: created, error } = await admin
    .from("classroom_enrollments")
    .insert({ classroom_id: classroom.id, student_id: input.studentId })
    .select("id")
    .single();
  if (error?.code === "23505") throw new EnrollmentError("ENROLLMENT_EXISTS", "이미 학급에 등록된 학생입니다.");
  if (error || !created) throw new EnrollmentError("PERSIST_FAILED", "학생을 등록하지 못했습니다.");

  await writeAuditLog({
    actorId: actor.id,
    action: "enrollment.added",
    resourceType: "enrollment",
    resourceId: created.id,
    classroomId: classroom.id,
    metadata: { studentId: input.studentId },
  });
  return created.id;
}

export async function removeStudentFromClassroom(actor: ClassroomActor, rawInput: unknown): Promise<void> {
  const input = parse(enrollmentSchema, rawInput);
  const classroom = await requireManageableClassroom(actor, input.classroomId);

  const { data, error } = await createSupabaseAdminClient()
    .from("classroom_enrollments")
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .eq("classroom_id", classroom.id)
    .eq("student_id", input.studentId)
    .eq("status", "active")
    .select("id");
  if (error) throw new EnrollmentError("PERSIST_FAILED", "학생을 제외하지 못했습니다.");
  if (!data || data.length === 0) {
    throw new EnrollmentError("ENROLLMENT_NOT_FOUND", "학급에 등록된 학생이 아닙니다.");
  }

  await writeAuditLog({
    actorId: actor.id,
    action: "enrollment.removed",
    resourceType: "enrollment",
    resourceId: data[0].id,
    classroomId: classroom.id,
    metadata: { studentId: input.studentId },
  });
}

const TRANSFER_ERRORS: Record<string, [EnrollmentErrorCode, string]> = {
  TRANSFER_SAME_CLASSROOM: ["VALIDATION_FAILED", "같은 학급으로는 이동할 수 없습니다."],
  TRANSFER_FORBIDDEN: ["FORBIDDEN", "두 학급 모두의 담임 또는 공동 담임이어야 이동할 수 있습니다."],
  TRANSFER_CLASSROOM_NOT_FOUND: ["NOT_FOUND", "학급을 찾을 수 없습니다."],
  TRANSFER_CLASSROOM_ARCHIVED: ["ARCHIVED", "보관된 학급으로/에서는 이동할 수 없습니다."],
  TRANSFER_CROSS_SCHOOL: ["FORBIDDEN", "다른 학교의 학급으로는 이동할 수 없습니다."],
  TRANSFER_STUDENT_NOT_FOUND: ["STUDENT_NOT_FOUND", "학생을 찾을 수 없습니다."],
  TRANSFER_NOT_ENROLLED: ["ENROLLMENT_NOT_FOUND", "원래 학급에 등록된 학생이 아닙니다."],
  TRANSFER_ALREADY_ENROLLED: ["ENROLLMENT_EXISTS", "이미 대상 학급에 등록된 학생입니다."],
};

/** Thin wrapper over the atomic fn_transfer_enrollment RPC (which also writes the audit row). */
export async function transferStudent(actor: ClassroomActor, rawInput: unknown): Promise<string> {
  const input = parse(transferSchema, rawInput);

  // Permission + visibility + archive checks on both sides before the service-role RPC call.
  await requireManageableClassroom(actor, input.sourceClassroomId);
  await requireManageableClassroom(actor, input.targetClassroomId);

  const { data, error } = await createSupabaseAdminClient().rpc("fn_transfer_enrollment", {
    source_classroom_id: input.sourceClassroomId,
    target_classroom_id: input.targetClassroomId,
    student_id: input.studentId,
    actor_id: actor.id,
  });

  if (error) {
    const key = Object.keys(TRANSFER_ERRORS).find((k) => error.message.includes(k));
    if (key) {
      const [code, message] = TRANSFER_ERRORS[key];
      throw new EnrollmentError(code, message);
    }
    throw new EnrollmentError("TRANSFER_FAILED", "학생을 이동하지 못했습니다.");
  }
  return data as string;
}
