import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { NORMALIZER_VERSION } from "@/features/content/import/content-schemas";
import { hashContentRows, sha256Hex, type RowsHashInput } from "@/features/content/import/rows-hash";
import { mapDatabaseErrorCode } from "@/features/content/import/import-errors";

const base: RowsHashInput = {
  mode: "append",
  setId: "set-1",
  newSetTitle: null,
  classroomId: null,
  rows: [
    { term: "사과", definition: "과일" },
    { term: "배", definition: "과일" },
  ],
};

describe("M2-1.3 rows hash (commit token binding)", () => {
  it("is stable for the same input and looks like a sha256 hex", () => {
    expect(hashContentRows(base)).toBe(hashContentRows({ ...base, rows: [...base.rows] }));
    expect(hashContentRows(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with the mode, the target set, the title and the classroom", () => {
    const h = hashContentRows(base);
    expect(hashContentRows({ ...base, mode: "replace" })).not.toBe(h);
    expect(hashContentRows({ ...base, setId: "set-2" })).not.toBe(h);
    expect(hashContentRows({ ...base, newSetTitle: "새 세트" })).not.toBe(h);
    expect(hashContentRows({ ...base, classroomId: "room-1" })).not.toBe(h);
  });

  it("changes with any term or definition, and with the order of rows", () => {
    const h = hashContentRows(base);
    expect(hashContentRows({ ...base, rows: [{ term: "사과", definition: "다른 뜻" }, base.rows[1]] })).not.toBe(h);
    expect(hashContentRows({ ...base, rows: [{ term: "사과!", definition: "과일" }, base.rows[1]] })).not.toBe(h);
    expect(hashContentRows({ ...base, rows: [base.rows[1], base.rows[0]] })).not.toBe(h);
    expect(hashContentRows({ ...base, rows: [base.rows[0]] })).not.toBe(h);
  });

  it("includes the normaliser version, so a changed rule set fails closed", () => {
    const withoutVersion = sha256Hex(
      JSON.stringify([base.mode, base.setId, base.newSetTitle, base.classroomId, base.rows.map((r) => [r.term, r.definition])]),
    );
    expect(hashContentRows(base)).not.toBe(withoutVersion);
    const withVersion = sha256Hex(
      JSON.stringify([NORMALIZER_VERSION, base.mode, base.setId, base.newSetTitle, base.classroomId, base.rows.map((r) => [r.term, r.definition])]),
    );
    expect(hashContentRows(base)).toBe(withVersion);
  });

  it("does not depend on fields outside term and definition (line numbers, warnings)", () => {
    const rich = base.rows.map((r, i) => ({ ...r, line: i + 10, warnings: ["FORMULA_PREFIX"] }));
    expect(hashContentRows({ ...base, rows: rich })).toBe(hashContentRows(base));
  });

  it("hashes bytes the same as the equivalent string", () => {
    expect(sha256Hex(new TextEncoder().encode("사과"))).toBe(sha256Hex("사과"));
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("M2-1.3 database function contract", () => {
  const sql = fs.readFileSync(
    path.resolve(import.meta.dirname, "../../supabase/migrations/20261017000004_fn_commit_content_import.sql"),
    "utf8",
  );

  it("raises only codes the TypeScript side can map", () => {
    const raised = Array.from(sql.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)).map((m) => m[1]);
    expect(raised.length).toBeGreaterThan(0);
    for (const code of new Set(raised)) {
      expect(mapDatabaseErrorCode(code), code).not.toBeNull();
    }
  });

  it("reads the keys that toCommitRows writes", () => {
    for (const key of ["term", "definition", "answer", "script", "normalizerVersion", "line"]) {
      expect(sql).toContain(`->> '${key}'`);
    }
  });
});
