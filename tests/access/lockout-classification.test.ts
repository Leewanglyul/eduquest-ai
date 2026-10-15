import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError, createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------------------------
// A1: lockout error classification, through the REAL sign-in action and the REAL database.
//
//   counts toward the lock (slot kept):   invalid_credentials, email_not_confirmed, user_banned
//   does NOT count (slot refunded):       429 rate limit, AuthRetryableFetchError (5xx / network /
//                                         timeout), an exception thrown after the reservation
//
// Only the cookie-bound server client is replaced by a plain supabase-js client; for the
// infrastructure cases that client is given a fetch that returns the failure.
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
import { studentSignInAction } from "@/features/auth/student-actions";
import { isInfrastructureAuthError, releaseLoginAttempt } from "@/features/auth/lockout";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const OWNER = "00000000-0000-4000-8000-000000000001";
const RUN = Date.now().toString(36);
const admin = createSupabaseAdminClient();
const created: string[] = [];
let seq = 0;

const URL_ = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const AUTH_OPTS = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

const RATE_LIMITED = "로그인 요청이 많습니다";
const TEMPORARY = "일시적인 오류";
const GENERIC = "아이디 또는 비밀번호가 올바르지 않습니다";
const LOCKED = "5회 실패하여 15분간 잠겼습니다";

/** A real client; counts the password verifications that actually reach the Auth server. */
function realClient() {
  const c = createClient(URL_(), ANON(), { auth: AUTH_OPTS });
  const original = c.auth.signInWithPassword.bind(c.auth);
  c.auth.signInWithPassword = (async (...args: Parameters<typeof original>) => {
    state.passwordChecks += 1;
    return original(...args);
  }) as typeof c.auth.signInWithPassword;
  return c;
}

/** A client whose HTTP layer is replaced, so Auth "answers" with a chosen failure. */
const clientWithFetch = (impl: () => Promise<Response>) =>
  createClient(URL_(), ANON(), { auth: AUTH_OPTS, global: { fetch: impl as unknown as typeof fetch } });

const answer = (status: number, body: object) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const html = (status: number) => () => Promise.resolve(new Response("<html>gateway</html>", { status }));
const networkDown = () => Promise.reject(new TypeError("fetch failed"));
const timedOut = () => {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return Promise.reject(e);
};

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const signIn = (username: string, password: string) =>
  studentSignInAction({}, form({ username, password }));

async function newStudent() {
  const s = await provisionStudentAccount({
    schoolId: SCHOOL,
    actorId: OWNER,
    studentName: "분류검증",
    studentNo: `K${RUN}${(seq += 1)}`,
    grade: "1",
  });
  created.push(s.profileId);
  return s;
}

const row = async (username: string) =>
  (await admin.from("student_accounts").select("id, failed_attempts, locked_until").eq("username", username).single()).data!;

