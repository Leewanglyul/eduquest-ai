# 11. Hosted pilot verification package

The package to run when the hosted staging project exists: what must be verified, the exact order to verify it, the Supabase settings sheet, the batch-cap implementation options, and the go-live decision workflow. Documentation only; no application code, architecture or database change. Prepared 2026-10-16.

## 0. Basis

| | |
|---|---|
| Branch state | `m1/issue-005-student-provisioning`, all pushed; application code last changed in `48d07cd` (A1 lockout classification); 52 commits ahead of `origin/main`, 0 behind, merges cleanly; no PR, no tag, no CI; lockfile untracked; **16** migrations; `MAX_BATCH_ROWS` is **200** |
| Last full gates | typecheck clean; lint 0 errors; production build lists `ƒ Middleware`; clean 16-migration apply; pgTAP 8 files PASS; vitest 116/116; Postgres 15.19 and 17.11 |
| Evidence tags | **[V-local]** verified on the local stack; **[staging]** can only be proven on the hosted project |

### What reviewing `docs/pilot/*` against the repository found

| # | Finding | Consequence |
|---|---|---|
| V-1 | **The per-IP rate limit applies to the app server's IP**, because every Supabase call is made by the server. A test run from a laptop against the Auth API measures the laptop's IP, not the school's | S9 and the A1 proof must drive the **deployed app's sign-in form**. Appendix A is a load generator that does this over plain HTTP, validated locally: 30 simultaneous correct sign-ins all succeeded; 2 students × 6 serial wrong passwords gave 4 wrong + 2 locked each, as designed |
| V-2 | Smoke test S9 in `04` ("30 students sign in within one minute") had no executable procedure | Defined in §2 (ST-31 to ST-35) with the generator |
| V-3 | **No test pins the batch cap at all** (neither 200 nor 30) | Any cap change needs new boundary tests (§4) |
| V-4 | Function-privilege expectations were spread over several documents | One query and the expected output in §1 (VER-16) |
| V-5 | The first-login students used for load testing keep their temporary password after a successful sign-in, so the same accounts can be reused for repeated runs | The generator can be run several times on the same `accounts.txt` |

## 1. Hosted verification checklist

What must be true on the hosted project. Tick when the **Evidence** is attached. The order of execution is §2; "Maps to" links to the older documents (`04` smoke tests S1–S15, `06` parts, `09` items).

### A. Platform and Supabase configuration

| ☐ | ID | Verify | Expected | Evidence | Maps to |
|---|---|---|---|---|---|
| ☐ | VER-01 | Region, Postgres version | Production region; the version is 15 or 17 (both pass the full suite); any other version is tested locally first | Dashboard screenshot | `06` §3.1 |
| ☐ | VER-02 | Public settings endpoint | `"disable_signup":true`, `"mailer_autoconfirm":true`, `external` has only `"email":true` | `curl` output | `06` B1 |
| ☐ | VER-03 | Signup refused | `422 signup_disabled`; Dashboard → Users shows **no** new user | `curl` output + screenshot | `06` B2 |
| ☐ | VER-04 | Anonymous refused | `422 anonymous_provider_disabled` | `curl` output | `06` B3 |
| ☐ | VER-05 | JWT lifetime | A staff password grant returns `"expires_in":3600` | `curl` output | `06` B4 |
| ☐ | VER-06 | Refresh-token rotation ON, reuse interval 10 s | Dashboard values; behaviour proven by ST-52 | Screenshot + soak result | `06` §4.3 |
| ☐ | VER-07 | Password policy | Minimum 8; no required characters; leaked-password protection OFF; Confirm email OFF; Secure password change OFF | Screenshot | `06` §4.2 |
| ☐ | VER-08 | Site URL / redirect URLs | This environment's HTTPS origin; redirect list empty | Screenshot | `06` §4.2 |
| ☐ | VER-09 | Rate limits | Set per ST-35; values recorded | Screenshot + S9 numbers | `06` §4.4 |
| ☐ | VER-10 | Backups | Daily backups on (PITR if offered); operator accounts have MFA | Screenshot | `06` §3.1 |
| ☐ | VER-11 | Optional drift check | `supabase config diff` against the target `[auth]` block shows no unexpected difference | Command output | `06` §5 |

### B. Schema and security

