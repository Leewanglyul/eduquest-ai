# M2-2.4 Student play: implementation plan

Status: **plan only. Nothing is implemented, no migration is cut, no file under `src/` is touched.** Written 2026-10-17 for PM review. Baseline: `0e781cf` (M2-1, M2-2.1 generator and M2-2.2 teacher review, including hardening, are complete). Sources: [04](04-crossword-generator.md) §5 and §6 (called "doc 04"), [05](05-m2-2-2-teacher-review-plan.md) §13, [06](06-m2-3-competition-framework.md) §11.8 and §12.8 (called "doc 06"), plus a read of the schema, services and tests as they are in the repository today.

Scope: **one student solving one crossword alone.** Out of scope, and not prepared beyond keeping the shape open: teams, shared attempts, competition, leaderboards, badges, collaboration, help requests, focus tracking. Teacher-side code is not modified (the two tests that pin "no attempts table yet" are the only existing files that must change, see §0.3).

Label note: doc 05 §2 proposed relabelling doc 04's decision list as CW-1…CW-14; doc 04 still shows the old C-labels. This plan uses **CW-n** and gives the old label once.

## Student Growth First (PM principle, approved 2026-10-17)

The student experience is ordered:

```
Progress -> Growth -> Achievements -> Collaboration -> Competition
```

Competition is never the primary motivator. M2-2.4 contains no competition, no ranking, no comparison with other students and no timers; it serves the first two priorities (progress and growth) and leaves hooks for the third. Concretely for this phase:

- **Copy and layout** on the list, play and result screens follow the order: first what the student achieved and how far they got, then how they used tools, then what to do next. Nothing shows a score, a grade, a penalty or another student.
- **Hints are tools, not penalties.** The wording is "도구를 활용했어요" (D.3); no number is presented as a deduction.
- **A completion is a moment**, not just a status change (A.5, D.3.1), and always offers a next step.
- **Data kept for growth, not for ranking:** counters, completion, time and word-level hint events (B.2) exist so a later Student Learning Profile ([product note 01](../product/01-student-learning-profile.md)) can show growth against the student's own past. Nothing derived (rank, score) is stored in the attempt.
- Achievements are M2-3.1, collaboration M2-3.2 to 3.4, competition M2-3.5 and later (doc 06 §11.3). The profile is a future feature; its slice and place in the order are a PM decision.

Contents: §0 What the review found · A Student workflow · B Database impact · C Service design · D UI pages · E Open PM decisions · F Future compatibility risks (shared attempt / team mode) · G Test strategy · H Phases · I Future roadmap items.

Mapping of the twelve design items to sections:

| Design item | Section |
|---|---|
| 1 Student puzzle list · 2 Assignment access | A.1–A.2, B.3, C.2 |
| 3 Puzzle play screen · 4 Cell input model | A.3, D.2, C.7 |
| 5 Korean IME handling | C.7 (first-class, gated by the spike H.1) |
| 6 Checks and reveals | C.4 |
| 7 Progress saving | C.5 |
| 8 Completion detection | C.6 |
| 9 Result screen | A.5, D.3 |
| 10 Student security model · 11 RLS and API exposure review | C.8, C.9 |
| Student Growth First principle · completion moment · tool wording · future roadmap | the principle section above, A.5, D.3.1–D.3.2, I |
| 12 Accessibility | D.5 (checked in G.6) |
| 13 Test strategy | G |

---

## 0. What the review found

### 0.1 Already in place (reused, not changed)

- Student auth and guard: `requireStudentAreaPage()` (student role, forced password change done), `students_select_self`, `classroom_enrollments_select_self`, `classrooms_select_enrolled_student` (an archived classroom disappears for students).
- Crossword tables carry **no student policy at all** (`crossword_puzzles`, `crossword_words`, `crossword_assignments`, `crossword_preview_tickets`); every `fn_*` is revoked from `authenticated` and `anon` and granted to `service_role` only; `v_crossword_puzzles_summary` is `security_invoker`, so a student reads zero rows and it carries no answer column. Students therefore cannot read the key through PostgREST today. M2-2.4 must keep this true for every new object (C.9).
- The server uses the service-role client for student data (`createSupabaseAdminClient`), as the M1 student pages do. **Consequence: RLS does not protect the key on the server path; the code does.** That is why the design below makes the *shape of the code* part of the security model (C.8).
- Generator pieces the play side can use as they are: `choosePrefill`, `settingsForLevel`, `DIFFICULTY_PRESETS`, `maskClue` (already applied when the puzzle was saved), `analyseAnswer` and `scriptOfChar` (cell character rules), `lengthOf`.
- `fn_crossword_cells`, `fn_crossword_words_json`, `fn_crossword_validate_words` exist for the SQL side.
- Stored per puzzle: `rows`, `cols`, `seed`, `settings.play = { prefillPercent, revealsPerStudent, checkMode, chosungAllowed }`, one word row per clue with `number, direction, row, col, answer, length, single, clue`.

### 0.2 Gaps found

| # | Finding | Effect on this plan |
|---|---|---|
| G1 | **No 초성 helper exists.** Doc 04 §6.8 lists `chosung.ts` in the generator layout, but the folder has no such file and `index.ts` exports none | Built in M2-2.4 (pure, with tests); placed under `play/`, not in the generator |
| G2 | `choosePrefill(puzzle, percent, seed)` reads only the **lengths** of answers (cell geometry), never their letters | The server can choose the pre-filled cells from a puzzle whose answers are placeholders. **Node never has to load an answer on any student path** (C.8 rule 1). A test pins "real answers and placeholders give identical cells" |
| G3 | Preset field is named `revealsPerStudent` and is stored inside immutable published puzzles | Kept as stored; the payload and the attempt use `revealsAllowed` and counters on the attempt, so a later team pool does not need a rename (doc 06 §12.8) |
| G4 | `/student` is a stub (classrooms only). Middleware (session refresh) matches only `/teacher/*` and `/student/*` | Play API handlers live **under `/student/...`**, otherwise an expired access token would not be refreshed and autosave would fail after an hour. No change to `middleware.ts` |
| G5 | Doc 04 §6.2 draws `crossword_attempts.student_id NOT NULL UNIQUE (assignment_id, student_id)`; doc 05 §13 and doc 06 §11.8 require the owner to be restated before the table exists | Restated in B.2: **the attempt has no student column**; people are in a member table |
| G6 | Open CW-2…CW-5 (presets, feedback, 초성, attempts per student) are "needed for M2-2.4 only" and unanswered | Listed in E with a recommendation each; the plan works with the generator's starting values |
| G7 | Governance (CW-13, old C13): `docs/pilot/12` and `13` have puzzle rows but **no attempt data**; D6 not signed for it | A **go-live gate**, not a build gate (E.1) |

### 0.3 Existing tests that must change on purpose

The M2-2.2 work pins "this table does not exist yet":

- `supabase/tests/00012_crossword_review_publish_versioning.test.sql:79` — `hasnt_table('public','crossword_attempts', …)`
- `tests/access/crossword-hardening.test.ts:90` — `expect(migrations).not.toMatch(/CREATE TABLE public\.crossword_attempts/i)`

Both are replaced in the same commit as the schema migration by assertions about the *new* tables. The sibling test at `crossword-hardening.test.ts:75` (teacher-side code never reads attempts, never mentions `student_id`) stays unchanged and must stay green: **all new student code lives in new files**, and `crossword/messages.ts` (shared with the teacher side) is not edited; the play side gets its own message catalogue.

