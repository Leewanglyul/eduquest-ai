"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { IdentityError } from "@/features/identity/errors";
import {
  requireActiveProfile,
  requireAuthenticatedUserId,
} from "@/features/identity/service";
import type { IdentityProfile } from "@/features/identity/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TeacherAuthFormState = {
  error?: string;
};

const TEACHER_HOME_PATH = "/teacher";
const TEACHER_SIGN_IN_PATH = "/teacher/sign-in";

const GENERIC_SIGN_IN_ERROR = "이메일 또는 비밀번호가 올바르지 않습니다.";
const NOT_TEACHER_ERROR = "교사 계정이 아닙니다. 교사 계정으로 로그인해 주세요.";
const SUSPENDED_ERROR = "비활성 상태의 계정입니다. 관리자에게 문의해 주세요.";

const teacherSignInSchema = z.object({
  email: z.string().trim().min(1).max(254).email().toLowerCase(),
  password: z.string().min(1).max(128),
});

function isTeacherRole(profile: IdentityProfile) {
  return profile.role === "teacher" || profile.role === "admin";
}

export async function teacherSignInAction(
  _prev: TeacherAuthFormState,
  formData: FormData,
): Promise<TeacherAuthFormState> {
  const parsed = teacherSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: GENERIC_SIGN_IN_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (signInError) {
    return { error: GENERIC_SIGN_IN_ERROR };
  }

  // Validate through the existing Identity layer. redirect() throws, so it
  // must stay outside of try/catch.
  let failure: string | null = null;

  try {
    await requireAuthenticatedUserId();
    const profile = await requireActiveProfile();

    if (!isTeacherRole(profile)) {
      failure = NOT_TEACHER_ERROR;
    }
  } catch (error) {
    if (error instanceof IdentityError) {
      failure =
        error.code === "PROFILE_SUSPENDED" ? SUSPENDED_ERROR : NOT_TEACHER_ERROR;
    } else {
      failure = GENERIC_SIGN_IN_ERROR;
    }
  }

  if (failure) {
    await supabase.auth.signOut();
    return { error: failure };
  }

  redirect(TEACHER_HOME_PATH);
}

export async function teacherSignOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(TEACHER_SIGN_IN_PATH);
}
