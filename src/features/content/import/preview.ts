import {
  MAX_SET_ENTRIES,
  NORMALIZER_VERSION,
  type ContentImportMode,
  type ContentPreviewIssue,
  type ContentRowError,
  type PreparedContentRow,
  type RawContentRow,
} from "./content-schemas";
import { ContentImportError, rowIssueMessage } from "./import-errors";
import { evaluateRow } from "./row-rules";

export type ContentPreviewOptions = {
  mode: ContentImportMode;
  /** `append` only: answers of the set's live entries, for DUP_EXISTING. */
  existingAnswers?: ReadonlySet<string>;
  /** `append` only: number of live entries in the set (the size check starts from it). */
  liveCount?: number;
  maxSetEntries?: number;
};

export type ContentPreview = {
  valid: PreparedContentRow[];
  invalid: ContentPreviewIssue[];
  counts: { total: number; accepted: number; withWarnings: number; rejected: number };
  /** Size of the set after the import would run. `exceeds` means SET_TOO_LARGE. */
  setSize: { current: number; add: number; max: number; exceeds: boolean };
};

const issueOf = (line: number, term: string, errors: ContentRowError[]): ContentPreviewIssue => ({
  line,
  term,
  errors: errors.map((e) => e.code),
  messages: errors.map((e) => rowIssueMessage(e.code, e.context)),
});

/**
 * Validates rows and flags duplicates: inside the file (first occurrence wins) and, for `append`,
 * against the set's live answers. Rejected rows are listed; valid rows keep file order.
 */
export function buildContentPreview(raw: RawContentRow[], options: ContentPreviewOptions): ContentPreview {
  const valid: PreparedContentRow[] = [];
  const invalid: ContentPreviewIssue[] = [];
  const seen = new Map<string, { line: number; definition: string }>();

  for (const r of raw) {
    const evaluated = evaluateRow(r);
    if (!evaluated.ok) {
      invalid.push(issueOf(evaluated.line, evaluated.term, evaluated.errors));
      continue;
    }
    const row = evaluated.row;

    const first = seen.get(row.answer);
    if (first) {
      invalid.push(
        issueOf(row.line, row.term, [
          {
            code: first.definition === row.definition ? "DUP_IN_FILE" : "DUP_IN_FILE_CONFLICT",
            context: { firstLine: first.line },
          },
        ]),
      );
      continue;
    }

    if (options.mode === "append" && options.existingAnswers?.has(row.answer)) {
      invalid.push(issueOf(row.line, row.term, [{ code: "DUP_EXISTING" }]));
      continue;
    }

    seen.set(row.answer, { line: row.line, definition: row.definition });
    valid.push(row);
  }

  const max = options.maxSetEntries ?? MAX_SET_ENTRIES;
  const current = options.mode === "append" ? (options.liveCount ?? 0) : 0;

  return {
    valid,
    invalid,
    counts: {
      total: raw.length,
      accepted: valid.length,
      withWarnings: valid.filter((v) => v.warnings.length > 0).length,
      rejected: invalid.length,
    },
    setSize: { current, add: valid.length, max, exceeds: current + valid.length > max },
  };
}

/** Throws SET_TOO_LARGE or NO_VALID_ROWS; call after `buildContentPreview` at preview and at commit. */
export function assertPreviewCommittable(preview: ContentPreview): void {
  if (preview.valid.length === 0) throw new ContentImportError("NO_VALID_ROWS");
  if (preview.setSize.exceeds) {
    throw new ContentImportError("SET_TOO_LARGE", {
      current: preview.setSize.current,
      add: preview.setSize.add,
    });
  }
}

/** The jsonb array handed to fn_commit_content_import (keys match what the function reads). */
export function toCommitRows(rows: PreparedContentRow[]) {
  return rows.map((r) => ({
    term: r.term,
    definition: r.definition,
    answer: r.answer,
    script: r.script,
    normalizerVersion: NORMALIZER_VERSION,
    line: r.line,
  }));
}
