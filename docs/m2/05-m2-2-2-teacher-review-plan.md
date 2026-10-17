# M2-2.2 Teacher review: implementation plan

Status: **plan, canonical document for M2-2.2 (PM decision, 2026-10-17). Step 2a (schema) is implemented on the working tree and not yet committed: migrations 22–24, `supabase/tests/00012_crossword_review_publish_versioning.test.sql` (153 assertions, green), regenerated `src/types/database.ts` and the audit unions in `src/lib/audit/log.ts`. Steps 2b–2e are not started.** This document absorbed the earlier draft `05-crossword-review-publish-versioning.md` (version lineage, SQL validator, restore rule); that draft is retired. Baseline: `m2/m2-1-content-pipeline` at `f3df0d3` (M2-1 and the M2-2.1 generator are complete and validated). Source of behaviour: [04-crossword-generator.md](04-crossword-generator.md) (called "doc 04"; § numbers refer to it). Owner: engineering. Needs: the answers in §11 before the migration phase starts.

## 1. Scope

**Delivered by M2-2.2:** a teacher can look at how ready a word set is for a crossword, generate puzzles from it (as often as they like), review the solution, save a draft, correct clue wording, publish it to classrooms (after which it can never change), create a new version of a published puzzle (a copy as a new draft), and archive puzzles.

**Not delivered (later phases):** the student list and play screen, attempts and answer checking, the results view, and the governance update that must precede them. Publishing in M2-2.2 therefore creates the *assignment* rows but no student can see them yet; nothing student-facing, and no student data, exists after this phase.

## 2. PM decisions of this round, and one naming problem

| PM decision | Meaning in this plan |
|---|---|
| **C2 = minimum placed words 5** | A puzzle is saved and published only if at least 5 multi-cell words are placed. This is `CROSSWORD_MIN_WORDS`, already 5 in the generator; the database repeats it as a check on publish. One-cell words do not count. |
| **C3 = unlimited regenerate** | No limit on how many times a teacher regenerates. Regenerating stores nothing durable (it makes a short-lived preview ticket), so there is nothing to count; protection is the 800 ms time budget per request and a cap on live tickets per teacher (§5.3). |
| **C4 = published puzzles immutable** | After publish nothing about the puzzle can change: grid, words, answers, clues, settings, title. Only `archived` and closing an assignment remain possible. Enforced by database triggers, not only by the application (§4.2). A change means "copy to a new draft". |
| **C5 = crossword readiness score** | A 0-100 score with a verdict for a *word set*, computed before generating, telling the teacher whether the set can make a crossword and what to improve (§6). |

**Reconciliation decisions (PM, after comparing this plan with the schema draft):**

| Decision | Meaning |
|---|---|
| Version lineage kept | `root_id`, `version`, `supersedes_id` and the lineage indexes (§4.6) replace the single `copied_from` column |
| Restore policy | A puzzle that was **never published** can be restored from archive (to draft). A **published** puzzle can never be restored: continue it with a new version (§4.7) |
| `crossword_attempts` moved | Not created in M2-2.2; it is part of the M2-2.4 migration, after the governance update |
| Immutability triggers approved | §4.2 |
| Minimum 5 words on publish approved | §4.3; the save function enforces the same minimum |
| Assign to additional classrooms approved | `fn_add_crossword_assignments` (§4.3b) |
| Published = fully immutable | title, clues, grid, words. New changes need new draft -> new version |

**Naming problem to settle.** Doc 04 §10 already numbers its own open decisions C1-C14 (C1 and C7 were answered in the last round with the same meaning). The labels C2-C5 in the PM's message mean different things than doc 04's C2-C5 (presets, feedback while playing, 초성 hint, attempts per student). To avoid two meanings, this plan proposes to **relabel doc 04's list as CW-1...CW-14** (a documentation-only change in the first commit of M2-2.2), record the PM's C2-C5 as above, and keep doc 04's remaining items open under their CW labels:

| Doc 04 item (old label) | New label | Status |
|---|---|---|
| C1 minimum word length | CW-1 | answered: one-character words allowed |
| C2 difficulty presets | CW-2 | open; the generator ships starting values |
| C3 feedback while playing | CW-3 | open, needed for M2-2.4 only |
| C4 초성 hint | CW-4 | open, M2-2.4 only |
| C5 attempts per student | CW-5 | open, M2-2.4 only |
| C6-C14 | CW-6...CW-14 | open (C7 scripts answered; C13 governance needed before M2-2.4) |

