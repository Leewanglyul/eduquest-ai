# Stage 1 Gate 3 Integrated Implementation Package (2026-11-02)

Status (updated 2026-11-03, R2 B0-1): **local implementation approved and complete; local code commits approved and
created; push NOT approved; Hosted Gate 3 NOT approved.** This document itself changes no code, schema, migration,
route, flag or deployment.

| Step | State | Evidence |
|---|---|---|
| Planning direction | approved (PM, 2026-11-02) | commit `76481a4` |
| Local implementation (AP-1) | **approved and complete** | L1 to L3 and TP-0; targeted 445/445, full Vitest 876/876, pgTAP 780/780 |
| Local code commits (AP-5, commit part) | **approved and created** | `db9e058`, `d60055a`, `b9c7f95`; `7130ecd` recorded OD-TP17 in the Teacher Package Specification and in this package |
| Push (AP-5, push part) | **not approved** | a push triggers an automatic Preview deployment, flags OFF |
| Hosted Gate 3 (AP-6 to AP-9) | **not approved** | section 7, 8, 10 and 13 |

Classification: **feature / implementation package** (level 3 of the [governance hierarchy](../governance/README.md)),
not a governance document. Where it disagrees with a governance document, the governance document wins and the
conflict is reported to the PM.

Scope: **A. TP-0 Teacher Minimum** and **B. P3 Student Team Play**, for the first Gate 3.

Basis:
- [PROJECT_CONSTITUTION](../../PROJECT_CONSTITUTION.md).
- [Long-Term Product Direction v1](../governance/long-term-product-direction-v1.md), Stage 1 (current focus).
- P1 schema and **P2 function layer: Acceptance SUCCESS / CLOSED** (two migrations, fingerprints 28 / 28, security
  checks passed, W1 baseline unchanged, H10 cleanup completed). Not reopened.
- P3 readiness (P3-D1 to D8, D9) and the P3 implementation package of 2026-11-01 (PM-approved plans, not stored in
  the repository); their board integration points and conflict rules are reproduced in appendices A and B.
- [Teacher Package Specification](../governance/teacher-package-specification-v1.md) sections 7 and 7.1 (Gate 3 scope
  decisions **G3-D1 to G3-D7**), [Operational UX Principles](../governance/operational-ux-principles-v1.md) OX-1 to
  OX-13, [Collaboration Governance Package](../governance/eduquest-collaboration-governance-package-v1.md) sections C,
  H and I, [Teacher Dashboard and Classroom Operations](../governance/teacher-dashboard-and-classroom-operations-v1.md).
- TV-1 teacher visibility: [docs/m2/13](../m2/13-teacher-visibility-review.md),
  [docs/m2/14](../m2/14-tv1-teacher-visibility-design.md).

**No database change and no new migration.** Every function this package calls already exists (P2 and TV-1).

### Approved package decisions (PM, 2026-11-02)

| # | Decision |
|---|---|
| PD-1 | Route placement: `/teams` and `/live` under the existing teacher-authenticated route structure (`/teacher/crosswords/[puzzleId]/assignments/[assignmentId]/…`, guarded by `requireTeacherAreaPage`) |
| PD-2 | Blocked state: **operational conditions only**; no automatic learning-stuck inference |
| PD-3 | Last-progress time: **teacher reference only**; no threshold-based student judgement |
| PD-4 | Hardening test: the new teacher code is included in the **existing** rule; no assertion is weakened and no exception is added |
| PD-5 | Teacher live refresh: **10-second automatic refresh**, a **manual refresh**, a visible **last-updated time**; automatic refresh may pause while the page is hidden |
| PD-6 | No new database migration |
| PD-7 | All approved Gate 3 exclusions stay (section 11) |

---

## 1. Route and component inventory

### 1.1 Student routes (B)

All student routes keep `playRoute` (flag gate first, same-origin, JSON, session-derived student, strict body,
error map).

