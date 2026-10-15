"use server";

import { BatchError } from "./batch-errors";
import { parseStudentCsv } from "./csv-parse";
import { buildPreview, type BatchPreview } from "./preview";
import { commitStudentBatch, createBatchPreview } from "./batch-service";
import { buildCredentialCsv } from "./credential-export";
import type { BatchSummary } from "./batch-schemas";
import { requireTeacherArea } from "@/lib/rbac/guards";
import { IdentityError } from "@/features/identity/errors";
import { EnrollmentError } from "@/features/enrollments/errors";
import { requireManageableClassroom } from "@/features/enrollments/service";

export type BatchPreviewState = {
  ok: boolean;
  error?: string;
  preview?: BatchPreview;
  /** Present only when there is at least one valid row to commit. */
  batchId?: string;
  commitToken?: string;
  expiresAt?: string;
};

export type BatchRunState = {
  ok: boolean;
  error?: string;
  summary?: BatchSummary;
  /** One-time credential sheet; returned once and never stored. */
  credentialCsv?: string;
};

const classroomIdOf = (formData: FormData) => String(formData.get("classroomId") ?? "").trim() || null;

/** Unauthenticated / non-teacher callers get an error state; nothing is created or stored. */
async function authorize(): Promise<
  { ok: true; profile: Awaited<ReturnType<typeof requireTeacherArea>> } | { ok: false; error: string }
> {
  try {
    return { ok: true, profile: await requireTeacherArea() };
  } catch (error) {
    if (error instanceof IdentityError) return { ok: false, error: error.message };
    throw error;
  }
}

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
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const profile = auth.profile;
  const classroomId = classroomIdOf(formData);
  try {
    if (classroomId) await requireManageableClassroom(profile, classroomId);
    const preview = buildPreview(parseStudentCsv(await readCsv(formData)));
    if (preview.valid.length === 0) return { ok: true, preview };

    const ticket = await createBatchPreview({
      schoolId: profile.school_id,
      actorId: profile.id,
      classroomId,
      rows: preview.valid,
    });
    return { ok: true, preview, ...ticket };
  } catch (error) {
    if (error instanceof BatchError || error instanceof EnrollmentError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/** Re-parses and re-validates server-side; the client preview is never trusted. */
export async function commitBatchAction(
  _prev: BatchRunState,
  formData: FormData,
): Promise<BatchRunState> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const profile = auth.profile;
  const classroomId = classroomIdOf(formData);
  try {
    // Re-check at commit time: the classroom may have been archived since the preview.
    if (classroomId) await requireManageableClassroom(profile, classroomId);
    const { valid } = buildPreview(parseStudentCsv(await readCsv(formData)));
    const summary = await commitStudentBatch({
      batchId: String(formData.get("batchId") ?? ""),
      commitToken: String(formData.get("commitToken") ?? ""),
      schoolId: profile.school_id,
      actorId: profile.id,
      classroomId,
      actor: profile,
      rows: valid,
    });
    return { ok: true, summary, credentialCsv: buildCredentialCsv(summary.results) };
  } catch (error) {
    if (error instanceof BatchError || error instanceof EnrollmentError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
