"use server";

import { requireTeacherArea } from "@/lib/rbac/guards";
import { IdentityError } from "@/features/identity/errors";
import { ContentImportError } from "../import/import-errors";
import { ContentEntryError } from "./errors";
import { archiveContentSet, renameContentSet, unarchiveContentSet, updateContentEntry } from "./service";

export type ContentSetActionState = { ok: boolean; error?: string; title?: string };

export type ContentEntryActionState = {
  ok: boolean;
  /** One or more rule messages (the same Korean texts the importer shows). */
  errors?: string[];
  warnings?: string[];
  saved?: { term: string; definition: string; answer: string; answerLength: number; changed: boolean };
};

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

/** Unauthenticated / non-teacher callers get an error state; nothing is changed. */
async function run<T extends { ok: boolean }>(
  work: (actor: Awaited<ReturnType<typeof requireTeacherArea>>) => Promise<T>,
  fail: (messages: string[]) => T,
): Promise<T> {
  try {
    return await work(await requireTeacherArea());
  } catch (error) {
    if (error instanceof ContentEntryError) return fail(error.messages);
    if (error instanceof ContentImportError || error instanceof IdentityError) return fail([error.message]);
    throw error;
  }
}

const setFail = (messages: string[]): ContentSetActionState => ({ ok: false, error: messages[0] });

export async function renameContentSetAction(_prev: ContentSetActionState, formData: FormData): Promise<ContentSetActionState> {
  return run<ContentSetActionState>(async (actor) => {
    const title = await renameContentSet(actor, text(formData, "setId").trim(), text(formData, "title"));
    return { ok: true, title };
  }, setFail);
}

export async function archiveContentSetAction(_prev: ContentSetActionState, formData: FormData): Promise<ContentSetActionState> {
  return run<ContentSetActionState>(async (actor) => {
    await archiveContentSet(actor, text(formData, "setId").trim());
    return { ok: true };
  }, setFail);
}

export async function unarchiveContentSetAction(_prev: ContentSetActionState, formData: FormData): Promise<ContentSetActionState> {
  return run<ContentSetActionState>(async (actor) => {
    await unarchiveContentSet(actor, text(formData, "setId").trim());
    return { ok: true };
  }, setFail);
}

export async function updateContentEntryAction(_prev: ContentEntryActionState, formData: FormData): Promise<ContentEntryActionState> {
  return run<ContentEntryActionState>(
    async (actor) => {
      const result = await updateContentEntry(actor, text(formData, "entryId").trim(), {
        term: text(formData, "term"),
        definition: text(formData, "definition"),
      });
      return {
        ok: true,
        warnings: result.warnings,
        saved: {
          term: result.term,
          definition: result.definition,
          answer: result.answer,
          answerLength: result.answerLength,
          changed: result.changed,
        },
      };
    },
    (messages): ContentEntryActionState => ({ ok: false, errors: messages }),
  );
}