---

## A. Student workflow

### A.1 Puzzle list (`/student/crosswords`, and a short section on `/student`)

A student sees a puzzle when **all** hold, evaluated by the server on every request (one function, C.2):

1. the student has an `active` enrollment in the assignment's classroom;
2. the classroom is not archived;
3. the assignment is `open`, and `now()` is inside `opens_at`/`closes_at` (a null bound is open-ended);
4. the puzzle is `published` (not archived).

The list shows, per puzzle: title, classroom name, number of words, level, closing time, and a state: **새 퍼즐** (no attempt), **이어하기** (in progress, with "채운 칸 n/N"), **완료** (completed, link to the finished grid), **마감** (closed with an attempt, read-only). Closed and archived items without an attempt are not listed. If the student is in two classrooms with the same puzzle (decision CW-9), two rows appear, each with its own attempt.

`/student` gets one extra block ("풀 수 있는 퍼즐 n개" with a link); the full list is its own page.

### A.2 Opening a puzzle

Route key is the **assignment id**, not the puzzle id and not an attempt id (attempts belong to an assignment; a later team attempt is resolved from the same URL).

1. Guard (`requireStudentAreaPage`), resolve the student id from the session (never from the URL or a form).
2. Access function (C.2). Not enrolled, wrong school, malformed id, or not visible → the same "찾을 수 없습니다" page as a non-existent id (no enumeration). Not open yet / closed / archived are distinguishable only for a student who *could* see the assignment.
3. **Start or resume** (idempotent): first open creates the attempt and its member row, freezes the pre-filled cell keys (A.2a), and returns the play payload. A second tab or device at the same time converges on the same attempt (unique key, `ON CONFLICT`).

A.2a. *Pre-filled cells* are chosen once, at attempt creation, with `choosePrefill(placeholderPuzzle, prefillPercent, puzzle.seed)` and stored as **keys only** (`"r,c"`), never characters. Freezing protects an in-progress attempt from any later change of `choosePrefill`. The same cells for every student of a puzzle (fairness); see E.9.

### A.3 Playing

Layout as doc 04 §5.2 (Grid · Across · Down · Hints), with the mobile changes of D.2. The student selects a cell, types, moves, switches direction, reads the clue. Everything is autosaved (C.5). Hints bar offers only what the puzzle's settings allow: 초성 (when `chosungAllowed`), reveal one letter (remaining count shown), check (scope per mode), and **제출** (submit).

### A.4 Check, reveal, submit, completion

Described in C.4–C.6. Summary: the server answers `ok / wrong / empty` per cell and never a letter; a reveal returns one letter and spends one counted reveal; only an explicit **제출** can complete the attempt.

### A.5 Result

On completion the student gets the **completion moment** (a short celebration, D.3.1) and lands on the result screen (D.3): their own finished grid (rendered from **their own cells**, not from a key), active time, the number of words, a **"도구를 활용했어요"** summary of the help they used (D.3.2), and a **next puzzle link**. No score, no rank, no comparison with anyone (CW-6, doc 04 C6). A closed-unfinished attempt shows the same read-only grid with "수업에서 닫힌 퍼즐입니다" and no correctness marks.

### A.6 Edge flows

| Case | Behaviour |
|---|---|
| Assignment closes or the classroom is archived while playing | next save is refused with a clear read-only banner; entered cells stay visible; nothing is auto-submitted. Saves are accepted for a short grace period after `closes_at` (default 120 s, engineering default) so an in-flight autosave is not lost; checks, reveals and submit are not |
| Teacher publishes a new version (supersedes) | old assignments are closed by `fn_publish_crossword`; the student sees the old attempt read-only and the new puzzle as 새 퍼즐; **no progress carries over** (doc 05 §4.6) |
| Student removed from the classroom | access ends on the next request; attempt data stays (teacher-owned record, erased with the student at end of pilot) |
| Student transferred to another classroom | the old assignment is no longer accessible; a same-puzzle assignment in the new classroom starts a new attempt |
| Second device | resumes the same attempt; patch saves merge (C.5) |
| Completed attempt | read-only; reopening shows the finished grid |
| Network down | indicator "저장되지 않음", retry with backoff, warning before leaving the page; cells are **not** copied to `localStorage` (shared school devices) |

---

## B. Database impact

All additive. No existing table, policy or function is altered, and nothing on the teacher side changes. The migration set ends at `20261018000003`; new ones start at `20261019000001`.

### B.1 Migrations

| # | File | Contents |
|---|---|---|
| 25 | `20261019000001_crossword_play_enums.sql` | enums only (as in M2-1 and M2-2): `crossword_attempt_status` (`in_progress`, `completed`), `crossword_attempt_event_kind` (`check`, `reveal`, `chosung`, `submit_wrong`, `completed`) |
| 26 | `20261019000002_crossword_attempts.sql` | `crossword_attempts`, `crossword_attempt_members`, `crossword_attempt_events` (optional, E.6), indexes, `updated_at` trigger, erasure trigger, RLS **enabled with no policy** on all three |
| 27 | `20261019000003_fn_crossword_play.sql` | the functions of B.4; `REVOKE … FROM PUBLIC, anon, authenticated; GRANT … TO service_role` on every one, as in migration 24 |

No teacher select policy on attempts in this phase: with no policy there is no client access at all, which is the safest state. The teacher policy belongs to M2-2.5 (results) and is a separate, reviewed migration.

### B.2 Tables (restated per doc 05 §13 and doc 06 §11.8)

```sql
crossword_attempts                       -- STUDENT DATA, but it names no student
  id uuid pk default gen_random_uuid(),
  assignment_id uuid not null references crossword_assignments(id) on delete cascade,
  status crossword_attempt_status not null default 'in_progress',
  cells jsonb not null default '{}',     -- {"r,c": "사"}: plain map, typed cells only, no identity
  prefill_keys text[] not null default '{}',     -- frozen at creation, keys only
  revealed_keys text[] not null default '{}',    -- keys only; the letter is derived server-side
  checks_used smallint not null default 0,
  reveals_used smallint not null default 0,
  chosung_used smallint not null default 0,
  submits_used smallint not null default 0,
  last_wrong_submit_at timestamptz,
  check_window_start timestamptz, check_window_count smallint not null default 0,   -- rate limit state
  active_seconds integer not null default 0,
  revision bigint not null default 0,    -- bumped by every cell change
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, assignment_id),
  check (jsonb_typeof(cells) = 'object'),
  check ((status = 'completed') = (completed_at is not null))

crossword_attempt_members                -- who the attempt belongs to (one row today)
  attempt_id uuid not null, assignment_id uuid not null,
  student_id uuid not null references students(id) on delete cascade,   -- erasure cascades from the student
  joined_at timestamptz not null default now(),
  primary key (attempt_id, student_id),
  foreign key (attempt_id, assignment_id) references crossword_attempts (id, assignment_id) on delete cascade,
  unique (assignment_id, student_id)     -- one attempt per student and assignment, in ANY mode

crossword_attempt_events                 -- optional, minimal (E.6); no cell content, no letters
  id bigint generated always as identity pk,
  attempt_id uuid not null references crossword_attempts(id) on delete cascade,
  actor_student_id uuid references students(id) on delete set null,     -- who acted, separate from whose attempt
  kind crossword_attempt_event_kind not null,
  detail jsonb not null default '{}',    -- scope and WORD REFERENCES only (see below), size-capped by check
  created_at timestamptz not null default now()
```

