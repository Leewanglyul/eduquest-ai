import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// Application-level authorization tests (server actions) against the LOCAL Supabase stack.
//
// Only the *identity lookup* is mocked (who is the caller?). The role gate (guards.ts), the
// services, the permission checks and the database are all real. That lets us call each action
// as teacher / co-teacher / admin / student / outsider / unauthenticated and assert both the
// returned state and the resulting DB rows.
// ---------------------------------------------------------------------------------------------

type Role = "teacher" | "student" | "admin";
type SessionProfile = {
  id: string;
  school_id: string;
  role: Role;
  display_name: string;
  status: "active";
};

const session = vi.hoisted(() => ({ profile: null as SessionProfile | null }));

vi.mock("@/features/identity/service", async () => {
  const { IdentityError } = await import("@/features/identity/errors");
  const require_ = () => {
    if (!session.profile) throw new IdentityError("UNAUTHENTICATED", "로그인이 필요합니다.");
    return session.profile;
  };
  return {
    requireAuthenticatedUserId: async () => require_().id,
    requireActiveProfile: async () => require_(),
  };
});

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { provisionStudentAccount } from "@/features/accounts/provisioning";
import { createStudentAction } from "@/features/auth/student-actions";
import { commitBatchAction, previewBatchAction } from "@/features/accounts/batch/actions";
import {
  addCoTeacherAction,
  archiveClassroomAction,
  createClassroomAction,
  removeCoTeacherAction,
  unarchiveClassroomAction,
  updateClassroomAction,
} from "@/features/classrooms/actions";
import { updateClassroom } from "@/features/classrooms/service";
import {
  addStudentAction,
  removeStudentAction,
  transferStudentAction,
} from "@/features/enrollments/actions";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = `T${Date.now().toString(36)}`.toUpperCase();
const PASSWORD = "Tmp#pass12345";

const admin = createSupabaseAdminClient();

const mk = (id: string, role: Role, name: string): SessionProfile => ({
  id,
  school_id: SCHOOL,
  role,
  display_name: name,
  status: "active",
});

// owner = teacher@example.com from supabase/seed.sql
const owner = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const coTeacher = mk("00000000-0000-4000-8000-0000000000f1", "teacher", "AT co-teacher");
const outsider = mk("00000000-0000-4000-8000-0000000000f2", "teacher", "AT outsider");
const adminUser = mk("00000000-0000-4000-8000-0000000000f3", "admin", "AT admin");
let student: SessionProfile; // a real, provisioned student account acting as the caller

const as = (p: SessionProfile | null) => {
  session.profile = p;
};

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

type State = { ok: boolean; error?: string };
const idle = { ok: false };

function expectRejected(state: State) {
  expect(state.ok).toBe(false);
  expect(typeof state.error).toBe("string");
  expect(state.error!.length).toBeGreaterThan(0);
}

const countStudents = async () => {
  const { count } = await admin.from("students").select("id", { count: "exact", head: true });
  return count ?? 0;
};

const activeEnrollment = async (classroomId: string, studentId: string) => {
  const { data } = await admin
    .from("classroom_enrollments")
    .select("status")
    .eq("classroom_id", classroomId)
    .eq("student_id", studentId)
    .maybeSingle();
  return data?.status === "active";
};

// ---- fixtures -------------------------------------------------------------------------------

const createdClassrooms: string[] = [];
let n = 0;
const uniq = (prefix: string) => `${prefix}${RUN}${(n += 1)}`;

