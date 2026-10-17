import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// M2-2.2c: the crossword teacher-review backend end to end against the LOCAL Supabase stack:
// generate / regenerate -> preview ticket -> save draft -> edit -> publish -> version -> archive / restore ->
// assignments. Only the identity lookup is mocked, as in the other access tests. No screens, no student play.
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
import {
  addCrosswordAssignmentsAction,
  archiveCrosswordAction,
  closeCrosswordAssignmentAction,
  createCrosswordVersionAction,
  generateCrosswordAction,
  publishCrosswordAction,
  regenerateCrosswordAction,
  saveCrosswordDraftAction,
  unarchiveCrosswordAction,
  updateCrosswordDraftAction,
} from "@/features/crossword/review/actions";
import { MAX_LIVE_PREVIEW_TICKETS } from "@/features/crossword/review/constants";
import {
  getPuzzleDetail,
  listPuzzles,
  type PreviewSuccess,
} from "@/features/crossword/review/service";
import { validatePuzzle } from "@/features/crossword/generator/validate";
import { NORMALIZER_VERSION } from "@/features/content/import/content-schemas";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = `W${Date.now().toString(36)}`.toUpperCase();
const PASSWORD = "Tmp#pass12345";
const admin = createSupabaseAdminClient();

const mk = (id: string, role: Role, name: string): SessionProfile => ({
  id,
  school_id: SCHOOL,
  role,
  display_name: name,
  status: "active",
});
// owner = seed teacher; it OWNS the classrooms. coTeacher teaches `room`. Others have no access.
const owner = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const coTeacher = mk("00000000-0000-4000-8000-0000000000e1", "teacher", "CW co-teacher");
const outsider = mk("00000000-0000-4000-8000-0000000000e2", "teacher", "CW outsider");
const adminUser = mk("00000000-0000-4000-8000-0000000000e3", "admin", "CW admin");
const student = mk("00000000-0000-4000-8000-0000000000e5", "student", "CW student");
const allUsers = [owner, coTeacher, outsider, adminUser, student];

const as = (p: SessionProfile | null) => {
  session.profile = p;
};
const form = (payload: unknown) => {
  const f = new FormData();
  f.set("payload", JSON.stringify(payload));
  return f;
};
const idle = undefined;

// Words that chain through shared syllables: a good set (17+ placed) and a set that cannot reach 5 placed words.
const CHAIN = [
  "사과",
  "과일",
  "일기",
  "기차",
  "차표",
  "표지",
  "지도",
  "도서관",
  "관심",
  "심장",
  "장미",
  "미술",
  "술래",
  "내일",
  "일요일",
  "요리",
];
const POOR = [
  "민주주의",
  "삼권분립",
  "헌법",
  "국민",
  "선거",
  "정당",
  "의회",
  "법원",
  "행정부",
  "대통령",
  "투표",
  "평등",
];

let n = 0;
const title = (label: string) => `${RUN}-${label}-${(n += 1)}`;

