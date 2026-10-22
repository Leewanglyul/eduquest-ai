# 21. Hosted acceptance and Galaxy Tab validation: integrated plan

Status: **PLAN, APPROVED by the PM on 2026-10-22; decisions D1 and D3 to D7 are recorded in §2 and §12. NOTHING IS EXECUTED.** Documents only: no code, DB work, deployment, flag change or hosted data change. It joins four plans that exist separately into one sequence: the Galaxy Tab input validation ([09](09-g5-device-validation.md) §1 to §7), the hosted acceptance procedure (09 §9), the TV-1 database and page verification ([18](18-tv1-hosted-verification-plan.md)) and the TalkBack validation ([20](20-talkback-validation-plan.md)), and it adds what none of them had: a **database-connected deployment**, the environment choice, and the closing of the F-1 conditions. Related: [11](11-student-play-release-readiness-audit.md) (release conditions), [15](15-f1-hosted-verification-plan.md) (F-1 Conditional GO), [19](19-m2-2-puzzle-generation-design.md) §8 (V3, V7).

Governance, consent and sign-off (items U1 to U9 of the `pilot/12` final candidate) are handled by a **separate process** (PM, 2026-10-22). This plan uses **test data only**, touches no real student, and does not wait for or prepare those items.

## 1. What this plan closes

| Open item | Source | Closed by | Stage |
|---|---|---|---|
| Real-device input verdict **SC1 to SC6** on Galaxy Tab + Chrome, Samsung Keyboard | 09 §4 to §6; `m2/11` C-1 | Galaxy Tab input validation | 1 (LAN), 2 (confirmation on hosted) |
| Samsung Internet as secondary check | 09 §3 | same, secondary | 1 |
| Hosted-only checks **H1 to H6** (first login with password change, HTTPS session, school network, several tablets, long idle, other-classroom access) | 09 §9.4 | Hosted acceptance | 2 |
| **F-1 condition 1**: a signed-in student gets 404 from the play API with the flag off, on a deployment connected to the database, with a real assignment | 15 §4 (deviation 3) and §5 | Hosted acceptance | 2 |
| **F-1 condition 2**: the cross-site header probe | 15 §4 (deviation 2) and §5 | curl from the PC with the protection bypass | 2 |
| **Full hosted flow** (publish, play, resume from two devices, submit, erase), `m2/11` C-5 | 11 §10; 19 V3 | Hosted acceptance | 2 |
| Real **timing** of one generation and of play requests on the host | 19 V7 | Hosted acceptance | 2 |
| **TV-1 page** (link hidden when off, page content, authorization through the real session) | 17; 18 §1 "not verified" | optional module | 2 (if approved) |
| **TalkBack session** (`m2/11` C-2) | 20 | TalkBack validation | 3 |

Not closed here: governance and sign-off (separate process), teacher override, the teacher results screen, the formal erasure rehearsal records of `pilot/13` (they use the same environment but belong to the governance process).

## 2. PM decisions that shape the plan

| Decision | Source |
|---|---|
| The basis of the SC6 verdict (A mode or word-input mode) is **Galaxy Tab + Chrome**; Samsung Internet is secondary; order of devices: Tab + Chrome, Tab + Samsung Internet, Windows Chrome, Windows Edge, Galaxy S24 | PM, 2026-10-18 |
| The input-mode decision may be made on the LAN; the final acceptance environment is hosted | PM, 2026-10-18 and 2026-10-19 |
| **Samsung Keyboard is required** for the tablet runs | PM, 2026-10-22 |
| TalkBack: tester is an accessibility-trained engineer; release criterion is completing a puzzle through the clue-list path; the grid path is advisory | PM, 2026-10-22 (m2/20 §10) |
| **TalkBack starts after the Galaxy Tab validation is finished and the database-connected deployment is ready** | PM, 2026-10-22 |
| Operating rules in force: no puzzle published on hosted until the PM lifts the rule; hosted schema changes only with impact report, PM go and `db push`; no Production change; flag changes only inside approved windows; hosted students may include real students and are handled as real data | PM, 2026-10 |
| **D1, environment:** **C (a separate Supabase project) is preferred; A (LAN, local data) is the supporting path; B (Preview connected to the pilot database) is not approved**, because the 64 accounts in the pilot project are not established as real, test or mixed. The separate project is the preferred acceptance and staging target | PM, 2026-10-22 |
| **D3, TV-1 validation:** **included, but informational only**. A TV-1 failure does not fail the hosted acceptance and is recorded separately | PM, 2026-10-22 |
| **D4, performance:** **no hard gate**. Collect measurements only (P50, P95, worst observed); thresholds are reviewed later, when evidence exists | PM, 2026-10-22 |
| **D5, devices:** use the available school or test devices; no additional hardware is to be acquired | PM, 2026-10-22 |
| **D6, operators:** a normal operator may run the Galaxy Tab items; for TalkBack an accessibility-trained engineer is preferred, real TalkBack users are welcome and not required for the release gate | PM, 2026-10-22 |
| **D7, acceptance project:** **retained** after the runs (hosted acceptance, TalkBack, future release verification, staged verification work) | PM, 2026-10-22 |
| TalkBack details: Samsung Keyboard required, Gboard optional; a grid failure with a successful clue-list completion is a **Major** issue, not a Blocker | PM, 2026-10-22 |

