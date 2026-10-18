import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// M2-2.4a F3: the student play stack end to end against the LOCAL Supabase stack: teacher publishes -> student lists,
// opens, types (autosave patches), resumes from a second client, checks, reveals, asks for 초성, submits -> completed.
// The route HANDLERS are called directly with real Request objects, so the headers, the same-origin rule, the strict
// bodies and the error mapping are exercised too. Only the identity lookup is mocked, as in the other access tests.
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

import { POST as chosungPOST } from "@/app/student/crosswords/[assignmentId]/api/chosung/route";
import { POST as checkPOST } from "@/app/student/crosswords/[assignmentId]/api/check/route";
import { POST as revealPOST } from "@/app/student/crosswords/[assignmentId]/api/reveal/route";
import { POST as savePOST } from "@/app/student/crosswords/[assignmentId]/api/save/route";
import { GET as stateGET } from "@/app/student/crosswords/[assignmentId]/api/state/route";
import { POST as submitPOST } from "@/app/student/crosswords/[assignmentId]/api/submit/route";
import { generateCrosswordAction, publishCrosswordAction, saveCrosswordDraftAction } from "@/features/crossword/review/actions";
import type { PreviewSuccess } from "@/features/crossword/review/service";
import { NORMALIZER_VERSION } from "@/features/content/import/content-schemas";
import { getStudentIdForProfile } from "@/features/crossword/play/access";
import { PlayError } from "@/features/crossword/play/errors";
import { PLAY_ERROR_MESSAGES } from "@/features/crossword/play/messages";
import { BODY_KEYS } from "@/features/crossword/play/schemas";
import { listPlayable, startOrResume } from "@/features/crossword/play/service";
import type { PlayPayload } from "@/features/crossword/play/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = `P${Date.now().toString(36)}`.toUpperCase();
const PASSWORD = "Tmp#pass12345";
const admin = createSupabaseAdminClient();
const startedAt = new Date().toISOString();

const mk = (id: string, role: Role, name: string): SessionProfile => ({ id, school_id: SCHOOL, role, display_name: name, status: "active" });
const teacher = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const stu1 = mk("00000000-0000-4000-8000-0000000000f1", "student", "PL s1");
const stu2 = mk("00000000-0000-4000-8000-0000000000f2", "student", "PL s2");
const stu3 = mk("00000000-0000-4000-8000-0000000000f3", "student", "PL s3 outsider");
const students = [stu1, stu2, stu3];
const as = (p: SessionProfile | null) => { session.profile = p; };
const form = (payload: unknown) => { const f = new FormData(); f.set("payload", JSON.stringify(payload)); return f; };

const CHAIN = ["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관", "관심", "심장", "장미", "미술", "술래", "내일", "일요일", "요리"];
const title = (l: string) => `${RUN}-${l}`;

let room: string;
let setId: string;
const studentRow: Record<string, string> = {};
const classroomIds: string[] = [];

async function ensureUser(p: SessionProfile) {
  const existing = await admin.auth.admin.getUserById(p.id);
  if (!existing.data?.user) {
    const { error } = await admin.auth.admin.createUser({ id: p.id, email: `${p.id}@access.invalid`, password: PASSWORD, email_confirm: true });
    if (error && !/already|exists|registered/i.test(error.message)) throw error;
  }
  await admin.from("profiles").upsert({ id: p.id, school_id: p.school_id, role: p.role, display_name: p.display_name, status: "active" });
}

async function makeStudent(p: SessionProfile, n: number) {
  const { data, error } = await admin
    .from("students")
    .insert({ school_id: SCHOOL, profile_id: p.id, student_no: `${RUN}-${n}`, grade: "1" })
    .select("id")
    .single();
  if (error || !data) throw error;
  const { error: e2 } = await admin.from("student_accounts").insert({
    student_id: data.id, username: `${RUN.toLowerCase()}-${n}`, synthetic_email: `${RUN.toLowerCase()}-${n}@students.invalid`, must_change_password: false,
  });
  if (e2) throw e2;
  studentRow[p.id] = data.id;
}

