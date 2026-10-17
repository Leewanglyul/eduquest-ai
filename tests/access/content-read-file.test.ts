import { describe, expect, it, vi } from "vitest";

import { MAX_CONTENT_CSV_BYTES } from "@/features/content/import/content-schemas";
import { ContentImportError } from "@/features/content/import/import-errors";
import { readContentSource } from "@/features/content/import/read-file";
import { sha256Hex } from "@/features/content/import/rows-hash";

const fileOf = (bytes: Uint8Array<ArrayBuffer> | string, name = "words.csv") =>
  new File([typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes], name, { type: "text/csv" });

const form = (fields: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const codeOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return e instanceof ContentImportError ? e.code : `other:${String(e)}`;
  }
  return undefined;
};

describe("M2-1.2 reading the upload", () => {
  it("decodes the uploaded file on the server and hashes the bytes", async () => {
    const csv = "term,definition\n사과,과일\n";
    const source = await readContentSource(form({ file: fileOf(csv) }));
    expect(source.text).toBe(csv);
    expect(source.byteLength).toBe(new TextEncoder().encode(csv).byteLength);
    expect(source.sha256).toBe(sha256Hex(new TextEncoder().encode(csv)));
  });

  it("strips a UTF-8 BOM but hashes the bytes as uploaded", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("term,definition\n사과,과일")]);
    const source = await readContentSource(form({ file: fileOf(bytes) }));
    expect(source.text.startsWith("term")).toBe(true);
    expect(source.sha256).toBe(sha256Hex(bytes));
  });

  it("refuses CP949 bytes and UTF-16 instead of reading replacement characters", async () => {
    const cp949 = new Uint8Array([...new TextEncoder().encode("term,definition\n"), 0xbb, 0xe7, 0xb0, 0xfa, 0x2c, 0x61]);
    expect(await codeOf(() => readContentSource(form({ file: fileOf(cp949) })))).toBe("ENCODING_INVALID");
    expect(await codeOf(() => readContentSource(form({ file: fileOf(new Uint8Array([0xff, 0xfe, 0x74, 0x00])) })))).toBe("ENCODING_UTF16");
  });

  it("checks the size before the file is read", async () => {
    const big = fileOf(new Uint8Array(MAX_CONTENT_CSV_BYTES + 1));
    const read = vi.fn();
    Object.defineProperty(big, "arrayBuffer", { value: read });
    expect(await codeOf(() => readContentSource(form({ file: big })))).toBe("FILE_TOO_LARGE");
    expect(read).not.toHaveBeenCalled();
  });

  it("accepts exactly the byte cap and refuses an empty file", async () => {
    const head = "term,definition\n사과,";
    const pad = MAX_CONTENT_CSV_BYTES - new TextEncoder().encode(head).byteLength;
    const exact = await readContentSource(form({ file: fileOf(head + "x".repeat(pad)) }));
    expect(exact.byteLength).toBe(MAX_CONTENT_CSV_BYTES);
    expect(await codeOf(() => readContentSource(form({ file: fileOf("") })))).toBe("EMPTY_FILE");
  });

  it("falls back to pasted text and reports a missing upload", async () => {
    const pasted = await readContentSource(form({ csv: "term,definition\n사과,과일" }));
    expect(pasted.text).toContain("사과");
    expect(await codeOf(() => readContentSource(form({})))).toBe("FILE_MISSING");
    expect(await codeOf(() => readContentSource(form({ csv: "" })))).toBe("FILE_MISSING");
  });

  it("prefers the file when both are sent", async () => {
    const source = await readContentSource(form({ file: fileOf("term,definition\n배추,채소"), csv: "term,definition\n사과,과일" }));
    expect(source.text).toContain("배추");
  });
});
