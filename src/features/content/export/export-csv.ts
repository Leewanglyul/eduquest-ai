import { escapeCsvCell } from "@/features/accounts/batch/credential-export";

export type ExportEntry = { term: string; definition: string };

/**
 * The set as a CSV that the importer reads back unchanged: header `term,definition`, UTF-8 with a BOM (so Excel
 * shows Korean correctly), CRLF line ends, one row per live entry in set order. Every cell goes through
 * escapeCsvCell: quotes and commas are quoted, and a cell starting with = + - @ gets a leading apostrophe so a
 * spreadsheet never runs it as a formula; the importer removes that apostrophe again (stripFormulaGuard).
 */
export function buildContentExportCsv(entries: ExportEntry[]): string {
  const lines = ["term,definition", ...entries.map((e) => [e.term, e.definition].map(escapeCsvCell).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const FORBIDDEN_IN_NAME = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** `<set title>-<yyyymmdd>.csv`, safe on Windows and in a header. */
export function exportFileName(title: string, date: Date = new Date()): string {
  const day = date.toISOString().slice(0, 10).replaceAll("-", "");
  const base = title.replace(FORBIDDEN_IN_NAME, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 80);
  return `${base || "word-set"}-${day}.csv`;
}

/** Content-Disposition with an ASCII fallback and the UTF-8 name (RFC 6266 / 5987), so Korean titles survive. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
