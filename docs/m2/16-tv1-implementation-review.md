# 16. TV-1: implementation review of m2/14

Status: **REVIEW for PM decision. 2026-10-21. Nothing is implemented.** No code, DB, migration, flag or Production change. Reviews [m2/14](14-tv1-teacher-visibility-design.md) (approved design) against the code and migrations as they are today. Related: [m2/13](13-teacher-visibility-review.md), [m2/11](11-student-play-release-readiness-audit.md) §12 (TV-1 is a release blocker), [m2/15](15-f1-hosted-verification-plan.md) (hosted state), pilot/12 revision 3 draft ([pilot/12-revision-3-student-play-draft.md](../pilot/12-revision-3-student-play-draft.md)). Documents are named with their folder (`pilot/12`, `m2/14`).

## 0. Recommendation

| Question | Recommendation |
|---|---|
| Implement TV-1 locally (code, one migration, tests, no hosted change)? | **GO**, once the PM gives the implementation go-ahead. The design holds up against the code; three small corrections are listed in §9 |
| Apply the migration to the hosted project and show the page to teachers on hosted? | **NO-GO for now.** Needs: `pilot/12` revision approved and `pilot/13` signature status resolved (PM decisions 5 and 6 of m2/13), the impact report and PM go for `db push`, and a deployment that is connected to the database to verify on (the Preview has no Supabase variables, [m2/15](15-f1-hosted-verification-plan.md) §2) |
| Release | TV-1 stays a Student Play release blocker until it is implemented, verified and the governance steps are done |

## 1. Migration inventory

**One new migration, one function, no table, enum, trigger or policy.**

| Item | Detail |
|---|---|
| File | next number after `20261019000004`, e.g. `20261022000001_crossword_assignment_progress.sql` (the name is a proposal) |
| Object | `public.fn_crossword_assignment_progress(p_actor_id uuid, p_school_id uuid, p_assignment_id uuid)` returning a table (the allow-list of m2/14 §4) |
| Language / security | `plpgsql` or `sql`, **`SECURITY INVOKER`**, `SET search_path = pg_catalog, public`, `STABLE` |
| Privileges | `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role` (same as the other `fn_crossword_*`) |
| Existing objects touched | none. It reads `crossword_assignments`, `classrooms`, `classroom_teachers`, `classroom_enrollments`, `students`, `profiles`, `crossword_puzzles`, `crossword_attempts`, `crossword_attempt_members`, and calls `fn_crossword_actor_role` and `fn_crossword_play_wordcells` |
| Generated code | `pnpm db:types` adds a `Functions` entry to `src/types/database.ts` (a file diff of one block; no `Tables` change) |
| Hosted state | `supabase migration list` should then show exactly this one migration pending (all earlier ones are applied) |

Why `SECURITY INVOKER` and not `DEFINER` (unlike `20261019000004`): the caller is `service_role`, which already has table rights and bypasses RLS, exactly as for the play functions. A definer function would add privilege for no reason. The lesson of `…0004` was about a trigger run by `supabase_auth_admin`, not about a service-role function.

## 2. Schema changes

None. The function reads existing columns only:

| Output column | Source (verified) |
|---|---|
| `student_id`, `student_no`, `display_name` | `students.id`, `students.student_no`, `profiles.display_name` |
| `state` | no member row: `not_started`; else `crossword_attempts.status` (`in_progress` / `completed`) |
| `filled_count` | `count(distinct key)` over `jsonb_object_keys(cells)` ∪ `prefill_keys` ∪ `revealed_keys`: the expression `fn_crossword_play_list` already uses for the student's own list |
| `total_cells` | `count(distinct key)` over `fn_crossword_play_wordcells(puzzle_id)`, computed once per call |
| `last_saved_at`, `completed_at` | attempt columns |
| `checks_used`, `reveals_used`, `chosung_used` | attempt counters |
| `wrong_submits` | **`submits_used`** (see §9 item 3: verified, resolves PM item 6) |

Never selected: `cells`, `prefill_keys`, `revealed_keys`, event `detail`, answers, clues.

## 3. RLS impact

**None.**