## 3. Phases (renumbering)

Doc 04 §7 called the schema "M2-2.2" and teacher generate/review/publish "M2-2.3". The PM now calls the whole teacher side "M2-2.2". This plan keeps the PM's name and splits it:

| Step | Delivers | Depends on | Size |
|---|---|---|---|
| M2-2.2a Schema | migrations, pgTAP (immutability, RLS, functions), types | M2-2.1 | M |
| M2-2.2b Readiness | the readiness score (pure), tests, shown on the set detail page | M2-2.1 | S |
| M2-2.2c Services and actions | generate (preview ticket), save, edit draft, publish, copy, archive, audit | 2a, 2b | M |
| M2-2.2d Screens | list, new/generate, review/detail, publish | 2c | L |
| M2-2.2e Hardening | flow tests, browser check, docs, review package | 2d | S |

Order: 2a and 2b can run in parallel (disjoint files); then 2c, 2d, 2e. One commit per step; each step is green on its own (`db reset`, `test db`, `db:types` no diff, `test:access`, typecheck, lint, build).

## 4. Database (step 2a)

Changes against doc 04 §6, because of the decisions since it was written:

- **Attempts are not created here.** `crossword_attempts` is student data; it moves to the M2-2.4 migration, after the governance update. Everything in M2-2.2 is teacher content without personal data.
- **One-character words (CW-1).** `crossword_words.answer` allows 1-15 characters; a generated `single` flag marks one-cell words; the numbering uniqueness `(puzzle_id, direction, number)` is unchanged.
- **Version lineage** instead of a plain copy link (§4.6): `root_id`, `version`, `supersedes_id`.
- **Minimum words on publish** is the C2 check (below).

### 4.1 Migrations (the set ends at `20261017000005`; these are the 22nd to 24th)

| # | File | Contents |
|---|---|---|
| 22 | `20261018000001_crossword_enums_audit.sql` | enums `crossword_status` (`draft`, `published`, `archived`), `crossword_level` (`easy`, `normal`, `hard`), `crossword_direction`, `crossword_assignment_status` (`open`, `closed`); `audit_resource` += `crossword`; `audit_action` += `crossword.created`, `crossword.updated`, `crossword.published`, `crossword.assigned`, `crossword.copied` (`{ fromPuzzleId, rootId, version }`), `crossword.assigned` (`{ classroomIds }`), `crossword.archived`, `crossword.unarchived`, `crossword.assignment_closed`. Values only, as in M2-1 |
| 23 | `20261018000002_crossword_puzzles.sql` | `crossword_puzzles`, `crossword_words`, `crossword_preview_tickets`, indexes, `set_updated_at` trigger, RLS, teacher select policies (no student policy at all) |
| 24 | `20261018000003_crossword_assignments_functions.sql` | `crossword_assignments`, the SQL validator and hash helpers, `fn_save_crossword`, `fn_update_crossword_draft`, `fn_create_crossword_version`, `fn_publish_crossword`, `fn_add_crossword_assignments`, `fn_close_crossword_assignment`, `fn_set_crossword_archived`, `fn_cleanup_crossword_tickets`, read view `v_crossword_puzzles_summary` |

The immutability triggers live in migration 23 next to the tables they guard. Migrations 22–24 are the files in the repository; `audit_action` additionally gets `crossword.assigned`, and `crossword.copied` is the audit name for creating a new version.

### 4.2 Immutability after publish (C4), enforced in the database

Application code can have bugs; "published puzzles never change" is therefore also a trigger:

