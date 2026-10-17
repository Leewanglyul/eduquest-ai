import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// M2-1.4: teacher management of word sets (list, detail, rename, archive/restore, single-entry edit)
// against the LOCAL Supabase stack. Only the identity lookup is mocked, as in the other access tests.
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

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  archiveContentSetAction,
  renameContentSetAction,
  unarchiveContentSetAction,
  updateContentEntryAction,
  type ContentEntryActionState,
  type ContentSetActionState,
} from "@/features/content/sets/actions";
import { getContentSetDetail, listContentSets } from "@/features/content/sets/service";
import { previewContentImportAction } from "@/features/content/import/actions";
import { NORMALIZER_VERSION } from "@/features/content/import/content-schemas";
import { contentErrorMessage } from "@/features/content/import/import-errors";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = `M${Date.now().toString(36)}`.toUpperCase();
const PASSWORD = "Tmp#pass12345";
const admin = createSupabaseAdminClient();
const startedAt = new Date().toISOString();

const mk = (id: string, role: Role, name: string): SessionProfile => ({ id, school_id: SCHOOL, role, display_name: name, status: "active" });

// owner = seed teacher; it OWNS the classrooms. coTeacher teaches them. Others have no access.
const owner = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const coTeacher = mk("00000000-0000-4000-8000-0000000000f1", "teacher", "AT co-teacher");
const outsider = mk("00000000-0000-4000-8000-0000000000f2", "teacher", "AT outsider");
const adminUser = mk("00000000-0000-4000-8000-0000000000f3", "admin", "AT admin");
const student = mk("00000000-0000-4000-8000-0000000000f5", "student", "AT student");
const allUsers = [owner, coTeacher, outsider, adminUser, student];