## 3. Environment strategy (the main open decision)

The current state: the Vercel project has **no Production deployment**; the M1 and M2 branches deploy as **Previews** protected by Vercel Authentication; the Supabase variables exist in the **Production scope only**, so no current deployment is connected to a database; the pilot Supabase project holds **64 students that may include real ones**; a second Supabase project exists in the same organisation and is not linked (its state was **not inspected**).

| Option | What it is | Fidelity | Data risk | Effort and approvals | Verdict |
|---|---|---|---|---|---|
| **A. LAN** | production build on the PC against the **local** database (the seed of 09 §1), the tablet on the same Wi-Fi, HTTP | input and tablet behaviour yes; HTTPS, school network, hosted limits no | none (local data) | low; no hosted approval | **Stage 1** (input verdict) and **supporting path** (PM, D1). Not acceptance for H1 to H6 |
| **B. Preview + pilot Supabase** | Preview-scope variables point to the pilot project | full | **High**: shares the database with students who may be real | medium; approvals for variables, flag window, test data on the pilot project; every script must avoid real rows | **Not approved** (PM, D1): the pilot project holds 64 accounts of unestablished status |
| **C. Preview + separate acceptance Supabase project** | Preview-scope variables (ideally scoped to the M2 branch) point to a **second, empty project** that receives the migrations and `SMOKE` data | full, except the pilot data volume | **Low**: no real student exists there | medium to high: inspect the second project (read-only), apply the migrations to it (a hosted schema change outside the pilot project, still needs the impact report and PM go), configure Auth, create the test teacher through the staff bootstrap, set Preview variables | **Preferred (PM, D1) for Stage 2 and 3**, if the second project is usable (also a candidate for the undefined "staging" of the governance process; that is decided there) |
| D. Production deployment | deploy to the Production environment | full | High | not available (no Production deployment; merging to `main` is a PM approval) | not used |

Practical issue for every Preview option (not verified): a tablet opening a Preview URL meets **Vercel Authentication**. Ways in: log in to Vercel on the tablet (exposes an account), a shareable link, or a protection bypass; **which of these the current plan offers is not verified**. Relaxing protection for the branch is possible but weakens the control; it needs an explicit PM decision (D2). For the PC probes a bypass header is enough.

**PM decision D1 (2026-10-22):** Stage 1 on A; Stage 2 and 3 on C. **B is not approved and is not a fallback**; if the second project proves unusable, the PM decides the next step. The second project is retained after the runs (D7), so each run starts with a baseline count (§5.3) instead of assuming an empty project.

## 4. Stages and sequence

```
Stage 0  readiness gate
Stage 1  Galaxy Tab input validation (LAN, local data)            -> SC1-SC6 verdict
Stage 2  Hosted acceptance (database-connected deployment)        -> H1-H6, F-1 closure, full flow, timing, Tab confirmation, [TV-1 page]
Stage 3  TalkBack validation (needs Stage 1 done and Stage 2 environment ready)
Stage 4  Cleanup, report, decisions
```

TalkBack (Stage 3) may start when **both** PM conditions hold: Stage 1 is finished with its SC6 verdict, and the database-connected deployment is ready. It is recommended to run it after the sign-in and play smoke checks of Stage 2, inside a flag window of its own.

