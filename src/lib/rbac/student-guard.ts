import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "./guards";

export const STUDENT_SIGN_IN_PATH = "/student/sign-in";
export const STUDENT_SET_PASSWORD_PATH = "/student/set-password";

/**
 * Reads student_accounts.must_change_password for a student profile.
 * Fails CLOSED: a student without an account row is treated as "must change".
 */
export async function studentMustChangePassword(profileId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();

  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!student) return true;

  const { data: account } = await admin
    .from("student_accounts")
    .select("must_change_password")
    .eq("student_id", student.id)
    .maybeSingle();

  return account?.must_change_password ?? true;
}

/** Student role only (profiles.role). Used by the set-password page itself. */
export async function requireStudentSessionPage() {
  try {
    return await requireRole("student");
  } catch {
    redirect(STUDENT_SIGN_IN_PATH);
  }
}

/**
 * Guard for EVERY student page except sign-in and set-password: student role AND the forced
 * first-login password reset is complete; otherwise redirect to /student/set-password.
 */
export async function requireStudentAreaPage() {
  const profile = await requireStudentSessionPage();
  if (await studentMustChangePassword(profile.id)) {
    redirect(STUDENT_SET_PASSWORD_PATH);
  }
  return profile;
}
