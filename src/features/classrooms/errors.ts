export type ClassroomErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "ARCHIVED"
  | "ALREADY_ARCHIVED"
  | "NOT_ARCHIVED"
  | "CO_TEACHER_INVALID"
  | "CO_TEACHER_EXISTS"
  | "CO_TEACHER_NOT_FOUND"
  | "STUDENT_NOT_FOUND"
  | "ENROLLMENT_EXISTS"
  | "ENROLLMENT_NOT_FOUND"
  | "TRANSFER_FAILED"
  | "PERSIST_FAILED";

export class ClassroomError extends Error {
  code: ClassroomErrorCode;

  constructor(code: ClassroomErrorCode, message: string) {
    super(message);
    this.name = "ClassroomError";
    this.code = code;
  }
}
