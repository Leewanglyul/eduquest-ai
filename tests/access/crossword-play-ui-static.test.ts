import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source guards for the student screens (M2-2.4c): styling slips that a markup test cannot see, and the accessibility
// and gate wiring that every student page must keep. The real layout, touch and keyboard checks were done in a browser
// on the built app (axe-core, 375 / 800 / 1280 px) and are recorded in docs/m2/08.

const root = process.cwd();
const src = (p: string) => path.join(root, "src", p);
const walk = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    : [];
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = (f: string) => strip(fs.readFileSync(f, "utf8"));
const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/");

const SCREENS = [...walk(src("components/student")), ...walk(src("app/student/crosswords"))].filter((f) => f.endsWith(".tsx"));

describe("student screens: styling", () => {
  it("there are screens to check", () => {
    expect(SCREENS.length).toBeGreaterThanOrEqual(9);
  });

  it("no class string sets two background colours, also when a constant is spliced in (a white button background once hid the white submit label)", () => {
    const literal = /(["`])((?:(?!\1)[^\n])*?)\1/g;
    const bg = /(?<![\w:-])bg-[\w[\]#./-]+/g;
    for (const f of SCREENS) {
      const raw = fs.readFileSync(f, "utf8");
      // string constants of the file, so ${BTN} is read as what it holds
      const consts = new Map<string, string>();
      for (let pass = 0; pass < 3; pass++) {
        for (const m of raw.matchAll(/const ([A-Z_]+) = (["`])((?:(?!\2)[^\n])*?)\2/g)) {
          consts.set(m[1], m[3].replace(/\$\{([A-Z_]+)\}/g, (_, n: string) => consts.get(n) ?? ""));
        }
      }
      for (const m of raw.matchAll(literal)) {
        const text = m[2].replace(/\$\{([A-Z_]+)\}/g, (_, n: string) => consts.get(n) ?? "");
        const colours = new Set([...text.matchAll(bg)].map((x) => x[0]));
        expect(colours.size, `${rel(f)}: "${text.slice(0, 90)}"`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("buttons and links are at least 44px tall by class", () => {
    for (const f of ["play-tools.tsx", "crossword-play-list.tsx", "crossword-result.tsx", "completion-moment.tsx", "play-clues.tsx"]) {
      const c = code(src("components/student/" + f));
      const buttons = [...c.matchAll(/<(button|Link)\b[\s\S]*?className=(?:"([^"]*)"|\{([A-Z]+|`[^`]*`)\})/g)];
      expect(buttons.length, f).toBeGreaterThan(0);
      for (const m of buttons) {
        const cls = m[2] ?? m[3];
        // a constant (BTN, SUBMIT, PRIMARY ...) is checked where it is defined
        if (/^[A-Z]+$/.test(cls)) continue;
        expect(cls, `${f}: ${cls.slice(0, 70)}`).toMatch(/min-h-1[1-4]/);
      }
      for (const m of c.matchAll(/const (BASE|BTN|SUBMIT|PRIMARY|SECONDARY) = [`"]([^`"]*)/g)) {
        if (m[1] === "BTN" || m[1] === "SUBMIT") continue; // built from BASE
        expect(m[2], `${f}: ${m[1]}`).toMatch(/min-h-1[1-4]/);
      }
    }
  });

  it("inputs are 16px so a phone does not zoom in on focus", () => {
    const c = code(src("components/student/crossword-play-board.tsx"));
    const inputs = [...c.matchAll(/<input[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    for (const i of inputs) expect(i).toMatch(/fontSize: 16/);
  });
});

describe("student screens: accessibility wiring", () => {
  it("the grid is a real grid of rows, with named cells, and its selected state is not colour only", () => {
    const c = code(src("components/student/play-grid.tsx"));
    for (const need of [/role="grid"/, /role="row"/, /role="gridcell"/, /aria-selected=/, /aria-label=\{name\}/, /border-\[3px\]/]) expect(c).toMatch(need);
  });

  it("the finishing moment respects reduced motion and does not move on by itself in that case", () => {
    const c = code(src("components/student/completion-moment.tsx"));
    expect(c).toMatch(/prefers-reduced-motion: reduce/);
    expect(c).toMatch(/if \(reduced !== false\) return/);
    expect(c).toMatch(/role="status"/);
    const css = fs.readFileSync(src("app/globals.css"), "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.play-sweep[\s\S]*?animation: none/);
  });

  it("the banner sits above the puzzle and cannot cover it", () => {
    const board = code(src("components/student/crossword-play-board.tsx"));
    expect(board.indexOf("<CompletionMoment")).toBeGreaterThan(-1);
    expect(board.indexOf("<CompletionMoment")).toBeLessThan(board.indexOf("<PlayGrid"));
    const moment = code(src("components/student/completion-moment.tsx"));
    expect(moment).not.toMatch(/\bfixed\b|backdrop|blur|opacity-|inset-0\b/);
  });

  it("the save indicator and the tools are labelled live regions or groups", () => {
    expect(code(src("components/student/save-indicator.tsx"))).toMatch(/role="status"/);
    expect(code(src("components/student/play-tools.tsx"))).toMatch(/role="group"/);
  });

  it("the play page asks the browser to shrink the page for the soft keyboard", () => {
    expect(code(src("app/student/crosswords/[assignmentId]/page.tsx"))).toMatch(/interactiveWidget: "resizes-content"/);
  });

  it("language is Korean for the input and the page", () => {
    expect(code(src("components/student/crossword-play-board.tsx"))).toMatch(/lang="ko"/);
    expect(fs.readFileSync(src("app/layout.tsx"), "utf8")).toMatch(/<html lang="ko">/);
  });
});

describe("student pages: gate and guard", () => {
  it("every page is behind the go-live gate and the student guard", () => {
    for (const p of ["app/student/crosswords/page.tsx", "app/student/crosswords/[assignmentId]/page.tsx", "app/student/crosswords/[assignmentId]/result/page.tsx"]) {
      const c = code(src(p));
      expect(c, p).toMatch(/isCrosswordPlayEnabled\(\)/);
      expect(c, p).toMatch(/requireStudentAreaPage\(\)/);
      expect(c, p).toMatch(/dynamic = "force-dynamic"/);
    }
  });

  it("the link on the student home only appears when the gate is open", () => {
    const c = code(src("app/student/page.tsx"));
    expect(c).toMatch(/isCrosswordPlayEnabled\(\)/);
    expect(c).toMatch(/playable !== null/);
  });

  it("no page takes a student id from the URL", () => {
    for (const f of walk(src("app/student/crosswords")).filter((x) => x.endsWith("page.tsx"))) {
      const c = code(f);
      expect(c, rel(f)).not.toMatch(/studentId\s*[:=]\s*(params|searchParams)|params\.studentId|searchParams/);
      expect(c, rel(f)).toMatch(/getStudentIdForProfile\(profile\.id\)/);
    }
  });

  it("nothing competitive, no badge, no team on any student screen", () => {
    for (const f of SCREENS) expect(code(f), rel(f)).not.toMatch(/leaderboard|badge|ranking|teamId|team_id|presence|helpRequest|순위|리더보드|배지|경쟁/i);
  });
});

describe("student screens: pinned tools bar (M2-2.4d)", () => {
  it("both text inputs of the board keep room above the pinned tools bar when scrolled into view", () => {
    const c = code(src("components/student/crossword-play-board.tsx"));
    const inputs = [...c.matchAll(/<input[\s\S]*?\/>/g)].map((m) => m[0]);
    for (const i of inputs) expect(i).toMatch(/play-input/);
    expect(fs.readFileSync(src("app/globals.css"), "utf8")).toMatch(/\.play-input\s*\{[^}]*scroll-margin-bottom/);
  });
});
