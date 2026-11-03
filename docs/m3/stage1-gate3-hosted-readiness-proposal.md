# Stage 1 Gate 3: Hosted Readiness Proposal (2026-11-03)

Status: **READINESS PLANNING APPROVED (PM, 2026-11-03); E-1 approved; E-2 PASS WITH ADVISORY; E-3 approved and executed
(flag rows only); E-4 Fresh Git Flags-ON Preview PASS WITH ADVISORY / CLOSED; E-5 approved and executed: **STOPPED / NO-GO**
at C-4 (C-4 FAIL / BLOCKER, PLAY-E5-1 FAIL / BLOCKER; F.13); OFF Return approved (PM, 2026-11-03); E-6 NOT approved.**
Gate 3 data on Acceptance is **retained temporarily** for defect investigation; no cleanup has been done. Each step needs
its own approval (section E); no action implies the next.

| Approval | State |
|---|---|
| Readiness planning (this document as the plan) | **approved** |
| E-1 Readiness document, including the Governance #6 cleanup plan | **approved** |
| E-2 Acceptance read-only parity | **PASS WITH ADVISORY** (0, C.1) |
| E-3 Flag change (branch-scoped Preview only) | **approved** (PM, 2026-11-03); execution recorded separately |
| E-4 Flags-ON deployment (revised: fresh Git-triggered branch Preview, D.1) | **PASS WITH ADVISORY / CLOSED** (PM, 2026-11-03; 0, D.1 E-4 result) |
| E-5 Hosted Gate 3 execution | approved (PM, 2026-11-03; D-E5-6 satisfied) and executed: **STOPPED / NO-GO** at C-4 (F.13) |
| OFF Return (both flags false, fresh Git-triggered OFF Preview, OFF probes) | **approved** (PM, 2026-11-03); result recorded separately |
| E-6 Cleanup | **not approved**; Gate 3 data retained temporarily for defect investigation |

Basis: [Stage 1 Gate 3 Integrated Implementation Package](stage1-gate3-integrated-implementation-package.md)
(sections 6 to 10, 13), Teacher Package Specification 7.1 (G3-D1 to G3-D7), Operational UX OX-1, OX-12.

## 0. Gate record

| Gate | Result | Evidence |
|---|---|---|
| Local implementation | PASS | targeted 463/463, full Vitest 894/894, pgTAP 780/780 (clean reset), typecheck clean |
| **Push + Flags-OFF Preview Gate** | **PASS / CLOSED** (PM, 2026-11-03) | push `8df78b8..f9f5bb3`; Preview `dpl_7hFUqMV1xWoXusZeA4C6WBUxK4Qm` Ready, built from `f9f5bb3`; owner browser check: `/student/crosswords` 404, `…/api/team-state` `{"error":"NOT_FOUND"}`, `/teacher/…/live` 404, `/student/sign-in` and `/teacher/sign-in` load |
| **E-2 Acceptance Contract Parity** | **PASS WITH ADVISORY** (PM, 2026-11-03) | HC-1 to HC-11 PASS; HC-12 migration count 33 before, 33 after; W1 baseline 1 attempt, 1 member, 0 events, unchanged; advisory HC-12b (C.1). E-3, E-4, E-5 and E-6 are **not** approved by this result |
| **Flags-OFF Preview Verification** (after the push of `34047c7`, `7e6bced`, `25cbd71`) | **PASS / CLOSED** (PM, 2026-11-03) | Preview `dpl_CywQTDn3v8AXW2cBL2jAeV4b5yWh` built from `25cbd71`, Ready; PM browser: `/student/crosswords` 404, `/student/sign-in` and `/teacher/sign-in` load, invalid team-state `{"error":"NOT_FOUND"}`, invalid `/live` 404; flag rows unchanged; Production untouched |
| **E-4 Fresh Git Flags-ON Preview** | **PASS WITH ADVISORY / CLOSED** (PM, 2026-11-03) | push `25cbd71..9545ba1`; Preview `dpl_FF8s9iHjsdEPW69gmFeDx7kUTr6z` Ready, target Preview, branch `m2/m2-1-content-pipeline`, built from `9545ba1` after E-3; branch alias on it; PM browser P-1, P-2, P-4 to P-7 PASS, P-3 authentication boundary PASS with response-format advisory (D.1); Production isolation PASS; protected-information exposure none. E-5 and E-6 are **not** approved by this result |
| **E-5 Hosted Gate 3 execution** | **STOPPED / NO-GO** (PM, 2026-11-03) | C-4 shared-board synchronization **FAIL / BLOCKER**; PLAY-E5-1 Hangul-cell validation **FAIL / BLOCKER**; C-5 to C-13 not executed; C-10 not completed; S5 not deleted (F.13) |

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
| The **Gate 3 word set, Puzzle T and Puzzle I** (owned by the Gate-3-only teacher) | **delete** (amended by D-E5-1, PM 2026-11-03; earlier: "the test puzzle: retain as baseline") | with the test accounts, same deadline | counts 0 for their ids (F.12) |

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

