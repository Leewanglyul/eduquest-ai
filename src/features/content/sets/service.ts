import "server-only";

import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isTeacherArea, type ClassroomActor } from "@/features/classrooms/domain";
import { NORMALIZER_VERSION, type ContentRowWarningCode, type ContentScript } from "../import/content-schemas";
import { ContentImportError, rowIssueMessage } from "../import/import-errors";
import { normalizeSetTitle } from "../import/normalize";
import { evaluateRow } from "../import/row-rules";
import { ContentEntryError } from "./errors";
import { canWriteContentSet, getContentSetForActor, isUuid, requireManageableContentSet } from "./access";
import { ownerHasLiveTitle } from "./queries";

const UNIQUE_VIOLATION = "23505";

export type ContentSetView = "active" | "archived";

export type ContentSetListItem = {
  id: string;
  title: string;
  /** The actor owns the set; false means it reached the actor through a classroom (or admin rights). */
  mine: boolean;
  classroomId: string | null;
  classroomName: string | null;
  classroomArchived: boolean;
  archivedAt: string | null;
  entryCount: number;
  minAnswerLength: number | null;
  maxAnswerLength: number | null;
  updatedAt: string;
};

/**
 * Sets the actor can see (same rule as the RLS policy): their own, those linked to a classroom they own or
 * co-teach, and for an admin every set of the school. Archived classrooms still count: their sets stay readable.
 */
export async function listContentSets(actor: ClassroomActor, view: ContentSetView): Promise<ContentSetListItem[]> {
  if (!isTeacherArea(actor.role)) return [];
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("content_sets")
    .select("id, owner_id, classroom_id, title, archived_at, updated_at")
    .eq("school_id", actor.school_id)
    .order("updated_at", { ascending: false });
  query = view === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  if (actor.role !== "admin") {
    const [{ data: owned }, { data: member }] = await Promise.all([
      admin.from("classrooms").select("id").eq("school_id", actor.school_id).eq("owner_id", actor.id),
      admin.from("classroom_teachers").select("classroom_id").eq("teacher_id", actor.id),
    ]);
    const classroomIds = [...new Set([...(owned ?? []).map((c) => c.id), ...(member ?? []).map((m) => m.classroom_id)])];
    query = classroomIds.length
      ? query.or(`owner_id.eq.${actor.id},classroom_id.in.(${classroomIds.join(",")})`)
      : query.eq("owner_id", actor.id);
  }

  const { data: sets, error } = await query;
  if (error) throw error;
  if (!sets?.length) return [];

  const ids = sets.map((s) => s.id);
  const roomIds = [...new Set(sets.flatMap((s) => (s.classroom_id ? [s.classroom_id] : [])))];
  const [{ data: summary }, { data: rooms }] = await Promise.all([
    admin.from("v_content_sets_summary").select("set_id, entry_count, min_answer_length, max_answer_length").in("set_id", ids),
    roomIds.length
      ? admin.from("classrooms").select("id, name, archived_at").in("id", roomIds)
      : Promise.resolve({ data: [] as { id: string; name: string; archived_at: string | null }[] }),
  ]);
  const stats = new Map((summary ?? []).map((r) => [r.set_id, r]));
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));

  return sets.map((s) => {
    const stat = stats.get(s.id);
    const room = s.classroom_id ? roomById.get(s.classroom_id) : undefined;
    return {
      id: s.id,
      title: s.title,
      mine: s.owner_id === actor.id,
      classroomId: s.classroom_id,
      classroomName: room?.name ?? null,
      classroomArchived: room?.archived_at != null,
      archivedAt: s.archived_at,
      entryCount: stat?.entry_count ?? 0,
      minAnswerLength: stat?.min_answer_length ?? null,
      maxAnswerLength: stat?.max_answer_length ?? null,
      updatedAt: s.updated_at,
    };
  });
}

export type ContentEntryView = {
  id: string;
  position: number;
  term: string;
  definition: string;
  answer: string;
  answerLength: number;
  script: ContentScript;
};

export type ContentSetDetail = {
  set: NonNullable<Awaited<ReturnType<typeof getContentSetForActor>>>;
  classroomName: string | null;
  entries: ContentEntryView[];
  archivedEntryCount: number;
  /** Nothing can be changed: the set or its classroom is archived. */
  readOnly: boolean;
};

