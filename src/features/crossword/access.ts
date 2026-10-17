import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isTeacherArea, type ClassroomActor } from "@/features/classrooms/domain";
import { isUuid } from "@/features/content/sets/access";
import type { Database } from "@/types/database";

export type CrosswordRole = "admin" | "owner" | "set_staff" | "assignment_staff";

type PuzzleRow = Database["public"]["Tables"]["crossword_puzzles"]["Row"];

export type CrosswordRecord = {
  id: string;
  schoolId: string;
  ownerId: string;
  setId: string | null;
  title: string;
  level: PuzzleRow["level"];
  status: PuzzleRow["status"];
  rootId: string;
  version: number;
  supersedesId: string | null;
  rows: number;
  cols: number;
  publishedAt: string | null;
  archivedAt: string | null;
  role: CrosswordRole;
};

/** Classrooms (ids) the actor owns or co-teaches, among `ids` (all of them when `ids` is omitted). */
export async function actorClassroomIds(
  actor: ClassroomActor,
  ids?: string[],
): Promise<Set<string>> {
  const admin = createSupabaseAdminClient();
  let owned = admin
    .from("classrooms")
    .select("id")
    .eq("school_id", actor.school_id)
    .eq("owner_id", actor.id);
  let member = admin.from("classroom_teachers").select("classroom_id").eq("teacher_id", actor.id);
  if (ids) {
    if (ids.length === 0) return new Set();
    owned = owned.in("id", ids);
    member = member.in("classroom_id", ids);
  }
  const [{ data: a }, { data: b }] = await Promise.all([owned, member]);
  return new Set([...(a ?? []).map((c) => c.id), ...(b ?? []).map((m) => m.classroom_id)]);
}

/**
 * Who manages a puzzle (decision D3, same rule as fn_crossword_actor_manages): an admin, the owner, the owner or
 * co-teachers of the classroom linked to the source set, or of any classroom the puzzle is assigned to.
 * The database functions repeat this check; this one is for reads and for early, readable errors.
 *
 * Access-checked read: null when the puzzle is missing OR not visible to the actor (existence is not leaked).
 */
export async function getCrosswordForActor(
  actor: ClassroomActor,
  puzzleId: string,
): Promise<CrosswordRecord | null> {
  if (!isTeacherArea(actor.role) || !isUuid(puzzleId)) return null;
  const admin = createSupabaseAdminClient();

  const { data: p } = await admin
    .from("crossword_puzzles")
    .select("*")
    .eq("id", puzzleId)
    .eq("school_id", actor.school_id)
    .maybeSingle();
  if (!p) return null;

  let role: CrosswordRole | null =
    actor.role === "admin" ? "admin" : p.owner_id === actor.id ? "owner" : null;

  if (!role && p.set_id) {
    const { data: set } = await admin
      .from("content_sets")
      .select("classroom_id")
      .eq("id", p.set_id)
      .maybeSingle();
    if (set?.classroom_id && (await actorClassroomIds(actor, [set.classroom_id])).size > 0)
      role = "set_staff";
  }
  if (!role) {
    const { data: assigned } = await admin
      .from("crossword_assignments")
      .select("classroom_id")
      .eq("puzzle_id", p.id);
    const ids = (assigned ?? []).map((a) => a.classroom_id);
    if ((await actorClassroomIds(actor, ids)).size > 0) role = "assignment_staff";
  }
  if (!role) return null;

  return {
    id: p.id,
    schoolId: p.school_id,
    ownerId: p.owner_id,
    setId: p.set_id,
    title: p.title,
    level: p.level,
    status: p.status,
    rootId: p.root_id,
    version: p.version,
    supersedesId: p.supersedes_id,
    rows: p.rows,
    cols: p.cols,
    publishedAt: p.published_at,
    archivedAt: p.archived_at,
    role,
  };
}