- The three attempt tables keep RLS on, **no policy**, client privileges revoked. No new policy and no grant to `authenticated` or `anon`. The existing pgTAP cases (00013 section on student, teacher and anonymous refusals) keep passing unchanged and are the regression check.
- Teachers read progress only through the server function with the service role, so Row Level Security is not the access control for this feature; **the authorization inside the function is** (§4). This is the same model as the student play stack (doc 08 §C.9).
- The alternative of a teacher read policy and a view was rejected in m2/14 §3 (columns `cells` and `*_keys` would become readable by teachers).

### 3.1 Authorization inside the function (the important part)

Required, in this order:

1. `fn_crossword_actor_role(p_actor_id, p_school_id)`: active teacher or admin of the school, else `CROSSWORD_FORBIDDEN`.
2. Load the assignment with its classroom and puzzle; the classroom's school must equal `p_school_id`.
3. Allowed: the classroom's **owner**, a **co-teacher** of the classroom (`classroom_teachers`), or the school's **admin** (read-only; the function writes nothing).
4. Every other case raises **`CROSSWORD_NOT_FOUND`**, the same code for an unknown id and for "not allowed", so a guessed id learns nothing.

**Do not reuse `fn_crossword_actor_manages(actor, role, puzzle_id)`.** That helper is puzzle-level: it lets the puzzle owner, staff of the set's classroom, and staff of **any** classroom the puzzle is assigned to manage the puzzle. Used here, a teacher who manages the puzzle through classroom A would see the students of classroom B that received the same puzzle. The PM decision is owner and co-teachers **of that classroom**. The authorization must therefore be classroom-level, and pgTAP must test the two-classrooms case (§5).

## 4. Service-layer and UI impact

| Area | Change |
|---|---|
| New code | `src/features/crossword/results/` (`service.ts`, `view-model.ts`, `schemas.ts`); the only teacher-side code that touches attempt data |
| Call pattern | like `closeAssignment`: `createSupabaseAdminClient().rpc(...)` with `p_actor_id` and `p_school_id` from the session actor (`requireTeacherAreaPage()`), never from a request; `isUuid` check on the id first; `CROSSWORD_NOT_FOUND` mapped to the same not-found page |
| New route | `src/app/teacher/crosswords/[puzzleId]/assignments/[assignmentId]/page.tsx` (server component, `force-dynamic`), `notFound()` when `isCrosswordPlayEnabled()` is false |
| Link | one link "진행 보기" per assignment in `src/components/teacher/crossword-assignment-list.tsx`, rendered only when the flag is on (the list component receives a boolean from the page; the flag itself is read on the server) |
| Table component | one new component, e.g. `src/components/teacher/crossword-progress-table.tsx` (caption, `<th scope>`, text plus icon for state, the "as of" time) |
| Wording | a teacher-side catalogue test like the student one: no score, rank, "late" or penalty words; help shown as "도구를 활용" |
| Types | `database.ts` regenerated (one `Functions` block) |
| Student code, Galaxy Tab screens, API routes | **not touched** |
| F-1 interplay | independent: the page is a server page behind the same flag helper; no API route is added |

### 4.1 The hardening pin

`tests/access/crossword-hardening.test.ts:75` scans `src/features/crossword/review`, `src/app/teacher/crosswords`, and `src/components/teacher/crossword-*.tsx` for the literal strings `crossword_attempts`, `student_id`, `from("students")` and `owner_student`. Findings:

- The new service folder `src/features/crossword/results/` is **outside** that list, so the pin is not violated by the data access code.
- The new route and the new components are **inside** the list, so they must not contain those literals. The view-model should use camel-case names (`studentId`), which the pattern does not match.
- Result: the pin can stay **unchanged** if the route, the link and the table component respect it. m2/14 §5 assumed an amendment with an allow-list; that is a fallback, not a necessity. Decide at implementation; prefer leaving the pin as is, because it keeps guarding the page code.
- A new static guard on `results/` is still needed (no `cells`, `prefill_keys`, `revealed_keys`, `answer`, event `detail`).

## 5. pgTAP strategy

New file `supabase/tests/00015_crossword_assignment_progress.test.sql`, same fixture style as 00013/00014 (rolled back). Existing 00013 privilege checks use the name pattern `fn_crossword_play_%`, so they **do not cover** the new function: the new file asserts its privileges itself.

