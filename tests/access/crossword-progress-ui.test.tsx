import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TV-1 (docs/m2/14, 16): the service mapping (database mocked), the words and the table of the teacher progress view, the flag
// gate of the page and the source guards that keep letters and answers out of this code. The database function itself is
// tested by pgTAP 00015 and the real flow by crossword-play-flow.test.ts.

const rpc = vi.hoisted(() => ({ calls: [] as unknown[], result: { data: [] as unknown, error: null as { message: string } | null } }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string, args: unknown) => {
      rpc.calls.push({ name, args });
      return rpc.result;
    },
  }),
}));

import { CrosswordProgressTable } from "@/components/teacher/crossword-progress-table";
import { CrosswordError } from "@/features/crossword/messages";
import { getAssignmentProgress } from "@/features/crossword/results/service";
import type { ProgressRow } from "@/features/crossword/results/types";
import { PROGRESS_STATE_LABEL, PROGRESS_TEXT, lastActivityOf, progressText, toolsText, whenText, wrongSubmitsText } from "@/features/crossword/results/view-model";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FORBIDDEN = /점수|감점|벌점|패널티|페널티|순위|등수|랭킹|리더보드|배지|꼴찌|경쟁|지각|늦었|뒤처|부진|\b\d+\s*\/\s*\d+\s*점/;

const row = (over: Partial<ProgressRow>): ProgressRow => ({
  studentId: "s1", studentNo: "10101", displayName: "김하늘", state: "in_progress", filledCount: 12, totalCells: 40,
  lastSavedAt: "2026-10-21T05:03:00Z", completedAt: null, checksUsed: 2, revealsUsed: 1, chosungUsed: 0, wrongSubmits: 1, ...over,
});

const ACTOR = { id: "00000000-0000-4000-8000-000000000001", school_id: "00000000-0000-4000-8000-0000000000a1", role: "teacher" as const };
const AID = "00000000-0000-4000-8000-0000000000d1";

beforeEach(() => {
  rpc.calls = [];
  rpc.result = { data: [], error: null };
});
afterEach(() => vi.unstubAllEnvs());

