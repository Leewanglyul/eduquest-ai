import "server-only";

import { redirect } from "next/navigation";
import { requireTeacherArea } from "./guards";

export const TEACHER_SIGN_IN_PATH = "/teacher/sign-in";

/**
 * Single entry point for every authenticated /teacher/** page (dashboard, classrooms,
 * provisioning, enrollment): teacher or admin per profiles.role, otherwise redirect to sign-in.
 * Only /teacher/sign-in is exempt.
 */
export async function requireTeacherAreaPage() {
  try {
    return await requireTeacherArea();
  } catch {
    redirect(TEACHER_SIGN_IN_PATH);
  }
}
