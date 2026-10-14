export class IdentityError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
  }
}