## D.1 E-3 / E-4 execution plan (prepared 2026-11-03; E-3 executed; E-4 executed as revised, PASS WITH ADVISORY)

Scope: Vercel project `eduquest-ai-pilot`, team `sonline-2`, **Preview only, git branch `m2/m2-1-content-pipeline` only**.
Production, Development and other Preview branches are not touched. All commands run by Claude after the matching
approval; every value is the literal `true` or `false` (no secret).

**Pre-state (read-only, recorded 2026-11-03):** `CROSSWORD_PLAY_ENABLED` exists once, Preview, branch
`m2/m2-1-content-pipeline` only (value encrypted in the listing; OFF by the Flags-OFF check). `COLLAB_PLAY_ENABLED` does
not exist. Production has no flag row (only its own `NEXT_PUBLIC_SUPABASE_URL`). Branch deployment
`dpl_CywQTDn3v8AXW2cBL2jAeV4b5yWh` (`25cbd71`); Production deployment `eduquest-ai-pilot-7jbihexvp`.

**E-3 flag change (order chosen so that any partial state stays OFF):**

| # | Command | Effect |
|---|---|---|
| 3.1 | `vercel env add COLLAB_PLAY_ENABLED preview --git-branch m2/m2-1-content-pipeline --value true --scope sonline-2` | creates the missing row; alone it changes nothing (team play also needs the play flag) |
| 3.2 | `vercel env rm CROSSWORD_PLAY_ENABLED preview m2/m2-1-content-pipeline --yes --scope sonline-2` | removes the branch row; while absent, the hosted default is OFF |
| 3.3 | `vercel env add CROSSWORD_PLAY_ENABLED preview --git-branch m2/m2-1-content-pipeline --value true --scope sonline-2` | recreates the branch row with `true` |
| 3.4 | `vercel env ls --scope sonline-2` (flag rows only) | exactly one row each, both "Preview (m2/m2-1-content-pipeline)"; no Production or other-branch row |

`vercel env update` is not used: it has no git-branch option. An env change affects only deployments built after it,
so nothing is live until E-4.

**E-3 partial failure:** if any of 3.1 to 3.3 fails, do **not** redeploy; restore OFF with the OFF commands below
(both rows `false`), check 3.4, and stop for PM review.

**E-3 executed (2026-11-03):** 3.1 to 3.4 done exactly as listed; both rows `true`, Preview, branch
`m2/m2-1-content-pipeline` only (type Sensitive).

**E-4 correction (PM, 2026-11-03).** The `vercel redeploy` procedure in 4.1 below is **SUPERSEDED** and was **never
executed**. The first Flags-ON browser probes therefore ran against the old OFF deployment
`dpl_CywQTDn3v8AXW2cBL2jAeV4b5yWh` (built before E-3); their 404 results are an **OFF-state confirmation, not a product
failure**. Vercel applies environment-variable changes only to **new** deployments, and redeploying an existing
deployment by id **may inherit the original deployment's captured environment** (REST reference, `deploymentId`:
"All project settings and environment variables are inherited from the original unless explicitly overridden"). The
approved replacement is a **fresh Git-triggered branch Preview**: push the unpushed documentation commits of this branch;
the automatic Preview builds with the current branch-scoped rows. Its source SHA is the new documentation HEAD; the
application code stays identical to `25cbd71` (the commits after it change this document only). E-5 and E-6 remain
not approved.

