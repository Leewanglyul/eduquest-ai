import type { BatchRowResult } from "./batch-schemas";

/** Neutralise spreadsheet formula injection and quote CSV special characters. */
export function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Builds the one-time credential sheet (UTF-8 BOM so Excel reads Korean correctly).
 * Only successful rows are included; temporary passwords are never persisted.
 */
export function buildCredentialCsv(results: BatchRowResult[]): string {
  const header = ["이름", "학번", "학년", "아이디", "임시 비밀번호"];
  const lines = [header.join(",")];

  for (const r of results) {
    if (!r.ok) continue;
    lines.push(
      [r.studentName, r.studentNo, r.grade, r.username, r.temporaryPassword]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  return `﻿${lines.join("\r\n")}\r\n`;
}
