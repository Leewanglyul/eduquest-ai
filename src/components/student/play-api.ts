/**
 * Browser side of the play API: JSON over fetch to /student/crosswords/<assignment>/api/<name>.
 * A network failure or a 5xx is "offline" (try again later); anything else the server said is "rejected" with the
 * stable code. No student or attempt id is sent: the server derives both from the session and the URL.
 */
import { PLAY_ERROR_CODES, type PlayErrorCode } from "@/features/crossword/play/types";
import type { SaveRequest, SendOutcome } from "./save-queue";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "offline" }
  | { ok: false; kind: "rejected"; code: PlayErrorCode | null; status: number; seconds?: number };

const codeOf = (value: unknown): PlayErrorCode | null =>
  typeof value === "string" && (PLAY_ERROR_CODES as readonly string[]).includes(value) ? (value as PlayErrorCode) : null;

export async function callPlay<T>(
  assignmentId: string,
  name: "state" | "save" | "check" | "reveal" | "chosung" | "submit",
  body?: object,
  options: { keepalive?: boolean } = {},
): Promise<ApiResult<T>> {
  const url = `/student/crosswords/${assignmentId}/api/${name}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive: options.keepalive === true,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, kind: "offline" };
  }
  if (res.status >= 500 || res.status === 0) return { ok: false, kind: "offline" };
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok) return { ok: true, data: json as T };
  const err = json as { error?: unknown; retryAfterSeconds?: unknown } | null;
  return {
    ok: false,
    kind: "rejected",
    code: codeOf(err?.error),
    status: res.status,
    seconds: typeof err?.retryAfterSeconds === "number" ? err.retryAfterSeconds : undefined,
  };
}

/** The SaveQueue's sender: exactly { patch, activeMs } goes out. */
export function makeSaveSender(assignmentId: string) {
  return async (request: SaveRequest, options: { keepalive: boolean }): Promise<SendOutcome> => {
    const r = await callPlay<{ revision: number }>(assignmentId, "save", { patch: request.patch, activeMs: request.activeMs }, options);
    if (r.ok) return { kind: "ok", revision: Number(r.data.revision) };
    if (r.kind === "offline") return { kind: "offline" };
    return { kind: "rejected", code: r.code };
  };
}