### Stage 0. Readiness gate

| # | Item | Owner |
|---|---|---|
| 0.1 | Environment decision D1 taken; for C the Preview variables, Auth settings and the test teacher exist, and the deployment serves the release-candidate commit (shown by the deployment page and by the F-1 probe of 15 §4 step 2) | PM, Vercel and Supabase owner |
| 0.2 | Access of the tablets to the deployment through the protection (D2) | Vercel owner, PM |
| 0.3 | Approvals in writing: the flag window(s), creating the `SMOKE` data and the test puzzles in the acceptance database, lifting the "no puzzle published on hosted" rule **for the window only**, and (if the TV-1 module is included) applying the TV-1 migration there with the impact report of `m2/17` | PM |
| 0.4 | Test data scripts ready and dry-run locally (the style of `m2/18`, extended in §5) and a cleanup script with baseline counts | engineering |
| 0.5 | Devices: Galaxy Tab model(s) charged, Chrome and Samsung Keyboard versions recorded, Samsung Keyboard set as the keyboard with the prediction strip controllable, TalkBack installed, optional hardware keyboard, screen recording available | tester |
| 0.6 | People: tester(s) for Stage 1 and 2 (the user, per the earlier plan), TalkBack tester (accessibility-trained engineer) and a separate observer, Ops for windows and cleanup | PM |
| 0.7 | Record sheets (§9) and the stop conditions (§8) read by everyone | all |

### Stage 1. Galaxy Tab input validation (LAN)

Procedure: [09](09-g5-device-validation.md) §1 to §7, unchanged, with the PM's later decisions.

- **Setup:** `pnpm env:local`, `pnpm dev:seed-play`, `pnpm build`, `next start -H 0.0.0.0`, the tablet on the same Wi-Fi at `http://<PC IP>:3000/student/sign-in` (09 §1).
- **Matrix, in this order:** 1. Galaxy Tab + **Chrome**, Samsung Keyboard (soft), prediction strip on and off, portrait and landscape, hardware keyboard too if available. 2. Galaxy Tab + **Samsung Internet**, same keyboard (secondary). 3. Windows Chrome, 4. Windows Edge (hardware IME), when the PC is free. 5. Galaxy S24 only if time remains.
- **Items:** A (Korean input, SC1, SC2, SC3, SC5), B (Backspace, SC4), C (cell moves, screen, keyboard height), D (hardware keyboard), E (save, offline, resume), F (tools), G (verdict SC6). Items E and F run against the **local** stack here; their hosted repetition is Stage 2.
- **Evidence:** the IME trace of 09 §5 for every failure or doubt, copied to `tests/fixtures/ime/incoming/` for analysis; the record table of 09 §6.
- **Outcome:** the SC6 verdict on Tab + Chrome decides **A mode kept** or **word input becomes primary** (09 §6). Failures on Samsung Internet only are recorded for the PM (secondary).
- **No hosted action** in this stage.

### Stage 2. Hosted acceptance

Run on the acceptance environment of Stage 0. Everything creates only `SMOKE` data and runs inside approved flag windows.

