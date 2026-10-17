import "server-only";

import crypto from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isTeacherArea, type ClassroomActor } from "@/features/classrooms/domain";
import { canWriteContentSet, getContentSetForActor, isUuid } from "@/features/content/sets/access";
import { listContentSets } from "@/features/content/sets/service";
import { listClassroomsForActor } from "@/features/classrooms/queries";
import type { Json } from "@/types/database";
import { actorClassroomIds, getCrosswordForActor, type CrosswordRecord } from "../access";
import { optionsForLevel, settingsForLevel } from "../generator/difficulty";
import { generateCrossword } from "../generator/generate";
import {
  GENERATOR_VERSION,
  CROSSWORD_MAX_SINGLE_WORDS,
  CROSSWORD_MAX_WORDS,
} from "../generator/constants";
import { describeDifficulty } from "../generator/score";
import type {
  CrosswordInputEntry,
  ExcludedEntry,
  GenerateFailureReason,
  GeneratorOptions,
  PuzzleScore,
  PuzzleStats,
  UnplacedEntry,
} from "../generator/types";
import { CrosswordError, mapDatabaseErrorCode } from "../messages";
import { computeReadiness, type ReadinessResult } from "../readiness";
import {
  generateOptionsSchema,
  publishSchema,
  saveDraftSchema,
  updateDraftSchema,
  type GenerateOptionsInput,
  type PublishInput,
  type SaveDraftInput,
  type UpdateDraftInput,
} from "./schemas";
import { createPreviewTicket, sha256Hex, type PreviewTicket } from "./tickets";

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

const randomSeed = (): number => crypto.randomInt(0, 0x1_0000_0000);

function parse<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CrosswordError("INVALID_INPUT");
  return result.data;
}

/** Runs a database function; our P0001 codes become CrosswordError, anything else is a bug and is rethrown. */
function unwrap<T>(result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) {
    const code = mapDatabaseErrorCode(result.error.message);
    if (code) throw new CrosswordError(code);
    throw result.error;
  }
  return result.data as T;
}

/** The set to generate from: visible, writable by the actor (D3), not archived, classroom not archived (P2). */
async function requireSetForGeneration(actor: ClassroomActor, setId: string) {
  const set = await getContentSetForActor(actor, setId);
  if (!set) throw new CrosswordError("SET_NOT_FOUND");
  if (!canWriteContentSet(set.role)) throw new CrosswordError("FORBIDDEN");
  if (set.archivedAt !== null) throw new CrosswordError("SET_ARCHIVED");
  if (set.classroomArchived) throw new CrosswordError("CLASSROOM_ARCHIVED");
  return set;
}

/** Live entries of the set in the generator's input shape: the definition is the clue (doc 04 §0). */
async function loadEntries(setId: string): Promise<CrosswordInputEntry[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("v_content_entries_active")
    .select("entry_id, answer, definition, position")
    .eq("set_id", setId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.entry_id as string,
    answer: r.answer as string,
    clue: r.definition as string,
  }));
}

/**
 * Generator options from what the teacher chose. No time budget on purpose: the number of attempts alone decides
 * the result, so the regeneration at save time gives exactly the puzzle that was previewed (doc 04 §2.8).
 */
function buildOptions(input: GenerateOptionsInput, seed: number): GeneratorOptions {
  const overrides: Partial<GeneratorOptions> = {
    maxSingleWords: CROSSWORD_MAX_SINGLE_WORDS,
    ...(input.gridSize !== undefined ? { gridSize: input.gridSize } : {}),
    ...(input.maxWords !== undefined ? { maxWords: input.maxWords } : {}),
    ...(input.maxWordLen !== undefined ? { maxWordLen: input.maxWordLen } : {}),
    ...(input.scripts !== undefined ? { scripts: input.scripts } : {}),
    ...(input.maskClues !== undefined ? { maskClues: input.maskClues } : {}),
    ...(input.pinnedIds ? { pinnedIds: new Set(input.pinnedIds) } : {}),
    ...(input.excludedIds ? { excludedIds: new Set(input.excludedIds) } : {}),
  };
  return optionsForLevel(input.level, seed, overrides);
}

