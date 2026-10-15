import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Real action + service + database. Only the identity lookup (who is calling?) is mocked.

type Role = "teacher" | "student" | "admin";
type SessionProfile = { id: string; school_id: string; role: Role; display_name: string; status: "active" };
const session = vi.hoisted(() => ({ profile: null as SessionProfile | null }));

vi.mock("@/features/identity/service", async () => {
  const { IdentityError } = await import("@/features/identity/errors");
  const need = () => {
    if (!session.profile) throw new IdentityError("UNAUTHENTICATED", "로그인이 필요합니다.");
    return session.profile;
  };
  return { requireAuthenticatedUserId: async () => need().id, requireActiveProfile: async () => need() };
});

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { provisionStudentAccount } from "@/features/accounts/provisioning";
import { reissueStudentPasswordAction } from "@/features/accounts/reissue-actions";
import { createClassroomAction, addCoTeacherAction, archiveClassroomAction } from "@/features/classrooms/actions";
import { addStudentAction } from "@/features/enrollments/actions";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = Date.now().toString(36);
const PW = "Tmp#pass12345";
const admin = createSupabaseAdminClient();

const mk = (id: string, role: Role, name: string): SessionProfile => ({ id, school_id: SCHOOL, role, display_name: name, status: "active" });
const owner = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const coTeacher = mk("00000000-0000-4000-8000-0000000000f1", "teacher", "RI co-teacher");
const outsider = mk("00000000-0000-4000-8000-0000000000f2", "teacher", "RI outsider");
const adminUser = mk("00000000-0000-4000-8000-0000000000f3", "admin", "RI admin");
const as = (p: SessionProfile | null) => { session.profile = p; };
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const idle = { ok: false };

const grant = (email: string, password: string) =>
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

let classroom: string;
let archivedClassroom: string;
const classrooms: string[] = [];
const profiles: string[] = [];
let n = 0;

async function ensureUser(p: SessionProfile) {
  const { error } = await admin.auth.admin.createUser({ id: p.id, email: `${p.id}@access.invalid`, password: PW, email_confirm: true });
  if (error && !/already|exists|registered/i.test(error.message)) throw error;
  await admin.from("profiles").upsert({ id: p.id, school_id: p.school_id, role: p.role, display_name: p.display_name, status: "active" });
}

async function enrolledStudent(inClassroom = classroom) {
  const s = await provisionStudentAccount({ schoolId: SCHOOL, actorId: owner.id, studentName: "재발급", studentNo: `R${RUN}${(n += 1)}`, grade: "1" });
  profiles.push(s.profileId);
  as(owner);
  expect((await addStudentAction(idle, form({ classroomId: inClassroom, studentId: s.studentId }))).ok).toBe(true);
  return s;
}

const accountOf = async (username: string) =>
  (await admin.from("student_accounts").select("id, must_change_password, failed_attempts, locked_until").eq("username", username).single()).data!;

beforeAll(async () => {
  for (const p of [coTeacher, outsider, adminUser]) await ensureUser(p);
  as(owner);
  const c = await createClassroomAction(idle, form({ name: `재발급반${RUN}` }));
  classroom = c.classroomId!;
  await addCoTeacherAction(idle, form({ classroomId: classroom, teacherId: coTeacher.id }));
  const a = await createClassroomAction(idle, form({ name: `보관반${RUN}` }));
  archivedClassroom = a.classroomId!;
  classrooms.push(classroom, archivedClassroom);
});

afterAll(async () => {
  for (const id of profiles) await admin.auth.admin.deleteUser(id);
  if (classrooms.length) await admin.from("classrooms").delete().in("id", classrooms);
  as(null);
});

