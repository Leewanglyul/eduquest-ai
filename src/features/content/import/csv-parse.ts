import { MAX_CONTENT_CSV_BYTES, MAX_CONTENT_ROWS, type RawContentRow } from "./content-schemas";
import { tokenizeCsv } from "./csv-records";
import { ContentImportError, extraColumnsNotice } from "./import-errors";

const HEADER_ALIASES = {
  term: ["term", "용어", "단어", "정답"],
  definition: ["definition", "뜻", "설명", "정의", "힌트"],
} as const;

export type ParsedContentCsv = {
  rows: RawContentRow[];
  /** File-level notices that do not block the import (for example ignored extra columns). */
  notices: string[];
};

const normalizeHeader = (h: string) => h.normalize("NFC").trim().toLowerCase();

/**
 * Parses CSV text with a required header row into raw rows (line = spreadsheet row number, header = 1).
 * Enforces the byte cap and the row cap (the same constants run again at commit, because commit re-parses).
 */
export function parseContentCsv(text: string): ParsedContentCsv {
  if (new TextEncoder().encode(text).byteLength > MAX_CONTENT_CSV_BYTES) {
    throw new ContentImportError("FILE_TOO_LARGE");
  }

  const records = tokenizeCsv(text);
  const filled = records.filter((r) => !r.blank);
  if (filled.length === 0) throw new ContentImportError("EMPTY_FILE");

  const [headerRecord, ...body] = filled;
  const header = headerRecord.cells.map(normalizeHeader);

  // A header that is one column containing ; or a tab is a file saved with another delimiter.
  if (header.length === 1 && /[;\t]/.test(headerRecord.cells[0])) {
    throw new ContentImportError("DELIMITER_UNSUPPORTED");
  }

  const named = header.filter((h) => h !== "");
  if (new Set(named).size !== named.length) throw new ContentImportError("DUPLICATE_HEADER");

  const indexOf = (aliases: readonly string[]) => {
    const hits = header.flatMap((h, i) => (aliases.includes(h) ? [i] : []));
    if (hits.length > 1) throw new ContentImportError("DUPLICATE_HEADER");
    return hits.length === 1 ? hits[0] : -1;
  };
  const termIdx = indexOf(HEADER_ALIASES.term);
  const definitionIdx = indexOf(HEADER_ALIASES.definition);
  if (termIdx < 0 || definitionIdx < 0) throw new ContentImportError("MISSING_HEADER");

  if (body.length === 0) throw new ContentImportError("NO_DATA_ROWS");
  if (body.length > MAX_CONTENT_ROWS) {
    throw new ContentImportError("TOO_MANY_ROWS", { count: body.length });
  }

  const needed = Math.max(termIdx, definitionIdx) + 1;
  const rows: RawContentRow[] = body.map((record) => ({
    line: record.line,
    term: record.cells[termIdx] ?? "",
    definition: record.cells[definitionIdx] ?? "",
    ...(record.cells.length < needed ? { tooFewColumns: true } : {}),
  }));

  const notices: string[] = [];
  const extra = header.length - 2;
  if (extra > 0) notices.push(extraColumnsNotice(extra));

  return { rows, notices };
}
