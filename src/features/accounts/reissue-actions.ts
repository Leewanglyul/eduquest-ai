"use server";

import { requireTeacherArea } from "@/lib/rbac/guards";
import { IdentityError } from "@/features/identity/errors";
import { EnrollmentError } from "@/features/enrollments/errors";
import { AccountProvisioningError } from "./errors";
import { reissueStudentPassword, type ReissuedCredential } from "./password-reissue";

export type ReissueState = {
  ok: boolean;
  error?: string;
  credential?: ReissuedCredential;
};

/** Unauthorized / invalid callers get an error state; no password is changed. */
export async function reissueStudentPasswordAction(
  _prev: ReissueState,
  formData: FormData,
): Promise<ReissueState> {
  try {
    const actor = await requireTeacherArea();
    const credential = await reissueStudentPassword(actor, {
      classroomId: String(formData.get("classroomId") ?? ""),
      studentId: String(formData.get("studentId") ?? ""),
    });
    return { ok: true, credential };
  } catch (error) {
    if (
      error instanceof IdentityError ||
      error instanceof EnrollmentError ||
      error instanceof AccountProvisioningError
    ) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
