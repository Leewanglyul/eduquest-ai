# M2-1 implementation review package (M2-1.1 Schema and M2-1.3 Validation)

Review only. Nothing was changed in the code, migrations or tests to produce this page.

| | |
|---|---|
| Branch | `m2/m2-1-content-pipeline` (local, not pushed), on top of the M1 head `8fec092` |
| Commits reviewed | `5de67b7` docs · `4a8aef9` M2-1.1 schema · `7cf9a47` M2-1.3 validation · `060cd79` PM decisions D2, D3, D5 |
| Size | 23 files, +2710/−5 in `src`, `supabase`, `tests`; plus the two design documents |
| PM decisions applied | D2 one-character entries allowed · D3 co-teachers manage content · D5 archive only (no purge) · D12 header required · D13 original CSV not retained · D14 entry edit and CSV download included |
| Not built yet | M2-1.2 Upload, 1.4 Teacher management, 1.5 Export (no routes, no UI, no server actions exist) |

## Resolution (after the PM decisions of 2026-10-17)

The findings below are the review as written. Their status after the follow-up commit:

| Finding / change | Status | How |
|---|---|---|
| F1 / R1 classroom owner excluded | **Fixed** | RLS select policy and `fn_commit_content_import` now include `classrooms.owner_id` |
| F2 / R2 missing tests | **Fixed** | pgTAP: classroom owner (select, view, append, replace), co-teacher added then removed, outsider |
| F9 / R3 stale D5 sentences | **Fixed** | design §3.5 and §5 reworded |
| F3 / R4 text after a closing quote | **Fixed** | `CSV_QUOTE_MISPLACED`, tests |
| F4 / R5 numeric collisions, P3 | **Fixed** | `ANSWER_NUMERIC_LIKE` rejects `1.5`, `3.14`, `1,000`, `-5`, dates, phone numbers; plain digits and `3D` stay valid |
| F6 / R6 clue warning noise | **Fixed** | not checked for one-character answers |
| P1 owner deletion | **Done** | `content_sets.owner_id` is `RESTRICT`; transfer SQL in `12` §4.3; sets deleted before teachers in `12` §3.4; pgTAP proves refusal then success after transfer |
| P2 archived classroom read-only | **Done** | `CONTENT_CLASSROOM_ARCHIVED` for create, append and replace; reading stays allowed (pgTAP) |
| P4 governance text | **Done** | `docs/pilot/12` (rows in §0.1, rule in §1, retention row, §3.4, §4.3, §5, §6) and one limit in `13` §3; SQL checked on the local database |
| F5 / R8, F7 / R7, F10, F11, F12–F16, A5 / R9 | Open | not part of this change; F5 and F11 belong to phase 1.2 |

## 0. Evidence gathered for this review

| Check | Result |
|---|---|
| `supabase db reset` | all 20 migrations apply |
| `supabase test db` | 10 files, 148 tests pass (M2: `00009` 40, `00010` 46) |
| `pnpm db:types` | identical to the committed `src/types/database.ts` |
| `pnpm test:access` (local stack) | 14 files, 233 tests pass (M2: 6 files, 106 tests) |
| `pnpm typecheck`, lint | clean |
| Probes run for this review (scratch, rolled back) | normaliser and tokenizer behaviour on 20 inputs; a classroom-owner access probe against the real function and RLS (§2, findings F1, F2) |
| Not verified | anything on the hosted project (not touched); the Server Action / UI layers (not written) |

## 1. Architecture review

### 1.1 What is there

```
CSV bytes ─ decodeCsvBytes ─ tokenizeCsv ─ parseContentCsv ─ evaluateRow (clean, answer, rules)
                                                    └─ buildContentPreview (dupes, set size)
                                                              └─ hashContentRows ─ [token] ─ toCommitRows
                      content_import_batches  ◄──────────────────────────────┐
fn_commit_content_import (one transaction: claim, authorise, create/lock set, archive, insert, cap, audit)
content_sets ── content_entries (answer CHECK, generated answer_length, partial unique index)
v_content_entries_active / v_content_sets_summary (security_invoker) = the generator's read model
```

### 1.2 What is sound