async function ensureUser(p: SessionProfile) {
  const { error } = await admin.auth.admin.createUser({
    id: p.id,
    email: `${p.id}@access.invalid`,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error && !/already|exists|registered/i.test(error.message)) throw error;
  await admin.from("profiles").upsert({
    id: p.id,
    school_id: p.school_id,
    role: p.role,
    display_name: p.display_name,
    status: "active",
  });
}

async function makeClassroom(options: { coTeach?: boolean; archived?: boolean } = {}) {
  as(owner);
  const created = await createClassroomAction(idle, form({ name: uniq("반") }));
  expect(created.ok).toBe(true);
  const id = created.classroomId!;
  createdClassrooms.push(id);
  if (options.coTeach !== false) {
    const added = await addCoTeacherAction(idle, form({ classroomId: id, teacherId: coTeacher.id }));
    expect(added.ok).toBe(true);
  }
  if (options.archived) {
    expect((await archiveClassroomAction(idle, form({ classroomId: id }))).ok).toBe(true);
  }
  return id;
}

async function makeStudent(): Promise<{ studentId: string; profileId: string }> {
  const s = await provisionStudentAccount({
    schoolId: SCHOOL,
    actorId: owner.id,
    studentName: "접근검증",
    studentNo: uniq("S"),
    grade: "1",
  });
  return { studentId: s.studentId, profileId: s.profileId };
}

let A: string; // owner + co-teacher
let C: string; // owner + co-teacher (second classroom the co-teacher is on)
let B: string; // owner only (co-teacher NOT a member)
let D: string; // archived

beforeAll(async () => {
  for (const p of [coTeacher, outsider, adminUser]) await ensureUser(p);
  const s = await makeStudent();
  student = mk(s.profileId, "student", "접근검증");
  A = await makeClassroom();
  C = await makeClassroom();
  B = await makeClassroom({ coTeach: false });
  D = await makeClassroom({ archived: true });
});

afterAll(async () => {
  // Remove everything this run created (accounts cascade to profiles/students/enrollments).
  const { data: students } = await admin
    .from("students")
    .select("profile_id")
    .like("student_no", `%${RUN}%`);
  for (const s of students ?? []) await admin.auth.admin.deleteUser(s.profile_id);
  const { data: batchStudents } = await admin
    .from("students")
    .select("profile_id")
    .like("student_no", `B${RUN}%`);
  for (const s of batchStudents ?? []) await admin.auth.admin.deleteUser(s.profile_id);
  if (createdClassrooms.length) await admin.from("classrooms").delete().in("id", createdClassrooms);
  as(null);
});

// ---- createStudentAction --------------------------------------------------------------------

describe("createStudentAction", () => {
  const input = (classroomId: string) =>
    form({ studentName: "단건", studentNo: uniq("S"), grade: "1", classroomId });

  it.each([
    ["teacher (owner)", () => owner],
    ["co-teacher", () => coTeacher],
    ["admin", () => adminUser],
  ])("%s can create a student and the student is enrolled", async (_label, who) => {
    as(who());
    const state = await createStudentAction({ ok: false }, input(A));
    expect(state.ok).toBe(true);
    expect(state.enrollmentWarning).toBeUndefined();
    expect(await activeEnrollment(A, state.credential!.studentId)).toBe(true);
  });

  it.each([
    ["outsider teacher", () => outsider],
    ["student", () => student],
    ["unauthenticated", () => null],
  ])("%s is rejected safely and no account is created", async (_label, who) => {
    const before = await countStudents();
    as(who());
    expectRejected(await createStudentAction({ ok: false }, input(A)));
    expect(await countStudents()).toBe(before);
  });

  it("rejects an archived classroom before creating any account", async () => {
    const before = await countStudents();
    as(owner);
    expectRejected(await createStudentAction({ ok: false }, input(D)));
    expect(await countStudents()).toBe(before);
  });
});

// ---- batch import actions -------------------------------------------------------------------

describe("batch import actions", () => {
  const csv = () => `이름,학번,학년\n일괄,B${RUN}${(n += 1)},1\n`;
  const preview = (classroomId: string, text: string) =>
    previewBatchAction({ ok: false }, form({ csv: text, classroomId }));

  it.each([
    ["teacher (owner)", () => owner],
    ["co-teacher", () => coTeacher],
    ["admin", () => adminUser],
  ])("%s can preview and commit; created students are enrolled", async (_label, who) => {
    as(who());
    const text = csv();
    const p = await preview(A, text);
    expect(p.ok).toBe(true);
    expect(p.commitToken).toBeTruthy();

    const c = await commitBatchAction(
      { ok: false },
      form({ csv: text, classroomId: A, batchId: p.batchId!, commitToken: p.commitToken! }),
    );
    expect(c.ok).toBe(true);
    expect(c.summary!.succeeded).toBe(1);
    const created = c.summary!.results[0];
    expect(created.ok && (await activeEnrollment(A, created.studentId))).toBe(true);
  });

  it.each([
    ["outsider teacher", () => outsider],
    ["student", () => student],
    ["unauthenticated", () => null],
  ])("%s cannot preview or commit; nothing is created", async (_label, who) => {
    // A valid ticket from the owner must not be usable by anyone else.
    as(owner);
    const text = csv();
    const ticket = await preview(A, text);
    expect(ticket.ok).toBe(true);

    const before = await countStudents();
    as(who());
    expectRejected(await preview(A, csv()));
    expectRejected(
      await commitBatchAction(
        { ok: false },
        form({ csv: text, classroomId: A, batchId: ticket.batchId!, commitToken: ticket.commitToken! }),
      ),
    );
    expect(await countStudents()).toBe(before);
  });

  it("rejects an archived classroom at preview", async () => {
    as(owner);
    expectRejected(await preview(D, csv()));
  });

  it("binds the commit token to the classroom it was previewed for", async () => {
    as(owner);
    const text = csv();
    const ticket = await preview(A, text);
    const before = await countStudents();
    const c = await commitBatchAction(
      { ok: false },
      form({ csv: text, classroomId: C, batchId: ticket.batchId!, commitToken: ticket.commitToken! }),
    );
    expectRejected(c);
    expect(await countStudents()).toBe(before);
  });
});

// ---- classroom actions ----------------------------------------------------------------------

describe("classroom actions", () => {
  it.each([
    ["teacher", () => owner],
    ["co-teacher (any teacher)", () => coTeacher],
    ["admin", () => adminUser],
  ])("%s can create a classroom", async (_label, who) => {
    as(who());
    const s = await createClassroomAction(idle, form({ name: uniq("새반") }));
    expect(s.ok).toBe(true);
    createdClassrooms.push(s.classroomId!);
  });

  it.each([
    ["student", () => student],
    ["unauthenticated", () => null],
  ])("%s cannot create a classroom", async (_label, who) => {
    as(who());
    const before = await admin.from("classrooms").select("id", { count: "exact", head: true });
    expectRejected(await createClassroomAction(idle, form({ name: uniq("거부") })));
    const after = await admin.from("classrooms").select("id", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
  });

  it.each([
    ["owner", () => owner, true],
    ["co-teacher", () => coTeacher, true],
    ["admin", () => adminUser, true],
    ["outsider teacher", () => outsider, false],
    ["student", () => student, false],
    ["unauthenticated", () => null, false],
  ])("update: %s -> allowed=%s", async (_label, who, allowed) => {
    as(who());
    const name = uniq("수정");
    const state = await updateClassroomAction(idle, form({ classroomId: A, name }));
    if (allowed) {
      expect(state.ok).toBe(true);
      const { data } = await admin.from("classrooms").select("name").eq("id", A).single();
      expect(data!.name).toBe(name);
    } else {
      expectRejected(state);
    }
  });

  it("the classroom code is read-only (schema rejects it, DB trigger blocks it)", async () => {
    await expect(
      updateClassroom(owner, { classroomId: A, name: uniq("코드"), code: "AAAAAA" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const { error } = await admin.from("classrooms").update({ code: "AAAAAA" }).eq("id", A);
    expect(error?.message).toContain("CLASSROOM_CODE_READ_ONLY");
  });

  it("archive/unarchive is owner/admin only", async () => {
    const E = await makeClassroom();
    const archivedAt = async () =>
      (await admin.from("classrooms").select("archived_at").eq("id", E).single()).data!.archived_at;

    for (const who of [coTeacher, outsider, student, null]) {
      as(who);
      expectRejected(await archiveClassroomAction(idle, form({ classroomId: E })));
    }
    expect(await archivedAt()).toBeNull();

    as(owner);
    expect((await archiveClassroomAction(idle, form({ classroomId: E }))).ok).toBe(true);
    expect(await archivedAt()).not.toBeNull();

    for (const who of [coTeacher, outsider, student, null]) {
      as(who);
      expectRejected(await unarchiveClassroomAction(idle, form({ classroomId: E })));
    }
    expect(await archivedAt()).not.toBeNull();

    as(adminUser);
    expect((await unarchiveClassroomAction(idle, form({ classroomId: E }))).ok).toBe(true);
    expect(await archivedAt()).toBeNull();
  });

  it("co-teacher management is owner/admin only", async () => {
    const F = await makeClassroom();
    const members = async () =>
      (await admin.from("classroom_teachers").select("teacher_id").eq("classroom_id", F)).data!.map(
        (r) => r.teacher_id,
      );

    for (const who of [coTeacher, outsider, student, null]) {
      as(who);
      expectRejected(
        await addCoTeacherAction(idle, form({ classroomId: F, teacherId: outsider.id })),
      );
    }
    expect(await members()).not.toContain(outsider.id);

    as(owner);
    expect((await addCoTeacherAction(idle, form({ classroomId: F, teacherId: outsider.id }))).ok).toBe(true);
    expect(await members()).toContain(outsider.id);

    for (const who of [coTeacher, student, null]) {
      as(who);
      expectRejected(
        await removeCoTeacherAction(idle, form({ classroomId: F, teacherId: outsider.id })),
      );
    }
    expect(await members()).toContain(outsider.id);

    as(adminUser);
    expect((await removeCoTeacherAction(idle, form({ classroomId: F, teacherId: outsider.id }))).ok).toBe(true);
    expect(await members()).not.toContain(outsider.id);
  });
});

// ---- enrollment actions ---------------------------------------------------------------------

describe("enrollment actions", () => {
  it.each([
    ["owner", () => owner],
    ["co-teacher", () => coTeacher],
    ["admin", () => adminUser],
  ])("%s can add a student to the roster", async (_label, who) => {
    const s = await makeStudent();
    as(who());
    expect((await addStudentAction(idle, form({ classroomId: A, studentId: s.studentId }))).ok).toBe(true);
    expect(await activeEnrollment(A, s.studentId)).toBe(true);
  });

  it.each([
    ["outsider teacher", () => outsider],
    ["student", () => student],
    ["unauthenticated", () => null],
  ])("%s cannot add or remove roster entries", async (_label, who) => {
    const s = await makeStudent();
    as(owner);
    expect((await addStudentAction(idle, form({ classroomId: A, studentId: s.studentId }))).ok).toBe(true);

    as(who());
    const other = await makeStudent();
    expectRejected(await addStudentAction(idle, form({ classroomId: A, studentId: other.studentId })));
    expect(await activeEnrollment(A, other.studentId)).toBe(false);

    expectRejected(await removeStudentAction(idle, form({ classroomId: A, studentId: s.studentId })));
    expect(await activeEnrollment(A, s.studentId)).toBe(true);
  });

  it("co-teacher can remove a student, and owner can reactivate", async () => {
    const s = await makeStudent();
    as(owner);
    await addStudentAction(idle, form({ classroomId: A, studentId: s.studentId }));
    as(coTeacher);
    expect((await removeStudentAction(idle, form({ classroomId: A, studentId: s.studentId }))).ok).toBe(true);
    expect(await activeEnrollment(A, s.studentId)).toBe(false);
    as(owner);
    expect((await addStudentAction(idle, form({ classroomId: A, studentId: s.studentId }))).ok).toBe(true);
    expect(await activeEnrollment(A, s.studentId)).toBe(true);
  });

  it("archived classrooms reject roster changes", async () => {
    const s = await makeStudent();
    as(owner);
    expectRejected(await addStudentAction(idle, form({ classroomId: D, studentId: s.studentId })));
    expect(await activeEnrollment(D, s.studentId)).toBe(false);
  });

  describe("transfer", () => {
    const transfer = (from: string, to: string, studentId: string) =>
      transferStudentAction(
        idle,
        form({ sourceClassroomId: from, targetClassroomId: to, studentId }),
      );

    const enrolledIn = async (classroomId: string) => {
      const s = await makeStudent();
      as(owner);
      expect((await addStudentAction(idle, form({ classroomId, studentId: s.studentId }))).ok).toBe(true);
      return s.studentId;
    };

    it("co-teacher can transfer between two classrooms they belong to", async () => {
      const id = await enrolledIn(A);
      as(coTeacher);
      expect((await transfer(A, C, id)).ok).toBe(true);
      expect(await activeEnrollment(A, id)).toBe(false);
      expect(await activeEnrollment(C, id)).toBe(true);
    });

    it("co-teacher cannot transfer into a classroom they are not a member of", async () => {
      const id = await enrolledIn(A);
      as(coTeacher);
      expectRejected(await transfer(A, B, id));
      expect(await activeEnrollment(A, id)).toBe(true);
      expect(await activeEnrollment(B, id)).toBe(false);
    });

    it("admin can transfer; owner can too", async () => {
      const id = await enrolledIn(A);
      as(adminUser);
      expect((await transfer(A, B, id)).ok).toBe(true);
      as(owner);
      expect((await transfer(B, A, id)).ok).toBe(true);
      expect(await activeEnrollment(A, id)).toBe(true);
    });

    it.each([
      ["outsider teacher", () => outsider],
      ["student", () => student],
      ["unauthenticated", () => null],
    ])("%s cannot transfer", async (_label, who) => {
      const id = await enrolledIn(A);
      as(who());
      expectRejected(await transfer(A, B, id));
      expect(await activeEnrollment(A, id)).toBe(true);
      expect(await activeEnrollment(B, id)).toBe(false);
    });

    it("cannot transfer into an archived classroom", async () => {
      const id = await enrolledIn(A);
      as(owner);
      expectRejected(await transfer(A, D, id));
      expect(await activeEnrollment(A, id)).toBe(true);
    });
  });
});