const as = (p: SessionProfile | null) => {
  session.profile = p;
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const idleSet: ContentSetActionState = { ok: false };
const idleEntry: ContentEntryActionState = { ok: false };

const rename = (setId: string, title: string) => renameContentSetAction(idleSet, form({ setId, title }));
const archive = (setId: string) => archiveContentSetAction(idleSet, form({ setId }));
const unarchive = (setId: string) => unarchiveContentSetAction(idleSet, form({ setId }));
const edit = (entryId: string, term: string, definition: string) =>
  updateContentEntryAction(idleEntry, form({ entryId, term, definition }));

let n = 0;
const title = (label: string) => `${RUN}-${label}-${(n += 1)}`;

// ---- fixtures -------------------------------------------------------------------------------

async function ensureUser(p: SessionProfile) {
  const existing = await admin.auth.admin.getUserById(p.id);
  if (!existing.data?.user) {
    const { error } = await admin.auth.admin.createUser({ id: p.id, email: `${p.id}@access.invalid`, password: PASSWORD, email_confirm: true });
    if (error && !/already|exists|registered/i.test(error.message)) throw error;
  }
  await admin.from("profiles").upsert({ id: p.id, school_id: p.school_id, role: p.role, display_name: p.display_name, status: "active" });
}

const classroomIds: string[] = [];
async function makeClassroom(archived = false) {
  const { data, error } = await admin
    .from("classrooms")
    .insert({ school_id: SCHOOL, owner_id: owner.id, name: title("반"), archived_at: archived ? new Date().toISOString() : null })
    .select("id")
    .single();
  if (error || !data) throw error;
  classroomIds.push(data.id);
  return data.id;
}

/** Inserts a set with live entries (term = answer = given word, definition "뜻"). */
async function makeSet(ownerId: string, label: string, words: string[], classroomId: string | null = null) {
  const { data, error } = await admin
    .from("content_sets")
    .insert({ school_id: SCHOOL, owner_id: ownerId, classroom_id: classroomId, title: title(label) })
    .select("id, title")
    .single();
  if (error || !data) throw error;
  if (words.length) {
    const { error: e2 } = await admin.from("content_entries").insert(
      words.map((w, i) => ({
        set_id: data.id,
        position: i + 1,
        term: w,
        definition: `${w}의 뜻`,
        answer: w.toUpperCase(),
        script: /^[A-Za-z]+$/.test(w) ? ("latin" as const) : ("hangul" as const),
        normalizer_version: NORMALIZER_VERSION,
      })),
    );
    if (e2) throw e2;
  }
  return { id: data.id, title: data.title };
}

const entriesOf = async (setId: string) =>
  (await admin.from("content_entries").select("*").eq("set_id", setId).order("position")).data ?? [];
const entryId = async (setId: string, position: number) => (await entriesOf(setId)).find((e) => e.position === position)!.id;
const auditOf = async (setId: string, action: string) =>
  (await admin.from("audit_logs").select("action, metadata").eq("resource_id", setId).eq("action", action as never)).data ?? [];

let room: string; // owned by `owner`, co-taught by `coTeacher`

beforeAll(async () => {
  for (const u of allUsers) await ensureUser(u);
  room = await makeClassroom();
  await admin.from("classroom_teachers").insert({ classroom_id: room, teacher_id: coTeacher.id });
}, 60_000);

afterAll(async () => {
  await admin.from("content_sets").delete().ilike("title", `${RUN}%`);
  await admin.from("content_import_batches").delete().in("actor_id", allUsers.map((u) => u.id)).gte("created_at", startedAt);
  if (classroomIds.length) await admin.from("classrooms").delete().in("id", classroomIds);
});

// ---- tests ----------------------------------------------------------------------------------

describe("M2-1.4 list", () => {
  it("shows the owner their sets and the sets of their classrooms, with counts", async () => {
    const mine = await makeSet(owner.id, "mine", ["사과", "도서관", "ICE"]);
    const byCo = await makeSet(coTeacher.id, "by-co", ["운동장"], room);
    const other = await makeSet(outsider.id, "other", ["학교"]);

    const items = await listContentSets(owner, "active");
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(mine.id)).toMatchObject({ mine: true, entryCount: 3, minAnswerLength: 2, maxAnswerLength: 3, classroomName: null });
    expect(byId.get(byCo.id)).toMatchObject({ mine: false, entryCount: 1, classroomId: room, classroomArchived: false });
    expect(byId.get(byCo.id)!.classroomName).toBeTruthy();
    expect(byId.has(other.id)).toBe(false);
  });

  it("shows a co-teacher the sets of their classroom, an outsider nothing of them, an admin everything", async () => {
    const linked = await makeSet(owner.id, "linked", ["사과"], room);
    const priv = await makeSet(owner.id, "private", ["포도"]);

    const co = (await listContentSets(coTeacher, "active")).map((i) => i.id);
    expect(co).toContain(linked.id);
    expect(co).not.toContain(priv.id);

    const out = (await listContentSets(outsider, "active")).map((i) => i.id);
    expect(out).not.toContain(linked.id);
    expect(out).not.toContain(priv.id);

    const adm = (await listContentSets(adminUser, "active")).map((i) => i.id);
    expect(adm).toEqual(expect.arrayContaining([linked.id, priv.id]));
  });

  it("returns nothing for a student", async () => {
    await makeSet(owner.id, "for-student", ["사과"], room);
    expect(await listContentSets(student, "active")).toEqual([]);
  });

  it("keeps archived sets in their own view", async () => {
    const set = await makeSet(owner.id, "to-archive", ["사과"]);
    as(owner);
    expect((await archive(set.id)).ok).toBe(true);
    expect((await listContentSets(owner, "active")).map((i) => i.id)).not.toContain(set.id);
    expect((await listContentSets(owner, "archived")).map((i) => i.id)).toContain(set.id);
  });

  it("still lists sets of an archived classroom, marked as such", async () => {
    const oldRoom = await makeClassroom(true);
    const set = await makeSet(owner.id, "old-room", ["사과"], oldRoom);
    const item = (await listContentSets(owner, "active")).find((i) => i.id === set.id)!;
    expect(item.classroomArchived).toBe(true);
  });
});