**E-4 redeploy (superseded, kept for the record; do not run):**

| # | Command or check | Expected |
|---|---|---|
| ~~4.1~~ | ~~`vercel redeploy https://eduquest-ai-pilot-8lgm77gqn-sonline-2.vercel.app --target preview --scope sonline-2`~~ | **superseded:** may inherit the old OFF environment |
| 4.2 | `vercel inspect <new url> --scope sonline-2` (+ `--logs`) | Ready; target preview; source commit `25cbd71`; alias `eduquest-ai-pilot-git-m2-m2-1-content-pipeline-sonline-2.vercel.app` on the new deployment |
| 4.3 | `git ls-remote origin m2/m2-1-content-pipeline` | `25cbd71` (no code change) |
| 4.4 | `vercel ls --environment production --scope sonline-2` | still `eduquest-ai-pilot-7jbihexvp`, unchanged age |

**E-4 revised (approved):**

| # | Step | Expected |
|---|---|---|
| 4R.1 | `git push origin m2/m2-1-content-pipeline` (the unpushed documentation commits only; no force, no tags) | remote head = the new documentation HEAD |
| 4R.2 | `vercel ls` / `vercel inspect <new url> --logs` | a **new** deployment id; Ready; target Preview; branch `m2/m2-1-content-pipeline`; commit = the new HEAD; branch alias on it |
| 4R.3 | `vercel env ls` (flag rows) | unchanged: one row each, Preview, this branch |
| 4R.4 | `vercel ls --environment production` | still `eduquest-ai-pilot-7jbihexvp` |

