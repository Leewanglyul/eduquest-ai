import { describe, expect, it } from "vitest";

import { decodeCsvBytes, normalizeCsvText } from "@/features/content/import/csv-decode";
import { ContentImportError, contentErrorMessage } from "@/features/content/import/import-errors";

const bytes = (...b: number[]) => Uint8Array.from(b);
const utf8 = (s: string) => new TextEncoder().encode(s);

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ContentImportError) return e.code;
    throw e;
  }
  return undefined;
};

describe("M2-1.3 encoding", () => {
  it("decodes UTF-8 with and without a BOM", () => {
    expect(decodeCsvBytes(utf8("term,definition\n사과,과일"))).toBe("term,definition\n사과,과일");
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("term,definition\n사과,과일")]);
    expect(decodeCsvBytes(withBom)).toBe("term,definition\n사과,과일");
  });

  it("accepts ASCII only files", () => {
    expect(decodeCsvBytes(utf8("term,definition\napple,fruit"))).toContain("apple");
  });

  it("refuses CP949 / EUC-KR bytes (Excel's Korean CSV) instead of guessing", () => {
    // "사과" in CP949 is BB E7 B0 FA.
    const cp949 = new Uint8Array([...utf8("term,definition\n"), 0xbb, 0xe7, 0xb0, 0xfa, 0x2c, 0x61]);
    expect(codeOf(() => decodeCsvBytes(cp949))).toBe("ENCODING_INVALID");
  });

  it("refuses UTF-16 in both byte orders", () => {
    expect(codeOf(() => decodeCsvBytes(bytes(0xff, 0xfe, 0x74, 0x00)))).toBe("ENCODING_UTF16");
    expect(codeOf(() => decodeCsvBytes(bytes(0xfe, 0xff, 0x00, 0x74)))).toBe("ENCODING_UTF16");
  });

  it("refuses a file that already contains the replacement character", () => {
    expect(codeOf(() => decodeCsvBytes(utf8("term,definition\n��,x")))).toBe("ENCODING_INVALID");
    expect(codeOf(() => normalizeCsvText("term,definition\n�,x"))).toBe("ENCODING_INVALID");
  });

  it("refuses an empty upload", () => {
    expect(codeOf(() => decodeCsvBytes(new Uint8Array()))).toBe("EMPTY_FILE");
  });

  it("tells the teacher how to save the file again", () => {
    expect(contentErrorMessage("ENCODING_INVALID")).toBe(
      "파일 인코딩을 읽을 수 없습니다. 엑셀에서 ‘CSV UTF-8(쉼표로 분리)’ 형식으로 다시 저장해 주세요.",
    );
    expect(contentErrorMessage("ENCODING_UTF16")).toContain("UTF-8");
  });

  it("drops a stray BOM from pasted text and measures its bytes", () => {
    expect(normalizeCsvText("﻿term,definition")).toBe("term,definition");
    expect(codeOf(() => normalizeCsvText(""))).toBe("EMPTY_FILE");
  });
});