let errorLog: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  state.client = realClient();
});
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(async () => {
  errorLog?.mockRestore();
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

// ---- 1-3: credential-side errors COUNT ---------------------------------------------------------

describe("credential-side Auth errors count toward the lock", () => {
  it("invalid_credentials: +1 per attempt, the 5th locks", async () => {
    const s = await newStudent();
    state.client = realClient();
    for (let i = 1; i <= 4; i += 1) {
      const r = await signIn(s.username, `wrong-pass-${i}`);
      expect(r.error).toContain(GENERIC);
      expect((await row(s.username)).failed_attempts).toBe(i);
    }
    expect((await signIn(s.username, "wrong-pass-5")).error).toContain(LOCKED);
    expect((await row(s.username)).locked_until).not.toBeNull();
  });

  it("email_not_confirmed: counted like a wrong password", async () => {
    const s = await newStudent();
    state.client = clientWithFetch(
      answer(400, { code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" }),
    );
    for (let i = 1; i <= 4; i += 1) {
      expect((await signIn(s.username, "whatever-1")).error).toContain(GENERIC);
      expect((await row(s.username)).failed_attempts).toBe(i);
    }
    expect((await signIn(s.username, "whatever-1")).error).toContain(LOCKED);
    expect((await row(s.username)).locked_until).not.toBeNull();
  });

  it("user_banned (a real banned account, correct password): counted, the 5th locks", async () => {
    const s = await newStudent();
    await admin.auth.admin.updateUserById(s.profileId, { ban_duration: "1h" });
    state.client = realClient();
    for (let i = 1; i <= 4; i += 1) {
      expect((await signIn(s.username, s.temporaryPassword)).error).toContain(GENERIC);
      expect((await row(s.username)).failed_attempts).toBe(i);
    }
    expect((await signIn(s.username, s.temporaryPassword)).error).toContain(LOCKED);
    expect((await row(s.username)).locked_until).not.toBeNull();
  });
});

// ---- 4-6: infrastructure errors DO NOT COUNT ---------------------------------------------------

describe("infrastructure Auth errors do not count (the reserved slot is refunded)", () => {
  it("429 rate limit: ten attempts leave the counter at 0, no lock, a distinct message", async () => {
    const s = await newStudent();
    state.client = clientWithFetch(
      answer(429, { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" }),
    );
    for (let i = 0; i < 10; i += 1) {
      const r = await signIn(s.username, "any-password-1");
      expect(r.error).toContain(RATE_LIMITED);
      expect(r.error).not.toContain(GENERIC);
      const a = await row(s.username);
      expect(a.failed_attempts).toBe(0);
      expect(a.locked_until).toBeNull();
    }
  });

  it.each([
    ["500 internal error (JSON)", answer(500, { code: 500, error_code: "unexpected_failure", msg: "boom" })],
    ["502 bad gateway (HTML body)", html(502)],
    ["503 service unavailable", answer(503, { code: 503, msg: "unavailable" })],
    ["504 gateway timeout", html(504)],
    ["network failure (fetch throws)", networkDown],
    ["network timeout (AbortError)", timedOut],
  ])("%s: counter stays 0 and the student is told it is temporary", async (_label, impl) => {
    const s = await newStudent();
    state.client = clientWithFetch(impl as () => Promise<Response>);
    for (let i = 0; i < 6; i += 1) {
      const r = await signIn(s.username, "any-password-1");
      expect(r.error).toContain(TEMPORARY);
      expect(r.error).not.toContain(GENERIC);
    }
    const a = await row(s.username);
    expect(a.failed_attempts).toBe(0);
    expect(a.locked_until).toBeNull();
  });

  it("an exception thrown after the reservation also refunds the slot, then fails as before", async () => {
    const s = await newStudent();
    const c = realClient();
    c.auth.signInWithPassword = (async () => {
      throw new Error("unexpected");
    }) as typeof c.auth.signInWithPassword;
    state.client = c;
    await expect(signIn(s.username, "any-password-1")).rejects.toThrow("unexpected");
    expect((await row(s.username)).failed_attempts).toBe(0);
  });

  it("the log line carries status/name/code only: no username, no password", async () => {
    const s = await newStudent();
    state.client = clientWithFetch(answer(429, { code: 429, error_code: "over_request_rate_limit", msg: "x" }));
    errorLog.mockClear();
    await signIn(s.username, "secret-password-9");
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("429");
    expect(logged).not.toContain(s.username);
    expect(logged).not.toContain("secret-password-9");
  });
});

// ---- mixed and concurrent behaviour ------------------------------------------------------------

describe("mixed and concurrent behaviour", () => {
  it("4 wrong + 10 rate-limited + 1 wrong: only the wrong passwords count, the 5th locks", async () => {
    const s = await newStudent();
    state.client = realClient();
    for (let i = 1; i <= 4; i += 1) await signIn(s.username, `wrong-pass-${i}`);
    expect((await row(s.username)).failed_attempts).toBe(4);

    state.client = clientWithFetch(answer(429, { code: 429, error_code: "over_request_rate_limit", msg: "x" }));
    for (let i = 0; i < 10; i += 1) await signIn(s.username, "any-password-1");
    const mid = await row(s.username);
    expect(mid.failed_attempts).toBe(4);
    expect(mid.locked_until).toBeNull();

    state.client = realClient();
    expect((await signIn(s.username, "wrong-pass-5")).error).toContain(LOCKED);
    expect((await row(s.username)).locked_until).not.toBeNull();
  });

  it("a rate-limit episode does not lock the student out: the correct password still works afterwards", async () => {
    const s = await newStudent();
    state.client = clientWithFetch(answer(429, { code: 429, error_code: "over_request_rate_limit", msg: "x" }));
    for (let i = 0; i < 8; i += 1) await signIn(s.username, s.temporaryPassword);

    state.client = realClient();
    let target: string | null = null;
    try {
      await signIn(s.username, s.temporaryPassword);
    } catch (e) {
      const digest = (e as { digest?: string }).digest ?? "";
      target = digest.startsWith("NEXT_REDIRECT") ? digest.split(";")[2] : null;
    }
    expect(target).toBe("/student/set-password");
    expect((await row(s.username)).failed_attempts).toBe(0);
  });

  it("20 parallel rate-limited attempts on one account leave it at 0 and unlocked", async () => {
    const s = await newStudent();
    state.client = clientWithFetch(answer(429, { code: 429, error_code: "over_request_rate_limit", msg: "x" }));
    const results = await Promise.all(Array.from({ length: 20 }, () => signIn(s.username, "any-password-1")));
    // Slots are reserved before the Auth call, so some parallel attempts may be refused as
    // "too many in flight"; whatever the mix, the refunds must bring the counter back to 0.
    expect(results.every((r) => typeof r.error === "string")).toBe(true);
    const a = await row(s.username);
    expect(a.failed_attempts).toBe(0);
    expect(a.locked_until).toBeNull();
  });

  it("regression: 20 parallel WRONG passwords still allow at most 5 password checks and lock", async () => {
    const s = await newStudent();
    state.client = realClient();
    state.passwordChecks = 0;
    await Promise.all(Array.from({ length: 20 }, () => signIn(s.username, "definitely-wrong-1")));
    expect(state.passwordChecks).toBeLessThanOrEqual(5);
    expect((await row(s.username)).locked_until).not.toBeNull();
  });

  it("releasing is a no-op once the account is locked (a lock cannot be undone by a refund)", async () => {
    const s = await newStudent();
    state.client = realClient();
    for (let i = 1; i <= 5; i += 1) await signIn(s.username, `wrong-pass-${i}`);
    const locked = await row(s.username);
    expect(locked.locked_until).not.toBeNull();
    await releaseLoginAttempt(locked.id);
    await releaseLoginAttempt(locked.id);
    const after = await row(s.username);
    expect(after.failed_attempts).toBe(5);
    expect(after.locked_until).toBe(locked.locked_until);
  });
});

// ---- the classifier itself ---------------------------------------------------------------------

describe("isInfrastructureAuthError (fail-closed deny-list)", () => {
  const api = (status: number, code?: string) => new AuthApiError("x", status, code);
  const retry = (status: number) => new AuthRetryableFetchError("x", status);

  it.each([
    ["429 over_request_rate_limit", api(429, "over_request_rate_limit")],
    ["AuthRetryableFetchError status 0 (network, timeout)", retry(0)],
    ["AuthRetryableFetchError 500", retry(500)],
    ["AuthRetryableFetchError 502", retry(502)],
    ["AuthRetryableFetchError 503", retry(503)],
    ["AuthRetryableFetchError 504", retry(504)],
    ["AuthApiError 500 (defensive, other auth-js wrappers)", api(500, "unexpected_failure")],
    ["AuthApiError 503", api(503)],
  ])("%s -> infrastructure (refunded)", (_label, error) => {
    expect(isInfrastructureAuthError(error)).toBe(true);
  });

  it.each([
    ["invalid_credentials 400", api(400, "invalid_credentials")],
    ["email_not_confirmed 400", api(400, "email_not_confirmed")],
    ["user_banned 400", api(400, "user_banned")],
    ["unknown 4xx code", api(400, "something_new")],
    ["401", api(401)],
    ["403", api(403)],
    ["404", api(404)],
    ["422", api(422, "weak_password")],
    ["legacy wrong-password shape (no code)", api(400)],
    ["unknown error with no status", { name: "AuthUnknownError" }],
    ["empty object", {}],
    ["null", null],
    ["undefined", undefined],
  ])("%s -> credential side (counted, fail closed)", (_label, error) => {
    expect(isInfrastructureAuthError(error as never)).toBe(false);
  });
});