**Event `detail` (PM decision, 2026-10-17):** it stores the **word number** (and direction) the action concerned, and never any answer text or letter. Shape: `{ "scope": "cell" | "word" | "puzzle", "words": [{ "number": 3, "direction": "across" }] }`, at most two word references (a cell lies on at most two words), none for `completed` and `submit_wrong`. For a `reveal` or a cell-scope `check` the server derives the word(s) through the cell itself; the cell key is not stored in the event (it is already in `revealed_keys` for reveals). A database CHECK limits the JSON to these keys and sizes, and a pgTAP case pins that no other key (in particular no character, `answer` or `cell` text) can be stored. This is what later lets a Student Learning Profile say "words that needed a tool" without ever holding answer content ([product note 01](../product/01-student-learning-profile.md) §3). Word numbers belong to an immutable published puzzle, so they stay valid for that attempt's lifetime. These events are the only per-word record; per-word *correctness* is still not stored.

Why this shape (PM constraint 3):

- **No `student_id` on the attempt.** "Whose attempt" is a set of members. Today it is exactly one row; a team attempt later is more rows, with no change to the attempt, to `cells`, to the counters or to the check/payload/completion code.
- `unique (assignment_id, student_id)` on the member table keeps "one attempt per student and assignment" true for individual play *and* for any later mode where a student is on one team grid per assignment. It is the one constraint that would have to be revisited if a student could be in two shared attempts of one assignment (F.3).
- **Actor is separate from owner**: events carry `actor_student_id` (nullable, `SET NULL` on erasure). In M2-2.4 it always equals the single member.
- **Erasure.** Deleting a student cascades to their member row; a trigger `AFTER DELETE ON crossword_attempt_members` deletes the attempt when no member remains. Today that means "student erased → attempt erased", which is what `docs/pilot/12` promises. What happens with a *shared* attempt is governance question G4 of doc 06 and stays open (F.5).
- Counters (`checks_used`, `reveals_used`, `chosung_used`, `submits_used`, `active_seconds`) are on the attempt (doc 06 §12.8).
- The attempt row **contains no solution character**: given cells are keys, letters are derived on demand; `cells` holds what the student typed.

### B.3 Indexes

`crossword_attempt_members (student_id)`; `crossword_attempts (assignment_id)`; `crossword_attempt_events (attempt_id, created_at)`. The student list query is served by `idx_classroom_enrollments_student_active` and `idx_crossword_assignments_classroom_open`. Data volume is one row per student and puzzle.

### B.4 Functions (service-role only, `SECURITY INVOKER`, `search_path` pinned, P0001 stable codes like migration 24)

| Function | Does |
|---|---|
| `fn_crossword_play_access(p_student_id, p_assignment_id)` | **The one access rule** (A.1): enrollment, classroom, assignment status and window, puzzle status. Returns `(ok, reason, puzzle_id, readonly)`; used by every other function and by the list |
| `fn_crossword_play_list(p_student_id)` | rows for the list: assignment, puzzle title, classroom name, level, word count, closes_at, attempt status, filled count |
| `fn_crossword_play_start(p_student_id, p_assignment_id, p_prefill_keys text[])` | get-or-create attempt and member; stores the frozen prefill on creation only; idempotent under races |
| `fn_crossword_play_save(p_student_id, p_attempt_id, p_patch jsonb, p_active_ms int)` | applies a **cell patch** (`{"r,c": "사" \| null}`): every key must be a word cell, a value must be one NFC `[가-힣A-Z0-9]`, locked cells (prefill, reveal) are refused, patch size capped; clamps `active_ms`; `revision += 1`; read-only when completed, closed, or past the grace period. Returns the new revision |
| `fn_crossword_play_check(p_student_id, p_attempt_id, p_scope, p_keys text[])` | enforces `checkMode` and the rate window, counts the request in `checks_used`, returns `(key, status)` with `status in ('ok','wrong','empty')`. **The return type has no character column** |
| `fn_crossword_play_reveal(p_student_id, p_attempt_id, p_key)` | atomic: `UPDATE … WHERE reveals_used < limit RETURNING`, refuses locked or already-correct cells, adds the key to `revealed_keys`, writes the letter into `cells`, returns that single letter |
| `fn_crossword_play_chosung(p_student_id, p_attempt_id, p_number, p_direction)` | only when `chosungAllowed`; consonants of a Hangul word (Latin: first letter; digits and mixed: none) |
| `fn_crossword_play_submit(p_student_id, p_attempt_id)` | refuses when any cell is empty (`INCOMPLETE`, returns the count of empty cells); compares; on all-correct sets `completed`, `completed_at`; otherwise `submits_used += 1`, records the wrong time, enforces the cooldown (E.4) and returns the wrong count according to the mode |
| `fn_crossword_play_given(p_attempt_id)` | `{key: char}` for prefill ∪ revealed keys; the only function that returns letters to the server, and only for cells the student is legitimately given |
| `fn_crossword_attempt_limits(p_attempt_id)` | `revealsAllowed`, `checkMode`, `chosungAllowed` read from the puzzle settings; the single place a later team mode would branch (a pool instead of a per-student number) |

Every function that takes a student id also takes the attempt id and verifies membership; no function trusts an id supplied by the browser (C.8).

### B.5 What is *not* added

No play mode column, no team table, no `cell_authors`, no focus, presence, selection or help-request field, no leaderboard, no rank in the attempt, no student-readable view. `play_mode` on the assignment arrives with M2-3 as an additive column with default `individual` (doc 05 §13).

### B.6 Governance data (go-live gate, E.1)

New student-data categories to add to `docs/pilot/12` and `13`: attempt state (typed cells), hint counters, active seconds, hint events **including the number and direction of the word concerned (never answer text)**. Deletion order: attempts disappear with their members when students are deleted; puzzles before teachers (already written). The verify query of §3.3 gains `crossword_attempt_members`. This is text for the PM and the school's data-protection contact; the phase prepares a draft, it does not sign anything.

---

## C. Service design

New code lives under `src/features/crossword/play/`, with pages under `src/app/student/crosswords/**`. Nothing in `src/features/crossword/review/`, `access.ts`, `messages.ts` or `src/components/teacher/` changes.

### C.1 Files

| File | Purpose |
|---|---|
| `play/constants.ts` | `PLAY_SAVE_DEBOUNCE_MS` 2000, `PLAY_SAVE_GRACE_S` 120, `PLAY_CHECKS_PER_MINUTE` 60, `PLAY_SUBMIT_COOLDOWN_S` 30, `PLAY_MAX_PATCH_CELLS` 225, `PLAY_ACTIVE_MS_MAX_PER_SAVE` 30000 |
| `play/types.ts` | `PlayPayload`, `PlayWord` (**no answer field exists in the type**), `AttemptRef`, check statuses |
| `play/messages.ts` | Korean messages and codes for the play side (own catalogue; does not extend the teacher one) |
| `play/access.ts` | `getStudentId(profile)`, `requirePlayAccess` (wraps `fn_crossword_play_access`), malformed id is "not found" |
| `play/payload.ts` | `buildPlayPayload(attemptRef, viewerStudentId)`: explicit allow-list serializer (C.3) |
| `play/prefill.ts` | `chooseFrozenPrefill`: builds the placeholder puzzle from answer-free structure and calls `choosePrefill` |
| `play/service.ts` | `listPlayable`, `startOrResume`, `savePatch`, `check`, `reveal`, `chosung`, `submit`; thin wrappers over the SQL functions |
| `play/chosung.ts` | pure 초성 (golden tests incl. double consonants) |
| `play/cells.ts` | pure: key helpers (`"r,c"`), word-cell expansion, `isValidCellChar`, filled count, navigation order (next cell/word) used by the UI |
| `play/api-guard.ts` | `requireStudentApi()`: like `requireStudentAreaPage` but returns 401/403 JSON instead of redirecting; same-origin check (`Origin` / `Sec-Fetch-Site`) |
| `play/ime/controller.ts` | the **pure** input state machine (C.7), no DOM |
| `play/ime/use-grid-input.ts` | the thin client hook that feeds DOM events to the controller |

