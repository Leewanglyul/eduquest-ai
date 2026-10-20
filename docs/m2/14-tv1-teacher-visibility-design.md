# 14. TV-1: minimal teacher visibility (design proposal)

Status: **APPROVED by the PM, 2026-10-20 (decisions in §11). Design only: nothing is implemented.** No code, DB or migration change. Builds on [13](13-teacher-visibility-review.md) (Option B approved) and [11](11-student-play-release-readiness-audit.md) §12 (TV-1 is a release blocker). Sources: migrations `20261018000003` (`fn_crossword_actor_role`, `fn_crossword_actor_manages`), `20261019000002` and `…03` (attempt tables, `fn_crossword_play_list`, `fn_crossword_play_wordcells`), `review/service.ts`, [pilot/14](../pilot/14-crossword-attempts-governance-draft.md) §3.

## 1. Scope

Exactly the **Must** items of doc 13 §3, with the PM decisions of 13 §8:

| ID | Delivered |
|---|---|
| M-1 | Per assignment (puzzle × classroom): one row per enrolled student with state **not started / in progress / completed** |
| M-2 | Progress as **filled / total cells** (numbers only) |
| M-3 | **Last activity** and **completed** time |
| M-4 | Help used: counts of checks, reveals, 초성, in neutral wording |
| M-5 | Wrong submits as a count |
| M-6 | Read-only; **classroom owner and co-teachers only**; **no typed letters, no answers, no student grid** |
| M-7 | Sorted by student number then name, never by progress, help or time |

Out of scope (doc 13 Should/Could, doc 10 overrides, M2-2.5 results, teacher reset): summary line, active time, inactivity marker, per-word help, class-level word statistics, export, notifications, history, the student's grid.

## 2. Preconditions (not engineering)

1. **Doc 12 amendment** and **doc 13 (pilot) re-signature** (PM decisions 5 and 6), plus an addition to [pilot/14](../pilot/14-crossword-attempts-governance-draft.md) §3 ("Teachers, admins: none yet") and an answer to Q5 (owner and co-teachers).
2. Order: the governance text and sign-off come before this feature is switched on for a real class. They do not block local development or review of this design.
3. Any hosted database change follows the rule "impact report, then PM go, then push" (2026-10-20).

## 3. Design decision: how a teacher reads attempts

| Option | Description | Verdict |
|---|---|---|
| **P1. Service-role read function** (recommended) | One SQL function with `SECURITY INVOKER`, `search_path` pinned, `service_role` only, taking `p_actor_id`, like the existing teacher functions (`fn_publish_crossword`, `fn_save_crossword`). It checks the actor itself and returns only derived columns | Keeps RLS on the attempt tables unchanged (no policy, client privileges revoked). The function's return type is the allow-list: letters and keys cannot leave because they are not in the result |
| P2. Teacher RLS policy + view | A `SELECT` policy and a `security_invoker` view | Rejected: it needs table `SELECT` for `authenticated`, which exposes `cells`, `prefill_keys` and `revealed_keys` (policies are row-level, not column-level), and it reopens the client-privilege model that pilot/14 and the tests pin as closed |

P1 follows the pattern of M2-2.2 and keeps "no client access to attempt tables" true for students and teachers alike (an existing pgTAP and the doc 14 §3 table keep their meaning).

## 4. Data: the read function

Name (proposal): `fn_crossword_assignment_progress(p_actor_id uuid, p_school_id uuid, p_assignment_id uuid)`.

**Authorization (inside the function):**
1. `fn_crossword_actor_role(p_actor_id, p_school_id)`: active teacher or admin of the school, else `CROSSWORD_FORBIDDEN`.
2. The assignment's classroom must belong to the school and the actor must be that **classroom's owner or one of its co-teachers** (`classrooms.owner_id`, `classroom_teachers`). A mismatch raises the same `CROSSWORD_FORBIDDEN` that an unknown assignment id raises, so an id guess learns nothing. The PM scope is owner and co-teachers; whether `admin` should also pass is Q-1 in §10 (the existing crossword functions let admins through).
3. Archived classroom: readable (history), flagged read-only by the page.

**Rows returned (one per enrolled student, `classroom_enrollments.status = 'active'`):**