- `trg_crossword_words_immutable` (BEFORE INSERT/UPDATE/DELETE on `crossword_words`): raises `CROSSWORD_PUBLISHED_IMMUTABLE` unless the parent puzzle is `draft`. Two exceptions: the parent row no longer exists (a whole puzzle being deleted by `ON DELETE CASCADE`, the end-of-pilot run), and the `ON DELETE SET NULL` of `source_entry_id` when a set entry is deleted (nothing else on the word may change in that update).
- `trg_crossword_puzzles_immutable` (BEFORE UPDATE on `crossword_puzzles`): once `OLD.status <> 'draft'` only these may change: `status` (`published` -> `archived`; `archived` -> `draft` only if `published_at IS NULL`), `archived_at`, `updated_at`, `owner_id` (ownership transfer, P1), and `set_id` / `supersedes_id` going to NULL (the `ON DELETE SET NULL` actions). Title, level, settings, stats, seed, hash, size, lineage columns and `published_at` never change; a published puzzle never returns to `draft`. On a draft the lineage columns (`root_id`, `version`, `supersedes_id`) are fixed as well.
- Editable while `draft`: title, per-word `clue` (`fn_update_crossword_draft`), and for a **version-1** draft the whole grid by re-saving through a new preview ticket (`fn_save_crossword` with `p_puzzle_id`). The grid of a later version is the grid it was copied from (`CROSSWORD_RESAVE_NOT_ALLOWED`); a different grid is a new puzzle.
- pgTAP proves each of these: update/insert/delete on a published word fails, title/level/settings/size/`published_at`/status updates fail, ownership transfer, archive and closing an assignment succeed, an archived published puzzle stays frozen, a never-published archived one is editable again after restore.
- *Cascade note:* deleting a puzzle row normally cascades to its words and would hit the trigger. Hard deletes happen only in the end-of-pilot run (`docs/pilot/12` §3.4), which runs as the database owner; the trigger lets the `DELETE` of a puzzle row through (the guard is on direct word edits and on puzzle updates, not on `ON DELETE CASCADE`), and the pgTAP file pins that behaviour.

### 4.3 Publish function (C2 and C4)

