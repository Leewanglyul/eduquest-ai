# 9. M1 release closure checklist

The single actionable list that closes M1: every remaining **Required before pilot** item (R1–R12 of `08` §3), with an owner, an effort estimate and completion criteria. Documentation only; no code was changed to produce it. Tick a box only when its *Done when* evidence is attached.

## 0. Baseline and conventions

| | |
|---|---|
| Baseline | `m1/issue-005-student-provisioning`, pushed. Application code last changed in `48d07cd` (A1 lockout classification). 50+ commits ahead of `origin/main`, 0 behind, 130+ files changed, **merges cleanly** (checked with `git merge-tree`). No pull request, no tag, no CI |
| Already done, do not redo | Code gates green on the head (typecheck, lint, build, 16-migration apply, pgTAP 8 files, vitest 116/116; Postgres 15 and 17); all `docs/pilot` documents pushed; pilot assumptions validated locally at scale; rollback switches validated locally |
| Numbering | `R1`–`R13` below are the "Required before pilot" items of `08` (R13 was added by `10`). Two older lists exist: `05`'s readiness criteria, now numbered **RC1–RC10**, and `07`'s blockers B1–B8. Mapping: see the *Maps to* column |
| Environment of every estimate | one engineer, one operator, a reviewer, both Supabase projects creatable on demand. **Active effort** = hands-on time. **Elapsed** adds waiting (review, approvals, restores) |
| Names | Owners are roles taken from the documents. Fill the *Name* column before starting |

Owner roles: **Eng** (implementation engineer) · **Ops** (operator with Supabase Dashboard and hosting access) · **PM** (product owner / accepts risk) · **Reviewer** (architect or reviewer of the pull request; per the project brief this is the PM-side reviewer) · **School** (school lead / data-protection contact) · **On-call** (named support person for the pilot).

## 1. Prerequisite decisions

These unblock the items below. Record each outcome in the sign-off table of `04`.

| ☐ | ID | Decision | Owner | Active effort | Needed by | Done when |
|---|---|---|---|---|---|---|
| ☐ | D1 | App hosting platform and its request-time limit | Eng + PM | 1 h | R2, R5, R12 | Platform named; limit written down (seconds) |
| ☐ | D2 | Staff password recovery: Dashboard-only or custom SMTP | Ops + PM | 30 min | R7, `06` §4.2 | One option recorded; if SMTP, provider chosen |
| ☐ | D3 | Commit a lockfile | Eng | 10 min | R9 | "Yes" recorded (recommended: yes) |
| ☐ | D4 | Pilot scope: school, classes, students, dates, supervising adults | PM + School | 1 h | R11 | Written scope matching `07` §2 |
| ☐ | D5 | Accept audit action `student.password_reissued` | PM | 10 min | R9 (PR) | Accepted in the PR description |
| ☐ | D6 | Consent, retention and erasure sign-off | School + PM | 1 h of work, **days to weeks elapsed** | R10 | Signed decision (see R10). **Longest lead item: start first** |

## 2. Master checklist

