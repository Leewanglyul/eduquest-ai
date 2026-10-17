import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------------------------
// M2-1.3: the CSV content caps (rows and bytes), the same boundary pattern as batch-cap.test.ts (R2).
//
//   constants: pinned values, and the TypeScript answer bounds stay inside the database CHECKs
//   parser:    cap rows pass, cap + 1 is refused with the count and the cap in the message
//   bytes:     exactly the byte cap passes, one byte more is refused; Korean is measured in bytes
//   schema:    the run schema rejects more than the cap even if the parser were bypassed
//
// Pure functions only: no database, no Supabase. Action-level cap tests arrive with M2-1.2.
// ---------------------------------------------------------------------------------------------

import {
  ANSWER_MAX_LEN,
  ANSWER_MIN_LEN,
  COMMIT_TOKEN_TTL_MINUTES,
  MAX_ACTIVE_PREVIEWS,
  PREVIEW_CLEANUP_GRACE_HOURS,
  DB_ANSWER_MAX_LEN,
  DB_ANSWER_MIN_LEN,
  DEFINITION_MAX_CHARS,
  MAX_CONTENT_CSV_BYTES,
  MAX_CONTENT_ROWS,
  MAX_SET_ENTRIES,
  NORMALIZER_VERSION,
  TERM_MAX_CHARS,
  contentRunInputSchema,
  type ContentRow,
} from "@/features/content/import/content-schemas";
import { assertCsvByteLength, decodeCsvBytes } from "@/features/content/import/csv-decode";
import { parseContentCsv } from "@/features/content/import/csv-parse";
import { ContentImportError } from "@/features/content/import/import-errors";

const csvOf = (n: number) =>
  ["term,definition", ...Array.from({ length: n }, (_, i) => `단어${i + 1},뜻${i + 1}`)].join("\n");

/** A header plus one row whose definition is padded so the whole text is exactly `bytes` UTF-8 bytes. */
const csvOfBytes = (bytes: number) => {
  const head = "term,definition\n사과,";
  const pad = bytes - new TextEncoder().encode(head).byteLength;
  return head + "x".repeat(pad);
};

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof ContentImportError ? e.code : `other:${String(e)}`;
  }
  return undefined;
};

describe("M2-1.3 caps: constants", () => {
  it("are pinned to the agreed values", () => {
    expect(MAX_CONTENT_ROWS).toBe(100);
    expect(MAX_CONTENT_CSV_BYTES).toBe(128 * 1024);
    expect(MAX_SET_ENTRIES).toBe(200);
    expect(TERM_MAX_CHARS).toBe(60);
    expect(DEFINITION_MAX_CHARS).toBe(200);
    expect(ANSWER_MIN_LEN).toBe(1);
    expect(ANSWER_MAX_LEN).toBe(15);
    expect(NORMALIZER_VERSION).toBe(1);
    expect(COMMIT_TOKEN_TTL_MINUTES).toBe(15);
    expect(MAX_ACTIVE_PREVIEWS).toBe(10);
    expect(PREVIEW_CLEANUP_GRACE_HOURS).toBe(24);
  });

  it("keep the answer bounds inside the database CHECK bounds", () => {
    expect(ANSWER_MIN_LEN).toBeGreaterThanOrEqual(DB_ANSWER_MIN_LEN);
    expect(ANSWER_MAX_LEN).toBeLessThanOrEqual(DB_ANSWER_MAX_LEN);
    expect(ANSWER_MIN_LEN).toBeLessThanOrEqual(ANSWER_MAX_LEN);
  });

  it("keep one file inside one set", () => {
    expect(MAX_CONTENT_ROWS).toBeLessThanOrEqual(MAX_SET_ENTRIES);
  });

  it("agree with the database CHECKs written in the migration", () => {
    const sql = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/migrations/20261017000003_content_sets_entries.sql"),
      "utf8",
    );
    expect(sql).toContain(`char_length(term) BETWEEN 1 AND ${TERM_MAX_CHARS}`);
    expect(sql).toContain(`char_length(definition) BETWEEN 1 AND ${DEFINITION_MAX_CHARS}`);
    expect(sql).toContain(`char_length(answer) BETWEEN ${DB_ANSWER_MIN_LEN} AND ${DB_ANSWER_MAX_LEN}`);
  });
});