**Minimum Flags-ON safety probes** (PM's Vercel-signed-in browser, signed out of EduQuest; before any account or data):

| # | Path (branch alias) | Expected |
|---|---|---|
| P-1 | `/student/sign-in` | loads normally |
| P-2 | `/teacher/sign-in` | loads normally |
| P-3 | `/student/crosswords/00000000-0000-4000-8000-000000000000/api/team-state` | `401 {"error":"UNAUTHENTICATED"}`: both flags pass, then the session is required before the assignment is looked at; nothing about an assignment or identity (a `NOT_FOUND` here would need a signed-in student, which does not exist before E-5) |
| P-4 | `/teacher/crosswords/<zero-uuid>/assignments/<zero-uuid>/teams` | redirect to `/teacher/sign-in` (no longer a flag-off 404) |
| P-5 | `/teacher/crosswords/<zero-uuid>/assignments/<zero-uuid>/live` | redirect to `/teacher/sign-in` |
| P-6 | `/student/crosswords` | redirect to `/student/sign-in` (the authentication boundary, not a flag-off 404): proves the play flag is ON |
| P-7 | Production deployment `eduquest-ai-pilot-7jbihexvp…` `/student/crosswords` | 404, as before: Production unaffected |

Any other result: OFF Return at once, stop for PM review.

**E-4 result (PM, 2026-11-03): PASS WITH ADVISORY / CLOSED.** Recorded by the PM: P-1, P-2, P-4, P-5, P-6 and P-7
PASS; P-3 authentication boundary PASS; exact API response ADVISORY; no protected information exposed; Production
isolation PASS.

Deployment evidence (CLI, Claude): push `25cbd71..9545ba1` (no force, no tags); new deployment
`dpl_FF8s9iHjsdEPW69gmFeDx7kUTr6z` (`eduquest-ai-pilot-51ag4udrw-sonline-2.vercel.app`), created 2026-11-03 01:47 KST,
after the E-3 rows; Ready; target Preview; build log "Branch: m2/m2-1-content-pipeline, Commit: 9545ba1"; branch alias
`eduquest-ai-pilot-git-m2-m2-1-content-pipeline-sonline-2.vercel.app` on it; no non-documentation file differs from
`25cbd71`. Flag rows unchanged (one each, Preview, this branch). Production still `eduquest-ai-pilot-7jbihexvp`. Preview
protection unchanged (Vercel SSO; no bypass secret).

| # | Result (PM browser, signed out of EduQuest) |
|---|---|
| P-1 | **PASS**: student sign-in loads |
| P-2 | **PASS**: teacher sign-in loads |
| P-3 | **PASS WITH ADVISORY**: authentication boundary PASS; exact API response format ADVISORY (below) |
| P-4 | **PASS**: unauthenticated `/teams` reaches the teacher authentication boundary; no assignment data |
| P-5 | **PASS**: unauthenticated `/live` reaches the teacher authentication boundary; no assignment data |
| P-6 | **PASS**: Preview `/student/crosswords` reaches the student authentication boundary, not a 404 |
| P-7 | **PASS**: Production `/student/crosswords` still 404 (OFF) |

Production isolation: **PASS**. Protected-information exposure: **none**.

**Advisory E4-A1 (P-3 response format).** Planned: `401 {"error":"UNAUTHENTICATED"}`. Observed: the top-level browser
navigation ended on `/student/sign-in` with the student login form; no assignment, team, student or identity data was
shown. This proves the request passed the Flags-OFF `NOT_FOUND` gate (both flags ON) and reached the authentication
boundary. Read-only code note (Claude): the team-state handler's guard (`src/features/crossword/play/api-guard.ts`)
returns JSON 401 for a missing session, and `src/middleware.ts` only refreshes the session without redirecting, so the
source of the redirect is not established from the code alone. **No code or flag change** is made to force a JSON body
for a top-level navigation (PM). If the browser Network log is supplied later, its request URL, redirect status and
`Location` header are recorded here as supplementary evidence only.

**OFF Return (rollback; also the end of every window):**

| # | Command or check |
|---|---|
| O-1 | `vercel env rm CROSSWORD_PLAY_ENABLED preview m2/m2-1-content-pipeline --yes --scope sonline-2`, then `vercel env add CROSSWORD_PLAY_ENABLED preview --git-branch m2/m2-1-content-pipeline --value false --scope sonline-2` |
| O-2 | `vercel env rm COLLAB_PLAY_ENABLED preview m2/m2-1-content-pipeline --yes --scope sonline-2`, then `vercel env add COLLAB_PLAY_ENABLED preview --git-branch m2/m2-1-content-pipeline --value false --scope sonline-2` |
| O-3 | `vercel env ls` (flag rows): both "Preview (m2/m2-1-content-pipeline)" only |
| O-4 | **Corrected (2026-11-03):** a fresh Git-triggered branch Preview (push of a documentation commit recording the OFF state), **not** `vercel redeploy` (which may inherit the ON environment); inspect: new id, Ready, alias moved |
| O-5 | PM browser: the five Flags-OFF checks (`/student/crosswords` 404, both sign-ins load, invalid team-state `NOT_FOUND`, invalid `/live` 404) |
| O-6 | Production still `eduquest-ai-pilot-7jbihexvp`; deployment ids before and after recorded |

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

---

## F. E-5 execution plan (2026-11-03; plan **CONDITIONALLY APPROVED**; executed: **STOPPED / NO-GO** at C-4, see F.13)

Window: the held Flags-ON Preview `dpl_FF8s9iHjsdEPW69gmFeDx7kUTr6z`, branch alias
`eduquest-ai-pilot-git-m2-m2-1-content-pipeline-sonline-2.vercel.app`, against Acceptance. Roles: **owner** (PM) does
every hosted write (Dashboard, SQL Editor, app screens) and every browser step; **Claude** does read-only Vercel CLI
checks, prepares the SQL (allow-list and deny-list scans of C.1 for every read-only script) and records the evidence.
Claude never sees a credential and never connects to Acceptance. Supersedes run-sheet steps 3, 9 and 10 of section D
where they say "redeploy" (see D.1 O-4).

**Start condition (D-E5-6):** E-5 starts only when the PM explicitly confirms a **continuous, uninterrupted 90-minute
run slot**; that confirmation is the E-5 execution approval. Content preparation (F.4) is part of E-5, done in the same
approval before the timed run. E-6 is not approved.

**Gate 3 ids (TD-6):** every Gate 3 id (accounts, room, word set, puzzles, assignments, teams, attempts, help requests)
is kept **only in a temporary private cleanup record** on the owner's device, next to the password-manager entries and
deleted with them at E-6. Ids are never written to the repository, the chat or a shared report; repository evidence
holds counts and pass/fail results only, no raw SQL output.

### F.0 Decisions (PM, 2026-11-03)

| # | Decision | Basis |
|---|---|---|
| D-E5-1 | The Gate-3-only teacher **owns** a neutral Gate-3-only word set, **Puzzle T** (team assignment) and **Puzzle I** (individual assignment, C-12). All three are **temporary E-6 cleanup targets**; this **amends** section B (the test puzzle is no longer retained). The cleanup delete order is **not final** until a local FK / cascade dry run proves it (F.12) | assignment needs the actor to manage the puzzle (`fn_crossword_actor_manages`); `crossword_puzzles`, `content_sets` and `classrooms` owners are `ON DELETE RESTRICT` |
| D-E5-2 | **W1 is not used for C-12.** C-12 uses Puzzle I, an individual assignment in the Gate 3 Course Room. W1 stays **read-only** and must remain **1 attempt / 1 member / 0 events** before and after | TD-9 |
| D-E5-3 | **Hosted flag combinations:** ON/ON during E-5; OFF/OFF during the OFF Return. The two mixed combinations rely on the existing local tests (`crossword-team-flags`, HP-10); **no additional hosted flag window** is created for them | C-1 |
| D-E5-4 | C-11 includes the **permanent deletion of Gate 3 student S5**, run only **after every check that needs five students**; afterwards the remaining four accounts and the team state are verified | pgTAP 00018 "Erasure (G4)" |
| D-E5-5 | The **existing Pilot School** id is used; **no new school row or id**; the one-school hygiene check (`count(distinct school_id) = 1`, runbook 02 D) is kept | runbook 02 |
| D-E5-6 | E-5 starts only on the PM's explicit confirmation of a **continuous 90-minute run slot** | - |

### F.1 Gate-3-only account creation (owner)

| # | Step | Evidence (ids only) |
|---|---|---|
| A-1 | Dashboard → Authentication → Users → Add user: a **non-personal** address the owner controls (or a reserved example domain), random 16+ character password from the password manager, **Auto Confirm** ticked | id → private cleanup record only |
| A-2 | SQL Editor (one INSERT, runbook 02 C): `profiles` row, role `teacher`, display name `G3 교사`, the pilot school id (D-E5-5), status `active` | `INSERT 0 1` |
| A-3 | Sign in at `/teacher/sign-in` in profile **G3-T**; lands on `/teacher` | screen without credentials |
| A-4 | Create the dedicated room (F.3), then five students in it (`/teacher/classrooms/<id>/students/new`, one at a time; **not** the batch import or credential export): names `G3 학생1` … `G3 학생5`, student numbers from a range unused in the school | ids → private cleanup record only |
| A-5 | First sign-in of each student in its own profile (G3-S1 … G3-S5) with the temporary password; the forced password change sets a password generated by the password manager | `must_change_password` false for the five (SQL) |
| A-6 | Owner SQL, read-only: the room lists exactly the six Gate 3 accounts (TD-1, TD-2, TD-3) | count 6 and display names (ids and usernames → private cleanup record only) |

### F.2 Credential handling (TD-6)

- Every password and temporary password goes **only** into the owner's password manager, in one entry group
  "Gate 3: delete by the section B deadline". Never in chat, the repository, the ops log, a screenshot, a file in the
  repository folder, an email or a ticket.
- The "shown once" screen after creating a student is **never** photographed or screenshotted; the owner copies the
  temporary password straight into the password manager.
- Browser password saving is declined for these accounts (no sync to a browser account).
- No credential CSV is exported. The untracked `accounts.txt`, `s9-a.csv`, `s9-b.csv` in the repository folder are
  unrelated and are not used.
- Every screenshot is reviewed by the owner for credentials, real names and the address bar before it is shared.
- The ops log records only: date, actor, account id, display name, role, reason.

### F.3 Dedicated Course Room

`/teacher/classrooms/new` in G3-T: name `G3 테스트 반`, owned by the Gate 3 teacher, no co-teacher. Only the five Gate 3
students are enrolled. Evidence: room id; enrolment count 5 (SQL).

### F.4 Pre-reviewed puzzles and assignments (before the window opens, D-E5-1 (a))

| # | Step | Evidence |
|---|---|---|
| U-1 | Word set in the Gate 3 room from a small neutral vocabulary list (no personal content); preview and fix | set id |
| U-2 | Generate **puzzle T** (team, at least 5 multi-cell words) and **puzzle I** (individual, for C-12); the teacher previews each and publishes | puzzle ids, status `published` |
| U-3 | Assign puzzle T to the room (no window times); on `/teams` set **팀 활동** before any student opens it | assignment T id; `play_mode = team` |
| U-4 | Assign puzzle I to the room; it stays **개인 활동** | assignment I id; `play_mode = individual` |

Content preparation is logged, but **not** counted as setup time (it is preparation, HP-6).

### F.5 Teams of 3 and 2 (TD-4)

On `/teams` of assignment T: create `1팀` and `2팀`; 1팀 = G3 학생1, 2, 3; 2팀 = G3 학생4, 5; unassigned list empty.
Evidence: team ids; owner SQL team members 3 + 2; screen of `/teams` (neutral labels only).

### F.6 Setup-time measurement (HP-4)

Stopwatch by the owner, written in the timing log:

- **S0**: the teacher opens `/teams` of assignment T;
- **S1**: mode set to team;
- **S2**: both teams created;
- **S3**: all five students assigned.

Setup time = S3 − S0. It is separate from C-10, which starts at the open announcement.

### F.7 C-1 to C-13 run order

| Order | Check | How (owner unless stated) | Evidence |
|---|---|---|---|
| 0 | **Pre-state** | Claude: `vercel env ls` (flag rows), `vercel ls`, Production id. Owner: E-2 HC-7 and HC-11 scripts again (read-only; P1 / P2 counts and W1), audit row count | CLI output, SQL output |
| 1 | **C-1** (ON/ON; D-E5-3) | E-4 probes as the ON/ON record, plus: signed-in G3-S1 sees assignment T on `/student/crosswords`; a signed-in student gets `NOT_FOUND` for the zero-uuid team-state | status codes |
| 2 | Setup F.5 with F.6 timing; **C-2** first half | screens, SQL `play_mode`, teams, members |
| 3 | **C-10** starts: T0 = "open now" said aloud; all five open assignment T | stopwatch per team start and per first input |
| 4 | **C-3** | SQL: one attempt per team; members 3 and 2 |
| 5 | **C-2** second half | teacher tries to switch to 개인 활동 and to remove a started member: both refused | screen messages |
| 6 | **C-4** with the throttle (F.9) | G3-S1 types, G3-S2 (throttled) sees it within one poll; reload keeps it | screens, SQL revision |
| 7 | **C-5** | notice "다른 팀원이 수정했어요"; no names or counts; response key list of team-state (DevTools, G3-S3) | screen, key list |
| 8 | **C-6** | reveal vs pending input (K-5); check retry (K-6) | screens, SQL counters |
| 9 | **C-8** | 2팀 calls the teacher; a second call is refused while open; the teacher resolves; 60 s cooldown | SQL help requests (no student column), teacher screen |
| 10 | **C-9** throughout | `/live` on G3-T only, never projected (TD-7): student state, team help state, blocked state, close; no per-student counts or balance | screen, response field list |
| 11 | **C-7** | 1팀: G3-S1 submits while G3-S3 types; every member sees completion; participation only after completion; premature-submit note (HP-8); then 2팀 completes | SQL status, events, credits; screens |
| 12 | **C-10** ends | ≥ 90 % of present students made a first input; device faults logged separately | timing log |
| 13 | **C-12** (D-E5-2) | G3-S1 plays the Puzzle I individual assignment: no team payload, no team-state polling, STALE reloads; W1 read-only check still 1 attempt / 1 member / 0 events | screens, SQL counts |
| 14 | **C-11** (D-E5-4; last check, after every five-student check) | SQL counts before; the owner permanently deletes G3 학생5's auth user in the Dashboard; SQL after: 2팀 solves kept, only that student's credits gone, their cells keep a NULL writer; **the remaining four accounts** are active and sign in; **team state**: 1팀 3 members unchanged, 2팀 1 member, attempts intact | SQL counts before and after, sign-in check |
| 15 | **C-13** OFF Return | D.1 O-1 to O-6 (each env change and the fresh Git-triggered Preview push needs its approval at that time); owner SQL: Gate 3 data kept, counts recorded; W1 identical | CLI, probes, SQL |

### F.8 Browser and profile allocation

Six separate Chrome profiles on the owner's computer, each signed in to Vercel with the PM's account (SSO, no bypass
secret), each signed in to EduQuest with **one** Gate 3 account only:

| Profile | Account | Team | Role in checks |
|---|---|---|---|
| G3-T | G3 교사 | - | setup, C-2, C-8 resolve, C-9 `/live` (never projected) |
| G3-S1 | G3 학생1 | 1팀 | C-4 writer, C-7 submitter, C-12 (Puzzle I) |
| G3-S2 | G3 학생2 | 1팀 | C-4 observer, **throttled** |
| G3-S3 | G3 학생3 | 1팀 | C-5 response keys, C-7 typing |
| G3-S4 | G3 학생4 | 2팀 | C-8 caller |
| G3-S5 | G3 학생5 | 2팀 | C-6; C-11 (permanently deleted, last) |

No incognito windows (they share one session). Galaxy Tab, phones and TalkBack are optional, not blocking (package
decision #6).

### F.9 Throttled-network check (HP-7)

G3-S2: DevTools → Network → **Slow 4G** for the whole of C-4. Record:
- the time until G3-S1's letter appears;
- whether any input is lost;
- the save-queue status notice;
- recovery after the throttle is turned off.

This is an observation, not a pass or fail threshold.

### F.10 Stop conditions

These are package section 9 and step 8 of section D, plus three Gate 3 specifics.

**Package section 9 and step 8 of section D:**
- a classmate name, student id or uuid on a student screen or in a student response;
- a per-student count or balance on `/live`;
- a help request that identifies a student;
- a lost saved cell, or input in another team;
- an individual-mode regression or a W1 difference;
- a flag guard failure;
- any change outside the window.

**Gate 3 specifics:**
- any non-Gate-3 account appears in the room or signs in during the window;
- a credential appears in any artefact;
- the deletion deadline would be crossed.

**On a stop:**
- no retry, no hot-fix, no manual SQL fix;
- go to C-13 OFF Return with its approvals;
- write the stop note.

### F.11 Evidence checklist (minimum set)

- pre-state (env rows, deployment ids, P1 / P2 counts, W1 1 / 1 / 0, audit count, migration count);
- room listing: count 6, neutral display names (ids only in the private cleanup record);
- setup time;
- C-1 to C-13 results with screens and SQL;
- throttle note;
- C-10 timing and device faults;
- the premature-submit note;
- any stop note;
- OFF Return evidence;
- the W1 check before and after;
- the owner's statement that no artefact holds a credential, a real name or a projected `/live` screen.

The repository receives summaries only: counts and pass / fail, no ids, no raw SQL output, no credentials.

### F.12 E-6 cleanup ids and zero-count plan (E-6 approval needed; after the PM closes the review)

**Ids recorded at E-5 (private cleanup record only, never in the repository):**
- the Gate 3 teacher's auth/profile id;
- the five student profile ids and student ids;
- the room id;
- the word set id;
- the puzzle T and puzzle I ids;
- the assignment T and assignment I ids;
- the two team ids;
- the attempt ids;
- the help request ids.

**Provisional delete order, by the owner (NOT FINAL; D-E5-1):**

1. The room. This cascades to enrolments, both assignments, teams, members, attempts, attempt members, cell writers, solves, credits and help requests.
2. Puzzles T and I.
3. The word set.
4. The remaining four student auth users. Each cascades to its profile, student and student account.
5. The teacher's auth user.

Derived from the RESTRICT owner keys; **not final** until the local dry run passes.

**Local FK / cascade dry run (required before the order is final and before E-6 is proposed):** on the local stack,
with equivalent data (one teacher, word set, Puzzle T and I, both assignments, two teams, attempts with cell writers,
solves, credits and a help request, one already-deleted student), Claude runs the delete sequence and proves:
- each RESTRICT key (`classrooms`, `content_sets`, `crossword_puzzles` owners) blocks as expected out of order;
- the room delete cascades as listed, and the member cleanup trigger and the mode-lock trigger do not block it;
- `content_sets.classroom_id` becomes NULL before the set delete; `content_import_batches` and `account_batches`
  cascade with the teacher's profile;
- `audit_logs` rows remain with `actor_id` NULL;
- the zero-count script below returns 0 everywhere and the W1-like baseline is unchanged.

**Zero-count check:** a read-only script after the deletes, with the C.1 scans applied. Every count must be **0** for the recorded ids:
- `classrooms`, `classroom_teachers`, `classroom_enrollments`;
- `content_sets`, `content_entries`;
- `crossword_puzzles`, `crossword_words`, `crossword_preview_tickets`;
- `crossword_assignments`;
- `crossword_teams`, `crossword_team_members`;
- `crossword_attempts`, `crossword_attempt_members`, `crossword_attempt_events`;
- `crossword_attempt_cell_writers`, `crossword_attempt_word_solves`, `crossword_attempt_word_credits`;
- `crossword_team_help_requests`;
- `students`, `student_accounts`, `profiles`;
- `auth.users`;
- `account_batches`, `content_import_batches`.

**Other after-checks:**
- P2POST-8 and P2POST-9 are back to their pre-state values.
- The audit row count is **unchanged**; audit rows are retained, and actor ids become NULL.
- The W1 check is identical to the pre-state.
- The migration count is unchanged (33).

**Outside the database:**
- the owner deletes the password-manager entries, screenshots and raw evidence files;
- the owner confirms this in writing (section B).

### F.13 E-5 result (2026-11-03): STOPPED / NO-GO

**Final findings (PM, 2026-11-03):**

| Check | Result |
|---|---|
| C-4 shared-board synchronization | **FAIL / BLOCKER** |
| PLAY-E5-1 Hangul-cell validation | **FAIL / BLOCKER** |
| E-5 | **STOPPED / NO-GO** |

**Observation (about 14:33 KST):**
- Puzzle G3 퍼즐 T, team 1팀, two student screens side by side.
- Both screens showed 1팀 · 3명 and 저장됨, with no input for more than 10 seconds.
- The two grids did not converge within at least two expected 4-second poll intervals.
- Three cells differed:
  - the left screen showed 복, H, R;
  - the right screen showed 과, 수, 원.
- The latin letters H and R were accepted into cells of a Hangul-only puzzle, and the screen reached 저장됨.

**Acceptance evidence (owner, read-only query approved by the PM; counts and cell letters only, no ids):**

| Item | Value |
|---|---|
| E-1 assignment match count | 1 |
| E-2 team match count | 1 |
| E-3 attempt revision | 11 |
| E-4 attempt status | in_progress |
| E-5 last saved at (KST) | 2026-11-03 14:31:36 |
| E-6 team members | 3 |
| E-7 team members actively enrolled | 3 |
| E-8 attempt members (joined the shared attempt) | 2 |
| E-9 saved cells | 5 |
| E-10 saved cells | 0,3=우 · 1,2=복 · 1,3=주 · 2,2=H · 3,2=R |
| E-11 given cells | 3,3=분 · 3,4=열 |
| E-12 saved cells that are not Hangul | 2,2=H · 3,2=R |

**Reading of the evidence:**
- The server state matched the **left** screen (복, H, R).
- The **right** screen was stale: it kept 과, 수, 원, which were no longer on the server.
- The last save was at 14:31:36 KST, before the observation. So the right screen stayed stale for well over two poll
  intervals, with no save pending on either screen.
- PLAY-E5-1: H and R are **persisted on the server**, so the latin letters were not an unsaved composition state.

**Not executed or not completed:**
- C-10 was not completed.
- C-5 to C-13 were not executed.
- Puzzle I was not deployed.
- S5 was not deleted.
- The assignment was not closed.

**After the stop:**
- The two divergent student pages were not refreshed or changed before the OFF deployment.
- OFF Return is approved (PM, 2026-11-03); its result is recorded separately.
- Gate 3 data on Acceptance is **retained temporarily** for defect investigation.
- E-6 cleanup remains **separately unapproved**.
- A fix, its tests and any further hosted attempt each need their own approval.