| Route | Status | Change |
|---|---|---|
| `GET /student/crosswords/[assignmentId]/api/team-state?known=<n>` | **new** | team state for polling (section 2); `known` a non-negative integer or absent |
| `POST /student/crosswords/[assignmentId]/api/help` | **new** | body `{}` (strict); "call teacher" |
| `GET .../api/state` | changed | payload gains `team: { label, memberCount } \| null` |
| `POST .../api/save`, `check`, `reveal`, `chosung`, `submit` | contract unchanged | team behaviour comes from the P2 functions; new error codes `NO_TEAM`, `HELP_COOLDOWN` |
| page `/student/crosswords` | changed | team badge; "팀 배정 대기" card that cannot be opened (D-4) |
| page `/student/crosswords/[assignmentId]` | changed | `NO_TEAM` → waiting view; team board when `payload.team` |
| page `/student/crosswords/[assignmentId]/result` | changed | team wording; participation positive only (P3-D4) |

### 1.2 Teacher routes (A)

| Route | Status | Content |
|---|---|---|
| `/teacher/crosswords/[puzzleId]/assignments/[assignmentId]` | changed | existing TV-1 page; gains links to "팀 구성" and "수업 중 보기"; remains the **post-session** view (filled / total stays teacher-only, roster order, never sorted by progress) |
| `/teacher/crosswords/[puzzleId]/assignments/[assignmentId]/teams` | **new** | T-1 mode choice and T-2 manual team setup |
| `/teacher/crosswords/[puzzleId]/assignments/[assignmentId]/live` | **new** | T-3 to T-6 **in-class view**: student state, team help state, blocked state, close; phone-width first (OX-10); refresh per PD-5 |
| Server actions in `src/features/crossword/teams/actions.ts` | **new** | `setPlayModeAction`, `createTeamAction`, `deleteTeamAction`, `assignStudentAction`, `unassignStudentAction`, `resolveHelpAction` |

Teacher pages are hidden while `isCollabPlayEnabled()` is false (like the TV-1 page with the play flag), except the
existing TV-1 page, which keeps its current rule.

### 1.3 Modules and components

| Area | File | Status |
|---|---|---|
| Flags | `src/lib/flags.ts`: `isCollabPlayEnabled()` = play flag AND `COLLAB_PLAY_ENABLED` (same explicit / local-host rule) | changed |
| Play access | `src/features/crossword/play/access.ts` (`requirePlayAccess`): a team-mode assignment is `NOT_FOUND` while collab is off | changed |
| Play service | `src/features/crossword/play/service.ts`: `getTeamState`, `requestTeamHelp`; list rows `playMode`, `teamWaiting` | changed |
| Play payload, types | `payload.ts`, `types.ts`: `team`, `TeamState` (allow-list mapper) | changed |
| Errors, messages | `errors.ts`, `messages.ts`: `NO_TEAM` (409), `HELP_COOLDOWN` (429 with `retryAfterSeconds`) and Korean texts | changed |
| Merge helpers | `src/features/crossword/play/team.ts`: `mergeTeamCells`, `teammateChanges`, `lockedPendingKeys` (pure) | **new** |
| Poller | `src/components/student/team-poller.ts` (pure class, injected fetch, timers, clock) | **new** |
| Notice | `src/components/student/team-notice.tsx` (one visible, about 5 s, polite live region, D9) | **new** |
| Board | `crossword-play-board.tsx` integration points I-1 to I-16 of the P3 package (I-12 help button = "선생님 부르기") | changed |
| Student UI | `play-tools.tsx`, `crossword-play-list.tsx`, `crossword-result.tsx`, `[assignmentId]/page.tsx` | changed |
| Teacher service | `src/features/crossword/teams/service.ts`, `types.ts`, `view-model.ts` (blocked-state rule, labels) | **new** |
| Teacher components | `src/components/teacher/crossword-team-mode-control.tsx`, `crossword-team-setup.tsx`, `crossword-live-view.tsx`, `crossword-help-resolve-button.tsx` | **new** |
| Database types | `src/types/database.ts` regenerated for the P2 functions and the two new list columns | changed |

