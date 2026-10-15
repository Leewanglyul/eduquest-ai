import type { IdentityProfile } from "@/features/identity/types";

/** Effective relationship between an actor and a classroom. */
export type ClassroomRole = "owner" | "co_teacher" | "admin";

export type ClassroomRecord = {
  id: string;
  schoolId: string;
  ownerId: string;
  name: string;
  /** Read-only, database-generated reference code. */
  code: string;
  /** Archive state: archivedAt !== null. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClassroomWithRole = ClassroomRecord & { role: ClassroomRole };

export type CoTeacherRecord = {
  teacherId: string;
  displayName: string;
  addedBy: string | null;
  createdAt: string;
};

export type RosterEntry = {
  enrollmentId: string;
  studentId: string;
  studentNo: string;
  grade: string;
  displayName: string;
  enrolledAt: string;
};

export type ClassroomActor = Pick<IdentityProfile, "id" | "school_id" | "role">;

export function isArchived(classroom: Pick<ClassroomRecord, "archivedAt">): boolean {
  return classroom.archivedAt !== null;
}

export function isTeacherArea(role: IdentityProfile["role"]): boolean {
  return role === "teacher" || role === "admin";
}

/** Returns null when the actor has no access (callers must treat that as "not found"). */
export function resolveClassroomRole(
  classroom: Pick<ClassroomRecord, "ownerId" | "schoolId">,
  isCoTeacher: boolean,
  actor: ClassroomActor,
): ClassroomRole | null {
  if (!isTeacherArea(actor.role) || classroom.schoolId !== actor.school_id) return null;
  if (actor.role === "admin") return "admin";
  if (classroom.ownerId === actor.id) return "owner";
  if (isCoTeacher) return "co_teacher";
  return null;
}

/** Co-teacher: edit metadata and manage the roster. */
export const canEditClassroom = (_role: ClassroomRole) => true;
export const canManageRoster = (_role: ClassroomRole) => true;

/** Owner-only (admins included): archive/unarchive and co-teacher management. */
export const canArchiveClassroom = (role: ClassroomRole) => role === "owner" || role === "admin";
export const canManageCoTeachers = (role: ClassroomRole) => role === "owner" || role === "admin";