| ☐ | ID | Verify | Expected | Evidence | Maps to |
|---|---|---|---|---|---|
| ☐ | VER-12 | Migrations applied | `supabase migration list --linked`: **16/16**; `select count(*) from supabase_migrations.schema_migrations;` → 16 | Output | `06` Part C |
| ☐ | VER-13 | No seed data | `select count(*) from auth.users;` → 0 before bootstrap; never `--include-seed` | Output | `06` Part C |
| ☐ | VER-14 | RLS on every table | `select tablename from pg_tables where schemaname='public' and not rowsecurity;` → no rows | Output | `08` §1 |
| ☐ | VER-15 | Policies | 8 tables; `account_batches` and `audit_logs` have 0 policies; every other table has SELECT-only policies | Output of the policy-count query (`06` Part C) | `06` Part C |
| ☐ | VER-16 | Function privileges | `select p.proname, has_function_privilege('anon',p.oid,'EXECUTE'), has_function_privilege('authenticated',p.oid,'EXECUTE'), has_function_privilege('service_role',p.oid,'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1;` → the five sensitive functions `fn_revoke_user_sessions`, `fn_student_login_begin`, `fn_student_login_fail`, `fn_student_login_release`, `fn_transfer_enrollment` show `f, f, t`; the three harmless helpers `fn_classrooms_code_immutable`, `fn_generate_classroom_code`, `set_updated_at` show `t, t, t` | Output [V-local] | `08` §1 |
| ☐ | VER-17 | Security Advisor | Matches the expected list in `10` §1.A (INFO "RLS enabled, no policy" ×2; Auth warning "leaked password protection disabled"; nothing else) | Advisor export | `08` §1 |

### C. Application deployment

| ☐ | ID | Verify | Expected | Evidence | Maps to |
|---|---|---|---|---|---|
| ☐ | VER-18 | Environment variables | Public ones present in the **build** environment; service key runtime-only | Host configuration screenshot (values hidden) | `10` §1.B |
| ☐ | VER-19 | Build output | Log lists `ƒ Middleware` | Build log | `06` Part E |
| ☐ | VER-20 | Service key not in the client | Searching the deployed client JS for the key's first 12 characters finds nothing | Search result | `06` Part E |
| ☐ | VER-21 | HTTPS and headers | `http://` redirects to `https://`; `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` (or CSP `frame-ancestors`) present | `curl -sI` output | `06` §3.3 |
| ☐ | VER-22 | First request works | Staff sign-in lands on `/teacher` | Screenshot | S1 |

### D. Authentication behaviour (the product's security promises)

| ☐ | ID | Verify | Expected | Evidence | Maps to |
|---|---|---|---|---|---|
| ☐ | VER-23 | Guards | Signed-out `/teacher`, `/student` redirect to the right sign-in; a teacher cannot open `/student`; a student cannot open `/teacher` | Screenshots | S2 |
| ☐ | VER-24 | `.invalid` auth email accepted | A student account is created and signs in | Result of ST-24 | S4 |
| ☐ | VER-25 | Forced first-login reset | Temporary password → set-password; opening `/student` directly bounces back; weak/short password shows a message | Screenshots | S6 |
| ☐ | VER-26 | Lockout, serial | 4 wrong → generic error; 5th → "5회 실패하여 15분간 잠겼습니다"; correct password refused while locked | Screenshots | S8 |
| ☐ | VER-27 | Lockout, burst | 20 parallel wrong passwords: locked, at most 5 password checks | Result of ST-27 | S8b |
| ☐ | VER-28 | **A1: infrastructure errors do not lock** | After the rate-limit burst of ST-35, `select count(*) from public.student_accounts where locked_until > now() or failed_attempts > 0;` → **0**, and the students who were rate-limited can sign in once the window clears | Output + re-run result | R13 |
| ☐ | VER-29 | Reissue | Old password and sessions dead; new password forces a change; audited without the password | Screenshots + audit query | S10 |
| ☐ | VER-30 | Session survives token expiry | Soak with a temporary 300 s JWT: no unexpected sign-out over 20+ minutes including an idle gap > 300 s; **3600 restored** | Soak record | S13 |
| ☐ | VER-31 | Kill switches | Suspend by role blocks teacher and student; reactivate restores; `delete from auth.sessions;` signs everyone out; student data untouched | Result of ST-54 | `08` F |

### E. Teacher and student workflows

