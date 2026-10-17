import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// M2-1.2: the upload flow (preview -> single-use commit) against the LOCAL Supabase stack.
//
// Only the identity lookup is mocked (who is the caller?), exactly like actions-authorization.test.ts.
// The guards, the services, the database function fn_commit_content_import and the tables are real.
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
  commitContentImportAction,
  previewContentImportAction,
  type ContentPreviewState,
  type ContentRunState,
} from "@/features/content/import/actions";
import {
  MAX_ACTIVE_PREVIEWS,
  MAX_CONTENT_CSV_BYTES,
  MAX_CONTENT_ROWS,
  MAX_SET_ENTRIES,
  type ContentImportMode,
} from "@/features/content/import/content-schemas";
import {
  buildCommitPayload,
  cleanupContentImportBatches,
  commitContentImport,
} from "@/features/content/import/import-service";
import { hashContentRows } from "@/features/content/import/rows-hash";
import { buildContentPreview } from "@/features/content/import/preview";
import { parseContentCsv } from "@/features/content/import/csv-parse";
import { contentErrorMessage } from "@/features/content/import/import-errors";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = `C${Date.now().toString(36)}`.toUpperCase();
const PASSWORD = "Tmp#pass12345";
const admin = createSupabaseAdminClient();
const startedAt = new Date().toISOString();

const mk = (id: string, role: Role, name: string): SessionProfile => ({
  id,
  school_id: SCHOOL,
  role,
  display_name: name,
  status: "active",
});

// owner = teacher@example.com from supabase/seed.sql; it also OWNS the classroom used below.
const owner = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const coTeacher = mk("00000000-0000-4000-8000-0000000000f1", "teacher", "AT co-teacher");
const outsider = mk("00000000-0000-4000-8000-0000000000f2", "teacher", "AT outsider");
const adminUser = mk("00000000-0000-4000-8000-0000000000f3", "admin", "AT admin");
const spammer = mk("00000000-0000-4000-8000-0000000000f4", "teacher", "AT preview spammer");
const student = mk("00000000-0000-4000-8000-0000000000f5", "student", "AT student");
const allUsers = [owner, coTeacher, outsider, adminUser, spammer, student];

const as = (p: SessionProfile | null) => {
  session.profile = p;
};

const idlePreview: ContentPreviewState = { ok: false };
const idleRun: ContentRunState = { ok: false };

const csvOf = (...pairs: [string, string][]) => ["term,definition", ...pairs.map(([t, d]) => `${t},${d}`)].join("\n");
const fileOf = (content: string | Uint8Array<ArrayBuffer>, name = "words.csv") =>
  new File([typeof content === "string" ? new TextEncoder().encode(content) : content], name, { type: "text/csv" });

type Fields = {
  content?: string | Uint8Array<ArrayBuffer>;
  mode?: ContentImportMode;
  newSetTitle?: string;
  setId?: string;
  classroomId?: string;
  batchId?: string;
  commitToken?: string;
  confirmReplace?: boolean;
};
const formOf = (f: Fields) => {
  const fd = new FormData();
  if (f.content !== undefined) fd.set("file", fileOf(f.content));
  if (f.mode) fd.set("mode", f.mode);
  if (f.newSetTitle !== undefined) fd.set("newSetTitle", f.newSetTitle);
  if (f.setId) fd.set("setId", f.setId);
  if (f.classroomId) fd.set("classroomId", f.classroomId);
  if (f.batchId) fd.set("batchId", f.batchId);
  if (f.commitToken) fd.set("commitToken", f.commitToken);
  if (f.confirmReplace) fd.set("confirmReplace", "true");
  return fd;
};

const preview = (f: Fields) => previewContentImportAction(idlePreview, formOf(f));
const commit = (f: Fields) => commitContentImportAction(idleRun, formOf(f));

let n = 0;
const title = (label: string) => `${RUN}-${label}-${(n += 1)}`;

const batchCount = async (actorId: string) => {
  const { count } = await admin.from("content_import_batches").select("id", { count: "exact", head: true }).eq("actor_id", actorId);
  return count ?? 0;
};
const liveEntries = async (setId: string) => {
  const { data } = await admin.from("content_entries").select("answer, position, archived_at").eq("set_id", setId);
  return (data ?? []).filter((e) => e.archived_at === null);
};
const batchRow = async (id: string) => (await admin.from("content_import_batches").select("*").eq("id", id).single()).data!;

