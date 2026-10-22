# 19. M2-2 Puzzle generation: design of record

Status: **DESIGN OF RECORD (as built), draft for PM review. 2026-10-21.** Documents only: no code, DB, migration or flag change. This document does **not replace** [04](04-crossword-generator.md) (the generator design of 2026-10-17), [05](05-m2-2-2-teacher-review-plan.md) (teacher review and publishing plan), [07](07-m2-2-4-student-play-plan.md) and [08](08-m2-2-4a-student-play-foundation-plan.md) (student play). It gathers what those documents decided and what the code and migrations actually do today into one place, in the eight parts requested, and marks every point where the build differs from the plan. Facts come from `src/features/crossword/`, the migrations `20261018000001` to `20261021000001` and the tests; anything I could not confirm is marked "not verified".

Parts: 1 Requirements · 2 Algorithm candidates · 3 Teacher review flow · 4 Publishing flow · 5 Failure handling · 6 Data model impact · 7 Student Play link · 8 Validation plan · 9 Deviations from the plans · 10 Open points and decisions.

## 1. Requirements

### 1.1 Purpose and scope

From the live entries of one **word set**, generate a **free-form crossword**; a teacher reviews and publishes it to classrooms; students play it. Out of scope (doc 04): AI-generated words or clues, other game types, PDF printing, rankings across schools, anything beyond the single-school pilot, hand-editing of grids, jamo-level play.

### 1.2 Functional requirements (decided, with their source)

| # | Requirement | Source | State |
|---|---|---|---|
| R1 | A puzzle has at least **5 multi-cell words** and at most 25 (plus up to 5 one-cell words); fewer is "no puzzle" | PM C2 (doc 05 §2) | built (generator, save and publish enforce it) |
| R2 | **One-character answers are allowed** as one-cell words that sit on a cell of another word | PM C1 | built |
| R3 | Scripts: Hangul syllables, Latin capitals, digits, mixed; emoji and symbols are rejected by the generator itself | PM C7 | built |
| R4 | The result is **deterministic** for the same entries, options, seed and generator version | doc 04 §2.8 | built (integer PRNG, no `Math.random`) |
| R5 | **Unlimited regeneration**, no durable state per attempt | PM C3 | built (preview tickets, 10 live per teacher, 15 minutes) |
| R6 | After publish a puzzle is **immutable** (grid, words, answers, clues, settings, title); changes mean a new version | PM C4 | built, also enforced by database triggers |
| R7 | A **readiness score** (0 to 100, verdict) for a word set before generating | PM C5 | built (`readiness.ts`) |
| R8 | Three difficulty **presets** (easy, normal, hard) with teacher-adjustable options | doc 04 §3.1 as changed by PM decisions SP-1 and SP-2 | built; limits per puzzle in `settings.play`, no teacher override screen (m2/10) |
| R9 | A puzzle stores its **own copy** of answers and clues; deleting or changing the set never changes it | doc 04 §0 | built |
| R10 | Answers never reach a student's browser; checking, reveals and 초성 are server-side | doc 04 §5.3, doc 07 | built |
| R11 | Clues that contain the answer are **masked** in the puzzle copy and listed for the teacher | doc 04 §3.3 | built |
| R12 | Publishing to several classrooms; each classroom has its own attempts | doc 04 C9 | built |

### 1.3 Quality properties every puzzle must have (checked by an independent validator and again in SQL)

P1 every word at least 2 cells and inside the grid (one-cell words excepted) · P2 connected · P3 same character where words cross · P4 no unintended words (every maximal run of 2 or more cells is exactly a placed word) · P5 same-direction words never touch end to end or side by side · P6 no answer twice · P7 bounding box within the chosen size, at most 15 × 15 · P8 deterministic.

### 1.4 Non-functional requirements