| ☐ | ID | Verify | Expected | Evidence | Maps to |
|---|---|---|---|---|---|
| ☐ | VER-32 | Classroom lifecycle | Create (code generated, read-only), rename, add co-teacher, archive/unarchive; co-teacher cannot archive | Screenshots | S3, S11 |
| ☐ | VER-33 | Single student | Created, enrolled, one-time credential shown | Screenshot | S4 |
| ☐ | VER-34 | CSV import | Preview shows rows and errors; UTF-8 file with Korean names shows correctly; an EUC-KR file visibly garbles (so teachers can see it); duplicates refused; credential CSV downloads; all rows on the roster | Screenshots | S5 |
| ☐ | VER-35 | Batch cap | The chosen cap imports successfully; **cap + 1 is refused at preview and nothing is created** | Screenshots | S5b, R2 |
| ☐ | VER-36 | Batch timing | Seconds per row measured at 10, 30 and 50 rows (3 runs each) | Table | `01` |
| ☐ | VER-37 | Roster operations | Add, remove, reactivate, transfer; co-teacher of only one side cannot transfer; archived classrooms refuse changes | Screenshots | S12 |
| ☐ | VER-38 | Student home | Shows only active, non-archived classes and the student's grade | Screenshot | S7 |

### F. Data and operations

| ☐ | ID | Verify | Expected | Evidence | Maps to |
|---|---|---|---|---|---|
| ☐ | VER-39 | Audit trail | Each workflow produced its event; `select count(*) from public.audit_logs where metadata::text ~* 'password';` → 0 | Output | S15 |
| ☐ | VER-40 | Monitoring queries | The queries of `04` phase 7 run without error on the hosted database | Output | `04` |
| ☐ | VER-41 | Staff bootstrap rehearsal | Dashboard "Add user" works while signup is OFF; profile insert; verification query; suspend and reactivate | Ops log | `02`, R7 |
| ☐ | VER-42 | Unlock SQL | Unlocking one student, a classroom, and everyone each behave as documented | Output | `10` §3.7, R13 |
| ☐ | VER-43 | Erasure procedure | Deleting a student's auth user removes their profile, student record, account and enrollments; the verification counts are 0; audit rows remain (ids and usernames, no names) | Output | R10 |
| ☐ | VER-44 | Backup restore drill | Restore into a scratch project; row counts match; duration recorded | Drill record | R8 |

## 2. Exact staging test sequence

Run top to bottom on **staging**. Do not skip a step. Two people (Operator, Teacher) and two browser profiles. Write the result next to each step; a failure stops the sequence until it is fixed and the whole phase is rerun. Times are active effort.

| Phase | Steps | Who | Time |
|---|---|---|---|
| 0 Prerequisites | ST-01 to ST-04 | Eng, Ops | 1 h |
| 1 Project and settings | ST-11 to ST-16 | Ops | 2–3 h |
| 2 Database | ST-17 to ST-20 | Ops | 1 h |
| 3 Deployment and staff | ST-21 to ST-24 | Ops, Eng | 2 h |
| 4 Authentication behaviour | ST-25 to ST-30 | Ops + Teacher | 1.5 h |
| 5 Rate limit and A1 | ST-31 to ST-35 | Ops | 1.5 h |
| 6 Workflows and batch | ST-41 to ST-46 | Teacher + Ops | 3 h |
| 7 Session, kill switch, data | ST-51 to ST-56 | Ops | 3 h |
| 8 Close | ST-61 to ST-63 | Ops, PM | 1 h |

### Phase 0: prerequisites

| ☐ | Step | Action | Expected |
|---|---|---|---|
| ☐ | ST-01 | Confirm decisions D1–D6 are recorded (`04`) and the host's request-time limit is written down | Written values |
| ☐ | ST-02 | Check out the **tagged** release commit. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `supabase start`, `supabase db reset` (local only), `supabase test db`, `pnpm test:access` | All pass: pgTAP 8 files, vitest 116/116, build lists `ƒ Middleware` |
| ☐ | ST-03 | Create the ops log and the evidence folder; open the empty copy of §1 | Files exist |
| ☐ | ST-04 | Save Appendix A as `signin-load.mjs` on the operator's machine (Node 18+) | `node signin-load.mjs` prints its usage |

### Phase 1: project and settings

| ☐ | Step | Action | Expected |
|---|---|---|---|
| ☐ | ST-11 | Create `eduquest-staging` in the production region; record the Postgres version | VER-01 |
| ☐ | ST-12 | Apply every row of the settings sheet (§3) | Dashboard equals the sheet |
| ☐ | ST-13 | Run the three outside checks (VER-02, VER-03, VER-04) with `URL` and `ANON` set | Documented responses; no user created |
| ☐ | ST-14 | Enable backups; add operator accounts with MFA | VER-10 |
| ☐ | ST-15 | Set the rate limits you can set (§3); note which fields the plan locks | Values recorded |
| ☐ | ST-16 | Optional: `supabase config diff` with the target `[auth]` block | VER-11 |

### Phase 2: database

