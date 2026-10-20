import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// F-1 (docs/m2/12): with Student Play off, every play API answers 404 before it touches the session, the body or the
// database. The services and the identity lookup are mocked so that "not called" can be asserted; the flag itself is the
// real one (src/lib/flags.ts), driven through the environment.

const calls = vi.hoisted(() => ({ identity: 0, service: 0 }));

vi.mock("@/features/identity/service", () => ({
  requireActiveProfile: async () => {
    calls.identity++;
    return { id: "p1", school_id: "s1", role: "student", display_name: "S", status: "active" };
  },
  requireAuthenticatedUserId: async () => "p1",
}));
vi.mock("@/lib/rbac/student-guard", () => ({ studentMustChangePassword: async () => false }));
vi.mock("@/features/crossword/play/access", () => ({
  getStudentIdForProfile: async () => "stu1",
}));
vi.mock("@/features/crossword/play/service", () => {
  const spy = async () => {
    calls.service++;
    return { ok: true };
  };
  return { getPlayState: spy, savePatch: spy, check: spy, reveal: spy, chosung: spy, submit: spy };
});

import { POST as checkPOST } from "@/app/student/crosswords/[assignmentId]/api/check/route";
import { POST as chosungPOST } from "@/app/student/crosswords/[assignmentId]/api/chosung/route";
import { POST as revealPOST } from "@/app/student/crosswords/[assignmentId]/api/reveal/route";
import { POST as savePOST } from "@/app/student/crosswords/[assignmentId]/api/save/route";
import { GET as stateGET } from "@/app/student/crosswords/[assignmentId]/api/state/route";
import { POST as submitPOST } from "@/app/student/crosswords/[assignmentId]/api/submit/route";

const ctx = { params: Promise.resolve({ assignmentId: "a1" }) };
const URL_ = "https://app.example/student/crosswords/a1/api/";
const post = (name: string, body: unknown = {}) =>
  new Request(URL_ + name, {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
const get = () => new Request(URL_ + "state", { method: "GET", headers: { "sec-fetch-site": "same-origin" } });

const HANDLERS: [string, () => Promise<Response>][] = [
  ["state", () => stateGET(get(), ctx)],
  ["save", () => savePOST(post("save", { patch: {}, activeMs: 0 }), ctx)],
  ["check", () => checkPOST(post("check", { scope: "word", keys: ["0,0"], baseRevision: 0 }), ctx)],
  ["reveal", () => revealPOST(post("reveal", { key: "0,0", baseRevision: 0 }), ctx)],
  ["chosung", () => chosungPOST(post("chosung", { number: 1, direction: "across" }), ctx)],
  ["submit", () => submitPOST(post("submit", { baseRevision: 0 }), ctx)],
];

beforeEach(() => {
  calls.identity = 0;
  calls.service = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("F-1: the flag gates every play API", () => {
  for (const [label, env] of [
    ["explicitly off", { CROSSWORD_PLAY_ENABLED: "false", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }],
    ["unset against a hosted project", { CROSSWORD_PLAY_ENABLED: "", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" }],
  ] as const) {
    describe(label, () => {
      beforeEach(() => {
        for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      });
      for (const [name, run] of HANDLERS) {
        it(`${name}: 404, no-store, nothing else runs`, async () => {
          const res = await run();
          expect(res.status).toBe(404);
          expect(await res.json()).toEqual({ error: "NOT_FOUND" });
          expect(res.headers.get("cache-control")).toMatch(/no-store/);
          expect(calls.identity, "identity lookup").toBe(0);
          expect(calls.service, "service").toBe(0);
        });
      }
      it("a malformed or foreign-origin request gets the same 404 (the flag is checked first)", async () => {
        const bad = new Request(URL_ + "save", { method: "POST", headers: { "sec-fetch-site": "cross-site" }, body: "not json" });
        const res = await savePOST(bad, ctx);
        expect(res.status).toBe(404);
        expect(calls.identity).toBe(0);
      });
      it("a wrong method is also 404, not 405", async () => {
        const res = await stateGET(new Request(URL_ + "state", { method: "POST", headers: { "sec-fetch-site": "same-origin" } }), ctx);
        expect(res.status).toBe(404);
      });
    });
  }

  describe("on", () => {
    it("explicitly on (hosted URL): the normal path still runs", async () => {
      vi.stubEnv("CROSSWORD_PLAY_ENABLED", "true");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
      const res = await stateGET(get(), ctx);
      expect(res.status).toBe(200);
      expect(calls.service).toBe(1);
    });
    it("unset against a local stack (development default): the normal path still runs", async () => {
      vi.stubEnv("CROSSWORD_PLAY_ENABLED", "");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
      const res = await savePOST(post("save", { patch: {}, activeMs: 0 }), ctx);
      expect(res.status).toBe(200);
      expect(calls.service).toBe(1);
    });
  });
});
