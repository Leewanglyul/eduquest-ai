# 7. Final pilot package: constraints, staging checklist, production blockers

Result of the hosted-pilot-readiness verification of `docs/pilot/*`. Documentation only; no application code was changed. This document is the single place to run the gate from. It points to `01`–`06` for detail.

## 0. Verdict

**Ready with Conditions.** The documentation is complete and consistent enough to run a staging deployment now. Real students must not be put on production until the blockers in section 4 are closed with evidence.

What this pass checked, and the result:

| Check | Result |
|---|---|
| Links between documents | 0 broken |
| Smoke-test ids (S1–S15) defined in `04`, referenced elsewhere | consistent |
| Decisions D1–D6 defined in `04`, referenced elsewhere | consistent |
| Contradictions between documents | 4 found and fixed in this pass (below) |
| Auth client refresh margin (the "90 s" rule) | confirmed in source: `EXPIRY_MARGIN_MS = 3 × 30 s = 90 s` (auth-js 2.117.3) |
| `NEXT_PUBLIC_*` variables | inlined into the middleware at build time when present; when absent, the compiled middleware keeps a runtime lookup (build still succeeds). Provide them at build time |
| Postgres compatibility | all 15 migrations + 7 pgTAP files + 78 vitest tests pass on 15.19 and 17.11 |
| Code still matches the docs | yes; batch cap is still 200 in code (`MAX_BATCH_ROWS`), lockfile still untracked, one docs commit unpushed |

Fixes made to the documents in this pass:

1. `04` quoted a stale test count (77/77); now 78/78.
2. `04` S5/S5b assumed a batch cap that does not exist yet; they are now marked (use 30 rows; S5b is "blocked", not "passed", until the cap ships).
3. `05` readiness criterion R6 pointed at the older checklist; it now points at `06` (with `03`).
4. `06` described `NEXT_PUBLIC_*` handling more strongly than verified; it now states the verified behaviour.

## 1. Review by focus area

| Area | Where documented | Status | Verified how | Remaining gap |
|---|---|---|---|---|
| Hosted Supabase configuration | `06` §3–4, `03` | Complete | Keys, defaults and effective values read from the CLI template and the running Auth server; public settings endpoint captured | Dashboard labels/plan limits unverifiable offline (§9 of `06`) |
| Auth settings | `06` §4.2 | Complete | `GET /auth/v1/settings` shows signup off, only `email` provider | Confirm Email OFF is a deliberate choice that matches the tested local setup |
| JWT lifetime | `06` §4.3 | Complete | `expires_in = 3600`; 60 s fails, 150 s passes over repeated expiries; 90 s margin proven in source | S13 soak on the deployed build |
| Refresh-token settings | `06` §4.3, §4.5 | Complete | Rotation on, reuse 10 s locally; 0 s failed under parallel requests | Hosted reuse-interval value (S13) |
| Signup settings | `06` §4.2, Part B | Complete | `signup_disabled` and `anonymous_provider_disabled` responses captured | Repeat on hosted (Part B2/B3) |
| Password settings | `06` §2, §4.2 | Complete | App minimum 8, temporary 14 chars; reasoning for project minimum 8 and no requirements | S6 must show the app message for a rejected password |
| Batch limit | `01`, `04` S5/S5b | **Plan only** | Measured 294 ms/row sequential, 67 ms/row at concurrency 4 | **Not implemented**; hosted per-row time and host limit unmeasured |
| Teacher bootstrap | `02`, `06` Part D | Complete | Every SQL statement executed against the local DB (insert, duplicate refusal, listing, suspend, revoke) | Dashboard "Add user" with signups disabled is untested on hosted (staging step 5.1) |

## 2. Final pilot constraints

Scope

1. One school, 3–4 teachers, about 100 students, 3–4 classes; fixed start and end dates; reviews at day 5 and day 14.
2. Only students with recorded consent (D6). No real data in staging.

Operation

3. Named on-call person for the first two weeks, with Dashboard and hosting access, able to reissue passwords on the spot.
4. Daily monitoring queries (`04` phase 7) in week 1; weekly backup check afterwards.
5. **Change control, no exceptions during the pilot:** JWT expiry (3600), refresh-token rotation and reuse interval (10), signup settings, rate limits, keys, Postgres version, Node version. No deploys during school hours.
6. Staff accounts only through the runbook (`02`): two people, logged.

Usage