| ☐ | Step | Action | Expected |
|---|---|---|---|
| ☐ | ST-17 | `supabase link --project-ref <ref>`; `supabase migration list --linked` | 16 local, none remote |
| ☐ | ST-18 | `supabase db push --dry-run` | Exactly the 16 migrations (never `--include-seed`) |
| ☐ | ST-19 | `supabase db push` | Applied; list shows 16/16 (VER-12) |
| ☐ | ST-20 | Run the VER-13 to VER-17 queries and the Security Advisor | All as expected |

### Phase 3: deployment and staff

| ☐ | Step | Action | Expected |
|---|---|---|---|
| ☐ | ST-21 | Set the three variables (public ones in the **build** environment); deploy the tagged commit | Build log lists `ƒ Middleware` (VER-18, VER-19) |
| ☐ | ST-22 | Search the client JS for the service key's first 12 characters; configure HTTPS and security headers | Zero matches; headers visible (VER-20, VER-21) |
| ☐ | ST-23 | Bootstrap one admin and one teacher with the two-person rule (`02`); run B4 | Both sign in; `"expires_in":3600` (VER-22, VER-05, VER-41) |
| ☐ | ST-24 | As the teacher: create a classroom and **one** student | The `.invalid` auth email is accepted; credential shown once (VER-24, VER-33). **If this fails, stop: it is a design issue** |

### Phase 4: authentication behaviour

| ☐ | Step | Action | Expected |
|---|---|---|---|
| ☐ | ST-25 | Guards: signed-out visits; teacher on `/student`; student on `/teacher` | Redirects (VER-23) |
| ☐ | ST-26 | Student first login with the temporary password; open `/student` directly; try a 5-character password, then a valid one | Forced reset; message for the short password; lands on `/student` (VER-25) |
| ☐ | ST-27 | Lockout: 5 wrong passwords for one student (serial); then a second student with a 20-way parallel burst using the generator | Locks at 5; burst: locked, at most 5 checks (VER-26, VER-27) |
| ☐ | ST-28 | Teacher reissues that student's password | Old password dead, forced change, audit row (VER-29) |
| ☐ | ST-29 | Teacher suspends then reactivates a test teacher | Refused then allowed (VER-41) |
| ☐ | ST-30 | Sign-out for teacher and student | Back to the right sign-in |

### Phase 5: rate limit and the A1 proof

Prepare `accounts.txt` first. Import two CSVs of 30 test students (ST-41 prerequisites), then convert the downloaded credential CSVs (columns: 이름, 학번, 학년, 아이디, 임시 비밀번호) to `username password` lines: `awk -F, 'NR>1{gsub(/\r/,""); print $4" "$5}' credentials.csv >> accounts.txt`. The generator signs the students in through the **deployed** sign-in form, so the calls reach Supabase from the app server's IP.

| ☐ | Step | Action | Expected |
|---|---|---|---|
| ☐ | ST-31 | Baseline: `node signin-load.mjs https://<staging> accounts.txt 30` with 30 accounts | 30 success; record p50/p95 latency |
| ☐ | ST-32 | Class login: 60 accounts, concurrency 30, spread over 60 s: `node signin-load.mjs https://<staging> accounts.txt 30 60` | Record the counts. Ideal: 60 success, 0 rate limited |
| ☐ | ST-33 | Find the threshold: repeat the 60-line file until the output shows `RATE LIMITED` (for example `for i in 1 2 3 4 5; do cat accounts.txt; done > big.txt`, run with a 300-second window) | Record the number of successes **before the first** rate-limited reply, and which limit it was in the Auth logs |
| ☐ | ST-34 | **A1 proof:** immediately after ST-33, in the SQL editor: `select count(*) from public.student_accounts where locked_until > now() or failed_attempts > 0;` | **0.** Students who saw "로그인 요청이 많습니다" are not locked (VER-28). Check the server log for the uncounted-error lines (status 429, no usernames) |
| ☐ | ST-35 | Wait out the window (5 minutes); re-run the accounts that were rate limited. Then set `sign_in_sign_ups` and `token_refresh` from the measured threshold (target 300 if the plan allows) and repeat ST-32 | All succeed; the final limit values go into the sign-off |

### Phase 6: workflows and batch