`fn_publish_crossword(p_puzzle_id, p_actor_id, p_classroom_ids uuid[], p_opens_at, p_closes_at)` in one transaction:
1. lock the puzzle; require status `draft` and the actor allowed to manage it (owner, admin, owner or co-teacher of the linked set's classroom, as the set rules);
2. require **at least 5 multi-cell words** counted from the stored words (`CROSSWORD_TOO_FEW_WORDS`; the minimum is `fn_crossword_min_words()` = 5, pinned equal to `CROSSWORD_MIN_WORDS` by a test);
3. re-validate the stored grid in SQL: letters agree where words share a cell, every run of two or more cells is exactly a stored word, numbering equals reading order, trimmed to the bounding box, size within 15 x 15 (`CROSSWORD_INVALID_GRID`);
4. require every classroom to be in the actor's school, live (not archived) and manageable by the actor (`CROSSWORD_CLASSROOM_INVALID` / `CROSSWORD_CLASSROOM_ARCHIVED`);
5. supersede the lineage's currently published version if there is one (archive it, close its open assignments, audit `crossword.archived` with reason `superseded`); set `published`, `published_at`, create one `open` assignment per classroom, write the audit row (counts and ids, no text). The result lists the classrooms that lost the old version so the screen can pre-select them;
6. any failure rolls everything back and leaves a draft.

### 4.3b Assign to additional classrooms (Q6)

`fn_add_crossword_assignments(p_puzzle_id, p_actor_id, p_school_id, p_classroom_ids, p_opens_at, p_closes_at)`: the puzzle must be `published` (`CROSSWORD_NOT_PUBLISHED`); the same classroom checks as publish; a classroom that already has an assignment, open or closed, is refused (`CROSSWORD_ALREADY_ASSIGNED`, reopening is a separate decision); audit `crossword.assigned`. The puzzle itself is untouched.

### 4.4 Save function

`fn_save_crossword(...)` creates a draft and its words in one transaction (same checks as publish steps 3, plus length bounds and the single flag), recomputes the placement hash from the stored words and compares it with the ticket's hash. Save enforces the same minimum of 5 words (`CROSSWORD_WORD_COUNT`), so fewer never becomes a draft. Re-saving an existing **version-1** draft (`p_puzzle_id`) replaces its words and settings in place; the SQL validator below runs on every save and every publish.

### 4.5 RLS, ownership, retention

- Teachers (authenticated) can select puzzles and words they manage: owner, or owner / co-teacher of any classroom the puzzle is assigned to, or of the source set's classroom. Students and anon: no policy. All writes go through the service role and the functions.
- `owner_id ... on delete restrict`: ownership transfer first (P1). Puzzles are archive-only (D5). `docs/pilot/12` §3.4 gains a statement that puzzles are deleted before teachers; the update to `12` is needed before M2-2.4, but this one line is added with 2a because puzzles become teacher-owned data.
- `set_id` is `ON DELETE SET NULL`: a puzzle is self-contained and survives changes to its set (the answers and clues are copies).

### 4.6 Versioning (lineage)

`crossword_puzzles` carries `root_id` (the id of version 1; version 1 points to itself, filled by a trigger), `version` and `supersedes_id` (the version this one was copied from; NULL only for version 1).

- `UNIQUE (root_id, version)`; at most **one draft** and at most **one published** version per lineage (partial unique indexes); a version has at most one **live** successor (`UNIQUE (supersedes_id) WHERE status <> 'archived'`), so an abandoned (archived) draft does not block a new one.
- `fn_create_crossword_version(source)` copies title, level, settings, stats, seed, hash, size, `set_id`, owner (the lineage keeps its owner), every word with its clue and provenance into a new **draft**. Not copied: status, assignments, `published_at`. Version number = highest in the lineage + 1, so numbers are never reused. Audit `crossword.copied`. Allowed only from a puzzle that was published and that is the latest published version of its lineage (`CROSSWORD_VERSION_SOURCE_INVALID`, `CROSSWORD_VERSION_EXISTS`); a never-published draft is edited in place.
- A new version may change **title and clue wording** only (a different grid is a new puzzle).
- Publishing the new version archives the previous published one and closes its assignments; the new version gets its own assignments. This replaces the single `copied_from` column of the first draft of this plan.
- Student progress would not carry over (no attempts exist before M2-2.4; the rule is recorded for that phase).

### 4.7 Archive and restore

`fn_set_crossword_archived(puzzle, actor, school, archive)`. Archiving a draft or a published puzzle closes its open assignments. **Restore:** only a puzzle that was never published (`published_at IS NULL`) goes back to `draft` (`CROSSWORD_VERSION_EXISTS` if the lineage already has a draft); a puzzle that was ever published cannot be restored (`CROSSWORD_RESTORE_NOT_ALLOWED`) and is continued by `fn_create_crossword_version`. The trigger enforces the same rule against direct SQL. This replaces the `archived_from` column considered earlier: with the rule above the previous state of a restorable puzzle is always `draft`.

### 4.8 SQL validator (`fn_crossword_validate_words`)

The SQL twin of `validatePuzzle`, run by save and publish. Input: rows, cols and the words (`number`, `direction`, `row`, `col`, `answer`); returns NULL or the first failing code, checked in this order:

| Code | Check |
|---|---|
| `CROSSWORD_EMPTY` | no words, or no multi-cell word |
| `CROSSWORD_BAD_WORD` | direction, characters (`^[가-힣A-Z0-9]+$`), length 1–15, row/col/number |
| `CROSSWORD_DUPLICATE` | an answer or a (row, col, direction) used twice |
| `CROSSWORD_OUT_OF_BOUNDS` | a cell outside rows x cols |
| `CROSSWORD_LETTER_CONFLICT` | two words disagree on a shared cell |
| `CROSSWORD_UNINTENDED_RUN` / `CROSSWORD_MISSING_RUN` | every run of 2+ cells in a row or column (islands of consecutive filled cells) must be exactly a stored multi-cell word, and every stored word a complete run |
| `CROSSWORD_SINGLE_INVALID` | a one-character word must sit on a multi-cell word with the same letter, in the direction that word does not use |
| `CROSSWORD_DISCONNECTED` | multi-cell words linked through shared cells (recursive query) |
| `CROSSWORD_NOT_TRIMMED` | the words span exactly rows x cols |
| `CROSSWORD_BAD_NUMBERING` | numbers follow the reading order of the distinct start cells; words starting in one cell share the number |

The placement hash is recomputed by `fn_crossword_placement_hash`, byte-identical to `canonicalPuzzleText` (pinned by a golden value in the pgTAP file). It is checked **at save only**: after publish `source_entry_id` can become NULL, so the stored hash is the record.

### 4.9 Error codes

P0001 messages the service maps to Korean text: `CROSSWORD_FORBIDDEN`, `_NOT_FOUND`, `_NOT_DRAFT`, `_NOT_PUBLISHED`, `_PUBLISHED_IMMUTABLE`, `_VERSION_EXISTS`, `_VERSION_SOURCE_INVALID`, `_RESTORE_NOT_ALLOWED`, `_RESAVE_NOT_ALLOWED`, `_ALREADY_ARCHIVED`, `_NOT_ARCHIVED`, `_CLASSROOM_INVALID`, `_CLASSROOM_ARCHIVED`, `_ALREADY_ASSIGNED`, `_ASSIGNMENT_NOT_OPEN`, `_WINDOW_INVALID`, `_TOO_FEW_WORDS`, `_WORD_COUNT`, `_TICKET_INVALID`, `_HASH_MISMATCH`, `_SET_NOT_FOUND`, `_SET_ARCHIVED`, `_TITLE_INVALID`, `_CLUE_INVALID`, `_WORD_NOT_FOUND`, `_CLEANUP_GRACE_INVALID`, and the validator codes of §4.8.

## 5. Services and actions (step 2c)

### 5.1 Files

| File | Purpose |
|---|---|
| `src/features/crossword/access.ts` | `getCrosswordForActor`, `requireManageableCrossword`, `canManageCrossword` (same rule as `sets/access.ts`: owner, classroom owner, co-teachers, admin; archived classroom read-only; malformed id is "not found") |
| `src/features/crossword/messages.ts` | one catalogue of Korean messages and codes (`CrosswordError`, `CrosswordErrorCode`, `mapDatabaseErrorCode`) |
| `src/features/crossword/review/tickets.ts` | create and consume preview tickets (token hash only, placement hash, expiry, cap on live tickets) |
| `src/features/crossword/review/service.ts` | `generatePreview`, `saveDraft`, `updateDraft` (title, clue wording), `publishPuzzle`, `createVersion`, `assignMore`, `archivePuzzle`, `unarchivePuzzle`, `closeAssignment`, `listPuzzles`, `getPuzzleDetail` |
| `src/features/crossword/review/actions.ts` | `"use server"` actions (below) |
| `src/features/crossword/readiness.ts` | the readiness score (step 2b, pure) |

### 5.2 Actions

| Action | Does |
|---|---|
| `generateCrosswordAction` | Authorise; load the set's live entries (same access check as the set); run the generator with the teacher's options and a server-chosen seed; return the puzzle (with the solution; this is the teacher), warnings, unplaced words with reasons, statistics, readiness of the result, and a **preview ticket**. Writes nothing but the ticket. If fewer than 5 words are placed, returns the failure with the reasons and no ticket (C2) |
| `saveCrosswordDraftAction` | Takes options, seed and ticket. **Regenerates from the set's current entries with the same seed**, compares the placement hash with the ticket, then calls `fn_save_crossword`. A changed set gives "미리보기 이후 세트가 바뀌었습니다. 다시 생성해 주세요." Nothing is trusted from the browser but seed and options |
| `updateCrosswordDraftAction` | Draft only: title and the wording of individual clues (1-200 characters, plain text, the same cleaning as content text). Not words, positions or answers |
| `publishCrosswordAction` | Classrooms, optional open and close times, confirmation; calls `fn_publish_crossword` |
| `createCrosswordVersionAction` | From a published puzzle: new draft with the same words, positions, clues and settings, next `version`, `supersedes_id` set. The only way to "change" a published puzzle |
| `addCrosswordAssignmentsAction` | Assign a published puzzle to further classrooms (`fn_add_crossword_assignments`) |
| `archiveCrosswordAction`, `unarchiveCrosswordAction`, `closeCrosswordAssignmentAction` | State changes allowed on published puzzles |

### 5.3 Unlimited regenerate (C3) without abuse

- Regenerate is a *new* `generateCrosswordAction` call with a new server-chosen seed (random 32-bit from `crypto`); the seed is shown in an "advanced" line so a teacher can come back to a puzzle they liked, and can type a seed.
- Cost per call is bounded by the generator (150 attempts, 800 ms time budget, `truncated` reported). No per-teacher count limit.
- Tickets: at most 10 live tickets per teacher (the oldest are expired), tickets expire after 15 minutes, stale ones are deleted by `fn_cleanup_crossword_tickets()` on every generate, exactly like the CSV import tickets.
- A ticket is single-use for saving; regenerating does not consume it.

### 5.4 Audit

`crossword.created` (draft saved: `{ setId, wordCount, level }`), `crossword.updated` (`{ fields: ["title"] | ["clue"] }`, no text), `crossword.published` (`{ classroomIds, wordCount }`), `crossword.copied`, `crossword.archived`, `crossword.unarchived`, `crossword.assignment_closed`. Never a term, answer or clue.

## 6. Crossword readiness score (C5, step 2b)

`computeReadiness(entries, options?)` in `src/features/crossword/readiness.ts`, pure and deterministic.

### 6.1 Inputs and measures

Run on the set's live entries with the default puzzle options (grid 15, scripts all, one-character words allowed):

| Measure | How |
|---|---|
| `eligible` (E) | multi-cell words that pass the generator's eligibility filter |
| `singles` | eligible one-character words |
| `excluded` | entries left out, grouped by reason (invalid characters, too long, duplicate...) |
| `largestGroup` (L) | size of the largest group of words connected through shared characters (graph over eligible words) |
| `isolated` | words that share a character with no other eligible word |
| `probePlaced` (P) | multi-cell words the generator places in a fixed probe: seed 0, 30 attempts, minimum words 1 (about 60 ms) |
| `clueLeaks` | entries whose clue contains the answer (2+ characters) |

### 6.2 Score and verdict

```
score = round(100 * ( 0.50 * min(1, P / 12)
                    + 0.25 * (L / E)
                    + 0.25 * min(1, E / 12) ))
verdict:  P < 5 (C2)           -> "만들기 어려움"  (not ready)
          score >= 70          -> "준비됨"
          otherwise            -> "보완 필요"
```

The weights are a starting point for the PM (§11). P dominates because it is what a teacher actually gets. The gate `P < 5` is hard: the same rule as C2, so a set that is "not ready" is exactly a set the generator would refuse.

Measured with a probe on four word lists (illustrative, not final):

| List | E | L | P | Score | Verdict |
|---|---|---|---|---|---|
| everyday words that chain (사과, 과일, 일기...) | 25 | 25 | 17 | 100 | 준비됨 |
| science list | 20 | 20 | 13 | 100 | 준비됨 |
| civics list (민주주의, 삼권분립, 헌법...) | 20 | 6 | 4 | 49 | 만들기 어려움 |
| three words | 3 | 3 | 3 | 44 | 만들기 어려움 |

### 6.3 Advice that comes with the score

Korean messages, each tied to a measure, for example: "다른 단어와 겹치는 글자가 없는 단어가 N개 있습니다: …" (isolated words, listed); "서로 이어지는 단어가 가장 많은 묶음이 L개뿐입니다. 같은 글자가 들어간 단어를 더 추가해 보세요." ; "N개 단어는 정답으로 쓸 수 없습니다 (이모지·기호 등)" ; "뜻에 정답이 그대로 들어 있는 단어가 N개 있습니다 (퍼즐에서는 ○로 가려집니다)". Never shows answers to anyone but the teacher (this is the teacher area).

### 6.4 Where it appears

On the set detail page (a "낱말 퍼즐 준비도" panel, computed on request or on page load; 60 ms), on the new-puzzle screen before generating, and for a generated draft as the *puzzle* readiness (placed words, crossings, quality from the generator's own score). The panel never blocks: a teacher may still try to generate from a "not ready" set and will see the refusal with reasons.

## 7. Screens (step 2d)

All under the existing teacher area guard (`requireTeacherAreaPage`).

| Route | Content |
|---|---|
| `/teacher/crosswords` | list with filters 초안 / 배포됨 / 보관됨; per row title, set, level, words, classrooms, status; button "새 퍼즐" |
| `/teacher/crosswords/new?setId=` | choose the set; readiness panel; level preset and options (grid size, word range, scripts, clue masking); word table with include / exclude / pin and the reason for each unusable entry; **생성** |
| generate result (same page) | grid with solution, Across and Down clue lists, warnings, unplaced words with reasons, statistics, difficulty figure, seed; buttons **다시 생성** (unlimited), **초안으로 저장** |
| `/teacher/crosswords/[id]` | draft: title and clue editing, publish; published or archived: read-only view with the badge "배포됨 - 수정할 수 없습니다", **새 버전 만들기**, close assignment, archive |
| publish dialog | classrooms the teacher manages (not archived), optional open and close times, a confirmation that the puzzle can no longer change |

Components (client where needed): `crossword-readiness-panel`, `crossword-generate-form`, `crossword-grid-view` (read-only preview, solution toggle for teachers), `crossword-clue-lists`, `crossword-draft-editor`, `crossword-publish-dialog`, `crossword-list`. The limits and presets reach the form as props from `generator/constants.ts`, as in M2-1.

## 8. Test strategy

| Layer | Tests |
|---|---|
| Readiness (pure) | measures on fixed lists (graph groups, isolated words, probe results), the verdict gate at P = 4 / 5, score range and monotonicity (more connected words never lowers it), determinism, excluded-reason counts, advice texts pinned |
| pgTAP (2a) | immutability triggers (every column, insert/update/delete of words, title, status transitions), cascade behaviour, `fn_publish_crossword` (fewer than 5 words refused, bad grid refused, archived or foreign classroom refused, success creates assignments, supersedes the previous version), `fn_save_crossword` (inconsistent crossing, extra run, hash mismatch, fewer than 5 words, re-save), versioning (lineage indexes, version numbers never reused, abandoned draft, restore rule), `fn_add_crossword_assignments`, the SQL validator, the golden placement hash, RLS (student token sees nothing, outsider nothing, co-teacher and classroom owner can read), ownership restrict, set deletion keeps puzzles |
| Flow, local stack (2c) | generate -> ticket -> save (set changed in between -> refused) -> edit clue -> publish -> try to edit (database refuses) -> copy as draft -> archive/restore; unlimited regenerate (50 calls), ticket cap, 5-word refusal with reasons; permission matrix (owner, classroom owner, co-teacher, admin, outsider, student); audit rows contain no text |
| Generator | unchanged; re-run as part of the suite |
| Browser (2e) | generate and regenerate, readiness panel for a good and a poor set, save, publish, immutability message, copy, archive, read-only views |
| Gates per step | `db reset`, `test db`, `db types` no diff, `test:access`, typecheck, lint, build |

## 9. Risks and open technical points

| Risk | Handling |
|---|---|
| Triggers make the end-of-pilot deletion fail | pgTAP pins that deleting whole puzzles works; the runbook line is added with 2a |
| Regenerate is CPU on the web host | time budget 800 ms, attempts 150, `truncated` flag; measure on the host before 2d ships |
| A generated puzzle differs between preview and save | determinism plus the placement-hash check; the set changing in between is reported, not silently ignored |
| Readiness probe disagrees with the later generation | the probe uses fixed settings and says so; it is advice, and the generate screen shows the true result |
| Teachers expect a "not ready" set to be fixable by the tool | the advice names the words and the missing overlap; the set editing screens already exist |
| Naming confusion of decision labels | relabel doc 04's list (§2) in the first commit |

## 10. Definition of done for M2-2.2

1. A teacher can: see readiness for a set, generate and regenerate without limit, review the solution, save a draft, correct clues, publish to classrooms, copy a published puzzle to a new draft, archive and restore, close an assignment.
2. Fewer than 5 placed words never produces a draft or a published puzzle (generator, save function and publish function all enforce it).
3. A published puzzle cannot be changed by any path: application, direct SQL through the service role, or a function; pgTAP proves it.
4. No student can read any puzzle table; no answer leaves the teacher area; audit rows hold no text.
5. All gates green on the local stack; browser check recorded.

## 11. Open questions for the PM

| # | Question | Recommendation |
|---|---|---|
| Q1 | Relabel doc 04's decision list as CW-1...CW-14 so that C2-C5 mean only what the PM decided | Yes (documentation only) |
| Q2 | Readiness weights and labels (§6.2): `0.50 P/12 + 0.25 L/E + 0.25 E/12`, "준비됨" from 70 | Accept as the starting point; revisit with real sets |
| Q3 | "만들기 어려움" is a hard gate (P below 5) but the teacher may still press generate and see the reasons | Yes, never block the button |
| Q4 | Publishing in M2-2.2 already requires choosing classrooms, although students cannot see puzzles until M2-2.4 | Yes: it keeps the immutability and assignment rules testable now |
| Q5 | Immutable means the title too; "copy to new draft" is the only edit path | Yes |
| Q6 | A published puzzle may be assigned to further classrooms later (new assignments, same frozen puzzle) | Yes; assignments are separate rows and not part of the frozen content |
| Q7 | Unlimited regenerate with the 10-ticket cap and the time budget (no per-teacher count) | Yes |
| Q8 | The line "puzzles are deleted before teachers" added to `docs/pilot/12` §3.4 with step 2a, ahead of the full governance update for student attempts | Yes |
| Q9 | Whether the seed is shown to teachers ("advanced") so a liked puzzle can be found again | Yes |

## 12. Recommended order and first step

Start with **M2-2.2a** (migrations 22-24 and the pgTAP file for immutability and publish rules) together with **M2-2.2b** (readiness, pure) in parallel: they touch different files, and the database rules are the part most worth proving early. Wait for the answers to Q1-Q9 (most can be "yes, as recommended") before cutting the branch.
