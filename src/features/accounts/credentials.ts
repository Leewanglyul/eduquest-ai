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

export function generateSyntheticEmail(username: string, schoolId: string): string {
  const sanitizedSchool = schoolId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `${username}@${sanitizedSchool}.eduquest.local`;
}

export function generateUsername(studentNo: string, schoolId: string): string {
  const base = `${schoolId.slice(0, 6)}${studentNo}`.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${base}${suffix}`;
}
