import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// DEV ONLY. Creates data on the LOCAL Supabase stack so the bare play board can be opened on real devices (G.5):
// a classroom, two student accounts with a KNOWN test password (no forced password change), a word set, and three
// published puzzles (easy, normal, hard) assigned to the classroom. Run again at any time: the previous run's data
// (everything whose name starts with the DEVPLAY marker) is removed first.
//
//   pnpm env:local && pnpm dev:seed-play
//
// It writes .dev-play-seed.json (git-ignored: it holds the answers and the test password) and prints the URLs.
// It refuses to run against anything but a local stack (tests/access/setup-env.ts). Never use real student data.
// ---------------------------------------------------------------------------------------------

type SessionProfile = { id: string; school_id: string; role: "teacher"; display_name: string; status: "active" };
const session = vi.hoisted(() => ({ profile: null as SessionProfile | null }));

vi.mock("@/features/identity/service", async () => {
  const { IdentityError } = await import("@/features/identity/errors");
  const require_ = () => {
    if (!session.profile) throw new IdentityError("UNAUTHENTICATED", "로그인이 필요합니다.");
    return session.profile;
  };
  return { requireAuthenticatedUserId: async () => require_().id, requireActiveProfile: async () => require_() };
});

import { provisionStudentAccount } from "@/features/accounts/provisioning";
import { NORMALIZER_VERSION } from "@/features/content/import/content-schemas";
import { generateCrosswordAction, publishCrosswordAction, saveCrosswordDraftAction } from "@/features/crossword/review/actions";
import type { PreviewSuccess } from "@/features/crossword/review/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const TEACHER = "00000000-0000-4000-8000-000000000001";
const MARK = "DEVPLAY";
const PASSWORD = "Dev#play1234";
const admin = createSupabaseAdminClient();
const form = (payload: unknown) => {
  const f = new FormData();
  f.set("payload", JSON.stringify(payload));
  return f;
};

// Long words on purpose: the IME cases need 2-, 3- and 4-syllable words (아나, 닭고기, 대한민국).
const WORDS = [
  "사과", "과일", "일기", "기차", "차표", "표지", "지도", "도서관", "관심", "심장", "장미", "미술", "술래",
  "대한민국", "국민", "민주주의", "의사", "사다리", "닭고기", "기러기", "아나운서", "서울", "울산", "산호초",
];

// Fail fast: every step checks its error, and the end state is verified. A silent failure here once left DEVPLAY1 behind
// and the next run died on idx_students_school_student_no.
// Why attempts go first: deleting an auth user cascades to crossword_attempt_members, whose cleanup trigger deletes the
// attempt as the *invoker*; GoTrue runs as supabase_auth_admin, which has no rights on crossword_*, so deleteUser fails
// with "Database error deleting user" for any student who has an attempt. service_role can delete the attempts directly.
async function cleanup() {
  const ok = <T extends { error: { message: string } | null }>(step: string, r: T): T => {
    if (r.error) throw new Error(`dev seed cleanup: ${step}: ${r.error.message}`);
    return r;
  };
  const { data: students } = ok("select students", await admin.from("students").select("id, profile_id").like("student_no", `${MARK}%`));
  const ids = (students ?? []).map((s) => s.id);
  if (ids.length > 0) {
    const { data: members } = ok("select attempt members", await admin.from("crossword_attempt_members").select("attempt_id").in("student_id", ids));
    const attemptIds = [...new Set((members ?? []).map((m) => m.attempt_id))];
    if (attemptIds.length > 0) ok("delete attempts", await admin.from("crossword_attempts").delete().in("id", attemptIds));
  }
  for (const s of students ?? []) {
    const { error } = await admin.auth.admin.deleteUser(s.profile_id);
    if (error) throw new Error(`dev seed cleanup: deleteUser ${s.profile_id}: ${error.message}`);
  }
  ok("delete puzzles", await admin.from("crossword_puzzles").delete().like("title", `${MARK}%`));
  ok("delete sets", await admin.from("content_sets").delete().like("title", `${MARK}%`));
  ok("delete classrooms", await admin.from("classrooms").delete().like("name", `${MARK}%`));

  const left = ok("verify students", await admin.from("students").select("student_no", { count: "exact", head: true }).like("student_no", `${MARK}%`));
  if (left.count !== 0) throw new Error(`dev seed cleanup: ${left.count} student(s) with student_no like '${MARK}%' remain`);
}

