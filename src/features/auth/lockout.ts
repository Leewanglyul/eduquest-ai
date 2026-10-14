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

/**
 * Records a failed attempt. Locks the account for STUDENT_ACCOUNT_LOCK_MINUTES
 * once STUDENT_ACCOUNT_LOCK_LIMIT consecutive failures are reached.
 * If a previous lock has already expired, the counter restarts from 1.
 */
export async function recordFailedAttempt(account: StudentAccountLookup, now = new Date()) {
  const admin = createSupabaseAdminClient();

  const previous = account.locked_until && !isLocked(account, now) ? 0 : account.failed_attempts;
  const attempts = previous + 1;
  const shouldLock = attempts >= STUDENT_ACCOUNT_LOCK_LIMIT;

  const lockedUntil = shouldLock
    ? new Date(now.getTime() + STUDENT_ACCOUNT_LOCK_MINUTES * 60_000).toISOString()
    : null;

  const { error } = await admin
    .from("student_accounts")
    .update({ failed_attempts: attempts, locked_until: lockedUntil })
    .eq("id", account.id);

  if (error) throw error;

  return { attempts, locked: shouldLock, lockedUntil };
}

export async function resetFailedAttempts(accountId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("student_accounts")
    .update({ failed_attempts: 0, locked_until: null })
    .eq("id", accountId);

  if (error) throw error;
}