| Column | Source |
|---|---|
| `student_id` | `students.id` |
| `student_no` | `students.student_no` |
| `display_name` | `profiles.display_name` (the teacher sees real names) |
| `state` | `not_started` (no attempt), `in_progress`, `completed` (`crossword_attempts.status`) |
| `filled_count` | same expression as `fn_crossword_play_list`: distinct keys of `cells` ∪ `prefill_keys` ∪ `revealed_keys` (counts only; keys are not returned) |
| `total_cells` | `count(distinct key)` over `fn_crossword_play_wordcells(puzzle_id)`, computed once per call, not per row |
| `last_saved_at`, `completed_at` | attempt columns |
| `checks_used`, `reveals_used`, `chosung_used` | attempt counters |
| `wrong_submits` | count of `submit_wrong` events of the attempt (verify during implementation that every wrong submit writes one; fall back to `submits_used` minus the completing submit if not) |

**Never returned:** `cells`, `prefill_keys`, `revealed_keys`, event `detail`, answers, clues of the puzzle, `revision`, `check_window_*`, any other student's identity across classrooms.

Notes:
- A student who left the classroom after playing is not in the roster (active enrollments only). The attempt remains in the database. Recorded here as a known limit; Q-2 in §10.
- Size: a classroom is a few dozen students; one call, no pagination.
- A shared attempt (future) is handled by the join through `crossword_attempt_members`, so a member appears with the shared attempt's progress. No change is needed now.
- No new table, no new enum value, no trigger, no policy. One migration containing one function and its `REVOKE`/`GRANT` (service role only, as the other `fn_crossword_*`).

## 5. Server code

- New folder `src/features/crossword/results/` (separate from `review/` and `play/`): `service.ts` (`getAssignmentProgress(actor, assignmentId)`), `view-model.ts` (pure mapping to labels), `schemas.ts` (id validation). It calls the function with the service-role client, with the actor id from the session (`requireActiveProfile`, teacher or admin), never from the request.
- The folder is the **only** teacher-side code that touches attempt data. The existing hardening pin (`crossword-hardening.test.ts:75`, "no `student_id` / `crossword_attempts` in teacher code") is amended with an explicit allow-list of exactly this folder, and a new static guard checks that `results/` selects no `cells`, `prefill_keys`, `revealed_keys`, `answer` or event `detail`.
- Errors map to short Korean messages; the unauthorized and unknown cases show the same "not found" page.

## 6. Teacher UI

- **Entry:** in the assignment list of the puzzle detail page (`/teacher/crosswords/[puzzleId]`), a link "진행 보기" per assignment. New route `/teacher/crosswords/[puzzleId]/assignments/[assignmentId]` (server component, same teacher guards as the other teacher pages, `force-dynamic`).
- **Flag:** the link and the page appear only when the Student Play flag is on (same `isCrosswordPlayEnabled()` as the student pages, `notFound()` otherwise). With the feature off every student would read "not started", which would mislead. The F-1 design ([12](12-f1-feature-flag-api-gating-design.md)) is independent: this page is a server page, not an API route.
- **Content:** title of the assignment (puzzle, classroom, open/closed, closing time), then one table:

| 번호 | 이름 | 상태 | 진행 | 마지막 활동 | 도구를 활용 | 틀린 제출 |
|---|---|---|---|---|---|---|

  - 상태: text plus icon ("시작 전", "푸는 중", "완료"), never colour only.
  - 진행: "12 / 40칸" plus a text value; no percentage bar that implies a target is required (optional thin bar is fine if text is present).
  - 도구를 활용: "확인 2 · 알려주기 1 · 초성 0", the same neutral wording as the student result; no "n/n" fractions, no penalty or score words.
  - 틀린 제출: a plain count.
  - An "as of" time and a reload button (the page is not live).
- **Order:** by student number, then name. No sort controls in the MVP, so no progress, help or time ordering exists (CE-11, product note 01 §6).
- **Layout:** desktop first; the table scrolls inside a named region on a phone; headings, `<th scope>` and a caption for screen readers; 44 px controls. No change to any student screen or Galaxy Tab layout.
- **Forbidden:** letters, answers, the student's grid, ranking or comparison text, "late"/"behind" labels, per-student red/green judgement.
- **Wording review:** the labels above go through the same wording catalogue test that already forbids score-like words on student screens (a new teacher-side catalogue test).

## 7. Tests (to be written with the implementation)

