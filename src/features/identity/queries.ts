import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function findProfileByUserId(client: SupabaseClient<Database>, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("id, school_id, role, display_name, status")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