| ☐ | Step | Action | Expected |
|---|---|---|---|
| ☐ | ST-41 | Prepare two UTF-8 CSV files of the **pilot cap** (30 until measured) with Korean names; import the first | Preview correct; N accounts created; credential CSV downloaded at once; roster shows all (VER-34) |
| ☐ | ST-42 | Prepare the same data saved as EUC-KR ("CSV" in Korean Excel) and open the preview only | Names visibly garbled in the preview; do **not** commit |
| ☐ | ST-43 | Import a file containing a duplicate student number and a blank name | Both rows shown as errors; valid rows can be committed |
| ☐ | ST-44 | Cap boundary: import cap + 1 rows | **Refused at preview, nothing created** (VER-35). Until the cap is implemented, record "blocked", never "passed" |
| ☐ | ST-45 | Batch timing: 10, 30 and 50 rows, three runs each (use throwaway classrooms); time from pressing "N명 계정 생성" to the result | Median seconds per row (VER-36); compare with the host limit (§4) |
| ☐ | ST-46 | Roster: add, remove, reactivate, transfer; co-teacher of one side only attempts a transfer; archive and unarchive as owner; co-teacher tries to archive | As designed (VER-32, VER-37). Student home shows only active classes (VER-38) |

### Phase 7: session, kill switch and data

| ☐ | Step | Action | Expected |
|---|---|---|---|
| ☐ | ST-51 | Set the staging JWT expiry to **300 s** (never lower) | Dashboard value |
| ☐ | ST-52 | Keep a teacher active 20+ minutes with normal page loads and one idle gap longer than 300 s; also a student | Never bounced to sign-in (VER-30, VER-06) |
| ☐ | ST-53 | **Restore JWT expiry to 3600** and re-run VER-05 | `"expires_in":3600` |
| ☐ | ST-54 | Kill-switch drill (`08` F): suspend teachers and students by role; confirm both are refused; reactivate; confirm restored; `delete from auth.sessions;` and confirm everyone is signed out; confirm student data is untouched | VER-31 |
| ☐ | ST-55 | Unlock SQL (`10` §3.7): lock three students, then unlock one by username, a classroom, and everyone | VER-42 |
| ☐ | ST-56 | Erasure rehearsal: create a student, enroll them, delete the auth user in the Dashboard, run the count queries | Profile, student, account and enrollment rows gone; audit rows remain (VER-43) |

### Phase 8: close

| ☐ | Step | Action | Expected |
|---|---|---|---|
| ☐ | ST-61 | Backup restore drill into a scratch project; record the duration and the row-count comparison | VER-44 |
| ☐ | ST-62 | Run the monitoring queries (`04` phase 7) and the audit queries | VER-39, VER-40 |
| ☐ | ST-63 | Fill the sign-off: results, measured rate limit, chosen batch cap, every deviation | Signed by Ops and Eng; handed to the PM (§5, gate G3) |

## 3. Required Supabase settings (the settings sheet)

Apply to staging, then production. Values are final; Dashboard labels are in `06` §4.2–4.4. The "verify" column is a check that does not need the Dashboard.

| Setting | Required value | Verify |
|---|---|---|
| Allow new users to sign up | **OFF** | VER-02, VER-03 |
| Allow anonymous sign-ins | **OFF** | VER-04 |
| Email provider | **Enabled**; every other provider, magic link/OTP, phone, SAML, Web3, passkeys **disabled** | VER-02 (`external`) |
| Confirm email | **OFF** (autoconfirm) | VER-02 (`mailer_autoconfirm:true`) |
| Secure password change | **OFF** | Dashboard |
| Minimum password length | **8** | Dashboard; ST-26 |
| Password requirements | **none** | Dashboard |
| Leaked-password protection | **OFF** for the pilot | Dashboard; VER-17 |
| CAPTCHA, hooks, manual linking | **disabled / none** | Dashboard |
| Site URL | `https://<this-environment-domain>` | Dashboard |
| Redirect URLs | **empty** | Dashboard |
| JWT expiry | **3600** (always > 90 s, never < 300 s) | VER-05 |
| Refresh token rotation | **ON** | ST-52 |
| Refresh token reuse interval | **10 s** (never 0) | ST-52 |
| Time-box / inactivity timeout / single session | **unset** | Dashboard |
| Rate limit: sign-ups and sign-ins (per 5 min per IP) | **300** if editable, set from ST-35 | ST-33 |
| Rate limit: token refresh (per 5 min per IP) | **300** if editable | ST-33 |
| Backups | Daily (PITR if offered) | VER-10 |
| Operator accounts | MFA on, least privilege | Dashboard |
| Seed data | **never**; `--include-seed` forbidden | VER-13 |

Environment variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at **build and runtime**; `SUPABASE_SERVICE_ROLE_KEY` at **runtime only**, secret.

Target `[auth]` declaration for `supabase config diff` (kept outside the committed `config.toml`):

```toml
[auth]
site_url = "https://<this-environment-domain>"
additional_redirect_urls = []
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
enable_signup = false
enable_anonymous_sign_ins = false
enable_manual_linking = false
minimum_password_length = 8
password_requirements = ""

[auth.rate_limit]
sign_in_sign_ups = 300   # set from ST-35
token_refresh = 300

[auth.email]
enable_confirmations = false
secure_password_change = false
```