/** Teacher side: generate, save, publish a puzzle of this level to `room`. Returns ids and the key (test side only). */
async function publishPuzzle(level: "easy" | "normal" | "hard", label: string) {
  as(teacher);
  const gen = await generateCrosswordAction(undefined, form({ setId, level }));
  if (!gen.ok || !gen.data.ok) throw new Error("generate failed " + JSON.stringify(gen));
  const p = gen.data as PreviewSuccess;
  const saved = await saveCrosswordDraftAction(undefined, form({ setId, level, seed: p.seed, ticketId: p.ticket.ticketId, ticketToken: p.ticket.ticketToken, title: title(label) }));
  if (!saved.ok) throw new Error("save failed " + JSON.stringify(saved));
  const pub = await publishCrosswordAction(undefined, form({ puzzleId: saved.data.puzzleId, classroomIds: [room] }));
  if (!pub.ok) throw new Error("publish failed " + JSON.stringify(pub));
  const { data: a } = await admin.from("crossword_assignments").select("id").eq("puzzle_id", saved.data.puzzleId).eq("classroom_id", room).single();
  const { data: words } = await admin.from("crossword_words").select("number, direction, row, col, answer").eq("puzzle_id", saved.data.puzzleId);
  const key: Record<string, string> = {};
  for (const w of words ?? []) {
    Array.from(w.answer).forEach((ch, k) => {
      key[`${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`] = ch;
    });
  }
  return { puzzleId: saved.data.puzzleId, assignmentId: a!.id, key, answers: (words ?? []).map((w) => w.answer), words: words ?? [] };
}

type Puzzle = Awaited<ReturnType<typeof publishPuzzle>>;
let normal: Puzzle;
let hard: Puzzle;

beforeAll(async () => {
  for (const u of [teacher, ...students]) await ensureUser(u);
  for (const [i, s] of students.entries()) await makeStudent(s, i + 1);
  const { data: c, error } = await admin.from("classrooms").insert({ school_id: SCHOOL, owner_id: teacher.id, name: title("반") }).select("id").single();
  if (error || !c) throw error;
  room = c.id;
  classroomIds.push(room);
  await admin.from("classroom_enrollments").insert([
    { classroom_id: room, student_id: studentRow[stu1.id] },
    { classroom_id: room, student_id: studentRow[stu2.id] },
  ]);
  const { data: set, error: e2 } = await admin.from("content_sets").insert({ school_id: SCHOOL, owner_id: teacher.id, classroom_id: room, title: title("set") }).select("id").single();
  if (e2 || !set) throw e2;
  setId = set.id;
  await admin.from("content_entries").insert(
    CHAIN.map((w, i) => ({ set_id: setId, position: i + 1, term: w, definition: `${w.length}글자 낱말 ${i + 1}`, answer: w, script: "hangul" as const, normalizer_version: NORMALIZER_VERSION })),
  );
  normal = await publishPuzzle("normal", "normal");
  hard = await publishPuzzle("hard", "hard");
}, 120_000);

afterAll(async () => {
  await admin.from("crossword_puzzles").delete().eq("owner_id", teacher.id).gte("created_at", startedAt);
  await admin.from("crossword_preview_tickets").delete().eq("actor_id", teacher.id);
  await admin.from("content_sets").delete().ilike("title", `${RUN}%`);
  if (classroomIds.length) await admin.from("classrooms").delete().in("id", classroomIds);
  for (const id of Object.values(studentRow)) await admin.from("students").delete().eq("id", id);
});

// ---- helpers --------------------------------------------------------------------------------------------------

type Handler = (request: Request, context: { params: Promise<{ assignmentId: string }> }) => Promise<Response>;
const HANDLERS: Record<string, Handler> = { state: stateGET, save: savePOST, check: checkPOST, reveal: revealPOST, chosung: chosungPOST, submit: submitPOST };

