import { describe, expect, it } from "vitest";

import { isCollabPlayEnabled, isCrosswordPlayEnabled } from "@/lib/flags";

// M2-3.4 P3 checkpoint: the team-play switch sits on top of the Student Play switch (Gate 2 E-5). Same rule for both:
// explicit "true" / "false" win; without a value it is on only against a local Supabase stack.

const LOCAL = "http://127.0.0.1:54321";
const HOSTED = "https://example-project.supabase.co";

describe("isCollabPlayEnabled", () => {
  it("is never on while Student Play is off", () => {
    for (const collab of ["true", "false", undefined]) {
      expect(isCollabPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: LOCAL, CROSSWORD_PLAY_ENABLED: "false", COLLAB_PLAY_ENABLED: collab })).toBe(false);
      expect(isCollabPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: HOSTED, COLLAB_PLAY_ENABLED: collab })).toBe(false);
    }
  });

  it("the four combinations of the two explicit switches", () => {
    const env = (play: string, collab: string) => ({ NEXT_PUBLIC_SUPABASE_URL: HOSTED, CROSSWORD_PLAY_ENABLED: play, COLLAB_PLAY_ENABLED: collab });
    expect(isCollabPlayEnabled(env("true", "true"))).toBe(true);
    expect(isCollabPlayEnabled(env("true", "false"))).toBe(false);
    expect(isCollabPlayEnabled(env("false", "true"))).toBe(false);
    expect(isCollabPlayEnabled(env("false", "false"))).toBe(false);
  });

  it("without COLLAB_PLAY_ENABLED: on against a local stack, off against a hosted one even with play on", () => {
    expect(isCollabPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: LOCAL })).toBe(true);
    expect(isCollabPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: HOSTED, CROSSWORD_PLAY_ENABLED: "true" })).toBe(false);
    expect(isCollabPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: LOCAL, COLLAB_PLAY_ENABLED: "false" })).toBe(false);
  });

  it("leaves the Student Play switch unchanged", () => {
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: LOCAL })).toBe(true);
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: HOSTED })).toBe(false);
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: HOSTED, CROSSWORD_PLAY_ENABLED: "true" })).toBe(true);
    expect(isCrosswordPlayEnabled({ NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toBe(false);
  });
});
