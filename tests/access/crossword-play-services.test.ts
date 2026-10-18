import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// M2-2.4b student play SERVICES, called directly (no HTTP): listPlayable, startOrResume, savePatch, check, reveal,
// chosung, submit. The identity is the student id the caller passes in, which the handlers take from the session only;
// here the tests pin what the services do with it: ordering and states of the list, one attempt under a race, the
// frozen prefill, word-reference-only events, no answer in any return value, and that nothing assumes ONE owner
// (a second member of the same attempt, the shape a shared attempt will use later, works through the same services).
// ---------------------------------------------------------------------------------------------

type SessionProfile = { id: string; school_id: string; role: "teacher" | "student"; display_name: string; status: "active" };
const session = vi.hoisted(() => ({ profile: null as SessionProfile | null }));

vi.mock("@/features/identity/service", async () => {
  const { IdentityError } = await import("@/features/identity/errors");
  const require_ = () => {
    if (!session.profile) throw new IdentityError("UNAUTHENTICATED", "로그인이 필요합니다.");
    return session.profile;
  };
  return { requireAuthenticatedUserId: async () => require_().id, requireActiveProfile: async () => require_() };
});

import { NORMALIZER_VERSION } from "@/features/content/import/content-schemas";
import { PlayError } from "@/features/crossword/play/errors";
import { sortPlayable, stateOf, type PlayableRow } from "@/features/crossword/play/list";
import { check, chosung, listPlayable, reveal, savePatch, startOrResume, submit } from "@/features/crossword/play/service";
import { generateCrosswordAction, publishCrosswordAction, saveCrosswordDraftAction } from "@/features/crossword/review/actions";
import type { PreviewSuccess } from "@/features/crossword/review/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = `S${Date.now().toString(36)}`.toUpperCase();
const PASSWORD = "Tmp#pass12345";
const admin = createSupabaseAdminClient();
const startedAt = new Date().toISOString();

const mk = (id: string, role: "teacher" | "student", name: string): SessionProfile => ({ id, school_id: SCHOOL, role, display_name: name, status: "active" });
const teacher = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const s1 = mk("00000000-0000-4000-8000-0000000000d1", "student", "SV s1");
const s2 = mk("00000000-0000-4000-8000-0000000000d2", "student", "SV s2");
const s3 = mk("00000000-0000-4000-8000-0000000000d3", "student", "SV s3");
const sid: Record<string, string> = {};
const form = (payload: unknown) => { const f = new FormData(); f.set("payload", JSON.stringify(payload)); return f; };
const title = (l: string) => `${RUN}-${l}`;
const CHAIN = ["사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관", "관심", "심장", "장미", "미술", "술래", "내일", "일요일", "요리"];

let roomA: string;
let roomB: string;
let setId: string;
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
  const { data, error } = await admin.from("students").insert({ school_id: SCHOOL, profile_id: p.id, student_no: `${RUN}-${n}`, grade: "1" }).select("id").single();
  if (error || !data) throw error;
  sid[p.id] = data.id;
}

async function makeClassroom(label: string) {
  const { data, error } = await admin.from("classrooms").insert({ school_id: SCHOOL, owner_id: teacher.id, name: title(label) }).select("id").single();
  if (error || !data) throw error;
  classroomIds.push(data.id);
  return data.id;
}

async function publish(level: "easy" | "normal" | "hard", label: string, rooms: string[]) {
  session.profile = teacher;
  const gen = await generateCrosswordAction(undefined, form({ setId, level }));
  if (!gen.ok || !gen.data.ok) throw new Error("generate failed " + JSON.stringify(gen));
  const p = gen.data as PreviewSuccess;
  const saved = await saveCrosswordDraftAction(undefined, form({ setId, level, seed: p.seed, ticketId: p.ticket.ticketId, ticketToken: p.ticket.ticketToken, title: title(label) }));
  if (!saved.ok) throw new Error("save failed " + JSON.stringify(saved));
  const pub = await publishCrosswordAction(undefined, form({ puzzleId: saved.data.puzzleId, classroomIds: rooms }));
  if (!pub.ok) throw new Error("publish failed " + JSON.stringify(pub));
  const { data: as_ } = await admin.from("crossword_assignments").select("id, classroom_id").eq("puzzle_id", saved.data.puzzleId);
  const assignment: Record<string, string> = {};
  for (const a of as_ ?? []) assignment[a.classroom_id] = a.id;
  const { data: words } = await admin.from("crossword_words").select("number, direction, row, col, answer").eq("puzzle_id", saved.data.puzzleId);
  const key: Record<string, string> = {};
  for (const w of words ?? []) Array.from(w.answer).forEach((ch, k) => { key[`${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`] = ch; });
  return { puzzleId: saved.data.puzzleId, assignment, key, answers: (words ?? []).map((w) => w.answer), words: words ?? [] };
}
type Puzzle = Awaited<ReturnType<typeof publish>>;
let pNormal: Puzzle; // roomA + roomB
let pEasy: Puzzle; // roomA
let pHard: Puzzle; // roomA (closed-with-attempt, shared attempt)
let pLate: Puzzle; // roomA (closed, no attempt)