describe("teacher password reissue", () => {
  it.each([
    ["owner", () => owner],
    ["co-teacher", () => coTeacher],
    ["admin", () => adminUser],
  ])("%s: new temporary password, forced change, old password and sessions revoked, audited", async (_l, who) => {
    const s = await enrolledStudent();

    // The student has a live session and is app-locked; the old password works before the reissue.
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await sb.auth.signInWithPassword({ email: s.syntheticEmail, password: s.temporaryPassword });
    expect(login.error).toBeNull();
    await admin.from("student_accounts").update({ must_change_password: false, failed_attempts: 5, locked_until: new Date(Date.now() + 600_000).toISOString() }).eq("username", s.username);

    as(who());
    const state = await reissueStudentPasswordAction(idle, form({ classroomId: classroom, studentId: s.studentId }));
    expect(state.ok).toBe(true);
    const cred = state.credential!;
    expect(cred.username).toBe(s.username);
    expect(cred.temporaryPassword).not.toBe(s.temporaryPassword);
    expect(cred.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    // Forced change + lock cleared.
    const acct = await accountOf(s.username);
    expect(acct.must_change_password).toBe(true);
    expect(acct.failed_attempts).toBe(0);
    expect(acct.locked_until).toBeNull();

    // Old password dead, new one works (checked against the auth API).
    expect((await grant(s.syntheticEmail, s.temporaryPassword)).status).toBe(400);
    expect((await grant(s.syntheticEmail, cred.temporaryPassword)).status).toBe(200);

    // The pre-existing session is gone: its refresh token no longer works.
    const refreshed = await sb.auth.refreshSession({ refresh_token: login.data.session!.refresh_token });
    expect(refreshed.error).not.toBeNull();

    // Audit: event recorded, password never logged.
    const { data: logs } = await admin.from("audit_logs").select("actor_id, metadata, classroom_id").eq("action", "student.password_reissued").eq("resource_id", acct.id);
    expect(logs!.length).toBe(1);
    expect(logs![0].actor_id).toBe(who().id);
    expect(logs![0].classroom_id).toBe(classroom);
    expect(JSON.stringify(logs![0].metadata)).not.toContain(cred.temporaryPassword);
  });

  it.each([
    ["outsider teacher", () => outsider],
    ["student", () => ({ ...mk("00000000-0000-4000-8000-0000000000f9", "student", "S"), role: "student" as const })],
    ["unauthenticated", () => null],
  ])("%s is rejected and nothing changes", async (_l, who) => {
    const s = await enrolledStudent();
    as(who());
    const state = await reissueStudentPasswordAction(idle, form({ classroomId: classroom, studentId: s.studentId }));
    expect(state.ok).toBe(false);
    expect(state.error).toBeTruthy();
    expect(state.credential).toBeUndefined();
    expect((await grant(s.syntheticEmail, s.temporaryPassword)).status).toBe(200); // old password intact
    expect((await accountOf(s.username)).must_change_password).toBe(true); // unchanged default
    const { data: logs } = await admin.from("audit_logs").select("id").eq("action", "student.password_reissued").eq("resource_id", (await accountOf(s.username)).id);
    expect(logs).toHaveLength(0);
  });

  it("rejects a student who is not enrolled in the given classroom", async () => {
    const s = await provisionStudentAccount({ schoolId: SCHOOL, actorId: owner.id, studentName: "미등록", studentNo: `U${RUN}${(n += 1)}`, grade: "1" });
    profiles.push(s.profileId);
    as(owner);
    const state = await reissueStudentPasswordAction(idle, form({ classroomId: classroom, studentId: s.studentId }));
    expect(state.ok).toBe(false);
    expect((await grant(s.syntheticEmail, s.temporaryPassword)).status).toBe(200);
  });

  it("rejects an archived classroom", async () => {
    const s = await enrolledStudent(archivedClassroom);
    as(owner);
    expect((await archiveClassroomAction(idle, form({ classroomId: archivedClassroom }))).ok).toBe(true);
    const state = await reissueStudentPasswordAction(idle, form({ classroomId: archivedClassroom, studentId: s.studentId }));
    expect(state.ok).toBe(false);
    expect((await grant(s.syntheticEmail, s.temporaryPassword)).status).toBe(200);
  });

  it("fn_revoke_user_sessions ends every session by itself (independent of the password change)", async () => {
    const s = await enrolledStudent();
    const mkClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const [a, b] = [mkClient(), mkClient()];
    const la = await a.auth.signInWithPassword({ email: s.syntheticEmail, password: s.temporaryPassword });
    const lb = await b.auth.signInWithPassword({ email: s.syntheticEmail, password: s.temporaryPassword });
    expect(la.error).toBeNull();
    expect(lb.error).toBeNull();
    expect((await mkClient().auth.refreshSession({ refresh_token: la.data.session!.refresh_token })).error).toBeNull();

    // Fresh tokens (the refresh above rotated them); revoke WITHOUT touching the password.
    const lc = await mkClient().auth.signInWithPassword({ email: s.syntheticEmail, password: s.temporaryPassword });
    const { data: revoked, error } = await admin.rpc("fn_revoke_user_sessions", { p_user_id: s.profileId });
    expect(error).toBeNull();
    expect(revoked).toBeGreaterThanOrEqual(2);
    for (const refresh of [lb.data.session!.refresh_token, lc.data.session!.refresh_token]) {
      expect((await mkClient().auth.refreshSession({ refresh_token: refresh })).error).not.toBeNull();
    }
    // The password itself is unchanged, so the student can sign in again.
    expect((await grant(s.syntheticEmail, s.temporaryPassword)).status).toBe(200);
  });

  it("rejects malformed input", async () => {
    as(owner);
    const state = await reissueStudentPasswordAction(idle, form({ classroomId: "nope", studentId: "nope" }));
    expect(state.ok).toBe(false);
  });
});
