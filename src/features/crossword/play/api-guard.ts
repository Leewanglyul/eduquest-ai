import "server-only";

import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { requireActiveProfile } from "@/features/identity/service";
import { isCrosswordPlayEnabled } from "@/lib/flags";
import { IdentityError } from "@/features/identity/errors";
import { studentMustChangePassword } from "@/lib/rbac/student-guard";
import { getStudentIdForProfile } from "./access";
import { PlayError } from "./errors";
import { playMessage } from "./messages";
import type { PlayErrorCode } from "./types";

/** Every play response is private and never cached. */
const HEADERS = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" } as const;

export function jsonOk(data: unknown, status = 200): Response {
  return NextResponse.json(data, { status, headers: HEADERS });
}

export function jsonError(error: string, status: number, extra: Record<string, unknown> = {}): Response {
  return NextResponse.json({ error, ...extra }, { status, headers: HEADERS });
}

const STATUS: Record<PlayErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_OPEN_YET: 409,
  CLOSED: 409,
  READONLY: 409,
  BAD_CELL: 400,
  BAD_CHAR: 400,
  BAD_PATCH: 400,
  PATCH_TOO_LARGE: 413,
  LOCKED_CELL: 409,
  STALE: 409,
  CHECK_NOT_ALLOWED: 403,
  CHECK_LIMIT: 403,
  CHECK_RATE: 429,
  REVEAL_NOT_ALLOWED: 403,
  REVEAL_LIMIT: 403,
  CHOSUNG_NOT_ALLOWED: 403,
  CHOSUNG_UNAVAILABLE: 409,
  SUBMIT_COOLDOWN: 429,
};

/**
 * Same-origin only: a cross-site page must not be able to act as the student.
 * Browsers send Sec-Fetch-Site only to secure contexts (https, localhost). Over plain http on a LAN address (a school
 * test run) it is absent, so the Origin header is compared with the Host the browser used. request.url is NOT used for
 * this: behind `next start -H 0.0.0.0` it carries the bind address, not the address the browser typed.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin" || site === "none";
  const origin = request.headers.get("origin");
  if (origin === null) return request.method === "GET";
  try {
    const host = request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type RouteContext = { params: Promise<{ assignmentId: string }> };

/**
 * One wrapper for all six handlers: the feature flag (404 when off), same-origin and JSON checks, session-derived identity (a signed-in, active student
 * who finished the forced password change), strict body validation, the service call, and errors turned into short JSON
 * that never carries an expected value or a database message.
 */
export async function playRoute<B>(
  request: Request,
  context: RouteContext,
  options: { method: "GET" | "POST"; body?: ZodType<B> },
  run: (ctx: { studentId: string; assignmentId: string; body: B }) => Promise<unknown>,
): Promise<Response> {
  // Release gate (m2/12 F-1): with Student Play off, every play endpoint behaves as if it did not exist, like the pages.
  // First on purpose: no body, cookie, session or database is touched, and the answer says nothing about the feature.
  if (!isCrosswordPlayEnabled()) return jsonError("NOT_FOUND", 404);

  if (request.method !== options.method) return jsonError("METHOD_NOT_ALLOWED", 405);
  if (!isSameOrigin(request)) return jsonError("FORBIDDEN", 403);

  let body = undefined as B;
  if (options.body) {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return jsonError("UNSUPPORTED_MEDIA_TYPE", 415);
    }
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", 400);
    }
    const parsed = options.body.safeParse(raw);
    if (!parsed.success) return jsonError("BAD_REQUEST", 400);
    body = parsed.data;
  }

  try {
    const profile = await requireActiveProfile();
    if (profile.role !== "student") return jsonError("FORBIDDEN", 403);
    if (await studentMustChangePassword(profile.id)) return jsonError("FORBIDDEN", 403);
    const studentId = await getStudentIdForProfile(profile.id);
    const { assignmentId } = await context.params;
    return jsonOk(await run({ studentId, assignmentId, body }));
  } catch (err) {
    if (err instanceof PlayError) {
      return jsonError(err.code, STATUS[err.code], {
        message: playMessage(err.code, err.seconds),
        ...(err.seconds !== undefined ? { retryAfterSeconds: err.seconds } : {}),
      });
    }
    if (err instanceof IdentityError) {
      return jsonError(err.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN", err.code === "UNAUTHENTICATED" ? 401 : 403);
    }
    // Anything else is a bug or an outage: say nothing about it (and log nothing that could hold a cell or a letter).
    return jsonError("SERVER_ERROR", 500);
  }
}