Never change during the pilot: JWT expiry, refresh-token rotation and reuse interval, signup and anonymous settings, password minimum and requirements, rate limits (except by the process in §5), keys, Postgres version, Node version.

## 4. Batch cap implementation options

Status: **designed, not implemented**; the code still allows 200 rows and the import page says "최대 200명". No test pins the cap (V-3). This section compares the ways to close required item R2. Nothing is implemented here.

### Where the cap lives today

| Place | Fact |
|---|---|
| `src/features/accounts/batch/batch-schemas.ts` | `MAX_BATCH_ROWS = 200` (and the zod `.max()` of the run schema); `MAX_CSV_BYTES = 256 * 1024` |
| `src/features/accounts/batch/csv-parse.ts` | Throws `TOO_MANY_ROWS` with the number from the constant, before any database write, for preview and commit (both re-parse server-side) |
| `src/components/teacher/batch-upload-form.tsx` | Help text hard-codes "200명"; the 256 KB check is a duplicated literal |
| `src/features/accounts/batch/batch-service.ts` | Sequential loop; each row provisions an account and then enrolls (about 11 round trips) |
| Measured (local) | 294–330 ms per row sequential → 30 rows ≈ 9–10 s, 200 rows ≈ 59 s; 4-way concurrency 67 ms per row |

### How big can the cap be? (host limit × measured time per row)

`cap = floor(0.5 × host request limit ÷ seconds per row)`, rounded down to a multiple of 5, never above 50. The seconds per row come from ST-45.

| Host limit | 0.5 s/row | 0.8 s/row | 1.4 s/row |
|---|---|---|---|
| 10 s | 10 | 5 | 3 |
| 15 s | 15 | 5 | 5 |
| 30 s | 30 | 15 | 10 |
| 60 s | 50 | 35 | 20 |
| 300 s | 50 | 50 | 50 |

A cap of 30 is only safe when the host allows about 60 s or more, or the per-row time is under 0.5 s. A class has 25–35 students; a cap of 30 means 31–35 need two files. A host limit of 10–15 s is a hosting decision (D1), not something a cap can fix.

### Options

| Option | What changes | Enforcement | Effort | Risk | Notes |
|---|---|---|---|---|---|
| **A. One constant** | `MAX_BATCH_ROWS = 30`; help text and the 256 KB literal still hard-coded | Server-side, both preview and commit | 1–2 h with tests | Very low | Help text can drift from the constant |
| **B. Constant + single source of truth (recommended)** | As A, and the server page passes the cap (and `MAX_CSV_BYTES`) to the upload form as a prop; clearer error: found N rows, the maximum is 30, split the file | Server-side; UI text cannot drift | 0.5 day with tests and review | Very low | Matches `01` items 1–3 |
| C. B + environment-configurable cap | Cap read from a new variable (default 30, clamped to a hard ceiling such as 50) | Server-side | 0.5–1 day | Low–medium | Lets staging measurements change the number without a code release, but adds a setting that can drift between environments |
| D. B + cheaper rows and bounded concurrency | Validate the classroom once per batch; process 4 rows at a time | Server-side | 1–2 days | Medium | 4.4× faster locally, so 50–100 rows become feasible; more concurrency to test (ordering, per-row isolation, audit, Auth admin-API limits) |
| E. Time-budgeted commit | Process rows until a time budget; return what is left to re-upload | Server-side | 2+ days | Medium–high | Adaptive but needs continuation semantics and new UI states; M2 |
| F. Process only | No code; constraint + signed acceptance + monitoring of batch sizes | **None** | 30 min | Medium (a 200-row upload can time out and lose the one-time passwords) | Acceptable only with explicit PM sign-off |

### Recommendation

1. **Option B for the pilot**, starting at 30, and no further.
2. Tests to add with it (none exist today):
   - exactly `cap` rows imports; `cap + 1` is refused at preview and creates no `account_batches` row;
   - a commit with more than `cap` rows is refused even with a valid token (the token is bound to the row set);
   - the error message carries the number found and the maximum; the help text shows the same constant;
   - existing suites stay green (`pnpm test:access`, `supabase test db`).
3. After ST-45, if the measured time allows a different value, change the one constant, retag and rerun ST-41, ST-44 and ST-45. If the host limit is only 10–15 s, either change the hosting plan or take Option D in the pilot scope; do not raise the cap.
4. If B cannot be delivered before the pilot, Option F is the only fallback, with the written acceptance and the constraint "≤ 30 rows per file" in the teacher guide.
5. Options C, D and E are M2 candidates.

