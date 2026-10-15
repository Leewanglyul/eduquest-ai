import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import {
  resolveClassroomRole,
  type ClassroomActor,
  type ClassroomRecord,
  type ClassroomWithRole,
  type CoTeacherRecord,
  type RosterEntry,
} from "./domain";

type ClassroomRow = Database["public"]["Tables"]["classrooms"]["Row"];

export function toClassroomRecord(row: ClassroomRow): ClassroomRecord {
  return {
    id: row.id,
    schoolId: row.school_id,
    ownerId: row.owner_id,
    name: row.name,
    code: row.code,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Access-checked read: returns null when missing OR not visible to the actor. */
export async function getClassroomForActor(
  actor: ClassroomActor,
  classroomId: string,
): Promise<ClassroomWithRole | null> {
  const admin = createSupabaseAdminClient();

  const { data: row } = await admin
    .from("classrooms")
    .select("*")
    .eq("id", classroomId)
    .eq("school_id", actor.school_id)
    .maybeSingle();
  if (!row) return null;

  const { data: membership } = await admin
    .from("classroom_teachers")
    .select("teacher_id")
    .eq("classroom_id", classroomId)
    .eq("teacher_id", actor.id)
    .maybeSingle();

  const classroom = toClassroomRecord(row);
  const role = resolveClassroomRole(classroom, membership !== null, actor);
  return role ? { ...classroom, role } : null;
}

/** Classrooms the actor owns or co-teaches (admins: whole school), filtered by archive state. */
export async function listClassroomsForActor(
  actor: ClassroomActor,
  options: { archived: boolean } = { archived: false },
): Promise<ClassroomWithRole[]> {
  const admin = createSupabaseAdminClient();

  let query = admin.from("classrooms").select("*").eq("school_id", actor.school_id);
  query = options.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  if (actor.role !== "admin") {
    const { data: memberships } = await admin
      .from("classroom_teachers")
      .select("classroom_id")
      .eq("teacher_id", actor.id);
    const memberIds = (memberships ?? []).map((m) => m.classroom_id);
    query =
      memberIds.length > 0
        ? query.or(`owner_id.eq.${actor.id},id.in.(${memberIds.join(",")})`)
        : query.eq("owner_id", actor.id);
  }

  const { data: rows } = await query.order("created_at", { ascending: false });

  const memberSet = new Set<string>();
  if (actor.role !== "admin") {
    const { data: memberships } = await admin
      .from("classroom_teachers")
      .select("classroom_id")
      .eq("teacher_id", actor.id);
    (memberships ?? []).forEach((m) => memberSet.add(m.classroom_id));
  }

  return (rows ?? []).flatMap((row) => {
    const classroom = toClassroomRecord(row);
    const role = resolveClassroomRole(classroom, memberSet.has(classroom.id), actor);
    return role ? [{ ...classroom, role }] : [];
  });
}

export async function listCoTeachers(classroomId: string): Promise<CoTeacherRecord[]> {
  const admin = createSupabaseAdminClient();
  const { data: rows } = await admin
    .from("classroom_teachers")
    .select("teacher_id, added_by, created_at")
    .eq("classroom_id", classroomId)
    .order("created_at");
  if (!rows || rows.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .in(
      "id",
      rows.map((r) => r.teacher_id),
    );
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return rows.map((r) => ({
    teacherId: r.teacher_id,
    displayName: names.get(r.teacher_id) ?? "",
    addedBy: r.added_by,
    createdAt: r.created_at,
  }));
}

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
    if (!s || !s.id) return [];
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