| Area | Assessment |
|---|---|
| Layering | Validators are pure and database-free (a test enforces it); all I/O will sit in 1.2. Matches the M1 split of `csv-parse` / `preview` / `batch-service` |
| Atomicity | The commit is one SQL transaction: no `running` state, no half-applied replace, a cap overflow rolls back the archive step too. Proven by pgTAP on the real database. Better than the M1 loop |
| Single use and binding | Row lock on the batch plus status change; the token is hash-only; `rows_hash` binds mode, target, classroom, normaliser version and rows; a different mode or set fails closed |
| Defence in depth | Grid-safe `CHECK` and length bounds in the database; generated `answer_length` cannot drift; the partial unique index settles races that the preview cannot see |
| One source for limits | `content-schemas.ts`; the TypeScript answer bounds are inside the database bounds and a test pins that, and pins the SQL CHECK numbers against the constants |
| RLS style | Same as M1: select policies only, writes through the service role, batches without policies, security-invoker views, `search_path` pinned, execute revoked from `anon`/`authenticated` |
| Privacy | No raw CSV stored (D13), audit metadata holds counts and hashes only (tested), no term in any log path |
| Messages | One map, pinned by tests; the batch errors reuse the M1 wording |
| Migration shape | Four additive files; enum values alone in file 17; the sets/batches cycle is closed by a late `ALTER TABLE`. No M1 table is altered |

### 1.3 Architectural concerns

| # | Concern | Why it matters |
|---|---|---|
| A1 | **Access model is incomplete for a classroom's owner** (F1 below) | D3 says co-teachers manage content; the classroom *owner* is not in `classroom_teachers`, so the owner is locked out of sets that a co-teacher created in the owner's own classroom |
| A2 | `p_rows_hash` and `p_rows` are two independent arguments. The function checks the hash against the stored batch but never recomputes it from `p_rows` | The binding is only as good as the caller computing both from the same array. Same property as M1, but M2 now has a place to make it structural (F5) |
| A3 | Validation rules and database CHECKs do not cover the same ground: the database cannot tell that `answer` was derived from `term`, or that `term` is NFC | A bug in the normaliser could store a valid-looking but unrelated answer. Acceptable for the pilot; the gap is known |
| A4 | Ownership: `content_sets.owner_id` is `ON DELETE CASCADE` while D3 makes content shared | When the owner's account is deleted, co-teachers lose a set they manage. M1 has no ownership transfer either, so there is no way out |
| A5 | The generator contract says "length-bounded answers", but with D2 the bound is now 1–15 | Consumers that need 2+ letters must filter on `answer_length` themselves. Not stated in the contract (§7 of the design) |
| A6 | `content_import_batches` grows without a cleanup (expired previews stay) | Same as M1's `account_batches`; low volume |

## 2. Risk review

Severity: **High** blocks the merge or silently breaks a decided behaviour · **Medium** should be fixed before the code is used · **Low** accept or schedule.

### 2.1 Findings

