import crypto from "node:crypto";

import { NORMALIZER_VERSION, type ContentImportMode, type PreparedContentRow } from "./content-schemas";

export function sha256Hex(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export type RowsHashInput = {
  mode: ContentImportMode;
  /** Target set for append/replace; null for create. */
  setId: string | null;
  /** Normalised title for create; null otherwise. */
  newSetTitle: string | null;
  classroomId: string | null;
  rows: Pick<PreparedContentRow, "term" | "definition">[];
};

const US = "\x1f"; // unit separator: between fields
const RS = "\x1e"; // record separator: between rows
const GS = "\x1d"; // group separator: between header and rows

/**
 * Canonical text that is hashed. Postgres builds the SAME text in public.fn_content_rows_hash
 * (migration 20261017000004) and a test compares the two against the real database:
 *
 *   header = normalizerVersion US mode US setId US newTitle US classroomId   (missing values are empty)
 *   body   = term US definition, joined by RS, in row order
 *   text   = header GS body
 *
 * No term or definition can contain these control characters: the normaliser removes them.
 */
export function canonicalRowsText(input: RowsHashInput): string {
  const header = [String(NORMALIZER_VERSION), input.mode, input.setId ?? "", input.newSetTitle ?? "", input.classroomId ?? ""].join(US);
  const body = input.rows.map((r) => `${r.term}${US}${r.definition}`).join(RS);
  return `${header}${GS}${body}`;
}

/**
 * Binds a commit token to what was previewed: mode, target, title, classroom, normaliser version and the
 * prepared rows. Same idea as hashRows() in accounts/batch/batch-service.ts. The commit function recomputes
 * the hash from the rows it inserts, so a caller cannot present one set of rows with the hash of another.
 */
export function hashContentRows(input: RowsHashInput): string {
  return sha256Hex(canonicalRowsText(input));
}
