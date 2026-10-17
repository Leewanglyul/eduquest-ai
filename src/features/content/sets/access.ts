import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClassroomForActor } from "@/features/classrooms/queries";
import { isArchived, isTeacherArea, type ClassroomActor } from "@/features/classrooms/domain";
import { ContentImportError } from "../import/import-errors";

export type ContentSetRole = "admin" | "owner" | "classroom_staff";

export type ContentSetRecord = {
  id: string;
  schoolId: string;
  ownerId: string;
  classroomId: string | null;
  title: string;
  archivedAt: string | null;
  role: ContentSetRole;
  /** The linked classroom is archived: the set is read-only (decision P2). */
  classroomArchived: boolean;
};

/**
 * Who may write to a set (decision D3): the set owner, an admin, the owner of the linked classroom and its
 * co-teachers all manage it alike. Kept in one function so a later change stays local.
 */
const WRITE_ROLES: readonly ContentSetRole[] = ["admin", "owner", "classroom_staff"];
export const canWriteContentSet = (role: ContentSetRole): boolean => WRITE_ROLES.includes(role);

/**
 * Access-checked read: null when the set is missing OR not visible to the actor (existence is not leaked).
 * Same school, then admin / owner / owner or co-teacher of the linked classroom, as in the RLS policy.
 */
export async function getContentSetForActor(actor: ClassroomActor, setId: string): Promise<ContentSetRecord | null> {
  if (!isTeacherArea(actor.role)) return null;
  const admin = createSupabaseAdminClient();

  const { data: set } = await admin
    .from("content_sets")
    .select("id, school_id, owner_id, classroom_id, title, archived_at")
    .eq("id", setId)
    .eq("school_id", actor.school_id)
    .maybeSingle();
  if (!set) return null;

  let classroomArchived = false;
  let classroomStaff = false;
  if (set.classroom_id) {
    const classroom = await getClassroomForActor(actor, set.classroom_id);
    classroomStaff = classroom !== null;
    if (classroom) classroomArchived = isArchived(classroom);
    else {
      // The actor is not on the classroom, but its archive state still decides read-only for everyone.
      const { data: c } = await admin.from("classrooms").select("archived_at").eq("id", set.classroom_id).maybeSingle();
      classroomArchived = c?.archived_at != null;
    }
  }

  const role: ContentSetRole | null =
    actor.role === "admin" ? "admin" : set.owner_id === actor.id ? "owner" : classroomStaff ? "classroom_staff" : null;
  if (!role) return null;

  return {
    id: set.id,
    schoolId: set.school_id,
    ownerId: set.owner_id,
    classroomId: set.classroom_id,
    title: set.title,
    archivedAt: set.archived_at,
    role,
    classroomArchived,
  };
}

/** Gate for every write to a set: visible, writable by the role, not archived, classroom not archived. */
export async function requireManageableContentSet(actor: ClassroomActor, setId: string): Promise<ContentSetRecord> {
  const set = await getContentSetForActor(actor, setId);
  if (!set) throw new ContentImportError("SET_NOT_FOUND");
  if (!canWriteContentSet(set.role)) throw new ContentImportError("FORBIDDEN");
  if (set.archivedAt !== null) throw new ContentImportError("SET_ARCHIVED");
  if (set.classroomArchived) throw new ContentImportError("CLASSROOM_ARCHIVED");
  return set;
}

/** A classroom a new set may be linked to: visible to the actor (owner, co-teacher, admin) and not archived. */
export async function requireLinkableClassroom(actor: ClassroomActor, classroomId: string): Promise<{ id: string; name: string }> {
  if (!isTeacherArea(actor.role)) throw new ContentImportError("FORBIDDEN");
  const classroom = await getClassroomForActor(actor, classroomId);
  if (!classroom) throw new ContentImportError("CLASSROOM_INVALID");
  if (isArchived(classroom)) throw new ContentImportError("CLASSROOM_ARCHIVED");
  return { id: classroom.id, name: classroom.name };
}
