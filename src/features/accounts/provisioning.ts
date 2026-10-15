import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { AccountProvisioningError } from "./errors";
import {
  createStudentAccountSchema,
  type CreateStudentAccountInput,
} from "./schemas";
import {
  generateSyntheticEmail,
  generateTemporaryPassword,
  generateUsername,
} from "./credentials";
import type { ProvisionedStudentAccount } from "./domain";

function toStudentDisplayName(name: string) {
  return name.trim();
}

export async function provisionStudentAccount(
  rawInput: CreateStudentAccountInput,
): Promise<ProvisionedStudentAccount> {
  const input = createStudentAccountSchema.parse(rawInput);

  const admin = createSupabaseAdminClient();

  const username = generateUsername(input.studentNo, input.schoolId);
  const syntheticEmail = generateSyntheticEmail();
  const temporaryPassword = generateTemporaryPassword();

  let authUserId: string | null = null;
  let profileId: string | null = null;
  let studentId: string | null = null;

  try {
    const { data: createdAuth, error: authCreateError } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        synthetic: true,
      },
    });

    if (authCreateError || !createdAuth.user) {
      throw new AccountProvisioningError(
        "AUTH_CREATE_FAILED",
        authCreateError?.message ?? "학생 계정을 생성하지 못했습니다.",
      );
    }

    authUserId = createdAuth.user.id;
    profileId = authUserId;

    const { error: profileError } = await admin.from("profiles").insert({
      id: profileId,
      school_id: input.schoolId,
      role: "student",
      display_name: toStudentDisplayName(input.studentName),
      status: "active",
    });

    if (profileError) {
      throw new AccountProvisioningError("PROFILE_CREATE_FAILED", profileError.message);
    }

    const { data: studentRow, error: studentError } = await admin
      .from("students")
      .insert({
        school_id: input.schoolId,
        profile_id: profileId,
        student_no: input.studentNo,
        grade: input.grade,
      })
      .select("id")
      .single();

    if (studentError || !studentRow) {
      throw new AccountProvisioningError(
        "STUDENT_CREATE_FAILED",
        studentError?.message ?? "학생 레코드를 생성하지 못했습니다.",
      );
    }

    studentId = studentRow.id;

    const { data: accountRow, error: accountError } = await admin
      .from("student_accounts")
      .insert({
        student_id: studentId,
        username,
        synthetic_email: syntheticEmail,
        must_change_password: true,
      })
      .select("id")
      .single();

    if (accountError || !accountRow) {
      throw new AccountProvisioningError(
        "ACCOUNT_CREATE_FAILED",
        accountError?.message ?? "학생 계정 레코드를 생성하지 못했습니다.",
      );
    }

    await writeAuditLog({
      actorId: input.actorId,
      action: "student.provisioned",
      resourceType: "account",
      resourceId: accountRow.id,
      metadata: {
        schoolId: input.schoolId,
        studentId,
        username,
      },
    });

    return {
      studentId,
      profileId,
      accountId: accountRow.id,
      username,
      syntheticEmail,
      temporaryPassword,
    };
  } catch (error) {
    // Compensation/rollback strategy (best-effort)
    if (studentId) {
      await admin.from("students").delete().eq("id", studentId);
    }

    if (profileId) {
      await admin.from("profiles").delete().eq("id", profileId);
    }

    if (authUserId) {
      await admin.auth.admin.deleteUser(authUserId);
    }

    if (error instanceof AccountProvisioningError) {
      throw error;
    }

    throw new AccountProvisioningError(
      "UNKNOWN_PROVISIONING_ERROR",
      "학생 계정 생성 중 오류가 발생했습니다.",
    );
  }
}
