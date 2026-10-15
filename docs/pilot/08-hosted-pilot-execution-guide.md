# 8. Hosted pilot execution guide and readiness checklist

The operator's run sheet for the hosted pilot, plus the final readiness classification. Documentation and validation only: no code, architecture or feature was changed. Detail lives in `01`–`07`; this document is what you follow on the day and what you sign.

Validated on commit `1370e16` (the pushed head), local stack, Node 24.19.0, pnpm 12.11.2. Nothing here has been run against a hosted project yet; steps that can only be proven there are marked **[staging]**.

## 0. Verification performed for this guide

| Gate / check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `pnpm lint` | 0 errors, 2 warnings (unused `_role`) |
| Clean `supabase db reset` + `supabase test db` | 15 migrations; pgTAP PASS, 7 files |
| `vitest run` | 78/78, 6 files |
| Production `pnpm build` | success; lists `ƒ Middleware` |
| Postgres compatibility | 15.19 and 17.11 both pass the full suite (earlier run) |
| Public functions pin `search_path` | 7 of 7 |
| Views referencing the `auth` schema | none |
| Extensions in `public` | none (`pgcrypto` is in `extensions`) |
| RLS enabled, no policy | exactly `account_batches` and `audit_logs` (service-role only, by design) |

### Pilot assumptions, tested

| Assumption | Evidence | Enforced by |
|---|---|---|
| **One school** | Cross-school isolation covered by pgTAP/vitest (classroom visibility, transfer, co-teacher checks). The school boundary is a shared `school_id` UUID on every profile | **Process only.** There is no schools table; verify with `select count(distinct school_id) from public.profiles;` = 1 (runbook `02` §D) |
| **3–4 teachers** | Walkthroughs with owner, co-teacher, admin and outsider roles; scale run with 4 teachers each owning a classroom | Permissions in code, tested |
| **≤ 100 students** | Seeded 4 teachers / 4 classrooms / 100 students (33 s). On the production build, pages answered in about 0.2 s (p50 180–220 ms; max 383 ms): classroom list, classroom detail with 25 students, roster page whose add panel lists the other 99, settings, import page, student home. The add panel is capped at 500 students in code | Code cap of 500 for the add panel; otherwise by scope |
| **30 simultaneous class log-ins** | 30 students signed in at once through the lockout reservation + Auth password grant: 0 failures, wall 950 ms, p95 945 ms. This excludes hosted rate limiting, which is not enforced locally | **[staging]** S9 |
| **≤ 30 students per CSV import** | Timing: 294–330 ms per row locally (30 rows ≈ 9–10 s). Hosted time per row is unmeasured | **NOT enforced.** `MAX_BATCH_ROWS` is still **200** and the import page still says "최대 200명". Process constraint only until the cap is implemented (Required item R2) |

## 1. Hosted requirements reviewed

| Requirement | Required hosted value | Local proof | Hosted check |
|---|---|---|---|
| Signup disabled | "Allow new users to sign up" **OFF** | `POST /auth/v1/signup` → `422 signup_disabled`; public settings `disable_signup:true` | `06` Part B1–B2 |
| Email provider only | Email enabled; phone, OAuth, SAML, Web3, passkeys, anonymous **off** | Settings endpoint lists only `email`; anonymous attempt → `422 anonymous_provider_disabled` | `06` Part B1, B3 |
| JWT lifetime | **3600 s** (always > 90 s; never below 300 s) | `expires_in: 3600`; 60 s fails, 150 s passes; the 90 s margin is `3 × 30 s` in the Auth client source | Part B4 + S13 soak |
| Refresh-token settings | Rotation **ON**, reuse interval **10 s** (never 0) | Interval 0 revoked sessions under parallel requests; 10 s passed a 5-way burst and a full idle expiry | S13 soak |
| Password minimum | **8**, no composition requirements, leaked-password protection **OFF** for the pilot | The app enforces 8; a stricter project minimum surfaces only the generic error | S6 |
| Confirm email / secure password change | **OFF / OFF** | Matches the tested local configuration | S1, S4, S6 |

### Security Advisor: expected findings

I cannot run the hosted advisor, so these are the findings the local catalog predicts. Anything outside this list must be resolved or accepted in writing.

| Expected | Why | Action |
|---|---|---|
| No `rls_disabled_in_public`, no definer-view, no mutable-`search_path`, no extension-in-public, no exposed `auth.users` findings | All verified by the catalog queries above | none |
| INFO "RLS enabled, no policy" on `account_batches` and `audit_logs` | Service-role-only tables by design | Accept |
| Auth warning "leaked password protection disabled" | Deliberate pilot decision (`06` §2) | Accept; revisit after the weak-password message is mapped |
| Possible MFA-options note | The app has no MFA UI | Accept |
| Default `anon` table grants / `anon`-callable helper functions (`fn_generate_classroom_code`, `fn_classrooms_code_immutable`) | Blocked by RLS / harmless | Accept; optional hardening later |

