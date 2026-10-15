import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static regression test: every authenticated page must go through the shared guard.
//  - /teacher/**  (except /teacher/sign-in) -> requireTeacherAreaPage()
//  - /student/**  (except /student/sign-in) -> requireRole("student")

function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return pages(full);
    return e.name === "page.tsx" ? [full] : [];
  });
}

const rel = (p: string) => path.relative("src/app", p).replaceAll("\\", "/");

describe("page guards", () => {
  const teacherPages = pages("src/app/teacher").filter((p) => !rel(p).startsWith("teacher/sign-in"));
  const studentPages = pages("src/app/student").filter((p) => !rel(p).startsWith("student/sign-in"));

  it("finds the expected pages", () => {
    expect(teacherPages.length).toBeGreaterThanOrEqual(8);
    expect(studentPages.length).toBeGreaterThanOrEqual(2);
  });

  it.each(teacherPages.map((p) => [rel(p), p]))("%s uses requireTeacherAreaPage()", (_name, file) => {
    const src = fs.readFileSync(file, "utf8");
    expect(src).toContain('from "@/lib/rbac/page-guard"');
    expect(src).toMatch(/await requireTeacherAreaPage\(\)/);
  });

  it.each(studentPages.map((p) => [rel(p), p]))('%s requires requireRole("student")', (_name, file) => {
    const src = fs.readFileSync(file, "utf8");
    expect(src).toMatch(/requireRole\("student"\)/);
  });
});