async function call(name: keyof typeof HANDLERS, assignmentId: string, body?: unknown, headers: Record<string, string> = {}, method?: string) {
  const isGet = name === "state";
  const req = new Request(`http://localhost/student/crosswords/${assignmentId}/api/${name}`, {
    method: method ?? (isGet ? "GET" : "POST"),
    headers: { "sec-fetch-site": "same-origin", ...(isGet ? {} : { "content-type": "application/json" }), ...headers },
    body: isGet || method === "GET" ? undefined : JSON.stringify(body),
  });
  const res = await HANDLERS[name](req, { params: Promise.resolve({ assignmentId }) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, headers: res.headers, text, json };
}

const stateOf = async (aid: string) => (await call("state", aid)).json as unknown as PlayPayload;

const keysDeep = (v: unknown, acc: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { acc.push(k); keysDeep(x, acc); }
  return acc;
};

const wrongCharFor = (right: string) => (right === "힣" ? "가" : "힣");

// ---- tests ----------------------------------------------------------------------------------------------------

describe("list, open, resume", () => {
  it("the published puzzle is listed as new for an enrolled student and not for an outsider", async () => {
    as(stu1);
    const list = await listPlayable(studentRow[stu1.id]);
    const row = list.find((r) => r.assignmentId === normal.assignmentId)!;
    expect(row).toMatchObject({ title: title("normal"), level: "normal", attemptId: null, readonly: false });
    expect(row.wordCount).toBe(normal.words.length);
    expect(list.some((r) => r.assignmentId === hard.assignmentId)).toBe(true);
    expect(await listPlayable(studentRow[stu3.id])).toEqual([]);
  });

  it("opening creates the attempt once and a second client resumes the same one", async () => {
    as(stu1);
    const a = await startOrResume(studentRow[stu1.id], normal.assignmentId);
    const b = await startOrResume(studentRow[stu1.id], normal.assignmentId);
    expect(b.attempt.revision).toBe(a.attempt.revision);
    expect(b.given).toEqual(a.given);
    const { count } = await admin.from("crossword_attempt_members").select("*", { count: "exact", head: true }).eq("assignment_id", normal.assignmentId).eq("student_id", studentRow[stu1.id]);
    expect(count).toBe(1);
    expect(Object.keys(a.given).length).toBeLessThanOrEqual(Math.round(0.1 * Object.keys(normal.key).length) + 1);
  });

  it("the payload has an allow-listed shape and never the key", async () => {
    as(stu1);
    const p = await startOrResume(studentRow[stu1.id], normal.assignmentId);
    expect(Object.keys(p).sort()).toEqual(["assignmentId", "attempt", "cells", "closesAt", "given", "limits", "puzzle", "readonly", "v"]);
    expect(Object.keys(p.puzzle).sort()).toEqual(["cols", "rows", "title", "words"]);
    for (const w of p.puzzle.words) expect(Object.keys(w).sort()).toEqual(["clue", "col", "direction", "length", "number", "row", "single"]);
    const text = JSON.stringify(p);
    const keys = keysDeep(p).join(" ");
    expect(keys).not.toMatch(/answer|solution|secret/i);
    for (const answer of normal.answers.filter((a) => Array.from(a).length >= 2)) expect(text).not.toContain(answer);
    // the only letters are the ones the student was given
    for (const [k, ch] of Object.entries(p.given)) expect(normal.key[k]).toBe(ch);
    expect(text.length).toBeLessThan(20_000);
  });

  it("the state handler returns the same payload", async () => {
    as(stu1);
    const r = await call("state", normal.assignmentId);
    expect(r.status).toBe(200);
    expect((r.json as unknown as PlayPayload).limits).toEqual({ checkMode: "onRequest", checksAllowed: 5, checksRemaining: 5, revealsAllowed: 2, revealsRemaining: 2, chosungAllowed: true });
  });
});

describe("save, resume, merge", () => {
  it("saves a patch, a second client sees it, saves merge and never overwrite", async () => {
    as(stu1);
    const p = await stateOf(normal.assignmentId);
    const open = Object.keys(normal.key).filter((k) => !p.given[k]);
    const [k1, k2, k3] = open;
    const s1 = await call("save", normal.assignmentId, { patch: { [k1]: normal.key[k1] }, activeMs: 0 });
    expect(s1.status).toBe(200);
    expect(Object.keys(s1.json).sort()).toEqual(["filled", "revision"]);
    // two devices at once
    const [r2, r3] = await Promise.all([
      call("save", normal.assignmentId, { patch: { [k2]: normal.key[k2] }, activeMs: 0 }),
      call("save", normal.assignmentId, { patch: { [k3]: normal.key[k3] }, activeMs: 0 }),
    ]);
    expect([r2.status, r3.status]).toEqual([200, 200]);
    const after = await stateOf(normal.assignmentId);
    expect(after.cells).toMatchObject({ [k1]: normal.key[k1], [k2]: normal.key[k2], [k3]: normal.key[k3] });
    expect(after.attempt.revision).toBe(p.attempt.revision + 3);
  });

  it("refuses bad cells and characters and changes nothing", async () => {
    as(stu1);
    const before = await stateOf(normal.assignmentId);
    const open = Object.keys(normal.key).filter((k) => !before.given[k]);
    for (const [patch, error] of [
      [{ "9,9": "사" }, "BAD_CELL"],
      [{ [open[0]]: "ㅅ" }, "BAD_CHAR"],
      [{ [open[0]]: "a" }, "BAD_CHAR"],
      [{ [open[0]]: "사과" }, "BAD_CHAR"],
      [{ [Object.keys(before.given)[0] ?? "x"]: "가" }, Object.keys(before.given).length ? "LOCKED_CELL" : "BAD_REQUEST"],
    ] as [Record<string, string>, string][]) {
      const r = await call("save", normal.assignmentId, { patch, activeMs: 0 });
      expect(r.json.error, JSON.stringify(patch)).toBe(error);
    }
    expect((await stateOf(normal.assignmentId)).cells).toEqual(before.cells);
  });

  it("a second student's save only ever touches that student's own attempt", async () => {
    as(stu2);
    await startOrResume(studentRow[stu2.id], normal.assignmentId);
    const one = Object.keys(normal.key)[0];
    const r = await call("save", normal.assignmentId, { patch: { [one]: wrongCharFor(normal.key[one]) }, activeMs: 0 });
    // may be locked for s2 if the prefill chose it: either way s1 is untouched
    expect([200, 409]).toContain(r.status);
    as(stu1);
    const s1 = await stateOf(normal.assignmentId);
    expect(Object.values(s1.cells)).not.toContain(wrongCharFor(normal.key[one]));
  });
});

describe("check, reveal, 초성, submit", () => {
  it("normal: word checks only, statuses only, counted, with a limit of 5", async () => {
    as(stu1);
    const p = await stateOf(normal.assignmentId);
    const w = normal.words.find((x) => Array.from(x.answer).length >= 2)!;
    const keys = Array.from(w.answer).map((_, k) => `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`);
    const rev = p.attempt.revision;
    const bad = await call("check", normal.assignmentId, { scope: "cell", keys: [keys[0]], baseRevision: rev });
    expect(bad.json.error).toBe("CHECK_NOT_ALLOWED");
    const ok = await call("check", normal.assignmentId, { scope: "word", keys, baseRevision: rev });
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.json).sort()).toEqual(["checksRemaining", "checksUsed", "results"]);
    const results = ok.json.results as { key: string; status: string }[];
    expect(results.map((r) => r.key).sort()).toEqual([...keys].sort());
    for (const r of results) expect(["ok", "wrong", "empty"]).toContain(r.status);
    expect(ok.text).not.toMatch(/[가-힣]/); // not a single letter comes back
    expect(ok.json.checksRemaining).toBe(4);
    const stale = await call("check", normal.assignmentId, { scope: "word", keys, baseRevision: rev + 100 });
    expect(stale.json.error).toBe("STALE");
    let last = ok;
    for (let i = 0; i < 4; i++) last = await call("check", normal.assignmentId, { scope: "word", keys, baseRevision: rev });
    expect(last.json.checksRemaining).toBe(0);
    const over = await call("check", normal.assignmentId, { scope: "word", keys, baseRevision: rev });
    expect(over.json.error).toBe("CHECK_LIMIT");
    expect(over.status).toBe(403);
  });

  it("a reveal returns one letter, spends one, and 10 parallel reveals at one revision give exactly one success", async () => {
    as(stu2);
    const p = await stateOf(normal.assignmentId);
    const open = Object.keys(normal.key).filter((k) => !p.given[k] && !p.cells[k]);
    const rev = p.attempt.revision;
    const results = await Promise.all(open.slice(0, 10).concat(open.slice(0, 10)).slice(0, 10).map((k) => call("reveal", normal.assignmentId, { key: k, baseRevision: rev })));
    const wins = results.filter((r) => r.status === 200);
    expect(wins).toHaveLength(1);
    expect(results.filter((r) => r.status !== 200).every((r) => r.json.error === "STALE")).toBe(true);
    const win = wins[0].json as { key: string; char: string; revealsRemaining: number };
    expect(win.char).toBe(normal.key[win.key]);
    expect(win.revealsRemaining).toBe(1);
    const after = await stateOf(normal.assignmentId);
    expect(after.given[win.key]).toBe(win.char);
    expect(after.limits.revealsRemaining).toBe(1);
    // the second (last) reveal, then over the limit
    const next = open.find((k) => k !== win.key)!;
    const second = await call("reveal", normal.assignmentId, { key: next, baseRevision: after.attempt.revision });
    expect(second.status).toBe(200);
    const again = open.find((k) => k !== win.key && k !== next)!;
    const third = await call("reveal", normal.assignmentId, { key: again, baseRevision: (await stateOf(normal.assignmentId)).attempt.revision });
    expect(third.json.error).toBe("REVEAL_LIMIT");
  });

  it("a reveal never says whether the cell was already right", async () => {
    as(stu1);
    const p = await stateOf(normal.assignmentId);
    const typedRight = Object.keys(p.cells).find((k) => p.cells[k] === normal.key[k] && !p.given[k]);
    expect(typedRight).toBeDefined();
    const r = await call("reveal", normal.assignmentId, { key: typedRight!, baseRevision: p.attempt.revision });
    expect(r.status).toBe(200);
    expect(r.json.char).toBe(normal.key[typedRight!]);
  });

  it("초성 returns consonants only and is counted", async () => {
    as(stu1);
    const w = normal.words.find((x) => /^[가-힣]+$/.test(x.answer))!;
    const r = await call("chosung", normal.assignmentId, { number: w.number, direction: w.direction });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json)).toEqual(["chosung"]);
    expect(r.json.chosung).toMatch(/^[ㄱ-ㅎ]+$/);
    expect(Array.from(r.json.chosung as string)).toHaveLength(Array.from(w.answer).length);
  });

  it("submit: incomplete, then wrong (with a count), then completed once", async () => {
    as(stu1);
    let p = await stateOf(normal.assignmentId);
    const everyKey = Object.keys(normal.key);
    const incomplete = await call("submit", normal.assignmentId, { baseRevision: p.attempt.revision });
    expect(incomplete.json.result).toBe("incomplete");
    const open = everyKey.filter((k) => !p.given[k]);
    const first = open[0];
    const patch = Object.fromEntries(open.map((k) => [k, k === first ? wrongCharFor(normal.key[k]) : normal.key[k]]));
    // revealed cells are locked: only send cells that are not
    const unlocked = Object.fromEntries(Object.entries(patch).filter(([k]) => !p.given[k]));
    expect((await call("save", normal.assignmentId, { patch: unlocked, activeMs: 0 })).status).toBe(200);
    p = await stateOf(normal.assignmentId);
    const wrong = await call("submit", normal.assignmentId, { baseRevision: p.attempt.revision });
    expect(wrong.json).toEqual({ result: "wrong", wrongCells: p.given[first] ? 0 : 1 });
    await call("save", normal.assignmentId, { patch: { [first]: normal.key[first] }, activeMs: 0 });
    p = await stateOf(normal.assignmentId);
    const done = await call("submit", normal.assignmentId, { baseRevision: p.attempt.revision });
    expect(done.json).toEqual({ result: "completed", justCompleted: true });
    expect(done.text).not.toMatch(/wordsCompleted/);
    const again = await call("submit", normal.assignmentId, { baseRevision: p.attempt.revision });
    expect(again.json).toEqual({ result: "completed", justCompleted: false });
    const finished = await stateOf(normal.assignmentId);
    expect(finished.attempt.status).toBe("completed");
    expect(finished.readonly).toBe(true);
    expect(JSON.stringify(finished)).not.toMatch(/wordsCompleted/);
    const saveAfter = await call("save", normal.assignmentId, { patch: { [first]: "가" }, activeMs: 0 });
    expect(saveAfter.json.error).toBe("READONLY");
  });

  it("hard: 3 checks, 1 reveal, no 초성, and a cooldown after a wrong submit", async () => {
    as(stu1);
    const p0 = await startOrResume(studentRow[stu1.id], hard.assignmentId);
    expect(p0.limits).toEqual({ checkMode: "onRequest", checksAllowed: 3, checksRemaining: 3, revealsAllowed: 1, revealsRemaining: 1, chosungAllowed: false });
    const w = hard.words[0];
    expect((await call("chosung", hard.assignmentId, { number: w.number, direction: w.direction })).json.error).toBe("CHOSUNG_NOT_ALLOWED");
    const every = Object.keys(hard.key);
    const bad = Object.fromEntries(every.map((k) => [k, wrongCharFor(hard.key[k])]));
    expect((await call("save", hard.assignmentId, { patch: bad, activeMs: 0 })).status).toBe(200);
    const p = await stateOf(hard.assignmentId);
    const first = await call("submit", hard.assignmentId, { baseRevision: p.attempt.revision });
    expect(first.json).toEqual({ result: "wrong" }); // hard: no count
    const second = await call("submit", hard.assignmentId, { baseRevision: p.attempt.revision });
    expect(second.json.error).toBe("SUBMIT_COOLDOWN");
    expect(second.status).toBe(429);
    expect(second.json.retryAfterSeconds).toBeGreaterThan(0);
    expect(String(second.json.message)).toMatch(/초 뒤에 다시 제출할 수 있어요/);
  });

  it("the events record words, sources and the completion count, never a letter", async () => {
    const { data: attempt } = await admin.from("crossword_attempt_members").select("attempt_id").eq("assignment_id", normal.assignmentId).eq("student_id", studentRow[stu1.id]).single();
    const { data: events } = await admin.from("crossword_attempt_events").select("kind, source, detail, actor_student_id").eq("attempt_id", attempt!.attempt_id);
    const kinds = new Set((events ?? []).map((e) => e.kind));
    for (const k of ["check", "chosung", "reveal", "submit_wrong", "completed"]) expect(kinds.has(k as never), k).toBe(true);
    for (const e of events ?? []) {
      expect(e.actor_student_id).toBe(studentRow[stu1.id]);
      const d = JSON.stringify(e.detail).replace(/wordsCompleted/g, "");
      expect(d).not.toMatch(/[가-힣A-Z]/);
    }
    const done = (events ?? []).find((e) => e.kind === "completed")!;
    expect(done.detail).toEqual({ wordsCompleted: normal.words.length });
  });
});