async function ensureUser(p: SessionProfile) {
  const existing = await admin.auth.admin.getUserById(p.id);
  if (!existing.data?.user) {
    const { error } = await admin.auth.admin.createUser({
      id: p.id,
      email: `${p.id}@access.invalid`,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error && !/already|exists|registered/i.test(error.message)) throw error;
  }
  await admin.from("profiles").upsert({
    id: p.id,
    school_id: p.school_id,
    role: p.role,
    display_name: p.display_name,
    status: "active",
  });
}

const classroomIds: string[] = [];
async function makeClassroom(archived = false) {
  const { data, error } = await admin
    .from("classrooms")
    .insert({
      school_id: SCHOOL,
      owner_id: owner.id,
      name: title("반"),
      archived_at: archived ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) throw error;
  classroomIds.push(data.id);
  return data.id;
}

async function makeSet(
  ownerId: string,
  label: string,
  words: string[],
  classroomId: string | null = null,
) {
  const { data, error } = await admin
    .from("content_sets")
    .insert({
      school_id: SCHOOL,
      owner_id: ownerId,
      classroom_id: classroomId,
      title: title(label),
    })
    .select("id")
    .single();
  if (error || !data) throw error;
  const { error: e2 } = await admin.from("content_entries").insert(
    words.map((w, i) => ({
      set_id: data.id,
      position: i + 1,
      term: w,
      definition: `${w.length}글자 낱말 ${i + 1}`,
      answer: w,
      script: "hangul" as const,
      normalizer_version: NORMALIZER_VERSION,
    })),
  );
  if (e2) throw e2;
  return data.id;
}

const auditOf = async (puzzleId: string, action: string) =>
  (
    await admin
      .from("audit_logs")
      .select("action, metadata")
      .eq("resource_id", puzzleId)
      .eq("action", action as never)
  ).data ?? [];

let room: string; // owned by `owner`, co-taught by `coTeacher`
let room2: string; // owned by `owner`
let roomArchived: string;
let roomOther: string; // owned by `owner`, not linked to the co-teacher
let goodSet: string; // CHAIN, linked to `room`
let poorSet: string;

/** Generates, then saves with the preview's ticket; returns the saved puzzle id. */
async function previewAndSave(
  who: SessionProfile,
  setId: string,
  label: string,
  extra: Record<string, unknown> = {},
) {
  as(who);
  const gen = await generateCrosswordAction(idle, form({ setId, level: "normal", ...extra }));
  if (!gen.ok || !gen.data.ok) throw new Error("preview failed: " + JSON.stringify(gen));
  const p = gen.data as PreviewSuccess;
  const saved = await saveCrosswordDraftAction(
    idle,
    form({
      setId,
      level: "normal",
      ...extra,
      seed: p.seed,
      ticketId: p.ticket.ticketId,
      ticketToken: p.ticket.ticketToken,
      title: title(label),
    }),
  );
  if (!saved.ok) throw new Error("save failed: " + JSON.stringify(saved));
  return { puzzleId: saved.data.puzzleId, preview: p };
}

beforeAll(async () => {
  for (const u of allUsers) await ensureUser(u);
  room = await makeClassroom();
  room2 = await makeClassroom();
  roomArchived = await makeClassroom(true);
  roomOther = await makeClassroom();
  await admin.from("classroom_teachers").insert({ classroom_id: room, teacher_id: coTeacher.id });
  goodSet = await makeSet(owner.id, "good", CHAIN, room);
  poorSet = await makeSet(owner.id, "poor", POOR);
}, 60_000);

afterAll(async () => {
  await admin
    .from("crossword_puzzles")
    .delete()
    .in(
      "owner_id",
      allUsers.map((u) => u.id),
    )
    .ilike("title", `${RUN}%`);
  await admin
    .from("crossword_preview_tickets")
    .delete()
    .in(
      "actor_id",
      allUsers.map((u) => u.id),
    );
  await admin.from("content_sets").delete().ilike("title", `${RUN}%`);
  if (classroomIds.length) await admin.from("classrooms").delete().in("id", classroomIds);
});

// ---- generate and regenerate ------------------------------------------------------------------------------

describe("M2-2.2c generate / regenerate", () => {
  it("returns a valid solution, statistics, readiness and a ticket that holds hashes only", async () => {
    as(owner);
    const r = await generateCrosswordAction(idle, form({ setId: goodSet, level: "normal" }));
    expect(r.ok && r.data.ok).toBe(true);
    const p = (r as { ok: true; data: PreviewSuccess }).data;
    expect(p.words.length).toBeGreaterThanOrEqual(5);
    expect(p.words.every((w) => w.answer.length > 0 && w.clue.length > 0)).toBe(true);
    expect(
      validatePuzzle({ rows: p.rows, cols: p.cols, words: p.words.map((w) => ({ ...w })) }),
    ).toEqual({ ok: true });
    expect(p.readiness.band).toBe("ready");
    expect(p.difficulty).toBeGreaterThanOrEqual(0);

    const { data: ticket } = await admin
      .from("crossword_preview_tickets")
      .select("*")
      .eq("id", p.ticket.ticketId)
      .single();
    expect(ticket).toMatchObject({
      actor_id: owner.id,
      set_id: goodSet,
      placement_hash: p.placementHash,
      used_at: null,
    });
    expect(ticket!.token_hash).not.toBe(p.ticket.ticketToken); // only the hash is stored
    expect(JSON.stringify(ticket)).not.toMatch(/사과|과일|일기/);
  });

  it("the same seed gives the same puzzle; regenerate ignores the seed and returns a new ticket each time", async () => {
    as(owner);
    const a = (await generateCrosswordAction(
      idle,
      form({ setId: goodSet, level: "normal", seed: 12345 }),
    )) as { ok: true; data: PreviewSuccess };
    const b = (await generateCrosswordAction(
      idle,
      form({ setId: goodSet, level: "normal", seed: 12345 }),
    )) as { ok: true; data: PreviewSuccess };
    expect(b.data.placementHash).toBe(a.data.placementHash);
    expect(b.data.ticket.ticketId).not.toBe(a.data.ticket.ticketId);

    const seeds = new Set<number>();
    for (let i = 0; i < 6; i += 1) {
      const r = (await regenerateCrosswordAction(
        idle,
        form({ setId: goodSet, level: "normal", seed: 12345 }),
      )) as { ok: true; data: PreviewSuccess };
      expect(r.ok).toBe(true);
      seeds.add(r.data.seed);
    }
    expect(seeds.size).toBeGreaterThan(1); // unlimited regenerate, fresh seeds
  });

  it("refuses a set that cannot place 5 words (decision C2): reasons, no ticket", async () => {
    as(owner);
    const before = (
      await admin
        .from("crossword_preview_tickets")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", owner.id)
    ).count;
    const r = await generateCrosswordAction(idle, form({ setId: poorSet, level: "normal" }));
    expect(r.ok).toBe(true);
    const f = (
      r as {
        ok: true;
        data: {
          ok: false;
          reason: string;
          placedWords: number;
          message: string;
          readiness: { band: string };
        };
      }
    ).data;
    expect(f.ok).toBe(false);
    expect(f.reason).toBe("NOT_ENOUGH_WORDS");
    expect(f.placedWords).toBeLessThan(5);
    expect(f.message).toContain("5개 이상");
    expect(f.readiness.band).toBe("blocked");
    const after = (
      await admin
        .from("crossword_preview_tickets")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", owner.id)
    ).count;
    expect(after).toBe(before);
  });

  it("keeps at most 10 live tickets per teacher by expiring the oldest", async () => {
    as(owner);
    for (let i = 0; i < MAX_LIVE_PREVIEW_TICKETS + 3; i += 1)
      await generateCrosswordAction(idle, form({ setId: goodSet, level: "easy" }));
    const { data } = await admin
      .from("crossword_preview_tickets")
      .select("id")
      .eq("actor_id", owner.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString());
    expect(data!.length).toBeLessThanOrEqual(MAX_LIVE_PREVIEW_TICKETS);
  });

  it("enforces access: outsider, student and a malformed id get an error state", async () => {
    for (const who of [outsider, student]) {
      as(who);
      const r = await generateCrosswordAction(idle, form({ setId: goodSet, level: "normal" }));
      expect(r.ok).toBe(false);
    }
    as(owner);
    const bad = await generateCrosswordAction(idle, form({ setId: "not-a-uuid", level: "normal" }));
    expect(bad).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    as(null);
    expect(
      (await generateCrosswordAction(idle, form({ setId: goodSet, level: "normal" }))).ok,
    ).toBe(false);
  });

  it("lets the co-teacher of the set's classroom generate, and refuses an archived set", async () => {
    as(coTeacher);
    expect((await generateCrosswordAction(idle, form({ setId: goodSet, level: "easy" }))).ok).toBe(
      true,
    );
    const archivedSet = await makeSet(owner.id, "archived-set", CHAIN);
    await admin
      .from("content_sets")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", archivedSet);
    as(owner);
    expect(
      await generateCrosswordAction(idle, form({ setId: archivedSet, level: "normal" })),
    ).toMatchObject({ ok: false, code: "SET_ARCHIVED" });
  });
});

// ---- save --------------------------------------------------------------------------------------------------

describe("M2-2.2c save draft (preview ticket)", () => {
  it("saves exactly the previewed puzzle as version 1, consumes the ticket and audits it", async () => {
    const { puzzleId, preview } = await previewAndSave(owner, goodSet, "save");
    const { data: p } = await admin
      .from("crossword_puzzles")
      .select("*")
      .eq("id", puzzleId)
      .single();
    expect(p).toMatchObject({
      status: "draft",
      version: 1,
      root_id: puzzleId,
      supersedes_id: null,
      set_id: goodSet,
      owner_id: owner.id,
      placement_hash: preview.placementHash,
      seed: preview.seed,
    });
    const { data: words } = await admin
      .from("crossword_words")
      .select("answer, number, direction, row, col")
      .eq("puzzle_id", puzzleId);
    expect(words!.length).toBe(preview.words.length);
    expect(new Set(words!.map((w) => w.answer))).toEqual(
      new Set(preview.words.map((w) => w.answer)),
    );
    const { data: t } = await admin
      .from("crossword_preview_tickets")
      .select("used_at")
      .eq("id", preview.ticket.ticketId)
      .single();
    expect(t!.used_at).not.toBeNull();
    const created = await auditOf(puzzleId, "crossword.created");
    expect(created).toHaveLength(1);
    expect(JSON.stringify(created[0].metadata)).not.toMatch(/사과|과일|일기|기차/);
  });

  it("a ticket is single use, and a wrong token or another teacher's ticket is refused", async () => {
    as(owner);
    const gen = (await generateCrosswordAction(
      idle,
      form({ setId: goodSet, level: "normal" }),
    )) as { ok: true; data: PreviewSuccess };
    const p = gen.data;
    const base = {
      setId: goodSet,
      level: "normal",
      seed: p.seed,
      ticketId: p.ticket.ticketId,
      title: title("once"),
    };
    expect(
      await saveCrosswordDraftAction(idle, form({ ...base, ticketToken: "x".repeat(43) })),
    ).toMatchObject({ ok: false, code: "TICKET_INVALID" });
    expect(
      (await saveCrosswordDraftAction(idle, form({ ...base, ticketToken: p.ticket.ticketToken })))
        .ok,
    ).toBe(true);
    expect(
      await saveCrosswordDraftAction(idle, form({ ...base, ticketToken: p.ticket.ticketToken })),
    ).toMatchObject({ ok: false, code: "TICKET_INVALID" });

    const gen2 = (await generateCrosswordAction(
      idle,
      form({ setId: goodSet, level: "normal" }),
    )) as { ok: true; data: PreviewSuccess };
    as(coTeacher);
    const stolen = await saveCrosswordDraftAction(
      idle,
      form({
        setId: goodSet,
        level: "normal",
        seed: gen2.data.seed,
        ticketId: gen2.data.ticket.ticketId,
        ticketToken: gen2.data.ticket.ticketToken,
        title: title("stolen"),
      }),
    );
    expect(stolen).toMatchObject({ ok: false, code: "TICKET_INVALID" });
  });

  it("refuses the save when the set changed after the preview", async () => {
    const set = await makeSet(owner.id, "changing", CHAIN);
    as(owner);
    const gen = (await generateCrosswordAction(idle, form({ setId: set, level: "normal" }))) as {
      ok: true;
      data: PreviewSuccess;
    };
    // The teacher edits the set in between: a new word with shared syllables changes the puzzle.
    const { count } = await admin
      .from("content_entries")
      .select("id", { count: "exact", head: true })
      .eq("set_id", set);
    await admin.from("content_entries").insert([
      {
        set_id: set,
        position: (count ?? 0) + 1,
        term: "기사",
        definition: "새 단어",
        answer: "기사",
        script: "hangul",
        normalizer_version: NORMALIZER_VERSION,
      },
      {
        set_id: set,
        position: (count ?? 0) + 2,
        term: "사기",
        definition: "새 단어 둘",
        answer: "사기",
        script: "hangul",
        normalizer_version: NORMALIZER_VERSION,
      },
      {
        set_id: set,
        position: (count ?? 0) + 3,
        term: "기술",
        definition: "새 단어 셋",
        answer: "기술",
        script: "hangul",
        normalizer_version: NORMALIZER_VERSION,
      },
    ]);
    const saved = await saveCrosswordDraftAction(
      idle,
      form({
        setId: set,
        level: "normal",
        seed: gen.data.seed,
        ticketId: gen.data.ticket.ticketId,
        ticketToken: gen.data.ticket.ticketToken,
        title: title("late"),
      }),
    );
    expect(saved).toMatchObject({ ok: false, code: "SET_CHANGED" });
    expect((saved as { error: string }).error).toContain("미리보기 이후 세트가 바뀌었습니다");
  });

  it("refuses an outsider and a title that is empty or too long", async () => {
    as(owner);
    const gen = (await generateCrosswordAction(
      idle,
      form({ setId: goodSet, level: "normal" }),
    )) as { ok: true; data: PreviewSuccess };
    const base = {
      setId: goodSet,
      level: "normal",
      seed: gen.data.seed,
      ticketId: gen.data.ticket.ticketId,
      ticketToken: gen.data.ticket.ticketToken,
    };
    expect(await saveCrosswordDraftAction(idle, form({ ...base, title: "   " }))).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(
      await saveCrosswordDraftAction(idle, form({ ...base, title: "가".repeat(81) })),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    as(outsider);
    expect((await saveCrosswordDraftAction(idle, form({ ...base, title: title("x") }))).ok).toBe(
      false,
    );
  });

  it("re-saves the grid of a version-1 draft in place with a new ticket", async () => {
    const { puzzleId } = await previewAndSave(owner, goodSet, "resave");
    as(owner);
    const gen = (await regenerateCrosswordAction(
      idle,
      form({ setId: goodSet, level: "normal" }),
    )) as { ok: true; data: PreviewSuccess };
    const again = await saveCrosswordDraftAction(
      idle,
      form({
        setId: goodSet,
        level: "normal",
        seed: gen.data.seed,
        ticketId: gen.data.ticket.ticketId,
        ticketToken: gen.data.ticket.ticketToken,
        title: title("resaved"),
        puzzleId,
      }),
    );
    expect(again.ok && again.data.puzzleId).toBe(puzzleId);
    const { data: p } = await admin
      .from("crossword_puzzles")
      .select("seed, placement_hash")
      .eq("id", puzzleId)
      .single();
    expect(p).toMatchObject({ seed: gen.data.seed, placement_hash: gen.data.placementHash });
    expect((await auditOf(puzzleId, "crossword.updated")).length).toBeGreaterThanOrEqual(1);
  });
});

// ---- edit draft --------------------------------------------------------------------------------------------

describe("M2-2.2c edit a draft", () => {
  it("changes title and clue wording only, audits field names without text, and refuses an outsider", async () => {
    const { puzzleId } = await previewAndSave(owner, goodSet, "edit");
    const detail = (await getPuzzleDetail(owner, puzzleId))!;
    const w = detail.words[0];
    as(coTeacher);
    const r = await updateCrosswordDraftAction(
      idle,
      form({
        puzzleId,
        title: "새 이름",
        clues: [{ number: w.number, direction: w.direction, clue: "고친 힌트 문장" }],
      }),
    );
    expect(r.ok).toBe(true);
    const after = (await getPuzzleDetail(owner, puzzleId))!;
    expect(after.puzzle.title).toBe("새 이름");
    expect(
      after.words.find((x) => x.number === w.number && x.direction === w.direction)!.clue,
    ).toBe("고친 힌트 문장");
    const audits = await auditOf(puzzleId, "crossword.updated");
    expect(JSON.stringify(audits)).not.toContain("고친 힌트 문장");

    as(outsider);
    expect((await updateCrosswordDraftAction(idle, form({ puzzleId, title: "x" }))).ok).toBe(false);
    as(owner);
    expect(
      await updateCrosswordDraftAction(
        idle,
        form({
          puzzleId,
          clues: [{ number: w.number, direction: w.direction, clue: "가".repeat(201) }],
        }),
      ),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await updateCrosswordDraftAction(idle, form({ puzzleId }))).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
});

// ---- publish, immutability, versions ----------------------------------------------------------------------

describe("M2-2.2c publish and lineage", () => {
  it("publishes to classrooms, freezes the puzzle and audits it", async () => {
    const { puzzleId } = await previewAndSave(owner, goodSet, "pub");
    as(owner);
    expect(
      await publishCrosswordAction(idle, form({ puzzleId, classroomIds: [roomArchived] })),
    ).toMatchObject({ ok: false, code: "CLASSROOM_ARCHIVED" });
    expect(
      await publishCrosswordAction(
        idle,
        form({ puzzleId, classroomIds: ["00000000-0000-4000-8000-0000000000ff"] }),
      ),
    ).toMatchObject({ ok: false, code: "CLASSROOM_INVALID" });
    as(coTeacher);
    expect(
      await publishCrosswordAction(idle, form({ puzzleId, classroomIds: [room2] })),
    ).toMatchObject({ ok: false, code: "CLASSROOM_INVALID" });
    as(owner);
    const r = await publishCrosswordAction(idle, form({ puzzleId, classroomIds: [room, room2] }));
    expect(r.ok && r.data.classroomIds.sort()).toEqual([room, room2].sort());
    const { data: p } = await admin
      .from("crossword_puzzles")
      .select("status, published_at")
      .eq("id", puzzleId)
      .single();
    expect(p!.status).toBe("published");
    expect(p!.published_at).not.toBeNull();
    expect(
      (
        await admin
          .from("crossword_assignments")
          .select("id")
          .eq("puzzle_id", puzzleId)
          .eq("status", "open")
      ).data,
    ).toHaveLength(2);
    expect(await auditOf(puzzleId, "crossword.published")).toHaveLength(1);

    // Immutable for every function and for direct writes.
    expect(await updateCrosswordDraftAction(idle, form({ puzzleId, title: "nope" }))).toMatchObject(
      { ok: false, code: "NOT_DRAFT" },
    );
    expect(
      await publishCrosswordAction(idle, form({ puzzleId, classroomIds: [room] })),
    ).toMatchObject({ ok: false, code: "NOT_DRAFT" });
    const direct = await admin
      .from("crossword_words")
      .update({ clue: "hack" })
      .eq("puzzle_id", puzzleId);
    expect(direct.error?.message).toContain("CROSSWORD_PUBLISHED_IMMUTABLE");
    const title_ = await admin
      .from("crossword_puzzles")
      .update({ title: "hack" })
      .eq("id", puzzleId);
    expect(title_.error?.message).toContain("CROSSWORD_PUBLISHED_IMMUTABLE");
  });

  it("refuses to publish a draft with fewer than 5 words (decision C2) even when written behind the service", async () => {
    const tinyId = crypto.randomUUID();
    const { data: puzzle } = await admin
      .from("crossword_puzzles")
      .insert({
        school_id: SCHOOL,
        owner_id: owner.id,
        set_id: goodSet,
        id: tinyId,
        root_id: tinyId,
        title: title("tiny"),
        level: "easy",
        settings: {},
        stats: {},
        seed: 1,
        generator_version: 1,
        placement_hash: "x",
        rows: 3,
        cols: 3,
      })
      .select("id")
      .single();
    await admin.from("crossword_words").insert([
      {
        puzzle_id: puzzle!.id,
        number: 1,
        direction: "across",
        row: 0,
        col: 0,
        answer: "사과",
        clue: "a",
      },
      {
        puzzle_id: puzzle!.id,
        number: 2,
        direction: "down",
        row: 0,
        col: 1,
        answer: "과일",
        clue: "b",
      },
    ]);
    as(owner);
    expect(
      await publishCrosswordAction(idle, form({ puzzleId: puzzle!.id, classroomIds: [room] })),
    ).toMatchObject({ ok: false, code: "TOO_FEW_WORDS" });
    expect(
      (await admin.from("crossword_puzzles").select("status").eq("id", puzzle!.id).single()).data!
        .status,
    ).toBe("draft");
  });

  it("creates version 2 (lineage), edits it, publishes it and supersedes version 1", async () => {
    const { puzzleId: v1 } = await previewAndSave(owner, goodSet, "lineage");
    as(owner);
    expect(await createCrosswordVersionAction(idle, form({ id: v1 }))).toMatchObject({
      ok: false,
      code: "VERSION_SOURCE_INVALID",
    }); // a draft is edited in place
    await publishCrosswordAction(idle, form({ puzzleId: v1, classroomIds: [room, room2] }));

    as(outsider);
    expect((await createCrosswordVersionAction(idle, form({ id: v1 }))).ok).toBe(false);
    as(coTeacher);
    const made = await createCrosswordVersionAction(idle, form({ id: v1 }));
    expect(made.ok).toBe(true);
    const v2 = (made as { ok: true; data: { puzzleId: string; version: number; rootId: string } })
      .data;
    expect(v2).toMatchObject({ version: 2, rootId: v1 });
    const { data: row } = await admin
      .from("crossword_puzzles")
      .select("root_id, version, supersedes_id, status, owner_id")
      .eq("id", v2.puzzleId)
      .single();
    expect(row).toMatchObject({
      root_id: v1,
      version: 2,
      supersedes_id: v1,
      status: "draft",
      owner_id: owner.id,
    });
    expect(await auditOf(v2.puzzleId, "crossword.copied")).toHaveLength(1);

    expect(await createCrosswordVersionAction(idle, form({ id: v1 }))).toMatchObject({
      ok: false,
      code: "VERSION_EXISTS",
    });
    // The grid of a later version is the grid it was copied from.
    const w = (await getPuzzleDetail(owner, v2.puzzleId))!.words[0];
    as(owner);
    expect(
      (
        await updateCrosswordDraftAction(
          idle,
          form({
            puzzleId: v2.puzzleId,
            clues: [{ number: w.number, direction: w.direction, clue: "버전 2 힌트" }],
          }),
        )
      ).ok,
    ).toBe(true);
    expect(
      (await getPuzzleDetail(owner, v1))!.words.find(
        (x) => x.number === w.number && x.direction === w.direction,
      )!.clue,
    ).not.toBe("버전 2 힌트");

    const pub = await publishCrosswordAction(
      idle,
      form({ puzzleId: v2.puzzleId, classroomIds: [room] }),
    );
    expect(pub.ok && pub.data.supersededPuzzleId).toBe(v1);
    expect(pub.ok && pub.data.supersededClassroomIds.sort()).toEqual([room, room2].sort());
    const detail1 = (await getPuzzleDetail(owner, v1))!;
    expect(detail1.puzzle.status).toBe("archived");
    expect(detail1.assignments.every((a) => a.status === "closed")).toBe(true);
    const lineage = (await getPuzzleDetail(owner, v2.puzzleId))!.versions;
    expect(lineage.map((v) => [v.version, v.status])).toEqual([
      [1, "archived"],
      [2, "published"],
    ]);
  });
});

// ---- archive / restore -------------------------------------------------------------------------------------

describe("M2-2.2c archive and restore", () => {
  it("archives and restores a never-published draft", async () => {
    const { puzzleId } = await previewAndSave(owner, goodSet, "arch");
    as(owner);
    expect(await unarchiveCrosswordAction(idle, form({ id: puzzleId }))).toMatchObject({
      ok: false,
      code: "NOT_ARCHIVED",
    });
    expect((await archiveCrosswordAction(idle, form({ id: puzzleId }))).ok).toBe(true);
    expect(await archiveCrosswordAction(idle, form({ id: puzzleId }))).toMatchObject({
      ok: false,
      code: "ALREADY_ARCHIVED",
    });
    expect((await listPuzzles(owner, "archived")).map((i) => i.id)).toContain(puzzleId);
    expect((await unarchiveCrosswordAction(idle, form({ id: puzzleId }))).ok).toBe(true);
    expect((await listPuzzles(owner, "draft")).map((i) => i.id)).toContain(puzzleId);
    expect(await auditOf(puzzleId, "crossword.archived")).toHaveLength(1);
    expect(await auditOf(puzzleId, "crossword.unarchived")).toHaveLength(1);
  });

  it("archives a published puzzle (assignments closed) but never restores it: a new version is required", async () => {
    const { puzzleId } = await previewAndSave(owner, goodSet, "arch-pub");
    as(owner);
    await publishCrosswordAction(idle, form({ puzzleId, classroomIds: [room] }));
    expect((await archiveCrosswordAction(idle, form({ id: puzzleId }))).ok).toBe(true);
    expect(
      (
        await admin.from("crossword_assignments").select("status").eq("puzzle_id", puzzleId)
      ).data!.every((a) => a.status === "closed"),
    ).toBe(true);
    expect(await unarchiveCrosswordAction(idle, form({ id: puzzleId }))).toMatchObject({
      ok: false,
      code: "RESTORE_NOT_ALLOWED",
    });
    expect((await createCrosswordVersionAction(idle, form({ id: puzzleId }))).ok).toBe(true);
  });

  it("returns 'not found' for a malformed id and refuses an outsider", async () => {
    as(owner);
    expect(await archiveCrosswordAction(idle, form({ id: "nope" }))).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    const { puzzleId } = await previewAndSave(owner, goodSet, "arch-out");
    as(outsider);
    expect((await archiveCrosswordAction(idle, form({ id: puzzleId }))).ok).toBe(false);
  });
});

// ---- assignments -------------------------------------------------------------------------------------------

describe("M2-2.2c assign to additional classrooms", () => {
  it("adds assignments to a published puzzle without touching it", async () => {
    const { puzzleId } = await previewAndSave(owner, goodSet, "assign");
    as(owner);
    expect(
      await addCrosswordAssignmentsAction(idle, form({ puzzleId, classroomIds: [room] })),
    ).toMatchObject({ ok: false, code: "NOT_PUBLISHED" });
    await publishCrosswordAction(idle, form({ puzzleId, classroomIds: [room] }));
    const before = (
      await admin.from("crossword_puzzles").select("updated_at, title").eq("id", puzzleId).single()
    ).data!;

    expect(
      await addCrosswordAssignmentsAction(idle, form({ puzzleId, classroomIds: [room] })),
    ).toMatchObject({ ok: false, code: "ALREADY_ASSIGNED" });
    expect(
      await addCrosswordAssignmentsAction(idle, form({ puzzleId, classroomIds: [roomArchived] })),
    ).toMatchObject({ ok: false, code: "CLASSROOM_ARCHIVED" });
    as(coTeacher);
    expect(
      await addCrosswordAssignmentsAction(idle, form({ puzzleId, classroomIds: [roomOther] })),
    ).toMatchObject({ ok: false, code: "CLASSROOM_INVALID" });
    as(owner);
    const added = await addCrosswordAssignmentsAction(
      idle,
      form({ puzzleId, classroomIds: [room2, roomOther] }),
    );
    expect(added.ok && added.data.classroomIds.sort()).toEqual([room2, roomOther].sort());
    expect(
      (
        await admin
          .from("crossword_assignments")
          .select("id")
          .eq("puzzle_id", puzzleId)
          .eq("status", "open")
      ).data,
    ).toHaveLength(3);
    expect(await auditOf(puzzleId, "crossword.assigned")).toHaveLength(1);
    expect(
      (
        await admin
          .from("crossword_puzzles")
          .select("updated_at, title")
          .eq("id", puzzleId)
          .single()
      ).data,
    ).toEqual(before);
  });

  it("closes one assignment and keeps the puzzle published", async () => {
    const { puzzleId } = await previewAndSave(owner, goodSet, "close");
    as(owner);
    await publishCrosswordAction(idle, form({ puzzleId, classroomIds: [room, room2] }));
    const { data: rows } = await admin
      .from("crossword_assignments")
      .select("id")
      .eq("puzzle_id", puzzleId);
    const first = rows![0].id;
    expect((await closeCrosswordAssignmentAction(idle, form({ id: first }))).ok).toBe(true);
    expect(await closeCrosswordAssignmentAction(idle, form({ id: first }))).toMatchObject({
      ok: false,
      code: "ASSIGNMENT_NOT_OPEN",
    });
    expect(
      (await admin.from("crossword_puzzles").select("status").eq("id", puzzleId).single()).data!
        .status,
    ).toBe("published");
    as(outsider);
    expect((await closeCrosswordAssignmentAction(idle, form({ id: rows![1].id }))).ok).toBe(false);
    expect(await auditOf(puzzleId, "crossword.assignment_closed")).toHaveLength(1);
  });
});

// ---- reads -------------------------------------------------------------------------------------------------

describe("M2-2.2c list and detail visibility", () => {
  it("shows a puzzle to its owner, the set's classroom staff and an admin, and hides it from an outsider and a student", async () => {
    const { puzzleId } = await previewAndSave(owner, goodSet, "visible");
    expect((await listPuzzles(owner, "draft")).map((i) => i.id)).toContain(puzzleId);
    expect((await listPuzzles(coTeacher, "draft")).map((i) => i.id)).toContain(puzzleId); // set linked to `room`
    expect((await listPuzzles(adminUser, "draft")).map((i) => i.id)).toContain(puzzleId);
    expect((await listPuzzles(outsider, "draft")).map((i) => i.id)).not.toContain(puzzleId);
    expect(await listPuzzles(student, "draft")).toEqual([]);
    expect(await getPuzzleDetail(outsider, puzzleId)).toBeNull();
    expect(await getPuzzleDetail(student, puzzleId)).toBeNull();
    expect(await getPuzzleDetail(owner, "not-a-uuid")).toBeNull();
    const item = (await listPuzzles(owner, "draft")).find((i) => i.id === puzzleId)!;
    expect(item).toMatchObject({
      status: "draft",
      version: 1,
      rootId: puzzleId,
      hasLiveSuccessor: false,
    });
    expect(item.wordCount).toBeGreaterThanOrEqual(5);
  });
});
