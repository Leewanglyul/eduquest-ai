import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// M2-3.4 TP-0 against the LOCAL stack: teacher team setup, the in-class view, help resolution and close, for the
// classroom owner, a co-teacher, the school admin (read-only) and an unrelated teacher. Only the identity lookup is
// mocked; every authorisation decision is the database's.
// ---------------------------------------------------------------------------------------------

type Role = "teacher" | "student" | "admin";
type SessionProfile = { id: string; school_id: string; role: Role; display_name: string; status: "active" };
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

import CrosswordLivePage from "@/app/teacher/crosswords/[puzzleId]/assignments/[assignmentId]/live/page";
import CrosswordTeamsPage from "@/app/teacher/crosswords/[puzzleId]/assignments/[assignmentId]/teams/page";
import { POST as savePOST } from "@/app/student/crosswords/[assignmentId]/api/save/route";
import { POST as helpPOST } from "@/app/student/crosswords/[assignmentId]/api/help/route";
import { NORMALIZER_VERSION } from "@/features/content/import/content-schemas";
import { startOrResume } from "@/features/crossword/play/service";
import { getTeamSetup } from "@/features/crossword/results/team-service";
import { resolveTeamHelp } from "@/features/crossword/results/team-help-resolution";
import { closeCrosswordAssignmentAction, generateCrosswordAction, publishCrosswordAction, saveCrosswordDraftAction } from "@/features/crossword/review/actions";
import type { PreviewSuccess } from "@/features/crossword/review/service";
import {
  assignStudentAction,
  createTeamAction,
  deleteTeamAction,
  loadLiveViewAction,
  resolveTeamHelpAction,
  setPlayModeAction,
  unassignStudentAction,
} from "@/features/crossword/teams/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = `TT${Date.now().toString(36)}`.toUpperCase();
const PASSWORD = "Tmp#pass12345";
const admin = createSupabaseAdminClient();
const startedAt = new Date().toISOString();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const mk = (id: string, role: Role, name: string): SessionProfile => ({ id, school_id: SCHOOL, role, display_name: name, status: "active" });
const owner = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const coTeacher = mk("00000000-0000-4000-8000-00000000006a", "teacher", "TT co-teacher");
const schoolAdmin = mk("00000000-0000-4000-8000-00000000006b", "admin", "TT admin");
const outsider = mk("00000000-0000-4000-8000-00000000006c", "teacher", "TT other teacher");
const st = ["7a", "7b", "7c", "7d", "9d"].map((x, i) => mk(`00000000-0000-4000-8000-0000000000${x}`, "student", `TT s${i + 1}`));
const as = (p: SessionProfile | null) => { session.profile = p; };
const form = (payload: unknown) => { const f = new FormData(); f.set("payload", JSON.stringify(payload)); return f; };
const CHAIN = ["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관", "관심", "심장", "장미", "미술", "술래", "내일", "일요일", "요리"];
const title = (l: string) => `${RUN}-${l}`;

let room: string;
let otherRoom: string;
let setId: string;
const studentRow: Record<string, string> = {};
let puzzleId: string;
let teamAssignment: string;
let soloAssignment: string;

async function ensureUser(p: SessionProfile) {
  const existing = await admin.auth.admin.getUserById(p.id);
  if (!existing.data?.user) {
    const { error } = await admin.auth.admin.createUser({ id: p.id, email: `${p.id}@access.invalid`, password: PASSWORD, email_confirm: true });
    if (error && !/already|exists|registered/i.test(error.message)) throw error;
  }
  await admin.from("profiles").upsert({ id: p.id, school_id: p.school_id, role: p.role, display_name: p.display_name, status: "active" });
}

async function makeStudent(p: SessionProfile, n: number) {
  const { data, error } = await admin.from("students").insert({ school_id: SCHOOL, profile_id: p.id, student_no: `${RUN}-${n}`, grade: "1" }).select("id").single();
  if (error || !data) throw error;
  const { error: e2 } = await admin.from("student_accounts").insert({
    student_id: data.id, username: `${RUN.toLowerCase()}-${n}`, synthetic_email: `${RUN.toLowerCase()}-${n}@students.invalid`, must_change_password: false,
  });
  if (e2) throw e2;
  studentRow[p.id] = data.id;
}

