import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------------------------
// P0 regression tests, run against the LOCAL Supabase stack through the REAL server actions and
// guards. Only the cookie-bound server client is replaced by a plain in-memory supabase-js client
// (same auth behaviour, no Next request context needed). Nothing about identity is mocked.
// ---------------------------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  client: null as null | import("@supabase/supabase-js").SupabaseClient,
  passwordChecks: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => state.client!,
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { provisionStudentAccount } from "@/features/accounts/provisioning";
import { setStudentPasswordAction, studentSignInAction } from "@/features/auth/student-actions";
import { requireStudentAreaPage, requireStudentSessionPage } from "@/lib/rbac/student-guard";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const OWNER = "00000000-0000-4000-8000-000000000001";
const RUN = Date.now().toString(36);
const admin = createSupabaseAdminClient();
const created: string[] = [];

function freshClient() {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Count real password verifications that reach GoTrue.
  const original = c.auth.signInWithPassword.bind(c.auth);
  c.auth.signInWithPassword = (async (...args: Parameters<typeof original>) => {
    state.passwordChecks += 1;
    return original(...args);
  }) as typeof c.auth.signInWithPassword;
  return c;
}

async function newStudent(tag: string) {
  const s = await provisionStudentAccount({
    schoolId: SCHOOL,
    actorId: OWNER,
    studentName: "보안검증",
    studentNo: `${tag}${RUN}`,
    grade: "1",
  });
  created.push(s.profileId);
  return s;
}

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/** redirect() throws NEXT_REDIRECT with the target path in `digest`. */
async function redirectTarget(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    return digest.startsWith("NEXT_REDIRECT") ? digest.split(";")[2] : (() => { throw e; })();
  }
}

const accountRow = async (username: string) =>
  (
    await admin
      .from("student_accounts")
      .select("id, failed_attempts, locked_until, must_change_password")
      .eq("username", username)
      .single()
  ).data!;

beforeAll(() => {
  state.client = freshClient();
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("P0-1: atomic lockout", () => {
  it("20 parallel wrong-password attempts: at most 5 reach the password check and the account locks", async () => {
    const s = await newStudent("L");
    state.passwordChecks = 0;

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        studentSignInAction({}, form({ username: s.username, password: "definitely-wrong-1" })),
      ),
    );

    expect(state.passwordChecks).toBeLessThanOrEqual(5);
    const row = await accountRow(s.username);
    expect(row.locked_until).not.toBeNull();
    expect(new Date(row.locked_until!).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(results.every((r) => typeof r.error === "string")).toBe(true);
  });

  it("a locked account rejects even the CORRECT password and never checks it", async () => {
    const s = await newStudent("K");
    for (let i = 0; i < 5; i += 1) {
      await studentSignInAction({}, form({ username: s.username, password: "wrong-wrong-1" }));
    }
    expect((await accountRow(s.username)).locked_until).not.toBeNull();

    state.passwordChecks = 0;
    const r = await studentSignInAction({}, form({ username: s.username, password: s.temporaryPassword }));
    expect(r.error).toMatch(/너무 많습니다/);
    expect(state.passwordChecks).toBe(0);
  });

  it("sequential: 4 failures do not lock, the 5th does", async () => {
    const s = await newStudent("S");
    for (let i = 0; i < 4; i += 1) {
      const r = await studentSignInAction({}, form({ username: s.username, password: "wrong-wrong-1" }));
      expect(r.error).toMatch(/올바르지 않습니다/);
    }
    expect((await accountRow(s.username)).locked_until).toBeNull();
    const fifth = await studentSignInAction({}, form({ username: s.username, password: "wrong-wrong-1" }));
    expect(fifth.error).toMatch(/5회 실패/);
    expect((await accountRow(s.username)).locked_until).not.toBeNull();
  });

  it("a successful sign-in resets the counter, and an expired lock lets the student back in", async () => {
    const s = await newStudent("R");
    for (let i = 0; i < 3; i += 1) {
      await studentSignInAction({}, form({ username: s.username, password: "wrong-wrong-1" }));
    }
    state.client = freshClient();
    expect(await redirectTarget(() => studentSignInAction({}, form({ username: s.username, password: s.temporaryPassword })))).toBe("/student/set-password");
    expect((await accountRow(s.username)).failed_attempts).toBe(0);

    // Lock it, then expire the lock: sign-in works again.
    for (let i = 0; i < 5; i += 1) {
      await studentSignInAction({}, form({ username: s.username, password: "wrong-wrong-1" }));
    }
    const row = await accountRow(s.username);
    expect(row.locked_until).not.toBeNull();
    await admin
      .from("student_accounts")
      .update({ locked_until: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", row.id);
    state.client = freshClient();
    expect(await redirectTarget(() => studentSignInAction({}, form({ username: s.username, password: s.temporaryPassword })))).toBe("/student/set-password");
    expect((await accountRow(s.username)).failed_attempts).toBe(0);
  });
});

describe("P0-2: forced password reset", () => {
  it("the student area redirects to /student/set-password until the password is changed", async () => {
    const s = await newStudent("M");
    state.client = freshClient();

    // First login with the temporary password lands on set-password.
    expect(await redirectTarget(() => studentSignInAction({}, form({ username: s.username, password: s.temporaryPassword })))).toBe("/student/set-password");

    // Opening /student directly is bounced back (this was the bypass).
    expect(await redirectTarget(() => requireStudentAreaPage())).toBe("/student/set-password");
    // set-password itself stays reachable for the student.
    await expect(requireStudentSessionPage()).resolves.toMatchObject({ id: s.profileId, role: "student" });

    // Mismatched confirmation does not clear the flag.
    const bad = await setStudentPasswordAction({}, form({ password: "NewPass#12345", confirmPassword: "different" }));
    expect(bad.error).toBeTruthy();
    expect((await accountRow(s.username)).must_change_password).toBe(true);
    expect(await redirectTarget(() => requireStudentAreaPage())).toBe("/student/set-password");

    // Changing the password completes the reset; the student area opens.
    expect(await redirectTarget(() => setStudentPasswordAction({}, form({ password: "NewPass#12345", confirmPassword: "NewPass#12345" })))).toBe("/student");
    expect((await accountRow(s.username)).must_change_password).toBe(false);
    await expect(requireStudentAreaPage()).resolves.toMatchObject({ id: s.profileId });
  });

  it("fails closed: an unauthenticated caller or a student without an account row is redirected", async () => {
    state.client = freshClient(); // no session
    expect(await redirectTarget(() => requireStudentAreaPage())).toBe("/student/sign-in");

    const s = await newStudent("F");
    state.client = freshClient();
    await studentSignInAction({}, form({ username: s.username, password: s.temporaryPassword })).catch(() => {});
    await admin.from("student_accounts").delete().eq("username", s.username);
    expect(await redirectTarget(() => requireStudentAreaPage())).toBe("/student/set-password");
  });

  it("teachers and admins are not let into the student area", async () => {
    state.client = freshClient();
    const { error } = await state.client.auth.signInWithPassword({ email: "teacher@example.com", password: "DevTeacher#12345" });
    expect(error).toBeNull();
    expect(await redirectTarget(() => requireStudentAreaPage())).toBe("/student/sign-in");
    expect(await redirectTarget(() => requireStudentSessionPage())).toBe("/student/sign-in");
  });
});
