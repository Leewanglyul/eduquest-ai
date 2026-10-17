/**
 * Request bodies of the play API. Every schema is strict: a body with any other key is refused, so a client can never
 * smuggle a selected cell, the current word or the current clue to the server (that would be the focus tracking of
 * doc 06 CE-3, blocked on governance question G1). Shared by the handlers and the tests; no server-only import.
 */
import { z } from "zod";

const cellKey = z.string().regex(/^\d{1,2},\d{1,2}$/);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const saveBodySchema = z
  .object({
    patch: z.record(cellKey, z.union([z.string().max(8), z.null()])),
    activeMs: z.number().int().min(0).max(60_000),
  })
  .strict();

export const checkBodySchema = z
  .object({
    scope: z.enum(["cell", "word", "puzzle"]),
    keys: z.array(cellKey).max(225),
    baseRevision: revision,
  })
  .strict();

export const revealBodySchema = z.object({ key: cellKey, baseRevision: revision }).strict();
export const chosungBodySchema = z.object({ number: z.number().int().min(1).max(999), direction: z.enum(["across", "down"]) }).strict();
export const submitBodySchema = z.object({ baseRevision: revision }).strict();

/** The exact key sets, for the tests that pin "no extra field is ever sent". */
export const BODY_KEYS = {
  save: ["activeMs", "patch"],
  check: ["baseRevision", "keys", "scope"],
  reveal: ["baseRevision", "key"],
  chosung: ["direction", "number"],
  submit: ["baseRevision"],
} as const;

export type SaveBody = z.infer<typeof saveBodySchema>;
export type CheckBody = z.infer<typeof checkBodySchema>;
export type RevealBody = z.infer<typeof revealBodySchema>;
export type ChosungBody = z.infer<typeof chosungBodySchema>;
export type SubmitBody = z.infer<typeof submitBodySchema>;