async function publish(label: string): Promise<{ puzzleId: string; assignmentId: string }> {
  as(owner);
  const gen = await generateCrosswordAction(undefined, form({ setId, level: "normal" }));
  if (!gen.ok || !gen.data.ok) throw new Error("generate failed");
  const p = gen.data as PreviewSuccess;
  const saved = await saveCrosswordDraftAction(undefined, form({ setId, level: "normal", seed: p.seed, ticketId: p.ticket.ticketId, ticketToken: p.ticket.ticketToken, title: title(label) }));
  if (!saved.ok) throw new Error("save failed");
  const pub = await publishCrosswordAction(undefined, form({ puzzleId: saved.data.puzzleId, classroomIds: [room] }));
  if (!pub.ok) throw new Error("publish failed");
  const { data: a } = await admin.from("crossword_assignments").select("id").eq("puzzle_id", saved.data.puzzleId).eq("classroom_id", room).single();
  return { puzzleId: saved.data.puzzleId, assignmentId: a!.id };
}

beforeAll(async () => {
  for (const u of [owner, coTeacher, schoolAdmin, outsider, ...st]) await ensureUser(u);
  for (const [i, s] of st.entries()) await makeStudent(s, i + 1);
  const { data: c, error } = await admin.from("classrooms").insert({ school_id: SCHOOL, owner_id: owner.id, name: title("반") }).select("id").single();
  if (error || !c) throw error;
  room = c.id;
  const { data: c2 } = await admin.from("classrooms").insert({ school_id: SCHOOL, owner_id: outsider.id, name: title("다른반") }).select("id").single();
  otherRoom = c2!.id;
  await admin.from("classroom_teachers").insert({ classroom_id: room, teacher_id: coTeacher.id });
  await admin.from("classroom_enrollments").insert(st.map((s) => ({ classroom_id: room, student_id: studentRow[s.id] })));
  const { data: set, error: e2 } = await admin.from("content_sets").insert({ school_id: SCHOOL, owner_id: owner.id, classroom_id: room, title: title("set") }).select("id").single();
  if (e2 || !set) throw e2;
  setId = set.id;
  await admin.from("content_entries").insert(
    CHAIN.map((w, i) => ({ set_id: setId, position: i + 1, term: w, definition: `${w.length}글자 낱말 ${i + 1}`, answer: w, script: "hangul" as const, normalizer_version: NORMALIZER_VERSION })),
  );
  const t = await publish("team");
  puzzleId = t.puzzleId;
  teamAssignment = t.assignmentId;
  soloAssignment = (await publish("solo")).assignmentId;
}, 120_000);

afterEach(() => {
  delete process.env.COLLAB_PLAY_ENABLED;
});

afterAll(async () => {
  await admin.from("crossword_puzzles").delete().eq("owner_id", owner.id).gte("created_at", startedAt);
  await admin.from("crossword_preview_tickets").delete().eq("actor_id", owner.id);
  await admin.from("content_sets").delete().ilike("title", `${RUN}%`);
  await admin.from("classrooms").delete().in("id", [room, otherRoom]);
  for (const id of Object.values(studentRow)) await admin.from("students").delete().eq("id", id);
});

const sid = (i: number) => studentRow[st[i].id];
const teamIdOf = async (label: string) => {
  as(owner);
  const setup = await getTeamSetup(owner, teamAssignment);
  return setup.teams.find((t) => t.label === label)!.teamId;
};
const notFoundPage = { digest: expect.stringContaining("404") };
const params = (assignmentId: string) => ({ params: Promise.resolve({ puzzleId, assignmentId }) });

