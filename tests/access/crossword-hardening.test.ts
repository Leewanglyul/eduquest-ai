import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { generateCrossword } from "@/features/crossword/generator/generate";
import { computeReadiness } from "@/features/crossword/readiness";

// M2-2.2e hardening guards: performance budgets for the pure parts of the teacher review, and a check that the
// teacher-side code does not hard-code a single student owner (docs/m2/06 §11.8 and §12.8: the attempt model of
// M2-2.4 must stay open for a shared team attempt).

const SYLLABLES = "가나다라마바사아자차카타파하고".split("");
const words = (n: number): string[] => {
  const out: string[] = [];
  for (const a of SYLLABLES) for (const b of SYLLABLES) if (a !== b) out.push(a + b);
  return out.slice(0, n);
};
const entries = (n: number) =>
  words(n).map((w, i) => ({ id: `e${i}`, answer: w, clue: `${w} 설명 ${i}` }));

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const measure = (fn: () => unknown, runs = 5): number => {
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return median(times);
};

describe("performance budgets (generous: roughly 10x what was measured on a developer machine)", () => {
  it("generates a puzzle from a 25-word and a 200-word set well inside a request", () => {
    expect(
      measure(() => generateCrossword(entries(25), { seed: 1, gridSize: 15, maxWords: 25 })),
    ).toBeLessThan(1000);
    expect(
      measure(() => generateCrossword(entries(200), { seed: 1, gridSize: 15, maxWords: 25 }), 3),
    ).toBeLessThan(3000);
  });

  it("computes the readiness of a 200-word set well inside a request", () => {
    expect(measure(() => computeReadiness(entries(200)), 3)).toBeLessThan(3000);
  });

  it("the largest set a teacher can have (200 entries, doc 01 D1) produces a valid result, not a crash", () => {
    const r = generateCrossword(entries(200), { seed: 7, gridSize: 15, maxWords: 25 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.puzzle.words.length).toBeLessThanOrEqual(25 + 5);
    expect(computeReadiness(entries(200)).measures.eligible).toBe(200);
  });
});

describe("compatibility with a shared team attempt (M2-2.4 guidance)", () => {
  const root = process.cwd();
  const files = (dir: string, pattern: RegExp): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return files(rel, pattern);
      return pattern.test(e.name) ? [rel] : [];
    });

  const teacherSide = [
    ...files("src/features/crossword/review", /\.tsx?$/),
    ...files("src/app/teacher/crosswords", /\.tsx?$/),
    ...files("src/components/teacher", /^crossword-.*\.tsx$/),
    "src/features/crossword/access.ts",
    "src/features/crossword/readiness.ts",
  ];

  it("has teacher-side files to check", () => {
    expect(teacherSide.length).toBeGreaterThan(15);
  });

  it("no teacher-side code reads or writes student attempts or assumes one student owner", () => {
    for (const file of teacherSide) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source, file).not.toMatch(
        /crossword_attempts|student_id|from\("students"\)|owner_student/,
      );
    }
  });

  it("the schema keeps assignments free of any student column, so an attempt can later belong to a student or a team", () => {
    const migrations = fs
      .readdirSync(path.join(root, "supabase/migrations"))
      .filter((f) => /crossword/.test(f))
      .map((f) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8"))
      .join("\n");
    // M2-2.4a F1 added the attempt tables. The attempt names no student; the member table holds the owner, so a
    // shared (team) attempt stays possible.
    expect(migrations).toMatch(/CREATE TABLE public\.crossword_attempts/i);
    const attempts = /CREATE TABLE public\.crossword_attempts \(([\s\S]*?)\n\);/.exec(migrations)?.[1] ?? "";
    expect(attempts).toContain("assignment_id");
    expect(attempts).not.toMatch(/student_id|owner_id/i);
    expect(migrations).toMatch(/CREATE TABLE public\.crossword_attempt_members[\s\S]*?student_id/i);
    const assignments =
      /CREATE TABLE public\.crossword_assignments \(([\s\S]*?)\n\);/.exec(migrations)?.[1] ?? "";
    expect(assignments).toContain("classroom_id");
    expect(assignments).not.toMatch(/student/i);
  });
});
