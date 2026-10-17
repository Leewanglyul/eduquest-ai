import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// R2: the pilot batch cap (30 students per CSV).
//
//   parser:   cap rows pass, cap + 1 is refused with the count and the cap in the message
//   schema:   the run schema rejects more than the cap even if the parser were bypassed
//   actions:  preview and commit both refuse an over-cap file BEFORE any database write
//
// No database is touched: guards and the batch service are replaced.
// ---------------------------------------------------------------------------------------------

const calls = vi.hoisted(() => ({ createBatchPreview: 0, commitStudentBatch: 0 }));

vi.mock("@/lib/rbac/guards", () => ({
  requireTeacherArea: async () => ({ id: "teacher-1", school_id: "school-1", role: "teacher" }),
}));
vi.mock("@/features/enrollments/service", () => ({
  requireManageableClassroom: async () => undefined,
}));
vi.mock("@/features/accounts/batch/batch-service", () => ({
  createBatchPreview: async () => {
    calls.createBatchPreview += 1;
    return { batchId: "b1", commitToken: "t1", expiresAt: "2099-01-01T00:00:00Z" };
  },
  commitStudentBatch: async () => {
    calls.commitStudentBatch += 1;
    return { batchId: "b1", classroomId: null, total: 0, succeeded: 0, failed: 0, results: [] };
  },
}));

import { commitBatchAction, previewBatchAction } from "@/features/accounts/batch/actions";
import { BatchError } from "@/features/accounts/batch/batch-errors";
import {
  MAX_BATCH_ROWS,
  batchRunInputSchema,
  type BatchRow,
} from "@/features/accounts/batch/batch-schemas";
import { parseStudentCsv } from "@/features/accounts/batch/csv-parse";

const csvOf = (n: number) =>
  ["이름,학번,학년", ...Array.from({ length: n }, (_, i) => `학생${i + 1},${10000 + i},1`)].join("\n");

const formOf = (csv: string, extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.set("csv", csv);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
};

beforeEach(() => {
  calls.createBatchPreview = 0;
  calls.commitStudentBatch = 0;
});

describe("R2 batch cap: constant", () => {
  it("is 30 for the pilot", () => {
    expect(MAX_BATCH_ROWS).toBe(30);
  });
});

describe("R2 batch cap: parser", () => {
  it("accepts exactly the cap", () => {
    expect(parseStudentCsv(csvOf(MAX_BATCH_ROWS))).toHaveLength(MAX_BATCH_ROWS);
  });

  it("refuses cap + 1 and names the count and the cap", () => {
    const run = () => parseStudentCsv(csvOf(MAX_BATCH_ROWS + 1));
    expect(run).toThrow(BatchError);
    try {
      run();
    } catch (e) {
      const err = e as BatchError;
      expect(err.code).toBe("TOO_MANY_ROWS");
      expect(err.message).toContain(`${MAX_BATCH_ROWS + 1}명`);
      expect(err.message).toContain(`최대 ${MAX_BATCH_ROWS}명`);
      expect(err.message).not.toContain("200");
    }
  });

  it("still refuses the old 200-row size", () => {
    expect(() => parseStudentCsv(csvOf(200))).toThrow(BatchError);
  });
});

describe("R2 batch cap: run schema", () => {
  const row = (i: number): BatchRow => ({ studentName: `학생${i}`, studentNo: `${i}`, grade: "1" as BatchRow["grade"] });

  it("accepts cap rows and rejects cap + 1", () => {
    const rows = Array.from({ length: MAX_BATCH_ROWS + 1 }, (_, i) => row(i));
    expect(batchRunInputSchema.safeParse({ rows: rows.slice(0, MAX_BATCH_ROWS) }).success).toBe(true);
    expect(batchRunInputSchema.safeParse({ rows }).success).toBe(false);
  });
});

describe("R2 batch cap: actions", () => {
  it("preview of cap rows creates a batch", async () => {
    const state = await previewBatchAction({ ok: false }, formOf(csvOf(MAX_BATCH_ROWS)));
    expect(state.ok).toBe(true);
    expect(state.batchId).toBe("b1");
    expect(calls.createBatchPreview).toBe(1);
  });

  it("preview of cap + 1 is refused and creates no batch", async () => {
    const state = await previewBatchAction({ ok: false }, formOf(csvOf(MAX_BATCH_ROWS + 1)));
    expect(state.ok).toBe(false);
    expect(state.error).toContain(`최대 ${MAX_BATCH_ROWS}명`);
    expect(state.batchId).toBeUndefined();
    expect(calls.createBatchPreview).toBe(0);
  });

  it("commit of cap + 1 is refused even with a token and creates nothing", async () => {
    const state = await commitBatchAction(
      { ok: false },
      formOf(csvOf(MAX_BATCH_ROWS + 1), { batchId: "b1", commitToken: "t1" }),
    );
    expect(state.ok).toBe(false);
    expect(state.error).toContain(`최대 ${MAX_BATCH_ROWS}명`);
    expect(calls.commitStudentBatch).toBe(0);
  });
});