Not changed: IME controller, `use-grid-input`, `PlayGrid` cell rendering (no teammate marks), save debounce, every
migration.

---

## 2. Function-to-route map

| Route or action | Database function (existing) | Notes |
|---|---|---|
| student `state` | `fn_crossword_play_start` (delegates to `fn_crossword_team_play_start` in team mode) | `NO_TEAM` when the student has no team |
| student `save` | `fn_crossword_play_save` | team: revision rises only on changed keys; writers, solves, credits recorded |
| student `check` | `fn_crossword_play_check` | revision still validated (D-5); one automatic retry on STALE (K-6) |
| student `reveal` | `fn_crossword_play_reveal` | team: no STALE (D-5) |
| student `chosung` | `fn_crossword_play_chosung` | shared team budget (D-6) |
| student `submit` | `fn_crossword_play_submit` | team: latest saved state (E-2) |
| student `team-state` | `fn_crossword_team_state` | mapped field by field: revision, status, changed, helpOpen, used, cells / given / otherKeys iff changed, participation iff completed |
| student `help` | `fn_crossword_team_help_request` | one open per team; `HELP_COOLDOWN` within 60 s of a resolution |
| student list | `fn_crossword_play_list` | `play_mode`, `team_waiting` |
| teacher `setPlayModeAction` | `fn_set_crossword_assignment_mode` | `MODE_LOCKED`, `TEAMS_EXIST`, `BAD_MODE` |
| teacher `createTeamAction` / `deleteTeamAction` | `fn_crossword_team_create` / `fn_crossword_team_delete` | `TEAM_LABEL_TAKEN`, `BAD_LABEL`, `NOT_TEAM_MODE`, `TEAM_STARTED` |
| teacher `assignStudentAction` / `unassignStudentAction` | `fn_crossword_team_assign` / `fn_crossword_team_unassign` | `TEAM_FULL`, `TEAM_STARTED`; late add to a started team allowed |
| teacher teams page, live view | `fn_crossword_team_list` | team_id, label, started, member_count, under_min, help_open, students incl. unassigned |
| teacher live view (student state, team last progress) | `fn_crossword_assignment_progress` (TV-1) | per-student state via attempt members; the team attempt's `last_saved_at` as the team-level last-progress time; **counts not shown in the live view** |
| teacher `resolveTeamHelpAction` | authorised `fn_crossword_team_list` → server-only open request-id lookup → `fn_crossword_team_help_resolve` | see 2.1 (R2 B0-2) |
| teacher close | `closeAssignment` (built) | unchanged |

**Blocked state (Gate 3 rule, computed in the teacher view model; PD-2):** operational conditions only: the
assignment is not open yet (scheduled) · a team has no members · students are unassigned while the assignment is open
in team mode. No automatic learning-stuck inference.

**Last-progress time (PD-3):** the team attempt's `last_saved_at`, shown next to the team as a reference for the
teacher. No threshold, no "inactive" label, no per-student timing, no judgement about a student (PKG I-2, OX-4 V4-3).

---

### 2.1 Help-resolution contract (R2 B0-2)

`resolveTeamHelpAction` → `resolveTeamHelp` in `src/features/crossword/results/team-help-resolution.ts` (server-only;
Gate 3 contract-gap workaround approved by the PM on 2026-11-02, not a precedent):

1. **Authorisation first:** the assignment-scoped `fn_crossword_team_list` runs with the session actor; the team must be
   in its result. Assignment and team therefore come from authorised data; the browser sends only the assignment and
   team ids it was shown, and never a request id.
2. **Server-only lookup:** the admin client selects **only `id`** from `crossword_team_help_requests` for that team where
   `resolved_at is null`, at most two rows. No student, no requester, no other column.
3. **Result handling:** zero rows → `{ resolved: false }` (no-op, e.g. a colleague resolved it); one row → step 4; more
   than one → controlled error `HELP_STATE_INVALID`, nothing changed.
