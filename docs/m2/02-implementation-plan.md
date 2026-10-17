# M2-1 implementation plan

Status: **plan only. Nothing is implemented, no branch is cut.** Source of truth for behaviour: [01-csv-content-pipeline.md](01-csv-content-pipeline.md) (called "the design" below; § numbers refer to it). Decided by the PM: D12 header required, D13 original CSV not retained, D14 single-entry edit and CSV download included. D1–D11 are still open; this plan says which phase each one blocks.

## 1. Phases at a glance

| Phase | Name | Delivers | Needs | Size |
|---|---|---|---|---|
| M2-1.1 | Schema | migrations 17–20, regenerated DB types, audit unions, pgTAP | nothing | M |
| M2-1.3 | Validation | pure functions: constants, decode, tokenizer, header, normaliser, row rules, preview builder | nothing (parallel with 1.1) | M |
| M2-1.2 | Upload | preview/commit services and actions, import pages and components | 1.1 + 1.3 | L |
| M2-1.4 | Teacher management | set list/detail, rename/link/archive, single-entry edit/archive | 1.1 + 1.3 (1.2 for the import links) | M |
| M2-1.5 | Export | CSV download route, sample file, re-upload round trip | 1.1 + 1.3 | S |

**Build order: 1.1 and 1.3 in parallel, then 1.2, then 1.4, then 1.5.** The phase numbers follow the PM's brief; the order differs because the upload needs the validation functions. 1.1 and 1.3 touch disjoint files, so two people (or two sessions) can work at once. Size: S ≈ 1 day, M ≈ 2–3 days, L ≈ 4–5 days of one engineer, excluding review.

Delivery: one pull request per phase, each green on its own (`pnpm typecheck`, `pnpm lint`, `pnpm test:access`, `supabase test db`). No phase edits an M1 file except the two one-line unions in `src/lib/audit/log.ts` and the regenerated `src/types/database.ts`, both needed by 1.1. Base branch: whatever M1 is merged into at the time; do not stack M2 on the M1 pilot-candidate branch.

## 2. Decisions that gate the work

| Decision | Blocks | If unanswered |
|---|---|---|
| D1 limits (100 rows / 128 KB / 200 per set) | the constants in 1.3 (values only, not structure); the SQL gets `p_max_entries` as a parameter so no SQL changes either way | build with the recommended values; changing them is a constant edit plus updating the pinned test |
| ~~D3 co-teacher rights~~ **decided: co-teachers manage content** | nothing is gated any more; `fn_commit_content_import` and the 1.2/1.4 checks give owner, admin and co-teacher of the linked classroom the same rights | `canWriteContentSet` still lives in one place so a later change stays local |
| D4 CP949 handling | nothing structural; 1.3 implements "reject" | add auto-convert later behind the same decode function |
| ~~D5 purge of archived entries~~ **decided: archive only** | nothing; no purge snippet, no Ops step | archived rows are removed by the end-of-pilot deletion with their owner |
| D9 governance wording | the Korean privacy line on import/edit pages (1.2, 1.4) and the update of `12` | ship the line (it is harmless); the `12` text change goes through the D6 sign-off owner |
| D10 shared tokenizer | whether 1.3 copies or shares the tokenizer | **1.3 contains its own tokenizer**, because the shared move touches M1 files. D10 later replaces the copy with an import, as a separate refactor |
| D6, D8, D11 | nothing in M2-1 | deferred by design |

## 3. M2-1.1 Schema

Goal: tables, constraints, RLS, the commit function and the read views exist and are proven by pgTAP, with no application code using them yet.

### Migrations (the 17th to 20th; the repo has 16)

| # | File | Contents |
|---|---|---|
| 17 | `supabase/migrations/20261017000001_content_enums_audit.sql` | enums `content_import_mode`, `content_import_status`, `content_script`; `audit_resource` += `content_set`; `audit_action` += `content_set.created`, `content_set.updated`, `content_set.archived`, `content_set.unarchived`, `content_set.import_completed`, `content_set.import_rejected`, `content_set.exported`, `content_entry.updated`, `content_entry.archived`. Idempotent `DO $$ … IF NOT EXISTS` blocks like migration 7. Enum values only |
| 18 | `20261017000002_content_import_batches.sql` | `content_import_batches` without the `set_id` foreign key, index, RLS on with no policy |
| 19 | `20261017000003_content_sets_entries.sql` | `content_sets`, `content_entries` (CHECKs, generated `answer_length`, partial unique index, indexes, `updated_at` trigger), RLS + select policies, then the `set_id` foreign key on `content_import_batches` |
| 20 | `20261017000004_fn_commit_content_import.sql` | `fn_commit_content_import` (SECURITY DEFINER, pinned `search_path`, `REVOKE … FROM PUBLIC, anon, authenticated`, `GRANT … TO service_role`), `v_content_entries_active`, `v_content_sets_summary` with the M1 REVOKE/GRANT pattern |

