import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// M2-1.5: CSV export of a word set against the LOCAL Supabase stack: the download route, who may use it,
// the audit row, and the round trip export -> import with the real import actions.
// Only the identity lookup is mocked, as in the other access tests.
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
import { GET } from "@/app/teacher/content/[setId]/export/route";
import { commitContentImportAction, previewContentImportAction } from "@/features/content/import/actions";
import { NORMALIZER_VERSION } from "@/features/content/import/content-schemas";
import { evaluateRow } from "@/features/content/import/row-rules";

const SCHOOL = "00000000-0000-4000-8000-0000000000a1";
const RUN = `X${Date.now().toString(36)}`.toUpperCase();
const PASSWORD = "Tmp#pass12345";
const admin = createSupabaseAdminClient();
const startedAt = new Date().toISOString();

const mk = (id: string, role: Role, name: string): SessionProfile => ({ id, school_id: SCHOOL, role, display_name: name, status: "active" });
const owner = mk("00000000-0000-4000-8000-000000000001", "teacher", "Dev Teacher");
const coTeacher = mk("00000000-0000-4000-8000-0000000000f1", "teacher", "AT co-teacher");
const outsider = mk("00000000-0000-4000-8000-0000000000f2", "teacher", "AT outsider");
const adminUser = mk("00000000-0000-4000-8000-0000000000f3", "admin", "AT admin");
const student = mk("00000000-0000-4000-8000-0000000000f5", "student", "AT student");
const allUsers = [owner, coTeacher, outsider, adminUser, student];

const as = (p: SessionProfile | null) => {
  session.profile = p;
};

let n = 0;
const title = (label: string) => `${RUN}-${label}-${(n += 1)}`;

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

// Terms and definitions that are hard for CSV and spreadsheets (all valid for the importer).
const tricky: [string, string][] = [
  ["사과", "빨간색이나 초록색의 둥근 과일"],
  ["도서관", '책을 빌리는 곳, "조용히" 하는 곳'],
  ["ice cream", "차가운 간식"],
  ["-포도", "하이픈으로 시작하는 용어"],
  ["물", "=1+1"],
  ["눈", "+5도"],
  ["산", "-5도 아래"],
  ["강", "@home 으로 시작"],
  ["달", "'작은따옴표로 시작"],
  ["O'Neil", "사람 이름"],
  ["COVID-19", "감염병"],
  ["3D 프린터", "입체 인쇄기"],
];

/** A set holding the tricky rows at positions 1, 3, 5, ... (gaps) plus one archived entry that must not be exported. */
async function makeTrickySet(label: string, classroomId: string | null = null, ownerId = owner.id) {
  const { data, error } = await admin
    .from("content_sets")
    .insert({ school_id: SCHOOL, owner_id: ownerId, classroom_id: classroomId, title: title(label) })
    .select("id, title")
    .single();
  if (error || !data) throw error;
  const rows = tricky.map(([term, definition], i) => {
    const r = evaluateRow({ line: i + 2, term, definition });
    if (!r.ok) throw new Error(`fixture ${term}`);
    return {
      set_id: data.id,
      position: i * 2 + 1,
      term: r.row.term,
      definition: r.row.definition,
      answer: r.row.answer,
      script: r.row.script,
      normalizer_version: NORMALIZER_VERSION,
    };
  });
  const { error: e2 } = await admin.from("content_entries").insert([
    ...rows,
    { set_id: data.id, position: 2, term: "보관됨", definition: "내보내지 않음", answer: "보관됨", script: "hangul" as const, normalizer_version: NORMALIZER_VERSION, archived_at: new Date().toISOString() },
  ]);
  if (e2) throw e2;
  return { id: data.id, title: data.title };
}

const download = async (setId: string) => GET(new Request("http://localhost/export"), { params: Promise.resolve({ setId }) });
/** The body exactly as sent, BOM included (Response.text() would drop the BOM). */
const bodyOf = async (res: Response) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer()));
const liveEntries = async (setId: string) =>
  ((await admin.from("content_entries").select("term, definition, answer, answer_length, script, position").eq("set_id", setId).is("archived_at", null).order("position")).data ?? []);