Route handlers (JSON, `Cache-Control: no-store`, `export const dynamic = "force-dynamic"`), all under `/student/…` so the middleware keeps the session fresh (G4):

`src/app/student/crosswords/[assignmentId]/api/{state,save,check,reveal,chosung,submit}/route.ts`

Server actions are used for nothing that must run on page hide: autosave uses `fetch(..., { keepalive: true })` to the save handler.

### C.2 Assignment access

`fn_crossword_play_access` is the only implementation of A.1. The list, start, save, check, reveal, chosung and submit all call it first; a test enumerates the matrix (enrolled, removed, other classroom, other school, archived classroom, closed assignment, not-open-yet, past closes_at, archived puzzle, draft puzzle). The student id is derived from the session cookie in `getStudentId`; there is no `studentId` parameter in any handler, form or URL.

### C.3 What the browser receives

```
PlayPayload = {
  assignmentId, attempt: { status, revision },
  puzzle: { title, rows, cols,
            words: [{ number, direction, row, col, length, clue, single }] },   // NO answer
  given: { "r,c": "사", … },              // prefill + revealed letters only (the cells the student is given)
  cells: { "r,c": "사", … },              // the student's own typed cells
  limits: { checkMode, revealsAllowed, revealsRemaining, chosungAllowed },
  readonly: boolean, closesAt: string | null
}
```

- `payload.ts` builds the object **field by field**; it never spreads a database row. The word query selects an explicit column list that does not contain `answer`; a static test fails on `select("*")` or the string `answer` in any `play/` file other than the SQL-calling wrappers' argument names.
- Progress shown to the student is **filled cells**, never correct cells (a correct count would be a free check).
- A completed attempt's payload is the same shape; the result screen draws the student's own `cells`.

### C.4 Checks and reveals

> Superseded by PM SP-1/SP-2 (2026-10-18): reveals easy 3 / normal 2 / hard 1, checks unlimited / 5 / 3, teacher may override. See [doc 08](08-m2-2-4a-student-play-foundation-plan.md) C.5. The table below is the original proposal.

| Preset | Check | 초성 | Reveals |
|---|---|---|---|
| easy | any time: cell, word, puzzle | yes | 3 |
| normal | on request: word | yes | 1 |
| hard | none (submit only) | no | 0 |

(Doc 04 §3.1; CW-3, CW-4 remain open, E.2. "normal" is read as word scope only; the PM may widen it.)

- Check works on the **saved server state**, not on a value sent with the request, so a check can only tell the student about what is already stored. Each request counts once in `checks_used` and once in the per-attempt rate window (60 per minute, in the attempt row, so it holds on serverless). Replies are statuses only; the error text of a refused check never contains an expected value.
- A wrong mark is client-only and clears when the cell is edited; it is not persisted.
- **Reveal** targets the selected empty-or-wrong cell, not an already given or already correct one. Atomic in SQL (the limit is part of the `UPDATE`), so parallel requests cannot overspend. The letter is also written to `cells` and the key to `revealed_keys`, and the cell becomes locked.
- **초성** returns consonants only, never marked as an answer; counted in `chosung_used` for the teacher.

### C.5 Progress saving

- The client keeps a **dirty set** of cell changes and sends a **patch** (`{"r,c": "사" | null}`) 2 s after the last change, on `blur`, on `visibilitychange` to hidden, and on `pagehide` (`keepalive`). One request in flight at a time, in order; patches are idempotent, so a retry is safe.
- The server **merges** the patch into `cells` (`jsonb` merge, `null` removes a key) and bumps `revision`. A full-state overwrite is deliberately not used: two devices, and later two students, must not erase each other's cells (F.2).
- The response is `{ revision, readonly }`. The client also learns about a close or a completion from it.
- `active_ms` per save is the client's count of visible, recently-active time, clamped by the server to the wall-clock time since the previous save and to 30 s per save. It is never shown to the student.
- **Never sent with a save:** the selected cell, the current word, the current clue. Selection is client-only. Sending it would be the "focus tracking" of CE-3, which is blocked on governance question G1 (F.6).

### C.6 Completion detection

- **Completion is decided only by the server, and only on an explicit submit.** The client knows one thing: whether every cell is filled, which enables the **제출** button.
- `fn_crossword_play_submit`: any empty cell → `INCOMPLETE` (with the number of empty cells, which tells nothing about correctness); all correct → `completed`; otherwise `submits_used += 1`, `last_wrong_submit_at`, and the reply carries the number of wrong cells **or only "아직 틀린 칸이 있어요"**, per mode (E.4). A cooldown after a wrong submit stops the submit button from being used as a cell-by-cell oracle on `hard`.
- Doc 04 §5.4 also allowed a check that finds everything correct to complete the attempt. This plan keeps **one** transition (submit) so that `hard` cannot learn "all correct" any other way; on easy and normal, a check that returns all-ok makes the UI offer 제출 immediately (E.2).
- Completion is computed from `cells` plus the puzzle, never from the member; the same function can evaluate a team attempt later.

### C.7 Korean IME handling (first-class requirement)

**Principle: the key-press layer and the model are separated.** `play/ime/controller.ts` is a pure state machine: input is a stream of normalized events (`compositionstart/update/end`, `input` with `inputType`, `keydown` with `isComposing`/keyCode 229, `blur`, cell-selection changes), output is **intents** (`commit(cells)`, `preview(cells)`, `move`, `delete`, `reject`). The DOM hook only translates events. This makes IME behaviour testable without a browser, from **recorded event traces**.

Design points (each is something to *prove* in the spike H.1, not an assumption):