type Handler = (request: Request, context: { params: Promise<{ assignmentId: string }> }) => Promise<Response>;
async function studentCall(handler: Handler, path: string, assignmentId: string, body: unknown) {
  const req = new Request(`http://localhost/student/crosswords/${assignmentId}/api/${path}`, {
    method: "POST", headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const res = await handler(req, { params: Promise.resolve({ assignmentId }) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

// ---------------------------------------------------------------------------------------------------------------

describe("who may open the teacher team screens", () => {
  it("an unrelated teacher of the same school gets not found on /teams, /live and every action", async () => {
    as(outsider);
    await expect(CrosswordTeamsPage(params(teamAssignment))).rejects.toMatchObject(notFoundPage);
    await expect(CrosswordLivePage(params(teamAssignment))).rejects.toMatchObject(notFoundPage);
    expect(await loadLiveViewAction({ puzzleId, assignmentId: teamAssignment })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await setPlayModeAction(undefined, form({ assignmentId: teamAssignment, mode: "team" }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("owner, co-teacher and school admin can open both pages", async () => {
    for (const who of [owner, coTeacher, schoolAdmin]) {
      as(who);
      await expect(CrosswordTeamsPage(params(teamAssignment))).resolves.toBeTruthy();
      await expect(CrosswordLivePage(params(teamAssignment))).resolves.toBeTruthy();
    }
  });

  it("a student and a signed-out visitor cannot use the actions", async () => {
    as(st[0]);
    expect((await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "x" }))).ok).toBe(false);
    as(null);
    expect((await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "x" }))).ok).toBe(false);
  });

  it("with team play switched off, pages are not found and actions answer NOT_FOUND (OFF return)", async () => {
    process.env.COLLAB_PLAY_ENABLED = "false";
    as(owner);
    await expect(CrosswordTeamsPage(params(teamAssignment))).rejects.toMatchObject(notFoundPage);
    await expect(CrosswordLivePage(params(teamAssignment))).rejects.toMatchObject(notFoundPage);
    expect(await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "x" }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await loadLiveViewAction({ puzzleId, assignmentId: teamAssignment })).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("team setup (owner and co-teacher write; school admin reads only)", () => {
  it("the school admin can read teams but cannot change the mode, create, assign or delete", async () => {
    as(schoolAdmin);
    expect((await getTeamSetup(schoolAdmin, teamAssignment)).unassigned.length).toBe(5);
    expect(await setPlayModeAction(undefined, form({ assignmentId: teamAssignment, mode: "team" }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "관리" }))).toMatchObject({ ok: false });
  });

  it("owner sets team mode and creates teams; labels are checked", async () => {
    as(owner);
    expect(await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "1팀" }))).toMatchObject({ ok: false, code: "NOT_TEAM_MODE" });
    expect(await setPlayModeAction(undefined, form({ assignmentId: teamAssignment, mode: "team" }))).toMatchObject({ ok: true });
    expect(await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "1팀" }))).toMatchObject({ ok: true, data: { label: "1팀" } });
    expect(await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "1팀" }))).toMatchObject({ ok: false, code: "TEAM_LABEL_TAKEN" });
    expect(await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "가".repeat(21) }))).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "1팀", extra: true }))).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("a co-teacher creates and deletes a team before start", async () => {
    as(coTeacher);
    expect(await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "임시" }))).toMatchObject({ ok: true });
    const temp = await teamIdOf("임시");
    as(coTeacher);
    expect(await deleteTeamAction(undefined, form({ teamId: temp }))).toMatchObject({ ok: true });
  });

  it("assign up to four, a fifth is refused, under three is a warning only; unassign before start", async () => {
    as(owner);
    await createTeamAction(undefined, form({ assignmentId: teamAssignment, label: "2팀" }));
    const one = await teamIdOf("1팀");
    const two = await teamIdOf("2팀");
    as(owner);
    for (const i of [0, 1, 2, 3]) expect(await assignStudentAction(undefined, form({ teamId: one, studentId: sid(i) }))).toMatchObject({ ok: true });
    expect(await assignStudentAction(undefined, form({ teamId: one, studentId: sid(4) }))).toMatchObject({ ok: false, code: "TEAM_FULL" });
    expect(await assignStudentAction(undefined, form({ teamId: two, studentId: sid(3) }))).toMatchObject({ ok: true, data: { moved: true } });
    const setup = await getTeamSetup(owner, teamAssignment);
    const t1 = setup.teams.find((t) => t.teamId === one)!;
    const t2 = setup.teams.find((t) => t.teamId === two)!;
    expect(t1).toMatchObject({ memberCount: 3, underMin: false, started: false });
    expect(t2).toMatchObject({ memberCount: 1, underMin: true });
    expect(setup.unassigned.map((s) => s.studentId)).toEqual([sid(4)]);
    expect(await unassignStudentAction(undefined, form({ teamId: two, studentId: sid(3) }))).toMatchObject({ ok: true, data: { removed: true } });
    expect(await assignStudentAction(undefined, form({ teamId: two, studentId: sid(3) }))).toMatchObject({ ok: true });
    as(schoolAdmin);
    expect(await assignStudentAction(undefined, form({ teamId: two, studentId: sid(4) }))).toMatchObject({ ok: false });
    expect(await deleteTeamAction(undefined, form({ teamId: two }))).toMatchObject({ ok: false });
  });

  it("after a team starts: no unassign, no delete, no mode change; a late student can still join", async () => {
    as(st[0]);
    await startOrResume(sid(0), teamAssignment);
    const one = await teamIdOf("1팀");
    as(owner);
    expect(await unassignStudentAction(undefined, form({ teamId: one, studentId: sid(1) }))).toMatchObject({ ok: false, code: "TEAM_STARTED" });
    expect(await deleteTeamAction(undefined, form({ teamId: one }))).toMatchObject({ ok: false, code: "TEAM_STARTED" });
    expect((await setPlayModeAction(undefined, form({ assignmentId: teamAssignment, mode: "individual" }))).ok).toBe(false);
    expect(await assignStudentAction(undefined, form({ teamId: one, studentId: sid(4) }))).toMatchObject({ ok: true });
    expect((await getTeamSetup(owner, teamAssignment)).teams.find((t) => t.teamId === one)).toMatchObject({ started: true, memberCount: 4 });
  });
});

