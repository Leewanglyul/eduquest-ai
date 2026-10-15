import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  STUDENT_ACCOUNT_LOCK_LIMIT,
  STUDENT_ACCOUNT_LOCK_MINUTES,
} from "@/features/accounts/domain";

export type StudentAccountLookup = {
  id: string;
  student_id: string;
  username: string;
  synthetic_email: string;
  must_change_password: boolean;
  failed_attempts: number;
  locked_until: string | null;
};

export async function findStudentAccountByUsername(
  username: string,
): Promise<StudentAccountLookup | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_accounts")
    .select(
      "id, student_id, username, synthetic_email, must_change_password, failed_attempts, locked_until",
    )
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function isLocked(account: Pick<StudentAccountLookup, "locked_until">, now = new Date()) {
  if (!account.locked_until) return false;
  return new Date(account.locked_until).getTime() > now.getTime();
}

export function remainingLockMinutes(
  account: Pick<StudentAccountLookup, "locked_until">,
  now = new Date(),
): number {
  if (!account.locked_until) return 0;
  const ms = new Date(account.locked_until).getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

export type LoginAttemptStart =
  | { allowed: true }
  | { allowed: false; lockedUntil: string | null };

/**
 * Atomically RESERVES a sign-in attempt (one SQL UPDATE, see fn_student_login_begin). Call it
 * BEFORE verifying the password. Parallel requests serialize on the row, so at most
 * STUDENT_ACCOUNT_LOCK_LIMIT password checks can happen per window. `lockedUntil` is null when
 * the window is exhausted but the lock has not been written yet.
 */
export async function beginLoginAttempt(accountId: string): Promise<LoginAttemptStart> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("fn_student_login_begin", {
    p_account_id: accountId,
    p_limit: STUDENT_ACCOUNT_LOCK_LIMIT,
  });
  if (error) throw error;

  const row = data?.[0];
  if (!row) throw new Error("fn_student_login_begin returned no row");
  return row.allowed ? { allowed: true } : { allowed: false, lockedUntil: row.locked_until };
}

/**
 * Records a failed password check. Locks the account for STUDENT_ACCOUNT_LOCK_MINUTES once the
 * LOCK_LIMIT reserved attempts have failed (atomic, see fn_student_login_fail).
 */
export async function recordLoginFailure(
  accountId: string,
): Promise<{ locked: boolean; lockedUntil: string | null }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("fn_student_login_fail", {
    p_account_id: accountId,
    p_limit: STUDENT_ACCOUNT_LOCK_LIMIT,
    p_lock_minutes: STUDENT_ACCOUNT_LOCK_MINUTES,
  });
  if (error) throw error;

  const row = data?.[0];
  return { locked: row?.locked ?? false, lockedUntil: row?.locked_until ?? null };
}

export async function resetFailedAttempts(accountId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("student_accounts")
    .update({ failed_attempts: 0, locked_until: null })
    .eq("id", accountId);

  if (error) throw error;
}

/**
 * Is this Auth error an INFRASTRUCTURE failure (the password was not, or may not have been,
 * checked) rather than a credential problem? Only these are refunded; everything else counts.
 *
 * Deny-list on purpose (fails closed): a wrong-password reply that this function does not
 * recognise as infrastructure keeps counting, so a change in Auth's wording can never switch
 * the lockout off.
 *
 *   429                                  rate limit: rejected BEFORE the password is checked
 *   AuthRetryableFetchError              5xx, 502/503/504, network failure, timeout (status 0)
 *   any status >= 500                    defensive, in case another auth-js wraps 5xx differently
 *
 * Counted (never refunded): invalid_credentials, email_not_confirmed, user_banned, and any
 * other 4xx or unknown error.
 */
export function isInfrastructureAuthError(
  error: { name?: string; status?: number } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  if (error.name === "AuthRetryableFetchError") return true;
  return typeof error.status === "number" && error.status >= 500;
}

/**
 * Gives back the slot reserved by beginLoginAttempt (see fn_student_login_release). Best effort:
 * if it fails the attempt simply stays counted, which is the old, safe behaviour, so this never
 * throws and never blocks the sign-in response.
 */
export async function releaseLoginAttempt(accountId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc("fn_student_login_release", { p_account_id: accountId });
    if (error) console.error("[auth] could not release a reserved sign-in attempt", { code: error.code });
  } catch (thrown) {
    console.error("[auth] could not release a reserved sign-in attempt", {
      name: (thrown as { name?: string })?.name,
    });
  }
}