1. **One focus owner for the grid.** A single uncontrolled `<input>` positioned over the selected cell (transparent text, large hit area) holds focus while the student moves around; the grid cells are visual. Per-cell `<input>` elements make moving focus *during* a composition cancel it. The input has no `maxLength`, no controlled `value` while composing (React must not write `value` mid-composition), and `autocomplete/autocorrect/autocapitalize/spellcheck` off.
2. **A composition buffer maps to cells.** The text being composed (one or more syllables) is shown as **pending** in consecutive cells starting at the anchor cell, clamped to the end of the word. Nothing is committed and the selection does not advance until the composition produces a *finished* syllable.
3. **Syllables change retroactively.** `안` + `ㅏ` becomes `아나`; the previous cell's pending letter changes. The pending preview is recomputed from the whole buffer on every `compositionupdate`/`input`, not appended.
4. **Some keyboards deliver several syllables in one composition** (a prediction or a single long composition); the controller commits all but the last as finished and keeps the last as pending, and clamps at the word end. A replacement or multi-character insert is handled by the same path.
5. **Event order is not trusted.** `keydown`-after-`compositionend` (Safari) versus before (Chrome); `compositionend` not firing until blur on some Android keyboards. The commit rule uses the buffer value at `compositionend`, `blur`, selection change and `input` with `insertText`, whichever comes first, and is idempotent.
6. **Do not intercept keys while composing.** While `isComposing` (or keyCode 229): no Backspace handling, no Arrow/Tab/Enter navigation, no submit. Backspace outside composition clears the cell, or moves back when it is already empty.
7. **What may enter a cell:** one NFC character matching `[가-힣A-Z0-9]`. A lone jamo (`ㅅ`) at the end of a composition is **not committed** (the cell stays empty with a short "글자를 완성해 주세요"); lowercase Latin is upper-cased; NFD input is normalized; emoji, spaces and symbols are rejected. The SQL function enforces the same rule, so the client is a convenience, not the guard.
8. **Latin and digit cells** (mixed answers such as `3D프린터`): a Korean keyboard produces jamo for Latin keys. The UI sets `inputmode` for digit cells and shows "영문/숫자 키보드로 바꿔 주세요" on such cells; automatic mapping of Korean-mode keystrokes to Latin is not planned (E.10).
9. **Word-entry path (always available as a secondary input):** a normal text field under the clue, "낱말로 입력", which writes the whole word into its cells on confirm. It needs no composition handling in the grid, helps keyboard and screen-reader users, and is the **fallback if the grid input fails on a target device** (E.8).
10. **Mobile keyboard coverage.** The active clue is shown in a bar pinned above the keyboard (`visualViewport`), the selected cell is scrolled into view, and the page does not reflow on every keyboard frame.

Traces recorded on real devices become fixtures under `tests/fixtures/ime/` and drive the controller tests (G.2). Chromium composition can additionally be simulated with CDP `Input.imeSetComposition` in a small browser smoke test (H.5, new dev dependency, E.7); WebKit and Android keyboards cannot be simulated and need the device matrix.

### C.8 Student security model

Rules (each is enforced by a test, G.3 and G.5):

1. **No answer in Node on any student path.** Student code never selects `crossword_words.answer`. Everything that needs the key (check, reveal, 초성, submit, given letters, cell validity) runs inside the SQL functions. Prefill uses placeholders (G2).
2. **No client-supplied identity.** Student id from the session; attempt id verified against membership in SQL; assignment id verified by `fn_crossword_play_access`. IDOR attempts get the "not found" response.
3. **Server-side time.** Open/close windows use database `now()`.
4. **Output allow-list.** Replies are built field by field; types do not contain `answer`; check replies are enums; errors never echo expected values or other students' data.
5. **Abuse limits in the database.** Check rate window, submit cooldown, patch size, `active_ms` clamp, per-request cell cap. No in-memory limiter (serverless).
6. **CSRF and caching.** JSON handlers require same-origin (`Origin`/`Sec-Fetch-Site`) and `Content-Type: application/json`; every play response is `Cache-Control: no-store`.
7. **No secrets in the client bundle.** Nothing under `play/` that touches the database is importable from a client component (`server-only`); a test checks the import graph of the play components.
8. **No student-to-student information.** The payload has no member names, ids, or other attempts. (Nicknames and team views are M2-3.)
9. **Logs.** No cell content, no letters, no payloads in logs or error reports.

### C.9 RLS and API exposure review

The point of this section: list every way a student's JWT, or the student-facing code, could reach the key, and say how each is closed. (Exposure through the service-role path is the code rules of C.8; this table is about the Supabase-facing surface.)