const enroll = (room: string, who: SessionProfile) => admin.from("classroom_enrollments").insert({ classroom_id: room, student_id: sid[who.id] });
const rows = async (who: SessionProfile) => listPlayable(sid[who.id]);
const rowFor = (list: PlayableRow[], p: Puzzle, room: string) => list.find((r) => r.assignmentId === p.assignment[room]);

beforeAll(async () => {
  for (const u of [teacher, s1, s2, s3]) await ensureUser(u);
  for (const [i, s] of [s1, s2, s3].entries()) await makeStudent(s, i + 1);
  roomA = await makeClassroom("A");
  roomB = await makeClassroom("B");
  await enroll(roomA, s1); await enroll(roomA, s2); await enroll(roomB, s1);
  const { data: set, error } = await admin.from("content_sets").insert({ school_id: SCHOOL, owner_id: teacher.id, classroom_id: roomA, title: title("set") }).select("id").single();
  if (error || !set) throw error;
  setId = set.id;
  await admin.from("content_entries").insert(CHAIN.map((w, i) => ({ set_id: setId, position: i + 1, term: w, definition: `${w.length}글자 낱말 ${i + 1}`, answer: w, script: "hangul" as const, normalizer_version: NORMALIZER_VERSION })));
  pNormal = await publish("normal", "normal", [roomA, roomB]);
  pEasy = await publish("easy", "easy", [roomA]);
  pHard = await publish("hard", "hard", [roomA]);
  pLate = await publish("easy", "late", [roomA]);
}, 180_000);

afterAll(async () => {
  await admin.from("crossword_puzzles").delete().eq("owner_id", teacher.id).gte("created_at", startedAt);
  await admin.from("crossword_preview_tickets").delete().eq("actor_id", teacher.id);
  await admin.from("content_sets").delete().ilike("title", `${RUN}%`);
  if (classroomIds.length) await admin.from("classrooms").delete().in("id", classroomIds);
  for (const id of Object.values(sid)) await admin.from("students").delete().eq("id", id);
});

const noAnswer = (value: unknown, p: Puzzle) => {
  const text = JSON.stringify(value);
  for (const a of p.answers.filter((x) => Array.from(x).length >= 2)) expect(text).not.toContain(a);
  expect(text).not.toMatch(/"answer"|"solution"/);
};
const wrong = (ch: string) => (ch === "힣" ? "가" : "힣");

// ---- 1. listPlayable -----------------------------------------------------------------------------------------