## 2. Final hosted deployment procedure

Do it on **staging first**, then production. Do not skip a step; record the result of every check.

### A. Environment variables

Source: Dashboard → Project Settings → API. Names: `src/lib/env.ts`.

| Variable | Value | Build | Runtime | Secret |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | **yes** | yes | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / `sb_publishable_…` key of this project | **yes** | yes | no |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / `sb_secret_…` key of this project | no | **yes** | **YES** |

- Set the two public variables in the **build** environment. A build without them still succeeds and the middleware then falls back to a runtime lookup (verified); do not rely on that.
- Staging and production use different projects and different values. Never reuse the local stack's keys.
- The service key never appears in a `NEXT_PUBLIC_` variable, a log, a ticket or the client bundle. After deploy, search the client JS for its first 12 characters: expect zero matches.
- Changing the URL or the public key requires a rebuild.

### B. Supabase project configuration

1. Create `eduquest-staging` / `eduquest-prod` in the production region. Record the Postgres version (15 and 17 are verified; test any other first). Strong database password in the secrets manager. Operator accounts with MFA.
2. Apply, in Authentication: signups **off**; anonymous **off**; email provider **on** and every other provider **off**; Confirm email **off**; Secure password change **off**; minimum password length **8**; password requirements **none**; leaked-password protection **off**; CAPTCHA **off**; hooks **none**; manual linking **off**.
3. Site URL = this environment's HTTPS origin; Redirect URLs **empty**.
4. Sessions: JWT expiry **3600**; refresh-token rotation **on**; reuse interval **10**; time-box/inactivity/single-session **unset**.
5. Rate limits: raise `sign_in_sign_ups` and `token_refresh` to **300** if the plan allows; otherwise leave the defaults (30 / 150) and keep the log-in staggering constraint. Final values are set from the S9 measurement.
6. Enable daily backups (and point-in-time recovery if offered).
7. Verify from outside (no Dashboard), with `URL` and `ANON` set:
   - `curl -s "$URL/auth/v1/settings" -H "apikey: $ANON"` → `"disable_signup":true`, `"mailer_autoconfirm":true`, `external` has only `"email":true`.
   - `curl -s -X POST "$URL/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"email":"probe@students.eduquest.invalid","password":"Probe#pass12345"}'` → `422`, `signup_disabled`; confirm in Dashboard → Users that **no** user was created.
   - `curl -s -X POST "$URL/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{}'` → `422`, `anonymous_provider_disabled`.

### C. Migration deployment order

The 15 files apply strictly in this order; `supabase db push` handles it. Never run `db reset`, never run `seed.sql`, never pass `--include-seed` (the flag exists in CLI 2.120 and `seed.sql` creates a known-password teacher).

| # | File | Adds |
|---|---|---|
| 1 | `20261014000001_extensions.sql` | `extensions` schema, `pgcrypto` |
| 2 | `20261014000002_core_enums.sql` | `user_role`, `profile_status`, audit enums |
| 3 | `20261014000003_profiles.sql` | `profiles`, `set_updated_at` |
| 4 | `20261014000004_students.sql` | `students`, `student_accounts` |
| 5 | `20261014000005_audit_logs.sql` | `audit_logs` |
| 6 | `20261014000006_rls_profiles_students.sql` | RLS and self-read policies |
| 7 | `20261014000007_audit_contract_alignment.sql` | classroom / enrollment audit values |
| 8 | `20261015000001_account_batches.sql` | `account_batches` |
| 9 | `20261015000002_classrooms.sql` | `classrooms`, `classroom_teachers` |
| 10 | `20261015000003_classroom_enrollments.sql` | `classroom_enrollments`, student policies |
| 11 | `20261015000004_safe_views.sql` | `v_students_safe`, `v_classroom_activity_safe` |
| 12 | `20261015000005_fn_transfer_enrollment.sql` | atomic transfer RPC |
| 13 | `20261015000006_classroom_code.sql` | read-only classroom code |
| 14 | `20261016000001_student_login_attempts.sql` | atomic lockout RPCs |
| 15 | `20261016000002_password_reissue.sql` | reissue audit action, session-revoke RPC |

```bash
supabase login
supabase link --project-ref <project-ref>        # prompts for the database password
supabase migration list --linked                 # 15 local, none remote
supabase db push --dry-run                       # exactly the 15 files above
supabase db push                                 # confirm; stops at the first failing file
supabase migration list --linked                 # 15 / 15 matched
```