describe("M2-1.4 detail", () => {
  it("returns the live entries in order with the archived count, and flags read-only", async () => {
    const set = await makeSet(owner.id, "detail", ["사과", "도서관"]);
    await admin.from("content_entries").insert({
      set_id: set.id, position: 3, term: "옛단어", definition: "x", answer: "옛단어", script: "hangul",
      normalizer_version: NORMALIZER_VERSION, archived_at: new Date().toISOString(),
    });
    const detail = await getContentSetDetail(owner, set.id);
    expect(detail!.entries.map((e) => [e.position, e.term, e.answerLength])).toEqual([[1, "사과", 2], [2, "도서관", 3]]);
    expect(detail!.archivedEntryCount).toBe(1);
    expect(detail!.readOnly).toBe(false);
  });

  it("opens for the classroom owner on a co-teacher's set, but not for an outsider or a student", async () => {
    const set = await makeSet(coTeacher.id, "co-detail", ["운동장"], room);
    expect(await getContentSetDetail(owner, set.id)).not.toBeNull();
    expect(await getContentSetDetail(coTeacher, set.id)).not.toBeNull();
    expect(await getContentSetDetail(outsider, set.id)).toBeNull();
    expect(await getContentSetDetail(student, set.id)).toBeNull();
    expect(await getContentSetDetail(owner, "00000000-0000-4000-8000-00000000dead")).toBeNull();
  });

  it("is read-only when the set or its classroom is archived", async () => {
    const oldRoom = await makeClassroom(true);
    const set = await makeSet(owner.id, "ro", ["사과"], oldRoom);
    expect((await getContentSetDetail(owner, set.id))!.readOnly).toBe(true);
  });
});

describe("M2-1.4 rename", () => {
  it("cleans the title, saves it and audits the field without the text", async () => {
    const set = await makeSet(owner.id, "rename", ["사과"]);
    as(owner);
    const next = `  ${RUN}   새   이름 `;
    const state = await rename(set.id, next);
    expect(state).toEqual({ ok: true, title: `${RUN} 새 이름` });
    expect((await admin.from("content_sets").select("title").eq("id", set.id).single()).data!.title).toBe(`${RUN} 새 이름`);

    const audit = await auditOf(set.id, "content_set.updated");
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ fields: ["title"] });
    expect(JSON.stringify(audit)).not.toContain("새 이름");
    await admin.from("content_sets").update({ title: `${RUN}-renamed-${(n += 1)}` }).eq("id", set.id);
  });

  it("refuses a title the owner already uses (case and spaces ignored) but allows a case-only change of its own", async () => {
    const a = await makeSet(owner.id, "dup-a", ["사과"]);
    const b = await makeSet(owner.id, "dup-b", ["포도"]);
    as(owner);
    expect(await rename(b.id, ` ${a.title.toLowerCase()} `)).toEqual({ ok: false, error: contentErrorMessage("TITLE_DUPLICATE") });
    expect((await rename(a.id, a.title.toLowerCase())).ok).toBe(true);
  });

  it("refuses an empty or too long title", async () => {
    const set = await makeSet(owner.id, "bad-title", ["사과"]);
    as(owner);
    expect(await rename(set.id, "   ")).toEqual({ ok: false, error: contentErrorMessage("TITLE_INVALID") });
    expect(await rename(set.id, "가".repeat(81))).toEqual({ ok: false, error: contentErrorMessage("TITLE_INVALID") });
  });

  it("lets the classroom owner and a co-teacher rename a linked set; an outsider cannot", async () => {
    const set = await makeSet(coTeacher.id, "shared", ["운동장"], room);
    as(owner);
    expect((await rename(set.id, title("by-room-owner"))).ok).toBe(true);
    as(coTeacher);
    expect((await rename(set.id, title("by-co"))).ok).toBe(true);
    as(outsider);
    expect(await rename(set.id, title("by-outsider"))).toEqual({ ok: false, error: contentErrorMessage("SET_NOT_FOUND") });
    as(student);
    expect((await rename(set.id, title("by-student"))).ok).toBe(false);
    as(null);
    expect((await rename(set.id, title("by-nobody"))).ok).toBe(false);
  });

  it("is blocked for an archived set and for an archived classroom", async () => {
    const set = await makeSet(owner.id, "rename-archived", ["사과"]);
    as(owner);
    await archive(set.id);
    expect(await rename(set.id, title("x"))).toEqual({ ok: false, error: contentErrorMessage("SET_ARCHIVED") });

    const oldRoom = await makeClassroom(true);
    const linked = await makeSet(owner.id, "rename-ro", ["사과"], oldRoom);
    expect(await rename(linked.id, title("y"))).toEqual({ ok: false, error: contentErrorMessage("CLASSROOM_ARCHIVED") });
  });
});