// ---------------------------------------------------------------------------------------------------------------
// 1-2. Generate and regenerate a preview
// ---------------------------------------------------------------------------------------------------------------

export type PreviewWord = {
  entryId: string;
  number: number;
  direction: "across" | "down";
  row: number;
  col: number;
  answer: string;
  clue: string;
  single: boolean;
};

export type PreviewSuccess = {
  ok: true;
  seed: number;
  ticket: PreviewTicket;
  rows: number;
  cols: number;
  /** The solution: this is the teacher area. */
  words: PreviewWord[];
  stats: PuzzleStats;
  score: PuzzleScore;
  difficulty: number;
  placementHash: string;
  excluded: ExcludedEntry[];
  unplaced: UnplacedEntry[];
  maskedClueIds: string[];
  truncated: boolean;
  readiness: ReadinessResult;
  /** Entry id -> answer for every entry of the set, so the screen can name words left out (teacher area). */
  entryAnswers: Record<string, string>;
};

export type PreviewFailure = {
  ok: false;
  reason: GenerateFailureReason;
  message: string;
  placedWords: number;
  seed: number;
  excluded: ExcludedEntry[];
  unplaced: UnplacedEntry[];
  readiness: ReadinessResult;
  entryAnswers: Record<string, string>;
};

export type PreviewResult = PreviewSuccess | PreviewFailure;

/**
 * Generates a puzzle from the live entries of a set. Writes nothing but a short-lived preview ticket (hashes only).
 * A puzzle with fewer than 5 placed words (decision C2) is not offered: the failure carries the reasons and no ticket.
 * Without a seed in the input a fresh random one is used, which is what "regenerate" does.
 */
export async function generatePreview(
  actor: ClassroomActor,
  rawInput: unknown,
): Promise<PreviewResult> {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  const input = parse(generateOptionsSchema, rawInput);
  const set = await requireSetForGeneration(actor, input.setId);
  const entries = await loadEntries(set.id);
  if (entries.length === 0) throw new CrosswordError("SET_EMPTY");

  const seed = input.seed ?? randomSeed();
  const result = generateCrossword(entries, buildOptions(input, seed));
  const readiness = computeReadiness(entries);
  const entryAnswers = Object.fromEntries(entries.map((e) => [e.id, e.answer]));

  if (!result.ok) {
    const code = result.reason === "NO_ELIGIBLE_WORDS" ? "NO_ELIGIBLE_WORDS" : "NOT_ENOUGH_WORDS";
    return {
      ok: false,
      reason: result.reason,
      message: new CrosswordError(code, { placed: result.placedWords }).message,
      placedWords: result.placedWords,
      seed: result.seed,
      excluded: result.excluded,
      unplaced: result.unplaced,
      readiness,
      entryAnswers,
    };
  }

  const ticket = await createPreviewTicket({
    actor,
    setId: set.id,
    placementHash: result.placementHash,
  });
  return {
    ok: true,
    seed: result.seed,
    ticket,
    rows: result.puzzle.rows,
    cols: result.puzzle.cols,
    words: result.puzzle.words.map((w) => ({
      entryId: w.entryId,
      number: w.number,
      direction: w.direction,
      row: w.row,
      col: w.col,
      answer: w.answer,
      clue: w.clue,
      single: w.single,
    })),
    stats: result.stats,
    score: result.score,
    difficulty: describeDifficulty(result.stats, settingsForLevel(input.level)),
    placementHash: result.placementHash,
    excluded: result.excluded,
    unplaced: result.unplaced,
    maskedClueIds: result.maskedClueIds,
    truncated: result.truncated,
    readiness,
    entryAnswers,
  };
}

