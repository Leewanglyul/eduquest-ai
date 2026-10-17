/** Limits of the teacher review backend (docs/m2/05-m2-2-2-teacher-review-plan.md §5.3). One place, passed to the UI as props later. */

/** A preview ticket lives this long (same as the CSV import commit token). */
export const PREVIEW_TICKET_TTL_MINUTES = 15;
/** At most this many live tickets per teacher: generating again expires the oldest. */
export const MAX_LIVE_PREVIEW_TICKETS = 10;
/** Unused or used tickets older than this are deleted by fn_cleanup_crossword_tickets on every generate. */
export const PREVIEW_TICKET_CLEANUP_GRACE_HOURS = 24;

export const CROSSWORD_TITLE_MAX_CHARS = 80;
export const CROSSWORD_CLUE_MAX_CHARS = 200;
