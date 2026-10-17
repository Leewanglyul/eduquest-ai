/**
 * Student play constants (docs/m2/08-m2-2-4a-student-play-foundation-plan.md C.1). The server-side limits mirror
 * the SQL functions of migration 20261019000003; tests/access/crossword-play-core.test.ts pins both.
 */

/** The client sends its cell changes this long after the last keystroke (and on blur, hide and pagehide). */
export const PLAY_SAVE_DEBOUNCE_MS = 2000;

/** A save is still accepted this long after closes_at, so an in-flight autosave is not lost. */
export const PLAY_SAVE_GRACE_S = 120;

/** Checks per attempt per minute (stored on the attempt row). */
export const PLAY_CHECKS_PER_MINUTE = 60;

/** After a wrong submit: seconds to wait (always on hard, after the third wrong submit on other levels). */
export const PLAY_SUBMIT_COOLDOWN_S = 30;
export const PLAY_SUBMIT_COOLDOWN_AFTER_WRONG = 3;

/** Cells in one save patch; also keeps the keepalive request small. */
export const PLAY_MAX_PATCH_CELLS = 225;

/** Active time the server accepts per save. */
export const PLAY_ACTIVE_MS_MAX_PER_SAVE = 30_000;

/** An event names at most this many words (a cell lies on at most two). */
export const PLAY_MAX_EVENT_WORDS = 2;

/** Default allowances (PM SP-1/SP-2, 2026-10-18). null = unlimited. The stored puzzle settings win. */
export const PLAY_DEFAULT_ALLOWANCES = {
  easy: { reveals: 3, checks: null },
  normal: { reveals: 2, checks: 5 },
  hard: { reveals: 1, checks: 3 },
} as const;
