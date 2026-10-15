"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { provisionStudentAccount } from "@/features/accounts/provisioning";
import { AccountProvisioningError } from "@/features/accounts/errors";
import type { ProvisionedStudentAccount } from "@/features/accounts/domain";
import { requireRole, requireTeacherArea } from "@/lib/rbac/guards";
import { IdentityError } from "@/features/identity/errors";
import { EnrollmentError } from "@/features/enrollments/errors";
import {
  addStudentToClassroom,
  requireManageableClassroom,
} from "@/features/enrollments/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  beginLoginAttempt,
  findStudentAccountByUsername,
  isInfrastructureAuthError,
  recordLoginFailure,
  releaseLoginAttempt,
  remainingLockMinutes,
  resetFailedAttempts,
} from "./lockout";

export type CreateStudentState = {
  ok: boolean;
  error?: string;
  credential?: ProvisionedStudentAccount;
  /** Account was created but enrolling it into the classroom failed. */
  enrollmentWarning?: string;
};

export type AuthFormState = {
  error?: string;
};

const createStudentFormSchema = z.object({
  studentName: z.string().trim().min(1, "이름을 입력해 주세요.").max(80),
  studentNo: z.string().trim().min(1, "학번을 입력해 주세요.").max(40),
  grade: z.string().trim().min(1, "학년을 입력해 주세요.").max(20),
});

const signInSchema = z.object({
  username: z.string().trim().min(1).max(80).toLowerCase(),
  password: z.string().min(1).max(128),
});

const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "비밀번호는 8자 이상이어야 합니다.")
      .max(128, "비밀번호가 너무 깁니다."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다.",
    path: ["confirmPassword"],
  });

const GENERIC_SIGN_IN_ERROR = "아이디 또는 비밀번호가 올바르지 않습니다.";
const RATE_LIMITED_SIGN_IN_ERROR = "로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
const TEMPORARY_SIGN_IN_ERROR = "일시적인 오류로 로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/**
 * Teacher-only. Credentials are returned once in the action result and are
 * never persisted in plaintext.
 */
export async function createStudentAction(
  _prev: CreateStudentState,
  formData: FormData,
): Promise<CreateStudentState> {
  let teacher;
  try {
    teacher = await requireTeacherArea();
  } catch (error) {
    // Unauthenticated / non-teacher callers fail safely: no account is created.
    if (error instanceof IdentityError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createStudentFormSchema.safeParse({
    studentName: formData.get("studentName"),
    studentNo: formData.get("studentNo"),
    grade: formData.get("grade"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const classroomId = String(formData.get("classroomId") ?? "").trim();

  try {
    // Reject archived / inaccessible classrooms BEFORE creating any account.
    if (classroomId) await requireManageableClassroom(teacher, classroomId);

    const credential = await provisionStudentAccount({
      schoolId: teacher.school_id,
      actorId: teacher.id,
      ...parsed.data,
    });

    if (classroomId) {
      try {
        await addStudentToClassroom(teacher, { classroomId, studentId: credential.studentId });
      } catch (enrollError) {
        // The account exists and its one-time credential must still be shown.
        return {
          ok: true,
          credential,
          enrollmentWarning:
            enrollError instanceof EnrollmentError
              ? `계정은 만들었지만 학급 등록에 실패했습니다: ${enrollError.message}`
              : "계정은 만들었지만 학급 등록에 실패했습니다.",
        };
      }
    }
    return { ok: true, credential };
  } catch (error) {
    if (error instanceof EnrollmentError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof AccountProvisioningError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "학생 계정 생성 중 오류가 발생했습니다." };
  }
}

export async function studentSignInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: GENERIC_SIGN_IN_ERROR };
  }

  const { username, password } = parsed.data;
  const account = await findStudentAccountByUsername(username);

  // Same message for unknown users to avoid username enumeration.
  if (!account) {
    return { error: GENERIC_SIGN_IN_ERROR };
  }

  // Atomically reserve an attempt BEFORE checking the password: parallel requests cannot all
  // slip past the lock (see fn_student_login_begin). Only LOCK_LIMIT password checks can run.
  const attempt = await beginLoginAttempt(account.id);
  if (!attempt.allowed) {
    return {
      error: attempt.lockedUntil
        ? `로그인 시도가 너무 많습니다. ${remainingLockMinutes({ locked_until: attempt.lockedUntil })}분 후 다시 시도해 주세요.`
        : "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  let error: { name?: string; status?: number; code?: string } | null;
  try {
    const supabase = await createSupabaseServerClient();
    ({ error } = await supabase.auth.signInWithPassword({
      email: account.synthetic_email,
      password,
    }));
  } catch (thrown) {
    // Unexpected failure after the slot was reserved: no password was judged, so give it back.
    await releaseLoginAttempt(account.id);
    throw thrown;
  }

  if (error && isInfrastructureAuthError(error)) {
    // Rate limit, Auth outage, network failure or timeout: this is not a wrong password and must
    // not count toward the lock. Refund the reserved slot and say what really happened.
    await releaseLoginAttempt(account.id);
    console.error("[auth] student sign-in not counted (infrastructure error)", {
      status: error.status,
      name: error.name,
      code: error.code,
    });
    return { error: error.status === 429 ? RATE_LIMITED_SIGN_IN_ERROR : TEMPORARY_SIGN_IN_ERROR };
  }

  if (error) {
    // invalid_credentials, email_not_confirmed, user_banned and any other credential-side error
    // keep the reserved slot: it counts as a failed attempt.
    const result = await recordLoginFailure(account.id);
    if (result.locked) {
      return {
        error: "로그인 시도가 5회 실패하여 15분간 잠겼습니다.",
      };
    }
    return { error: GENERIC_SIGN_IN_ERROR };
  }

  await resetFailedAttempts(account.id);

  redirect(account.must_change_password ? "/student/set-password" : "/student");
}

export async function setStudentPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  // Student-only: profiles.role is the source of truth. Teachers/admins are blocked here too.
  try {
    await requireRole("student");
  } catch {
    redirect("/student/sign-in");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/student/sign-in");
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (updateError) {
    return { error: "비밀번호를 변경하지 못했습니다. 다시 시도해 주세요." };
  }

  const admin = createSupabaseAdminClient();
  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (studentError || !student) {
    return { error: "학생 계정을 찾을 수 없습니다." };
  }

  const { error: flagError } = await admin
    .from("student_accounts")
    .update({ must_change_password: false })
    .eq("student_id", student.id);

  if (flagError) {
    return { error: "계정 상태를 갱신하지 못했습니다. 다시 시도해 주세요." };
  }

  redirect("/student");
}

export async function studentSignOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/student/sign-in");
}
