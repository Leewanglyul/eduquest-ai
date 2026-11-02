import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// M2-3.4 P3 checkpoint: the REAL output of the P2 functions on the LOCAL stack, and the allow-listed shapes the student
// routes build from it. Key names are asserted on the raw RPC result (not on TypeScript types): camelCase JSON from
// fn_crossword_team_state / fn_crossword_team_help_request, snake_case columns from fn_crossword_play_list /
// fn_crossword_play_access. The routes are called directly with real Request objects; only the identity lookup is
// mocked, as in the other access tests.
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

import { GET as stateGET } from "@/app/student/crosswords/[assignmentId]/api/state/route";
import { POST as savePOST } from "@/app/student/crosswords/[assignmentId]/api/save/route";
import { GET as teamStateGET } from "@/app/student/crosswords/[assignmentId]/api/team-state/route";
import { POST as helpPOST } from "@/app/student/crosswords/[assignmentId]/api/help/route";
import { callPlay } from "@/components/student/play-api";
import { generateCrosswordAction, publishCrosswordAction, saveCrosswordDraftAction } from "@/features/crossword/review/actions";
import type { PreviewSuccess } from "@/features/crossword/review/service";
import { NORMALIZER_VERSION } from "@/features/content/import/content-schemas";
import { listPlayable, startOrResume } from "@/features/crossword/play/service";
import type { PlayPayload } from "@/features/crossword/play/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = `TC${Date.now().toString(36)}`.toUpperCase();
const PASSWORD = "Tmp#pass12345";
const admin = createSupabaseAdminClient();
const startedAt = new Date().toISOString();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const mk = (id: string, role: Role, name: string): SessionProfile => ({ id, school_id: SCHOOL, role, display_name: name, status: "active" });
const teacher = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const s1 = mk("00000000-0000-4000-8000-00000000009a", "student", "TC s1");
const s2 = mk("00000000-0000-4000-8000-00000000009b", "student", "TC s2");
const s3 = mk("00000000-0000-4000-8000-00000000009c", "student", "TC s3 waiting");
const students = [s1, s2, s3];
const as = (p: SessionProfile | null) => { session.profile = p; };
const form = (payload: unknown) => { const f = new FormData(); f.set("payload", JSON.stringify(payload)); return f; };
const CHAIN = ["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관", "관심", "심장", "장미", "미술", "술래", "내일", "일요일", "요리"];
const title = (l: string) => `${RUN}-${l}`;

let room: string;
let setId: string;
const studentRow: Record<string, string> = {};
let teamAssignment: string;
let soloAssignment: string;
let teamId: string;

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

async function publish(label: string): Promise<string> {
  as(teacher);
  const gen = await generateCrosswordAction(undefined, form({ setId, level: "normal" }));
  if (!gen.ok || !gen.data.ok) throw new Error("generate failed");
  const p = gen.data as PreviewSuccess;
  const saved = await saveCrosswordDraftAction(undefined, form({ setId, level: "normal", seed: p.seed, ticketId: p.ticket.ticketId, ticketToken: p.ticket.ticketToken, title: title(label) }));
  if (!saved.ok) throw new Error("save failed");
  const pub = await publishCrosswordAction(undefined, form({ puzzleId: saved.data.puzzleId, classroomIds: [room] }));
  if (!pub.ok) throw new Error("publish failed");
  const { data: a } = await admin.from("crossword_assignments").select("id").eq("puzzle_id", saved.data.puzzleId).eq("classroom_id", room).single();
  return a!.id;
}

const teacherRpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await admin.rpc(fn as never, { p_actor_id: teacher.id, p_school_id: SCHOOL, ...args } as never);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as unknown;
};

beforeAll(async () => {
  for (const u of [teacher, ...students]) await ensureUser(u);
  for (const [i, s] of students.entries()) await makeStudent(s, i + 1);
  const { data: c, error } = await admin.from("classrooms").insert({ school_id: SCHOOL, owner_id: teacher.id, name: title("반") }).select("id").single();
  if (error || !c) throw error;
  room = c.id;
  await admin.from("classroom_enrollments").insert(students.map((s) => ({ classroom_id: room, student_id: studentRow[s.id] })));
  const { data: set, error: e2 } = await admin.from("content_sets").insert({ school_id: SCHOOL, owner_id: teacher.id, classroom_id: room, title: title("set") }).select("id").single();
  if (e2 || !set) throw e2;
  setId = set.id;
  await admin.from("content_entries").insert(
    CHAIN.map((w, i) => ({ set_id: setId, position: i + 1, term: w, definition: `${w.length}글자 낱말 ${i + 1}`, answer: w, script: "hangul" as const, normalizer_version: NORMALIZER_VERSION })),
  );
  teamAssignment = await publish("team");
  soloAssignment = await publish("solo");
  await teacherRpc("fn_set_crossword_assignment_mode", { p_assignment_id: teamAssignment, p_mode: "team" });
  const created = (await teacherRpc("fn_crossword_team_create", { p_assignment_id: teamAssignment, p_label: "1팀" })) as { teamId: string };
  teamId = created.teamId;
  for (const s of [s1, s2]) await teacherRpc("fn_crossword_team_assign", { p_team_id: teamId, p_student_id: studentRow[s.id] });
}, 120_000);