describe("dev seed: play board on real devices", () => {
  it("creates the classroom, students, set and three published puzzles", async () => {
    await cleanup();
    session.profile = { id: TEACHER, school_id: SCHOOL, role: "teacher", display_name: "Dev Teacher", status: "active" };

    const { data: room, error: e1 } = await admin
      .from("classrooms")
      .insert({ school_id: SCHOOL, owner_id: TEACHER, name: `${MARK} 기기점검 반` })
      .select("id")
      .single();
    if (e1 || !room) throw e1;

    const accounts: { username: string; password: string; name: string }[] = [];
    for (const n of [1, 2]) {
      const a = await provisionStudentAccount({ schoolId: SCHOOL, actorId: TEACHER, studentName: `점검학생${n}`, studentNo: `${MARK}${n}`, grade: "1" });
      const { error: pw } = await admin.auth.admin.updateUserById(a.profileId, { password: PASSWORD });
      if (pw) throw pw;
      await admin.from("student_accounts").update({ must_change_password: false }).eq("student_id", a.studentId);
      await admin.from("classroom_enrollments").insert({ classroom_id: room.id, student_id: a.studentId });
      accounts.push({ username: a.username, password: PASSWORD, name: `점검학생${n}` });
    }

    const { data: set, error: e2 } = await admin
      .from("content_sets")
      .insert({ school_id: SCHOOL, owner_id: TEACHER, classroom_id: room.id, title: `${MARK} 낱말` })
      .select("id")
      .single();
    if (e2 || !set) throw e2;
    const { error: e3 } = await admin.from("content_entries").insert(
      WORDS.map((w, i) => ({ set_id: set.id, position: i + 1, term: w, definition: `${w.length}글자 낱말 ${i + 1}`, answer: w, script: "hangul" as const, normalizer_version: NORMALIZER_VERSION })),
    );
    if (e3) throw e3;

    const puzzles: unknown[] = [];
    for (const level of ["easy", "normal", "hard"] as const) {
      const gen = await generateCrosswordAction(undefined, form({ setId: set.id, level }));
      if (!gen.ok || !gen.data.ok) throw new Error(`generate ${level} failed: ${JSON.stringify(gen)}`);
      const p = gen.data as PreviewSuccess;
      const saved = await saveCrosswordDraftAction(undefined, form({ setId: set.id, level, seed: p.seed, ticketId: p.ticket.ticketId, ticketToken: p.ticket.ticketToken, title: `${MARK} ${level}` }));
      if (!saved.ok) throw new Error(`save ${level} failed: ${JSON.stringify(saved)}`);
      const pub = await publishCrosswordAction(undefined, form({ puzzleId: saved.data.puzzleId, classroomIds: [room.id] }));
      if (!pub.ok) throw new Error(`publish ${level} failed: ${JSON.stringify(pub)}`);
      const { data: a } = await admin.from("crossword_assignments").select("id").eq("puzzle_id", saved.data.puzzleId).eq("classroom_id", room.id).single();
      const { data: words } = await admin.from("crossword_words").select("number, direction, row, col, answer, clue").eq("puzzle_id", saved.data.puzzleId).order("number");
      puzzles.push({
        level,
        title: `${MARK} ${level}`,
        path: `/student/crosswords/${a!.id}`,
        grid: `${p.rows}x${p.cols}`,
        words: (words ?? []).map((w) => ({ number: w.number, direction: w.direction, at: `${w.row},${w.col}`, answer: w.answer, length: Array.from(w.answer).length })),
      });
    }

    const out = { createdAt: new Date().toISOString(), signIn: "/student/sign-in", accounts, puzzles };
    fs.writeFileSync(".dev-play-seed.json", JSON.stringify(out, null, 2));

    const lines = [
      "",
      "=== DEVPLAY seed ready (local stack) ===",
      `sign in:   ${out.signIn}   (username / password below, no password change needed)`,
      ...accounts.map((a) => `  ${a.name}: ${a.username} / ${a.password}`),
      ...(puzzles as { level: string; path: string; grid: string; words: { number: number; direction: string; at: string; answer: string }[] }[]).flatMap((p) => [
        `${p.level.padEnd(6)} ${p.path}   grid ${p.grid}`,
        ...p.words.map((w) => `         ${w.number}${w.direction === "across" ? "가로" : "세로"} (${w.at}) ${w.answer}`),
      ]),
      "details (answers) in .dev-play-seed.json",
      "",
    ];
    console.log(lines.join("\n"));
    expect(puzzles).toHaveLength(3);
  });
});