All nine audit actions are in migration 17 on purpose, so phases 1.4 and 1.5 need **no** later migration. If the date prefix `20261017` is no longer after the newest existing migration when this is built, use the real date; keep the four files consecutive and in this order.

### Files

| File | Change |
|---|---|
| `supabase/migrations/20261017000001…04_*.sql` | new (above) |
| `supabase/tests/00009_content_sets.test.sql` | new: RLS, CHECKs, unique index, cascades, views (design §8) |
| `supabase/tests/00010_content_import.test.sql` | new: function permissions, modes, single use, atomicity, concurrency-by-sequence, cross-school |
| `src/types/database.ts` | regenerated (`supabase gen types`), the only generated-file change |
| `src/lib/audit/log.ts` | extend `AuditResource` with `content_set` and `AuditAction` with the nine values |
| `supabase/tests/README.md` | list the two new files if the README enumerates files |

Exit criteria: `supabase test db` green including the two new files; `pnpm typecheck` green after the type regeneration; the existing M1 tests unchanged. Not verified hosted (per the standing rule, no hosted tests).

Risks: enum values and the objects that use them in one transaction (hence migration 17 alone); the function body is the most complex SQL in the repo, so its pgTAP file is written first.

## 4. M2-1.3 Validation

Goal: everything that decides "is this file / row acceptable, and what is its normalised form" as pure, database-free functions, with the boundary tests.

### Files (`src/features/content/import/`)

| File | Responsibility |
|---|---|
| `content-schemas.ts` | constants `MAX_CONTENT_ROWS`, `MAX_CONTENT_CSV_BYTES`, `MAX_SET_ENTRIES`, `TERM_MAX_CHARS`, `DEFINITION_MAX_CHARS`, `ANSWER_MIN_LEN`, `ANSWER_MAX_LEN`, `NORMALIZER_VERSION`; zod `contentRowSchema`, `contentRunInputSchema` (`.max(MAX_CONTENT_ROWS)`); shared types (`RawContentRow`, `PreparedContentRow`, `ContentPreviewIssue`, `ContentImportMode`) |
| `import-errors.ts` | `ContentImportErrorCode` (design §4.5/§4.8 list) and `ContentImportError`; the code → Korean message map (the single place messages live) |
| `csv-decode.ts` | `decodeCsvBytes(buffer)`: BOM, UTF-16 detection, strict UTF-8, `U+FFFD` check; throws `ContentImportError` |
| `csv-records.ts` | tokenizer returning `{ cells, line }` per record, keeping blank rows in the count; delimiter check |
| `csv-parse.ts` | `parseContentCsv(text)`: size check on bytes, header lookup (aliases, any order, duplicates), row cap, extra-column notice, returns `RawContentRow[]` + notices |
| `normalize.ts` | `cleanText`, `deriveAnswer`, `normalizeRow` (design §4.2), versioned |
| `row-rules.ts` | per-row error/warning evaluation (design §4.1), returns codes |
| `preview.ts` | `buildContentPreview(raw, { mode, existingAnswers, liveCount })`: duplicate detection (file, existing), set-size check, valid/invalid split, counts |
| `rows-hash.ts` | `hashContentRows(...)` (design §3.3); pure so 1.2 and the tests share it |

### Services

None (no I/O). Everything above is pure and unit-testable.

### Tests (`tests/access/`)

`content-cap.test.ts`, `content-csv-parse.test.ts`, `content-encoding.test.ts`, `content-normalize.test.ts`, `content-preview.test.ts` (the action-level cap cases of `content-cap.test.ts` wait for 1.2). Every boundary uses the constants. A messages snapshot pins every code → text pair.