describe("M2-1.4 archive and restore", () => {
  it("archives without touching the entries, audits the count, and the generator view drops it", async () => {
    const set = await makeSet(owner.id, "archive", ["사과", "도서관"]);
    as(owner);
    expect((await archive(set.id)).ok).toBe(true);

    expect((await entriesOf(set.id)).filter((e) => e.archived_at === null)).toHaveLength(2);
    expect((await admin.from("v_content_entries_active").select("entry_id").eq("set_id", set.id)).data).toHaveLength(0);
    const audit = await auditOf(set.id, "content_set.archived");
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ entryCount: 2 });
  });

  it("refuses to archive twice and to restore a live set", async () => {
    const set = await makeSet(owner.id, "twice", ["사과"]);
    as(owner);
    expect(await unarchive(set.id)).toEqual({ ok: false, error: contentErrorMessage("SET_NOT_ARCHIVED") });
    await archive(set.id);
    expect(await archive(set.id)).toEqual({ ok: false, error: contentErrorMessage("SET_ALREADY_ARCHIVED") });
  });

  it("restores a set and audits it", async () => {
    const set = await makeSet(owner.id, "restore", ["사과"]);
    as(owner);
    await archive(set.id);
    expect((await unarchive(set.id)).ok).toBe(true);
    expect((await listContentSets(owner, "active")).map((i) => i.id)).toContain(set.id);
    expect(await auditOf(set.id, "content_set.unarchived")).toHaveLength(1);
  });

  it("refuses to restore while the owner has a live set with the same title", async () => {
    const set = await makeSet(owner.id, "restore-dup", ["사과"]);
    as(owner);
    await archive(set.id);
    await admin.from("content_sets").insert({ school_id: SCHOOL, owner_id: owner.id, title: set.title });
    expect(await unarchive(set.id)).toEqual({ ok: false, error: contentErrorMessage("TITLE_DUPLICATE") });
  });

  it("is available to a co-teacher and the classroom owner, not to an outsider", async () => {
    const a = await makeSet(owner.id, "by-co-archive", ["사과"], room);
    as(coTeacher);
    expect((await archive(a.id)).ok).toBe(true);
    as(owner);
    expect((await unarchive(a.id)).ok).toBe(true);
    as(outsider);
    expect(await archive(a.id)).toEqual({ ok: false, error: contentErrorMessage("SET_NOT_FOUND") });
    as(student);
    expect((await archive(a.id)).ok).toBe(false);
  });

  it("is blocked for an archived classroom (read-only) and blocks imports into an archived set", async () => {
    const oldRoom = await makeClassroom(true);
    const linked = await makeSet(owner.id, "ro-archive", ["사과"], oldRoom);
    as(owner);
    expect(await archive(linked.id)).toEqual({ ok: false, error: contentErrorMessage("CLASSROOM_ARCHIVED") });

    const set = await makeSet(owner.id, "import-after", ["사과"]);
    await archive(set.id);
    const csv = new File([new TextEncoder().encode("term,definition\n포도,과일")], "a.csv", { type: "text/csv" });
    const fd = form({ mode: "append", setId: set.id });
    fd.set("file", csv);
    expect(await previewImportState(fd)).toEqual({ ok: false, error: contentErrorMessage("SET_ARCHIVED") });
  });
});

