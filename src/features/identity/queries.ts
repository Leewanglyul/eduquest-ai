import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function findProfileByUserId(client: ServerSupabaseClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("id, school_id, role, display_name, status")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
