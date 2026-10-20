import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Cheap guards over the SOURCE of the student play stack (doc 08 C.9, G.5). They cannot prove the key never leaks;
// the flow tests do that. They stop the usual accidents: a select("*"), an answer column in student code, a server-only
// module pulled into the browser bundle, cells copied to browser storage, a route outside the session-refresh path.

const root = process.cwd();
const src = (p: string) => path.join(root, "src", p);

const walk = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    : [];

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const code = (f: string) => strip(fs.readFileSync(f, "utf8"));
const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/");

const PLAY = walk(src("features/crossword/play")).filter((f) => /\.tsx?$/.test(f));
const ROUTES = walk(src("app/student/crosswords")).filter((f) => /\.tsx?$/.test(f));
const CLIENT = walk(src("components/student")).filter((f) => /\.tsx?$/.test(f));
const STUDENT_CODE = [...PLAY, ...ROUTES, ...CLIENT];

describe("student code reads no answer", () => {
  it("there is student code to check", () => {
    expect(PLAY.length).toBeGreaterThan(8);
    expect(ROUTES.length).toBeGreaterThanOrEqual(7);
    expect(CLIENT.length).toBeGreaterThanOrEqual(4);
  });

  it("no select-star anywhere in student code", () => {
    for (const f of STUDENT_CODE) expect(code(f), rel(f)).not.toMatch(/\.select\(\s*(["'`])\*\1/);
  });

  it("the word 'answer' appears only where the placeholder builder writes a placeholder", () => {
    for (const f of STUDENT_CODE) {
      const lines = code(f).split("\n").filter((l) => /answer|solution/i.test(l));
      if (path.basename(f) === "prefill.ts") expect(lines.every((l) => /answer: "가"\.repeat\(w\.length\)/.test(l)), rel(f)).toBe(true);
      else expect(lines, rel(f)).toEqual([]);
    }
  });

  it("no code path reads the answer-bearing helpers", () => {
    for (const f of STUDENT_CODE) expect(code(f), rel(f)).not.toMatch(/fn_crossword_play_wordcells|fn_crossword_words_json|fn_crossword_cells/);
  });

  it("the payload builder lists its fields and never spreads a row", () => {
    const c = code(src("features/crossword/play/payload.ts"));
    expect(c).not.toMatch(/\.\.\.\s*(attempt|puzzle|row|data|word|w)\b/);
    expect(c).toMatch(/\.select\("number, direction, row, col, length, single, clue"\)/);
  });
});

describe("the browser bundle", () => {
  const importsOf = (f: string): string[] =>
    [...code(f).matchAll(/(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);

  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = src(spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
    else return null;
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    return null;
  };

  function graph(entry: string): { files: Set<string>; bare: Set<string> } {
    const files = new Set<string>();
    const bare = new Set<string>();
    const visit = (f: string) => {
      if (files.has(f)) return;
      files.add(f);
      for (const spec of importsOf(f)) {
        const r = resolve(f, spec);
        if (r) visit(r);
        else bare.add(spec);
      }
    };
    visit(entry);
    return { files, bare };
  }

  const clientEntries = CLIENT.filter((f) => /^\s*["']use client["']/.test(fs.readFileSync(f, "utf8")));

  it("there are client components to check", () => {
    const names = clientEntries.map((f) => path.basename(f));
    // the board, its hook, the finishing moment and the device-test panel are the client components
    for (const n of ["crossword-play-board.tsx", "use-grid-input.ts", "completion-moment.tsx", "ime-trace-panel.tsx"]) expect(names, n).toContain(n);
  });

  it("client components import nothing server-only, no database client and no server module", () => {
    for (const entry of [...clientEntries, ...CLIENT.filter((f) => /save-queue|play-api/.test(f))]) {
      const { files, bare } = graph(entry);
      for (const f of files) {
        const raw = fs.readFileSync(f, "utf8");
        expect(raw, `${rel(entry)} -> ${rel(f)}`).not.toMatch(/import\s+["']server-only["']/);
        expect(raw, `${rel(entry)} -> ${rel(f)}`).not.toMatch(/@\/lib\/supabase|createSupabase|next\/headers|SUPABASE_SERVICE_ROLE_KEY/);
      }
      for (const spec of bare) expect(spec, rel(entry)).not.toMatch(/^(server-only|@supabase\/|next\/headers)/);
      for (const f of files) {
        expect(rel(f), rel(entry)).not.toMatch(/features\/crossword\/play\/(service|payload|access|api-guard|errors)\.ts$/);
      }
    }
  });

  it("cells and attempts are never written to browser storage", () => {
    for (const f of [...CLIENT, ...PLAY]) expect(code(f), rel(f)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });

  it("no request code can carry a selection, a word or a clue", () => {
    for (const f of CLIENT.filter((x) => /save-queue|play-api/.test(x))) expect(code(f), rel(f)).not.toMatch(/selected|currentWord|currentClue|focus/i);
  });

  it("zod and the server schemas stay out of the browser bundle", () => {
    for (const entry of clientEntries) {
      const { files, bare } = graph(entry);
      expect([...bare], rel(entry)).not.toContain("zod");
      for (const f of files) expect(rel(f)).not.toMatch(/play\/schemas\.ts$/);
    }
  });
});

describe("routes", () => {
  const apiDir = src("app/student/crosswords/[assignmentId]/api");
  const names = ["check", "chosung", "reveal", "save", "state", "submit"];

  it("all six handlers live under /student so the middleware keeps the session fresh", () => {
    expect(fs.readdirSync(apiDir).sort()).toEqual(names);
    expect(fs.readFileSync(src("middleware.ts"), "utf8")).toMatch(/matcher:\s*\[[^\]]*"\/student\/:path\*"/);
    expect(fs.existsSync(src("app/api/crossword-play"))).toBe(false);
  });

  it("every handler is dynamic and goes through the guarded wrapper", () => {
    for (const n of names) {
      const c = code(path.join(apiDir, n, "route.ts"));
      expect(c, n).toMatch(/export const dynamic = "force-dynamic"/);
      expect(c, n).toMatch(/playRoute\(/);
      expect(c, n).not.toMatch(/studentId\s*:\s*body|body\.studentId|params\.studentId/);
    }
  });

  it("the student id is never read from a request: handlers get it from the wrapper only", () => {
    const guard = code(src("features/crossword/play/api-guard.ts"));
    expect(guard).toMatch(/requireActiveProfile\(\)/);
    expect(guard).toMatch(/getStudentIdForProfile\(profile\.id\)/);
    expect(guard).toMatch(/no-store/);
  });

  it("F-1: the feature flag is the first thing playRoute checks, before the session, and startOrResume refuses too", () => {
    const guard = code(src("features/crossword/play/api-guard.ts"));
    const body = guard.slice(guard.indexOf("export async function playRoute"));
    const flag = body.indexOf("isCrosswordPlayEnabled()");
    expect(flag, "flag check inside playRoute").toBeGreaterThan(-1);
    for (const later of ["request.method", "isSameOrigin(request)", "request.json()", "requireActiveProfile()"]) {
      expect(body.indexOf(later), later).toBeGreaterThan(flag);
    }
    expect(body.slice(flag, flag + 90)).toMatch(/return jsonError\("NOT_FOUND", 404\)/);
    const service = code(src("features/crossword/play/service.ts"));
    const start = service.slice(service.indexOf("export async function startOrResume"));
    expect(start.slice(0, start.indexOf("requirePlayAccess"))).toMatch(/isCrosswordPlayEnabled\(\)[\s\S]*PlayError\("NOT_FOUND"\)/);
  });

  it("the page is behind the student guard", () => {
    expect(code(src("app/student/crosswords/[assignmentId]/page.tsx"))).toMatch(/requireStudentAreaPage\(\)/);
  });
});

describe("scope of F3", () => {
  it("no team, shared-attempt, leaderboard, badge or focus-tracking code exists in the student stack", () => {
    for (const f of STUDENT_CODE) {
      expect(code(f), rel(f)).not.toMatch(/leaderboard|badge|ranking|teamId|team_id|presence|helpRequest|focusTrack/i);
    }
  });
});
