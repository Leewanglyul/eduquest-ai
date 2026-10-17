# 1. Batch size cap: implementation plan

Status: **items 1–3 implemented (R2, cap = 30, tests in `tests/access/batch-cap.test.ts`); items 4–7 and the staging measurement are still open.** Owner: engineering. Needs: a staging measurement before the final number is fixed.

## Why a cap is required

`commitBatchAction` creates every account **inside one HTTP request** and returns the one-time temporary passwords in that same response. If the request times out or the tab closes:

- the accounts already exist,
- the passwords are lost (they are never stored),
- the batch row is stuck in `running`.

Recovery exists now (teacher password reissue), but a timeout still costs a classroom's worth of reissues. The cap keeps a normal batch comfortably inside the host's request limit.

## Current state (from the code; the cap rows reflect R2, the rest is unchanged)

| Item | Value | Where |
|---|---|---|
| Max rows per batch | **30** (was 200; changed by R2) | `MAX_BATCH_ROWS`, `src/features/accounts/batch/batch-schemas.ts:4` |
| Max CSV size | 256 KB | `MAX_CSV_BYTES` (same file) (the upload form now receives it as a prop; no duplicated literal) |
| Processing | **sequential** loop | `commitStudentBatch`, `batch-service.ts` |
| Preview token lifetime | 15 min | `COMMIT_TOKEN_TTL_MINUTES` |
| Cap enforced at | CSV parse (`TOO_MANY_ROWS`) and the zod schema `.max()` | `csv-parse.ts`, `batch-schemas.ts` |
| Per-row classroom re-validation | **yes**: each row calls `addStudentToClassroom`, which re-runs `requireManageableClassroom` (2 queries) | `batch-service.ts`, `enrollments/service.ts` |

Round trips per row, by code reading: provisioning ≈ 5 (auth user, profile, student, account, audit) + enrollment ≈ 6 (classroom lookup ×2, student, existing enrollment, insert, audit) = **≈ 11**.

## Measurements (local stack; DB on the same machine, ~0 ms network)

| Strategy | ms / row | 30 rows | 50 rows | 200 rows |
|---|---|---|---|---|
| Sequential (today) | **294** | 9 s | 15 s | **59 s** |
| 4-way concurrency | **67** | 2 s | 3 s | 13 s |

These are best-case. A hosted database adds network latency to each of the ~11 round trips.

## Model for hosted (estimate: replace with staging numbers)

`seconds/row ≈ 0.294 + 11 × RTT` (sequential). Concurrency 4 and ~2 fewer queries per row divide this by roughly 3.5.

| Round trip app→Supabase | sequential s/row | 30 rows sequential | 30 rows, concurrency 4 |
|---|---|---|---|
| 20 ms | 0.5 | 15 s | ~4 s |
| 50 ms | 0.8 | 25 s | ~7 s |
| 100 ms | 1.4 | 42 s | ~12 s |

Host request limits vary by plan (often tens of seconds). **Confirm the limit of the chosen host**; do not assume.

## Recommended decision

- **Pilot cap: 30 rows per commit** (constant, single source of truth).
- Final number = `floor(0.5 × host_request_limit_seconds ÷ measured_seconds_per_row)`, rounded down to a multiple of 5, never above 50. Measure on staging (protocol below).
- Larger classes: upload in several files of ≤ cap rows. Each file gets its own preview, token and credential sheet.

## Changes (in priority order)

1. **One source of truth.** Set `MAX_BATCH_ROWS = 30` in `batch-schemas.ts`. Import `MAX_CSV_BYTES` in `batch-upload-form.tsx` instead of the duplicated literal. Pass the cap to the form as a prop from the server page so the help text never drifts.
2. **Clearer error and help text.** Replace the generic message with: found N rows, the maximum is 30, split the file. Show the cap in the upload help text ("한 번에 최대 30명"). No schema change.
3. **Keep every enforcement point.** Preview (`parseStudentCsv`), commit (re-parsed server-side), and the zod `.max()`. The commit token is already bound to the row hash, so a client cannot raise the cap between preview and commit.
4. **Cut per-row cost.** Validate the classroom once at commit start, then enroll each row through a lighter internal function that skips the repeated `requireManageableClassroom`. Keep the full check on the single-student path. Saves ~2 of 11 round trips per row.
5. **Bounded concurrency (recommended).** Process rows with a pool of 4 instead of a loop. Preserve result order, keep per-row isolation (one row failing must not abort others), keep the rollback inside `provisionStudentAccount`. Local gain: 4.4×.
6. **Host duration setting.** If the host supports it, set the route/action max duration for the import page (Next.js `maxDuration`); value from the host's plan limit.
7. **Stuck batch cleanup (ops).** A timed-out batch stays `running`. Use the monitoring query in `04-pilot-deployment-checklist.md` and mark stale ones `expired`. No code change.

Not in scope (M2): asynchronous, resumable batch jobs with a credential vault.

## Tests to add when implementing

- Boundary: exactly `cap` rows succeeds; `cap + 1` is rejected at preview with the new message and creates no `account_batches` row.
- Commit path: a CSV with more than `cap` rows is rejected even with a valid token.
- Token integrity: a token from a `cap`-row preview cannot commit a different row set.
- Concurrency (if item 5): results keep CSV order; a duplicate student number fails only its own row; audit has one `student.provisioned` per success.
- Existing suites stay green: `pnpm test:access`, `supabase test db`.

## Staging measurement protocol (decides the final cap)

1. Staging project in the **same region** as production, app deployed the same way.
2. As a teacher, import CSVs of 10, 30 and 50 rows into a test classroom, three runs each.
3. Record wall-clock time per commit (browser network tab) and the host's function duration log.
4. Per-row seconds = median(time ÷ rows). Apply the formula above using the host's real limit.
5. Run one commit with the **maximum** rows while a second teacher logs in, to confirm no cross-impact.
6. Record the result and the chosen cap in the sign-off table of the deployment checklist.

## Acceptance criteria

- No normal batch takes more than 50 % of the host request limit on staging.
- Over-cap files are refused before any account is created.
- Help text and error text show the same number as the constant.
- Effort estimate: small (about half a day) plus the staging measurement.
