"use server";

import { BatchError } from "./batch-errors";
import { parseStudentCsv } from "./csv-parse";
import { buildPreview, type BatchPreview } from "./preview";
import { runStudentBatch } from "./batch-service";
import { buildCredentialCsv } from "./credential-export";
import type { BatchSummary } from "./batch-schemas";
import { requireTeacherArea } from "@/lib/rbac/guards";

export type BatchPreviewState = { ok: boolean; error?: string; preview?: BatchPreview };
export type BatchRunState = {
  ok: boolean;
  error?: string;
  summary?: BatchSummary;
  /** One-time credential sheet; shown/downloaded once and never stored. */
  credentialCsv?: string;
};

async function readCsv(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) return file.text();
  const text = formData.get("csv");
  return typeof text === "string" ? text : "";
}

export async function previewBatchAction(
  _prev: BatchPreviewState,
  formData: FormData,
): Promise<BatchPreviewState> {
  await requireTeacherArea();
  try {
    const preview = buildPreview(parseStudentCsv(await readCsv(formData)));
    return { ok: true, preview };
  } catch (error) {
    if (error instanceof BatchError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Re-parses and re-validates server-side; the client preview is never trusted. */
export async function runBatchAction(
  _prev: BatchRunState,
  formData: FormData,
): Promise<BatchRunState> {
  const profile = await requireTeacherArea();
  try {
    const { valid } = buildPreview(parseStudentCsv(await readCsv(formData)));
    const summary = await runStudentBatch({
      schoolId: profile.school_id,
      actorId: profile.id,
      rows: valid,
    });
    return { ok: true, summary, credentialCsv: buildCredentialCsv(summary.results) };
  } catch (error) {
    if (error instanceof BatchError) return { ok: false, error: error.message };
    throw error;
  }
}