async function previewImportState(fd: FormData) {
  return previewContentImportAction({ ok: false }, fd);
}

describe("M2-1.4 single entry edit", () => {
  it("re-derives the answer, length, script and version, bumps the set and audits the fields without text", async () => {
    const set = await makeSet(owner.id, "edit", ["사과", "도서관"]);
    const id = await entryId(set.id, 2);
    const before = (await admin.from("content_sets").select("updated_at").eq("id", set.id).single()).data!.updated_at;
    as(owner);

    const state = await edit(id, "  ice   cream ", "차가운 간식");
    expect(state.ok, state.errors?.join()).toBe(true);
    expect(state.saved).toEqual({ term: "ice cream", definition: "차가운 간식", answer: "ICECREAM", answerLength: 8, changed: true });

    const row = (await entriesOf(set.id)).find((e) => e.id === id)!;
    expect(row).toMatchObject({ term: "ice cream", definition: "차가운 간식", answer: "ICECREAM", answer_length: 8, script: "latin", normalizer_version: NORMALIZER_VERSION });
    expect((await admin.from("content_sets").select("updated_at").eq("id", set.id).single()).data!.updated_at >= before).toBe(true);
    expect((await admin.from("v_content_entries_active").select("answer").eq("entry_id", id).single()).data!.answer).toBe("ICECREAM");

    const audit = await auditOf(set.id, "content_entry.updated");
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ entryId: id, fields: ["term", "definition", "answer"] });
    expect(JSON.stringify(audit)).not.toContain("ice cream");
    expect(JSON.stringify(audit)).not.toContain("차가운");
  });

  it("changing only the definition keeps the answer and audits one field; no change writes nothing", async () => {
    const set = await makeSet(owner.id, "edit-def", ["사과"]);
    const id = await entryId(set.id, 1);
    as(owner);
    expect((await edit(id, "사과", "새로운 뜻")).saved).toMatchObject({ answer: "사과", changed: true });
    expect((await auditOf(set.id, "content_entry.updated"))[0].metadata).toMatchObject({ fields: ["definition"] });

    const same = await edit(id, " 사과 ", "새로운 뜻");
    expect(same.ok).toBe(true);
    expect(same.saved!.changed).toBe(false);
    expect(await auditOf(set.id, "content_entry.updated")).toHaveLength(1);
  });

  it("applies the importer's rules and reports every broken one in Korean, leaving the entry as it was", async () => {
    const set = await makeSet(owner.id, "edit-rules", ["사과"]);
    const id = await entryId(set.id, 1);
    as(owner);

    const cases: [string, string, string][] = [
      ["", "뜻", contentRowMessage("TERM_EMPTY")],
      ["사과", "  ", contentRowMessage("DEFINITION_EMPTY")],
      ["1.5", "뜻", "숫자 형태"],
      ["사과(과일)", "뜻", "정답에 쓸 수 없는 문자"],
      ["ㄱㄴㄷ", "뜻", "자음/모음"],
      ["A".repeat(16), "뜻", "최대 15글자"],
      ["---", "뜻", "최소 1글자"],
    ];
    for (const [term, definition, expected] of cases) {
      const state = await edit(id, term, definition);
      expect(state.ok, term).toBe(false);
      expect(state.errors!.join(" "), term).toContain(expected);
    }
    const row = (await entriesOf(set.id))[0];
    expect([row.term, row.definition, row.answer]).toEqual(["사과", "사과의 뜻", "사과"]);
    expect(await auditOf(set.id, "content_entry.updated")).toHaveLength(0);
  });

  it("allows a one-character answer and keeps a formula-looking definition verbatim, with a warning", async () => {
    const set = await makeSet(owner.id, "edit-misc", ["사과"]);
    const id = await entryId(set.id, 1);
    as(owner);
    const one = await edit(id, "물", "=1+1");
    expect(one.ok).toBe(true);
    expect(one.saved).toMatchObject({ answer: "물", answerLength: 1 });
    expect(one.warnings!.join(" ")).toContain("수식 기호");
    expect((await entriesOf(set.id))[0].definition).toBe("=1+1");
  });

  it("refuses an answer that another live entry of the set has, but allows one that was only archived", async () => {
    const set = await makeSet(owner.id, "edit-dup", ["사과", "포도"]);
    await admin.from("content_entries").insert({
      set_id: set.id, position: 3, term: "수박", definition: "x", answer: "수박", script: "hangul",
      normalizer_version: NORMALIZER_VERSION, archived_at: new Date().toISOString(),
    });
    const id = await entryId(set.id, 2);
    as(owner);
    expect(await edit(id, "  사과 ", "다른 뜻")).toEqual({ ok: false, errors: [contentErrorMessage("ENTRY_DUPLICATE")] });
    expect((await edit(id, "수박", "과일")).ok).toBe(true);
  });

  it("lets the classroom owner and a co-teacher edit; hides the entry from an outsider", async () => {
    const set = await makeSet(coTeacher.id, "edit-shared", ["운동장"], room);
    const id = await entryId(set.id, 1);
    as(owner);
    expect((await edit(id, "운동장", "owner edit")).ok).toBe(true);
    as(coTeacher);
    expect((await edit(id, "운동장", "co edit")).ok).toBe(true);
    as(adminUser);
    expect((await edit(id, "운동장", "admin edit")).ok).toBe(true);
    as(outsider);
    expect(await edit(id, "운동장", "outsider")).toEqual({ ok: false, errors: [contentErrorMessage("ENTRY_NOT_FOUND")] });
    as(student);
    expect((await edit(id, "운동장", "student")).ok).toBe(false);
    as(null);
    expect((await edit(id, "운동장", "nobody")).ok).toBe(false);
    expect((await entriesOf(set.id))[0].definition).toBe("admin edit");
  });

  it("refuses unknown, replaced (archived) and malformed entry ids", async () => {
    const set = await makeSet(owner.id, "edit-gone", ["사과"]);
    const id = await entryId(set.id, 1);
    await admin.from("content_entries").update({ archived_at: new Date().toISOString() }).eq("id", id);
    as(owner);
    expect(await edit(id, "사과", "x")).toEqual({ ok: false, errors: [contentErrorMessage("ENTRY_NOT_FOUND")] });
    expect((await edit("00000000-0000-4000-8000-00000000dead", "사과", "x")).errors).toEqual([contentErrorMessage("ENTRY_NOT_FOUND")]);
    expect(await edit("not-a-uuid", "사과", "x")).toEqual({ ok: false, errors: [contentErrorMessage("ENTRY_NOT_FOUND")] });
    expect(await rename("not-a-uuid", "새 이름")).toEqual({ ok: false, error: contentErrorMessage("SET_NOT_FOUND") });
    expect(await archive("")).toEqual({ ok: false, error: contentErrorMessage("SET_NOT_FOUND") });
  });

  it("is blocked for an archived set and for an archived classroom", async () => {
    const set = await makeSet(owner.id, "edit-archived", ["사과"]);
    const id = await entryId(set.id, 1);
    as(owner);
    await archive(set.id);
    expect(await edit(id, "사과", "x")).toEqual({ ok: false, errors: [contentErrorMessage("SET_ARCHIVED")] });

    const oldRoom = await makeClassroom(true);
    const linked = await makeSet(owner.id, "edit-ro", ["사과"], oldRoom);
    expect(await edit(await entryId(linked.id, 1), "사과", "x")).toEqual({ ok: false, errors: [contentErrorMessage("CLASSROOM_ARCHIVED")] });
  });
});

function contentRowMessage(code: "TERM_EMPTY" | "DEFINITION_EMPTY") {
  return code === "TERM_EMPTY" ? "용어가 비어 있습니다." : "뜻이 비어 있습니다.";
}