| ID | Sev | Finding | Evidence | Where |
|---|---|---|---|---|
| **F1** | **High** | **The classroom owner cannot see or manage a set that a co-teacher created and linked to the owner's classroom.** RLS `content_sets_select_staff` and the commit function only recognise `owner_id` and `classroom_teachers`; the classroom owner is recorded in `classrooms.owner_id` and is in neither | Probe on the real database: a co-teacher's set linked to the owner's classroom → owner's `SELECT` returns 0 rows, and `fn_commit_content_import` raises `CONTENT_FORBIDDEN` for the owner. (The create path does accept the owner, so the code is inconsistent with itself.) The pgTAP files only use the owner as set owner, so this was not caught | `20261017000003` policy, `20261017000004` `v_is_coteacher`, tests `00009`/`00010` |
| F2 | Medium | Same root cause: the tests never cover "classroom owner is not set owner". Add the case | as above | `00009`, `00010` |
| F3 | Medium | **Lenient quote handling silently merges data.** `"abc"def` is read as the single value `abcdef` (the quote is not followed by a delimiter). A malformed cell becomes a plausible term | Probe: `"abc"def,x` → term `abcdef`. Inherited from the M1 tokenizer; M2 copied it | `csv-records.ts` |
| F4 | Medium | **`.` is removed as a separator, so numbers collapse and collide:** `1.5` → `15`, `3.14` → `314`; `1.5` and `15` are one key and the second is rejected as a duplicate | Probe | `normalize.ts` `ANSWER_SEPARATORS` |
| F5 | Medium | The hash/rows argument pair (A2). Nothing in 1.2 is written yet, so this is a requirement for the next phase, not a defect today | code reading | `fn_commit_content_import` |
| F6 | Medium | **D2 makes the clue-leak warning noisy.** With one-character answers `DEFINITION_CONTAINS_ANSWER` fires whenever the character occurs anywhere in the clue (`물` in "마시는 물", `A` in "…alphabet a"); it will be shown on most one-syllable rows and teachers will learn to ignore it | Probe | `row-rules.ts` |
| F7 | Medium | **Strict characters will reject common teacher input.** Parenthetical hints (`사과 (과일)`), Hanja annotations (`광합성(光合成)`), slashes (`and/or`), accented letters (`café`), emoji are all `ANSWER_INVALID_CHAR`. This is by design, but the message does not suggest the fix (move the note to the definition) | Probe | `import-errors.ts` |
| F8 | Medium | Governance not yet reflected in `docs/pilot/12`: content is teacher free text that must not contain student personal data (D9), and the end-of-pilot verify query has no content row. Archive-only (D5) means replaced content remains until that deletion | design §2.9 | `docs/pilot/12`, `13` (unchanged) |
| F9 | Low | Two stale sentences from before D5: design §3.5 ("recoverable until purged (§2.9)") and §5 ("A purged entry invalidates references") | `01-csv-content-pipeline.md` lines 426 and 688 | docs |
| F10 | Low | `ANSWER_TOO_SHORT` now reads "최소 1글자여야 합니다" and fires only when nothing is left after removing separators (for example `---`); the message does not say what is wrong | `import-errors.ts` | message |
| F11 | Low | Generated types mark nullable function arguments (`p_set_id`, `p_new_title`, `p_classroom_id`) as `string`; the 1.2 service must cast when passing `null` | `database.ts` | type |
| F12 | Low | A co-teacher may keep writing to a set after the linked classroom is archived (the function checks the set, not the classroom). Probably acceptable; undecided | code reading | function |
| F13 | Low | `pnpm test:access` refuses to start when `.env.local` points at a hosted project, so the pure M2 tests cannot run in that setup without environment overrides. Applies to M1 tests as well | `tests/access/setup-env.ts` | infra |
| F14 | Low | `content_import_batches` accumulates (A6); a user can create many previews | | ops |
| F15 | Low | Several tests assert on the text of the migration files (regex on SQL). Robust enough, but a formatting change can break them | `content-cap`, `content-token` | tests |
| F16 | Low | Behaviour parity: `a.b` style initials such as `U.S.A.` → `USA` and `Wi-Fi` → `WIFI` are accepted; `COVID-19` and `제1조` become `mixed` with a warning | Probe | by design |

### 2.2 Risk summary by theme

| Theme | Risk | Status |
|---|---|---|
| Access control | F1/F2: a decided behaviour (D3) is wrong for the classroom owner | **Fix before merge** |
| Data integrity | F3 silent merge; F4 numeric collision | Fix before the importer is built on top |
| Privacy / governance | F8, D13 held; no raw file; audit clean | Update `12` before M2 content is used by real users |
| Operational | No hosted impact: migrations 17–20 are not applied anywhere but the local stack | Keep out of the M1 tag |
| Quality of life | F6, F7, F10: teachers will see noisy warnings and strict rejections | Adjust messages and the warning rule |
| Performance | Entries ≤ 200 per set, ≤ 100 per file, partial indexes in place, views evaluate RLS per row; no concern at pilot scale | None |
| Security | `SECURITY DEFINER` function trusts `p_actor_id` (service role only, same as `fn_transfer_enrollment`); search path pinned; execute revoked. Residual risk is a leaked service key, as in M1 | Accept |

## 3. Recommended changes before M2-1 merge

Scope is limited to what is already in the four commits. Nothing here adds a feature.

### 3.1 Required before merge