| # | Case | Expectation |
|---|---|---|
| 1 | Classroom owner, co-teacher, school admin | rows returned (admin read-only) |
| 2 | Teacher of the same school who is not staff of that classroom | `CROSSWORD_NOT_FOUND` |
| 3 | **Puzzle owner who is not staff of the classroom**, and a teacher who manages the puzzle through another classroom | `CROSSWORD_NOT_FOUND` (the case that `fn_crossword_actor_manages` would wrongly allow) |
| 4 | Teacher of another school; a student id; an unknown assignment id; a suspended teacher | `CROSSWORD_NOT_FOUND` or `CROSSWORD_FORBIDDEN` per step 1 of §3.1; unknown and not-allowed give the **same** message |
| 5 | Same puzzle assigned to two classrooms | each classroom's staff see only their own students and attempts |
| 6 | Roster | enrolled active students without an attempt are `not_started`; removed enrollments are absent; a student with an attempt in another assignment does not leak |
| 7 | Numbers | `filled_count` equals `fn_crossword_play_list`'s value for the same attempt; `total_cells` equals the distinct cells of the puzzle; counters equal the attempt row |
| 8 | `wrong_submits` | equals `submits_used` and equals the number of `submit_wrong` events after wrong submits and after a completing submit (the completing submit adds neither) |
| 9 | Allow-list | the function's result columns exactly equal the documented list; none of `cells`, `prefill_keys`, `revealed_keys`, `detail`, `answer` |
| 10 | Privileges | not executable by `anon`, `authenticated`, `PUBLIC`; executable by `service_role`; attempt tables still have RLS on, zero policies, no client `SELECT` |
| 11 | Shared attempt shape | two members of one attempt both appear with the same progress |
| 12 | States of the assignment | closed assignment and archived classroom are readable |

Plus **vitest**: service mapping, session-derived actor, not-found mapping, view-model labels, page rendering test (roles, caption, no forbidden words, sort by student number then name), flag-off `notFound`, the static guard on `results/`, the hardening pin left intact. A negative control (remove the classroom-level check and see cases 2, 3, 5 fail) goes into the verification, as was done for `…0004` and F-1.

Local prerequisites: Docker Desktop and the local stack (it is currently stopped on this machine; `supabase test db` and the flow tests need it).

## 6. Rollout sequence

| # | Step | Gate |
|---|---|---|
| 0 | Preconditions: `pilot/12` revision approved, `pilot/13` status resolved, PM implementation go-ahead | PM, school |
| 1 | Implement locally on the M2 branch: migration, service, page, tests. No hosted action | local checks green (typecheck, lint, vitest, `supabase test db`, build) |
| 2 | Review of the diff against this document; negative control run | reviewer |
| 3 | **Impact report to the PM**, then **explicit PM go** (rule of 2026-10-20: after an impact report, stop and wait) | PM |
| 4 | Hosted `supabase db push`: exactly one migration (check `supabase db push --dry-run` first) | PM go; hosted data not changed |
| 5 | Deploy the app code (Preview or the chosen target). The page is hidden while `CROSSWORD_PLAY_ENABLED` is off, so nothing becomes visible | flag off |
| 6 | Hosted verification with `SMOKE` data on a deployment that is **connected to the database** (see §8 risk R8): create a test classroom, student, puzzle and attempt, call the page as owner, co-teacher, admin and as an unrelated teacher, compare counts, remove the data | PM; needs the hosted-acceptance conditions of [m2/09](09-g5-device-validation.md) §9 (flag on for a short window, F-1 closed, no real student involved) |
| 7 | Close TV-1 and condition C-6 in m2/11 | PM |

Order rationale: the database function can be applied before the app code (nothing calls it); the app code must not be deployed with the page visible before the function exists (a missing function would surface as an error page; the flag keeps it hidden until step 6).

## 7. Rollback strategy

| Layer | Rollback | Effect |
|---|---|---|
| Visibility | set `CROSSWORD_PLAY_ENABLED` off (or leave it off) | link and page disappear at once; no data involved |
| App code | revert the commit and redeploy (a Vercel Preview or Production redeploy of the previous commit) | page gone; nothing else depends on it |
| Database | **forward-only migration** `DROP FUNCTION public.fn_crossword_assignment_progress(uuid, uuid, uuid);` | no table or data is affected; no student data was created by this feature; erasure of students and the cleanup trigger are unaffected |
| Types | revert the `database.ts` block with the app commit | none |

