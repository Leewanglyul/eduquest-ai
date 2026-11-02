# Stage 1 Gate 3: Hosted Readiness Proposal (2026-11-03)

Status: **READINESS PLANNING APPROVED (PM, 2026-11-03); E-1 approved; E-2 PASS WITH ADVISORY; E-3, E-4, E-5 and E-6
NOT approved.** Hosted Gate 3 execution is **not** approved. Documentation only: no flag change, no redeploy, no account
or data creation and no cleanup has been done. Each step needs its own approval (section E); no action implies the next.

| Approval | State |
|---|---|
| Readiness planning (this document as the plan) | **approved** |
| E-1 Readiness document, including the Governance #6 cleanup plan | **approved** |
| E-2 Acceptance read-only parity | **PASS WITH ADVISORY** (0, C.1) |
| E-3 Flag change | **not approved** |
| E-4 Preview redeploy | **not approved** |
| E-5 Hosted Gate 3 execution | **not approved** |
| E-6 Cleanup | **not approved** |

Basis: [Stage 1 Gate 3 Integrated Implementation Package](stage1-gate3-integrated-implementation-package.md)
(sections 6 to 10, 13), Teacher Package Specification 7.1 (G3-D1 to G3-D7), Operational UX OX-1, OX-12.

## 0. Gate record

| Gate | Result | Evidence |
|---|---|---|
| Local implementation | PASS | targeted 463/463, full Vitest 894/894, pgTAP 780/780 (clean reset), typecheck clean |
| **Push + Flags-OFF Preview Gate** | **PASS / CLOSED** (PM, 2026-11-03) | push `8df78b8..f9f5bb3`; Preview `dpl_7hFUqMV1xWoXusZeA4C6WBUxK4Qm` Ready, built from `f9f5bb3`; owner browser check: `/student/crosswords` 404, `…/api/team-state` `{"error":"NOT_FOUND"}`, `/teacher/…/live` 404, `/student/sign-in` and `/teacher/sign-in` load |
| **E-2 Acceptance Contract Parity** | **PASS WITH ADVISORY** (PM, 2026-11-03) | HC-1 to HC-11 PASS; HC-12 migration count 33 before, 33 after; W1 baseline 1 attempt, 1 member, 0 events, unchanged; advisory HC-12b (C.1). E-3, E-4, E-5 and E-6 are **not** approved by this result |

---

## A. G3-D5 test-data conditions

| # | Condition | How it is checked |
|---|---|---|
| TD-1 | **Gate-3-only test accounts** (PM decision, 2026-11-03): one neutral test teacher and five neutral test students, created only for Gate 3 (at E-5, not before); no other account signs in during the window. Their activity is **never converted into, merged into or retained as a real student's growth record** (Growth Model 5.1) | owner SQL before the run: account list of the Gate 3 Course Room (ids and test usernames only) |
| TD-2 | **No real student data:** the Gate 3 Course Room enrols only the SMOKE students | owner SQL: enrolment count equals the SMOKE list |
| TD-3 | **No real names:** display names are neutral test names (for example "G3 학생1" to "G3 학생5", "G3 교사"); teams of 3 and 2 | owner SQL: display names of the room |
| TD-4 | **Neutral team labels only:** "1팀", "2팀" (HP-1) | screen of `/teams` |
| TD-5 | **Pre-reviewed test puzzle only:** a published puzzle already reviewed by the teacher before the window (OX-6, HP-6); nothing is generated during the run | puzzle id and status `published` recorded before the run |
| TD-6 | **Credential-safe evidence:** no password, temporary password, token, cookie, connection string or bypass secret in any screenshot, log or report; SQL outputs show ids and counts, not answers | owner review of each artefact before it is shared |
| TD-7 | **No `/live` projection:** `/live` is opened on the teacher's own device only (HP-2, OX-12) | run-sheet step |
| TD-8 | **No excluded feature:** Ask Team, current-clue awareness, Realtime, Migration C, Jigsaw, chat, team competition, combo, badges, Growth Record, Review Mode do not exist in the build (package section 11) | build is `f9f5bb3`; no screen offers them |
| TD-9 | **The W1 baseline is not touched:** the existing W1 individual assignment and its attempt stay as they are; Gate 3 uses its own Course Room and its own assignment | `p1-w1-data-check.sql` before and after the run |

