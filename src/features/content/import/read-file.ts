import { assertCsvByteLength, decodeCsvBytes, normalizeCsvText } from "./csv-decode";
import { ContentImportError } from "./import-errors";
import { sha256Hex } from "./rows-hash";

export type ContentSource = {
  text: string;
  /** Size of what was uploaded, in bytes. */
  byteLength: number;
  /** sha256 hex of the uploaded bytes: stored on the batch for "already uploaded" detection; the file is not kept. */
  sha256: string;
};

/**
 * Reads the upload from a form. The browser posts the File itself (not `file.text()`), so that only the
 * server decodes it and a CP949 / UTF-16 file is refused instead of being turned into replacement characters.
 * `file.size` is checked before the file is read. A pasted `csv` text field is accepted as a fallback.
 */
export async function readContentSource(formData: FormData): Promise<ContentSource> {
  const file = formData.get("file");
  if (file instanceof File) {
    assertCsvByteLength(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    assertCsvByteLength(bytes.byteLength);
    return { text: decodeCsvBytes(bytes), byteLength: bytes.byteLength, sha256: sha256Hex(bytes) };
  }

  const pasted = formData.get("csv");
  if (typeof pasted === "string" && pasted !== "") {
    const text = normalizeCsvText(pasted);
    const bytes = new TextEncoder().encode(text);
    return { text, byteLength: bytes.byteLength, sha256: sha256Hex(bytes) };
  }

  throw new ContentImportError("FILE_MISSING");
}