describe("M2-1.3 caps: row count", () => {
  it("accepts exactly the cap", () => {
    expect(parseContentCsv(csvOf(MAX_CONTENT_ROWS)).rows).toHaveLength(MAX_CONTENT_ROWS);
  });

  it("refuses cap + 1 and names the count and the cap", () => {
    try {
      parseContentCsv(csvOf(MAX_CONTENT_ROWS + 1));
      expect.unreachable();
    } catch (e) {
      const err = e as ContentImportError;
      expect(err).toBeInstanceOf(ContentImportError);
      expect(err.code).toBe("TOO_MANY_ROWS");
      expect(err.message).toContain(`${MAX_CONTENT_ROWS + 1}개`);
      expect(err.message).toContain(`최대 ${MAX_CONTENT_ROWS}개`);
    }
  });

  it("does not count blank rows or the header against the cap", () => {
    const withBlanks = csvOf(MAX_CONTENT_ROWS).replace("\n", "\n\n\n");
    expect(parseContentCsv(withBlanks).rows).toHaveLength(MAX_CONTENT_ROWS);
  });
});

describe("M2-1.3 caps: bytes", () => {
  it("accepts exactly the byte cap", () => {
    const text = csvOfBytes(MAX_CONTENT_CSV_BYTES);
    expect(new TextEncoder().encode(text).byteLength).toBe(MAX_CONTENT_CSV_BYTES);
    expect(codeOf(() => parseContentCsv(text))).toBeUndefined();
  });

  it("refuses one byte more", () => {
    const text = csvOfBytes(MAX_CONTENT_CSV_BYTES + 1);
    expect(codeOf(() => parseContentCsv(text))).toBe("FILE_TOO_LARGE");
  });

  it("measures Korean text in bytes, not characters", () => {
    const text = `term,definition\n사과,${"가".repeat(Math.floor(MAX_CONTENT_CSV_BYTES / 3) + 1)}`;
    expect(text.length).toBeLessThan(MAX_CONTENT_CSV_BYTES);
    expect(codeOf(() => parseContentCsv(text))).toBe("FILE_TOO_LARGE");
  });

  it("checks a byte length before anything is read", () => {
    expect(codeOf(() => assertCsvByteLength(0))).toBe("EMPTY_FILE");
    expect(codeOf(() => assertCsvByteLength(MAX_CONTENT_CSV_BYTES))).toBeUndefined();
    expect(codeOf(() => assertCsvByteLength(MAX_CONTENT_CSV_BYTES + 1))).toBe("FILE_TOO_LARGE");
  });

  it("refuses an oversized upload before decoding it", () => {
    expect(codeOf(() => decodeCsvBytes(new Uint8Array(MAX_CONTENT_CSV_BYTES + 1)))).toBe("FILE_TOO_LARGE");
  });

  it("names the limit in kilobytes", () => {
    try {
      assertCsvByteLength(MAX_CONTENT_CSV_BYTES + 1);
      expect.unreachable();
    } catch (e) {
      expect((e as ContentImportError).message).toContain(`${MAX_CONTENT_CSV_BYTES / 1024}KB`);
    }
  });
});

describe("M2-1.3 caps: run schema", () => {
  const row = (i: number): ContentRow => ({
    term: `단어${i}`,
    definition: `뜻${i}`,
    answer: `단어${i}`.slice(0, 2) + String(i % 10),
    script: "mixed",
  });

  it("accepts the cap and rejects cap + 1", () => {
    const rows = Array.from({ length: MAX_CONTENT_ROWS + 1 }, (_, i) => row(i));
    expect(contentRunInputSchema.safeParse({ rows: rows.slice(0, MAX_CONTENT_ROWS) }).success).toBe(true);
    expect(contentRunInputSchema.safeParse({ rows }).success).toBe(false);
  });

  it("rejects an empty list and an answer the grid cannot hold", () => {
    expect(contentRunInputSchema.safeParse({ rows: [] }).success).toBe(false);
    expect(contentRunInputSchema.safeParse({ rows: [{ ...row(1), answer: "사과!" }] }).success).toBe(false);
    expect(contentRunInputSchema.safeParse({ rows: [{ ...row(1), answer: "abc" }] }).success).toBe(false);
  });
});

describe("M2-1.3 validation modules are database free", () => {
  it("import nothing from supabase or the audit log", () => {
    const dir = path.resolve(import.meta.dirname, "../../src/features/content/import");
    // The validation modules of M2-1.3 (the I/O modules of M2-1.2 are import-service.ts, actions.ts, limits.ts).
    const pure = [
      "content-schemas.ts", "csv-decode.ts", "csv-records.ts", "csv-parse.ts", "import-errors.ts",
      "normalize.ts", "row-rules.ts", "preview.ts", "rows-hash.ts", "read-file.ts",
    ];
    for (const file of pure) {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/from\s+["']@\/lib\/(supabase|audit)/);
      expect(source, file).not.toMatch(/from\s+["']@supabase\//);
    }
  });
});
