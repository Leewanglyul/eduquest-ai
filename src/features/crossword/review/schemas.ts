import { z } from "zod";

import {
  CROSSWORD_MAX_GRID,
  CROSSWORD_MAX_WORD_LEN,
  CROSSWORD_MAX_WORDS,
  CROSSWORD_MIN_GRID,
  CROSSWORD_SCRIPTS,
} from "../generator/constants";
import { CROSSWORD_CLUE_MAX_CHARS, CROSSWORD_TITLE_MAX_CHARS } from "./constants";

const uuid = z.string().uuid();

/** What a teacher chooses before generating. Everything else (seed, tickets) is decided by the server. */
export const generateOptionsSchema = z.object({
  setId: uuid,
  level: z.enum(["easy", "normal", "hard"]),
  /** Only to come back to a puzzle the teacher liked ("advanced" line). Omitted = a fresh random seed. */
  seed: z.number().int().min(0).max(0xffffffff).optional(),
  gridSize: z.number().int().min(CROSSWORD_MIN_GRID).max(CROSSWORD_MAX_GRID).optional(),
  maxWords: z.number().int().min(1).max(CROSSWORD_MAX_WORDS).optional(),
  maxWordLen: z.number().int().min(1).max(CROSSWORD_MAX_WORD_LEN).optional(),
  scripts: z.array(z.enum(CROSSWORD_SCRIPTS)).min(1).max(CROSSWORD_SCRIPTS.length).optional(),
  maskClues: z.boolean().optional(),
  pinnedIds: z.array(uuid).max(CROSSWORD_MAX_WORDS).optional(),
  excludedIds: z.array(uuid).max(200).optional(),
});
export type GenerateOptionsInput = z.infer<typeof generateOptionsSchema>;

export const titleSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(CROSSWORD_TITLE_MAX_CHARS));

/** Save = the same options and seed as the preview, plus the ticket, the title and optionally the draft being re-saved. */
export const saveDraftSchema = generateOptionsSchema.extend({
  seed: z.number().int().min(0).max(0xffffffff),
  ticketId: uuid,
  ticketToken: z.string().min(16).max(200),
  title: titleSchema,
  /** Replace the grid of this version-1 draft instead of creating a new puzzle. */
  puzzleId: uuid.optional(),
});
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;

export const updateDraftSchema = z
  .object({
    puzzleId: uuid,
    title: titleSchema.optional(),
    clues: z
      .array(
        z.object({
          number: z.number().int().min(1),
          direction: z.enum(["across", "down"]),
          clue: z
            .string()
            .transform((s) => s.trim())
            .pipe(z.string().min(1).max(CROSSWORD_CLUE_MAX_CHARS)),
        }),
      )
      .max(60)
      .optional(),
  })
  .refine((v) => v.title !== undefined || (v.clues !== undefined && v.clues.length > 0), {
    message: "nothing to update",
  });
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;

const isoDate = z.string().datetime({ offset: true }).nullable().optional();

export const publishSchema = z.object({
  puzzleId: uuid,
  classroomIds: z.array(uuid).min(1).max(30),
  opensAt: isoDate,
  closesAt: isoDate,
});
export type PublishInput = z.infer<typeof publishSchema>;

export const idSchema = z.object({ id: uuid });