/** Access-checked: null when the set is missing or not visible to the actor. */
export async function getContentSetDetail(actor: ClassroomActor, setId: string): Promise<ContentSetDetail | null> {
  const set = await getContentSetForActor(actor, setId);
  if (!set) return null;
  const admin = createSupabaseAdminClient();

  const [{ data: entries, error }, { count: archivedCount }, room] = await Promise.all([
    admin
      .from("content_entries")
      .select("id, position, term, definition, answer, answer_length, script")
      .eq("set_id", set.id)
      .is("archived_at", null)
      .order("position", { ascending: true }),
    admin.from("content_entries").select("id", { count: "exact", head: true }).eq("set_id", set.id).not("archived_at", "is", null),
    set.classroomId
      ? admin.from("classrooms").select("name").eq("id", set.classroomId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error) throw error;

  return {
    set,
    classroomName: room.data?.name ?? null,
    entries: (entries ?? []).map((e) => ({
      id: e.id,
      position: e.position,
      term: e.term,
      definition: e.definition,
      answer: e.answer,
      answerLength: e.answer_length ?? e.answer.length,
      script: e.script,
    })),
    archivedEntryCount: archivedCount ?? 0,
    readOnly: set.archivedAt !== null || set.classroomArchived,
  };
}

/** Renames a set. The title is cleaned like every title (NFC, whitespace) and stays unique among the owner's live sets. */
export async function renameContentSet(actor: ClassroomActor, setId: string, rawTitle: string): Promise<string> {
  const set = await requireManageableContentSet(actor, setId);
  const title = normalizeSetTitle(rawTitle);
  if (title === set.title) return title;

  if (await ownerHasLiveTitle(set.ownerId, title, set.id)) throw new ContentImportError("TITLE_DUPLICATE");

  const { error } = await createSupabaseAdminClient()
    .from("content_sets")
    .update({ title })
    .eq("id", set.id)
    .eq("school_id", actor.school_id)
    .is("archived_at", null);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new ContentImportError("TITLE_DUPLICATE");
    throw error;
  }

  await writeAuditLog({
    actorId: actor.id,
    action: "content_set.updated",
    resourceType: "content_set",
    resourceId: set.id,
    classroomId: set.classroomId,
    metadata: { schoolId: actor.school_id, fields: ["title"] },
  });
  return title;
}

/** Archives a set: hidden from lists and the generator view, entries untouched, reversible. */
export async function archiveContentSet(actor: ClassroomActor, setId: string): Promise<void> {
  const set = await getContentSetForActor(actor, setId);
  if (!set) throw new ContentImportError("SET_NOT_FOUND");
  if (!canWriteContentSet(set.role)) throw new ContentImportError("FORBIDDEN");
  if (set.archivedAt !== null) throw new ContentImportError("SET_ALREADY_ARCHIVED");
  if (set.classroomArchived) throw new ContentImportError("CLASSROOM_ARCHIVED");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("content_sets")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", set.id)
    .eq("school_id", actor.school_id)
    .is("archived_at", null)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new ContentImportError("SET_ALREADY_ARCHIVED");

  const { count } = await admin.from("content_entries").select("id", { count: "exact", head: true }).eq("set_id", set.id).is("archived_at", null);
  await writeAuditLog({
    actorId: actor.id,
    action: "content_set.archived",
    resourceType: "content_set",
    resourceId: set.id,
    classroomId: set.classroomId,
    metadata: { schoolId: actor.school_id, entryCount: count ?? 0 },
  });
}

/** Restores an archived set. Refused while its title is used by another live set of the owner. */
export async function unarchiveContentSet(actor: ClassroomActor, setId: string): Promise<void> {
  const set = await getContentSetForActor(actor, setId);
  if (!set) throw new ContentImportError("SET_NOT_FOUND");
  if (!canWriteContentSet(set.role)) throw new ContentImportError("FORBIDDEN");
  if (set.archivedAt === null) throw new ContentImportError("SET_NOT_ARCHIVED");
  if (set.classroomArchived) throw new ContentImportError("CLASSROOM_ARCHIVED");

  const { data, error } = await createSupabaseAdminClient()
    .from("content_sets")
    .update({ archived_at: null })
    .eq("id", set.id)
    .eq("school_id", actor.school_id)
    .not("archived_at", "is", null)
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new ContentImportError("TITLE_DUPLICATE");
    throw error;
  }
  if (!data?.length) throw new ContentImportError("SET_NOT_ARCHIVED");

  await writeAuditLog({
    actorId: actor.id,
    action: "content_set.unarchived",
    resourceType: "content_set",
    resourceId: set.id,
    classroomId: set.classroomId,
    metadata: { schoolId: actor.school_id },
  });
}