---

## B. Governance #6 cleanup decision (proposal)

Principle: Gate 3 data lives in **one dedicated Gate 3 Course Room** with **one Gate 3 assignment**, so cleanup is one
scoped delete whose cascades are defined by the schema, and the W1 baseline is never involved. Nothing is deleted
before the PM has reviewed the Gate 3 evidence. Owner of every item: **the Acceptance owner (PM)**; Claude prepares
queries and reports, the owner runs any hosted SQL.

| Data | Decision | Retention | Deletion evidence |
|---|---|---|---|
| Gate 3 **Course Room** (dedicated classroom) | **retain temporarily**, then delete | until the PM closes the Gate 3 review | room row count 0; enrolment count 0 for its id |
| Gate 3 **assignment** (team mode) | **retain temporarily**, then delete (with the room) | same | assignment count 0 for the room; P2POST-9 back to 0 |
| **Teams** | cascade with the assignment | same | `crossword_teams` count 0 for the assignment; P2POST-8 |
| **Team members** | cascade with teams | same | `crossword_team_members` count 0 for the assignment |
| **Attempts** | cascade with the assignment | same | `crossword_attempts` count 0 for the assignment |
| **Attempt members** | cascade with attempts | same | `crossword_attempt_members` count 0 for the assignment |
| **Cell writers, word solves, word credits** | cascade with attempts | same | counts 0 for the attempt ids; P2POST-8 |
| **Help requests** | cascade with teams | same | `crossword_team_help_requests` count 0 for the team ids; P2POST-8 |
| **Audit records** (assignment created / closed, enrolment changes) | **retain as baseline** (audit trail is not deleted) | per the existing audit policy | count of Gate 3 audit rows recorded before and after; unchanged after cleanup |
| **Screenshots** | **retain temporarily** on the owner's device | until the PM closes the review, then delete | owner's written confirmation of deletion |
| **Local evidence files** (SQL output, probe output, timing log) | **retain temporarily**; the summarised results go into the Gate 3 report in the repository | same, then delete the raw files | owner's written confirmation; the repo report holds no raw data |
| **Test accounts** (the Gate-3-only teacher and five students, TD-1) | **delete** with the room | until the deletion deadline below | account count for the Gate-3-only usernames 0 |
| The **W1 baseline** (existing individual assignment, attempt, member) | **retain as baseline**, untouched | until the pilot sign-off | `p1-w1-data-check.sql` identical before and after |
| The **test puzzle** | **retain as baseline** (published content, no student data) | owner's content library | not deleted |

**Deletion deadline (PM decision, 2026-11-03):** all Gate 3 data above marked for deletion is deleted by the
**earlier** of (a) **72 hours after the PM closes the Hosted Gate 3 review**, or (b) **2026-11-10 18:00 KST**. No automatic
extension. Cleanup happens only after the PM has reviewed the results (E-6).

---

## C. Hosted contract parity (read-only, before any flag change; not executed)

Run by the owner in the Acceptance SQL editor, read-only (SELECT only), after the read-only approval (E-2).