Exit criteria: all new unit tests green; each rule of design §4.1 and §4.5 has at least one test; no import from `@/lib/supabase/*` in this folder except the types (enforced by a test that greps the folder's imports).

Risks: Hangul/Unicode edge cases (decomposed text, jamo, fullwidth); keep the table-driven examples of design §1.3 as the acceptance list.

## 5. M2-1.2 Upload

Goal: a teacher can create a set, append to it and replace it from a CSV through preview then commit.

### Migrations

None (uses 17–20).

### Services (`src/features/content/`)

| Service | File | Responsibility |
|---|---|---|
| `readContentFile(formData)` | `import/read-file.ts` | picks `file` or pasted `csv`, checks `file.size` before reading, returns bytes + `sha256` |
| `requireManageableContentSet(actor, setId, action)` | `sets/access.ts` | teacher area, same school, set exists, not archived, role allows `action` (D3 helper `canWriteContentSet`) |
| `loadLiveAnswers(setId)` | `sets/queries.ts` | live `answer` keys and count for preview duplicate detection (service role, school-scoped) |
| `createContentImportPreview(input)` | `import/import-service.ts` | creates the batch row: token (32 random bytes, only sha256 stored), `rows_hash`, `source_sha256`, `source_bytes`, expiry |
| `commitContentImport(input)` | `import/import-service.ts` | recomputes the hash, calls `fn_commit_content_import`, maps named exceptions to `ContentImportError`, returns the summary |
| `previousImportOf(setId, sourceSha256)` | `import/import-service.ts` | for the "already uploaded on {date}" notice |
| `COMMIT_TOKEN_TTL_MINUTES` reuse | `import/import-service.ts` | import the M1 constant or define a sibling (15); do not edit M1 |

### Server actions (`import/actions.ts`, `"use server"`)

`previewContentImportAction(prev, formData)` and `commitContentImportAction(prev, formData)`; state types `ContentPreviewState`, `ContentRunState`. Rejections on commit also call `writeAuditLog('content_set.import_rejected')` best effort.

### UI

| Item | File |
|---|---|
| Page: new set | `src/app/teacher/content/import/page.tsx` |
| Page: add/replace | `src/app/teacher/content/[setId]/import/page.tsx` |
| Form (file, mode, set name, classroom, token handling, states of design §3.6) | `src/components/teacher/content-import-form.tsx` |
| Preview table (accepted rows with answer and length, warnings) | `src/components/teacher/content-preview-table.tsx` |
| Rejected rows table | `src/components/teacher/content-rejected-table.tsx` |
| Result panel (saved / skipped / archived, link to the set) | `src/components/teacher/content-result-panel.tsx` |
| Replace confirmation block | inside the form file |
| Limits | passed as props from the page: `maxRows`, `maxCsvBytes`, `maxSetEntries`, `maxTermChars`, `maxDefinitionChars`, `answerMinLen`, `answerMaxLen` |
| Sample file link | points to `public/samples/content-sample.csv` (created in 1.5) |

The browser posts the **File** itself (not `file.text()`), per design §3.7.

### Tests

`content-cap.test.ts` (action cases), `content-actions-authorization.test.ts`, `content-token.test.ts`; a UI-level check that the form renders every limit from props and has no literal number.

Exit criteria: create/append/replace work against the local stack by hand and by test; a second commit with the same token fails; over-cap file refused at preview and at commit with no batch written; the M1 import page and tests unchanged. Local Supabase may be down: pgTAP and manual runs wait for it; the mocked suites do not.

Risks: server action body size (A9, 1 MB default); `useActionState` with a File input needs the file to stay in the form between preview and commit (same pattern as M1 hidden field, but with the file input kept mounted).

## 6. M2-1.4 Teacher management

Goal: the teacher can list, open, rename, link, archive, restore sets, and edit or archive a single entry.

### Migrations

None.

### Services (`src/features/content/sets/`)

| Service | File |
|---|---|
| `listContentSets(actor, filter)` | `queries.ts` (from `v_content_sets_summary` under the caller's rights, or the service role with explicit scoping) |
| `getContentSet(actor, setId)` / `listEntries(setId)` | `queries.ts` |
| `listImportHistory(actor, setId)` | `queries.ts` (service role; `content_import_batches` has no policy) |
| `renameContentSet`, `linkContentSetClassroom`, `archiveContentSet`, `unarchiveContentSet` | `service.ts`; each checks school, role, archived state; the classroom link also checks `requireManageableClassroom` and same school; audits |
| `updateContentEntry(actor, entryId, { term, definition })` | `service.ts`; runs `normalizeRow` and `row-rules` from 1.3, refuses an answer that violates the rules, maps unique-index violation (`23505`) to the duplicate message, bumps `normalizer_version`, audits `content_entry.updated` without text |
| `archiveContentEntry(actor, entryId)` | `service.ts`; audits `content_entry.archived` |
| `canWriteContentSet(role, action)` | `access.ts` (D3 in one place) |

### Server actions (`sets/actions.ts`, `"use server"`)

`renameContentSetAction`, `linkContentSetClassroomAction`, `archiveContentSetAction`, `unarchiveContentSetAction`, `updateContentEntryAction`, `archiveContentEntryAction`. Schemas in `sets/schemas.ts`; errors in `sets/errors.ts` (`ContentSetError`, codes `SET_NOT_FOUND`, `SET_ARCHIVED`, `FORBIDDEN`, `TITLE_INVALID`, `TITLE_DUPLICATE`, `ENTRY_NOT_FOUND`, `DUP_EXISTING`, plus the row-rule codes reused).

### UI

| Item | File |
|---|---|
| Set list page | `src/app/teacher/content/page.tsx` |
| Set detail page | `src/app/teacher/content/[setId]/page.tsx` |
| List with filters (내 세트 / 학급 세트 / 보관됨) | `src/components/teacher/content-set-list.tsx` |
| Detail header: title, counts, classroom, buttons | `src/components/teacher/content-set-header.tsx` |
| Rename and classroom link forms | `src/components/teacher/content-set-settings.tsx` |
| Archive / restore button with explanation | inside `content-set-header.tsx` |
| Entry table | `src/components/teacher/content-entry-table.tsx` |
| Inline entry editor (term, definition, shows the resulting answer and length live) | `src/components/teacher/content-entry-editor.tsx` |
| Import history | `src/components/teacher/content-import-history.tsx` |
| Navigation entry point | a link in the existing teacher home (`src/app/teacher/page.tsx`): one line, the only M1 file touched in this phase |

The live answer preview in the editor calls the pure `normalizeRow` from 1.3 in the browser; the server repeats it.

### Tests

`content-management.test.ts` (design §8), plus pgTAP additions for the entry update path if the service uses a SQL function (not planned: a single `UPDATE` suffices).

Exit criteria: every row of the permission matrix (design §6.3) has an allow and a deny test; editing an entry cannot produce an answer the import would reject; audit payloads contain no term or definition text; archived sets disappear from lists and from `v_content_entries_active`.

Risks: a later change to the D3 permission matrix; keep all checks behind `canWriteContentSet`.

## 7. M2-1.5 Export

Goal: a teacher downloads a set as a CSV that can be uploaded again, and gets a sample file for first-time users.

### Migrations

None (`content_set.exported` was added in migration 17).

### Services

| Service | File |
|---|---|
| `buildContentExportCsv(entries)` | `src/features/content/export/export-csv.ts`: header `term,definition`, UTF-8 BOM, CRLF, every cell through `escapeCsvCell` (import it from `accounts/batch/credential-export.ts`, or after D10 from the shared module; do not copy it) |
| `exportContentSet(actor, setId)` | `export/export-service.ts`: access check (view right), loads live entries ordered by `position`, writes `content_set.exported` audit (count only) |
| `exportFileName(title, date)` | `export/export-csv.ts`: safe filename, ASCII fallback plus `filename*=UTF-8''…` for Korean titles |

### Route and UI

| Item | File |
|---|---|
| Download endpoint (GET, authenticated, `Cache-Control: no-store`, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment`) | `src/app/teacher/content/[setId]/export/route.ts` |
| Download button on the detail page | `src/components/teacher/content-export-button.tsx` (a plain link, no JavaScript needed) |
| Sample file shown on the import page | `public/samples/content-sample.csv` (BOM, header, three Korean rows from design §1.1, plain text, no personal data) |

A route handler is used instead of a server action because a browser download needs a real response with headers (design §6.4 listed `exportContentSetAction`; this plan supersedes that name).

### Tests

`content-export.test.ts`: a definition `=1+1` exports as `'=1+1`; quotes/commas/newlines in cells round-trip; export then `parseContentCsv` then `normalizeRow` gives the same terms, definitions and answers (round trip); BOM present; archived entries absent; a non-owner gets 403; audit written without text; filename with Korean title encodes correctly.

Exit criteria: the round-trip test is green and the sample file passes the importer with zero errors and zero warnings (a test reads the file).

## 8. Complete lists

### 8.1 Migrations (4)

| # | File | Phase |
|---|---|---|
| 17 | `20261017000001_content_enums_audit.sql` | 1.1 |
| 18 | `20261017000002_content_import_batches.sql` | 1.1 |
| 19 | `20261017000003_content_sets_entries.sql` | 1.1 |
| 20 | `20261017000004_fn_commit_content_import.sql` | 1.1 |

### 8.2 Services

| Module | Functions | Phase |
|---|---|---|
| `import/read-file.ts` | `readContentFile` | 1.2 |
| `import/csv-decode.ts` | `decodeCsvBytes` | 1.3 |
| `import/csv-records.ts`, `import/csv-parse.ts` | tokenizer, `parseContentCsv` | 1.3 |
| `import/normalize.ts`, `import/row-rules.ts` | `cleanText`, `deriveAnswer`, `normalizeRow`, rule evaluation | 1.3 |
| `import/preview.ts` | `buildContentPreview` | 1.3 |
| `import/rows-hash.ts` | `hashContentRows` | 1.3 |
| `import/import-service.ts` | `createContentImportPreview`, `commitContentImport`, `previousImportOf` | 1.2 |
| `sets/access.ts` | `requireManageableContentSet`, `canWriteContentSet` | 1.2 |
| `sets/queries.ts` | `listContentSets`, `getContentSet`, `listEntries`, `loadLiveAnswers`, `listImportHistory` | 1.2 / 1.4 |
| `sets/service.ts` | rename, link, archive, unarchive, `updateContentEntry`, `archiveContentEntry` | 1.4 |
| `export/export-csv.ts`, `export/export-service.ts` | `buildContentExportCsv`, `exportFileName`, `exportContentSet` | 1.5 |

### 8.3 Server actions and routes

| Name | File | Phase |
|---|---|---|
| `previewContentImportAction`, `commitContentImportAction` | `import/actions.ts` | 1.2 |
| rename / link / archive / unarchive set, update / archive entry (6 actions) | `sets/actions.ts` | 1.4 |
| `GET /teacher/content/[setId]/export` | `src/app/teacher/content/[setId]/export/route.ts` | 1.5 |

### 8.4 UI

Pages (4): `/teacher/content`, `/teacher/content/import`, `/teacher/content/[setId]`, `/teacher/content/[setId]/import` (+ the export route).

Components in `src/components/teacher/` (11): `content-import-form`, `content-preview-table`, `content-rejected-table`, `content-result-panel`, `content-set-list`, `content-set-header`, `content-set-settings`, `content-entry-table`, `content-entry-editor`, `content-import-history`, `content-export-button`.

Static: `public/samples/content-sample.csv`.

### 8.5 Test files

`tests/access/`: `content-cap`, `content-csv-parse`, `content-encoding`, `content-normalize`, `content-preview`, `content-actions-authorization`, `content-token`, `content-management`, `content-export` (`.test.ts`). `supabase/tests/`: `00009_content_sets.test.sql`, `00010_content_import.test.sql`.

### 8.6 Existing files touched (the full list)

`src/lib/audit/log.ts` (unions), `src/types/database.ts` (regenerated), `src/app/teacher/page.tsx` (one navigation link), `supabase/tests/README.md` (if it lists files). No M1 feature file under `src/features/accounts`, `enrollments` or `classrooms` is edited.

## 9. Cross-phase rules

- Constants only in `content-schemas.ts`; no limit literal in components, actions or tests (tests import the constants, plus one pin test per value).
- Korean messages only in the code → message map; components and actions never write their own text for an error code.
- Every write goes through the service role or `fn_commit_content_import`; no `INSERT/UPDATE/DELETE` policy is ever added.
- No audit payload, log line or error message may contain a term or definition.
- No raw CSV is persisted anywhere (D13): not in the database, not in Storage, not in logs.
- Nothing hosted is tested; manual checks use the local stack when it is up.
- Credential files (`accounts.txt`, `big.txt`, `s9-*.csv`) stay untouched and uncommitted; the sample file contains only invented vocabulary.

## 10. Definition of done for M2-1

1. All five phases merged, each green on typecheck, lint, `pnpm test:access` and `supabase test db`.
2. A teacher can, on the local stack: create a set from a CSV, see preview errors in Korean, append, replace, fix one entry, link a classroom, archive and restore, download the set and upload the download again with zero differences.
3. The design's guarantees for the generator hold (grid-safe, unique, bounded answers) and are proven at both the application and database level.
4. The governance additions (D9) are with the PM/data-protection contact for the next revision of `12`.
5. Remaining open decisions (D1–D11) are either answered or recorded as accepted defaults in this plan's §2.