const exports = async (setId: string) =>
  (await admin.from("audit_logs").select("metadata, resource_type").eq("resource_id", setId).eq("action", "content_set.exported")).data ?? [];

let room: string;

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

describe("M2-1.5 download route", () => {
  it("returns the live entries as a CSV attachment and audits the export without any text", async () => {
    const set = await makeTrickySet("download");
    as(owner);
    const res = await download(set.id);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const disposition = res.headers.get("Content-Disposition")!;
    expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1])).toBe(`${set.title}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.csv`);

    const body = await bodyOf(res);
    const bytes = new TextEncoder().encode(body);
    expect(body.startsWith("﻿term,definition\r\n")).toBe(true);
    expect(body.split("\r\n")).toHaveLength(tricky.length + 2); // header + rows + the final empty piece
    expect(body).not.toContain("보관됨"); // the archived entry stays out
    expect(body).toContain("물,'=1+1");
    expect(body).toContain("'-포도,하이픈으로 시작하는 용어");
    expect(bytes.byteLength).toBeGreaterThan(0);

    const audit = await exports(set.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ resource_type: "content_set", metadata: { entryCount: tricky.length, schoolId: SCHOOL } });
    expect(JSON.stringify(audit)).not.toContain("사과");
  });

  it("audits every download", async () => {
    const set = await makeTrickySet("twice");
    as(owner);
    await download(set.id);
    await download(set.id);
    expect(await exports(set.id)).toHaveLength(2);
  });

  it("exports an empty set as a header only", async () => {
    const { data } = await admin.from("content_sets").insert({ school_id: SCHOOL, owner_id: owner.id, title: title("empty") }).select("id").single();
    as(owner);
    const res = await download(data!.id);
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toBe("﻿term,definition\r\n");
  });

  it("is open to the owner, the classroom owner, a co-teacher and an admin; archived sets and archived classrooms can be exported", async () => {
    const shared = await makeTrickySet("shared", room, coTeacher.id);
    for (const who of [owner, coTeacher, adminUser]) {
      as(who);
      expect((await download(shared.id)).status, who.display_name).toBe(200);
    }

    await admin.from("content_sets").update({ archived_at: new Date().toISOString() }).eq("id", shared.id);
    as(owner);
    expect((await download(shared.id)).status).toBe(200);

    const oldRoom = await makeClassroom(true);
    const inOldRoom = await makeTrickySet("old-room", oldRoom);
    expect((await download(inOldRoom.id)).status).toBe(200);
  });

  it("refuses an outsider (404), a student (403), nobody (401) and a malformed id (404), and audits none of them", async () => {
    const set = await makeTrickySet("guarded");
    as(outsider);
    expect((await download(set.id)).status).toBe(404);
    as(student);
    expect((await download(set.id)).status).toBe(403);
    as(null);
    expect((await download(set.id)).status).toBe(401);
    as(owner);
    expect((await download("not-a-uuid")).status).toBe(404);
    expect((await download("00000000-0000-4000-8000-00000000dead")).status).toBe(404);
    expect(await exports(set.id)).toHaveLength(0);
  });

  it("does not leak the file to a teacher whose classroom access was removed", async () => {
    const set = await makeTrickySet("removed", room, owner.id);
    as(coTeacher);
    expect((await download(set.id)).status).toBe(200);
    await admin.from("classroom_teachers").delete().eq("classroom_id", room).eq("teacher_id", coTeacher.id);
    expect((await download(set.id)).status).toBe(404);
    await admin.from("classroom_teachers").insert({ classroom_id: room, teacher_id: coTeacher.id });
  });
});