describe("the in-class view", () => {
  it("has only the allowed fields: no counts, contribution, balance, letters, time per student or ids of students", async () => {
    as(owner);
    const r = await loadLiveViewAction({ puzzleId, assignmentId: teamAssignment });
    if (!r.ok) throw new Error(r.error);
    const v = r.data;
    expect(Object.keys(v).sort()).toEqual(["asOf", "mode", "session", "sessionBlocked", "students", "teams"]);
    for (const t of v.teams) {
      expect(Object.keys(t).sort()).toEqual(["blocked", "helpOpen", "label", "lastProgressAt", "members", "state", "teamId"]);
      for (const m of t.members) expect(Object.keys(m).sort()).toEqual(["displayName", "state", "studentNo"]);
      const nos = t.members.map((m) => m.studentNo);
      expect(nos).toEqual([...nos].sort((a, b) => a.localeCompare(b, "ko", { numeric: true })));
    }
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/filled|checks|reveals|chosung|wrong|credit|contribution|balance|cells|answer|clue|seconds|studentId/i);
    expect(v).toMatchObject({ mode: "team", session: "open" });
    const one = v.teams.find((t) => t.label === "1팀")!;
    expect(one.state).toBe("in_progress");
    expect(one.members.find((m) => m.displayName === "TT s1")?.state).toBe("in_progress");
    expect(one.members.find((m) => m.displayName === "TT s2")?.state).toBe("not_started");
    expect(v.teams.find((t) => t.label === "2팀")).toMatchObject({ state: "not_started", blocked: null, helpOpen: false });
  });

  it("the school admin reads the same view", async () => {
    as(schoolAdmin);
    expect((await loadLiveViewAction({ puzzleId, assignmentId: teamAssignment })).ok).toBe(true);
  });
});

