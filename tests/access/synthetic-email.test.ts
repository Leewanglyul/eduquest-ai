import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { provisionStudentAccount } from "@/features/accounts/provisioning";
import { generateSyntheticEmail, SYNTHETIC_EMAIL_DOMAIN } from "@/features/accounts/credentials";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const OWNER = "00000000-0000-4000-8000-000000000001";
const admin = createSupabaseAdminClient();
const created: string[] = [];

const tokenGrant = (email: string, password: string) =>
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.status);

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("synthetic auth email", () => {
  it("is `<32 hex>@students.eduquest.invalid` and unique per call", () => {
    const emails = Array.from({ length: 200 }, () => generateSyntheticEmail());
    for (const e of emails) expect(e).toMatch(/^[0-9a-f]{32}@students\.eduquest\.invalid$/);
    expect(new Set(emails).size).toBe(200);
    expect(SYNTHETIC_EMAIL_DOMAIN).toBe("students.eduquest.invalid");
  });

  it("a provisioned account's auth email is not derivable from its visible username", async () => {
    const s = await provisionStudentAccount({
      schoolId: SCHOOL,
      actorId: OWNER,
      studentName: "이메일검증",
      studentNo: `E${Date.now().toString(36)}`,
      grade: "1",
    });
    created.push(s.profileId);

    // The username stays visible and is what the student types.
    expect(s.username).toMatch(/^[a-z0-9]+$/);
    expect(s.syntheticEmail).toMatch(/^[0-9a-f]{32}@students\.eduquest\.invalid$/);
    expect(s.syntheticEmail).not.toContain(s.username);
    expect(s.syntheticEmail).not.toContain(SCHOOL.replace(/-/g, ""));

    // Stored mapping and the real auth user agree.
    const { data: acct } = await admin
      .from("student_accounts")
      .select("synthetic_email, username")
      .eq("username", s.username)
      .single();
    expect(acct!.synthetic_email).toBe(s.syntheticEmail);
    const { data: user } = await admin.auth.admin.getUserById(s.profileId);
    expect(user.user!.email).toBe(s.syntheticEmail);

    // An attacker who knows only the username cannot target the auth API: every email they can
    // derive (old scheme, spec scheme) is unknown, even with the CORRECT password.
    const school = SCHOOL.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    expect(await tokenGrant(`${s.username}@${school}.eduquest.local`, s.temporaryPassword)).toBe(400);
    expect(await tokenGrant(`${s.username}@students.eduquest.invalid`, s.temporaryPassword)).toBe(400);
    // Sanity: the real email + password does work.
    expect(await tokenGrant(s.syntheticEmail, s.temporaryPassword)).toBe(200);
  });
});