/** Regenerate: the same options with a new server-chosen seed (a seed in the input is ignored). No limit on the count. */
export async function regeneratePreview(
  actor: ClassroomActor,
  rawInput: unknown,
): Promise<PreviewResult> {
  const parsed = parse(generateOptionsSchema, rawInput);
  return generatePreview(actor, { ...parsed, seed: undefined });
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Save a draft
// ---------------------------------------------------------------------------------------------------------------

export type SavedDraft = { puzzleId: string; version: number };

/**
 * Saves the previewed puzzle as a draft (version 1), or replaces the grid of an existing version-1 draft.
 * Nothing is trusted from the browser but the seed and the options: the puzzle is REGENERATED from the set's current
 * live entries with that seed and handed to fn_save_crossword, which recomputes the placement hash from the words,
 * compares it with the ticket's hash and consumes the single-use ticket. A set that changed since the preview gives
 * a different puzzle, a different hash and "SET_CHANGED".
 */
export async function saveDraft(actor: ClassroomActor, rawInput: unknown): Promise<SavedDraft> {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  const input: SaveDraftInput = parse(saveDraftSchema, rawInput);
  const set = await requireSetForGeneration(actor, input.setId);
  const entries = await loadEntries(set.id);

  const options = buildOptions(input, input.seed);
  const result = generateCrossword(entries, options);
  if (!result.ok) throw new CrosswordError("SET_CHANGED");

  const words: Json = result.puzzle.words.map((w) => ({
    number: w.number,
    direction: w.direction,
    row: w.row,
    col: w.col,
    answer: w.answer,
    clue: w.clue,
    entryId: w.entryId,
  }));
  const settings: Json = {
    level: input.level,
    options: {
      gridSize: options.gridSize,
      maxWords: options.maxWords ?? CROSSWORD_MAX_WORDS,
      maxWordLen: options.maxWordLen ?? null,
      scripts: input.scripts ?? null,
      maskClues: input.maskClues ?? true,
      pinnedIds: input.pinnedIds ?? [],
      excludedIds: input.excludedIds ?? [],
    },
    play: settingsForLevel(input.level),
    generatorVersion: GENERATOR_VERSION,
  };
  const stats: Json = {
    ...result.stats,
    quality: result.score.quality,
    placedRatio: result.score.placedRatio,
  };

  const data = unwrap<{ puzzleId: string; version: number }>(
    await createSupabaseAdminClient().rpc("fn_save_crossword", {
      p_ticket_id: input.ticketId,
      p_actor_id: actor.id,
      p_school_id: actor.school_id,
      p_token_hash: sha256Hex(input.ticketToken),
      p_set_id: set.id,
      p_title: input.title,
      p_level: input.level,
      p_settings: settings,
      p_stats: stats,
      p_seed: input.seed,
      p_generator_version: GENERATOR_VERSION,
      p_placement_hash: result.placementHash,
      p_rows: result.puzzle.rows,
      p_cols: result.puzzle.cols,
      p_words: words,
      p_max_words: CROSSWORD_MAX_WORDS,
      p_max_singles: CROSSWORD_MAX_SINGLE_WORDS,
      ...(input.puzzleId ? { p_puzzle_id: input.puzzleId } : {}),
    }),
  );
  if (!data?.puzzleId) throw new CrosswordError("PERSIST_FAILED");
  return { puzzleId: data.puzzleId, version: data.version };
}

// ---------------------------------------------------------------------------------------------------------------
// Draft edits, versions, publishing, archiving, assignments. The database functions authorise, check state,
// write the audit row and answer in one transaction; these wrappers validate input and map error codes.
// ---------------------------------------------------------------------------------------------------------------

/** Title and clue wording of a draft. Never words, positions or answers. */
export async function updateDraft(
  actor: ClassroomActor,
  rawInput: unknown,
): Promise<{ puzzleId: string; fields: string[] }> {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  const input: UpdateDraftInput = parse(updateDraftSchema, rawInput);
  const data = unwrap<{ puzzleId: string; fields: string[] }>(
    await createSupabaseAdminClient().rpc("fn_update_crossword_draft", {
      p_puzzle_id: input.puzzleId,
      p_actor_id: actor.id,
      p_school_id: actor.school_id,
      p_title: (input.title ?? null) as unknown as string,
      p_clues: (input.clues ?? null) as unknown as Json,
    }),
  );
  return data;
}

/** New draft copied from a published puzzle (next version of the lineage). The only way to change a published puzzle. */
export async function createVersion(
  actor: ClassroomActor,
  puzzleId: string,
): Promise<{ puzzleId: string; version: number; rootId: string }> {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  if (!isUuid(puzzleId)) throw new CrosswordError("NOT_FOUND");
  return unwrap(
    await createSupabaseAdminClient().rpc("fn_create_crossword_version", {
      p_source_id: puzzleId,
      p_actor_id: actor.id,
      p_school_id: actor.school_id,
    }),
  );
}

export type PublishResult = {
  puzzleId: string;
  version: number;
  classroomIds: string[];
  supersededPuzzleId: string | null;
  /** Classrooms that had the previous version and lost it: the screen pre-selects them. */
  supersededClassroomIds: string[];
};

/** Publishes a draft to classrooms: needs 5+ words, a valid grid and live, managed classrooms; supersedes the previous version. */
export async function publishPuzzle(
  actor: ClassroomActor,
  rawInput: unknown,
): Promise<PublishResult> {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  const input: PublishInput = parse(publishSchema, rawInput);
  return unwrap(
    await createSupabaseAdminClient().rpc("fn_publish_crossword", {
      p_puzzle_id: input.puzzleId,
      p_actor_id: actor.id,
      p_school_id: actor.school_id,
      p_classroom_ids: input.classroomIds,
      p_opens_at: (input.opensAt ?? null) as unknown as string,
      p_closes_at: (input.closesAt ?? null) as unknown as string,
    }),
  );
}

/** Assigns an already published puzzle to further classrooms. The puzzle itself stays frozen. */
export async function addAssignments(
  actor: ClassroomActor,
  rawInput: unknown,
): Promise<{ puzzleId: string; classroomIds: string[] }> {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  const input: PublishInput = parse(publishSchema, rawInput);
  return unwrap(
    await createSupabaseAdminClient().rpc("fn_add_crossword_assignments", {
      p_puzzle_id: input.puzzleId,
      p_actor_id: actor.id,
      p_school_id: actor.school_id,
      p_classroom_ids: input.classroomIds,
      p_opens_at: (input.opensAt ?? null) as unknown as string,
      p_closes_at: (input.closesAt ?? null) as unknown as string,
    }),
  );
}

async function setArchived(actor: ClassroomActor, puzzleId: string, archive: boolean) {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  if (!isUuid(puzzleId)) throw new CrosswordError("NOT_FOUND");
  return unwrap<{ puzzleId: string; archived: boolean; closedAssignments: number }>(
    await createSupabaseAdminClient().rpc("fn_set_crossword_archived", {
      p_puzzle_id: puzzleId,
      p_actor_id: actor.id,
      p_school_id: actor.school_id,
      p_archive: archive,
    }),
  );
}

/** Archives a draft or a published puzzle (open assignments are closed; attempts, later, are kept). */
export const archivePuzzle = (actor: ClassroomActor, puzzleId: string) =>
  setArchived(actor, puzzleId, true);

/** Restores a puzzle that was never published to draft. A published puzzle needs a new version instead. */
export const unarchivePuzzle = (actor: ClassroomActor, puzzleId: string) =>
  setArchived(actor, puzzleId, false);

export async function closeAssignment(
  actor: ClassroomActor,
  assignmentId: string,
): Promise<{ assignmentId: string; status: string }> {
  if (!isTeacherArea(actor.role)) throw new CrosswordError("FORBIDDEN");
  if (!isUuid(assignmentId)) throw new CrosswordError("NOT_FOUND");
  return unwrap(
    await createSupabaseAdminClient().rpc("fn_close_crossword_assignment", {
      p_assignment_id: assignmentId,
      p_actor_id: actor.id,
      p_school_id: actor.school_id,
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Reads for the teacher area (no UI yet): list and detail, access-checked
// ---------------------------------------------------------------------------------------------------------------

export type CrosswordListView = "draft" | "published" | "archived";

export type CrosswordListItem = {
  id: string;
  title: string;
  level: CrosswordRecord["level"];
  status: CrosswordRecord["status"];
  rootId: string;
  version: number;
  setId: string | null;
  wordCount: number;
  openAssignments: number;
  hasLiveSuccessor: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

/** Puzzles the actor manages (same rule as the RLS policies), newest first, filtered by status. */
export async function listPuzzles(
  actor: ClassroomActor,
  view: CrosswordListView,
): Promise<CrosswordListItem[]> {
  if (!isTeacherArea(actor.role)) return [];
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("v_crossword_puzzles_summary")
    .select(
      "puzzle_id, owner_id, set_id, title, level, status, root_id, version, word_count, open_assignments, has_live_successor, published_at, updated_at",
    )
    .eq("school_id", actor.school_id)
    .eq("status", view)
    .order("updated_at", { ascending: false });

  if (actor.role !== "admin") {
    const mine = await actorClassroomIds(actor);
    const ids = [...mine];
    const visible = new Set<string>();
    const [{ data: owned }, { data: assigned }, { data: sets }] = await Promise.all([
      admin
        .from("crossword_puzzles")
        .select("id")
        .eq("school_id", actor.school_id)
        .eq("owner_id", actor.id),
      ids.length
        ? admin.from("crossword_assignments").select("puzzle_id").in("classroom_id", ids)
        : Promise.resolve({ data: [] as { puzzle_id: string }[] }),
      ids.length
        ? admin.from("content_sets").select("id").in("classroom_id", ids)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);
    for (const r of owned ?? []) visible.add(r.id);
    for (const r of assigned ?? []) visible.add(r.puzzle_id);
    const setIds = (sets ?? []).map((s) => s.id);
    if (setIds.length) {
      const { data: viaSet } = await admin
        .from("crossword_puzzles")
        .select("id")
        .eq("school_id", actor.school_id)
        .in("set_id", setIds);
      for (const r of viaSet ?? []) visible.add(r.id);
    }
    if (visible.size === 0) return [];
    query = query.in("puzzle_id", [...visible]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.puzzle_id as string,
    title: r.title as string,
    level: r.level as CrosswordRecord["level"],
    status: r.status as CrosswordRecord["status"],
    rootId: r.root_id as string,
    version: r.version as number,
    setId: r.set_id as string | null,
    wordCount: (r.word_count as number | null) ?? 0,
    openAssignments: (r.open_assignments as number | null) ?? 0,
    hasLiveSuccessor: r.has_live_successor === true,
    publishedAt: r.published_at as string | null,
    updatedAt: r.updated_at as string,
  }));
}

export type CrosswordDetail = {
  puzzle: CrosswordRecord;
  /** Generation numbers kept with the puzzle (words, crossings, fill ratio, quality, ...). */
  stats: Record<string, unknown>;
  settings: Record<string, unknown>;
  seed: number;
  /** Classrooms that had the version this one was copied from: a new version is usually published to the same ones. */
  previousClassroomIds: string[];
  /** Answers included: this is the teacher area. Students never get this shape. */
  words: PreviewWord[];
  assignments: {
    id: string;
    classroomId: string;
    classroomName: string | null;
    status: "open" | "closed";
    opensAt: string | null;
    closesAt: string | null;
  }[];
  /** Every version of the lineage, oldest first. */
  versions: {
    id: string;
    version: number;
    status: CrosswordRecord["status"];
    supersedesId: string | null;
    publishedAt: string | null;
  }[];
};

/** One puzzle with its words, assignments and lineage; null when it does not exist or the actor does not manage it. */
export async function getPuzzleDetail(
  actor: ClassroomActor,
  puzzleId: string,
): Promise<CrosswordDetail | null> {
  const puzzle = await getCrosswordForActor(actor, puzzleId);
  if (!puzzle) return null;
  const admin = createSupabaseAdminClient();

  const [{ data: words }, { data: assignments }, { data: versions }] = await Promise.all([
    admin
      .from("crossword_words")
      .select("source_entry_id, number, direction, row, col, answer, clue, single")
      .eq("puzzle_id", puzzle.id)
      .order("number")
      .order("direction"),
    admin
      .from("crossword_assignments")
      .select("id, classroom_id, status, opens_at, closes_at")
      .eq("puzzle_id", puzzle.id),
    admin
      .from("crossword_puzzles")
      .select("id, version, status, supersedes_id, published_at")
      .eq("root_id", puzzle.rootId)
      .order("version"),
  ]);
  const roomIds = [...new Set((assignments ?? []).map((a) => a.classroom_id))];
  const { data: rooms } = roomIds.length
    ? await admin.from("classrooms").select("id, name").in("id", roomIds)
    : { data: [] as { id: string; name: string }[] };
  const roomName = new Map((rooms ?? []).map((r) => [r.id, r.name]));

  const { data: extra } = await admin
    .from("crossword_puzzles")
    .select("stats, settings, seed")
    .eq("id", puzzle.id)
    .single();
  let previousClassroomIds: string[] = [];
  if (puzzle.supersedesId) {
    const { data: prev } = await admin
      .from("crossword_assignments")
      .select("classroom_id")
      .eq("puzzle_id", puzzle.supersedesId);
    previousClassroomIds = [...new Set((prev ?? []).map((a) => a.classroom_id))];
  }

  return {
    puzzle,
    stats: (extra?.stats ?? {}) as Record<string, unknown>,
    settings: (extra?.settings ?? {}) as Record<string, unknown>,
    seed: Number(extra?.seed ?? 0),
    previousClassroomIds,
    words: (words ?? []).map((w) => ({
      entryId: w.source_entry_id ?? "",
      number: w.number,
      direction: w.direction,
      row: w.row,
      col: w.col,
      answer: w.answer,
      clue: w.clue,
      single: w.single === true,
    })),
    assignments: (assignments ?? []).map((a) => ({
      id: a.id,
      classroomId: a.classroom_id,
      classroomName: roomName.get(a.classroom_id) ?? null,
      status: a.status,
      opensAt: a.opens_at,
      closesAt: a.closes_at,
    })),
    versions: (versions ?? []).map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      supersedesId: v.supersedes_id,
      publishedAt: v.published_at,
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Reads for the screens: sets to generate from, classrooms to publish to, readiness of a set
// ---------------------------------------------------------------------------------------------------------------

export type GeneratableSet = {
  id: string;
  title: string;
  entryCount: number;
  classroomName: string | null;
};

/** Active sets the actor may generate from (writable, classroom not archived), newest first. */
export async function listGeneratableSets(actor: ClassroomActor): Promise<GeneratableSet[]> {
  if (!isTeacherArea(actor.role)) return [];
  const sets = await listContentSets(actor, "active");
  return sets
    .filter((s) => !s.classroomArchived)
    .map((s) => ({
      id: s.id,
      title: s.title,
      entryCount: s.entryCount,
      classroomName: s.classroomName,
    }));
}

export type AssignableClassroom = { id: string; name: string };

/** Live classrooms the actor owns or co-teaches (admins: the whole school): where a puzzle may be published. */
export async function listAssignableClassrooms(
  actor: ClassroomActor,
): Promise<AssignableClassroom[]> {
  if (!isTeacherArea(actor.role)) return [];
  const rooms = await listClassroomsForActor(actor, { archived: false });
  return rooms.map((r) => ({ id: r.id, name: r.name }));
}

/** Readiness of a set the actor may generate from; null when the set is not visible or not usable. */
export async function getSetReadiness(
  actor: ClassroomActor,
  setId: string,
): Promise<{ title: string; readiness: ReadinessResult } | null> {
  if (!isTeacherArea(actor.role) || !isUuid(setId)) return null;
  const set = await getContentSetForActor(actor, setId);
  if (!set || !canWriteContentSet(set.role) || set.archivedAt !== null || set.classroomArchived)
    return null;
  return { title: set.title, readiness: computeReadiness(await loadEntries(set.id)) };
}