| Step | What | Closes |
|---|---|---|
| 2.1 | **Environment proof**: read-only counts as baseline; confirm the deployment's commit; confirm `CROSSWORD_PLAY_ENABLED` is **off**; confirm the variables point to the intended database | baseline |
| 2.2 | **Teacher flow end to end with the flag off** (the teacher side does not depend on the flag): readiness panel, generate, preview, save, edit a clue, publish to the `SMOKE` classroom. Record request times of generate and save | 19 V3, V7; part of C-5 |
| 2.3 | **F-1 closure with a real assignment, flag still off**: as the `SMOKE` student signed in through the real session, call the six play routes (`state`, `save`, `check`, `reveal`, `chosung`, `submit`) of the published assignment: expected **404 `{"error":"NOT_FOUND"}`**, and `crossword_attempts` stays at 0. From the PC, the cross-site probe with `Sec-Fetch-Site: cross-site` and a bad body: expected 404 (a build without F-1 gives 403) | **F-1 conditions 1 and 2** |
| 2.4 | **Open the flag window** (PM approval; start time recorded) | |
| 2.5 | **H1 to H6** on the Galaxy Tab (Chrome, Samsung Keyboard) over HTTPS: first login with the temporary password and the forced change, session after reload and app switch, network behaviour on the school or intended Wi-Fi, two to three devices at the same time (as many as are available, D5), a session left idle for an hour, direct access to another classroom's puzzle | 09 §9.4 |
| 2.6 | **Play and resume**: play the normal puzzle, resume the same account on a second device, offline and reconnect (items E1 to E6 of 09), the three tools, wrong submit and the cooldown on the hard puzzle, complete the easy puzzle | C-5 |
| 2.7 | **Tab confirmation subset** of Stage 1 on the hosted URL (HTTPS): A1, A3, A5, A7, B1, B2, C1, C2, C4, C6; any SC1 to SC5 failure that did **not** appear in Stage 1 is flagged as environment-dependent | SC6 reconfirmation |
| 2.8 | **Student erase on hosted** with an attempt (the procedure of `m2/18` §4 step 6, through the Auth API) and the counts | C-5 |
| 2.9 | *(Included, **informational only**: PM decision D3; it needs the approval 0.3 for the TV-1 migration)* **TV-1 page**: apply the TV-1 migration, run the 18 database checks of `m2/18`, then the page checks with the `SMOKE` teachers: the link is absent with the flag off and present with it on; owner, co-teacher and admin open the progress page; the other teacher and a student get "not found"; the table shows no letters, answers or grid. **A failure is recorded separately and does not fail Stage 2** | TV-1 hosted verification (informational) |
| 2.10 | **Close the flag window** (end time recorded; the flag is off again) | |

### Stage 3. TalkBack validation

[20](20-talkback-validation-plan.md) in full, on the same acceptance environment, with the PM decisions of 2026-10-22: accessibility-trained engineer preferred as tester, **Samsung Keyboard required (Gboard optional)**, pass if the crossword can be **completed through the clue-list path**; a grid failure with a successful clue-list completion is a **Major**, not a Blocker. It needs its own flag window and the test data of §5 (a puzzle that has not been completed yet).

### Stage 4. Cleanup, report, decisions

1. Flag off (verify), then the cleanup of §5.4, then the counts of Stage 2.1 must match (every column equal to the baseline).
2. Devices: IME trace files and recordings are stored by the owner; downloaded files on the tablets are deleted.
3. The report of §9, the outcome of §7, and the list of what remains.

## 5. Test data (all `SMOKE`, never a real person)

### 5.1 Accounts

| Account | Use |
|---|---|
| `SMOKE teacher` (owner) | creates the classroom, imports the word set, generates, publishes; Stage 2.2 and 2.9 |
| `SMOKE co-teacher`, `SMOKE other teacher`, `SMOKE admin` | only for the TV-1 module (2.9), as in `m2/18` |
| `SMOKE s1` | main tablet student: first login with the temporary password (H1), all play steps |
| `SMOKE s2` | second device or concurrent user (H4), shared nothing with s1 |
| `SMOKE s3` | outsider enrolled in a different classroom (H6), and the TalkBack student if a fresh account is preferred |

Teacher and student accounts are created through the application's own paths where possible (the staff bootstrap runbook for the teacher; the teacher's student creation for students) so that H1 tests the real first login. Temporary passwords are never written into documents or the repository. In option C the test teacher is created in the acceptance project only.

### 5.2 Classrooms and puzzles

| Item | Content | Used by |
|---|---|---|
| Classroom A | owner `SMOKE teacher`, students s1, s2 | all |
| Classroom B | a different classroom, student s3 | H6, TV-1 isolation |
| Word set | at least 24 Hangul words that chain by syllable and include 2-, 3- and 4-syllable words (the word list of `scripts/dev/play-device-seed.seed.ts` can be used as a CSV; no student data), imported through the teacher's CSV import | generation |
| Puzzle NORMAL | at least 12 words, a word of 3 cells and one of 4 cells | items A to C, E, F, TalkBack |
| Puzzle EASY | small, quick to finish (5 × 5, 7 words) | completion (F5) |
| Puzzle HARD | for the wrong-submit wait (F6) | cooldown |
| Closed assignment | a puzzle whose assignment the teacher closes | read-only state (T11), H6 |