| # | Change | Resolves |
|---|---|---|
| R1 | **Include the classroom owner in the access rule.** RLS select policy: add `OR EXISTS (SELECT 1 FROM classrooms c WHERE c.id = content_sets.classroom_id AND c.owner_id = auth.uid())`. In `fn_commit_content_import`: treat `classrooms.owner_id = p_actor_id` of the linked classroom like a co-teacher. A new migration is not needed while nothing is deployed: edit migrations 19 and 20 in place on this branch, then re-run `db reset`, `test db`, `db:types` | F1 |
| R2 | pgTAP cases: classroom owner (not set owner) can select and append/replace; a stranger to the classroom still cannot; behaviour after the co-teacher is removed from `classroom_teachers` | F2 |
| R3 | Fix the two stale D5 sentences in the design | F9 |

### 3.2 Recommended before the upload phase (1.2) starts, while `NORMALIZER_VERSION` is still unreleased

| # | Change | Resolves |
|---|---|---|
| R4 | Tokenizer: after a closing quote, only a delimiter, a line end or end of file may follow; otherwise `CSV_MALFORMED`. Add tests | F3 |
| R5 | Separator rule for `.`: remove it only when it is not between two digits; a digit-dot-digit term becomes `ANSWER_INVALID_CHAR` (or is kept as a decision for the PM). Add tests for `1.5`, `3.14`, `U.S.A.` | F4 |
| R6 | Skip `DEFINITION_CONTAINS_ANSWER` when the answer is shorter than 2 characters | F6 |
| R7 | Change `ANSWER_INVALID_CHAR` text to include the remedy ("괄호나 설명은 뜻 열에 적어 주세요"), and `ANSWER_TOO_SHORT` to say that no letters remain | F7, F10 |
| R8 | In 1.2, compute `rows_hash` and the jsonb rows from one function and one array; add a test that mutates a row after hashing and expects `ROWS_CHANGED` (optional hardening: recompute the hash in SQL from `p_rows`) | F5 / A2 |
| R9 | Add a short note to design §7: consumers needing longer answers filter on `answer_length` | A5 |

### 3.3 Decisions to put to the PM

| # | Decision | Recommendation |
|---|---|---|
| P1 | Owner deleted while co-teachers manage the set: keep `CASCADE`, or `RESTRICT` plus the deletion run deleting sets first, or add ownership transfer later | Keep `CASCADE` for the pilot, state it in the Ops runbook (`12` §3.4) and revisit with ownership transfer |
| P2 | Linked classroom archived: may co-teachers still write? | Yes for now; revisit with the teacher-management phase |
| P3 | Number-like terms (`1.5`, `3.14`): reject or keep digits only | Reject (R5) |
| P4 | When `12` is updated for D9 and the content row | Before any real teacher content is uploaded; at the latest with phase 1.2 |

### 3.4 Merge recommendation

- **Do not merge the four commits as they are:** F1 contradicts D3 for the classroom owner. With R1–R3 done and the gates green again (`db reset`, `test db`, `db:types`, `test:access`, typecheck, lint), the foundation (schema plus pure validators) is **mergeable**: it adds tables and pure functions only, and no route, action or screen.
- **Order:** merge M1 first (see the M1 readiness review); then rebase this branch with `git rebase --onto origin/main 8fec092 m2/m2-1-content-pipeline` and re-run the gates; then open the M2 pull request.
- **Deployment:** do not apply migrations 17–20 to the hosted pilot project with the M1 tag. Apply them to staging with the 1.2 release; on production only after `12` is updated.
- R4–R8 can be a follow-up commit on this branch or the first commit of 1.2; they must land before 1.2 builds on the validators.

## 4. Review checklist for the human reviewer

- ☐ Read `01-csv-content-pipeline.md` §2 (database) and §4 (rules) against `20261017000003/4`.
- ☐ Confirm R1 changes are in both the policy and the function, and the pgTAP cases of R2 exist.
- ☐ Confirm the answer bounds (1–15), the row and byte caps (100 rows, 128 KB) and the set cap (200) are the intended numbers.
- ☐ Confirm no term or definition can reach `audit_logs.metadata` (tested in `00010`).
- ☐ Confirm no M1 feature file was edited (only `audit/log.ts` unions and the regenerated types).
- ☐ Gates green after R1–R3: `supabase db reset`, `supabase test db`, `pnpm db:types` (no diff), `pnpm test:access`, `pnpm typecheck`, `pnpm lint`.
