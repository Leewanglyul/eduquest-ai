import { z } from "zod";

/**
 * Limits for the CSV content pipeline. Single source of truth for the parser, the zod run schema, the
 * preview builder, the database function parameters and the UI text (passed to components as props).
 * See docs/m2/01-csv-content-pipeline.md §4.7.
 *
 * Answer bounds are deliberately tighter than the database CHECKs (1..30) so a policy change is a
 * constant edit, not a migration.
 */
export const MAX_CONTENT_ROWS = 100;
export const MAX_CONTENT_CSV_BYTES = 128 * 1024;
export const MAX_SET_ENTRIES = 200;
export const TERM_MAX_CHARS = 60;
export const DEFINITION_MAX_CHARS = 200;
export const ANSWER_MIN_LEN = 1;
export const ANSWER_MAX_LEN = 15;
export const SET_TITLE_MAX_CHARS = 80;

/** Preview tickets (docs/m2/01 §3.4): lifetime, live previews per teacher, and the grace before stale ones are deleted. */
export const COMMIT_TOKEN_TTL_MINUTES = 15;
export const MAX_ACTIVE_PREVIEWS = 10;
export const PREVIEW_CLEANUP_GRACE_HOURS = 24;

/** Bump when the normalisation rules change; it is part of the rows hash and stored per entry. */
export const NORMALIZER_VERSION = 1;

/** Hard database bounds (content_entries CHECKs). The TypeScript bounds above must stay inside them. */
export const DB_ANSWER_MIN_LEN = 1;
export const DB_ANSWER_MAX_LEN = 30;

export const CONTENT_IMPORT_MODES = ["create", "append", "replace"] as const;
export type ContentImportMode = (typeof CONTENT_IMPORT_MODES)[number];

export const CONTENT_SCRIPTS = ["hangul", "latin", "digit", "mixed"] as const;
export type ContentScript = (typeof CONTENT_SCRIPTS)[number];

/** Characters a grid answer may contain after normalisation. Mirrors chk_content_entries_answer_grid_safe. */
export const ANSWER_GRID_SAFE_PATTERN = /^[가-힣A-Z0-9]+$/;

export type ContentRowErrorCode =
  | "ROW_TOO_FEW_COLUMNS"
  | "TERM_EMPTY"
  | "TERM_TOO_LONG"
  | "DEFINITION_EMPTY"
  | "DEFINITION_TOO_LONG"
  | "ANSWER_TOO_SHORT"
  | "ANSWER_TOO_LONG"
  | "ANSWER_INVALID_CHAR"
  | "ANSWER_JAMO"
  | "ANSWER_NUMERIC_LIKE"
  | "DUP_IN_FILE"
  | "DUP_IN_FILE_CONFLICT"
  | "DUP_EXISTING";

export type ContentRowWarningCode =
  | "ANSWER_MIXED_SCRIPT"
  | "DEFINITION_CONTAINS_ANSWER"
  | "FORMULA_PREFIX"
  | "CONTROL_CHARS_REMOVED"
  | "WHITESPACE_NORMALISED";

/** One cell pair as parsed from the file. `line` is the spreadsheet row number (header = 1). */
export type RawContentRow = {
  line: number;
  term: string;
  definition: string;
  /** The record had fewer cells than the header needs. */
  tooFewColumns?: boolean;
};

/** A row that passed every rule: this is what is hashed, previewed and stored. */
export type PreparedContentRow = {
  line: number;
  term: string;
  definition: string;
  answer: string;
  answerLength: number;
  script: ContentScript;
  warnings: ContentRowWarningCode[];
};

export type RowIssueContext = {
  /** ANSWER_INVALID_CHAR: offending characters (at most 5). */
  chars?: string[];
  /** ANSWER_TOO_LONG: current length. */
  length?: number;
  /** DUP_*: row number of the first occurrence. */
  firstLine?: number;
};

export type ContentRowError = { code: ContentRowErrorCode; context?: RowIssueContext };

/** A rejected row, for the preview table. */
export type ContentPreviewIssue = {
  line: number;
  term: string;
  errors: ContentRowErrorCode[];
  messages: string[];
};

/** Shape of one row of the content table; backstop for what the commit function receives. */
export const contentRowSchema = z.object({
  term: z.string().min(1).max(TERM_MAX_CHARS),
  definition: z.string().min(1).max(DEFINITION_MAX_CHARS),
  answer: z
    .string()
    .min(ANSWER_MIN_LEN)
    .max(ANSWER_MAX_LEN)
    .regex(ANSWER_GRID_SAFE_PATTERN),
  script: z.enum(CONTENT_SCRIPTS),
});

export type ContentRow = z.infer<typeof contentRowSchema>;

export const contentRunInputSchema = z.object({
  rows: z.array(contentRowSchema).min(1).max(MAX_CONTENT_ROWS),
});