The puzzles are produced by the generator through the teacher screens in Stage 2.2, which is itself a test of the teacher flow.

### 5.3 Baseline and counts

The count script of `m2/18` §5.4 (extended with `smoke_*` columns) before Stage 2.1, after each flag window and after cleanup. **Every column after cleanup equals the baseline.** Any difference is a stop condition.

### 5.4 Cleanup

Order: flag off; delete the `SMOKE` students through the Auth admin path (attempts, members and events go with them: verified on 2026-10-20); delete the puzzles (words and assignments), the word set, classrooms; delete the `SMOKE` teacher and admin accounts through the Auth admin path; verify counts. In option C the acceptance project may be kept for the next run; in option B nothing of the test may remain. Audit rows of the test are kept (PM decision, 2026-10-21).

## 6. Roles

| Role | Does |
|---|---|
| PM | environment decision, approvals (0.3), flag windows, lifting the publish rule for the window, outcome decisions |
| Vercel and Supabase owner | Preview variables, protection access for the tablets, Auth settings, the second project's inspection, the deployment's commit |
| Ops | windows, baseline and cleanup counts, scripts, secrets handling (service key never printed or pasted) |
| Engineering | scripts, the F-1 probes, timing measurements, analysis of IME traces, the report; no fixes inside a run |
| Tester (Stage 1 and 2) | a normal operator may run the tablet items and record (D6) |
| TalkBack tester | accessibility-trained engineer preferred (m2/20, D6); real TalkBack users welcome, not required for the gate; the observer is a different person |

## 7. Pass, fail and outcome

| Area | Criterion |
|---|---|
| Input on Galaxy Tab + Chrome, Samsung Keyboard (Stage 1, confirmed in 2.7) | SC1 to SC5 do not fail in A, B, C (relevant items) and the SC6 verdict is "usable". Otherwise word input becomes primary (09 §6) and the failing traces are kept |
| Samsung Internet | recorded; a failure there alone does not fail the plan, the PM decides |
| H1 to H6 | each passes; failures are release items independent of the input decision |
| F-1 conditions | 2.3 shows 404 for all six routes with a real assignment and a signed-in student, attempts remain 0, and the cross-site probe gives 404 |
| Full flow (2.2, 2.6, 2.8) | publish, play, resume from a second device, submit, and erase all complete without a manual database repair |
| Timing | generate, save, check and submit request times are **recorded** as **P50, P95 and worst observed**; **no hard gate** (PM, D4), thresholds are reviewed later |
| TV-1 module | **informational only** (PM, D3): the 18 database checks and the page checks are recorded; a failure is recorded separately, keeps TV-1 open, and does **not** fail the acceptance |
| TalkBack | the criterion of `m2/20` §6 with the PM decisions: the crossword can be completed through the clue-list path and P1 scenarios pass; a grid failure with a successful clue-list completion is a Major, not a Blocker |
| Hygiene | counts equal the baseline after cleanup; the flag is off; no real student or real teacher row was read or changed |

| Outcome | Condition |
|---|---|
| **ACCEPTED** | every area passes |
| **ACCEPTED WITH CONDITIONS** | no blocker; failures limited to items the PM accepts in writing with a dated follow-up |
| **NOT ACCEPTED** | an SC1 to SC5 failure on Tab + Chrome without a decision to switch to word input, an H1 to H6 failure with no mitigation, an F-1 probe other than 404, a flow that needs manual repair, a TalkBack FAIL, or a hygiene failure |

## 8. Stop conditions

Stop at once and report to the PM if: a play route answers anything but 404 while the flag is off; an attempt row exists while the flag was off; a real student, teacher or classroom appears in any script output; a count after cleanup differs from the baseline; the flag cannot be turned off; the deployment does not show the intended commit; a secret appears in an output or a recording; the environment points to the pilot project when option C was chosen.

## 9. Evidence and report