describe("who can reach what", () => {
  const bogus = ["00000000-0000-4000-8000-0000000000ee", "not-a-uuid", "../../etc", "1 OR 1=1"];

  it("an outsider, a random id and a malformed id all get the same not-found", async () => {
    as(stu3);
    const out = await call("state", normal.assignmentId);
    expect(out.status).toBe(404);
    const bodies = new Set<string>([out.text]);
    for (const id of bogus) {
      as(stu1);
      const r = await call("state", id);
      expect(r.status).toBe(404);
      bodies.add(r.text);
    }
    expect(bodies.size).toBe(1);
    as(stu3);
    for (const name of ["save", "check", "reveal", "chosung", "submit"] as const) {
      const body = name === "save" ? { patch: {}, activeMs: 0 } : name === "check" ? { scope: "word", keys: ["0,0"], baseRevision: 0 } : name === "reveal" ? { key: "0,0", baseRevision: 0 } : name === "chosung" ? { number: 1, direction: "across" } : { baseRevision: 0 };
      expect((await call(name, normal.assignmentId, body)).status, name).toBe(404);
    }
  });

  it("removed from the classroom, archived classroom and closed assignment block play", async () => {
    as(stu2);
    expect((await call("state", normal.assignmentId)).status).toBe(200);
    await admin.from("classroom_enrollments").update({ status: "removed", removed_at: new Date().toISOString() }).eq("classroom_id", room).eq("student_id", studentRow[stu2.id]);
    expect((await call("state", normal.assignmentId)).status).toBe(404);
    await admin.from("classroom_enrollments").update({ status: "active", removed_at: null }).eq("classroom_id", room).eq("student_id", studentRow[stu2.id]);

    await admin.from("classrooms").update({ archived_at: new Date().toISOString() }).eq("id", room);
    expect((await call("state", normal.assignmentId)).status).toBe(404);
    await admin.from("classrooms").update({ archived_at: null }).eq("id", room);

    await admin.from("crossword_assignments").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", normal.assignmentId);
    const closed = await stateOf(normal.assignmentId);
    expect(closed.readonly).toBe(true); // an existing attempt stays viewable
    const one = Object.keys(normal.key)[0];
    expect((await call("save", normal.assignmentId, { patch: { [one]: "가" }, activeMs: 0 })).json.error).toBe("READONLY");
    expect((await call("reveal", normal.assignmentId, { key: one, baseRevision: closed.attempt.revision })).json.error).toBe("READONLY");
    await admin.from("crossword_assignments").update({ status: "open", closed_at: null }).eq("id", normal.assignmentId);
  });

  it("a closed assignment without an attempt cannot be opened", async () => {
    as(stu3);
    await admin.from("classroom_enrollments").insert({ classroom_id: room, student_id: studentRow[stu3.id] });
    await admin.from("crossword_assignments").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", hard.assignmentId);
    await expect(startOrResume(studentRow[stu3.id], hard.assignmentId)).rejects.toMatchObject({ code: "CLOSED" });
    await admin.from("crossword_assignments").update({ status: "open", closed_at: null }).eq("id", hard.assignmentId);
    await admin.from("classroom_enrollments").delete().eq("classroom_id", room).eq("student_id", studentRow[stu3.id]);
  });

  it("the student id comes from the session: a teacher and an anonymous caller are refused", async () => {
    as(teacher);
    expect((await call("state", normal.assignmentId)).status).toBe(403);
    as(null);
    expect((await call("state", normal.assignmentId)).status).toBe(401);
    as(stu1);
    await expect(getStudentIdForProfile(teacher.id)).rejects.toBeInstanceOf(PlayError);
  });

  it("a student who has not finished the forced password change is refused", async () => {
    await admin.from("student_accounts").update({ must_change_password: true }).eq("student_id", studentRow[stu1.id]);
    as(stu1);
    expect((await call("state", normal.assignmentId)).status).toBe(403);
    await admin.from("student_accounts").update({ must_change_password: false }).eq("student_id", studentRow[stu1.id]);
    expect((await call("state", normal.assignmentId)).status).toBe(200);
  });
});