| Area | Requirement | State |
|---|---|---|
| Time | one generation within the host's request limit. **As built, no wall-clock budget is applied:** the generator supports `timeBudgetMs` (best result so far, `truncated` reported) and the constant `CROSSWORD_TIME_BUDGET_MS` = 800 exists, but the review service passes no budget **on purpose** (`buildOptions`: the number of attempts alone decides the result, so the regeneration at save time gives exactly the puzzle that was previewed). A request is bounded by the attempt count (default 150, maximum 300), not by time | built as stated; the time bound is unmeasured on the target host |
| Privacy | puzzle content is teacher content; no personal data in answers or clues (teacher is told on the draft page) | built, `pilot/12` |
| Access | owner, classroom owner, co-teachers and admin manage content alike (D3) | built |
| Audit | teacher actions are audited with ids and counts, never text | built |
| Accessibility and mobile | teacher screens checked at 360 and 400 px with axe | built (doc 05 §13) |
| Language | Korean UI texts | built |

### 1.5 What teachers must be told

Why a set cannot make a puzzle (which words were excluded and why, which could not be placed and why), what to change, and what a masked clue looked like (doc 04 §3.3, §3.4).

## 2. Algorithm candidates

### 2.1 Comparison

Only **A** is built. **B** was used as a measuring tool in M2-2.1 (doc 04 §9: an exhaustive search confirmed that a 20-word civics list can place at most 4 words). **C to G** are analysed here, not built.

| Candidate | How it works | Determinism | Quality | Time on 5 to 25 words | Complexity and risk | Fit with Korean syllable crossings | Verdict |
|---|---|---|---|---|---|---|---|
| **A. Seeded greedy placement with restarts** (built) | place the longest word, add words at legal crossings by a placement score, repeat from scratch up to 150 to 300 times, keep the best | yes (integer PRNG, stable sorting) | good for class vocabulary; compactness and word count are the tie-breakers | doc 04 estimated well under 500 ms for 25 words (not re-measured on the host; no time budget is applied, see §1.4) | low: about 1300 lines in `generator/`, easy to test with properties | crossings by identical syllable; works as designed, quality depends on shared syllables, not on the algorithm | **chosen** |
| B. Exhaustive or backtracking search | try every legal placement order | yes | optimal count of placed words | exponential; usable only offline for tiny sets | medium; not for requests | same | used to confirm limits of small lists (measurement), not in the product |
| C. Constraint solving (CP/SAT) | model cells, words and crossings as constraints | yes (solver-dependent) | optimal for a chosen objective | fast for small models but a new dependency | high: solver dependency, harder to explain and test; doc 04 judged the gain small because a teacher can regenerate | same | rejected (doc 04 §2.1) |
| D. Local search / annealing on top of A | start from A's result, move or swap words to improve compactness or crossings | only with a seeded random source and fixed step counts | better compactness | extra budget (tens to hundreds of ms) | medium: more states to validate, determinism needs discipline | same | **future option** if teachers find puzzles too sparse; needs a quality benchmark first (§8) |
| E. Dense grid fill with a dictionary | start from a symmetric template and fill all cells | yes | newspaper-style dense grids | slow, needs a large Korean dictionary we do not have | high; a 8 to 25 word class list can never fill such a grid | poor (many 받침 constraints) | rejected (doc 04 §1.1) |
| F. Hybrid: A plus a single improvement pass (compaction, trimming empty rows and columns, choosing the best of N restarts by a richer score) | A, then a deterministic post-pass | yes | modest gain | negligible | low to medium | same | **possible low-risk improvement**, only after measuring |
| G. AI-assisted words or clues | a model proposes words or clues | no | varies | network latency, cost | high: privacy, reliability, wording review | n/a | **out of scope** (doc 04 §0) |

### 2.2 Why A stays

It is simple, deterministic, testable and fast, and the real limit is the vocabulary (shared syllables), not the placement: the same exhaustive check showed no algorithm places more than 4 words from the civics list. The product answer to a poor set is the readiness score and the advice, not a stronger solver (R7). The determinism of A is what makes the preview-then-save ticket safe (§3).

### 2.3 The built algorithm in one paragraph

