export type AccountProvisioningErrorCode =
  | "VALIDATION_FAILED"
  | "AUTH_CREATE_FAILED"
  | "PROFILE_CREATE_FAILED"
  | "STUDENT_CREATE_FAILED"
  | "ACCOUNT_CREATE_FAILED"
  | "DUPLICATE_STUDENT_NO"
  | "PASSWORD_REISSUE_FAILED"
  | "UNKNOWN_PROVISIONING_ERROR";

export class AccountProvisioningError extends Error {
  code: AccountProvisioningErrorCode;

  constructor(code: AccountProvisioningErrorCode, message: string) {
    super(message);
    this.name = "AccountProvisioningError";
    this.code = code;
  }
}