describe("help resolution (limited direct read of the open call id)", () => {
  const openCalls = async (teamId: string) =>
    (await admin.from("crossword_team_help_requests").select("id").eq("team_id", teamId).is("resolved_at", null)).data ?? [];

  it("a student's call shows on the live view; the owner resolves it and never sees an id", async () => {
    as(st[0]);
    expect((await studentCall(helpPOST as Handler, "help", teamAssignment, {})).status).toBe(200);
    const one = await teamIdOf("1팀");
    as(owner);
    const live = await loadLiveViewAction({ puzzleId, assignmentId: teamAssignment });
    expect(live.ok && live.data.teams.find((t) => t.teamId === one)?.helpOpen).toBe(true);
    const r = await resolveTeamHelpAction(undefined, form({ assignmentId: teamAssignment, teamId: one }));
    expect(r).toEqual({ ok: true, data: { resolved: true } });
    expect(JSON.stringify(r)).not.toMatch(UUID);
    expect(await openCalls(one)).toHaveLength(0);
  });

  it("zero open calls is a no-op", async () => {
    const one = await teamIdOf("1팀");
    as(owner);
    expect(await resolveTeamHelpAction(undefined, form({ assignmentId: teamAssignment, teamId: one }))).toEqual({ ok: true, data: { resolved: false } });
  });

  it("more than one open call is a controlled error and nothing is changed", async () => {
    const two = await teamIdOf("2팀");
    await admin.from("crossword_team_help_requests").insert([{ team_id: two }, { team_id: two }]);
    as(owner);
    expect(await resolveTeamHelpAction(undefined, form({ assignmentId: teamAssignment, teamId: two }))).toMatchObject({ ok: false, code: "HELP_STATE_INVALID" });
    expect(await openCalls(two)).toHaveLength(2);
    await admin.from("crossword_team_help_requests").delete().eq("team_id", two);
  });

  it("the school admin and an unrelated teacher cannot resolve; a team of another assignment is not found", async () => {
    const two = await teamIdOf("2팀");
    await admin.from("crossword_team_help_requests").insert({ team_id: two });
    as(schoolAdmin);
    expect((await resolveTeamHelpAction(undefined, form({ assignmentId: teamAssignment, teamId: two }))).ok).toBe(false);
    as(outsider);
    expect(await resolveTeamHelpAction(undefined, form({ assignmentId: teamAssignment, teamId: two }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await openCalls(two)).toHaveLength(1);
    as(owner);
    await expect(resolveTeamHelp(owner, soloAssignment, two)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await admin.from("crossword_team_help_requests").delete().eq("team_id", two);
  });
});

describe("closing (existing assignment close, unchanged: Gate 3 compatibility decision OD-TP17)", () => {
  it("the school admin may close under the existing close contract", async () => {
    as(schoolAdmin);
    expect(await closeCrosswordAssignmentAction(undefined, form({ id: soloAssignment }))).toMatchObject({ ok: true });
  });

  it("the owner closes the team assignment: the live view says closed and student play becomes read-only", async () => {
    as(owner);
    expect(await closeCrosswordAssignmentAction(undefined, form({ id: teamAssignment }))).toMatchObject({ ok: true });
    const live = await loadLiveViewAction({ puzzleId, assignmentId: teamAssignment });
    expect(live.ok && live.data.session).toBe("closed");
    // a member who already played resumes read-only, and saving is refused
    as(st[0]);
    const p = await startOrResume(sid(0), teamAssignment);
    expect(p.readonly).toBe(true);
    const save = await studentCall(savePOST as Handler, "save", teamAssignment, { patch: {}, activeMs: 0 });
    expect(save.status).toBe(409);
    // a member who never opened it cannot start any more (the existing contract: closed without an attempt)
    as(st[1]);
    await expect(startOrResume(sid(1), teamAssignment)).rejects.toMatchObject({ code: "CLOSED" });
  });
});