| ☐ | ID | Item | Owner | Active effort | Elapsed | Depends on | Maps to | Done when (evidence) |
|---|---|---|---|---|---|---|---|---|
| ☐ | **R2** | Batch cap implemented (30) and confirmed by staging measurement; import page text matches; **or** signed process-only acceptance | Eng (code), Reviewer, PM (alternative) | Code + tests 0.5–1 day; staging measurement 1 h (inside R1). Alternative: PM 30 min | 1–2 days incl. review | D1 | 05 RC3, 07 B2 | A merged change per `01` (one constant, message, help text, tests) and the measured seconds-per-row table; S5b **passes** (31 rows refused at preview, nothing created). If acceptance instead: signed note plus batch size added to the daily monitoring |
| ☐ | **R9** | Release hygiene: lockfile committed; `postcss` advisories closed; branch merged by reviewed PR; release tagged | Eng, Reviewer, PM | Lockfile 15 min; advisory memo 30 min (or override path 2–3 h); open PR 1 h; **review of 130 files 0.5–1 day**; merge + tag 15 min | 2–3 days | D3, D5, R2 code | 05 RC4+RC5, 07 B3 | `pnpm-lock.yaml` tracked and `pnpm install --frozen-lockfile` passes; advisory decision recorded; PR approved and merged to `main`; tag `m1-pilot-rc1` on the merge commit; code gates re-run green on the tag |
| ☐ | **R1** | Staging acceptance: `07` §3 Steps 2–9, incl. S4 (`.invalid` email), S9 (class login, measured rate limit), S13 (session soak) | Ops + Eng | **1 day** (S1–S15 ≈ 4 h, S9 script 1–2 h, S13 ≈ 1 h wall, measurements 1 h, recording 1 h); +0.5 day per failed rerun | 1–2 days | R9 (deploy the tag), R2, D1, D2 | 05 RC2, 07 B1 | Filled staging checklist with every step ticked; S5b passes; S9 numbers recorded (accepted count before first `429`, which limit tripped); S13 shows no unexpected sign-out and 3600 restored; no change-control setting had to be altered |
| ☐ | **R3** | Hosted Auth/JWT/refresh/signup/password/rate-limit settings applied **and verified on production** | Ops | 2–3 h (about 25 settings + 3 `curl` checks + recording) | 0.5 day | R1 (final rate-limit values) | 05 RC6, 07 B4 | `06` §4 "Required" column equals the Dashboard; `curl` settings/signup/anonymous checks return the documented responses; no test user was created; outputs attached |
| ☐ | **R4** | Security Advisor compared with the expected list | Ops (+ Eng for findings) | 1 h, +0–2 h to resolve | 0.5 day | R6 (schema in place) | 05 RC6, 07 B4 | Advisor export attached; every finding either absent, in the expected list of `08` §1, or resolved/accepted in writing |
| ☐ | **R5** | Environment variables correct on production; service key never in the client | Ops (+ Eng) | 1 h per environment | 0.5 day | D1 | 07 B4 | Public variables set in the **build** environment, service key runtime-only; deploy log shows `ƒ Middleware`; search of the deployed client JS for the key's first 12 characters returns 0 matches; sign-in works |
| ☐ | **R6** | All 16 migrations deployed by `db push`; no seed | Ops | 1 h per environment | 0.5 day | project exists | 07 B4 | `supabase migration list --linked` shows 15/15; `schema_migrations` count 15; no table without RLS; `account_batches`/`audit_logs` 0 policies; `select count(*) from auth.users` is 0 before bootstrap; `--include-seed` never used |
| ☐ | **R7** | Staff bootstrapped on production with the two-person rule; test accounts removed | Ops + second Ops/PM | 1–2 h (+ 0.5 h clean-up) | 0.5 day | R3, R6, R1 | 05 RC8, 07 B5 | Ops log entry per account (who, who checked, role, reason); verification query shows all `active`, `confirmed`, **one** `school_id`; each person signed in once; test classrooms/students/accounts removed by a reviewed, two-person SQL clean-up |
| ☐ | **R8** | Backups on; restore drill into a scratch project; alert recipient set | Ops | 3–5 h (restore time depends on size; an empty database is fast) | 0.5–1 day | R6 (something to restore) | 05 RC7, 07 B6 | Backup schedule visible in the Dashboard; drill record with duration and a row-count comparison; alert address receives a test alert |
| ☐ | **R12** | HTTPS only; security headers configured at the host | Ops | 1–2 h per environment | 0.5 day | D1 | 07 B4 | `curl -sI https://<domain>/teacher/sign-in` shows `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` (or CSP `frame-ancestors`); `http://` redirects to `https://` |
| ☐ | **R10** | Consent, retention and an approved erasure procedure for student data | School + PM (decision); Eng (procedure) | Procedure: Eng 2–3 h to write and test on staging + review 1 h | **days to weeks** (external) | D6 | 05 RC9, 07 B7 | Signed decision D6 stating lawful basis/consent route, retention period and who may request erasure; an approved procedure tested on staging: deleting a student's auth user cascades to their profile, student record, account and enrollments, and the procedure states what happens to audit rows (they remain with ids and usernames, no names) |
| ☐ | **R11** | On-call named; support contacts; one-page teacher guide; pilot constraints accepted | PM + On-call (+ Eng for the guide) | On-call roster 1 h; guide 3–4 h; short teacher briefing 1 h; sign-off 30 min | 1–2 days | D4, R1 | 05 RC10, 07 B8 | Names and contacts written; guide issued and covers sign-in, creating/importing students, handing out credentials, reissue for forgotten password, what not to do; pilot constraints (`07` §2) signed by the PM |
| ☐ | **R13** | **Auth errors vs lockout (A1):** the sign-in action used to count *any* Auth error (429, outage, network) as a failed password. The classification patch (commit `48d07cd`, migration 16) now refunds infrastructure errors. Remaining: prove it on the hosted project and rehearse recovery | Ops (S9, limits, rehearsal) + PM | 1 h rehearsal (S9 itself is inside R1) | with R1 | R1 | none (new) | Migration 16 applied by `db push`; S9 at 60 sign-ins in five minutes: no student locked afterwards (a `429` may still delay sign-in until the window clears); the mass-unlock SQL (`10` §3.7) rehearsed on staging; limits/staggering constraint recorded |

