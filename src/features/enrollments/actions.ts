"use server";

import { requireTeacherArea } from "@/lib/rbac/guards";
import { IdentityError } from "@/features/identity/errors";
import { EnrollmentError } from "./errors";
import { addStudentToClassroom, removeStudentFromClassroom, transferStudent } from "./service";

export type EnrollmentActionState = {
  ok: boolean;
  error?: string;
};

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "");

async function run(
  work: (actor: Awaited<ReturnType<typeof requireTeacherArea>>) => Promise<void>,
): Promise<EnrollmentActionState> {
  try {
    await work(await requireTeacherArea());
    return { ok: true };
  } catch (error) {
    if (error instanceof EnrollmentError || error instanceof IdentityError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function addStudentAction(
  _prev: EnrollmentActionState,
  formData: FormData,
): Promise<EnrollmentActionState> {
  return run(async (actor) => {
    await addStudentToClassroom(actor, {
      classroomId: field(formData, "classroomId"),
      studentId: field(formData, "studentId"),
    });
  });
}

export async function removeStudentAction(
  _prev: EnrollmentActionState,
  formData: FormData,
): Promise<EnrollmentActionState> {
  return run(async (actor) => {
    await removeStudentFromClassroom(actor, {
      classroomId: field(formData, "classroomId"),
      studentId: field(formData, "studentId"),
    });
  });
}

export async function transferStudentAction(
  _prev: EnrollmentActionState,
  formData: FormData,
): Promise<EnrollmentActionState> {
  return run(async (actor) => {
    await transferStudent(actor, {
      sourceClassroomId: field(formData, "sourceClassroomId"),
      targetClassroomId: field(formData, "targetClassroomId"),
      studentId: field(formData, "studentId"),
    });
  });
}