| Surface | Today | M2-2.4 | Pinned by |
|---|---|---|---|
| `crossword_words` / `crossword_puzzles` via PostgREST with a student JWT | RLS on, **no student policy** → zero rows | unchanged | pgTAP: student selects return 0 rows, `answer` never appears |
| `crossword_assignments`, `crossword_preview_tickets` | no student policy | unchanged | same file |
| `v_crossword_puzzles_summary` (granted to `authenticated`, `security_invoker`) | zero rows for a student, no answer column | unchanged | pgTAP |
| New `crossword_attempts`, `crossword_attempt_members`, `crossword_attempt_events` | n/a | RLS on, **no policy**; a student cannot even read their own row; teacher policy only in M2-2.5 | pgTAP |
| `fn_*` RPC (`/rest/v1/rpc/...`) | revoked from `anon`, `authenticated` | all new play functions the same | pgTAP: `has_function_privilege('authenticated', …)` false for every `fn_crossword_*` |
| Realtime | no crossword table is in a publication (none in the repo) | none added; tables with `cells` must **not** be published (RLS has no student policy, and a publication would be an exposure path) | pgTAP: `pg_publication_tables` has no `crossword_*` |
| `select(…)` column lists in code | teacher code selects `answer` (allowed) | student code never does | static test over `play/` and `app/student/crosswords/` |
| Payload JSON | n/a | allow-list, no `answer`/`solution`/`key` field, no ≥2-character answer substring | flow test over every word of fixtures |
| Error and timing channels | n/a | statuses only; single-cell oracle limited by rate window and counters | flow tests, C.4 |
| Caching | n/a | `no-store` on handlers and pages | flow test on headers |
| Exports/prints | none | none | n/a |
| Allowed letter exits | n/a | pre-filled cells and each counted reveal; nothing else, including after completion (the result draws the student's own cells) | flow test; confirmed in E.3 |

---

## D. UI pages

Student area only, behind `requireStudentAreaPage`. Mobile first: the school devices are tablets and Chromebooks; the touch keyboard covers half the screen. Same quality bar as the teacher hardening record (doc 05 §13): 360 and 400 px, 44 px targets, 16 px inputs, contrast, `ScrollRegion`, live regions, no colour-only state, axe clean.

| Route | Content |
|---|---|
| `/student` (existing) | one added block: "풀 수 있는 퍼즐 n개" with a link. Nothing else changes |
| `/student/crosswords` | the list of A.1: cards with title, classroom, words, level, closing time, state, one button (시작 / 이어하기 / 결과 보기) |
| `/student/crosswords/[assignmentId]` | play (D.2) |
| `/student/crosswords/[assignmentId]/result` | result (D.3); also the target when an attempt is completed or closed |

### D.1 Components (client where needed)

`crossword-play-board` (grid, selection, pending composition preview), `crossword-play-clues` (Across/Down lists, current clue highlighted, number order), `crossword-play-hints` (초성, 한 글자, 확인, 제출, remaining counts), `crossword-play-word-entry` ("낱말로 입력"), `crossword-play-status` (저장됨 / 저장 중 / 저장 안 됨, read-only banner), `crossword-play-result`. The grid is drawn from structure plus `cells` and `given`; it never needs the key.

### D.2 Play screen

- Layout as doc 04 §5.2 on wide screens. On phones: pinned current-clue bar at the top, grid below in a named scroll region (a 15×15 grid does not fit 360 px; cells are at least 32 px and the board scrolls, never the page), clue lists in a collapsible section, hints as a bottom bar above the keyboard.
- Selection model: tap selects the cell and its word; tapping again toggles across/down at a crossing; **one-cell words** (decision C1 / CW-1) are reachable at their cell in the direction not used by the host word and carry their own numbered clue `(1)`; arrows, Tab/Shift+Tab (next clue), Backspace as in C.7.6.
- Accessibility: each cell is `role="gridcell"` with a name like "가로 1번, 2글자, 첫 번째 칸, 입력됨"; clues are real lists; correct/wrong use text and icon, not colour alone; results of a check are announced in a live region; the pending composition is announced as pending, not as committed; visible focus ring; no time limits.
- Closed/read-only: banner "수업에서 닫힌 퍼즐입니다", inputs disabled, cells visible.

### D.3 Result screen

#### D.3.1 Completion moment

When the server returns `completed`, the student does not just land on a static page:

1. A short **completion celebration**: a congratulation line ("퍼즐을 완성했어요!"), the finished grid appearing, a brief highlight of the words. It is decoration around the puzzle only (it never covers, blurs or fades puzzle cells or clues, doc 06 §12.9 #1), lasts a couple of seconds, is **off for `prefers-reduced-motion`** (a static message replaces it), has no flashing and no sound by default, and can be dismissed with one key or tap. It is announced to screen readers as a single polite message.
2. A **다음 퍼즐 / next puzzle link** in the primary position: if another playable puzzle exists for this student (A.1 rule, same function), the button opens it ("다음 퍼즐 풀기: <title>"); otherwise "다른 퍼즐 보기" goes to the list, and the last fallback is "학생 홈". The next puzzle is chosen by a fixed, explainable rule (the oldest open assignment the student has not started or not finished, excluding the one just completed), never by score or ranking.

#### D.3.2 Result content and wording

Their own finished grid (read-only, from their cells), the clue lists, the number of words, the active time in minutes, and a **"도구를 활용했어요" block** that lists the help the student used in plain words, for example "힌트 도구를 활용했어요: 확인 3번, 글자 알려주기 1번, 초성 2번" and, when none were used, "도구 없이 스스로 풀었어요". The wording is **not** score-like: no "−", no "penalty", no "used n of n hints" fraction, no colour that signals bad, and no comparison with other students. A closed-unfinished attempt gets the same layout with the closed notice, the tool block, and no correctness marks. The same wording replaces any earlier "checks used / reveals used" label in the teacher-free student screens; counters keep their internal names.

### D.5 Accessibility

Target: WCAG 2.2 AA, the same bar and the same tools as the teacher hardening record (doc 05 §13: axe-core 4.10, contrast script, 360 and 400 px).

| Area | Requirement |
|---|---|
| Keyboard only | every action reachable without a pointer: arrows move between cells, Tab/Shift+Tab jump clue to clue, Enter/Space on buttons, a documented shortcut list on the page; no keyboard trap; visible focus ring; no positive `tabindex`; shortcuts are inactive while composing (C.7.6) |
| Screen reader | the grid is `role="grid"` with `gridcell` names ("가로 1번, 2글자, 첫 번째 칸, 입력됨/비어 있음"); one-cell words are announced as such; clue lists are real lists with the active clue marked `aria-current`; check, reveal, save status and read-only changes go to polite live regions; a pending (uncommitted) syllable is announced as "조합 중", not as entered |
| Non-visual alternative | the **word-entry field** (E.8) lets a student fill a whole word without grid navigation, which is also the screen-reader-friendly path |
| Colour and state | correct, wrong, given (prefill/reveal), pending and selected are told apart by icon, text or pattern as well as colour; contrast 4.5:1 for text, 3:1 for cell borders and focus |
| Touch and size | 44 px targets for buttons; grid cells at least 32 px (the board scrolls in a named, focusable scroll region, never the page); 16 px inputs so iOS does not zoom |
| Zoom and reflow | usable at 200% text and at 320 px width without losing function (clue bar and hints stay reachable); respects portrait and landscape |
| Motion and time | no time limit (CW-11), no flashing; the completion celebration (D.3.1) and any highlight respect `prefers-reduced-motion` (static message instead), are dismissible, never cover puzzle content, and are announced once, politely |
| Language | `lang="ko"` on the page; Latin or digit cells get a spoken hint that a non-Korean keyboard is needed |
| Errors | plain Korean messages tied to the control with `aria-describedby`; a failed save never silently discards input (C.5) |

Gaps carried over from the teacher hardening and not solved by tooling: no automated browser a11y tests exist in the repo (E.7 would add a Chromium smoke suite), and a real screen-reader session (TalkBack on the Galaxy devices, NVDA on Windows) is a manual step in 2.4f; the pass/fail is recorded, not assumed.

### D.4 Not built

Printing, sharing, timers or countdowns (CW-11), leaderboards, anything that mentions other students.

---

## E. Open PM decisions

"Recommendation" is engineering's. Items marked **gate** block a stated step.

**PM answers recorded 2026-10-17:** **E.5 accepted** (one attempt per student and assignment, no restart in M2-2.4), **E.6 accepted** (minimal `crossword_attempt_events` table, kinds and counts only), **E.12 accepted** (the PM will list the target devices and keyboards; the IME spike 2.4a waits for that list). All other items below remain open.

**IME spike scope (E.12, PM, 2026-10-17).** Only these devices first; more can be added later.

| Device | Browsers |
|---|---|
| Galaxy S24 | Samsung Internet, Chrome |
| Galaxy Tab S9 | Samsung Internet, Chrome |
| Windows 11 desktop/laptop | Chrome, Edge |

Test cases: one-cell input · fast typing · Backspace · composition start/end · focus move after commit · Korean syllable completion · paste handling · mobile soft keyboard · hardware keyboard · landscape · portrait.

Success criteria: (1) no duplicated characters; (2) no dropped characters; (3) no premature focus change during composition; (4) Backspace behaves correctly during active composition; (5) Korean syllables commit exactly once; (6) input remains usable on Samsung Internet.

**2.4a status (2026-10-17):** the lab page is built in `scripts/ime-lab/` (`index.html`, `lab.js`, `serve.mjs`, `summarize.mjs`, `README.md`; no app code, no migration, no dependency). It runs the cases above for input methods A (one proxy input), B (one input per cell) and C (word entry), judges SC1–SC3 and SC5 automatically and SC4 and SC6 with the tester, and saves event traces to `scripts/ime-lab/traces/`. Checked here only with synthetic events in a desktop browser (logic, save and summary work); **no real-device result exists yet**, so no pass/fail on any device is claimed.

Consequences for the plan: iPadOS/macOS Safari, ChromeOS and the Microsoft IME on other browsers drop out of the first matrix (G.6 and H.1 are read against this list); Samsung Internet is a pass/fail gate, so a failure there triggers the word-entry-primary fallback of H.1; the hardware-keyboard case is tested on the tablet as well as on Windows.

| # | Decision | Recommendation |
|---|---|---|
| E.1 **gate (go-live)** | CW-13 / old C13: governance. Add attempt state, hint counters, active seconds and (if E.6 yes) hint events to `docs/pilot/12` and `13` and get the data-protection contact's agreement and the D6 signature **before any real student plays**. Build may proceed on the local stack in the meantime | Yes; the phase delivers draft text, the PM and the school contact approve |
| E.2 | CW-2…CW-4 (old C2–C4): accept the generator's preset values; confirm the check scopes of C.4 (easy cell/word/puzzle, normal word, hard none); 초성 on easy and normal; completion only by submit (a check that is all-ok only *offers* the submit) | Accept as written; review with one teacher after the first class |
| E.3 | **Constraint 1, literal reading.** Pre-filled cells and counted reveals show letters of the answer by design (doc 04 §5.3). Is that acceptable, with the rule "no other letter ever leaves the server, including after completion; the result screen draws the student's own cells"? | Yes |
| E.4 | Wrong submit feedback and anti-oracle: easy and normal show the number of wrong cells, hard shows only "아직 틀린 칸이 있어요"; 30 s cooldown after each wrong submit on hard (and after the third wrong submit on others). Wording stays supportive ("조금만 더 살펴볼까요?", with the wait time said plainly), never punitive | Yes |
| E.5 | CW-5 (old C5): one attempt per student and assignment, **no restart in M2-2.4**; a teacher reset belongs to M2-2.5 and is teacher-side work (not allowed now). A student who locks themselves into a wrong completed state cannot retry | Yes; record it as known. **Practice mode (retry that does not count) stays deferred and is out of scope for M2-2 (PM, 2026-10-17); it is a future roadmap item, section I** |
| E.6 | Hint events table (`crossword_attempt_events`) versus counters only. Events add an actor separate from the owner (doc 06 §11.8) and forensic value for brute-force cases; they also add student data to D6 | Minimal events table (kinds, counts and **word number and direction**, no letters, no answer text, no keystrokes, same 30-day retention). **Accepted; word references approved 2026-10-17** |
| E.7 | Browser test infrastructure: the repo has node-only vitest. Add Playwright (Chromium, CDP IME simulation) as a dev dependency for one smoke suite | Yes, small; plus the real-device matrix, which cannot be automated |
| E.8 | Word-entry field ("낱말로 입력") always available as a second input path, not only as a fallback | Yes (accessibility, IME reliability) |
| E.9 | Pre-filled cells identical for every student of a puzzle (fair, but classmates can compare) or different per student (deters copying, uneven difficulty) | Identical |
| E.10 | Latin/digit cells with a Korean keyboard: show a hint only, or map Korean-mode keystrokes to the Latin letters (Dubeolsik layout) | Hint only; mixed answers are rare |
| E.11 | A puzzle superseded by a new version while students are playing: the old attempt becomes read-only and **progress does not carry over** (doc 05 §4.6; the publish screen is teacher-side and not changed here). Accept for the pilot, with a line in the teacher guide? | Accept |
| E.12 | **Devices for the IME spike and sign-off.** Which devices and keyboards are the target? Galaxy Tab (Samsung keyboard and Gboard), school Windows laptops (Microsoft Korean IME), Chromebooks, iPads, phones. The spike needs the user or a teacher to run a lab page on each | PM names the matrix; a real device is required, emulation is not enough |
| E.13 | Grace period for saves after `closes_at` (120 s) and no auto-submit at close | Yes |
| E.14 | List placement: dedicated `/student/crosswords` plus a block on `/student` | Yes |

---

## F. Future compatibility risks (shared attempt / team mode)

Constraint of doc 06 §11.8 / §12.8 and PM constraint 3: nothing in this phase may assume one author, and nothing here builds teams, sharing, live updates, focus, presence or help requests.

### F.1 What the design already guarantees

- Attempt, payload builder, check, reveal, 초성, submit and completion take **an attempt id and its puzzle**; the owner appears only in `fn_crossword_play_access` (which attempt does this student see) and in the member table.
- Counters and limits live on the attempt and are read through `fn_crossword_attempt_limits`.
- `cells` is a plain `{"r,c": char}` map with no identity; saves are merge patches.
- The URL key is the assignment id, so "which attempt" can become "the team's attempt" without a URL change.
- `unique (assignment_id, student_id)` holds for individual play, per-team grids, and one grid per class.
- `play_mode` is not added; it arrives with M2-3 as a defaulted column on the assignment.

### F.2 Risks and what M2-3 must do

| # | Risk | Mitigation now | What M2-3 has to do |
|---|---|---|---|
| 1 | **Last-writer-wins on `cells`** erases a teammate's work | patch-merge saves, `revision`, single in-flight queue | cell-level conflict rule (overwrite attributed to the new author, doc 06 §11.4 note 5); per-cell author record kept **outside** `cells` |
| 2 | **No per-cell attribution** means contribution tracking (CE-8) has no history for attempts played before team mode | individual attempts are trivially attributed to the single member; events carry an actor | add `cell_authors` (or equivalent) as a new table, written from the start of M2-3.4; do not retrofit onto `cells` |
| 3 | `unique (assignment_id, student_id)` forbids a student being in two shared attempts of one assignment | acceptable for "one team grid" and "one class grid" | revisit only if a student could change team mid-assignment (then add an end-of-membership instead of dropping the key) |
| 4 | **Erasure** of one member of a shared attempt (G4) | trigger deletes an attempt only when its **last** member is erased; the default for a shared attempt is therefore "keep the attempt, drop the member" | governance must decide keep-and-detach versus delete; the trigger and a pgTAP case are the place to change it |
| 5 | Team **resources** (CE-5) change who owns counters | counters on the attempt; limit resolved in one function | `fn_crossword_attempt_limits` returns a team pool for a collaborative assignment; check and reveal already `UPDATE … WHERE counter < limit` atomically on one row, which already serializes concurrent teammates |
| 6 | **Live transport**: Realtime `postgres_changes` is impossible by design (no student policy, no publication) | none needed | polling on `revision` or a server-side stream, or authorized Realtime Broadcast channels, decided in M2-3.4; do not publish attempt tables |
| 7 | Payload must not leak **who** else is on the attempt | no member data in the payload | add nicknames (generated only, CC-6) as a separate field of a later payload version; never real names or student numbers |
| 8 | Accidental **focus tracking** (CE-3, blocked by G1) | the save payload excludes selection, current word and current clue; a test asserts the request body keys | none until G1 is answered |
| 9 | Accidental **help request/presence** fields | none added | G2 first |
| 10 | The `play` settings name `revealsPerStudent` is stored in immutable puzzles | payload and attempt use neutral names | map it in `fn_crossword_attempt_limits`; no data change |
| 11 | Completion semantics for a shared grid (who may press 제출) | submit takes an attempt, not a student | rule in M2-3 (any member, vote, or teacher), same function |
| 12 | Existing teacher-side pin `crossword-hardening.test.ts:75` (no `student_id`/`crossword_attempts` in teacher code) | all student code is in new files | M2-2.5 (results) needs teacher access to attempts and will have to amend that test deliberately |
| 13 | **Individual-mode results shown to the student** are built on `completed_at`, counters, `active_seconds`; any M2-3 score or badge reads these | none stored derived (no rank, no score in the attempt) | scores are computed from attempts plus a versioned rule (doc 06 §7.4) |

### F.3 Rejected alternatives (so the choice is on record)

- `student_id` on the attempt with a unique `(assignment_id, student_id)` (doc 04 §6.2 as drawn): simplest, but a later team mode would need either a new attempt table or a migration of live data. Rejected by constraint 3.
- `owner_student_id` nullable plus `team_id` nullable on the attempt: needs a teams table that does not exist and puts identity back on the attempt row.
- Full-state `cells` overwrite on save: simplest client, but silently destroys concurrent edits.

---

## G. Test strategy

### G.1 Pure unit tests (vitest, `tests/access/crossword-play-*.test.ts`)

- `chosung`: syllable arithmetic golden values, double consonants (ㄲ ㄸ ㅃ ㅆ ㅉ), Latin first letter, digits and mixed answers return none.
- `cells`: key parsing, word-cell expansion including one-cell words, filled-cell count, next-cell and next-clue navigation, `isValidCellChar` (syllable yes; jamo, emoji, space, lowercase after normalization).
- **Prefill equivalence**: for the generator's golden puzzles and many seeds, `choosePrefill` on the real puzzle and on the placeholder puzzle return identical keys, and never complete a word. This is what allows C.8 rule 1.
- Messages: every play error code has a Korean message; none contains a placeholder for an answer.
- Constants pinned against the SQL limits (same pattern as `fn_crossword_min_words`).

### G.2 IME controller tests (pure, trace-driven)

Scripted and recorded event traces for: per-syllable composition (compositionstart/update/end each syllable); keydown ordering of Safari versus Chrome; one long composition across several syllables; batchim re-split (`안`+`ㅏ`); Backspace unwinding jamo during composition; Enter, Tab and arrows ignored while composing; lone-jamo rejection; blur and cell change in the middle of a composition (commit idempotent, no double commit); NFD input; lowercase Latin and digits; paste or multi-character replacement clamped at the word end; end-of-word and end-of-grid behaviour; `insertReplacementText`. Fixtures captured in the spike (H.1) are the ground truth; synthetic traces cover the rest.

### G.3 Database (pgTAP `00013_crossword_play.test.sql`)

Student JWT: zero rows or permission denied on **every** `crossword_*` table and on the summary view; no `rpc` execute right on any `fn_crossword_*`; no `crossword_*` in a publication. Access matrix (C.2). `fn_crossword_play_start` idempotent; `unique (assignment_id, student_id)`; two students, two attempts; same student in two classrooms, two attempts. Save: bad key, jamo, lowercase, overlong patch, locked cell, closed assignment, grace window. Check: each mode and scope, the rate window, return type has no letter. Reveal: limit, locked or correct cell refused, letter written once. Submit: empty cells, wrong, cooldown, success, repeat after completion. Erasure: deleting a student deletes membership and the attempt; deleting a classroom, assignment or puzzle cascades; deleting an owner who owns puzzles stays refused. The two replaced pins of §0.3.

### G.4 Flow tests (vitest against the local stack, like `crossword-review-flow.test.ts`)

Teacher publishes → student signs in → list → open → payload → type via save → resume from a second client → check → reveal → submit → result. Plus: the payload and every reply, serialized, contain no `answer`/`solution` key and no answer string of two or more characters from the fixture puzzles; check replies contain only the three statuses; **10 parallel reveals with a limit of 1 give exactly one success**; parallel saves merge; IDOR (another student's assignment id, a random id, a malformed id) all give the same not-found; removed enrollment, archived classroom, closed assignment, superseded puzzle block play; response headers `no-store`; same-origin check rejects a foreign `Origin`; the save request body keys are exactly the allowed set (no selection or focus field).

Growth-first additions to these tests: event `detail` accepts only `scope` and `words[{number, direction}]` (a case inserting a character, `answer` or `cell` text is refused by the CHECK); a reveal, a cell check and a word check each record the right word reference(s) and nothing else; the result payload contains no rank, score, comparison or other student; the "next puzzle" choice follows the stated rule and never offers an inaccessible assignment; the result copy never contains score-like patterns (a catalogue test for "점", "감점", "n/n" hint fractions and penalty words in `play/messages.ts`); and the completion celebration is replaced by a static message when reduced motion is requested (browser smoke, G.6).

### G.5 Static guards (cheap, run in the existing suite)

No `select("*")` or `answer` column in `play/**` and `app/student/crosswords/**`; client components import nothing marked `server-only`; no `localStorage` use of cell data; no new file under `src/components/teacher/` or `src/features/crossword/review/` in the M2-2.4 diff.

### G.6 Browser, accessibility, devices

- Playwright Chromium smoke with CDP IME simulation: type a word, a double-syllable word, a batchim re-split, Backspace during composition, switch cell mid-composition (E.7).
- axe-core 4.10 on list, play, result at 360 and 400 px; keyboard-only run; screen-reader structure (names, roles, live regions).
- **Real-device IME matrix** (E.12), recorded in a table in the hardening note: Samsung keyboard and Gboard on Android tablets and phones, Microsoft Korean IME, ChromeOS, iPadOS and macOS Safari, each running the same script (syllable, batchim, Backspace, fast typing, switch cell mid-composition, prediction strip on).
- Budgets pinned like doc 05 §13 (10× margin): payload under 20 kB for 25 words, save, check and submit handlers fast on the local stack, first-load JS of the play page under 130 kB.

---

## H. Phases

One commit per step, each green on its own: `db reset`, `test db`, `db:types` no diff, `test:access`, typecheck, lint, build. Same convention as doc 05 §3.

| Step | Delivers | Needs | Size |
|---|---|---|---|
| **2.4a IME spike** | a throwaway lab page (`scripts/ime-lab/`, not part of the app) that logs raw events from the proxy-input grid and from the word-entry field; run on the device matrix (E.12); recorded traces; a written pass/fail per device; **decision: proxy input, per-cell input, or word-entry primary** | E.12 (devices) | S–M |
| **2.4b Schema** | migrations 25–27, pgTAP (G.3), `db:types`, the two replaced pins, draft governance text (B.6) | none (parallel with a) | M |
| **2.4c Play core** | `constants`, `types`, `messages`, `chosung`, `cells`, `prefill`, the IME controller built from the spike traces, pure tests (G.1, G.2) | a (controller), b (limits) | M |
| **2.4d Service and handlers** | `access`, `payload`, `service`, route handlers, `api-guard`, flow and static tests (G.4, G.5) | b, c | M–L |
| **2.4e Screens** | list, play, result, `/student` block, a11y and mobile layout | d | L |
| **2.4f Hardening** | Playwright smoke (if E.7), device matrix on the real build, axe, perf budgets, security review of C.8 and C.9, hardening record (like doc 05 §13), governance text handed to the PM | e, E.12 | M |

Order: a and b in parallel (disjoint files), then c, d, e, f. The spike runs first because doc 04 §9 names the IME as the largest risk, and its outcome can change D.2 and C.7; if it fails on a target device, 2.4e builds word-entry as the primary input and the grid becomes display plus selection.

**Entry criteria for starting 2.4b:** answers to E.5 and E.6 (they shape the tables). **Entry for 2.4a:** E.12. **Go-live gate:** E.1, plus the hardening record of 2.4f.

**Definition of done for M2-2.4:** an enrolled student can see and open an open assignment, type Korean syllables on the target devices without lost or doubled letters, autosave and resume across devices, use the checks, reveals and 초성 the preset allows, submit, and see a result; no student token, API payload, error message or client file contains the key (tests prove it); teacher-side code is byte-identical to `0e781cf` apart from the two replaced pins; all gates are green; and the hardening record states what was and was not tested on real devices.

---

## I. Future roadmap items recorded by this plan (not in M2-2)

| Item | Why it is deferred | Where it goes |
|---|---|---|
| **Practice mode** (a retry or practice copy of a puzzle that does not count as the student's attempt). Raised as growth gap 3 in the 2026-10-17 review of this plan; **out of scope for M2-2 (PM decision, same date)**. M2-2.4 keeps one attempt per student and assignment with no restart (E.5) | needs a rule for which attempt counts for growth, achievements and teacher views, and a teacher-side reset (M2-2.5) is a different matter | later milestone, after the Student Learning Profile has defined what "counts" |
| History across puzzles and growth against the student's own past | student-visible, needs governance (E.1) and a read model over attempts | Student Learning Profile slice, at or before M2-3.1 (PM to place) |
| Strengths and "to practise next" from the word-level hint events | needs the profile and wording review; per-word correctness is deliberately not stored | later, see [product note 01](../product/01-student-learning-profile.md) §3 |
| Achievements | effort-based, cosmetic by default | M2-3.1 |
| Collaboration (class goals, team board, collaborative crossword) | doc 06 | M2-3.2 to 3.4 |
| Competition (nickname boards, team and classroom competition, seasons) | last in the order; never primary | M2-3.5 to 3.8 |