| # | Check | Expected |
|---|---|---|
| HC-1 | `p2-postcheck.sql` P2POST-1: last applied migration | `20261102000002`; no later migration |
| HC-2 | P2POST-2: the 28 function bodies (`md5(replace(prosrc, E'\r',''))`) | 28 / 28 match commit `8df78b8` (which is unchanged in `f9f5bb3`: no migration since) |
| HC-3 | P2POST-3 to P2POST-5: security of the 19 new or modified functions | INVOKER, pinned `search_path`; 0 executable by anon / authenticated / PUBLIC; 19 by service_role |
| HC-4 | P2POST-6: `fn_crossword_play_list` result columns | 13 original + `play_mode`, `team_waiting` |
| HC-5 | P2POST-7: start / save / reveal / submit / check signatures | unchanged (5) |
| HC-6 | `crossword_assignments.play_mode` column and the `crossword_play_mode` enum | present; values `individual`, `team`; every existing assignment `individual` (P2POST-9 = 0) |
| HC-7 | P1 tables empty before the run (P2POST-8) | 0 rows |
| HC-8 | Error contracts present in function bodies (`prosrc LIKE`) | `CROSSWORD_PLAY_NO_TEAM`, `CROSSWORD_PLAY_HELP_COOLDOWN`, `CROSSWORD_TEAM_FULL`, `CROSSWORD_TEAM_STARTED`, `CROSSWORD_PLAY_MODE_LOCKED`, `CROSSWORD_TEAMS_EXIST` each found |
| HC-9 | Columns read by the help-resolution helper | `crossword_team_help_requests` has `id`, `team_id`, `resolved_at` |
| HC-10 | P2POST-10, P2POST-11: triggers | member cleanup trigger SECURITY DEFINER; mode-lock trigger present |
| HC-11 | W1 baseline (`p1-w1-data-check.sql`) | identical to the recorded W1 values |
| HC-12 | **No schema mutation:** the session runs SELECT statements only; migration list unchanged after the checks | migration count before = after |

Any mismatch is a STOP before flags are touched.

### C.1 E-2 result (owner run, 2026-11-03): PASS WITH ADVISORY

| Check | Result |
|---|---|
| HC-1 to HC-11 | **PASS** (every row `ok = true`) |
| HC-12 migration count | **PASS**: 33 before, 33 after |
| W1 baseline (HC-11) | 1 attempt, 1 member, 0 events, unchanged |
| HC-12b read-only session | **ADVISORY:** the Acceptance SQL Editor did not enforce or preserve the read-only transaction setting (`transaction_read_only` reported `off` in both scripts) |

The Acceptance execution is **not** described as transaction-enforced read-only. Its safety was established through:

1. SELECT-only script inspection;
2. no write-capable statements and no writing-function calls (keyword scan of both scripts);
3. the unchanged migration count (33 → 33);
4. the unchanged P1 / P2 baselines (HC-7) and W1 baseline (HC-11).

No account, Course Room, assignment or Gate 3 data was created. No flag, environment variable, deployment setting or
Preview protection was changed. Scripts used: `g3-e2-hosted-parity.sql` and `g3-e2-hc12-after.sql` (scratchpad; built
from the approved `p2-postcheck.sql` and `p1-w1-data-check.sql`; no secrets).

**Rule for future hosted read-only checks:** do not rely on a session or transaction read-only setting in the SQL
Editor. Each script must pass, before it is handed to the owner:

- an **executable-statement allow-list** (`SELECT`, and `WITH … SELECT`, only);
- a **write-statement deny-list** scan (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `MERGE`, `COPY`, `CREATE`, `ALTER`, `DROP`,
  `GRANT`, `REVOKE`, `CALL`, `DO`, `VACUUM`, `REFRESH`, `nextval`, `setval`, `set_config`, and any function known to write);
- a **before / after baseline comparison** (migration count and the relevant row counts) recorded with the result.

This result does not approve E-3, E-4, E-5 or E-6.

---

## D. Flag-window run sheet

Roles: **owner** = the Acceptance owner (signs in, runs hosted SQL, uses the browser profiles); **Claude** = read-only
Vercel CLI checks, and the approved env and redeploy commands; nothing else.