7. **CSV imports of at most 30 rows** until the cap is implemented and measured (code still allows 200). Larger classes use several files.
8. Stagger class log-ins (about 25 per minute) until S9 has measured the rate limit on the hosted project.
9. Credential sheets are handed out in person or on screen, never by email or chat; teachers delete the CSV afterwards.
10. Forgotten password, lost sheet or lockout: the teacher reissues from the roster. An owner adds a co-teacher before leaving.

Stop rule

11. Any wrong-student data exposure, lockout bypass, or unrecoverable credential loss pauses the pilot until reviewed.

## 3. Final staging checklist

One ordered list. Tick each box, write the result and evidence in the right-hand column, and attach the filled copy to the sign-off. Any failure: fix, redeploy to staging, rerun from step 6.

### Step 0: decisions (before touching anything)

| ☐ | Decision | Result |
|---|---|---|
| ☐ | D1 hosting platform and its request-time limit | |
| ☐ | D2 staff password recovery: Dashboard-only or custom SMTP | |
| ☐ | D3 commit a lockfile | |
| ☐ | D4 pilot scope (section 2) | |
| ☐ | D5 audit action `student.password_reissued` accepted | |
| ☐ | D6 consent / retention / erasure sign-off | |

### Step 1: code gates on the tagged commit

| ☐ | Command | Expected |
|---|---|---|
| ☐ | `pnpm typecheck` | clean |
| ☐ | `pnpm lint` | 0 errors (2 known warnings) |
| ☐ | `pnpm build` | success; log lists `ƒ Middleware` |
| ☐ | `supabase start`, `supabase db reset` (local only), `supabase test db` | PASS, 7 files |
| ☐ | `pnpm test:access` | 78/78 |
| ☐ | `pnpm audit --prod` | 4 known `postcss` advisories inside Next, or fewer; decision recorded |

### Step 2: staging project

| ☐ | Action | Expected |
|---|---|---|
| ☐ | Create `eduquest-staging` in the production region (`06` §3.1); record the Postgres version | If neither 15 nor 17, run the local suite on that version first |
| ☐ | Apply every row of `06` §4.2, §4.3, §4.4 | Dashboard equals the **Required** column |
| ☐ | Enable daily backups (and PITR if available); operator accounts with MFA | |

### Step 3: verify settings from outside (`06` Part B)

| ☐ | Check | Expected |
|---|---|---|
| ☐ | `GET /auth/v1/settings` | `disable_signup:true`, `mailer_autoconfirm:true`, only `email` provider |
| ☐ | `POST /auth/v1/signup` with an email | `422 signup_disabled`; no user created |
| ☐ | `POST /auth/v1/signup` with `{}` | `422 anonymous_provider_disabled` |

### Step 4: database (`06` Part C)

| ☐ | Command / query | Expected |
|---|---|---|
| ☐ | `supabase link --project-ref <ref>`; `supabase migration list --linked` | 15 local, none remote |
| ☐ | `supabase db push --dry-run` | exactly the 15 migrations |
| ☐ | `supabase db push` (never `--include-seed`) | applied; list shows 15/15 |
| ☐ | RLS, policy-count and `auth.users` queries from `06` Part C | no table without RLS; `account_batches`/`audit_logs` 0 policies; 0 users |
| ☐ | Dashboard → Advisors → Security | every finding resolved or accepted in writing |

### Step 5: staff bootstrap rehearsal (`02`)

| ☐ | Action | Expected |
|---|---|---|
| ☐ | **5.1** Dashboard "Add user" works while "Allow new users to sign up" is OFF | user created (untested on hosted until now) |
| ☐ | Generate and record `PILOT_SCHOOL_ID`; create admin and one teacher with the two-person rule | `INSERT 0 1` each |
| ☐ | Verification queries (`02` §D) | all `active`, `confirmed`, one `school_id` |
| ☐ | Password grant for the teacher (`06` Part B4) | `"expires_in":3600` |
| ☐ | Suspend and reactivate the teacher | refused while suspended, works after |

### Step 6: application deployment (`06` Part E)

| ☐ | Action | Expected |
|---|---|---|
| ☐ | Set the 3 variables; the two `NEXT_PUBLIC_*` in the **build** environment | |
| ☐ | Deploy the tagged commit | build log lists `ƒ Middleware` |
| ☐ | Search the client JS for the service key's first 12 characters | 0 matches |
| ☐ | Security headers + HTTPS redirect (`06` §3.3) | `curl -sI` shows them |
| ☐ | Sign in as the teacher | lands on `/teacher` |

