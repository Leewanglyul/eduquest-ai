export type RosterEntry = {
  enrollmentId: string;
  studentId: string;
  studentNo: string;
  grade: string;
  displayName: string;
  enrolledAt: string;
};

/** A school student who is not actively enrolled in the classroom (safe fields only). */
export type AddableStudent = {
  studentId: string;
  studentNo: string;
  grade: string;
  displayName: string;
};

export type TransferTarget = { classroomId: string; name: string; code: string };

export const MAX_ADDABLE_STUDENTS = 500;
