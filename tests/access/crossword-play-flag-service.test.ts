import { afterEach, describe, expect, it, vi } from "vitest";

// F-1 (docs/m2/12), the second gate: startOrResume is the only function that creates an attempt (student data). With
// Student Play off it refuses before any database access, whoever calls it.

const db = vi.hoisted(() => ({ clients: 0, rpcs: [] as string[] }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    db.clients++;
    return { rpc: async (name: string) => (db.rpcs.push(name), { data: null, error: null }), from: () => ({}) };
  },
}));

import { PlayError } from "@/features/crossword/play/errors";
import { startOrResume } from "@/features/crossword/play/service";

afterEach(() => {
  vi.unstubAllEnvs();
  db.clients = 0;
  db.rpcs = [];
});

describe("startOrResume and the flag", () => {
  for (const [label, env] of [
    ["explicitly off", { CROSSWORD_PLAY_ENABLED: "false", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }],
    ["unset against a hosted project", { CROSSWORD_PLAY_ENABLED: "", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" }],
  ] as const) {
    it(`${label}: throws NOT_FOUND and never reaches the database`, async () => {
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      await expect(startOrResume("student-1", "assignment-1")).rejects.toMatchObject({ name: "PlayError", code: "NOT_FOUND" });
      await expect(startOrResume("student-1", "assignment-1")).rejects.toBeInstanceOf(PlayError);
      expect(db.clients, "database clients created").toBe(0);
      expect(db.rpcs, "rpc calls").toEqual([]);
    });
  }

  it("on: it goes on to the database (the access check runs first)", async () => {
    vi.stubEnv("CROSSWORD_PLAY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    // A well-formed id (a malformed one is refused before any lookup). The mocked database returns nothing, so the
    // access check refuses; what matters is that it was asked.
    await expect(startOrResume("student-1", "5a000000-0000-4000-8000-0000000000d1")).rejects.toBeDefined();
    expect(db.clients + db.rpcs.length).toBeGreaterThan(0);
  });
});