### Step 7: smoke test S1–S15 (`04` phase 3)

Run the whole table in two browsers. Items that gate the production decision:

| ☐ | Step | What must be recorded |
|---|---|---|
| ☐ | **S4** create one student | `.invalid` auth email accepted by the hosted project |
| ☐ | **S5** import 30 rows | seconds per row |
| ☐ | **S5b** import cap + 1 rows | **blocked until the cap is implemented**; record "blocked" |
| ☐ | **S6** short and weak passwords | the app shows a message for each (a weak password rejected by Auth shows only the generic error: accepted, `06` F2) |
| ☐ | **S8 / S8b** lockout, serial and burst | locks at 5; never more than 5 password checks |
| ☐ | **S9** 30 sign-ins in a minute, then 60 in five minutes | count accepted before the first `429` and which limit tripped |
| ☐ | **S10** reissue | old password and sessions dead; forced change |
| ☐ | **S13** soak | JWT set to 300 s temporarily; 20+ min active plus one idle gap > 300 s; no unexpected sign-out; **restore 3600** |
| ☐ | All others (S1–S3, S7, S11, S12, S14, S15) | pass |

### Step 8: measurements and drills

| ☐ | Item | Record |
|---|---|---|
| ☐ | Batch timing at 10, 30 and 50 rows (3 runs each) | median seconds per row → choose the cap (`01`) |
| ☐ | Backup restore into a scratch project | time taken, data intact |
| ☐ | Rate limits | set `sign_in_sign_ups` and `token_refresh` from the S9 result (`06` §4.4) |
| ☐ | Monitoring queries (`04` phase 7) | all run without error on hosted |

### Step 9: staging sign-off

Staging passes only if every box above is ticked, S5b is the sole documented "blocked" item, and no step required changing a setting listed in section 2 item 5.

## 4. Final production blockers

All must be closed with evidence before real students use production.

| # | Blocker | Closed by (evidence) | Needs code? |
|---|---|---|---|
| B1 | Staging acceptance: Steps 2–9 complete, including S4, S9 and S13 | Filled staging checklist | no |
| B2 | **Batch cap implemented and measured**; S5b passes; UI help text shows the same number | Merged change per `01` (constant, message, help text, tests) + measurement table | **yes** (small) |
| B3 | Release hygiene: lockfile committed (D3), `postcss` advisories resolved or accepted in writing, docs pushed, branch merged through a reviewed PR, release tagged | PR link, tag, decision note | lockfile/dependency only |
| B4 | Production project configured and verified: `06` §4 applied, Part B outputs, Security Advisor reviewed, security headers and HTTPS in place | Filled checklist + command outputs | no |
| B5 | Production staff bootstrapped with the two-person rule; test accounts removed | Ops log | no |
| B6 | Recovery: backups on, restore drill done, alert recipient set | Drill record | no |
| B7 | Data protection: consent, retention and an approved erasure procedure for student data (no delete/export feature exists) | Signed decision D6 + approved SQL procedure | no |
| B8 | Operations: on-call and support contacts named; one-page teacher guide issued; pilot constraints (section 2) accepted by the PM | Names, document, sign-off | no |

### Accept-with-sign-off items

Not blockers if the PM records an explicit acceptance; each has a stated mitigation.

| # | Item | Mitigation / what accepting means |
|---|---|---|
| A1 | Session cookie has no `Secure` or `HttpOnly` flag (`@supabase/ssr` 0.5.2 defaults; `06` F1) | HTTPS-only with HSTS. Preferred: fix with a small code change before production |
| A2 | Rejected weak/common passwords show only a generic error; leaked-password protection stays OFF (`06` F2) | Teachers briefed; revisit after the message is mapped |
| A3 | No CI; tests run locally only and refuse non-local URLs | Manual gates in staging Step 1 on the tagged commit |
| A4 | Known limitations listed in `04` (no staff password change in-app, no bulk reissue, no student delete screen, non-atomic create+enroll, no batch retry, school-wide student list for teachers, best-effort audit, admin via service role) | Accepted for M1; tracked for M2 |
| A5 | `next lint` is deprecated; 2 lint warnings | Cosmetic |

## 5. After staging: update these documents

`01` (chosen cap and measured timings), `06` §4.4 (rate-limit values and the S9 result), `03` (the "verified on staging" tags), `05` (readiness-criteria statuses), and the sign-off table in `04`.
