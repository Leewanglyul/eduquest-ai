"use server";

import { requireTeacherArea } from "@/lib/rbac/guards";
import { IdentityError } from "@/features/identity/errors";
import { ClassroomError } from "./errors";
import {
  addCoTeacher,
  addStudentToClassroom,
  archiveClassroom,
  createClassroom,
  removeCoTeacher,
  removeStudentFromClassroom,
  transferStudent,
  unarchiveClassroom,
  updateClassroom,
} from "./service";

export type ClassroomActionState = {
  ok: boolean;
  error?: string;
  classroomId?: string;
};

const initial = (formData: FormData, key: string) => String(formData.get(key) ?? "");

async function run(
  work: (actor: Awaited<ReturnType<typeof requireTeacherArea>>) => Promise<ClassroomActionState | void>,
): Promise<ClassroomActionState> {
  try {
    const actor = await requireTeacherArea();
    const result = await work(actor);
    return result ?? { ok: true };
  } catch (error) {
    if (error instanceof ClassroomError || error instanceof IdentityError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/** `code` is never read from the form: it is database-generated and read-only. */
export async function createClassroomAction(
  _prev: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  return run(async (actor) => {
    const classroom = await createClassroom(actor, { name: initial(formData, "name") });
    return { ok: true, classroomId: classroom.id };
  });
}

export async function updateClassroomAction(
  _prev: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  return run(async (actor) => {
    const classroom = await updateClassroom(actor, {
      classroomId: initial(formData, "classroomId"),
      name: initial(formData, "name"),
    });
    return { ok: true, classroomId: classroom.id };
  });
}

export async function archiveClassroomAction(
  _prev: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  return run(async (actor) => {
    await archiveClassroom(actor, { classroomId: initial(formData, "classroomId") });
  });
}

export async function unarchiveClassroomAction(
  _prev: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  return run(async (actor) => {
    await unarchiveClassroom(actor, { classroomId: initial(formData, "classroomId") });
  });
}

export async function addCoTeacherAction(
  _prev: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  return run(async (actor) => {
    await addCoTeacher(actor, {
      classroomId: initial(formData, "classroomId"),
      teacherId: initial(formData, "teacherId"),
    });
  });
}

export async function removeCoTeacherAction(
  _prev: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  return run(async (actor) => {
    await removeCoTeacher(actor, {
      classroomId: initial(formData, "classroomId"),
      teacherId: initial(formData, "teacherId"),
    });
  });
}

export async function addStudentToClassroomAction(
  _prev: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  return run(async (actor) => {
    await addStudentToClassroom(actor, {
      classroomId: initial(formData, "classroomId"),
      studentId: initial(formData, "studentId"),
    });
  });
}

export async function removeStudentFromClassroomAction(
  _prev: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  return run(async (actor) => {
    await removeStudentFromClassroom(actor, {
      classroomId: initial(formData, "classroomId"),
      studentId: initial(formData, "studentId"),
    });
  });
}

export async function transferStudentAction(
  _prev: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  return run(async (actor) => {
    await transferStudent(actor, {
      sourceClassroomId: initial(formData, "sourceClassroomId"),
      targetClassroomId: initial(formData, "targetClassroomId"),
      studentId: initial(formData, "studentId"),
    });
  });
}
