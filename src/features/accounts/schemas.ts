import { z } from "zod";

export const createStudentAccountSchema = z.object({
  schoolId: z.string().uuid(),
  actorId: z.string().uuid(),
  studentName: z.string().trim().min(1).max(80),
  studentNo: z.string().trim().min(1).max(40),
  grade: z.string().trim().min(1).max(20),
});

export type CreateStudentAccountInput = z.infer<typeof createStudentAccountSchema>;
