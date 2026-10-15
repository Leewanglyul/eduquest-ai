import "server-only";

import type { ProfileRole } from "@/features/identity/types";
import { requireActiveProfile } from "@/features/identity/service";
import { IdentityError } from "@/features/identity/errors";

export async function requireRole(role: ProfileRole) {
  const profile = await requireActiveProfile();
  if (profile.role !== role) {
    throw new IdentityError("FORBIDDEN", "해당 작업 권한이 없습니다.");
  }
  return profile;
}

/** Teacher area: teacher or admin (role read from profiles.role only). */
export async function requireTeacherArea() {
  const profile = await requireActiveProfile();
  if (profile.role !== "teacher" && profile.role !== "admin") {
    throw new IdentityError("FORBIDDEN", "해당 작업 권한이 없습니다.");
  }
  return profile;
}