describe("listPlayable", () => {
  it("lists each open assignment once per classroom, with the puzzle facts and no answer", async () => {
    const list = await rows(s1);
    const a = rowFor(list, pNormal, roomA)!;
    const b = rowFor(list, pNormal, roomB)!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a.puzzleId).toBe(b.puzzleId); // the same puzzle in two classrooms is two rows (CW-9)
    expect(a.classroomId).not.toBe(b.classroomId);
    expect(a).toMatchObject({ title: title("normal"), level: "normal", attemptId: null, attemptStatus: null, filledCount: 0, readonly: false, state: "new" });
    expect(a.wordCount).toBe(pNormal.words.length);
    expect(a.totalCells).toBe(Object.keys(pNormal.key).length);
    noAnswer(list, pNormal);
    expect(Object.keys(a).sort()).toEqual(["assignmentId", "attemptId", "attemptStatus", "classroomId", "classroomName", "closesAt", "filledCount", "level", "puzzleId", "readonly", "state", "title", "totalCells", "wordCount"]);
  });

  it("shows only what this student may open", async () => {
    expect(await rows(s3)).toEqual([]); // not enrolled anywhere
    const two = await rows(s2);
    expect(two.some((r) => r.assignmentId === pNormal.assignment[roomB])).toBe(false); // s2 is not in room B
    expect(two.some((r) => r.assignmentId === pNormal.assignment[roomA])).toBe(true);
  });

  it("the order is fixed: in progress, new (soonest closing first), closed, completed", async () => {
    const soon = new Date(Date.now() + 2 * 3600_000).toISOString();
    const later = new Date(Date.now() + 48 * 3600_000).toISOString();
    await admin.from("crossword_assignments").update({ closes_at: later }).eq("id", pNormal.assignment[roomA]);
    await admin.from("crossword_assignments").update({ closes_at: soon }).eq("id", pEasy.assignment[roomA]);
    // hard and late: no closing time, so they come after the ones that have one
    const order = (await rows(s2)).filter((r) => r.state === "new").map((r) => r.assignmentId);
    expect(order.indexOf(pEasy.assignment[roomA])).toBeLessThan(order.indexOf(pNormal.assignment[roomA]));
    expect(order.indexOf(pNormal.assignment[roomA])).toBeLessThan(order.indexOf(pHard.assignment[roomA]));
  });

  it("states follow the attempt: new -> in progress (filled count) -> completed, which sorts last", async () => {
    const id = sid[s2.id];
    const p0 = await startOrResume(id, pEasy.assignment[roomA]);
    let r = rowFor(await rows(s2), pEasy, roomA)!;
    expect(r.state).toBe("in_progress");
    expect(r.attemptId).not.toBeNull();
    expect(r.filledCount).toBe(Object.keys(p0.given).length); // prefilled cells count as filled
    const open = Object.keys(pEasy.key).filter((k) => !p0.given[k]);
    await savePatch(id, pEasy.assignment[roomA], { [open[0]]: pEasy.key[open[0]], [open[1]]: wrong(pEasy.key[open[1]]) }, 0);
    r = rowFor(await rows(s2), pEasy, roomA)!;
    expect(r.filledCount).toBe(Object.keys(p0.given).length + 2); // filled, not correct: a wrong letter counts the same
    // in progress sorts before the new ones
    const list = await rows(s2);
    expect(list[0].state).toBe("in_progress");
    // finish it
    const fill = Object.fromEntries(open.map((k) => [k, pEasy.key[k]]));
    await savePatch(id, pEasy.assignment[roomA], fill, 0);
    const fresh = await startOrResume(id, pEasy.assignment[roomA]);
    expect(await submit(id, pEasy.assignment[roomA], fresh.attempt.revision)).toEqual({ result: "completed", justCompleted: true });
    const after = await rows(s2);
    const done = rowFor(after, pEasy, roomA)!;
    expect(done.state).toBe("completed");
    expect(after[after.length - 1].state).toBe("completed");
    expect(done.filledCount).toBe(done.totalCells);
  });

  it("a closed assignment stays listed (read-only) only for a student who has an attempt; an archived classroom disappears", async () => {
    const id = sid[s1.id];
    await startOrResume(id, pHard.assignment[roomA]);
    await admin.from("crossword_assignments").update({ status: "closed", closed_at: new Date().toISOString() }).in("id", [pHard.assignment[roomA], pLate.assignment[roomA]]);
    const list = await rows(s1);
    const hard = rowFor(list, pHard, roomA)!;
    expect(hard).toMatchObject({ state: "closed", readonly: true });
    expect(rowFor(list, pLate, roomA)).toBeUndefined(); // closed and never started: not listed
    expect(list.findIndex((r) => r.assignmentId === hard.assignmentId)).toBeGreaterThan(list.findIndex((r) => r.state === "new" || r.state === "in_progress"));
    await admin.from("classrooms").update({ archived_at: new Date().toISOString() }).eq("id", roomB);
    expect(rowFor(await rows(s1), pNormal, roomB)).toBeUndefined();
    await admin.from("classrooms").update({ archived_at: null }).eq("id", roomB);
    await admin.from("crossword_assignments").update({ status: "open", closed_at: null }).in("id", [pHard.assignment[roomA], pLate.assignment[roomA]]);
  });
});

