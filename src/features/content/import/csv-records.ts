import { ContentImportError } from "./import-errors";

export type CsvRecord = {
  /** Spreadsheet row number: the first record is 1, blank records are counted. */
  line: number;
  cells: string[];
  /** Every cell is empty or whitespace. */
  blank: boolean;
};

/**
 * Minimal RFC 4180 tokenizer: quoted fields, escaped quotes, CRLF/LF/CR, line breaks inside quotes.
 * Same algorithm as the M1 `parseCsv` (accounts/batch/csv-parse.ts), except that blank records are
 * returned (flagged) instead of dropped, so row numbers match what the teacher sees in a spreadsheet.
 * A leading BOM is removed.
 */
export function tokenizeCsv(input: string): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let touched = false; // the current record has any character at all
  let closedQuote = false; // a quoted field just ended: only a delimiter or a line end may follow

  const endRecord = () => {
    row.push(field);
    records.push({ line: records.length + 1, cells: row, blank: row.every((c) => c.trim() === "") });
    row = [];
    field = "";
    touched = false;
    closedQuote = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        field += ch;
      }
    } else if (closedQuote && ch !== "," && ch !== "\n" && ch !== "\r") {
      // `"abc"def` would otherwise be read as the single value abcdef: refuse instead of merging silently.
      throw new ContentImportError("CSV_QUOTE_MISPLACED");
    } else if (ch === '"' && field === "") {
      inQuotes = true;
      touched = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      touched = true;
      closedQuote = false;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
    } else {
      field += ch;
      touched = true;
    }
  }

  if (inQuotes) throw new ContentImportError("CSV_MALFORMED");
  if (touched || field !== "" || row.length > 0) endRecord();

  return records;
}