/** Preview + commit in one go; returns the set id. */
async function createSet(who: SessionProfile, label: string, pairs: [string, string][], classroomId?: string) {
  as(who);
  const t = title(label);
  const content = csvOf(...pairs);
  const p = await preview({ content, mode: "create", newSetTitle: t, classroomId });
  expect(p.ok, p.error).toBe(true);
  const c = await commit({ content, mode: "create", newSetTitle: t, classroomId, batchId: p.batchId, commitToken: p.commitToken });
  expect(c.ok, c.error).toBe(true);
  return c.result!.setId;
}

// ---- fixtures -------------------------------------------------------------------------------

async function ensureUser(p: SessionProfile) {
  const existing = await admin.auth.admin.getUserById(p.id);
  if (existing.data?.user) {
    await admin.from("profiles").upsert({ id: p.id, school_id: p.school_id, role: p.role, display_name: p.display_name, status: "active" });
    return;
  }
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

const classroomIds: string[] = [];
async function makeClassroom(options: { archived?: boolean } = {}) {
  const { data, error } = await admin
    .from("classrooms")
    .insert({ school_id: SCHOOL, owner_id: owner.id, name: title("반"), archived_at: options.archived ? new Date().toISOString() : null })
    .select("id")
    .single();
  if (error || !data) throw error;
  classroomIds.push(data.id);
  return data.id;
}

let room: string; // owned by `owner`, co-taught by `coTeacher`

beforeAll(async () => {
  for (const u of allUsers) await ensureUser(u);
  room = await makeClassroom();
  await admin.from("classroom_teachers").insert({ classroom_id: room, teacher_id: coTeacher.id });
}, 60_000);

afterAll(async () => {
  await admin.from("content_sets").delete().like("title", `${RUN}-%`);
  await admin.from("content_import_batches").delete().in("actor_id", allUsers.map((u) => u.id)).gte("created_at", startedAt);
  if (classroomIds.length) await admin.from("classrooms").delete().in("id", classroomIds);
});

// ---- tests ----------------------------------------------------------------------------------

describe("M2-1.2 upload: create", () => {
  it("previews without writing a set, then commits once", async () => {
    as(owner);
    const t = title("create");
    const content = csvOf(["사과", "빨간 과일"], ["도서관", "책을 빌리는 곳"], ["사과", "중복"], ["물!", "잘못된 정답"]);
    const p = await preview({ content, mode: "create", newSetTitle: t });

    expect(p.ok).toBe(true);
    expect(p.batchId && p.commitToken && p.expiresAt).toBeTruthy();
    expect(p.preview!.valid.map((r) => r.answer)).toEqual(["사과", "도서관"]);
    expect(p.preview!.invalid.map((i) => [i.line, i.errors[0]])).toEqual([[4, "DUP_IN_FILE_CONFLICT"], [5, "ANSWER_INVALID_CHAR"]]);
    expect((await admin.from("content_sets").select("id").eq("title", t)).data).toHaveLength(0);

    const batch = await batchRow(p.batchId!);
    expect(batch).toMatchObject({ status: "previewed", mode: "create", set_id: null, total_rows: 2, actor_id: owner.id });
    expect(batch.commit_token_hash).not.toBe(p.commitToken); // only a hash is stored
    expect(batch.source_bytes).toBe(new TextEncoder().encode(content).byteLength);

    const c = await commit({ content, mode: "create", newSetTitle: t, batchId: p.batchId, commitToken: p.commitToken });
    expect(c.ok, c.error).toBe(true);
    expect(c.result).toMatchObject({ created: true, accepted: 2, skipped: 0, archived: 0, title: t });

    const entries = await liveEntries(c.result!.setId);
    expect(entries.map((e) => [e.answer, e.position])).toEqual(expect.arrayContaining([["사과", 1], ["도서관", 2]]));
    expect((await batchRow(p.batchId!)).status).toBe("completed");
  });

  it("stores the TypeScript rows hash and the database computes the same one", async () => {
    as(owner);
    const t = title("hash");
    const content = csvOf(["사과", "과일"], ["ice cream", "차가운 간식"], ["광합성", "식물이 빛으로 양분을 만듦"]);
    const p = await preview({ content, mode: "create", newSetTitle: t, classroomId: room });
    expect(p.ok, p.error).toBe(true);

    const rows = buildContentPreview(parseContentCsv(content).rows, { mode: "create" }).commitRows;
    const target = { mode: "create" as const, setId: null, newSetTitle: t, classroomId: room };
    const { rowsHash, rpcRows } = buildCommitPayload(target, rows);
    expect((await batchRow(p.batchId!)).rows_hash).toBe(rowsHash);
    expect(rowsHash).toBe(hashContentRows({ ...target, rows }));

    const { data } = await admin.rpc("fn_content_rows_hash", {
      p_mode: "create",
      p_set_id: null as unknown as string,
      p_new_title: t,
      p_classroom_id: room,
      p_rows: rpcRows,
    });
    expect(data).toBe(rowsHash);
  });

  it("refuses a second commit with the same token and creates nothing twice", async () => {
    as(owner);
    const t = title("once");
    const content = csvOf(["사과", "과일"]);
    const p = await preview({ content, mode: "create", newSetTitle: t });
    const first = await commit({ content, mode: "create", newSetTitle: t, batchId: p.batchId, commitToken: p.commitToken });
    expect(first.ok).toBe(true);

    const again = await commit({ content, mode: "create", newSetTitle: t, batchId: p.batchId, commitToken: p.commitToken });
    expect(again).toEqual({ ok: false, error: contentErrorMessage("BATCH_NOT_FOUND") });
    expect((await admin.from("content_sets").select("id").eq("title", t)).data).toHaveLength(1);
  });

  it("refuses a different file, a different title and a wrong token, and the batch stays usable", async () => {
    as(owner);
    const t = title("bound");
    const content = csvOf(["사과", "과일"], ["포도", "과일"]);
    const p = await preview({ content, mode: "create", newSetTitle: t });

    const other = await commit({ content: csvOf(["사과", "과일"], ["수박", "과일"]), mode: "create", newSetTitle: t, batchId: p.batchId, commitToken: p.commitToken });
    expect(other).toEqual({ ok: false, error: contentErrorMessage("ROWS_CHANGED") });
    const retitled = await commit({ content, mode: "create", newSetTitle: `${t}x`, batchId: p.batchId, commitToken: p.commitToken });
    expect(retitled).toEqual({ ok: false, error: contentErrorMessage("ROWS_CHANGED") });
    const badToken = await commit({ content, mode: "create", newSetTitle: t, batchId: p.batchId, commitToken: "not-the-token" });
    expect(badToken).toEqual({ ok: false, error: contentErrorMessage("COMMIT_TOKEN_INVALID") });
    expect((await batchRow(p.batchId!)).status).toBe("previewed");

    const good = await commit({ content, mode: "create", newSetTitle: t, batchId: p.batchId, commitToken: p.commitToken });
    expect(good.ok, good.error).toBe(true);
  });

  it("marks an expired preview expired and writes nothing", async () => {
    as(owner);
    const t = title("expired");
    const content = csvOf(["사과", "과일"]);
    const p = await preview({ content, mode: "create", newSetTitle: t });
    await admin.from("content_import_batches").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", p.batchId!);

    const c = await commit({ content, mode: "create", newSetTitle: t, batchId: p.batchId, commitToken: p.commitToken });
    expect(c).toEqual({ ok: false, error: contentErrorMessage("BATCH_EXPIRED") });
    expect((await batchRow(p.batchId!)).status).toBe("expired");
    expect((await admin.from("content_sets").select("id").eq("title", t)).data).toHaveLength(0);
  });

  it("refuses a title the teacher already uses, at preview", async () => {
    const t = title("dup-title");
    await createSetWithTitle(t);
    const p = await preview({ content: csvOf(["사과", "과일"]), mode: "create", newSetTitle: ` ${t.toLowerCase()} ` });
    expect(p).toEqual({ ok: false, error: contentErrorMessage("TITLE_DUPLICATE") });
  });

  it("writes audit rows without any term or definition", async () => {
    const setId = await createSet(owner, "audit", [["은하수", "별들이 모여 있는 띠"]]);
    const { data } = await admin.from("audit_logs").select("action, metadata, resource_type").eq("resource_id", setId);
    expect((data ?? []).map((a) => a.action).sort()).toEqual(["content_set.created", "content_set.import_completed"]);
    const text = JSON.stringify(data);
    expect(text).not.toContain("은하수");
    expect(text).not.toContain("별들이");
    expect(text).toContain("sourceSha256");
  });
});

async function createSetWithTitle(t: string) {
  as(owner);
  const content = csvOf(["사과", "과일"]);
  const p = await preview({ content, mode: "create", newSetTitle: t });
  const c = await commit({ content, mode: "create", newSetTitle: t, batchId: p.batchId, commitToken: p.commitToken });
  expect(c.ok, c.error).toBe(true);
  return c.result!.setId;
}

describe("M2-1.2 upload: append and replace", () => {
  it("append flags words already in the set and the database skips one that landed after the preview", async () => {
    const setId = await createSet(owner, "append", [["사과", "과일"], ["포도", "과일"]]);
    const content = csvOf(["사과", "과일"], ["수박", "과일"], ["참외", "과일"]);

    const p = await preview({ content, mode: "append", setId });
    expect(p.ok, p.error).toBe(true);
    expect(p.preview!.valid.map((r) => r.term)).toEqual(["수박", "참외"]);
    expect(p.preview!.invalid.map((i) => i.errors[0])).toEqual(["DUP_EXISTING"]);

    // Another import lands between preview and commit: the same answer is now live.
    const other = await preview({ content: csvOf(["수박", "다른 뜻"]), mode: "append", setId });
    expect((await commit({ content: csvOf(["수박", "다른 뜻"]), mode: "append", setId, batchId: other.batchId, commitToken: other.commitToken })).ok).toBe(true);

    const c = await commit({ content, mode: "append", setId, batchId: p.batchId, commitToken: p.commitToken });
    expect(c.ok, c.error).toBe(true);
    expect(c.result).toMatchObject({ created: false, accepted: 1, skipped: 2, archived: 0 });
    expect((await liveEntries(setId)).map((e) => e.answer).sort()).toEqual(["사과", "수박", "참외", "포도"].sort());
  });

  it("append with nothing new gives no token", async () => {
    const setId = await createSet(owner, "append-none", [["사과", "과일"]]);
    const before = await batchCount(owner.id);
    const p = await preview({ content: csvOf(["사과", "과일"]), mode: "append", setId });
    expect(p.ok).toBe(true);
    expect(p.batchId).toBeUndefined();
    expect(p.preview!.valid).toHaveLength(0);
    expect(await batchCount(owner.id)).toBe(before);
  });

  it("replace needs the confirmation, then archives the old words and keeps them", async () => {
    const setId = await createSet(owner, "replace", [["사과", "과일"], ["포도", "과일"]]);
    const content = csvOf(["수박", "과일"]);
    const p = await preview({ content, mode: "replace", setId });
    expect(p.preview!.willArchive).toBe(2);

    const unconfirmed = await commit({ content, mode: "replace", setId, batchId: p.batchId, commitToken: p.commitToken });
    expect(unconfirmed).toEqual({ ok: false, error: contentErrorMessage("REPLACE_NOT_CONFIRMED") });
    expect((await liveEntries(setId)).map((e) => e.answer).sort()).toEqual(["사과", "포도"].sort());

    const c = await commit({ content, mode: "replace", setId, batchId: p.batchId, commitToken: p.commitToken, confirmReplace: true });
    expect(c.ok, c.error).toBe(true);
    expect(c.result).toMatchObject({ accepted: 1, archived: 2 });
    expect((await liveEntries(setId)).map((e) => e.answer)).toEqual(["수박"]);
    const { data } = await admin.from("content_entries").select("answer, archived_batch_id").eq("set_id", setId).not("archived_at", "is", null);
    expect(data).toHaveLength(2);
    expect(data!.every((e) => e.archived_batch_id === p.batchId)).toBe(true);
  });

  it("notes a file that was already uploaded to the set", async () => {
    const setId = await createSet(owner, "same-file", [["사과", "과일"]]);
    const p = await preview({ content: csvOf(["사과", "과일"], ["배추", "채소"]), mode: "append", setId });
    expect(p.preview!.notices).toEqual([]);
    const content = csvOf(["참외", "과일"]);
    const first = await preview({ content, mode: "append", setId });
    await commit({ content, mode: "append", setId, batchId: first.batchId, commitToken: first.commitToken });
    const again = await preview({ content, mode: "replace", setId });
    expect(again.preview!.notices.join(" ")).toContain("이미 올렸습니다");
  });

  it("enforces the set size at preview and at commit", async () => {
    const full = Array.from({ length: MAX_SET_ENTRIES - 1 }, (_, i) => [`단어${String.fromCharCode(0xac00 + i)}`, "뜻"] as [string, string]);
    const setId = await createSetInChunks(full);
    const two = csvOf(["가나다", "뜻"], ["라마바", "뜻"]);
    const p = await preview({ content: two, mode: "append", setId });
    expect(p).toEqual({
      ok: false,
      error: `세트에는 단어를 최대 ${MAX_SET_ENTRIES}개까지 담을 수 있습니다. (현재 ${MAX_SET_ENTRIES - 1}개, 추가 2개)`,
    });

    // The database refuses too, when a preview was taken while there was room.
    const one = csvOf(["가나다", "뜻"]);
    const ok = await preview({ content: one, mode: "append", setId });
    expect(ok.ok).toBe(true);
    const sneak = await preview({ content: csvOf(["아자차", "뜻"]), mode: "append", setId });
    await commit({ content: csvOf(["아자차", "뜻"]), mode: "append", setId, batchId: sneak.batchId, commitToken: sneak.commitToken });
    const late = await commit({ content: one, mode: "append", setId, batchId: ok.batchId, commitToken: ok.commitToken });
    expect(late.ok).toBe(false);
    expect(late.error).toContain(`최대 ${MAX_SET_ENTRIES}개`);
    expect((await liveEntries(setId)).length).toBe(MAX_SET_ENTRIES);
  }, 60_000);
});

async function createSetInChunks(pairs: [string, string][]) {
  const [first, ...rest] = [pairs.slice(0, MAX_CONTENT_ROWS), ...chunks(pairs.slice(MAX_CONTENT_ROWS), MAX_CONTENT_ROWS)];
  const setId = await createSet(owner, "big", first);
  for (const part of rest) {
    const content = csvOf(...part);
    const p = await preview({ content, mode: "append", setId });
    expect((await commit({ content, mode: "append", setId, batchId: p.batchId, commitToken: p.commitToken })).ok).toBe(true);
  }
  return setId;
}
function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

describe("M2-1.2 upload: caps and file errors", () => {
  it("refuses cap + 1 rows at preview without storing a ticket", async () => {
    as(owner);
    const before = await batchCount(owner.id);
    const pairs = Array.from({ length: MAX_CONTENT_ROWS + 1 }, (_, i) => [`단어${i}`.replace(/\d/g, (d) => String.fromCharCode(0xac00 + Number(d))) + "가", "뜻"] as [string, string]);
    const p = await preview({ content: csvOf(...pairs), mode: "create", newSetTitle: title("cap") });
    expect(p.ok).toBe(false);
    expect(p.error).toContain(`${MAX_CONTENT_ROWS + 1}개`);
    expect(p.error).toContain(`최대 ${MAX_CONTENT_ROWS}개`);
    expect(await batchCount(owner.id)).toBe(before);
  });

  it("accepts exactly the cap", async () => {
    as(owner);
    const pairs = Array.from({ length: MAX_CONTENT_ROWS }, (_, i) => [`${String.fromCharCode(0xac00 + Math.floor(i / 10))}${String.fromCharCode(0xb000 + (i % 10))}`, "뜻"] as [string, string]);
    const p = await preview({ content: csvOf(...pairs), mode: "create", newSetTitle: title("cap-ok") });
    expect(p.ok, p.error).toBe(true);
    expect(p.preview!.valid).toHaveLength(MAX_CONTENT_ROWS);
  });

  it("refuses an over-cap file at commit even with a valid token, and the batch stays previewed", async () => {
    as(owner);
    const t = title("cap-commit");
    const small = csvOf(["사과", "과일"]);
    const p = await preview({ content: small, mode: "create", newSetTitle: t });
    const pairs = Array.from({ length: MAX_CONTENT_ROWS + 1 }, (_, i) => [`가${String.fromCharCode(0xac00 + i)}`, "뜻"] as [string, string]);
    const c = await commit({ content: csvOf(...pairs), mode: "create", newSetTitle: t, batchId: p.batchId, commitToken: p.commitToken });
    expect(c.ok).toBe(false);
    expect(c.error).toContain(`최대 ${MAX_CONTENT_ROWS}개`);
    expect((await batchRow(p.batchId!)).status).toBe("previewed");
    expect((await admin.from("content_sets").select("id").eq("title", t)).data).toHaveLength(0);
  });

  it("refuses one byte over the size cap at preview and at commit", async () => {
    as(owner);
    const head = "term,definition\n사과,";
    const exact = head + "x".repeat(MAX_CONTENT_CSV_BYTES - new TextEncoder().encode(head).byteLength);
    const p = await preview({ content: exact, mode: "create", newSetTitle: title("bytes") });
    // The size check passed (exactly the cap); the single row is rejected by the definition length rule instead.
    expect(p.ok, p.error).toBe(true);
    expect(p.batchId).toBeUndefined();
    expect(p.preview!.invalid[0].errors).toContain("DEFINITION_TOO_LONG");

    const over = await preview({ content: exact + "x", mode: "create", newSetTitle: title("bytes") });
    expect(over).toEqual({ ok: false, error: contentErrorMessage("FILE_TOO_LARGE") });
    const overCommit = await commit({ content: exact + "x", mode: "create", newSetTitle: title("bytes"), batchId: "x", commitToken: "y" });
    expect(overCommit).toEqual({ ok: false, error: contentErrorMessage("FILE_TOO_LARGE") });
  });

  it("refuses CP949, a missing header, a wrong delimiter and a missing file; nothing is stored", async () => {
    as(owner);
    const before = await batchCount(owner.id);
    const cp949 = new Uint8Array([...new TextEncoder().encode("term,definition\n"), 0xbb, 0xe7, 0xb0, 0xfa, 0x2c, 0x61]);
    expect((await preview({ content: cp949, mode: "create", newSetTitle: title("enc") })).error).toBe(contentErrorMessage("ENCODING_INVALID"));
    expect((await preview({ content: "민주주의,국민이 주인이 되는 정치 체제\n삼권분립,권력을 나누는 원칙", mode: "create", newSetTitle: title("hdr") })).error).toBe(contentErrorMessage("MISSING_HEADER"));
    expect((await preview({ content: "term;definition\n사과;과일", mode: "create", newSetTitle: title("del") })).error).toBe(contentErrorMessage("DELIMITER_UNSUPPORTED"));
    expect((await preview({ mode: "create", newSetTitle: title("none") })).error).toBe(contentErrorMessage("FILE_MISSING"));
    expect((await preview({ content: csvOf(["사과", "과일"]), mode: "create", newSetTitle: "   " })).error).toBe(contentErrorMessage("TITLE_INVALID"));
    expect((await preview({ content: csvOf(["사과", "과일"]), newSetTitle: title("mode") })).error).toBe(contentErrorMessage("MODE_INVALID"));
    expect(await batchCount(owner.id)).toBe(before);
  });

  it("returns the preview without a token when no row is valid", async () => {
    as(owner);
    const before = await batchCount(owner.id);
    const p = await preview({ content: csvOf(["", "x"], ["사과", ""]), mode: "create", newSetTitle: title("none-valid") });
    expect(p.ok).toBe(true);
    expect(p.batchId).toBeUndefined();
    expect(p.preview!.invalid).toHaveLength(2);
    expect(await batchCount(owner.id)).toBe(before);
  });
});

describe("M2-1.2 upload: who may import where", () => {
  it("refuses an unauthenticated caller and a student, and stores nothing", async () => {
    const before = await batchCount(owner.id);
    as(null);
    expect((await preview({ content: csvOf(["사과", "과일"]), mode: "create", newSetTitle: title("anon") })).ok).toBe(false);
    as(student);
    expect((await preview({ content: csvOf(["사과", "과일"]), mode: "create", newSetTitle: title("stud") })).ok).toBe(false);
    expect((await commit({ content: csvOf(["사과", "과일"]), mode: "create", newSetTitle: title("stud"), batchId: "x", commitToken: "y" })).ok).toBe(false);
    expect(await batchCount(owner.id)).toBe(before);
    expect(await batchCount(student.id)).toBe(0);
  });

  it("an outsider cannot see or import into someone else's set", async () => {
    const setId = await createSet(owner, "private", [["사과", "과일"]]);
    as(outsider);
    const p = await preview({ content: csvOf(["포도", "과일"]), mode: "append", setId });
    expect(p).toEqual({ ok: false, error: contentErrorMessage("SET_NOT_FOUND") });
    expect(await liveEntries(setId)).toHaveLength(1);
  });

  it("a ticket belongs to the teacher who previewed it", async () => {
    const setId = await createSet(owner, "ticket-owner", [["사과", "과일"]]);
    as(owner);
    const content = csvOf(["포도", "과일"]);
    const p = await preview({ content, mode: "append", setId });
    as(adminUser);
    const stolen = await commit({ content, mode: "append", setId, batchId: p.batchId, commitToken: p.commitToken });
    expect(stolen).toEqual({ ok: false, error: contentErrorMessage("BATCH_NOT_FOUND") });
    expect((await batchRow(p.batchId!)).status).toBe("previewed");
  });

  it("the classroom owner manages a set a co-teacher created in the owner's classroom (D3)", async () => {
    const setId = await createSet(coTeacher, "by-co", [["운동장", "체육을 하는 곳"]], room);
    const { data } = await admin.from("content_sets").select("owner_id, classroom_id").eq("id", setId).single();
    expect(data).toEqual({ owner_id: coTeacher.id, classroom_id: room });

    as(owner); // owner of the classroom, not the set owner, not in classroom_teachers
    const append = csvOf(["복도", "교실 사이의 길"]);
    const p = await preview({ content: append, mode: "append", setId });
    expect(p.ok, p.error).toBe(true);
    const c = await commit({ content: append, mode: "append", setId, batchId: p.batchId, commitToken: p.commitToken });
    expect(c.ok, c.error).toBe(true);

    const replace = csvOf(["강당", "큰 행사를 하는 곳"]);
    const rp = await preview({ content: replace, mode: "replace", setId });
    const rc = await commit({ content: replace, mode: "replace", setId, batchId: rp.batchId, commitToken: rp.commitToken, confirmReplace: true });
    expect(rc.ok, rc.error).toBe(true);
    expect((await liveEntries(setId)).map((e) => e.answer)).toEqual(["강당"]);
  });

  it("a co-teacher and an admin manage a set of the owner's classroom; a removed co-teacher cannot", async () => {
    const setId = await createSet(owner, "room-set", [["사과", "과일"]], room);

    as(coTeacher);
    const a = await preview({ content: csvOf(["포도", "과일"]), mode: "append", setId });
    expect(a.ok, a.error).toBe(true);
    as(adminUser);
    const b = await preview({ content: csvOf(["수박", "과일"]), mode: "append", setId });
    expect(b.ok, b.error).toBe(true);

    await admin.from("classroom_teachers").delete().eq("classroom_id", room).eq("teacher_id", coTeacher.id);
    as(coTeacher);
    const removed = await preview({ content: csvOf(["참외", "과일"]), mode: "append", setId });
    expect(removed).toEqual({ ok: false, error: contentErrorMessage("SET_NOT_FOUND") });
    // The ticket taken while still a member no longer commits.
    const late = await commit({ content: csvOf(["포도", "과일"]), mode: "append", setId, batchId: a.batchId, commitToken: a.commitToken });
    expect(late.ok).toBe(false);
    await admin.from("classroom_teachers").insert({ classroom_id: room, teacher_id: coTeacher.id });
  });

  it("an archived classroom is read-only: no new linked set, no import into a linked set (P2)", async () => {
    const live = await makeClassroom();
    const setId = await createSet(owner, "archived-room", [["사과", "과일"]], live);
    as(owner);
    const content = csvOf(["포도", "과일"]);
    const ticket = await preview({ content, mode: "append", setId });
    expect(ticket.ok, ticket.error).toBe(true);

    await admin.from("classrooms").update({ archived_at: new Date().toISOString() }).eq("id", live);
    const refused = await preview({ content, mode: "append", setId });
    expect(refused).toEqual({ ok: false, error: contentErrorMessage("CLASSROOM_ARCHIVED") });
    const lateCommit = await commit({ content, mode: "append", setId, batchId: ticket.batchId, commitToken: ticket.commitToken });
    expect(lateCommit).toEqual({ ok: false, error: contentErrorMessage("CLASSROOM_ARCHIVED") });
    const newSet = await preview({ content, mode: "create", newSetTitle: title("into-archived"), classroomId: live });
    expect(newSet).toEqual({ ok: false, error: contentErrorMessage("CLASSROOM_ARCHIVED") });
    expect(await liveEntries(setId)).toHaveLength(1);
  });

  it("an archived set cannot be imported into", async () => {
    const setId = await createSet(owner, "archived-set", [["사과", "과일"]]);
    await admin.from("content_sets").update({ archived_at: new Date().toISOString() }).eq("id", setId);
    as(owner);
    expect(await preview({ content: csvOf(["포도", "과일"]), mode: "append", setId })).toEqual({
      ok: false,
      error: contentErrorMessage("SET_ARCHIVED"),
    });
  });

  it("a classroom the teacher does not teach cannot be linked", async () => {
    as(outsider);
    const p = await preview({ content: csvOf(["사과", "과일"]), mode: "create", newSetTitle: title("not-mine"), classroomId: room });
    expect(p).toEqual({ ok: false, error: contentErrorMessage("CLASSROOM_INVALID") });
  });

  it("records a rejected commit in the audit log without content", async () => {
    const setId = await createSet(owner, "reject-audit", [["사과", "과일"]]);
    as(owner);
    const content = csvOf(["고구마", "뿌리 채소"]);
    const p = await preview({ content, mode: "append", setId });
    await commit({ content, mode: "append", setId, batchId: p.batchId, commitToken: "wrong" });
    const { data } = await admin.from("audit_logs").select("metadata").eq("action", "content_set.import_rejected").eq("resource_id", setId);
    expect(data).toHaveLength(1);
    expect(data![0].metadata).toMatchObject({ code: "COMMIT_TOKEN_INVALID", mode: "append" });
    expect(JSON.stringify(data)).not.toContain("고구마");
  });
});

describe("M2-1.2 upload: rows-hash binding in the service", () => {
  it("commits the previewed rows and refuses any other row set under the same ticket", async () => {
    as(owner);
    const t = title("bind");
    const rowsA = buildContentPreview(parseContentCsv(csvOf(["사과", "과일"])).rows, { mode: "create" }).commitRows;
    const rowsB = buildContentPreview(parseContentCsv(csvOf(["사과", "과일"], ["몰래추가", "숨은 행"])).rows, { mode: "create" }).commitRows;
    const target = { mode: "create" as const, setId: null, newSetTitle: t, classroomId: null };
    const p = await preview({ content: csvOf(["사과", "과일"]), mode: "create", newSetTitle: t });

    await expect(
      commitContentImport({
        actor: { id: owner.id, school_id: SCHOOL },
        batchId: p.batchId!,
        commitToken: p.commitToken!,
        target,
        rows: rowsB,
        maxSetEntries: MAX_SET_ENTRIES,
      }),
    ).rejects.toMatchObject({ code: "ROWS_CHANGED" });
    expect((await admin.from("content_sets").select("id").eq("title", t)).data).toHaveLength(0);

    const ok = await commitContentImport({
      actor: { id: owner.id, school_id: SCHOOL },
      batchId: p.batchId!,
      commitToken: p.commitToken!,
      target,
      rows: rowsA,
      maxSetEntries: MAX_SET_ENTRIES,
    });
    expect(ok).toMatchObject({ created: true, accepted: 1 });
  });
});

describe("M2-1.2 upload: batch cleanup", () => {
  it("keeps at most MAX_ACTIVE_PREVIEWS live previews per teacher; the oldest stop working", async () => {
    as(spammer);
    const content = csvOf(["사과", "과일"]);
    const tickets: ContentPreviewState[] = [];
    for (let i = 0; i < MAX_ACTIVE_PREVIEWS + 2; i += 1) {
      tickets.push(await preview({ content, mode: "create", newSetTitle: title(`spam${i}`) }));
    }
    const { data } = await admin
      .from("content_import_batches")
      .select("id, status, expires_at")
      .eq("actor_id", spammer.id)
      .eq("status", "previewed")
      .gt("expires_at", new Date().toISOString());
    expect(data!.length).toBeLessThanOrEqual(MAX_ACTIVE_PREVIEWS);
    expect(data!.map((b) => b.id)).toContain(tickets.at(-1)!.batchId);
    expect(data!.map((b) => b.id)).not.toContain(tickets[0].batchId);
    expect((await batchRow(tickets[0].batchId!)).status).toBe("expired");

    const oldCommit = await commit({ content, mode: "create", newSetTitle: title("spam-old"), batchId: tickets[0].batchId, commitToken: tickets[0].commitToken });
    expect(oldCommit.ok).toBe(false);
  });

  it("deletes stale uncommitted tickets and keeps live ones and the history", async () => {
    const base = {
      school_id: SCHOOL,
      actor_id: owner.id,
      mode: "create" as const,
      commit_token_hash: "x",
      rows_hash: "x",
      source_sha256: "x",
      source_bytes: 1,
      total_rows: 1,
    };
    const days = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
    const { data } = await admin
      .from("content_import_batches")
      .insert([
        { ...base, status: "previewed" as const, expires_at: days(-3) },
        { ...base, status: "expired" as const, expires_at: days(-3) },
        { ...base, status: "previewed" as const, expires_at: new Date(Date.now() - 3_600_000).toISOString() },
        { ...base, status: "previewed" as const, expires_at: days(1) },
        { ...base, status: "completed" as const, expires_at: days(-30) },
      ])
      .select("id, status, expires_at");
    const [staleA, staleB, recent, live, history] = data!;

    const deleted = await cleanupContentImportBatches();
    expect(deleted).toBeGreaterThanOrEqual(2);

    const left = async (id: string) => (await admin.from("content_import_batches").select("id").eq("id", id)).data!.length;
    expect([await left(staleA.id), await left(staleB.id)]).toEqual([0, 0]);
    expect([await left(recent.id), await left(live.id), await left(history.id)]).toEqual([1, 1, 1]);
    await admin.from("content_import_batches").delete().in("id", [recent.id, live.id, history.id]);
  });

  it("is also run when a preview is created", async () => {
    as(owner);
    const { data } = await admin
      .from("content_import_batches")
      .insert({
        school_id: SCHOOL, actor_id: owner.id, mode: "create", status: "expired", commit_token_hash: "x", rows_hash: "x",
        source_sha256: "x", source_bytes: 1, total_rows: 1, expires_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    await preview({ content: csvOf(["사과", "과일"]), mode: "create", newSetTitle: title("sweep") });
    expect((await admin.from("content_import_batches").select("id").eq("id", data!.id)).data).toHaveLength(0);
  });
});