The feature is read-only and adds no stored data, so rollback never involves data repair. Rolling back the app before the database is safe; dropping the function while the page is deployed makes the page show an error, hence the flag-off step first.

## 8. Risk assessment

| # | Risk | Likelihood | Impact | Handling |
|---|---|---|---|---|
| R1 | Authorization copied from the puzzle-level helper lets a teacher see another teacher's class | medium if reused unchecked | **High** (student data) | classroom-level check in §3.1, pgTAP cases 2, 3, 5, negative control |
| R2 | Information leak through different errors for unknown and forbidden ids | low | Medium | same `CROSSWORD_NOT_FOUND`; note the existing `close` function answers FORBIDDEN and NOT_FOUND differently, this function intentionally does not |
| R3 | A column slips into the result (letters, keys, detail) | low | High | fixed return type, pgTAP case 9, static guard on the service folder |
| R4 | Numbers differ from what the student sees (progress, help counts) | low | Medium | parity test with `fn_crossword_play_list`; `submits_used` semantics tested (case 8) |
| R5 | Page visible while Student Play is off, showing everyone "not started" | low | Low | flag gate on link and page, rendering test |
| R6 | Governance: teacher access used before `pilot/12` revision and `pilot/13` | process | **High** | step 0 and the hosted NO-GO of §0; the flag stays off |
| R7 | Names of students shown to teachers and admins | by decision | Medium | scope owner, co-teachers, admin read-only; no export; no log in this phase; wording of the notice in the `pilot/12` draft |
| R8 | The current Preview has no Supabase variables, so the feature cannot be verified on hosted as it is | certain today | Medium | verification needs a database-connected deployment; adding Preview variables is the owner's decision (shares the pilot database); [m2/15](15-f1-hosted-verification-plan.md) §6 |
| R9 | Production setup is unclear (tracks `main`, no Production deployment) | certain | Medium | no merge to `main` without PM approval; TV-1 rollout targets whichever deployment the PM names |
| R10 | Hardening pin is weakened by a careless amendment | low | Low | keep the pin unchanged if possible (§4.1) |
| R11 | Performance of the call | low | Low | one call per page view, tens of rows, existing indexes (`idx_crossword_attempts_assignment`, the member unique key) |
| R12 | Local tests cannot run (Docker stopped) | certain until Docker is started | Low | start Docker Desktop before step 1 |

## 9. Corrections and clarifications to m2/14

1. **Authorization is classroom-level, not the existing puzzle-level helper** (§3.1). m2/14 §4 describes the rule correctly in words; this review makes the pitfall explicit and adds the test.
2. **Unknown and not-allowed ids give `CROSSWORD_NOT_FOUND`**, as m2/14 says, which differs from the style of the existing `close` function (FORBIDDEN versus NOT_FOUND). Intentional.
3. **`wrong_submits` (the open item 6 of the 2026-10-20 decisions) is resolved: use `crossword_attempts.submits_used`.** Verified in `fn_crossword_play_submit`: the completing submit returns before the counter, and the only increment of `submits_used` sits in the wrong-submit branch together with the single `submit_wrong` event insert. So the column equals the number of wrong submits and equals the number of `submit_wrong` events; no event scan is needed. pgTAP case 8 pins the equality.
4. **The hardening pin probably needs no amendment** (§4.1); m2/14 §5 assumed it would.
5. **Admin read-only** (PM decision of 2026-10-20) is added to the function check; m2/14 §4 step 2 and §11 already say so.
6. The existing 00013 privilege checks do not cover a function named `fn_crossword_assignment_progress` (they match `fn_crossword_play_%`); the new pgTAP file must assert its own privileges.

## 10. Estimated work (qualitative)

One migration with one function (the SQL is about the size of `fn_crossword_play_list`), one service folder of three small files, one page, one component, one link, one pgTAP file, one vitest file plus guards, a `db:types` regeneration. Small to medium; no change to student code or screens.

## 11. Decision requested

1. Approve **GO for local implementation** with the clarifications of §9 (and the preconditions of §6 step 0 for anything beyond local).
2. Confirm that the hosted rollout is **NO-GO** until `pilot/12` revision and `pilot/13` are resolved and the impact report receives an explicit go.
3. Decide how to obtain a database-connected deployment for step 6 (R8) when the time comes; nothing needs to be done now.
