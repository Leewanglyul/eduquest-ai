"use server";

import { requireTeacherArea } from "@/lib/rbac/guards";
import { IdentityError } from "@/features/identity/errors";
import { CrosswordError, type CrosswordErrorCode } from "../messages";
import {
  addAssignments,
  archivePuzzle,
  closeAssignment,
  createVersion,
  generatePreview,
  publishPuzzle,
  regeneratePreview,
  saveDraft,
  unarchivePuzzle,
  updateDraft,
  type PreviewResult,
  type PublishResult,
  type SavedDraft,
} from "./service";

/**
 * Server actions of the crossword teacher backend (no screens yet). Every action takes a FormData with one field,
 * `payload`, holding JSON, and answers with a plain state object. The teacher guard runs first; the database
 * functions authorise again and write the audit rows.
 */
export type CrosswordActionState<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; code?: CrosswordErrorCode };

const payloadOf = (formData: FormData): unknown => {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const idOf = (formData: FormData): string => {
  const payload = payloadOf(formData) as { id?: unknown } | undefined;
  return typeof payload?.id === "string" ? payload.id : "";
};

/** Unauthenticated / non-teacher callers and rule violations get an error state; unknown errors are rethrown. */
async function run<T>(
  work: (actor: Awaited<ReturnType<typeof requireTeacherArea>>) => Promise<T>,
): Promise<CrosswordActionState<T>> {
  try {
    return { ok: true, data: await work(await requireTeacherArea()) } as CrosswordActionState<T>;
  } catch (error) {
    if (error instanceof CrosswordError)
      return { ok: false, error: error.message, code: error.code };
    if (error instanceof IdentityError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function generateCrosswordAction(
  _prev: unknown,
  formData: FormData,
): Promise<CrosswordActionState<PreviewResult>> {
  return run((actor) => generatePreview(actor, payloadOf(formData)));
}

/** Same options, new random seed. Unlimited (decision C3); the cost per call is bounded by the generator. */
export async function regenerateCrosswordAction(
  _prev: unknown,
  formData: FormData,
): Promise<CrosswordActionState<PreviewResult>> {
  return run((actor) => regeneratePreview(actor, payloadOf(formData)));
}

export async function saveCrosswordDraftAction(
  _prev: unknown,
  formData: FormData,
): Promise<CrosswordActionState<SavedDraft>> {
  return run((actor) => saveDraft(actor, payloadOf(formData)));
}

export async function updateCrosswordDraftAction(_prev: unknown, formData: FormData) {
  return run((actor) => updateDraft(actor, payloadOf(formData)));
}

export async function createCrosswordVersionAction(_prev: unknown, formData: FormData) {
  return run((actor) => createVersion(actor, idOf(formData)));
}

export async function publishCrosswordAction(
  _prev: unknown,
  formData: FormData,
): Promise<CrosswordActionState<PublishResult>> {
  return run((actor) => publishPuzzle(actor, payloadOf(formData)));
}

export async function addCrosswordAssignmentsAction(_prev: unknown, formData: FormData) {
  return run((actor) => addAssignments(actor, payloadOf(formData)));
}

export async function archiveCrosswordAction(_prev: unknown, formData: FormData) {
  return run((actor) => archivePuzzle(actor, idOf(formData)));
}

export async function unarchiveCrosswordAction(_prev: unknown, formData: FormData) {
  return run((actor) => unarchivePuzzle(actor, idOf(formData)));
}

export async function closeCrosswordAssignmentAction(_prev: unknown, formData: FormData) {
  return run((actor) => closeAssignment(actor, idOf(formData)));
}