4. **Final authorisation:** `fn_crossword_team_help_resolve` checks the actor again (owner or co-teacher of the
   assignment's classroom; school admin and other teachers refused).
5. **Response:** `{ resolved: boolean }` only; the request id never reaches the browser.
6. **Guard:** a hardening test allows a direct `.from("crossword_team_help_requests")` in this one file only.

## 3. Implementation steps

| Step | Workstream | Content | Done when |
|---|---|---|---|
| 1 | shared | `isCollabPlayEnabled`, error codes and messages, list row, `payload.team`, `database.ts` regeneration | flag and contract tests green |
| 2 | A | teams service and actions; `/teams` page with mode control and team setup | teacher tests green; pgTAP 00017 unchanged |
| 3 | B | `team-state` and `help` routes; `team.ts` helpers; `TeamPoller`; `TeamNotice` | merge, poller, contract tests green |
| 4 | B | board integration I-1 to I-16; list, entry and result pages | team UI tests green |
| 5 | A | `/live` in-class view with PD-5 refresh; help resolve; close; links from the TV-1 page | live-view tests green |
| 6 | A + B | local team flow with two and three students against local Supabase | flow test green |
| 7 | B | degradation cases (offline, 5xx, flag off mid-session, completion while typing) | degradation tests green |
| 8 | all | full regression: vitest, tests/access, pgTAP (780), lint, typecheck, build | all green, no existing test modified except as listed in 4.2 |
| 9 | - | report; local commits approved and created (`db9e058`, `d60055a`, `b9c7f95`, `7130ecd`); push only after a separate approval (a push triggers an automatic Preview deployment, flags remain OFF) | PM decision |

---

## 4. Local test files and expected coverage

### 4.1 New files

| File | Covers |
|---|---|
| `tests/access/crossword-team-flags.test.ts` | 4 flag combinations × team-state, help, existing routes on a team assignment, student list, teacher `/teams` and `/live` |
| `tests/access/crossword-team-contract.test.ts` | TeamState key allow-list; no uuid-shaped string in any response; `cells` / `given` / `otherKeys` iff `changed`; `participation` iff completed; help response; `payload.team` has only label and count |
| `tests/access/crossword-team-merge.test.ts` | K-1 to K-5 (pending wins, composition untouched, last save wins, teammate-change detection, locked pending keys) |
| `tests/access/crossword-team-poller.test.ts` | 4 s interval, pause when hidden and poll on visible, backoff 1 to 30 s, stop on completion and 404, single flight, known revision only from team-state |
| `tests/access/crossword-team-ui.test.tsx` | heading "1팀 · 3명", no names; D9 one notice, about 5 s; "선생님 부르기" states (open, cooldown seconds, hidden when read-only); participation wording positive only; waiting view |
| `tests/access/crossword-team-teacher.test.ts` | actions: authorisation (owner, co-teacher write; admin read-only; other school refused), error mapping, mode lock after start, max 4, move refused after start, late add allowed, resolve idempotent |
| `tests/access/crossword-team-live-ui.test.tsx` | the live view shows only student state, team help state, blocked state and close; **no contribution counts, no balance, no filled / total, no ordering other than roster order**; blocked-state rule (PD-2); last-progress time without any threshold label (PD-3); 10 s automatic refresh, manual refresh, last-updated time, pause while hidden (PD-5) |
| `tests/access/crossword-team-flow.test.ts` | local Supabase (pattern of `crossword-play-flow.test.ts`): teacher sets team mode and teams; two or three students join, save, poll, reveal vs pending, check retry, call teacher, teacher resolves, cooldown, submit, completion for every member, a late joiner |
| `tests/access/crossword-team-degradation.test.ts` | offline 60 s without input loss (V11-1), 5xx retries, flag off mid-session gives "not available" and keeps data, READONLY on completion while typing (K-9) |

### 4.2 Existing files touched deliberately

| File | Change | Why |
|---|---|---|
| `tests/access/crossword-hardening.test.ts` | add `src/features/crossword/teams` to the teacher-side file list; the existing assertion (no `crossword_attempts`, `student_id`, `from("students")` or `owner_student` in teacher-side code) is **unchanged**: no assertion is weakened and no exception is added (PD-4). New teacher code therefore uses camel-case fields mapped from function results | the new teacher code stays inside the existing hardening rule |

### 4.3 Expected coverage

Every new route and action has at least one authorisation test, one flag test and one contract test; every K-rule
and every in-class rule has a unit test; the flow test exercises every P2 function used here at least once.

---

## 5. Individual-mode regression

| Check | Expectation |
|---|---|
| Existing suites (`crossword-play-*`, `crossword-progress-ui`, flag routes and service, IME, save queue, static) | pass **unmodified** |
| pgTAP | 780 pass (652 earlier + 00017 61 + 00018 67) |
| Individual assignment with collab flag ON | identical behaviour: no `team` in the payload, no team-state polling, STALE still reloads (I-6) |
| Individual assignment with collab flag OFF | identical to today |
| TV-1 page | unchanged for individual assignments |
| Hosted | the short W1 path on the individual assignment and `p1-w1-data-check.sql` during the Gate 3 window |

---

## 6. Gate 3 hosted checks (Acceptance, SMOKE / test accounts only)

| # | Check | Local proof | Hosted evidence |
|---|---|---|---|
| C-1 | Flag guard, 4 combinations | flags tests | probe script, status codes |
| C-2 | Teacher sets team mode and teams; changes refused after start | teacher tests; 00017 | screens + owner SQL (teams, members, play_mode) |
| C-3 | Members join one attempt | 00018; flow | SQL: one attempt, members = team size |
| C-4 | Input appears for teammates within one poll; survives reload | poller; flow | two browser profiles + SQL revision |
| C-5 | Neutral notice "다른 팀원이 수정했어요"; no names or counts on student screens | contract; UI | screen + response key list |
| C-6 | Reveal vs pending (K-5); check retry (K-6) | merge; flow | screen + SQL counters |
| C-7 | Submit while a teammate types; completion for every member; participation only after completion | 00018; flow | SQL status, events, credits + screens |
| C-8 | Call teacher: team-level, one open, 60 s cooldown, teacher resolves | 00018; teacher tests | SQL help_requests (no student column) + teacher screen |
| **C-9** | **The teacher in-class view shows student state and team help state (plus blocked state and close) without per-student contribution counts or balance indicators** | live-view tests | screen + response fields |
| C-10 | Launch timing (G3-D3): assignment open → every team started; at least 90 % of present test students made a first input; external device faults recorded separately | - | timed run log |
| C-11 | Student removal rehearsal (G4) | 00018 | SQL |
| C-12 | Individual-mode regression | section 5 | W1 path + w1-data-check |
| C-13 | OFF Return | flags tests | section 10 |

Galaxy Tab, phones and TalkBack: recommended, not blocking (decision #6).

---

## 7. Governance preconditions

Each needs its own PM approval before the hosted run (planning and local implementation are not blocked):

| # | Precondition | State |
|---|---|---|
| G3-P1 | P2 on Acceptance | **SUCCESS / CLOSED** |
| G3-P2 | This package implemented, tested locally and committed | open |
| G3-P3 | Teacher minimum (workstream A) | part of this package |
| G3-P4 | **G3-D5 approval:** SMOKE / test accounts only; no real student data; no real names; credential-safe evidence; a cleanup / retention decision; the **Governance #6** decision | open |
| G3-P5 | Flag window approval (section 8) | open |

Governance checks carried in the package report: no classmate names on student screens (C-2, C-3, P3-D1); in-class
view limited to TPS 7 (C-9); team-level last progress only, no personal stuck time (I-2); no behaviour-type metrics
(I-1); no signal data of any kind (G3-D2); readability and one visible notice (CE-11, D9); admin read-only for team
operation (D-1); not grading, no export (G3); projection safety of the live view (OX-12); minimum data (OX-13).

---

## 8. Flag-window procedure

Every hosted change below needs a separate approval; read-only checks (`vercel env ls`, `vercel ls`, `vercel inspect`)
are done by Claude.

| Step | Action | Evidence |
|---|---|---|
| F-0 | Read-only: current env rows (both flags), current branch deployment, Production untouched | CLI output |
| F-1 | (approval) `COLLAB_PLAY_ENABLED=true` and `CROSSWORD_PLAY_ENABLED=true` for **Preview, branch-scoped** to `m2/m2-1-content-pipeline` only | `vercel env ls` |
| F-2 | (approval) one redeploy of the branch | deployment id, Ready |
| F-3 | Probe: flag-guarded routes answer as ON | probe script |
| F-4 | Gate 3 checks C-1 to C-12 within the approved window | section 6 evidence |
| F-5 | OFF Return (section 10) | section 10 evidence |

Production, aliases, promote and rollback are never touched.

---

## 9. Failure and rollback rules

**Stop conditions** (stop the run, go to OFF Return, report; no retry, no hot-fix on hosted, no manual SQL fix):
- any classmate name, student id or uuid on a student screen or in a student response;
- any per-student count or balance in the in-class teacher view;
- a help request that identifies a student;
- loss of a saved cell, or a student's input appearing in another team;
- any individual-mode regression (C-12) or a W1 data-check difference;
- a flag guard failure (C-1);
- any change outside the approved window (Production, aliases, other env rows).

**Rollback**

| Layer | Rule |
|---|---|
| Exposure | OFF Return first (section 10) |
| App code | revert the package commit(s); nothing else depends on them |
| Database | **nothing to roll back:** no migration in this package. The P2 rollback script exists (guarded against team attempts) and is used only with a separate PM decision |
| Test data | removed by the approved cleanup / retention decision (G3-D5) after PM review |

---

## 10. OFF Return

| Step | Action | Evidence |
|---|---|---|
| O-1 | (approval) `COLLAB_PLAY_ENABLED` and `CROSSWORD_PLAY_ENABLED` set OFF for the branch | `vercel env ls` |
| O-2 | (approval) one redeploy | deployment id, Ready |
| O-3 | Probe: every play and team route blocked; teacher `/teams` and `/live` not found; TV-1 page hidden as today | probe script |
| O-4 | Owner SQL: data kept (attempts, teams, members, help requests); counts recorded | SQL output |
| O-5 | Read-only: Production unchanged; branch alias on the OFF deployment | `vercel ls`, `vercel inspect` |

---

## 11. Explicit exclusions

Not in this package and not in the first Gate 3:

| Excluded | Where it goes |
|---|---|
| Ask Team structured signal | Live Collaboration Presence Package (Future Priority 2) |
| Anonymous current-clue awareness | Live Collaboration Presence Package |
| Supabase Realtime | Live Collaboration Presence Package |
| Migration C | not created |
| Shared-Action Jigsaw (clue-sharing game actions) | later package (Priority 3) |
| Free-text chat | deferred (PKG I-7) |
| Team competition | later (Priority 4, TPS OD-6) |
| Combo | later (DV 3.1) |
| Badges | later (GM 7) |
| Growth Record | Growth Model implementation (after data governance) |
| Review Mode | Growth Model implementation (GM 3.6) |

Also not included: per-student contribution counts and balance (excluded from the MVP), add time, pause / resume,
skip clue, accept answer, random or heterogeneous grouping, QR join, audit events (G3-D4).

---

## 12. Decisions and approvals still required

| # | Item | Type |
|---|---|---|
| AP-1 | ~~Implementation approval for this package (local only)~~ **Approved and complete** | done |
| AP-2 | ~~Route placement and blocked-state rule~~ **Decided** (PD-1, PD-2, PD-3) | decided |
| AP-3 | ~~Hardening-test amendment~~ **Decided** (PD-4) | decided |
| AP-4 | ~~Live view refresh~~ **Decided** (PD-5) | decided |
| AP-5 | Commit: **approved and created**. Push (automatic Preview deployment with flags OFF): **not approved** | push open |
| AP-6 | G3-D5 precondition approval incl. Governance #6 (G3-P4) | approval |
| AP-7 | Flag window and redeploy (F-1, F-2) | approvals |
| AP-8 | OFF Return env change and redeploy (O-1, O-2) | approvals |
| AP-9 | Test-data cleanup after Gate 3 | approval |
| Open | Audit policy before real-student use (OD-9); data governance amendments before real students (OD-12) | governance |
| OD-TP17 | Assignment close authority alignment (TPS 10.1): `/live` reuses the existing close unchanged for Gate 3; blocking before a real-student pilot | governance |

---

## 13. Hosted Gate 3 protocol notes (R2 Part I, documentation only)

| # | Note |
|---|---|
| HP-1 | Use **neutral team labels only** (1팀, 2팀 ...) during Hosted Gate 3 |
| HP-2 | `/live` is teacher-only and **must not be projected** (OX-12) |
| HP-3 | **Small-team anonymity is contextually limited:** in a team of 2 or 3, "다른 팀원이 수정했어요" or a help call can be attributed by the students in the room; the screens add nothing identifying, but the context can |
| HP-4 | **Setup duration** (teacher creating teams, assigning students) is logged separately from C-10, which starts at assignment open |
| HP-5 | Evidence order for regression: **clean local reset → pgTAP → Vitest** (pgTAP 00004 counts audit rows that Vitest persists) |
| HP-6 | A **pre-reviewed puzzle** is required (OX-6); no puzzle is generated or reviewed during the run |
| HP-7 | C-4 adds a **throttled-network observation** (slow connection on one profile) |
| HP-8 | **Premature submit** (a member submits while teammates still type) is an observation item, not a failure |
| HP-9 | **Real-student pilot blockers** (not Gate 3 blockers): a projection-safe live view, and Android Korean IME validation in team mode |
| HP-10 | The team-play switch cannot be enabled on a Preview hostname by the local-host rule: the rule reads only the Supabase URL, which is hosted on Preview; only explicit `COLLAB_PLAY_ENABLED=true` with `CROSSWORD_PLAY_ENABLED=true` turns it on (test in `crossword-team-flags.test.ts`) |

## 14. R2 review findings: closure status (Same-Session Red Team Review, R2; closure accepted by the PM 2026-11-03)

| Finding | Closure | Where |
|---|---|---|
| B0-1 approval trail | closed | Status table at the top of this package |
| B0-2 help-resolution contract | closed | 2.1 |
| B1-1 help-resolution security (authorisation first, id-only read, cross-school and school-admin refusal, id never returned, final RPC check) | closed | 2.1; `crossword-team-teacher.test.ts`; help-table read guard in `crossword-hardening.test.ts` |
| Poll / save ordering (stale poll below the acknowledged save revision ignored, no false notice) | closed | `team-board.ts` `decidePoll`; `crossword-team-board.test.ts` |
| LOCKED_CELL recovery (state refreshed first, one attempt per refused batch, no silent discard) | closed | `team-board.ts` `makeLockedRecovery`, `save-queue.ts`; `crossword-team-save-queue.test.ts` |
| TV-1 team-mode semantics (team: no per-student figures; collab off: unavailable; individual unchanged) | closed | `results/view-model.ts` `progressViewKind`, TV-1 page; `crossword-team-teacher.test.ts` |
| Participation contract (`{ me, all }` only, absent before completion) | closed | `crossword-team-contract.test.ts` |
| Individual STALE regression with team play on | closed | `crossword-team-board.test.ts` (R2 G) |
| Help lifecycle (no active call when completed or closed; cooldown from server seconds) | closed | `teams/live.ts`, `team-board.ts` `teacherCallDeadline`; live and board tests |
| Preview hostname cannot enable team play | closed | HP-10; `crossword-team-flags.test.ts` |

## Appendix A. Board integration points (from the P3 implementation package, 2026-11-01)

Team mode only (`payload.team !== null`); individual mode is unchanged.

| # | Place | Change |
|---|---|---|
| I-1 | state init | add `serverCells` (last polled), `teamUsed`, `helpOpen`, `participation` |
| I-2 | `queue` (SaveQueue) | unchanged sender; on `LOCKED_CELL` in team mode drop the locked keys and resend instead of entering `blocked` (K-5); individual mode keeps `blocked` |
| I-3 | new effect next to the autosave effect | create TeamPoller; `visibilitychange` → `setVisible`; online / offline → pause / `pollNow` (K-10) |
| I-4 | poll result handler | `setCells(mergeTeamCells(...))`; `setGiven(state.given)`; discard pending keys now given; teammate-change notice (K-4, D9); team counters; `helpOpen` |
| I-5 | controller mirror effect (`grid.setWord`) | refresh when polled cells change for the selected word, skipped while `grid.isComposing()` (K-2) |
| I-6 | `fail()` | STALE: individual keeps reload; team: no reload. Check: `pollNow()`, then one retry with the new revision; a second STALE gives CHECK_BUSY (K-6, P3-D6) |
| I-7 | `savedRevision()` | team mode: after `queue.idle()`, use the poller's latest revision if newer |
| I-8 | `doReveal` | team: base revision not needed (D-5); keep sending it (contract unchanged) |
| I-9 | `doSubmit` | unchanged flow (flush, submit); on completed: stop the poller |
| I-10 | READONLY on save (team) | completion by a teammate: discard pending, `pollNow()`, show completion (K-9) |
| I-11 | completion | teammates: on `status = completed` show the completion moment once per student (sessionStorage key per attempt, try / catch, no storage = no moment) (P3-D5) |
| I-12 | `PlayTools` | counters from team totals (`limit - used`, D-6); "선생님 부르기" button with states (open, cooldown seconds, hidden when read-only) |
| I-13 | heading | "1팀 · 3명" (P3-D1) |
| I-14 | `crossword-result.tsx` | team wording; participation text positive only (P3-D4) |
| I-15 | `crossword-play-list.tsx` | team badge, waiting card (D-4) |
| I-16 | `page.tsx` (entry) | catch `NO_TEAM` from start → waiting view |

## Appendix B. Conflict rules (from the P3 readiness package, 2026-11-01)

| # | Situation | Rule |
|---|---|---|
| K-1 | Polled cells vs my unsent or in-flight cells | screen = server cells overlaid by my pending keys; pending wins until confirmed or rejected |
| K-2 | IME composition in progress on a cell | never replace that cell; apply the polled value after composition ends |
| K-3 | Same cell typed by two members | last save wins on the server; the next poll shows the result to both |
| K-4 | A cell I wrote is changed by a teammate | it appears in `otherKeys` with a new value: "다른 팀원이 수정했어요" once per poll |
| K-5 | Teammate reveals a cell I have pending | drop that key when `given` contains it; on `CROSSWORD_PLAY_LOCKED_CELL` remove locked keys and resend the rest |
| K-6 | Check after a teammate saved | flush, refresh state, retry once automatically; a second STALE: "팀원이 입력 중이에요. 잠시 후 다시 확인해 보세요" |
| K-7 | Reveal | no STALE in team mode (D-5); merged like K-5 |
| K-8 | Submit | flush my pending first, then submit (E-2); a teammate's unsent typing is not included |
| K-9 | Team completed while I am typing | my save returns READONLY: discard pending, show the completion screen with a short note |
| K-10 | Offline | existing offline indicator; polling pauses; on reconnect: save first, then poll |

---

## 15. Change History

| Version | Date | Change |
|---|---|---|
| 1 | 2026-11-02 | Registered from the planning package; PD-1 to PD-7 applied; appendices A and B reproduced from the P3 packages |
| 2 | 2026-11-02 | OD-TP17 recorded (commit `7130ecd`) |
| 3 | 2026-11-03 | R2 reconciliation: approval trail (B0-1), help-resolution contract 2.1 (B0-2), Hosted Gate 3 protocol notes section 13 |
