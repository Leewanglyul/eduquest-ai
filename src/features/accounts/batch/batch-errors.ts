export type BatchErrorCode =
  | "EMPTY_FILE"
  | "MISSING_HEADER"
  | "TOO_MANY_ROWS"
  | "CSV_MALFORMED"
  | "NO_VALID_ROWS";

export class BatchError extends Error {
  code: BatchErrorCode;

  constructor(code: BatchErrorCode, message: string) {
    super(message);
    this.name = "BatchError";
    this.code = code;
  }
}
