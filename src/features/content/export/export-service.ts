import "server-only";

import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ClassroomActor } from "@/features/classrooms/domain";
import { ContentImportError } from "../import/import-errors";
import { getContentSetForActor } from "../sets/access";
import { buildContentExportCsv, exportFileName } from "./export-csv";

export type ContentExport = { fileName: string; csv: string; entryCount: number };

/**
 * Builds the CSV of a set's live entries for anyone who may see the set (owner, classroom owner, co-teachers,
 * admin). Export only reads, so an archived set and a set of an archived classroom can be exported too.
 * Each export is audited with the number of entries and no text.
 */
export async function exportContentSet(actor: ClassroomActor, setId: string, now: Date = new Date()): Promise<ContentExport> {
  const set = await getContentSetForActor(actor, setId);
  if (!set) throw new ContentImportError("SET_NOT_FOUND");

  const { data, error } = await createSupabaseAdminClient()
    .from("content_entries")
    .select("term, definition")
    .eq("set_id", set.id)
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (error) throw error;
  const entries = data ?? [];

  await writeAuditLog({
    actorId: actor.id,
    action: "content_set.exported",
    resourceType: "content_set",
    resourceId: set.id,
    classroomId: set.classroomId,
    metadata: { schoolId: actor.school_id, entryCount: entries.length },
  });

  return { fileName: exportFileName(set.title, now), csv: buildContentExportCsv(entries), entryCount: entries.length };
}