afterEach(() => {
  delete process.env.COLLAB_PLAY_ENABLED;
});

afterAll(async () => {
  await admin.from("crossword_puzzles").delete().eq("owner_id", teacher.id).gte("created_at", startedAt);
  await admin.from("crossword_preview_tickets").delete().eq("actor_id", teacher.id);
  await admin.from("content_sets").delete().ilike("title", `${RUN}%`);
  if (room) await admin.from("classrooms").delete().eq("id", room);
  for (const id of Object.values(studentRow)) await admin.from("students").delete().eq("id", id);
});

type Handler = (request: Request, context: { params: Promise<{ assignmentId: string }> }) => Promise<Response>;

async function call(handler: Handler, path: string, assignmentId: string, body?: unknown) {
  const isGet = body === undefined;
  const req = new Request(`http://localhost/student/crosswords/${assignmentId}/api/${path}`, {
    method: isGet ? "GET" : "POST",
    headers: { "sec-fetch-site": "same-origin", ...(isGet ? {} : { "content-type": "application/json" }) },
    body: isGet ? undefined : JSON.stringify(body),
  });
  const res = await handler(req, { params: Promise.resolve({ assignmentId }) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, text, json };
}

const attemptOf = async (studentId: string, assignmentId: string) => {
  const { data } = await admin.from("crossword_attempt_members").select("attempt_id").eq("assignment_id", assignmentId).eq("student_id", studentId).single();
  return data!.attempt_id as string;
};

// ---------------------------------------------------------------------------------------------------------------

describe("raw RPC contracts (local stack, not TypeScript)", () => {
  it("fn_crossword_play_access returns snake_case columns ok, reason, puzzle_id, readonly, save_allowed", async () => {
    const { data, error } = await admin.rpc("fn_crossword_play_access", { p_student_id: studentRow[s1.id], p_assignment_id: teamAssignment });
    expect(error).toBeNull();
    expect(Object.keys((data as object[])[0]).sort()).toEqual(["ok", "puzzle_id", "readonly", "reason", "save_allowed"]);
  });

  it("fn_crossword_play_list returns snake_case columns including play_mode and team_waiting", async () => {
    const { data, error } = await admin.rpc("fn_crossword_play_list", { p_student_id: studentRow[s3.id] });
    expect(error).toBeNull();
    const rows = data as Record<string, unknown>[];
    const team = rows.find((r) => r.assignment_id === teamAssignment)!;
    expect(Object.keys(team).sort()).toEqual([
      "assignment_id", "attempt_id", "attempt_status", "classroom_id", "classroom_name", "closes_at", "filled_count", "level",
      "play_mode", "puzzle_id", "readonly", "team_waiting", "title", "total_cells", "word_count",
    ]);
    expect(team).toMatchObject({ play_mode: "team", team_waiting: true });
    expect(rows.find((r) => r.assignment_id === soloAssignment)).toMatchObject({ play_mode: "individual", team_waiting: false });
  });

  it("fn_crossword_team_state returns camelCase keys: helpOpen, otherKeys, used.wrongSubmits", async () => {
    as(s1);
    await startOrResume(studentRow[s1.id], teamAssignment);
    const attempt = await attemptOf(studentRow[s1.id], teamAssignment);
    const full = await admin.rpc("fn_crossword_team_state", { p_student_id: studentRow[s1.id], p_attempt_id: attempt, p_known_revision: null as unknown as number });
    expect(full.error).toBeNull();
    const raw = full.data as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(["cells", "changed", "given", "helpOpen", "otherKeys", "revision", "status", "used"]);
    expect(Object.keys(raw.used as object).sort()).toEqual(["checks", "chosung", "reveals", "wrongSubmits"]);
    expect(raw).not.toHaveProperty("help_open");
    expect(raw).not.toHaveProperty("other_keys");

    const same = await admin.rpc("fn_crossword_team_state", { p_student_id: studentRow[s1.id], p_attempt_id: attempt, p_known_revision: Number(raw.revision) });
    expect(Object.keys(same.data as object).sort()).toEqual(["changed", "helpOpen", "revision", "status", "used"]);
  });

  it("fn_crossword_team_help_request returns camelCase open, created, createdAt", async () => {
    const attempt = await attemptOf(studentRow[s1.id], teamAssignment);
    const { data, error } = await admin.rpc("fn_crossword_team_help_request", { p_student_id: studentRow[s1.id], p_attempt_id: attempt });
    expect(error).toBeNull();
    expect(Object.keys(data as object).sort()).toEqual(["created", "createdAt", "open"]);
    expect(data).not.toHaveProperty("created_at");
    // resolve it again so the route tests below start from a clean state
    const { data: open } = await admin.from("crossword_team_help_requests").select("id").eq("team_id", teamId).is("resolved_at", null);
    for (const r of open ?? []) await teacherRpc("fn_crossword_team_help_resolve", { p_request_id: r.id });
    await admin.from("crossword_team_help_requests").delete().eq("team_id", teamId);
  });
});

describe("student routes: allow-listed shapes", () => {
  it("the team payload adds only `team` (label and member count) to the individual shape", async () => {
    as(s2);
    // the entry page opens the puzzle first (joins the team's one attempt); the state route resumes it
    await startOrResume(studentRow[s2.id], teamAssignment);
    expect(await attemptOf(studentRow[s2.id], teamAssignment)).toBe(await attemptOf(studentRow[s1.id], teamAssignment));
    const p = (await call(stateGET as Handler, "state", teamAssignment)).json as unknown as PlayPayload;
    expect(Object.keys(p).sort()).toEqual(["assignmentId", "attempt", "cells", "closesAt", "given", "limits", "puzzle", "readonly", "team", "v"]);
    expect(p.team).toEqual({ label: "1팀", memberCount: 2 });
  });

  it("an individual payload is exactly as before: no team key", async () => {
    as(s1);
    await startOrResume(studentRow[s1.id], soloAssignment);
    const p = (await call(stateGET as Handler, "state", soloAssignment)).json;
    expect(Object.keys(p).sort()).toEqual(["assignmentId", "attempt", "cells", "closesAt", "given", "limits", "puzzle", "readonly", "v"]);
  });

  it("list rows: a team row carries team.waiting; an individual row keeps its exact keys", async () => {
    const rows3 = await listPlayable(studentRow[s3.id]);
    expect(rows3.find((r) => r.assignmentId === teamAssignment)?.team).toEqual({ waiting: true });
    const rows1 = await listPlayable(studentRow[s1.id]);
    expect(rows1.find((r) => r.assignmentId === teamAssignment)?.team).toEqual({ waiting: false });
    expect(rows1.find((r) => r.assignmentId === soloAssignment)).not.toHaveProperty("team");
  });

  it("a team member without a team cannot start: NO_TEAM", async () => {
    await expect(startOrResume(studentRow[s3.id], teamAssignment)).rejects.toMatchObject({ code: "NO_TEAM" });
  });

  it("team-state: conditional fields, no uuid and no student data anywhere; a teammate's cell shows in otherKeys", async () => {
    as(s2);
    const p = (await call(stateGET as Handler, "state", teamAssignment)).json as unknown as PlayPayload;
    const word = p.puzzle.words[0];
    const key = `${word.row},${word.col}`;
    const saved = await call(savePOST as Handler, "save", teamAssignment, { patch: { [key]: "가" }, activeMs: 0 });
    expect(saved.status).toBe(200);

    as(s1);
    const full = await call(teamStateGET as Handler, "team-state", teamAssignment);
    expect(full.status).toBe(200);
    expect(Object.keys(full.json).sort()).toEqual(["cells", "changed", "given", "helpOpen", "otherKeys", "revision", "status", "used"]);
    expect(full.json.otherKeys).toContain(key);
    expect(full.text).not.toMatch(UUID);
    expect(full.text).not.toMatch(/student|name|display|writer|credit/i);

    const same = await call(teamStateGET as Handler, `team-state?known=${full.json.revision}`, teamAssignment);
    expect(Object.keys(same.json).sort()).toEqual(["changed", "helpOpen", "revision", "status", "used"]);
    expect(same.json.changed).toBe(false);

    const bad = await call(teamStateGET as Handler, "team-state?known=abc", teamAssignment);
    expect(bad.status).toBe(400);
  });

  it("help: exact keys, one open call per team, and the cooldown seconds survive to the client", async () => {
    as(s1);
    const first = await call(helpPOST as Handler, "help", teamAssignment, {});
    expect(first.status).toBe(200);
    expect(Object.keys(first.json).sort()).toEqual(["created", "createdAt", "open"]);
    expect(first.json).toMatchObject({ open: true, created: true });
    expect(first.text).not.toMatch(UUID);
    as(s2);
    const second = await call(helpPOST as Handler, "help", teamAssignment, {});
    expect(second.json).toMatchObject({ open: true, created: false });
    expect((await call(teamStateGET as Handler, "team-state", teamAssignment)).json.helpOpen).toBe(true);

    const extra = await call(helpPOST as Handler, "help", teamAssignment, { who: "me" });
    expect(extra.status).toBe(400);

    const { data: open } = await admin.from("crossword_team_help_requests").select("id").eq("team_id", teamId).is("resolved_at", null);
    for (const r of open ?? []) await teacherRpc("fn_crossword_team_help_resolve", { p_request_id: r.id });
    const cooling = await call(helpPOST as Handler, "help", teamAssignment, {});
    expect(cooling.status).toBe(429);
    expect(cooling.json.error).toBe("HELP_COOLDOWN");
    expect(cooling.json.retryAfterSeconds).toEqual(expect.any(Number));
    expect(cooling.json.retryAfterSeconds as number).toBeGreaterThan(0);
    expect(cooling.json.retryAfterSeconds as number).toBeLessThanOrEqual(60);
    expect(cooling.json.message).toMatch(/\d+초/);
  });
});

describe("completion while a teammate is typing (K-9)", () => {
  it("after one member submits the solved grid, a teammate's save is refused as READONLY and team-state reports completion", async () => {
    const { data: a } = await admin.from("crossword_assignments").select("puzzle_id").eq("id", teamAssignment).single();
    const { data: words } = await admin.from("crossword_words").select("row, col, direction, answer").eq("puzzle_id", a!.puzzle_id);
    const key: Record<string, string> = {};
    for (const w of words ?? []) {
      Array.from(w.answer as string).forEach((ch, k) => {
        key[`${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`] = ch;
      });
    }
    as(s1);
    const p = (await call(stateGET as Handler, "state", teamAssignment)).json as unknown as PlayPayload;
    const patch = Object.fromEntries(Object.entries(key).filter(([k]) => p.given[k] === undefined));
    const saved = await call(savePOST as Handler, "save", teamAssignment, { patch, activeMs: 0 });
    expect(saved.status).toBe(200);
    const done = await call(
      (await import("@/app/student/crosswords/[assignmentId]/api/submit/route")).POST as Handler,
      "submit", teamAssignment, { baseRevision: Number(saved.json.revision) },
    );
    expect(done.json).toMatchObject({ result: "completed", justCompleted: true });

    as(s2);
    const late = await call(savePOST as Handler, "save", teamAssignment, { patch: { [Object.keys(key)[0]]: "가" }, activeMs: 0 });
    expect(late.status).toBe(409);
    expect(late.json.error).toBe("READONLY");
    const ts = await call(teamStateGET as Handler, "team-state", teamAssignment);
    expect(ts.json.status).toBe("completed");
    expect(Object.keys(ts.json.participation as object).sort()).toEqual(["all", "me"]);
  });
});

describe("collab switch off: team-mode assignments do not exist for students", () => {
  it("team routes 404 before any session work; the list drops the team row; start and save refuse", async () => {
    process.env.COLLAB_PLAY_ENABLED = "false";
    as(s1);
    expect((await call(teamStateGET as Handler, "team-state", teamAssignment)).status).toBe(404);
    expect((await call(helpPOST as Handler, "help", teamAssignment, {})).status).toBe(404);
    const rows = await listPlayable(studentRow[s1.id]);
    expect(rows.some((r) => r.assignmentId === teamAssignment)).toBe(false);
    expect(rows.some((r) => r.assignmentId === soloAssignment)).toBe(true);
    await expect(startOrResume(studentRow[s1.id], teamAssignment)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await call(stateGET as Handler, "state", teamAssignment)).status).toBe(404);
    expect((await call(savePOST as Handler, "save", teamAssignment, { patch: {}, activeMs: 0 })).status).toBe(404);
    // the individual assignment is unaffected
    expect((await call(stateGET as Handler, "state", soloAssignment)).status).toBe(200);
  });
});

describe("browser client keeps the server's remaining seconds", () => {
  it("callPlay returns retryAfterSeconds of a 429 as `seconds`", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "HELP_COOLDOWN", retryAfterSeconds: 42, message: "x" }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await callPlay("a", "help", {});
      expect(r).toEqual({ ok: false, kind: "rejected", code: "HELP_COOLDOWN", status: 429, seconds: 42 });
      await callPlay("a", "team-state", undefined, { known: 7 });
      expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe("/student/crosswords/a/api/team-state?known=7");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
