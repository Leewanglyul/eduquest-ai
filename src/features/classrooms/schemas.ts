import { z } from "zod";

const id = z.string().uuid();

export const classroomNameSchema = z
  .string()
  .trim()
  .min(1, "학급 이름을 입력해 주세요.")
  .max(80, "학급 이름은 80자 이하로 입력해 주세요.");

/** strict(): a client-supplied `code` (or any unknown field) is rejected; the code is read-only. */
export const createClassroomSchema = z.object({ name: classroomNameSchema }).strict();

export const updateClassroomSchema = z
  .object({ classroomId: id, name: classroomNameSchema })
  .strict();

export const classroomIdSchema = z.object({ classroomId: id }).strict();

export const coTeacherSchema = z.object({ classroomId: id, teacherId: id }).strict();

export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;
export type CoTeacherInput = z.infer<typeof coTeacherSchema>;
