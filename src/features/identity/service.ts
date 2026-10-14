import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IdentityError } from "./errors";
import { findProfileByUserId } from "./queries";
import type { IdentityProfile } from "./types";

export async function requireAuthenticatedUserId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new IdentityError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  return user.id;
}

export async function requireActiveProfile(): Promise<IdentityProfile> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthenticatedUserId();

  const profile = await findProfileByUserId(supabase, userId);
  if (!profile) {
    throw new IdentityError("PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  }

  if (profile.status !== "active") {
    throw new IdentityError("PROFILE_SUSPENDED", "비활성 상태의 계정입니다.");
  }

  return profile;
}