describe("list ordering and states (pure)", () => {
  const row = (over: Partial<PlayableRow>): PlayableRow => ({
    assignmentId: "a", puzzleId: "p", title: "가", classroomId: "c", classroomName: "반", level: "easy", wordCount: 5, totalCells: 9,
    closesAt: null, attemptId: null, attemptStatus: null, filledCount: 0, readonly: false, state: "new", ...over,
  });
  it("stateOf", () => {
    expect(stateOf({ attemptId: null, attemptStatus: null, readonly: false })).toBe("new");
    expect(stateOf({ attemptId: "x", attemptStatus: "in_progress", readonly: false })).toBe("in_progress");
    expect(stateOf({ attemptId: "x", attemptStatus: "in_progress", readonly: true })).toBe("closed");
    expect(stateOf({ attemptId: "x", attemptStatus: "completed", readonly: true })).toBe("completed");
  });
  it("sortPlayable: by state, then closing time (none last), then title in Korean order, and is stable and non-mutating", () => {
    const input = [
      row({ assignmentId: "1", state: "completed", title: "가" }),
      row({ assignmentId: "2", state: "new", title: "나", closesAt: null }),
      row({ assignmentId: "3", state: "new", title: "다", closesAt: "2030-01-02T00:00:00Z" }),
      row({ assignmentId: "4", state: "new", title: "라", closesAt: "2030-01-01T00:00:00Z" }),
      row({ assignmentId: "5", state: "closed", title: "마" }),
      row({ assignmentId: "6", state: "in_progress", title: "바", closesAt: null }),
      row({ assignmentId: "7", state: "in_progress", title: "사", closesAt: "2029-01-01T00:00:00Z" }),
      row({ assignmentId: "8", state: "new", title: "가", closesAt: "2030-01-02T00:00:00Z" }),
    ];
    const copy = JSON.stringify(input);
    expect(sortPlayable(input).map((r) => r.assignmentId)).toEqual(["7", "6", "4", "8", "3", "2", "5", "1"]);
    expect(JSON.stringify(input)).toBe(copy);
    expect(sortPlayable(sortPlayable(input)).map((r) => r.assignmentId)).toEqual(sortPlayable(input).map((r) => r.assignmentId));
  });
  it("the ordering never looks at progress against other students, a score or a rank", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/features/crossword/play/list.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/score|rank\b|ranking|points|percent|leaderboard/i);
  });
});

// ---- 2. startOrResume ----------------------------------------------------------------------------------------

