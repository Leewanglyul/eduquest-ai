/**
 * The team-mode decisions of the play board, as plain functions so they are tested without a browser (P3, I-4, I-6).
 * The board owns the state and the side effects; these functions only decide.
 */
import { lockedPendingKeys, mergeTeamCells, teammateChanges, type TeamSnapshot } from "@/features/crossword/play/team";
import type { CellKey, TeamState } from "@/features/crossword/play/types";
import type { ApiResult } from "./play-api";
import type { ApplyResult } from "./team-poller";

export type PollInput = {
  state: TeamState;
  /**
   * Highest revision this browser's own saves have had acknowledged (the save queue's confirmed revision). A poll
   * answer below it was read before that save landed: applying it would roll the student's cells back and could raise a
   * false teammate notice, so it is ignored (R2 C). The poller's request revision is not touched by this.
   */
  acknowledged: number;
  /** The save queue's unconfirmed cells before this poll is applied. */
  unconfirmed: ReadonlyMap<CellKey, string | null>;
  /** Cells of the selected word while the IME is composing; empty otherwise. */
  composing: readonly CellKey[];
  current: Readonly<Record<CellKey, string>>;
  previous: TeamSnapshot | null;
};

export type PollDecision = {
  revision: number;
  helpOpen: boolean;
  used: TeamState["used"];
  /** Present only when the server sent a changed grid. */
  grid?: {
    cells: Record<CellKey, string>;
    given: Record<CellKey, string>;
    /** Unconfirmed cells that became given: drop them from the save queue (K-5). */
    discard: CellKey[];
    snapshot: TeamSnapshot;
    /** Cells whose letter changed on screen: their check marks are cleared. */
    changedKeys: CellKey[];
    /** Show the neutral "다른 팀원이 수정했어요" (K-4): never who, never how many. */
    teammateChanged: boolean;
    /**
     * Gate 3 C-4: cells of the word being composed that the board kept although the server holds something else (K-2)
     * and that are not this student's unsaved input. The answer is then only partly applied: the poller must not treat
     * this revision as known, and the board resyncs the whole grid as soon as the composition ends.
     */
    held: CellKey[];
    /**
     * Cells shown with this student's unsaved input although the server holds something else. The input is kept on
     * screen (K-1), but the answer is still only partly applied: once that save is acknowledged the server may already
     * hold a teammate's later letter there, so the next poll must bring the whole grid again (Gate 3 C-4).
     */
    overlaid: CellKey[];
  };
  completed: boolean;
  /** The answer is older than this browser's acknowledged saves: nothing of it is applied (no rollback, no notice). */
  ignored: boolean;
};

export function decidePoll(input: PollInput): PollDecision {
  const s = input.state;
  const out: PollDecision = { revision: s.revision, helpOpen: s.helpOpen, used: s.used, completed: s.status === "completed", ignored: false };
  if (s.revision < input.acknowledged) return { ...out, ignored: true };
  if (!s.changed || !s.cells || !s.given) return out;
  const given = s.given;
  const server = s.cells;
  const discard = lockedPendingKeys(input.unconfirmed, given);
  const unconfirmed = new Map([...input.unconfirmed].filter(([k]) => !discard.includes(k)));
  const cells = mergeTeamCells({ server: s.cells, given, unconfirmed, composing: input.composing, current: input.current });
  const snapshot: TeamSnapshot = { cells: s.cells, otherKeys: s.otherKeys ?? [] };
  const keys = new Set([...Object.keys(cells), ...Object.keys(input.current)]);
  const changedKeys = [...keys].filter((k) => cells[k] !== input.current[k] || given[k] !== undefined);
  // the screen differs from the server's grid exactly in these cells (given cells are never typed cells)
  const differs = [...new Set([...Object.keys(cells), ...Object.keys(server)])].filter((k) => given[k] === undefined && cells[k] !== server[k]);
  const held = differs.filter((k) => !unconfirmed.has(k) && input.composing.includes(k));
  const overlaid = differs.filter((k) => unconfirmed.has(k));
  return {
    ...out,
    grid: {
      cells,
      given,
      discard,
      snapshot,
      changedKeys,
      teammateChanged: teammateChanges(input.previous, snapshot, unconfirmed).length > 0,
      held,
      overlaid,
    },
  };
}

/**
 * What the poller is told about one answer (Gate 3 C-4). The known revision may only move when the screen shows exactly
 * the server's grid of that revision: "skipped" when nothing was applied, "partial" when any cell is shown differently
 * (held for an open composition, or overlaid by unsaved input), otherwise "applied" (an unchanged answer included).
 */
export function applyResultOf(d: PollDecision): ApplyResult {
  if (d.ignored) return "skipped";
  return d.grid && (d.grid.held.length > 0 || d.grid.overlaid.length > 0) ? "partial" : "applied";
}

/**
 * K-5 recovery for the save queue: FIRST poll the team state, THEN report which cells are given, so a locked key is
 * chosen from the current server state and never from a stale copy (R2 D).
 */
export function makeLockedRecovery(pollNow: () => Promise<void>, readGiven: () => Readonly<Record<CellKey, string>>) {
  return async (): Promise<ReadonlySet<CellKey>> => {
    await pollNow();
    return new Set(Object.keys(readGiven()));
  };
}

/**
 * When "선생님 부르기" may be tried again: always from the server's own retryAfterSeconds (HELP_COOLDOWN). A later
 * refusal replaces the earlier deadline with the server's new number; nothing is invented on the client (R2 H).
 */
export function teacherCallDeadline(now: number, retryAfterSeconds: number | undefined): number | null {
  return retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? now + Math.ceil(retryAfterSeconds) * 1000
    : null;
}

/**
 * K-6, P3-D6: a check in team mode that meets STALE (a teammate saved meanwhile) polls, takes the newer revision and
 * retries exactly once. A second STALE becomes "busy" (the board says "팀원이 입력 중이에요"). Individual mode never
 * retries: the board keeps its reload.
 */
export async function checkWithOneRetry<T>(options: {
  team: boolean;
  check: (baseRevision: number) => Promise<ApiResult<T>>;
  firstRevision: number;
  pollNow: () => Promise<void>;
  /** The revision to retry with (after the poll), or null when the board cannot check now. */
  nextRevision: () => Promise<number | null>;
  stillOpen: () => boolean;
}): Promise<ApiResult<T> | { ok: false; kind: "busy" } | { ok: false; kind: "skipped" }> {
  const first = await options.check(options.firstRevision);
  if (!options.team || first.ok || first.kind !== "rejected" || first.code !== "STALE") return first;
  await options.pollNow();
  if (!options.stillOpen()) return { ok: false, kind: "skipped" };
  const rev = await options.nextRevision();
  if (rev === null) return { ok: false, kind: "skipped" };
  const second = await options.check(rev);
  if (!second.ok && second.kind === "rejected" && second.code === "STALE") return { ok: false, kind: "busy" };
  return second;
}