describe("M2-1.5 round trip: export -> import unchanged", () => {
  const upload = (csv: string, fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("file", new File([new TextEncoder().encode(csv)], "export.csv", { type: "text/csv" }));
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };

  it("imports the exported file as a new set with the same entries, order and answers, and nothing rejected", async () => {
    const source = await makeTrickySet("source");
    as(owner);
    const csv = await bodyOf(await download(source.id));

    const copyTitle = title("copy");
    const p = await previewContentImportAction({ ok: false }, upload(csv, { mode: "create", newSetTitle: copyTitle }));
    expect(p.ok, p.error).toBe(true);
    expect(p.preview!.invalid).toEqual([]);
    expect(p.preview!.notices).toEqual([]);
    expect(p.preview!.valid).toHaveLength(tricky.length);

    const c = await commitContentImportAction({ ok: false }, upload(csv, { mode: "create", newSetTitle: copyTitle, batchId: p.batchId!, commitToken: p.commitToken! }));
    expect(c.ok, c.error).toBe(true);
    expect(c.result).toMatchObject({ accepted: tricky.length, skipped: 0 });

    const original = await liveEntries(source.id);
    const copy = await liveEntries(c.result!.setId);
    const pick = (rows: typeof original) => rows.map((r) => [r.term, r.definition, r.answer, r.answer_length, r.script]);
    expect(pick(copy)).toEqual(pick(original));
    expect(copy.map((r) => r.position)).toEqual(tricky.map((_, i) => i + 1)); // renumbered without gaps
    expect(copy.find((r) => r.term === "물")!.definition).toBe("=1+1"); // the guard apostrophe is gone again
    expect(copy.find((r) => r.term === "-포도")).toBeTruthy();
  });

  it("replacing a set with its own export changes nothing, and exporting again gives the same bytes", async () => {
    const source = await makeTrickySet("replace-self");
    as(owner);
    const first = await bodyOf(await download(source.id));
    const before = await liveEntries(source.id);

    const p = await previewContentImportAction({ ok: false }, upload(first, { mode: "replace", setId: source.id }));
    expect(p.ok, p.error).toBe(true);
    expect(p.preview!.invalid).toEqual([]);
    const c = await commitContentImportAction({ ok: false }, upload(first, { mode: "replace", setId: source.id, batchId: p.batchId!, commitToken: p.commitToken!, confirmReplace: "true" }));
    expect(c.ok, c.error).toBe(true);
    expect(c.result).toMatchObject({ accepted: tricky.length, archived: tricky.length });

    const after = await liveEntries(source.id);
    expect(after.map((r) => [r.term, r.definition, r.answer, r.script])).toEqual(before.map((r) => [r.term, r.definition, r.answer, r.script]));
    const second = await bodyOf(await download(source.id));
    expect(second).toBe(first);
  });

  it("appending a set's own export adds nothing: every word is already there", async () => {
    const source = await makeTrickySet("append-self");
    as(owner);
    const csv = await bodyOf(await download(source.id));
    const p = await previewContentImportAction({ ok: false }, upload(csv, { mode: "append", setId: source.id }));
    expect(p.ok).toBe(true);
    expect(p.batchId).toBeUndefined();
    expect(p.preview!.valid).toHaveLength(0);
    expect(p.preview!.invalid.every((i) => i.errors[0] === "DUP_EXISTING")).toBe(true);
    expect(p.preview!.invalid).toHaveLength(tricky.length);
  });

  it("an export made after an in-app entry edit imports back unchanged", async () => {
    const source = await makeTrickySet("edited");
    const { updateContentEntry } = await import("@/features/content/sets/service");
    const target = (await admin.from("content_entries").select("id").eq("set_id", source.id).eq("term", "사과").single()).data!;
    await updateContentEntry(owner, target.id, { term: "사과 주스", definition: "=SUM(1,2) 로 시작하는 뜻" });

    as(owner);
    const csv = await bodyOf(await download(source.id));
    expect(csv).toContain(`사과 주스,"'=SUM(1,2) 로 시작하는 뜻"`); // guarded, and quoted because of the comma
    const copyTitle = title("edited-copy");
    const p = await previewContentImportAction({ ok: false }, upload(csv, { mode: "create", newSetTitle: copyTitle }));
    const c = await commitContentImportAction({ ok: false }, upload(csv, { mode: "create", newSetTitle: copyTitle, batchId: p.batchId!, commitToken: p.commitToken! }));
    expect(c.ok, c.error).toBe(true);
    const copy = await liveEntries(c.result!.setId);
    expect(copy.find((r) => r.answer === "사과주스")!.definition).toBe("=SUM(1,2) 로 시작하는 뜻");
  });
});
