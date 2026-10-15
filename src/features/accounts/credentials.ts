import crypto from "node:crypto";

const SAFE_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

function randomFromCharset(length: number, charset: string) {
  const bytes = crypto.randomBytes(length);
  let out = "";

  for (let i = 0; i < length; i += 1) {
    out += charset[bytes[i] % charset.length];
  }

  return out;
}

export function generateTemporaryPassword(length = 14): string {
  const pwd = randomFromCharset(length, SAFE_PASSWORD_CHARS);

  // Prevent CSV formula-leading char corruption in exported credentials
  const first = pwd[0];
  if (first === "=" || first === "+" || first === "-" || first === "@") {
    return `A${pwd.slice(1)}`;
  }

  return pwd;
}

export const SYNTHETIC_EMAIL_DOMAIN = "students.eduquest.invalid";

/**
 * Internal auth email: `<opaque-id>@students.eduquest.invalid`.
 *
 * The local part is 128 random bits and is NOT derived from the username or school. The username is
 * shown to students/teachers, and the auth API is reachable with the public anon key, so an email
 * derived from the username would let anyone bypass the app-level lockout by calling the auth
 * endpoint directly. The mapping username -> email exists only in student_accounts.
 */
export function generateSyntheticEmail(): string {
  return `${crypto.randomBytes(16).toString("hex")}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function generateUsername(studentNo: string, schoolId: string): string {
  const base = `${schoolId.slice(0, 6)}${studentNo}`.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${base}${suffix}`;
}
