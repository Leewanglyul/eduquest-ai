import { z } from "zod";

const id = z.string().uuid();

export const enrollmentSchema = z.object({ classroomId: id, studentId: id }).strict();

export const transferSchema = z
  .object({ sourceClassroomId: id, targetClassroomId: id, studentId: id })
  .strict();

export type EnrollmentInput = z.infer<typeof enrollmentSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