Then in the SQL editor: `select count(*) from supabase_migrations.schema_migrations;` → 15; `select tablename from pg_tables where schemaname='public' and not rowsecurity;` → no rows; `select count(*) from auth.users;` → 0. Run Dashboard → Advisors → Security and compare to section 1.

### D. Teacher bootstrap (full detail: `02`)

Two people, logged. Never run against production before staging.

1. `select gen_random_uuid();` once; store as `PILOT_SCHOOL_ID`.
2. Dashboard → Authentication → Users → Add user (real email, 16+ random characters; tick "Auto Confirm User"). **[staging]** confirm this works while signups are OFF.
3. ```sql
   insert into public.profiles (id, school_id, role, display_name, status)
   select u.id, '<PILOT_SCHOOL_ID>'::uuid, 'admin', '<name>', 'active'
   from auth.users u where u.email = '<email>';
   ```
   Use `'teacher'` for teachers. Expect `INSERT 0 1`; a duplicate fails loudly by design.
4. Verify: the staff listing query in `02` §D (all `active`, `confirmed`); `select count(distinct school_id) from public.profiles;` → 1.
5. Sign in at `/teacher/sign-in`; expect `/teacher`. Hand over the password in person or via a password-manager share. Staff cannot change their own password in the app (Dashboard reset only).

### E. Pilot smoke test execution (full table: `04` phase 3)

1. Use two browser profiles (teacher, student). Open a copy of the table in `07` §3 step 7; write result, time and evidence per step.
2. Order: S1–S4 (sign-in, guards, classroom, single student incl. the `.invalid` email), S5 with **30 rows** (record seconds per row; **S5b is blocked until the cap exists, record "blocked"**), S6–S8b (forced reset, lockout serial and burst), **S9** (30 sign-ins in a minute, then 60 in five minutes: record accepted count before the first `429`), S10–S12 (reissue, archive, roster), **S13** (soak: staging JWT temporarily 300 s, 20+ minutes active plus an idle gap > 300 s, no unexpected sign-out, **restore 3600**), S14–S15 (sign-out, audit).
3. Pass criteria: every step passes except the documented S5b block; no setting from the change-control list had to be touched.
4. On production repeat S1, S4, S6, S7, S8, S10 with test accounts only, then remove the test data with a reviewed SQL clean-up (two people, ops log).

### F. Rollback procedure

Principle: roll back the **smallest** thing that fixes the problem. There are no down-migrations.

| Situation | Action | Validated |
|---|---|---|
| Bad application release | Redeploy the previous tagged build. Migrations are additive, so an earlier build normally runs on the newer schema: prove it on staging before relying on it | **[staging]** |
| Wrong Auth setting (everyone signed out, sign-in failing, signup open) | Restore the value from `06` §4 in the Dashboard; re-run Part B7 checks. A JWT or reuse-interval slip signs users out but exposes no data | settings table |
| `db push` fails | It stops at the failing file; earlier files stay applied. Check `migration list --linked`; fix forward with a new migration, or restore from backup if data is affected. Never edit an applied migration | procedure |
| Data damage | Restore from backup / point-in-time recovery **into a scratch project first**, compare, then agree the production action with the school. Restores replace the database and cause downtime | **[staging]** drill required |
| One person must lose access now | `update public.profiles set status = 'suspended' where id = (select id from auth.users where email = '<email>');` then `select public.fn_revoke_user_sessions((select id from auth.users where email = '<email>'));` | yes: blocked immediately, can sign in again after reactivation |
| **Emergency stop (all users)** | 1) Host-level maintenance page or disable the route. 2) `update public.profiles set status = 'suspended' where role in ('teacher','student');` (admins stay active). 3) `delete from auth.sessions;` (refresh tokens are removed with it). Nothing is deleted from student data | yes: teacher and student pages redirect to sign-in; the data and accounts are untouched |
| Resume after an emergency stop | `update public.profiles set status = 'active' where role in ('teacher','student');`. Users sign in again | yes: access restored immediately |
| Leaked service-role key or database password | Treat as a security incident: rotate the key in the Dashboard, update the host variable, **rebuild and redeploy**, review the audit log and Auth logs | procedure |
| Communicating a rollback | The on-call person tells the pilot teachers what happened, whether credentials issued today are still valid (they are unless sessions were wiped or accounts suspended), and the expected restore time | process |

## 3. Hosted Pilot Readiness Checklist

### Required before pilot