describe("handler hygiene", () => {
  it("every response is no-store, success and error alike", async () => {
    as(stu1);
    const ok = await call("state", normal.assignmentId);
    const notFound = await call("state", "not-a-uuid");
    const bad = await call("save", normal.assignmentId, { nope: 1 });
    for (const r of [ok, notFound, bad]) {
      expect(r.headers.get("cache-control")).toContain("no-store");
      expect(r.headers.get("content-type")).toContain("application/json");
    }
  });

  it("a foreign Origin or a cross-site request is rejected before anything runs", async () => {
    as(stu1);
    const one = Object.keys(normal.key)[0];
    const body = { patch: { [one]: "가" }, activeMs: 0 };
    const cross = await call("save", normal.assignmentId, body, { "sec-fetch-site": "cross-site" });
    expect(cross.status).toBe(403);
    const origin = new Request("http://localhost/student/crosswords/x/api/save", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await savePOST(origin, { params: Promise.resolve({ assignmentId: normal.assignmentId }) });
    expect(res.status).toBe(403);
    const sameOrigin = new Request("http://localhost/student/crosswords/x/api/state", { method: "GET", headers: { origin: "http://localhost" } });
    expect((await stateGET(sameOrigin, { params: Promise.resolve({ assignmentId: normal.assignmentId }) })).status).toBe(200);
  });

  it("plain http on a LAN address (no Sec-Fetch headers) works when Origin matches Host, and still rejects a foreign Origin", async () => {
    as(stu2); // stu1's attempt is completed by now (read-only); stu2's is still open
    const lan = (origin: string) =>
      new Request("http://0.0.0.0:3000/student/crosswords/x/api/save", {
        method: "POST",
        headers: { host: "192.168.0.96:3000", origin, "content-type": "application/json" },
        body: JSON.stringify({ patch: {}, activeMs: 0 }),
      });
    const ok = await savePOST(lan("http://192.168.0.96:3000"), { params: Promise.resolve({ assignmentId: normal.assignmentId }) });
    expect(ok.status).toBe(200);
    const evil = await savePOST(lan("http://evil.example"), { params: Promise.resolve({ assignmentId: normal.assignmentId }) });
    expect(evil.status).toBe(403);
    const sameHostOtherPort = await savePOST(lan("http://192.168.0.96:8080"), { params: Promise.resolve({ assignmentId: normal.assignmentId }) });
    expect(sameHostOtherPort.status).toBe(403);
  });

  it("wrong content type and wrong method", async () => {
    as(stu1);
    const noType = new Request("http://localhost/x", { method: "POST", headers: { "sec-fetch-site": "same-origin", "content-type": "text/plain" }, body: "{}" });
    expect((await savePOST(noType, { params: Promise.resolve({ assignmentId: normal.assignmentId }) })).status).toBe(415);
    const get = new Request("http://localhost/x", { method: "GET", headers: { "sec-fetch-site": "same-origin" } });
    expect((await savePOST(get, { params: Promise.resolve({ assignmentId: normal.assignmentId }) })).status).toBe(405);
    const malformed = new Request("http://localhost/x", { method: "POST", headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: "{not json" });
    expect((await savePOST(malformed, { params: Promise.resolve({ assignmentId: normal.assignmentId }) })).status).toBe(400);
  });

  it("request bodies are exactly the allowed key sets: a selected cell, word or clue is refused, never stored", async () => {
    as(stu1);
    const rev = (await stateOf(normal.assignmentId)).attempt.revision;
    const valid: Record<keyof typeof BODY_KEYS, unknown> = {
      save: { patch: {}, activeMs: 0 },
      check: { scope: "word", keys: ["0,0"], baseRevision: rev },
      reveal: { key: "0,0", baseRevision: rev },
      chosung: { number: 1, direction: "across" },
      submit: { baseRevision: rev },
    };
    for (const name of Object.keys(BODY_KEYS) as (keyof typeof BODY_KEYS)[]) {
      expect(Object.keys(valid[name] as object).sort(), name).toEqual([...BODY_KEYS[name]]);
      for (const extra of ["selected", "selectedCell", "currentWord", "currentClue", "focus", "studentId", "attemptId"]) {
        const r = await call(name, normal.assignmentId, { ...(valid[name] as object), [extra]: "0,0" });
        expect(r.status, `${name}+${extra}`).toBe(400);
        expect(r.json.error).toBe("BAD_REQUEST");
      }
      const missing = { ...(valid[name] as Record<string, unknown>) };
      delete missing[BODY_KEYS[name][0]];
      expect((await call(name, normal.assignmentId, missing)).status, `${name} missing`).toBe(400);
    }
  });

  it("errors carry a code and a fixed message, never an expected value or a database message", async () => {
    as(stu1);
    const rev = (await stateOf(normal.assignmentId)).attempt.revision;
    const errors = [
      await call("save", normal.assignmentId, { patch: { "9,9": "사" }, activeMs: 0 }),
      await call("reveal", normal.assignmentId, { key: "9,9", baseRevision: rev }),
      await call("check", normal.assignmentId, { scope: "cell", keys: ["0,0"], baseRevision: rev }),
      await call("state", "nope"),
    ];
    for (const e of errors) {
      expect(e.status).toBeGreaterThanOrEqual(400);
      expect(Object.keys(e.json).every((k) => ["error", "message", "retryAfterSeconds"].includes(k))).toBe(true);
      expect(e.text).not.toMatch(/CROSSWORD_PLAY_|P0001|relation|violates|supabase|pg_/i);
      for (const answer of normal.answers.filter((a) => Array.from(a).length >= 2)) expect(e.text).not.toContain(answer);
      if (e.json.message) expect(Object.values(PLAY_ERROR_MESSAGES)).toContain(e.json.message);
    }
  });

  it("a normal play request is fast on the local stack (10x margin)", async () => {
    as(stu1);
    const t0 = performance.now();
    await stateOf(normal.assignmentId);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
