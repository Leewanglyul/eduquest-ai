import { z } from "zod";

export type StudentProvisionRequest = {
  schoolId: string;
  actorId: string;
  studentName: string;
  studentNo: string;
  grade: string;
};

export type ProvisionedStudentAccount = {
  studentId: string;
  profileId: string;
  accountId: string;
  username: string;
  syntheticEmail: string;
  temporaryPassword: string;
};

export const STUDENT_ACCOUNT_LOCK_LIMIT = 5;
export const STUDENT_ACCOUNT_LOCK_MINUTES = 15;

export const studentGradeSchema = z.string().trim().min(1).max(20);
