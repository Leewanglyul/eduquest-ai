/**
 * Team play on one shared grid (M2-3.4 P3): how a polled team state is merged with what this browser holds. Pure: no
 * DOM, no React, no server module, so the board and the tests share it.
 *
 * Rules (P3 readiness section 4):
 *  K-1  the screen shows the server's cells overlaid by this student's unconfirmed cells (typed, not yet saved);
 *  K-2  the cells of the word being composed by the IME are never replaced while composing;
 *  K-3  the server keeps the last save of a cell; the next poll shows it to everyone;
 *  K-4  a cell this student wrote that now belongs to a teammate is reported once, without saying who;
 *  K-5  an unconfirmed cell that has become given (a teammate revealed it) is dropped from what this student will send.
 */
import type { CellKey, PlayLimits } from "./types";

export type Unconfirmed = ReadonlyMap<CellKey, string | null>;

/** K-1, K-2, K-5: what the board shows after a poll. Given cells are never kept in the typed map. */
export function mergeTeamCells(input: {
  server: Readonly<Record<CellKey, string>>;
  given: Readonly<Record<CellKey, string>>;
  unconfirmed: Unconfirmed;
  /** Cells the IME is composing in (the selected word while a syllable is open); empty when not composing. */
  composing: readonly CellKey[];
  /** What the board shows now. */
  current: Readonly<Record<CellKey, string>>;
}): Record<CellKey, string> {
  const next: Record<CellKey, string> = { ...input.server };
  for (const [k, v] of input.unconfirmed) {
    if (input.given[k] !== undefined) continue;
    if (v === null) delete next[k];
    else next[k] = v;
  }
  for (const k of input.composing) {
    if (input.given[k] !== undefined) continue;
    if (input.current[k] !== undefined) next[k] = input.current[k];
    else delete next[k];
  }
  for (const k of Object.keys(next)) if (input.given[k] !== undefined) delete next[k];
  return next;
}

/** K-5: unconfirmed cells that are now given; the board discards them from the save queue. */
export function lockedPendingKeys(unconfirmed: Unconfirmed, given: Readonly<Record<CellKey, string>>): CellKey[] {
  return [...unconfirmed.keys()].filter((k) => given[k] !== undefined);
}

export type TeamSnapshot = { cells: Readonly<Record<CellKey, string>>; otherKeys: readonly CellKey[] };

/**
 * K-4: cells this student had written (in the previous snapshot and not someone else's) that a teammate has since
 * written with a different letter. Nothing is reported on the first snapshot, and nothing for cells this student is
 * changing right now.
 */
export function teammateChanges(prev: TeamSnapshot | null, next: TeamSnapshot, unconfirmed: Unconfirmed): CellKey[] {
  if (!prev) return [];
  const prevOther = new Set(prev.otherKeys);
  const nextOther = new Set(next.otherKeys);
  return Object.keys(prev.cells).filter(
    (k) => !prevOther.has(k) && nextOther.has(k) && next.cells[k] !== prev.cells[k] && !unconfirmed.has(k),
  );
}

/** D-6: the tool counters of a team come from the team's shared totals. */
export function teamLimits(limits: PlayLimits, used: { checks: number; reveals: number }): PlayLimits {
  return {
    ...limits,
    checksRemaining: limits.checksAllowed === null ? null : Math.max(0, limits.checksAllowed - used.checks),
    revealsRemaining: Math.max(0, limits.revealsAllowed - used.reveals),
  };
}