## 3. Recommended sequence (critical path)

1. **Day 0:** start D6 (longest lead). Take D1–D5 decisions in one short meeting.
2. **Days 1–2 (engineering):** R2 code and tests (30-row cap) and R9 lockfile/advisory memo, then open the PR.
3. **Days 2–4:** PR review and merge; tag `m1-pilot-rc1` (R9). In parallel, Ops creates the staging project and applies R3-style settings, R6 and R12 on staging.
4. **Day 4–5:** deploy the tag to staging; run **R1** (includes R4 on staging, R5, the R7 rehearsal and the R8 drill).
5. **Day 5–6:** fix anything R1 found; if the measured cap differs from 30, make the one-constant change, re-tag and re-run S5/S5b.
6. **Day 6–7 (production):** R6 → R3 → R5 → R12 → R4 → R7 → R8.
7. **Before go-live:** R10 and R11 closed; final sign-off.

Estimated total: about **6–8 working days elapsed** with an engineer, an operator and a reviewer working in parallel, assuming D6 does not block. If D6 takes longer, go-live moves with it; nothing else on the list can substitute for it.

## 4. Closure criteria for M1

- ☐ D1–D6 recorded; R1–R13 all ticked with evidence attached.
- ☐ Sign-off table in `04` completed, including the chosen batch cap and the measured rate-limit values.
- ☐ `docs/pilot` updated with the staging results (`01` cap, `06` §4.4 limits, `03` verified tags, `05` criteria statuses).
- ☐ Release tag on `main`; production deploys that tag.
- ☐ Post-go-live review dates fixed (day 5 and day 14) and the monitoring routine started (`04` phase 7).
- ☐ Recommended items (`08` §3, C1–C8) either scheduled or consciously deferred in the PM's note.

## 5. Risks to the schedule

| Risk | Effect | Mitigation |
|---|---|---|
| D6 (consent/erasure) is slow | Go-live blocked regardless of engineering | Start day 0; the school contact owns it |
| Reviewing 130 files / 48 commits takes longer than a day | R9 and everything after slips | Split review by area using `docs/pilot` and the test suites as the guide; reviewer assigned before the PR opens |
| `.invalid` auth email rejected by the hosted project (S4) | Student provisioning cannot work on hosted | This is a code/design change (the domain) and must be raised immediately; do not proceed to production |
| Hosted rate limit trips at fewer than 30 log-ins and the plan cannot raise it | Class log-in fails | Staggered log-ins (constraint 8 in `07` §2) or a plan change |
| Staging session soak fails | Sessions end unexpectedly | Check JWT lifetime, reuse interval and that the middleware is listed in the build log before anything else (`06` §4.3) |
| `postcss` advisory scanner blocks the release | R9 stalls | The newest Next 15 still pins the affected `postcss` 8.4.31; only Next 16 or a dependency override removes it. Record a written acceptance (build-time use on our own CSS) or schedule an override with a full regression run |