**pgTAP (new file, e.g. `00015_crossword_assignment_progress.test.sql`):**
1. The classroom owner and a co-teacher get the rows; another teacher of the same school, a teacher of another school, a student id and an unknown assignment all get `CROSSWORD_FORBIDDEN` (same message for unknown and forbidden).
2. Roster completeness: enrolled students without an attempt appear as `not_started`; a student with an attempt in another assignment does not leak into this one; removed enrollments are excluded.
3. Numbers: `filled_count` equals the student's own list value (`fn_crossword_play_list`) for the same attempt; `total_cells` equals the puzzle's distinct cells; counters match the attempt row; `wrong_submits` equals the number of `submit_wrong` events.
4. Column allow-list: the function's return type has none of `cells`, `prefill_keys`, `revealed_keys`, `detail`, `answer`.
5. Privileges: not executable by `anon` or `authenticated`; `service_role` only; RLS on the attempt tables and the zero-policy state unchanged (the existing 00013 cases still pass).
6. A shared attempt shape (two members) returns both students with the shared progress.

**vitest:** service maps the function result; the actor id comes from the session; view-model labels; a rendering test of the page (roles, caption, no forbidden words, order by student number); the amended hardening pin and the new static guard; the flag-off page is `notFound`.

**Hosted verification after the push (test data only, `SMOKE` prefix):** create a test classroom and student, a test attempt, call the function as the owner and as another teacher, check the counts, then remove the data (the same procedure as the 2026-10-20 erasure smoke test).

## 8. Impact

| Item | Assessment |
|---|---|
| DB | **1 migration**, 1 function, no table, enum, trigger or policy. `db:types` regenerated (no table change) |
| Hosted | needs the gated push (impact report, PM go). Reversible with a `DROP FUNCTION` migration; no data change |
| API | none (no route handler, no client fetch) |
| UI | 1 teacher page and 1 link; no student or Galaxy Tab screen changes |
| Governance | doc 12 amendment, pilot/14 §3 and Q5, doc 13 re-signature (preconditions §2) |
| Privacy | teacher sees real names (decided) and counts; no letters; read-only; scope owner and co-teachers; no new data collected |
| Performance | one query of a few dozen rows; `total_cells` computed once; index `idx_crossword_attempts_assignment` and the member unique key already exist |
| Release risk | low to medium: the function is read-only and its output is a fixed allow-list; the main risk is a wrong authorization check, covered by the matrix in §7 |
| Size | small to medium (one function with tests, one service folder, one page); far below the full M2-2.5 |

## 9. Rollout and dependencies

1. PM approves this design and answers §10.
2. Governance text drafted and signed: doc 12 amendment, pilot/14 §3 and Q5, doc 13 re-signature.
3. Implementation locally with the tests of §7; no hosted change.
4. Impact report, PM go, hosted `db push`, hosted verification with test data.
5. Close TV-1 and condition C-6 in [11](11-student-play-release-readiness-audit.md). TV-1 remains a release blocker until then. Independent of F-1, the device runs and the TalkBack run.

## 10. Questions for the PM

1. **Admin:** the PM scope is owner and co-teachers. Should school `admin` accounts also be able to open the page (as for other crossword functions), or be excluded for this first version?
2. **Students who left the classroom:** show only active enrollments (proposed), or also students who have an attempt for this assignment but are no longer enrolled?
3. **Access log:** log each teacher view of student progress in `audit_logs`? It would add an enum value (a migration with a one-way change). Recommendation: no per-view log for the MVP, only the existing logging of publishing and closing; revisit with the governance text.
4. **Flag coupling:** hide the link and page while the Student Play flag is off (proposed)?
5. **Extras:** include the two cheap Should items, the "as of" time (already in the layout) and a one-line count ("n started, n completed")? Proposed: "as of" yes, the count line no, to keep to the approved Must list.

## 11. PM decisions (2026-10-20)

Answers to §10:

1. **School admin may open the page, read-only.** Access is: classroom owner, co-teachers, and school `admin` (read-only, as the other crossword functions already allow). §4 step 2 reads accordingly; the rule "no write path" is unchanged.
2. Students who left the classroom are **not shown** (active enrollments only).
3. **No audit log** of teacher views in the MVP (no enum change).
4. With `CROSSWORD_PLAY_ENABLED` off, the teacher link and page are **hidden** (`notFound()`).
5. The **"as of" time is included**; the summary line is **not**.
6. How `wrong_submits` is computed is **confirmed during implementation** (events versus `submits_used`).

Still in force from [13](13-teacher-visibility-review.md) §8: no letters, answers or student grid; owner/co-teacher scope (plus admin read-only, item 1); doc 12 amendment and doc 13 (pilot) re-signature before real use; TV-1 remains a Student Play release blocker. Implementation, DB and migrations have not started.