describe("getAssignmentProgress (service)", () => {
  it("calls the one function with the actor from the caller, never from the request, and maps the rows", async () => {
    rpc.result = {
      data: [{ student_id: "s1", student_no: "1", display_name: "A", state: "completed", filled_count: 6, total_cells: 6, last_saved_at: "t1", completed_at: "t2", checks_used: 1, reveals_used: 0, chosung_used: 2, wrong_submits: 3 }],
      error: null,
    };
    const rows = await getAssignmentProgress(ACTOR, AID);
    expect(rpc.calls).toEqual([{ name: "fn_crossword_assignment_progress", args: { p_actor_id: ACTOR.id, p_school_id: ACTOR.school_id, p_assignment_id: AID } }]);
    expect(rows).toEqual([{ studentId: "s1", studentNo: "1", displayName: "A", state: "completed", filledCount: 6, totalCells: 6, lastSavedAt: "t1", completedAt: "t2", checksUsed: 1, revealsUsed: 0, chosungUsed: 2, wrongSubmits: 3 }]);
  });

  it("a student role and a malformed id never reach the database", async () => {
    await expect(getAssignmentProgress({ ...ACTOR, role: "student" }, AID)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getAssignmentProgress(ACTOR, "not-a-uuid")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(rpc.calls).toEqual([]);
  });

  it("the database's NOT_FOUND and FORBIDDEN come back as the same typed errors; other failures are rethrown", async () => {
    rpc.result = { data: null, error: { message: "CROSSWORD_NOT_FOUND" } };
    await expect(getAssignmentProgress(ACTOR, AID)).rejects.toBeInstanceOf(CrosswordError);
    await expect(getAssignmentProgress(ACTOR, AID)).rejects.toMatchObject({ code: "NOT_FOUND" });
    rpc.result = { data: null, error: { message: "CROSSWORD_FORBIDDEN" } };
    await expect(getAssignmentProgress(ACTOR, AID)).rejects.toMatchObject({ code: "FORBIDDEN" });
    rpc.result = { data: null, error: { message: "connection reset" } };
    await expect(getAssignmentProgress(ACTOR, AID)).rejects.toMatchObject({ message: "connection reset" });
  });

  it("an empty classroom is an empty list, an admin may ask", async () => {
    rpc.result = { data: null, error: null };
    expect(await getAssignmentProgress({ ...ACTOR, role: "admin" }, AID)).toEqual([]);
  });
});

describe("words of the view", () => {
  it("states have text and an icon; progress, tools and wrong submits are plain counts", () => {
    expect(PROGRESS_STATE_LABEL).toEqual({
      not_started: { icon: "○", text: "시작 전" },
      in_progress: { icon: "◐", text: "푸는 중" },
      completed: { icon: "●", text: "완료" },
    });
    expect(progressText(row({}))).toBe("12 / 40칸");
    expect(toolsText(row({}))).toBe("확인 2 · 알려주기 1 · 초성 0");
    expect(toolsText(row({ checksUsed: 0, revealsUsed: 0, chosungUsed: 0 }))).toBe("없음");
    expect(wrongSubmitsText(row({ wrongSubmits: 3 }))).toBe("3번");
  });

  it("times are shown in Korean school time; the completion time is the last activity when finished", () => {
    expect(whenText("2026-10-21T05:03:00Z")).toContain("14:03");
    expect(whenText(null)).toBe("-");
    expect(whenText("garbage")).toBe("-");
    expect(lastActivityOf({ lastSavedAt: "a", completedAt: "b" })).toBe("b");
    expect(lastActivityOf({ lastSavedAt: "a", completedAt: null })).toBe("a");
  });

  it("nothing in the catalogue is score-like, ranking, penalty or a judgement of lateness", () => {
    const all = [JSON.stringify(PROGRESS_TEXT), JSON.stringify(PROGRESS_STATE_LABEL), toolsText(row({})), toolsText(row({ checksUsed: 0, revealsUsed: 0, chosungUsed: 0 }))].join(" ");
    expect(all).not.toMatch(FORBIDDEN);
    expect(PROGRESS_TEXT.columns.tools).toBe("도구를 활용");
  });
});

describe("the table", () => {
  const rows = [
    row({ studentId: "s1", studentNo: "10103", displayName: "다", state: "completed", completedAt: "2026-10-21T05:10:00Z", filledCount: 40 }),
    row({ studentId: "s2", studentNo: "10101", displayName: "가", state: "not_started", filledCount: 0, lastSavedAt: null, checksUsed: 0, revealsUsed: 0, wrongSubmits: 0 }),
    row({ studentId: "s3", studentNo: "10102", displayName: "나" }),
  ];
  const html = renderToStaticMarkup(<CrosswordProgressTable rows={rows} caption="퍼즐 · 1반 진행 상황" />);

  it("keeps the order it is given: there is no sorting by progress, tools or time", () => {
    expect(html.indexOf("10103")).toBeLessThan(html.indexOf("10101"));
    expect(html.indexOf("10101")).toBeLessThan(html.indexOf("10102"));
  });

  it("is an accessible table: a caption, column and row headers, text plus icon for the state, a named scroll region", () => {
    expect(html).toContain('<caption class="sr-only">퍼즐 · 1반 진행 상황</caption>');
    expect(html.match(/scope="col"/g)?.length).toBe(7);
    expect(html.match(/scope="row"/g)?.length).toBe(3);
    for (const t of ["시작 전", "푸는 중", "완료", "12 / 40칸", "0 / 40칸"]) expect(html).toContain(t);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-hidden="true">○ ');
  });

  it("contains no forbidden words and no sort controls, links or buttons", () => {
    expect(html).not.toMatch(FORBIDDEN);
    expect(html).not.toMatch(/<button|<a |aria-sort/);
  });

  it("an empty classroom says so", () => {
    expect(renderToStaticMarkup(<CrosswordProgressTable rows={[]} caption="x" />)).toContain(PROGRESS_TEXT.empty);
  });
});

describe("the page and the link follow the Student Play flag", () => {
  it("with the flag off the page is not found before anything else runs", async () => {
    vi.stubEnv("CROSSWORD_PLAY_ENABLED", "false");
    const { default: Page } = await import("@/app/teacher/crosswords/[puzzleId]/assignments/[assignmentId]/page");
    const err = await Page({ params: Promise.resolve({ puzzleId: AID, assignmentId: AID }) }).then(() => null, (e: unknown) => e);
    expect(String((err as { digest?: string })?.digest ?? err)).toMatch(/404|NOT_FOUND/);
    expect(rpc.calls).toEqual([]);
  });

  it("source: the flag is the first statement of the page, and the list link exists only when a base is given", () => {
    const page = strip(read("src/app/teacher/crosswords/[puzzleId]/assignments/[assignmentId]/page.tsx"));
    const body = page.slice(page.indexOf("export default async function"));
    expect(body.indexOf("isCrosswordPlayEnabled()")).toBeGreaterThan(-1);
    expect(body.indexOf("isCrosswordPlayEnabled()")).toBeLessThan(body.indexOf("requireTeacherAreaPage()"));
    const list = strip(read("src/components/teacher/crossword-assignment-list.tsx"));
    expect(list).toMatch(/progressBase \? \(/);
    const detail = strip(read("src/app/teacher/crosswords/[puzzleId]/page.tsx"));
    expect(detail).toMatch(/progressBase=\{isCrosswordPlayEnabled\(\) \?/);
  });
});

describe("source guards: no letters, answers or keys on the teacher progress side", () => {
  const files = ["service.ts", "types.ts", "view-model.ts", "schemas.ts"]
    .map((f) => `src/features/crossword/results/${f}`)
    .filter((f) => fs.existsSync(path.join(root, f)))
    .concat(["src/components/teacher/crossword-progress-table.tsx", "src/app/teacher/crosswords/[puzzleId]/assignments/[assignmentId]/page.tsx"]);

  it("none of the files names a letter, an answer, a cell key or an event detail", () => {
    for (const f of files) {
      const code = strip(read(f));
      expect(code, f).not.toMatch(/\bcells\b|prefill_keys|revealed_keys|\banswer\b|\bdetail\b|\.from\(|\.select\(/);
    }
  });

  it("only the results service calls the function", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && /fn_crossword_assignment_progress/.test(read(rel))) hits.push(rel.replace(/\\/g, "/"));
      }
    };
    walk("src");
    expect(hits.filter((h) => !h.endsWith("database.ts"))).toEqual(["src/features/crossword/results/service.ts"]);
  });

  it("the student side does not import the teacher progress code", () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
    for (const f of [...walk("src/components/student"), ...walk("src/features/crossword/play"), ...walk("src/app/student")]) {
      expect(read(f), f).not.toMatch(/crossword\/results|crossword-progress/);
    }
  });
});
