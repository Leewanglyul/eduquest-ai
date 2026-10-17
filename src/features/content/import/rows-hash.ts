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

/**
 * Binds a commit token to what was previewed: mode, target, classroom, normaliser version and the
 * prepared rows. Same idea as hashRows() in accounts/batch/batch-service.ts, which includes the
 * classroom so a token cannot be replayed elsewhere. The version is included so a deploy that changes
 * the normaliser between preview and commit fails closed with ROWS_CHANGED.
 */
export function hashContentRows(input: RowsHashInput): string {
  return sha256Hex(
    JSON.stringify([
      NORMALIZER_VERSION,
      input.mode,
      input.setId,
      input.newSetTitle,
      input.classroomId,
      input.rows.map((r) => [r.term, r.definition]),
    ]),
  );
}