## 5. Go-live decision workflow

### Roles

| Role | Responsibility |
|---|---|
| **PM** (decision owner) | Takes the GO / CONDITIONAL GO / NO-GO decision at G3 and G5; accepts residual risk in writing |
| **Reviewer** | Reviews the pull request (G0) and confirms evidence is complete |
| **Ops** | Executes §2, owns configuration evidence and the ops log |
| **Eng** | Fixes defects, implements the cap, owns the release tag |
| **School** | Owns consent, retention and erasure (D6) and the pilot scope |
| **On-call** | Supports the pilot from day 1 |

### Gates

| Gate | Moment | Inputs (evidence) | Pass criteria | Decided by | If it fails |
|---|---|---|---|---|---|
| **G0 Release candidate** | Before staging | PR reviewed and merged; lockfile committed; advisory note; tag; batch cap (Option B) merged; ST-02 output | R2 closed (or signed Option F), R9 closed, all code gates green on the tag | Reviewer + PM | Fix, retag, repeat |
| **G1 Staging configured** | After ST-16/ST-20 | VER-01 to VER-17 | Every Required value present; Advisor findings only the expected ones | Ops, checked by Eng | Fix settings; rerun phase 1–2 |
| **G2 Staging behaviour** | After ST-56 | VER-18 to VER-43, S9 numbers, soak, drills | All VER items ticked, except a documented "blocked" S5b only if Option F was chosen | Ops + Eng | Fix, redeploy, rerun phases 3–8 |
| **G3 Go / no-go decision** | After ST-63 | Filled sign-off; this §5 decision record; `09` closure checklist; risk register (`10` §4) | Decision rules below | **PM** | Per rule |
| **G4 Production ready** | After production setup | `06` Parts A–G on production; staff bootstrapped; R3–R8, R12 evidence; on-call, guide, constraints (R11); D6 signed (R10) | R1–R13 closed | PM + Ops | Hold go-live |
| **G5 Go-live confirmation** | T-1 day | Production smoke (S1, S4, S6, S7, S8, S10 with test accounts, then removed); backup confirmed; change freeze started | Test data removed, monitoring running | PM | Postpone |

### Decision rules at G3

| Condition | Decision |
|---|---|
| Any VER-23 to VER-31 failure (guards, forced reset, lockout, A1, reissue, session, kill switches) | **NO-GO** until fixed and the affected phase rerun |
| ST-24 fails (the `.invalid` auth email is rejected) | **NO-GO**: this is a design change, escalate immediately |
| ST-52 fails (sessions end unexpectedly) | **NO-GO**; check JWT, reuse interval and the middleware first (`06` §4.3) |
| D6 (consent, retention, erasure) unsigned | **NO-GO** for real students (staging may continue) |
| Rate limit cannot be raised and ST-32 shows rate limiting below one class | **CONDITIONAL GO** with the staggering constraint (about 25 log-ins per minute) and the unlock SQL rehearsed (VER-42); otherwise change the plan |
| Batch cap not implemented | **CONDITIONAL GO** only with the signed Option F acceptance; otherwise NO-GO |
| Lockfile or `postcss` decision missing | **CONDITIONAL GO** with the written acceptance; ship nothing from an untagged commit |
| Restore drill or alerting missing | **CONDITIONAL GO** for the first week with the on-call backup procedure; close within one week |
| Everything else ticked | **GO** |

Any decision other than GO lists each open item with an owner, a date and the evidence that will close it.

### Decision record (copy for each gate)

```
Gate: G_   Date:        Decided by:
Release tag / commit:
Environment:            Evidence folder:
Open items (id, owner, due, closing evidence):
Accepted risks (id, who accepted, expires):
Constraints in force (section 2 of 07):
Decision: GO | CONDITIONAL GO | NO-GO
Next gate and date:
```

### Timeline

| When | Action |
|---|---|
| T-10 to T-7 | D1–D6 decided; start D6; implement the cap; open the PR |
| T-7 to T-5 | Review, merge, tag (G0); create staging |
| T-5 to T-3 | Phases 1–8 of §2 on staging (G1, G2) |
| T-3 | **G3 decision** by the PM |
| T-3 to T-1 | Production setup (G4), teacher guide, on-call roster |
| T-1 | G5 confirmation; change freeze begins |
| T0 | Supervised first lesson; Ops and Eng present |
| T+1 | Review monitoring queries and logs; decide whether to continue |
| T+5 and T+14 | Pilot reviews: incidents, support requests, locked accounts, batch sizes, rate-limit log lines |

### Stop and rollback triggers (during the pilot)