| Step | Action | Who | Approval | Evidence |
|---|---|---|---|---|
| 1 | **Pre-state capture:** `vercel env ls` (flag rows), `vercel ls` (branch deployment `dpl_7hFUqMV1xWoXusZeA4C6WBUxK4Qm`), Production unchanged; HC-1 to HC-12 results; W1 data check; TD-1 to TD-5 recorded | Claude, owner | E-2 | CLI output, SQL output |
| 2 | **Both Preview flags ON**, branch-scoped to `m2/m2-1-content-pipeline` only: `CROSSWORD_PLAY_ENABLED=true` (replace the existing row), `COLLAB_PLAY_ENABLED=true` (new row) | Claude | E-3 | `vercel env ls` after |
| 3 | **Preview redeploy** of the branch deployment (one redeploy, no code change) | Claude | E-4 | new deployment id, Ready, built from `f9f5bb3` |
| 4 | **Setup:** owner creates the Gate 3 room content if not prepared (assignment of the pre-reviewed puzzle, team mode, two teams of 3 and 2); **setup time logged separately** (HP-4) | owner | E-5 | timing log, `/teams` screen |
| 5 | **C-1 to C-13** of the package section 6, in order; C-1 probe through the owner's signed-in Vercel browser (no protection-bypass secret is created) | owner, Claude records | E-5 | per-check evidence of package section 6 |
| 6 | **Throttled-network check** inside C-4 (one browser profile throttled to a slow connection) (HP-7) | owner | E-5 | screen notes |
| 7 | **C-10 timing:** assignment open → every team started; ≥ 90 % of present test students made a first input; device faults logged separately | owner | E-5 | timing log |
| 8 | **Stop conditions** (package section 9): any classmate name or student id on a student screen or response; per-student counts or balance on `/live`; a help request identifying a student; lost saved cell or input in another team; individual-mode regression or W1 difference; flag guard failure; any change outside the window. On a stop: go to step 9 at once, no retry, no hot-fix | owner, Claude | (part of E-5) | stop note |
| 9 | **Both flags OFF:** `CROSSWORD_PLAY_ENABLED=false`, remove `COLLAB_PLAY_ENABLED` (or set false) | Claude | E-3 (OFF part) | `vercel env ls` |
| 10 | **Redeploy** | Claude | E-4 (OFF part) | deployment id, Ready |
| 11 | **OFF Return:** the same five browser checks as the Flags-OFF Preview Gate; owner SQL: Gate 3 data kept; W1 data check identical; Production unchanged | owner, Claude | (part of E-5) | probe results, SQL output |
| 12 | **Cleanup** per section B, only after the PM closes the Gate 3 review | owner | E-6 | section B evidence |
| 13 | **Evidence checklist** (below) complete; Gate 3 report written to the repository (summaries only) | Claude | - | report |

**Evidence checklist:** pre-state (env rows, deployment, HC-1 to HC-12, W1) · flag rows ON · redeploy id · setup time ·
C-1 to C-13 results · throttled-network note · C-10 timing with device faults · premature-submit observation (HP-8) ·
any stop note · flag rows OFF · OFF redeploy id · OFF Return probes · W1 after · cleanup evidence (later) · confirmation
that no artefact holds a credential or a real name (TD-6).

---

## E. Approval boundaries

Each approval covers only its own row. **No action implies the next approval.**

| # | Approval | Covers | Does not cover |
|---|---|---|---|
| E-1 | **Readiness document** | this proposal as the plan | any execution |
| E-2 | **Acceptance read-only** | HC-1 to HC-12, the W1 data check and TD-1 to TD-5 queries; SELECT only, by the owner | any write, any account creation, any flag |
| E-3 | **Flag change** | setting both Preview flags ON for the branch (step 2) and back OFF (step 9) | Production, other branches, other variables, a redeploy |
| E-4 | **Preview redeploy** | one redeploy after ON (step 3) and one after OFF (step 10) | Production, promote, aliases, rollback |
| E-5 | **Hosted Gate 3 execution** | setup with SMOKE accounts, C-1 to C-13, timing, OFF Return checks | cleanup, real accounts, real data |
| E-6 | **Cleanup** | section B deletes, after the PM closes the review | the W1 baseline, audit records, the test puzzle |

Decided by the PM (2026-11-03): Gate-3-only test accounts (TD-1); the deletion deadline (section B); the C-1 probe and
all browser checks use the PM's Vercel-signed-in browser: no protection-bypass secret is created and Preview protection
is not changed.
