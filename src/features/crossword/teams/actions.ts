"use server";

import { z } from "zod";
import { IdentityError } from "@/features/identity/errors";
import { requireTeacherArea } from "@/lib/rbac/guards";
import { isCollabPlayEnabled } from "@/lib/flags";
import { CrosswordError, type CrosswordErrorCode } from "../messages";
import { resolveTeamHelp } from "../results/team-help-resolution";
import { assignStudent, createTeam, deleteTeam, getLiveView, setPlayMode, unassignStudent } from "../results/team-service";
import type { LiveView } from "./types";

/**
 * Server actions of the teacher team screens (M2-3.4 TP-0). The teacher guard runs first; the input is validated
 * strictly; the database functions authorise again and decide every rule (owner and co-teacher write, school admin
 * reads only). With team play switched off every action answers NOT_FOUND.
 */
export type TeamActionState<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; code?: CrosswordErrorCode };

const id = z.string().uuid();
const schemas = {
  mode: z.object({ assignmentId: id, mode: z.enum(["individual", "team"]) }).strict(),
  create: z.object({ assignmentId: id, label: z.string().trim().min(1).max(20) }).strict(),
  team: z.object({ teamId: id }).strict(),
  member: z.object({ teamId: id, studentId: id }).strict(),
  help: z.object({ assignmentId: id, teamId: id }).strict(),
  live: z.object({ puzzleId: id, assignmentId: id }).strict(),
};

const payloadOf = (formData: FormData): unknown => {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

async function run<S extends z.ZodTypeAny, T>(
  schema: S,
  input: unknown,
  work: (actor: Awaited<ReturnType<typeof requireTeacherArea>>, data: z.infer<S>) => Promise<T>,
): Promise<TeamActionState<T>> {
  try {
    if (!isCollabPlayEnabled()) throw new CrosswordError("NOT_FOUND");
    const actor = await requireTeacherArea();
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new CrosswordError("INVALID_INPUT");
    return { ok: true, data: await work(actor, parsed.data) } as TeamActionState<T>;
  } catch (error) {
    if (error instanceof CrosswordError) return { ok: false, error: error.message, code: error.code };
    if (error instanceof IdentityError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function setPlayModeAction(_prev: unknown, formData: FormData) {
  return run(schemas.mode, payloadOf(formData), async (actor, d) => {
    await setPlayMode(actor, d.assignmentId, d.mode);
    return { mode: d.mode };
  });
}

export async function createTeamAction(_prev: unknown, formData: FormData) {
  return run(schemas.create, payloadOf(formData), async (actor, d) => {
    const r = await createTeam(actor, d.assignmentId, d.label);
    return { label: r.label };
  });
}

export async function deleteTeamAction(_prev: unknown, formData: FormData) {
  return run(schemas.team, payloadOf(formData), async (actor, d) => {
    await deleteTeam(actor, d.teamId);
    return { deleted: true };
  });
}

export async function assignStudentAction(_prev: unknown, formData: FormData) {
  return run(schemas.member, payloadOf(formData), (actor, d) => assignStudent(actor, d.teamId, d.studentId));
}

export async function unassignStudentAction(_prev: unknown, formData: FormData) {
  return run(schemas.member, payloadOf(formData), (actor, d) => unassignStudent(actor, d.teamId, d.studentId));
}

/** Marks the team's open call as handled. The answer says only whether something was resolved, never an id. */
export async function resolveTeamHelpAction(_prev: unknown, formData: FormData) {
  return run(schemas.help, payloadOf(formData), (actor, d) => resolveTeamHelp(actor, d.assignmentId, d.teamId));
}

/** The in-class view, for the 10-second refresh of the live screen. */
export async function loadLiveViewAction(input: { puzzleId: string; assignmentId: string }): Promise<TeamActionState<LiveView>> {
  return run(schemas.live, input, (actor, d) => getLiveView(actor, d.puzzleId, d.assignmentId));
}
