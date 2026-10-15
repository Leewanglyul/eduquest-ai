import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listClassroomsForActor } from "@/features/classrooms/queries";
import type { ClassroomActor, ClassroomRecord } from "@/features/classrooms/domain";
import {
  MAX_ADDABLE_STUDENTS,
  type AddableStudent,
  type RosterEntry,
  type TransferTarget,
} from "./domain";

/** Active roster, using the safe student view (no usernames/emails). */
export async function listRoster(classroomId: string): Promise<RosterEntry[]> {
  const admin = createSupabaseAdminClient();
  const { data: enrollments } = await admin
    .from("classroom_enrollments")
    .select("id, student_id, enrolled_at")
    .eq("classroom_id", classroomId)
    .eq("status", "active")
    .order("enrolled_at");
  if (!enrollments || enrollments.length === 0) return [];

  const { data: students } = await admin
    .from("v_students_safe")
    .select("id, student_no, grade, display_name")
    .in(
      "id",
      enrollments.map((e) => e.student_id),
    );
  const byId = new Map((students ?? []).map((s) => [s.id, s]));

  return enrollments.flatMap((e) => {
    const s = byId.get(e.student_id);
    if (!s) return [];
    return [
      {
        enrollmentId: e.id,
        studentId: e.student_id,
        studentNo: s.student_no ?? "",
        grade: s.grade ?? "",
        displayName: s.display_name ?? "",
        enrolledAt: e.enrolled_at,
      },
    ];
  });
}

/** Same-school students not actively enrolled in this classroom (removed ones can be reactivated). */
export async function listAddableStudents(
  classroom: Pick<ClassroomRecord, "id" | "schoolId">,
): Promise<AddableStudent[]> {
  const admin = createSupabaseAdminClient();

  const { data: active } = await admin
    .from("classroom_enrollments")
    .select("student_id")
    .eq("classroom_id", classroom.id)
    .eq("status", "active");
  const enrolled = new Set((active ?? []).map((e) => e.student_id));

  const { data: students } = await admin
    .from("v_students_safe")
    .select("id, student_no, grade, display_name")
    .eq("school_id", classroom.schoolId)
    .eq("profile_status", "active")
    .order("grade")
    .order("student_no")
    .limit(MAX_ADDABLE_STUDENTS + enrolled.size);

  return (students ?? [])
    .filter((s) => s.id && !enrolled.has(s.id))
    .slice(0, MAX_ADDABLE_STUDENTS)
    .map((s) => ({
      studentId: s.id as string,
      studentNo: s.student_no ?? "",
      grade: s.grade ?? "",
      displayName: s.display_name ?? "",
    }));
}

/** Active classrooms the actor may transfer into (the RPC re-checks membership of both sides). */
export async function listTransferTargets(
  actor: ClassroomActor,
  sourceClassroomId: string,
): Promise<TransferTarget[]> {
  const classrooms = await listClassroomsForActor(actor, { archived: false });
  return classrooms
    .filter((c) => c.id !== sourceClassroomId)
    .map((c) => ({ classroomId: c.id, name: c.name, code: c.code }));
}