| # | Item | Evidence to attach |
|---|---|---|
| R1 | Staging acceptance complete: `07` §3 Steps 2–9, including S4 (`.invalid` email), S9 (class log-in and the measured rate limit) and S13 (session soak) | Filled staging checklist |
| R2 | **Batch cap implemented** (30 for the pilot) and the number confirmed by staging measurement; S5b passes; the import page text matches. If the PM instead accepts process-only enforcement, that acceptance is signed and the daily monitoring includes batch sizes | Merged change + measurements, or the signed acceptance |
| R3 | Section 2 B applied and verified on production (every value, plus the three `curl` checks) | Command outputs |
| R4 | Security Advisor compared with section 1; anything unexpected resolved or accepted in writing | Advisor export |
| R5 | Environment variables correct: public ones at build time, service key server-only; client bundle search for the key is empty | Deploy log, search result |
| R6 | All 15 migrations deployed by `db push`; no seed; verification queries as listed | `migration list` output |
| R7 | Staff bootstrapped on production with the two-person rule; test accounts removed | Ops log |
| R8 | Backups on; a restore drill completed into a scratch project; alert recipient set | Drill record |
| R9 | Release hygiene: lockfile committed, `postcss` advisories (inside Next, build-time) resolved or accepted in writing, branch merged by reviewed PR, release tagged | PR, tag, decision note |
| R10 | Consent, retention and an approved erasure procedure for student data (no delete/export feature exists) | Signed decision D6 |
| R11 | On-call named; support contacts; teacher one-page guide; pilot constraints (`07` §2) accepted by the PM | Names, document, sign-off |
| R12 | HTTPS only; security headers configured at the host | `curl -sI` output |

### Recommended before pilot

| # | Item | Why |
|---|---|---|
| C1 | Set `Secure` on the session cookie in production (small code change) | The cookie currently has neither `Secure` nor `HttpOnly`; HTTPS + HSTS mitigates but does not remove the exposure |
| C2 | Map Auth's weak-password error to a clear Korean message, then enable leaked-password protection | Students otherwise see only the generic failure |
| C3 | Custom SMTP for staff password recovery (decision D2), or write down that recovery is Dashboard-only | The built-in mail service is not for production |
| C4 | A real (not accelerated) idle test: stay signed in past 1 hour of token lifetime on staging | S13 shortens the lifetime; this proves the default |
| C5 | CI running the code gates on every push; a scripted browser version of the smoke test | Today every gate is manual |
| C6 | Alert on Auth/API error rates; daily review of the monitoring queries during week 1 | Early warning |
| C7 | Link `docs/pilot` from the repository README; fix the 2 lint warnings; plan the `next lint` migration | Housekeeping |
| C8 | Tighten Node version (`engines` is `>=20`; everything was tested on 24.19) | Reproducibility |

### Can defer to M2

Staff password change in the app and MFA; bulk password reissue and credential re-download; student suspend/delete/export screens; asynchronous, resumable batch import with retry; atomic create-and-enroll; classroom ownership transfer; a `schools` table and a database-enforced school boundary; a direct RLS policy for admin; classroom subject and grade; a centralised layout-level route guard; blocking (non-best-effort) audit writes; per-class student visibility for teachers; revoking default `anon` table grants.

## 4. FINAL PILOT STATUS

# READY WITH CONDITIONS

**Justification**

- *What is established.* On the pushed head, typecheck, lint, the production build, a clean 15-migration apply, 7 pgTAP files and 78 vitest tests all pass, on Postgres 15 and 17. Both user workflows were walked end to end in a browser. The two product-level security defects (parallel lockout bypass, bypassable forced password reset), the derivable auth email and the missing session refresh were found, fixed and pinned by tests that fail when the fix is removed. The pilot size assumptions hold locally: 100 students across 4 teachers render in about 0.2 s per page, and 30 simultaneous log-ins completed with no failures. The rollback switches (session revoke, role suspension, session wipe) were exercised and work without touching student data.
- *Why not READY.* Everything hosted is still unproven: the `.invalid` auth email on the hosted project, the real rate limit under a class log-in, the actual Auth setting values, the Security Advisor output and a backup restore. The "30 students per CSV" assumption is **not enforced by the product** (200 in code) and rests on a process rule. Release hygiene (lockfile, merge, tag) and the non-engineering items (consent and erasure, on-call, restore drill) are open.
- *Why not NOT READY.* None of these needs new features or an architecture change. One small code change (the batch cap, R2) and one dependency commit (R9) are the only engineering work; the rest is configuration, rehearsal and sign-off, and each has a written procedure and a recorded pass criterion.

**Condition for GO:** R1–R12 closed with the evidence listed, starting with the staging acceptance run.
