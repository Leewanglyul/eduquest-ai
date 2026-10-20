# 12. F-1: gating the Student Play API with the feature flag (design proposal)

Status: **APPROVED by the PM, 2026-10-20 (decisions in §9). Design only: nothing is implemented.** No code, DB or flag change. Source: finding F-1 of [11](11-student-play-release-readiness-audit.md) (MEDIUM, Student Play release blocker).

## 1. Problem

`isCrosswordPlayEnabled()` (`src/lib/flags.ts`) is called in four server pages: the student home link, the list, the play page and the result page. Each answers `notFound()` when the flag is off. The six route handlers under `src/app/student/crosswords/[assignmentId]/api/` (`state`, `save`, `check`, `reveal`, `chosung`, `submit`) do not call it. All six go through one wrapper, `playRoute` in `src/features/crossword/play/api-guard.ts`, which checks method, same origin, JSON, session, student role, password-change state, and then runs the service.

Effect on hosted today (flag unset = OFF): the screens are hidden, but a signed-in, enrolled student who knows an assignment id can call the API directly. There is no published puzzle on hosted yet, so nothing is reachable now. Once a teacher publishes one, "Student Play is off" would be true for the screens only, and attempt rows (student data, governance 14) could be written without the go-live approval.

The routes still enforce authentication, same-origin, enrollment and assignment state, so this is an incomplete switch, not an authorization hole.

## 2. Goals and non-goals

Goals:
1. With the flag off, **no** Student Play endpoint does anything (no read, no write, no student-data row), on every environment.
2. One place enforces it, so a seventh route or a new handler cannot forget it.
3. The off-state response reveals nothing new (same as the screens: "not found").
4. A test fails if a play route does not honour the flag.
5. No change for local development or for the flag-on case.

Non-goals: changing flag semantics (still `true` / `false` / local-host default), changing authorization, DB changes, UI changes, the teacher visibility item TV-1.

## 3. Options

| Option | How | For | Against |
|---|---|---|---|
| **A. Check in `playRoute`** (recommended) | First statement of `playRoute`: if the flag is off, return the same 404 JSON | One choke point; all six routes already use it; a static test already pins "every route uses `playRoute`"; trivial and cheap | A route written without `playRoute` would bypass it, so keep the existing static guard |
| B. Check in `middleware.ts` | Match `/student/crosswords/:path*/api/*`, return 404 when off | Blocks before any handler code runs | The middleware runs on the Edge runtime and has no access to server-only helpers; it duplicates the flag logic (the file is a session-refresh helper and says authorization is not done there); harder to test; matcher mistakes fail silently |
| C. Check in the services (`startOrResume`, `getPlayState`, save/check/...) | `assertPlayEnabled()` at the top of each service function | Also protects any future caller (a job, another route) | Many call sites; easy to miss one; the pages already gate separately |
| D. Remove the routes when off (build-time) | Conditional route files | Strongest | Next route files are static; flag is a runtime/deployment value; not workable |

## 4. Recommendation

**A as the primary gate, plus a small defense in depth in C for the one function that creates student data.**

1. `playRoute`: before method, origin and body checks, `if (!isCrosswordPlayEnabled()) return jsonError("NOT_FOUND", 404)`. Reason for being first: when the feature is off the endpoint should behave as if it does not exist, and it must not read the body, the cookies or the database.
2. `startOrResume` (the function that creates an attempt) throws the existing `NOT_FOUND` play error when the flag is off. It is called by the play page (already gated) and is the only creator of attempt rows, so this protects the data even if a future caller forgets the page or route gate. The other service functions work on an existing attempt, so they stay unchanged (no attempt can exist while the flag was always off; if the flag is switched off later, the routes are blocked by 1).
3. Keep the flag's meaning and file unchanged. `flags.ts` already takes an `env` parameter, which makes the tests easy.

Response: HTTP 404 with the same short JSON shape the other errors use (`{ "error": "NOT_FOUND" }`, `Cache-Control: no-store`). A 404 matches the pages (`notFound()`), does not say "feature disabled", and gives a probing client nothing to learn.

Order of checks inside `playRoute` after the change: flag → method → same-origin → media type and body → session and role → service. The flag check needs no session, so it also keeps an unauthenticated probe from learning anything.

## 5. Tests (to be written with the implementation)

1. **Unit, `playRoute`:** with `CROSSWORD_PLAY_ENABLED=false`, and with it unset against a hosted-looking URL, each of the six handlers returns 404 for GET and POST, whether the request is signed in or not, and **the service function is not called** (spy). With `true` or a local URL the existing behaviour is unchanged.
2. **Flow test (local stack):** with the flag forced off, a signed-in enrolled student gets 404 from all six routes and **no `crossword_attempts` row is created** by `state`/`save`; then with the flag on the normal flow still passes (the existing flow tests keep running).
3. **Static guard (extends `crossword-play-static.test.ts`):** every file under `.../api/*/route.ts` calls `playRoute(`, and `api-guard.ts` references `isCrosswordPlayEnabled` before `requireActiveProfile` (a source-order check). Any new route file under the student crossword API must be covered by the same rule.
4. **`startOrResume`:** with the flag off it throws `NOT_FOUND` and inserts nothing.
5. The four page checks keep their existing static tests (`crossword-play-ui-static.test.ts`).

Hosted verification after deployment (test data only, no real student): with the flag unset, call `state` as a test student and expect 404; confirm zero rows in `crossword_attempts`. This needs no DB change, only an HTTP call and a read-only count.

## 6. Impact

| Item | Assessment |
|---|---|
| Code | `api-guard.ts` (one `if`), `service.ts` `startOrResume` (one `if`), tests. About 20 lines of source |
| DB | none |
| Migrations / hosted push | none |
| UI | none |
| Flag value on hosted | unchanged (unset = OFF); the fix does not turn anything on |
| Local development / device tests | unchanged: flag is ON automatically for `127.0.0.1` and `localhost` |
| Release risk of the change | low: a single early return on a known boolean; the failure mode is "feature stays off" |
| Residual risk | someone adds a handler outside `playRoute` (caught by the static guard); the flag is read from the deployment environment at request time, so a deployment mistake that sets `CROSSWORD_PLAY_ENABLED=true` opens both screens and API together (that is the intended single switch) |

Interaction with the readiness conditions of [11](11-student-play-release-readiness-audit.md): this closes C-4. It does not replace C-1 to C-3, C-5, C-6 or governance 13 (re-signing). It is independent of TV-1 (teacher visibility) and of the teacher override work of [10](10-teacher-override-review.md).

## 7. Rollout

1. PM approves this design (or picks another option).
2. Implementation on a branch, local tests as in §5, no DB and no flag change.
3. Hosted: code deploy only. Verify as in §5, with the flag unset.
4. Update [11](11-student-play-release-readiness-audit.md) §12 (F-1 closed) and C-4.

## 8. Open questions for the PM

1. Option A plus the `startOrResume` guard (recommended), or A alone?
2. Is HTTP 404 acceptable for the off state, or should the API answer 403 with a "feature off" body for easier support? (Recommendation: 404, same as the screens.)
3. Should the off-state also be logged (a counter, no student data)? Recommendation: no, to avoid logging probes with student identifiers.

## 9. PM decisions (2026-10-20)

1. The flag is checked in `playRoute`.
2. `startOrResume` gets the second, defensive check.
3. With the flag off the API answers **404**.
4. No separate logging of off-state calls.
5. F-1 stays a **Student Play release blocker** (MEDIUM) until the implementation is done and verified.
6. TV-1 (teacher visibility) stays a separate item.

Only the design is approved. Implementation has not started and needs its own go-ahead.