export type ContentEntryUpdate = {
  changed: boolean;
  term: string;
  definition: string;
  answer: string;
  answerLength: number;
  warnings: string[];
};

/**
 * Edits one live entry. The same rules as the importer apply (clean text, grid-safe answer, length, numeric-like,
 * jamo), so a hand-edited entry cannot be something an import would have rejected; the answer is re-derived and
 * must stay unique among the set's live entries. The audit row names the changed fields, never the text.
 */
export async function updateContentEntry(
  actor: ClassroomActor,
  entryId: string,
  input: { term: string; definition: string },
): Promise<ContentEntryUpdate> {
  if (!isUuid(entryId)) throw new ContentImportError("ENTRY_NOT_FOUND");
  const admin = createSupabaseAdminClient();
  const { data: entry, error: readError } = await admin
    .from("content_entries")
    .select("id, set_id, position, term, definition, answer, archived_at")
    .eq("id", entryId)
    .maybeSingle();
  if (readError) throw readError;
  if (!entry || entry.archived_at !== null) throw new ContentImportError("ENTRY_NOT_FOUND");

  let set;
  try {
    set = await requireManageableContentSet(actor, entry.set_id);
  } catch (error) {
    // A set the actor cannot see must not reveal that the entry exists.
    if (error instanceof ContentImportError && error.code === "SET_NOT_FOUND") {
      throw new ContentImportError("ENTRY_NOT_FOUND");
    }
    throw error;
  }

  const evaluated = evaluateRow({ line: entry.position, term: input.term, definition: input.definition });
  if (!evaluated.ok) {
    throw new ContentEntryError(evaluated.errors.map((e) => rowIssueMessage(e.code, e.context)));
  }
  const row = evaluated.row;
  const warnings = row.warnings.map((w: ContentRowWarningCode) => rowIssueMessage(w));
  const result = { term: row.term, definition: row.definition, answer: row.answer, answerLength: row.answerLength, warnings };

  if (row.term === entry.term && row.definition === entry.definition) return { changed: false, ...result };

  const { data: clash, error: clashError } = await admin
    .from("content_entries")
    .select("id")
    .eq("set_id", entry.set_id)
    .eq("answer", row.answer)
    .is("archived_at", null)
    .neq("id", entry.id)
    .limit(1);
  if (clashError) throw clashError;
  if (clash?.length) throw new ContentImportError("ENTRY_DUPLICATE");

  const { data: updated, error } = await admin
    .from("content_entries")
    .update({
      term: row.term,
      definition: row.definition,
      answer: row.answer,
      script: row.script,
      normalizer_version: NORMALIZER_VERSION,
    })
    .eq("id", entry.id)
    .is("archived_at", null)
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new ContentImportError("ENTRY_DUPLICATE");
    throw error;
  }
  if (!updated?.length) throw new ContentImportError("ENTRY_NOT_FOUND");

  // Touch the set so "last updated" reflects the edit (the trigger sets updated_at).
  await admin.from("content_sets").update({ title: set.title }).eq("id", set.id);

  const fields = [
    ...(row.term !== entry.term ? ["term"] : []),
    ...(row.definition !== entry.definition ? ["definition"] : []),
    ...(row.answer !== entry.answer ? ["answer"] : []),
  ];
  await writeAuditLog({
    actorId: actor.id,
    action: "content_entry.updated",
    resourceType: "content_set",
    resourceId: set.id,
    classroomId: set.classroomId,
    metadata: { schoolId: actor.school_id, entryId: entry.id, fields },
  });
  return { changed: true, ...result };
}