Eligibility filter (empty, invalid characters, script off, too short, too long, duplicate, excluded by the teacher, each with a reason) → selection when there are more words than the preset allows (pinned first, then connectivity score, then seed) → restarts of the greedy placement on a working board of 2 × grid size + 1 → each candidate must be legal (bounds, same letters, not collinear, clear ends and sides, a real crossing) → placement score favours crossings and compactness → the best puzzle of the restarts wins (more words, more crossings, smaller area, aspect ratio, lower seed) → trim to the bounding box → number in reading order → optional clue masking. One-cell words are added last onto a cell with the same character used by one word only.

Constants (`generator/constants.ts`): minimum words 5, maximum words 25, one-cell words up to 5, word length 1 to 15, grid 5 to 15 (presets 10, 13 and 15), default 150 and maximum 300 attempts, `CROSSWORD_TIME_BUDGET_MS` 800 (defined but **not applied** by the review service, see §1.4), `GENERATOR_VERSION` 1 (part of the placement hash).

## 3. Teacher review flow (as built)

| Step | What happens | Where |
|---|---|---|
| 1. Look at the set | The new-puzzle screen shows the **readiness** panel for the chosen set (doc 05 §6.4 also named the set detail page; in the code I read the panel is used on the new-puzzle page only): score, verdict (준비됨, 보완 필요, 만들기 어려움), and advice (isolated words, small connected group, excluded words, clues that contain the answer). The fixed probe makes it deterministic and takes about 60 ms | `readiness.ts`, `/teacher/crosswords/new` |
| 2. New puzzle | Choose the set, a preset (easy, normal, hard) and adjust options; include, exclude or pin words; optional seed | `/teacher/crosswords/new` |
| 3. Generate | The server generates with a server-chosen seed and returns a **preview** with a single-use **ticket** (hash of entries, options, seed, generator version, placement). Nothing is stored except the short-lived ticket | `generateCrosswordAction` |
| 4. Review the preview | The grid **with the solution** (teacher only), clue lists, warnings (masked clues, weakly connected words, words not placed or excluded with their reasons), statistics and a descriptive difficulty (never shown to students). Regenerate as often as wanted | review panel |
| 5. Save as draft | The server **regenerates** from the set's current entries and the same seed and compares the placement hash with the ticket. Equal: the draft and its words are stored in one transaction, validated in SQL. Different: "미리보기 이후 세트가 바뀌었습니다. 다시 생성해 주세요." | `saveCrosswordDraftAction`, `fn_save_crossword` |
| 6. Edit the draft | Title and the **clue text** of each word (the puzzle's copy only); a version-1 draft can be re-saved with a new ticket (a different grid); the editor warns about unsaved edits and tells the teacher not to write student names or numbers | `updateCrosswordDraftAction`, `fn_update_crossword_draft` |
| 7. Publish | See §4 | |
| 8. Later | Add classrooms, close an assignment, copy to a new version, archive; never edit the published puzzle | |

**Not built although planned in doc 04 §4.2:** the "preview as a student" screen (the only previews in the teacher screens are the board preview of a generated puzzle in `crossword-grid-view` and the generate form; I found no student-view screen; not verified beyond a code search) and the teacher results screen (M2-2.5; TV-1 now covers progress counts only). Hand-editing of the grid is deliberately not allowed.

Who may do what: the set owner, the classroom's owner and co-teachers, and admins, as for word sets. Publishing to an archived classroom is refused.

## 4. Publishing flow (as built)

`fn_publish_crossword(puzzle, actor, school, classrooms[], opens_at, closes_at)`, one transaction:

1. lock the puzzle; it must be `draft`; the actor must be allowed to manage it;
2. at least 5 multi-cell words from the stored rows (`CROSSWORD_TOO_FEW_WORDS`), the number pinned equal to the application constant by a test;
3. the stored grid is re-validated in SQL (letters, runs, numbering, trimmed box, size);
4. each classroom must be in the actor's school, live and manageable by the actor;
5. if the lineage already has a published version it is **superseded**: archived, its open assignments closed (audited with reason `superseded`);
6. the puzzle becomes `published` (`published_at`), one `open` assignment per classroom is created (with the optional opening and closing times), one audit row without text is written;
7. any failure rolls everything back and the puzzle stays a draft.

After publishing: `fn_add_crossword_assignments` (more classrooms; a classroom that already has an assignment is refused), `fn_close_crossword_assignment` (a closed assignment cannot be reopened), `fn_create_crossword_version` (a copy as a new draft that may change title and clue wording only), `fn_set_crossword_archived` (a never-published puzzle can be restored to draft; a published one cannot). Published rows are protected by triggers (`CROSSWORD_PUBLISHED_IMMUTABLE`).

Publishing creates **assignments only**: students see them only when Student Play is switched on (`CROSSWORD_PLAY_ENABLED`, off on hosted) and only in classrooms they are actively enrolled in. Operating rule in force: no puzzle is published on the hosted project until the PM lifts the rule (F-1 is Conditional GO; the rule is not lifted by that).

## 5. Failure handling

### 5.1 By stage

| Stage | Failure | What the code does | What the teacher sees |
|---|---|---|---|
| Input | an entry cannot be a cell string (empty, invalid characters, script off, too short or long, duplicate, excluded) | the entry is **excluded with a reason**, never fatal | a list of excluded words with the reason |
| Selection and placement | a word shares no character, has no legal position or no matching cell (one-cell words) | the word is **unplaced** with a reason (`NOT_SELECTED`, `NO_CROSSING`, `NO_LEGAL_POSITION`, `NO_MATCHING_CELL`), generation goes on | the list of unplaced words with reasons and advice |
| Result size | no eligible words (`NO_ELIGIBLE_WORDS`) or fewer than 5 placed multi-cell words (`NOT_ENOUGH_WORDS`) | **no puzzle**; nothing is stored | the reasons and the advice of the readiness panel |
| Time | no wall-clock budget is applied by the service (by design, to keep preview and save identical); the generator can truncate only if a caller passes `timeBudgetMs` | the attempt count is the only bound | nothing; a slow host would show as a slow request, not as a different puzzle |
| Options | an option value the generator cannot honour (a programming error) | throws `RangeError`; word lists never throw | a generic error; the form validates beforehand |
| Ticket | missing, expired (15 minutes), used, or more than 10 live tickets | `TICKET_INVALID`; the oldest tickets are expired; stale ones deleted on every generate | "generate again"; the save button turns off when the ticket expires |
| Save | the set changed after the preview, or the generator version changed | `HASH_MISMATCH` mapped to `SET_CHANGED` | "미리보기 이후 세트가 바뀌었습니다. 다시 생성해 주세요." Nothing is trusted from the browser except seed and options |
| Save | the grid fails the SQL validator (conflict, unintended run, disconnected, not trimmed, numbering, one-cell word misplaced) | `INVALID_GRID` family; transaction rolled back | an error message; the draft is not created |
| Save or publish | fewer than 5 words | `WORD_COUNT` or `TOO_FEW_WORDS` | message; nothing changes |
| Publish | classroom invalid or archived, not a draft, window invalid | `CLASSROOM_INVALID`, `CLASSROOM_ARCHIVED`, `NOT_DRAFT`, `WINDOW_INVALID`; **everything rolled back, the draft stays a draft** | message naming the cause; the publish button says what is missing |
| After publish | an edit of a published puzzle (application bug or direct SQL) | blocked by the immutability triggers (`PUBLISHED_IMMUTABLE`) | not reachable from the screens |
| Versions | a second draft or a version from a wrong source | `VERSION_EXISTS`, `VERSION_SOURCE_INVALID`, `RESTORE_NOT_ALLOWED`, `RESAVE_NOT_ALLOWED` | message |
| Permissions | not allowed, or not visible | `FORBIDDEN`, `NOT_FOUND` (existence is not leaked) | "not found" |
| Persistence or network | an unexpected database error, a rejected request | `PERSIST_FAILED` or a normal error message; the form stays usable (doc 05 §13) | a message and a retry |

All error codes are one catalogue (`messages.ts`), raised by the database as `CROSSWORD_<CODE>` and mapped to Korean text; no message contains an answer.

### 5.2 Principles

1. **Never half-saved:** every write is one transaction; a failure leaves the previous state.
2. **Refuse rather than fake:** a set that cannot reach 5 words gets no puzzle (the civics example places 4 at most).
3. **Say why:** each exclusion, unplaced word and refusal carries a reason the teacher can act on.
4. **Do not trust the browser:** save regenerates; publish re-validates in SQL.
5. **Failures that students could notice are prevented earlier:** a student only ever receives a published, validated, immutable puzzle.

### 5.3 Known gaps

| Gap | Note |
|---|---|
| Behaviour on a slow serverless host is not measured, and **no time valve is active** (150 attempts is the only bound; doc 04 estimated well under 500 ms for 25 words, not re-measured on the host) | measure on the target deployment once it is connected to the database (§8); decide whether a deterministic cost cap (fewer attempts) is needed instead of a time valve |
| No teacher-facing indicator of puzzle quality beyond the descriptive difficulty and the warnings | see §8 on a quality benchmark |
| The "preview as a student" screen is missing | the only way to see the student view before publishing is a test classroom |

## 6. Data model impact

**Teacher content (M2-2.2), no personal data** (migrations `20261018000001` to `3`):

| Object | Role |
|---|---|
| `crossword_puzzles` | one row per puzzle version: title, level, `settings` (options and `play` limits), `stats`, seed, generator version, placement hash, rows and cols, status, lineage (`root_id`, `version`, `supersedes_id`), owner (`ON DELETE RESTRICT`), `set_id` (`ON DELETE SET NULL`: provenance only) |
| `crossword_words` | the puzzle's own copy of answer and clue, position, number, direction, generated `length` and `single`, `source_entry_id` (provenance, `SET NULL`) |
| `crossword_assignments` | a puzzle in a classroom: `open` or `closed`, optional opening and closing times, unique per puzzle and classroom |
| `crossword_preview_tickets` | hash and counts only, 15 minutes |
| functions | `fn_save_crossword`, `fn_update_crossword_draft`, `fn_create_crossword_version`, `fn_publish_crossword`, `fn_add_crossword_assignments`, `fn_close_crossword_assignment`, `fn_set_crossword_archived`, `fn_cleanup_crossword_tickets`, the SQL validator and the placement-hash helper, the read view `v_crossword_puzzles_summary` |
| triggers | immutability of published puzzles and words |
| RLS | teachers can select what they manage; **students and anonymous have no policy at all** |
| audit | resource `crossword`; actions created, updated, published, assigned, copied, archived, unarchived, assignment closed |

**Student data (M2-2.4, after the governance review)** (migrations `20261019000001` to `4`): `crossword_attempts` (state and counters, **no student id**), `crossword_attempt_members` (who the attempt belongs to), `crossword_attempt_events` (hint, reveal and submit events with only word number and direction), the play functions `fn_crossword_play_*`, and the cleanup trigger that removes an attempt with its last member. Governance: `pilot/14` and the `pilot/12` revision draft.

**Read-only teacher progress (TV-1)** (migration `20261021000001`): one function, no table. Local only; not applied to hosted.

Effects on existing data: none of the M1 or M2-1 tables is altered apart from the audit enums. Deletion order for the end-of-pilot run: students, classrooms, puzzles (words, assignments and attempts go with them), sets, then teachers (`pilot/12` §3.4).

## 7. Student Play link

| Topic | How puzzle generation and play meet |
|---|---|
| What the student receives | a payload with an **allow-list** (puzzle title, rows, cols, words with number, direction, position, length, clue and the one-cell flag; the student's own cells; given cells; limits; attempt state). **No answer, ever**; tests search the whole JSON for every answer |
| Cells of a puzzle | `fn_crossword_play_wordcells` expands the stored words into cells; the same function gives the total cells used for progress and checks |
| Pre-filled cells | chosen from the **structure only** (a placeholder puzzle) with the seed and the preset's percent, never completing a word; the equivalence with the real puzzle is tested, so the choice cannot leak a letter |
| Limits | `settings.play` (`prefillPercent`, `revealsPerStudent`, `checksAllowed`, `checkMode`, `chosungAllowed`) are stored with the puzzle at generation from the preset and enforced by the database functions; no teacher override screen yet (m2/10, out of scope) |
| One-cell words | numbered clue `(1)` on a cell of another word; play and IME handling treat them as a word of length 1 |
| Immutability | the puzzle students solve cannot change; a new version supersedes the old one, which closes the old assignments, and students then see the old attempt read-only (progress does not carry over) |
| Closing and archiving | a closed assignment or archived classroom makes the attempt read-only; a late autosave has a 120 s grace |
| Assignment windows | opening and closing times decide whether a student can start or resume |
| Governance and flag | attempts are student data (`pilot/14`); the whole student side is behind `CROSSWORD_PLAY_ENABLED` (screens and, since F-1, the API); off on hosted |
| Teacher visibility | not part of generation; TV-1 adds a read-only progress view, local only |
| One attempt per student and assignment | no restart in M2-2; practice mode and a teacher reset are later items (doc 07 §I, m2/10) |

## 8. Validation plan

### 8.1 What exists (all green on the local stack as of 2026-10-21; suite totals: vitest 773, pgTAP 592)

| Layer | Evidence |
|---|---|
| Generator and numbering (pure) | `crossword-generate`, `crossword-basics` and `crossword-validate` tests (**85 tests**, run on 2026-10-22, matching the PM report): invariants P1 to P7 on many seeds and word lists, determinism and golden values, boundaries of every constant, hard cases (disjoint words, substring words, NFD input, digits, mixed scripts), the worked example, clue masking, difficulty presets, performance budget, purity (no Supabase import) |
| Readiness | `crossword-readiness` (22 cases): measures, score, verdict gate, messages |
| Teacher services and flow | `crossword-review-flow` (26): generate, ticket, save (set changed in between is refused), publish, versions, archive, audit without text; `crossword-review-view-model`, `crossword-messages`, `crossword-hardening` |
| Database | pgTAP `00012` (153 assertions: immutability, RLS, functions, cascades) and the later files for attempts, play and progress |
| Student side | `crossword-play-*` (flow, services, IME controller and traces, save queue, static and UI guards), F-1 gating tests |
| Accessibility and mobile (teacher) | axe 4.10 and contrast script at 360 and 400 px (doc 05 §13) |

### 8.2 Gaps and proposed additions (proposals, not decisions)

| # | Addition | Why | Needs |
|---|---|---|---|
| V1 | **Quality benchmark on real Korean word lists** from the pilot teachers (10 to 20 lists of different subjects and sizes): placed words, crossings, bounding box, time, readiness score, and how often a set is refused | Only four illustrative lists were measured so far; decides whether candidate D or F is worth building | sample lists from teachers (no student data) |
| V2 | **Teacher usability session** (2 or 3 teachers): readiness, generate, review warnings, clue editing, publish to a test classroom, new version | The screens were checked for accessibility and robustness, not for how teachers actually use them | PM and teachers |
| V3 | **End-to-end acceptance on a database-connected deployment**: generate, save, publish (to a `SMOKE` classroom), play on the Galaxy Tab with Chrome, TalkBack | The hosted flow has never been run; part of `m2/09` §9; also gives the real timing of a generation on the host (no time valve is active) | approvals of `m2/18`, lifting the publish rule for the window |
| V4 | **Property test volume check**: confirm the number of seeds and word lists in the invariant tests and raise it in CI if small (I did not inspect the count) | The generator's safety rests on P1 to P7 holding for every output | none |
| V5 | **Regression guard for the generator version**: a golden set of (entries, options, seed) with the expected placement hash, so a change of rules without a `GENERATOR_VERSION` bump fails a test | A silent change would break the preview-then-save ticket for in-flight previews and changes puzzles produced for the same seed | none |
| V6 | **Student-view check before publishing**: either build the planned preview screen or document the test-classroom procedure as the supported way | Reduces the risk that a teacher publishes a puzzle they never saw as a student | PM decision on scope |
| V7 | **Load and time on the target host** with 25 words and the default and the maximum attempts | No time valve is active; the host's request limit has not been measured against the attempt count | V3 |
| V8 | **Clue quality aids**: duplicate clue warning exists; consider a check for clues shorter than N characters or identical to the term | Teachers write the clues; weak clues make puzzles unfair | PM decision; small |

### 8.3 Acceptance criteria proposed for "puzzle generation is done for the pilot"

1. All suites green (generator, review flow, pgTAP, play) on the release candidate.
2. V1 completed with the pilot lists and the result accepted by the PM (a minimum share of typical lists produce a puzzle, the rest get actionable advice).
3. V3 completed on a database-connected deployment with test data and cleaned up.
4. V2 completed with at least two teachers, with the blocking findings fixed.
5. No hosted puzzle published before the PM lifts the rule.

## 9. Deviations from the plans

| Item | Plan (doc 04 or 05) | As built |
|---|---|---|
| Attempt model | `crossword_attempts` with `student_id` and `unique (assignment_id, student_id)` (doc 04 §6.2) | attempts without a student id, a member table, an event table (shared-attempt compatible, PM 2026-10-17/18) |
| Presets | reveals 3 / 1 / 0, check any time / per word / submit only | reveals 3 / 2 / 1, checks unlimited / 5 / 3, hard allows word checks, no 초성 on hard (PM SP-1, SP-2) |
| Student payload | `prefilled` and `settings` fields | allow-listed payload with `cells`, `given`, `limits` and a version field; `given` is computed server-side |
| Minimum grid size | 10, 13, 15 | presets 10, 13 and 15; the generator accepts 5 to 15 |
| Readiness | not in doc 04 | added by PM decision C5 (doc 05 §6) |
| Versioning | a copy link | lineage with `root_id`, `version`, `supersedes_id`, superseding on publish |
| Restore | "archived can be restored" | only never-published puzzles; published ones continue by new version |
| Results screen | M2-2.5 | not built; TV-1 (local) shows progress counts only |
| Student-view preview | planned (doc 04 §4.2) | not built |
| Time budget | doc 04 §2.8 and doc 05 §5.3: 800 ms budget bounds each generation, best result so far | defined but **not applied**: the service sets no budget on purpose, determinism between preview and save is kept by the attempt count (`buildOptions` comment) |
| Doc labels | C1 to C14 in doc 04 | doc 05 §2 **proposed** relabelling them CW-1 to CW-14 to avoid a clash with the PM's C2 to C5; doc 04 §10 still uses the C labels, so the two documents use different labels for the same list |

## 10. Open points and decisions requested

1. **Role of this document:** accept it as the design of record that points to docs 04, 05, 07 and 08, or ask for a shorter index version.
2. **Quality benchmark (V1) and candidate F or D:** decide whether to collect real word lists now; no algorithm change is proposed before that measurement.
3. **Student-view preview (V6):** build it, or make a test-classroom procedure the supported way.
4. **Teacher override of limits** stays out of scope (m2/10); the stored `settings.play` is the source until then.
5. **Hosted:** no puzzle is published on hosted until the PM lifts the rule; V3 and `m2/18` define how a first hosted puzzle would be created and removed.
6. **Generator version policy (V5):** approve a golden-set guard so a rule change always bumps `GENERATOR_VERSION`.

Nothing in this document changes code, the database or a flag.