describe("startOrResume", () => {
  it("six simultaneous first opens give exactly one attempt and one member row", async () => {
    const id = sid[s1.id];
    const target = pEasy.assignment[roomA];
    const all = await Promise.all(Array.from({ length: 6 }, () => startOrResume(id, target)));
    expect(new Set(all.map((p) => p.attempt.revision)).size).toBe(1);
    expect(new Set(all.map((p) => JSON.stringify(p.given))).size).toBe(1);
    const { data } = await admin.from("crossword_attempt_members").select("attempt_id").eq("assignment_id", target).eq("student_id", id);
    expect(data).toHaveLength(1);
    const { count } = await admin.from("crossword_attempts").select("*", { count: "exact", head: true }).eq("assignment_id", target);
    expect(count).toBe(2); // s2 (finished earlier) and s1
  });

  it("the prefilled cells are frozen keys, never complete a word, and stay the same on every resume", async () => {
    const id = sid[s1.id];
    const target = pEasy.assignment[roomA];
    const a = await startOrResume(id, target);
    const b = await startOrResume(id, target);
    expect(b.given).toEqual(a.given);
    const { data: att } = await admin.from("crossword_attempt_members").select("attempt_id").eq("assignment_id", target).eq("student_id", id).single();
    const { data: row } = await admin.from("crossword_attempts").select("prefill_keys, revealed_keys, cells").eq("id", att!.attempt_id).single();
    expect(row!.prefill_keys.every((k: string) => /^\d+,\d+$/.test(k))).toBe(true);
    expect([...row!.prefill_keys].sort()).toEqual(Object.keys(a.given).sort());
    const keys = new Set(row!.prefill_keys as string[]);
    for (const w of pEasy.words) {
      const cells = Array.from(w.answer).map((_, k) => `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`);
      expect(cells.every((c) => keys.has(c))).toBe(false);
    }
    noAnswer(a, pEasy);
  });

  it("refuses what the student may not open, with the same code for missing and for not theirs", async () => {
    await expect(startOrResume(sid[s3.id], pNormal.assignment[roomA])).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(startOrResume(sid[s1.id], "not-a-uuid")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(startOrResume(sid[s1.id], "00000000-0000-4000-8000-0000000000ee")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(startOrResume(sid[s1.id], "x".repeat(500))).rejects.toBeInstanceOf(PlayError);
  });
});

// ---- 3. savePatch, check, reveal, chosung, submit through the services ------------------------------------------

describe("savePatch, check, reveal, chosung, submit", () => {
  it("each works on the student's own attempt and returns no answer", async () => {
    const id = sid[s2.id];
    const target = pNormal.assignment[roomA];
    const p = await startOrResume(id, target);
    const open = Object.keys(pNormal.key).filter((k) => !p.given[k]);
    const saved = await savePatch(id, target, { [open[0]]: pNormal.key[open[0]], [open[1]]: wrong(pNormal.key[open[1]]) }, 0);
    expect(Object.keys(saved).sort()).toEqual(["filled", "revision"]);

    const w = pNormal.words.find((x) => Array.from(x.answer).length >= 2)!;
    const keys = Array.from(w.answer).map((_, k) => `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`);
    const c = await check(id, target, { scope: "word", keys, baseRevision: saved.revision });
    expect(c.results.map((r) => r.key).sort()).toEqual([...keys].sort());
    expect(c.checksRemaining).toBe(4);
    noAnswer(c, pNormal);

    const target2 = open.find((k) => k !== open[0] && k !== open[1])!;
    const r = await reveal(id, target, { key: target2, baseRevision: saved.revision });
    expect(r.char).toBe(pNormal.key[target2]);
    expect(Object.keys(r).sort()).toEqual(["char", "key", "revealsRemaining", "revision"]);

    const word = pNormal.words.find((x) => /^[가-힣]+$/.test(x.answer))!;
    const cho = await chosung(id, target, { number: word.number, direction: word.direction });
    expect(cho.chosung).toMatch(/^[ㄱ-ㅎ]+$/);

    const now = await startOrResume(id, target);
    const inc = await submit(id, target, now.attempt.revision);
    expect(inc.result).toBe("incomplete");
    noAnswer([saved, inc, cho], pNormal);
  });

  it("the limits of the preset are enforced through the services (normal: 2 reveals, 5 checks)", async () => {
    const id = sid[s2.id];
    const target = pNormal.assignment[roomA];
    const p = await startOrResume(id, target);
    const open = Object.keys(pNormal.key).filter((k) => !p.given[k] && !p.cells[k]);
    await reveal(id, target, { key: open[0], baseRevision: p.attempt.revision });
    await expect(reveal(id, target, { key: open[1], baseRevision: 0 })).rejects.toMatchObject({ code: "STALE" });
    const q = await startOrResume(id, target);
    await expect(reveal(id, target, { key: open[2], baseRevision: q.attempt.revision })).rejects.toMatchObject({ code: "REVEAL_LIMIT" });
    await expect(check(id, target, { scope: "cell", keys: [open[1]], baseRevision: q.attempt.revision })).rejects.toMatchObject({ code: "CHECK_NOT_ALLOWED" });
  });

  it("another student's attempt cannot be reached: every service works on the caller's own member row", async () => {
    const other = sid[s3.id];
    const target = pNormal.assignment[roomA];
    await expect(savePatch(other, target, {}, 0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(check(other, target, { scope: "word", keys: ["0,0"], baseRevision: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(reveal(other, target, { key: "0,0", baseRevision: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(chosung(other, target, { number: 1, direction: "across" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(submit(other, target, 0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ---- 4. events and the shared-attempt shape --------------------------------------------------------------------

describe("events and shared attempts", () => {
  it("every event holds word references only (plus the one completion count), a source, and the acting student", async () => {
    const { data: events } = await admin.from("crossword_attempt_events").select("kind, source, detail, actor_student_id");
    const mine = (events ?? []).filter((e) => e.actor_student_id === sid[s1.id] || e.actor_student_id === sid[s2.id]);
    expect(mine.length).toBeGreaterThan(3);
    for (const e of mine) {
      const d = e.detail as Record<string, unknown>;
      expect(Object.keys(d).every((k) => ["scope", "words", "wordsCompleted"].includes(k))).toBe(true);
      expect(JSON.stringify(d).replace(/wordsCompleted|across|down|scope|words|number|direction|cell|word|puzzle/g, "")).not.toMatch(/[가-힣A-Za-z]/);
      expect(["hint", "reveal", "submit"]).toContain(e.source);
    }
    const kinds = new Set(mine.map((e) => `${e.kind}/${e.source}`));
    for (const k of ["check/hint", "reveal/reveal", "chosung/hint", "completed/submit"]) expect(kinds.has(k), k).toBe(true);
  });

  it("a second member of the same attempt (the future shared shape) works through the same services", async () => {
    // s3 joins s1's hard attempt as a member. No UI and no team feature: only the data shape the services must not break.
    await enroll(roomA, s3);
    const target = pHard.assignment[roomA];
    const first = await startOrResume(sid[s1.id], target);
    const { data: m } = await admin.from("crossword_attempt_members").select("attempt_id").eq("assignment_id", target).eq("student_id", sid[s1.id]).single();
    const { error } = await admin.from("crossword_attempt_members").insert({ attempt_id: m!.attempt_id, assignment_id: target, student_id: sid[s3.id] });
    expect(error).toBeNull();

    // s3 opens the SAME attempt (no second one is created) and sees what s1 sees
    const viaS3 = await startOrResume(sid[s3.id], target);
    expect(viaS3.attempt.revision).toBe(first.attempt.revision);
    expect(viaS3.given).toEqual(first.given);
    const { count } = await admin.from("crossword_attempts").select("*", { count: "exact", head: true }).eq("assignment_id", target);
    expect(count).toBe(1);

    // both write, cells merge, the revision is shared
    const open = Object.keys(pHard.key).filter((k) => !first.given[k]);
    const a = await savePatch(sid[s1.id], target, { [open[0]]: pHard.key[open[0]] }, 0);
    const b = await savePatch(sid[s3.id], target, { [open[1]]: pHard.key[open[1]] }, 0);
    expect(b.revision).toBe(a.revision + 1);
    const seen = await startOrResume(sid[s1.id], target);
    expect(seen.cells).toMatchObject({ [open[0]]: pHard.key[open[0]], [open[1]]: pHard.key[open[1]] });

    // the counters belong to the attempt; the event names who acted
    const w = pHard.words.find((x) => Array.from(x.answer).length >= 2)!;
    const keys = Array.from(w.answer).map((_, k) => `${w.row + (w.direction === "down" ? k : 0)},${w.col + (w.direction === "across" ? k : 0)}`);
    const c1 = await check(sid[s1.id], target, { scope: "word", keys, baseRevision: b.revision });
    const c3 = await check(sid[s3.id], target, { scope: "word", keys, baseRevision: b.revision });
    expect(c1.checksRemaining).toBe(2);
    expect(c3.checksRemaining).toBe(1); // one pool for the attempt, not one per person
    const { data: ev } = await admin.from("crossword_attempt_events").select("actor_student_id").eq("attempt_id", m!.attempt_id).eq("kind", "check");
    expect((ev ?? []).map((e) => e.actor_student_id).sort()).toEqual([sid[s1.id], sid[s3.id]].sort());

    // either member can finish; the list shows it completed for both
    const fill = Object.fromEntries(open.map((k) => [k, pHard.key[k]]));
    const filled = await savePatch(sid[s3.id], target, fill, 0);
    expect(await submit(sid[s3.id], target, filled.revision)).toEqual({ result: "completed", justCompleted: true });
    expect(await submit(sid[s1.id], target, filled.revision)).toEqual({ result: "completed", justCompleted: false });
    expect(rowFor(await rows(s1), pHard, roomA)!.state).toBe("completed");
    expect(rowFor(await rows(s3), pHard, roomA)!.state).toBe("completed");
    noAnswer([viaS3, a, b, c1, c3], pHard);
  });
});
