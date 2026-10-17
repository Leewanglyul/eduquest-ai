import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Live answers of a set, for DUP_EXISTING at preview. Call only after the actor passed the access check. */
export async function loadLiveAnswers(setId: string): Promise<{ answers: Set<string>; count: number }> {
  const { data, error } = await createSupabaseAdminClient()
    .from("content_entries")
    .select("answer")
    .eq("set_id", setId)
    .is("archived_at", null);
  if (error) throw error;
  const answers = new Set((data ?? []).map((r) => r.answer));
  return { answers, count: answers.size };
}

/** True when the teacher already has a live set with this title (case and surrounding spaces ignored). */
export async function ownerHasLiveTitle(ownerId: string, title: string): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from("content_sets")
    .select("id, title")
    .eq("owner_id", ownerId)
    .is("archived_at", null);
  if (error) throw error;
  const wanted = title.trim().toLowerCase();
  return (data ?? []).some((s) => s.title.trim().toLowerCase() === wanted);
}

/** The latest completed import of the same file into this set, for the "already uploaded" notice. */
export async function previousImportOf(setId: string, sourceSha256: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("content_import_batches")
    .select("completed_at")
    .eq("set_id", setId)
    .eq("source_sha256", sourceSha256)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.completed_at ?? null;
}

/** Number of live entries of a set (for the page header). */
export async function countLiveEntries(setId: string): Promise<number> {
  const { count, error } = await createSupabaseAdminClient()
    .from("content_entries")
    .select("id", { count: "exact", head: true })
    .eq("set_id", setId)
    .is("archived_at", null);
  if (error) throw error;
  return count ?? 0;
}