| # | Evidence |
|---|---|
| E1 | Environment sheet per stage: date, place, environment option, deployment address and commit, Supabase project (name only), flag window (start and end), people |
| E2 | Device sheet: Galaxy Tab model, Android, Chrome, Samsung Keyboard and Samsung Internet versions, prediction strip state, orientation, hardware keyboard, TalkBack version (Stage 3) |
| E3 | The record table of 09 §6 extended with columns **Stage**, **Environment** and **Build commit**, one row per device, browser, orientation and keyboard setting |
| E4 | IME trace files for every failure or doubt (test accounts only), listed in the table |
| E5 | F-1 probe outputs (status, content type, body; no cookies) for 2.3 |
| E6 | Timing table of 2.2 and 2.6 (generate, save, check, submit, page load) with device and network: **P50, P95 and the worst observed value** per request type (PM, D4) |
| E7 | Count outputs: baseline, after each window, after cleanup |
| E8 | TV-1 outputs (18 rows) and page checks, if the module runs |
| E9 | TalkBack evidence E1 to E8 of `m2/20` §7 |
| E10 | Decision record: the outcome of §7, accepted items with dates, who decided |

The report maps every result to the release conditions of `m2/11` (C-1, C-2, C-5, and C-6 for TV-1), to the F-1 conditions of `m2/15`, and to the decisions D1 to D8 below.

## 10. Risks

| # | Risk | Handling |
|---|---|---|
| R1 | The environment is connected to the pilot database and a script touches real students | option C preferred; scripts filter on fixed `SMOKE` ids and only count other rows; stop condition |
| R2 | The tablets cannot pass Vercel Authentication | D2; decide before Stage 2; a bypass or share link, or a PM-approved relaxation for the branch |
| R3 | The second Supabase project is not usable (state unknown, missing migrations, Auth settings) | read-only inspection first; if unusable, fix or wait: **B is not approved** (PM, D1) |
| R4 | A failure appears only on hosted (HTTPS, network, cookies) after a clean Stage 1 | 2.7 flags environment-dependent failures separately |
| R5 | The flag window is left open | the end time is recorded, the flag state is checked in Stage 4, stop condition |
| R6 | The teacher flow on hosted fails and blocks the student items | the SQL fixture style of `m2/18` is the fallback for creating the puzzle (recorded as a deviation) |
| R7 | Test data on the hosted project | `SMOKE` prefix, approvals, counts before and after, cleanup scripts dry-run locally |
| R8 | Findings need code changes | recorded only; the PM decides the schedule; retest on the same stage |
| R9 | Generation time on the host is high and no time valve is active (19 §1.4) | E6 records it; D4 |
| R10 | Tablet access to the school network differs from the intended classroom network | record the network used; repeat on the classroom network if it differs |
| R11 | Samsung Keyboard settings (prediction strip, autocorrect) change results | record them per run; both strip states in Stage 1 |

## 11. Effort (qualitative)

Stage 1: about one day on the tablet with the PC prepared. Stage 2 preparation (variables or a second project, Auth, test teacher, scripts, approvals): the largest and least certain part, depending on D1 and D2. Stage 2 execution: about one day, split in two flag windows. Stage 3: half a day plus analysis. Stage 4: a few hours. With approvals in hand, about one calendar week.

## 12. Decisions

**Decided by the PM on 2026-10-22: D1, D3, D4, D5, D6, D7** (recorded in §2). **Still open: D2 (how the tablets pass Vercel Authentication) and D8 (start date).** The table keeps the original wording for reference.

| # | Decision |
|---|---|
| D1 | Environment for Stage 2 and 3: C (second project), B (pilot project, strict isolation) or other. The second project should be inspected read-only first |
| D2 | How the tablets pass Vercel Authentication (login, share link, bypass, or a relaxation for the branch) |
| D3 | Include the TV-1 module (2.9) in this acceptance, which needs the TV-1 migration in the acceptance database |
| D4 | Timing thresholds for generate, save, check and submit (after the first measurement) |
| D5 | Which Galaxy Tab model(s) and how many devices for H4 (several tablets at once) |
| D6 | Who runs Stage 1 and 2 on the tablets (the user did the earlier runs) and who is the observer |
| D7 | Whether the acceptance project may be kept between runs (option C) or must be emptied after each run |
| D8 | Start date, subject to Stage 0 and the PM conditions (Stage 1 first, deployment ready before Stage 3) |

### Facts not verified while writing this plan

The state of the second Supabase project; whether branch-scoped Preview variables, shareable links or a protection bypass are available on the current Vercel plan; the Galaxy Tab model and software versions; whether the TalkBack developer option to display speech output exists on the device; Samsung Keyboard version behaviour.
