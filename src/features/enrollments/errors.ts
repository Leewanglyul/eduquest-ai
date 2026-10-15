export type EnrollmentErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "ARCHIVED"
  | "STUDENT_NOT_FOUND"
  | "ENROLLMENT_EXISTS"
  | "ENROLLMENT_NOT_FOUND"
  | "TRANSFER_FAILED"
  | "PERSIST_FAILED";

export class EnrollmentError extends Error {
  code: EnrollmentErrorCode;

  constructor(code: EnrollmentErrorCode, message: string) {
    super(message);
    this.name = "EnrollmentError";
    this.code = code;
  }
}
