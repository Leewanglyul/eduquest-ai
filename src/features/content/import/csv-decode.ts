import { ContentImportError } from "./import-errors";
import { MAX_CONTENT_CSV_BYTES } from "./content-schemas";

/** Throws FILE_TOO_LARGE / EMPTY_FILE for a byte length. Call with `file.size` before reading the file. */
export function assertCsvByteLength(byteLength: number): void {
  if (byteLength <= 0) throw new ContentImportError("EMPTY_FILE");
  if (byteLength > MAX_CONTENT_CSV_BYTES) throw new ContentImportError("FILE_TOO_LARGE");
}

/**
 * Decodes uploaded bytes as strict UTF-8 (a leading BOM is removed). Anything else is refused with a
 * message that tells the teacher how to save the file again; the encoding is never guessed, because a
 * wrong guess would store corrupt Korean. Excel's Korean "CSV (쉼표로 분리)" is CP949 and lands here.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  assertCsvByteLength(bytes.byteLength);

  const b0 = bytes[0];
  const b1 = bytes[1];
  if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0xfe && b1 === 0xff)) {
    throw new ContentImportError("ENCODING_UTF16");
  }

  let text: string;
  try {
    // ignoreBOM: false => the decoder strips a leading EF BB BF.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new ContentImportError("ENCODING_INVALID");
  }
  if (text.includes("�")) throw new ContentImportError("ENCODING_INVALID");
  return text;
}

/** Pasted-text fallback: the same size rule on UTF-8 bytes, and a stray leading BOM is dropped. */
export function normalizeCsvText(input: string): string {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  assertCsvByteLength(new TextEncoder().encode(text).byteLength);
  if (text.includes("�")) throw new ContentImportError("ENCODING_INVALID");
  return text;
}