Pause the pilot and decide at once if: students can see another student's data, a lockout bypass is found, credentials are lost with no recovery path, many users are signed out unexpectedly, or an Auth/database incident lasts longer than one lesson. The stop switches are in `08` F (suspend by role, `delete from auth.sessions;`, maintenance page); the unlock procedures are in `10` §3.7. Resume only by a written PM decision.

## Appendix A. Student sign-in load generator

Validated locally against the production build: 30 simultaneous correct sign-ins → 30 success; two students × 6 serial wrong passwords → 8 wrong password and 4 locked (4 + the 5th and 6th). It posts to the deployed sign-in form, so the Auth calls come from the app server. Do not run it against production with real student accounts.

```js
// Student sign-in load generator (plain HTTP, Node 18+, no dependencies).
// Replays the sign-in form of the DEPLOYED app, so the Auth calls come from the app server's IP,
// which is exactly the IP the hosted rate limit sees.
//
//   node signin-load.mjs <base-url> <accounts.txt> [concurrency=30] [window-seconds=0]
//
// accounts.txt: one "username password" per line.
// Output: counts by outcome (success redirect, wrong password, rate limited, temporary error,
//         locked, other) and latency percentiles.
import { readFileSync } from "node:fs";

const [base, file, conc = "30", windowSec = "0"] = process.argv.slice(2);
if (!base || !file) {
  console.error("usage: node signin-load.mjs <base-url> <accounts.txt> [concurrency] [window-seconds]");
  process.exit(2);
}
const accounts = readFileSync(file, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim().split(/\s+/))
  .filter((p) => p.length >= 2);

// The server-action fields are rendered into the form as hidden inputs.
const page = await (await fetch(`${base}/student/sign-in`)).text();
const hidden = [...page.matchAll(/<input[^>]*type="hidden"[^>]*>/g)].map((m) => {
  const name = /name="([^"]*)"/.exec(m[0])?.[1];
  const value = (/value="([^"]*)"/.exec(m[0])?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  return [name, value];
});
if (!hidden.some(([n]) => n?.startsWith("$ACTION"))) throw new Error("sign-in form fields not found");

const classify = (status, location, body) => {
  if (status >= 300 && status < 400) return location?.includes("sign-in") ? "other" : "success (redirect)";
  if (body.includes("5회 실패하여 15분간 잠겼습니다") || body.includes("너무 많습니다")) return "locked / too many attempts";
  if (body.includes("로그인 요청이 많습니다")) return "RATE LIMITED (429 message)";
  if (body.includes("일시적인 오류")) return "temporary error (5xx/network)";
  if (body.includes("아이디 또는 비밀번호가 올바르지 않습니다")) return "wrong password";
  return `other (HTTP ${status})`;
};

const counts = new Map();
const lat = [];
const t0 = Date.now();
let next = 0;
const delayPer = Number(windowSec) > 0 ? (Number(windowSec) * 1000) / accounts.length : 0;

async function worker() {
  while (true) {
    const i = next++;
    if (i >= accounts.length) return;
    if (delayPer) await new Promise((r) => setTimeout(r, Math.max(0, t0 + i * delayPer - Date.now())));
    const [username, password] = accounts[i];
    const form = new FormData();
    for (const [n, v] of hidden) form.append(n, v);
    form.append("username", username);
    form.append("password", password);
    const t = Date.now();
    const res = await fetch(`${base}/student/sign-in`, { method: "POST", body: form, redirect: "manual" });
    const body = res.status >= 300 && res.status < 400 ? "" : await res.text();
    lat.push(Date.now() - t);
    const k = classify(res.status, res.headers.get("location"), body);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
}
await Promise.all(Array.from({ length: Number(conc) }, worker));

lat.sort((a, b) => a - b);
const p = (q) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))];
console.log(`sent ${accounts.length} sign-ins in ${Math.round((Date.now() - t0) / 1000)} s (concurrency ${conc})`);
for (const [k, v] of [...counts].sort()) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`latency ms: p50 ${p(0.5)}  p95 ${p(0.95)}  max ${lat[lat.length - 1]}`);
```

Typical use: `node signin-load.mjs https://<staging-domain> accounts.txt 30 60` sends the accounts in `accounts.txt` with 30 in flight, spread over 60 seconds. Outcomes: `success (redirect)`, `wrong password`, `RATE LIMITED (429 message)`, `temporary error (5xx/network)`, `locked / too many attempts`.

## Appendix B. Evidence capture

For every step keep: the date and tester, the exact command or screenshot, the output, and the verdict. Store them in one folder named after the release tag. The sign-off table in `04`, the closure checklist `09` and the decision record in §5 refer to these files by step id (ST-nn / VER-nn).
