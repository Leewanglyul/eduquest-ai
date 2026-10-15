# 6. Hosted pilot configuration and deployment procedure

Scope: the exact hosted configuration, the exact Supabase settings and the step-by-step deployment procedure for the M1 pilot. Documentation only. It supersedes the corresponding rows of `03-hosted-supabase-checklist.md` where they differ (corrections are listed in section 2).

**How to read the evidence tags**

- **[V-local]**: observed on the local stack during this review (command and result given).
- **[CLI]**: taken from the Supabase CLI 2.120 `config.toml` template (the CLI's own documentation of each key and its default).
- **[V-staging]**: cannot be established locally; the procedure includes the exact check to run on the staging project.
- Dashboard labels and menu paths are given as they were known when this was written. Supabase renames menus; the `config.toml` key and the effective value are the stable references.

## 1. Verification summary of this review

| Check | Result |
|---|---|
| Migrations + all tests on **Postgres 15.19** (local pin) | 15 migrations; pgTAP PASS (7 files); vitest 78/78 |
| Migrations + all tests on **Postgres 17.11** | 15 migrations; pgTAP PASS (7 files); vitest 78/78 |
| Node used for every test and build | v24.19.0, pnpm 12.11.2 |
| Public Auth settings endpoint `GET /auth/v1/settings` | `disable_signup:true`, `mailer_autoconfirm:true` (local), only the `email` provider enabled |
| Signup attempt with email | `422 signup_disabled` |
| Anonymous sign-in attempt | `422 anonymous_provider_disabled` |
| Password sign-in response | `expires_in = 3600` |
| 170 rapid wrong-password sign-ins from one IP | all `400`, none `429`: **local rate limiting is not enforced**, so limits can only be measured on staging |
| `NEXT_PUBLIC_*` values | substituted at **build time** into the middleware bundle when present (the local URL appears in the compiled middleware). When they are **absent at build**, the compiled middleware keeps a runtime lookup instead (verified by building with the variables unset): whether sessions then refresh depends on the host exposing env to middleware, so always provide them at build time |
| Browser Supabase client (`src/lib/supabase/browser.ts`) | not imported anywhere; Supabase is called only from server code and the middleware |
| Service key in client bundle | absent (0 files in `.next/static`) |

## 2. Corrections to earlier pilot documents

These changes came out of this review; apply them when using `03` and `04`.

| Earlier statement | Correction | Why |
|---|---|---|
| `03` §5.1: minimum password length **≥ 10** | **8** | The app accepts 8-character passwords. If the project minimum is higher, the app form passes validation and the Auth server then rejects it; the app shows only the generic "비밀번호를 변경하지 못했습니다." |
| `03` §3.3: Confirm email "either" | **OFF** (autoconfirm) | Matches the tested local configuration (`mailer_autoconfirm: true`); every account is admin-created and explicitly confirmed; removes the "forgot to tick Auto Confirm User" operator error |
| `03` §5.3: enable leaked-password protection | **Leave OFF for the pilot** | A rejected common password surfaces to the student as the same generic message. Enable it after the app maps Auth's `weak_password` error to a clear Korean message (follow-up, section 8) |
| `03` §6.1: "documented hosted default 30" | Definition now taken from the CLI template (section 5) | The CLI documents `sign_in_sign_ups` as "sign up and sign-in requests per 5 minutes per IP (excludes anonymous users)", default 30; `token_refresh` as "sessions refreshed per 5 minutes per IP", default 150 |
| `03`: Postgres version not stated | Section 4.1 | Hosted projects may run a newer major than the local pin (15). Both 15 and 17 were tested |
| `03` §4.3: reuse-interval behaviour | Section 5.3 | The behaviour is not a simple "reused token fails after 10 s"; see the observation recorded there |

## 3. Exact hosted configuration

### 3.1 Projects and naming

| Item | Staging | Production |
|---|---|---|
| Supabase project | `eduquest-staging` | `eduquest-prod` |
| Region | Same region as the app host, closest to the school (Seoul `ap-northeast-2` for a Korean school) | Same as staging |
| Postgres version | The version the new project reports (section 4.1) | Same as staging |
| Database password | Long random, in the secrets manager | Different from staging |
| App deployment | `https://<staging-domain>` | `https://<pilot-domain>` (HTTPS only) |

Staging and production never share keys, data or users.

### 3.2 Environment variables (exact)

Source for all three: Dashboard → Project Settings → API (Project URL, anon/publishable key, service_role/secret key). Names are from `src/lib/env.ts` and `.env.example`; there are no others.

| Variable | Value | Needed at | Secret? | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | **Build** and runtime | No | Inlined at build time. Changing it requires a **rebuild and redeploy** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon (legacy JWT) or `sb_publishable_…` key of **this** project | **Build** and runtime | No (public by design) | Used only by server code and the middleware in this app |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (legacy JWT) or `sb_secret_…` key of **this** project | Runtime only | **YES** | Server only. Never in a `NEXT_PUBLIC_*` variable, build log, client bundle, ticket or chat |

Rules:

1. Set the two `NEXT_PUBLIC_*` variables in the host's **build** environment (not only runtime), because the middleware uses the inlined values. A build without them still succeeds; do not rely on that. Test S13 (session soak) is what proves refresh works on the deployed build.
2. The code reads the variables lazily, so a missing value fails on the **first request**, not at boot. Smoke test S1 is the check.
3. Do not copy any value from the local stack or from the earlier committed `.env.local`; those are the shared local defaults.
4. Use the host's secret store. Do not commit `.env*` files (`.env.local` is untracked and ignored; `.env.example` has names only).
5. Rotating a key: update the variable, rebuild, redeploy; then verify S1.

### 3.3 Application hosting

| Item | Value |
|---|---|
| Runtime | Node 24 (all tests and builds were run on v24.19.0) or the nearest version the host offers; run the code gates on that version |
| Package manager | pnpm (12.x locally); use `pnpm install --frozen-lockfile` once the lockfile is committed (decision D3) |
| Build command | `pnpm build`; the log must list `ƒ Middleware` |
| Start | `pnpm start` (or the host's Next.js adapter) |
| Request-time limit | Record the host's value (decision D1); it sets the batch cap (`01`) |
| Region | Same as the Supabase project |
| TLS | HTTPS only; redirect HTTP to HTTPS |
| Security headers (set at host/CDN; the app sets none) | `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`). A full CSP is deferred |
| Session cookie | Name `sb-<project-ref>-auth-token`. Observed attributes (local): `Path=/`, `Max-Age` (~400 days), `SameSite=Lax`; **no `Secure`, no `HttpOnly`** (the `@supabase/ssr` 0.5.2 defaults). HTTPS-only + HSTS mitigates; hardening is listed in section 8 |

## 4. Exact Supabase settings

### 4.1 Database

| Item | Required | Evidence |
|---|---|---|
| Postgres major version | Whatever the new project reports; **15 and 17 are both verified** | [V-local] full migration + test run on 15.19 and 17.11 |
| Extensions | `pgcrypto` in schema `extensions` (created by migration 1) | [V-local] |
| Migrations | 15 files `20261014000001` … `20261016000002`, applied by `supabase db push` only | [V-local] |
| Seed | **Never.** `seed.sql` creates `teacher@example.com` with a known password. Never run `db reset`; **never pass `--include-seed`** to `db push` (the flag exists in CLI 2.120) | [V-local] flag present in `db push --help` |
| RLS | 8 of 8 `public` tables; SELECT-only policies; `account_batches` and `audit_logs` have none | [V-local] catalog query |
| Function privileges | `fn_transfer_enrollment`, `fn_revoke_user_sessions`, `fn_student_login_begin/_fail`: `EXECUTE` for `service_role` only | [V-local] pgTAP + catalog |
| Backups | Daily backups on; point-in-time recovery if the plan offers it; restore drill before go-live | [V-staging] |

### 4.2 Authentication settings

Target values for both projects. "Local" is the value in the running local Auth server (verified from its environment and the public settings endpoint).

| Setting | Dashboard (confirm label) | `config.toml` key [CLI] | **Required** | Local effective [V-local] |
|---|---|---|---|---|
| Site URL | Authentication → URL Configuration → Site URL | `auth.site_url` | `https://<this-env-domain>` | `http://localhost:3000` |
| Redirect URLs | same page → Redirect URLs | `auth.additional_redirect_urls` | **empty** (the app has no redirect/email-link flow) | `https://127.0.0.1:3000` (template default) |
| Allow new users to sign up | Authentication → Sign In / Providers → "Allow new users to sign up" | `auth.enable_signup` | **false** | `disable_signup=true` |
| Email provider | Providers → Email | `auth.email.*` | **Enabled** (password sign-in needs it) | enabled |
| Confirm email | Providers → Email → "Confirm email" | `auth.email.enable_confirmations` | **false** (autoconfirm) | `mailer_autoconfirm=true` |
| Secure password change | Providers → Email → "Secure password change" | `auth.email.secure_password_change` | **false** | `…REQUIRE_REAUTHENTICATION=false` |
| Anonymous sign-ins | Providers → "Allow anonymous sign-ins" | `auth.enable_anonymous_sign_ins` | **false** | false |
| Manual linking | Providers → manual linking | `auth.enable_manual_linking` | **false** | false |
| Phone, OAuth, SAML, Web3, passkeys, magic link/OTP | Providers | `auth.sms`, `auth.external.*`, … | **all disabled** | only `email` enabled |
| Minimum password length | Providers → Email → password settings | `auth.minimum_password_length` | **8** | 6 |
| Password requirements | same | `auth.password_requirements` | **`""` (none)** | `""` |
| Leaked-password protection | same (plan-dependent) | n/a | **OFF** for the pilot (see §2) | n/a |
| CAPTCHA | Authentication → Bot and Abuse Protection | `auth.captcha` | **disabled** (sign-in is made by the app server, so a browser CAPTCHA token is not available without code changes) | disabled |
| Auth hooks | Authentication → Hooks | `auth.hook.*` | **none** | none |
| MFA | Authentication → Multi-Factor | `auth.mfa.*` | leave defaults; the app has no MFA UI | enroll/verify false |
| SMTP | Authentication → SMTP | `auth.email.smtp` | **Decision D2.** No emails are sent for students (`.invalid`). Staff recovery is Dashboard-only unless custom SMTP is configured; do not rely on the built-in SMTP | n/a |

### 4.3 JWT and session settings

| Setting | Dashboard (confirm label) | `config.toml` key [CLI] | **Required** | Local effective [V-local] |
|---|---|---|---|---|
| JWT expiry | Project Settings → JWT / Authentication → Sessions | `auth.jwt_expiry` | **3600** (hard rule: **> 90 s**; never below 300) | 3600; sign-in response `expires_in: 3600` |
| JWT signing keys | Project Settings → JWT Keys | n/a | Use the project default. **Do not rotate during the pilot.** The app validates tokens with the Auth server (`getUser`), not locally | ES256 locally |
| Refresh token rotation | Authentication → Sessions → "Detect and revoke potentially compromised refresh tokens" | `auth.enable_refresh_token_rotation` | **true** | true |
| Refresh token reuse interval | same | `auth.refresh_token_reuse_interval` | **10** (seconds; never 0) | 10 |
| Time-box / inactivity timeout, single session per user | Authentication → Sessions (plan-dependent) | n/a | **unset** | n/a |

Why the numbers matter (all [V-local]):

- **JWT lifetime must exceed the auth client's 90 s refresh margin.** At 60 s every request refreshes at both the middleware and the page, forking the refresh-token chain and ending the session. At 150 s the behaviour was correct across repeated expiries, a 5-way parallel burst and a full idle expiry.
- **Reuse interval 0** (the local stack's behaviour when the key is absent from `config.toml`) made parallel refreshes revoke the session. The repo's `supabase/config.toml` now sets `enable_refresh_token_rotation = true` and `refresh_token_reuse_interval = 10`.
- Changing any of these three during the pilot can sign everyone out. They are under change control (`05`, section 6).

### 4.4 Rate limits

Definitions are the CLI's own documentation of the keys. (The local Auth server's environment has no variable named after `sign_in_sign_ups`; the only matching 30-valued variable is `GOTRUE_RATE_LIMIT_OTP`, which the CLI most likely maps it to. This mapping was inferred, not confirmed.) All are **per IP address**, and every call to Supabase comes from the **app server**, so the whole school shares the host's egress IP(s).

| Limit | `config.toml` key [CLI] | Meaning [CLI] | Default | **Pilot value** |
|---|---|---|---|---|
| Sign-ups and sign-ins | `auth.rate_limit.sign_in_sign_ups` | sign-up and sign-in requests per 5 min per IP (excludes anonymous) | 30 | **300** if the plan allows editing; otherwise leave 30 and apply the log-in staggering constraint |
| Token refreshes | `auth.rate_limit.token_refresh` | sessions refreshed per 5 min per IP | 150 | **300** if the plan allows; otherwise leave 150 |
| Anonymous users | `auth.rate_limit.anonymous_users` | per hour per IP | 30 | default (feature disabled) |
| Emails sent | `auth.rate_limit.email_sent` | per hour; needs custom SMTP | 2 | default (no email) |
| Token verifications | `auth.rate_limit.token_verifications` | OTP/magic-link verifications per 5 min per IP | 30 | default (unused) |

Sizing: a class of 30 logging in together is 30 sign-in requests inside a minute; two classes reach 60; failed attempts count too. The default 30 can be exceeded by a single class, which is why the pilot value is 10× the default.

**[V-staging]** Local rate limiting is not enforced (170 rapid sign-ins, no `429`), and which limiter counts password sign-ins on the hosted service is established by measurement, not by reading: smoke test S9 (section 6) records the number of rapid sign-ins accepted before the first `429`, and the observed value goes into the sign-off table. Set both limits from that result.

### 4.5 Observed refresh-token reuse behaviour (informational)

With rotation on and a 10 s interval, a script that refreshed the same token twice immediately and again 12 s later got `200` each time and the newest token stayed valid. The service therefore tolerates re-use while the token chain has not advanced; it is **not** a "fails after 10 s" rule, so do not write a curl test that expects one. The behaviour that matters (a browser session surviving expiries) is verified by the soak test S13.

## 5. Optional: settings as code (drift check)

`supabase config diff` and `supabase config push` (CLI 2.120) compare/apply the properties a local `config.toml` **declares** to the linked project; undeclared properties are untouched; each change is shown and confirmed. Use `config diff` after setup to prove the hosted project matches this document. Do not run `config push` before reading the diff. [V-staging: untested against a hosted project.]

Target `[auth]` declaration (keep it outside the committed `config.toml`, in the ops repository or a scratch copy, because the committed file describes the local stack):

```toml
[auth]
site_url = "https://<this-env-domain>"
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
sign_in_sign_ups = 300   # confirm against the plan and S9
token_refresh = 300

[auth.email]
enable_confirmations = false
secure_password_change = false
```

## 6. Pilot deployment procedure

Do every step on **staging first**, then repeat on production. A step is done only when its check passes. Record results in the sign-off table in `04`.

### Part A: create and configure the Supabase project

| # | Action | Check |
|---|---|---|
| A1 | Create the project (section 3.1). Record the project ref, region and Postgres version | Dashboard shows the version; if it is neither 15 nor 17, rerun the local test suite on that version first (set `[db] major_version` locally) |
| A2 | Apply every row of section 4.2, 4.3, 4.4 in the Dashboard | Each Dashboard value equals the **Required** column |
| A3 | Enable daily backups (and PITR if available) | Backup page shows a schedule |
| A4 | Create the operator Dashboard accounts with MFA | |

### Part B: verify the settings from outside (no Dashboard needed)

Set `URL=https://<project-ref>.supabase.co` and `ANON=<anon/publishable key>` in your shell.

| # | Command | Expected |
|---|---|---|
| B1 | `curl -s "$URL/auth/v1/settings" -H "apikey: $ANON"` | JSON with `"disable_signup":true`, `"mailer_autoconfirm":true`, and under `external` only `"email":true` |
| B2 | `curl -s -X POST "$URL/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"email":"probe@students.eduquest.invalid","password":"Probe#pass12345"}'` | `422` with `"error_code":"signup_disabled"`. **No user may be created** (check Dashboard → Users) |
| B3 | `curl -s -X POST "$URL/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{}'` | `422` with `"error_code":"anonymous_provider_disabled"` |
| B4 | After the first staff account exists (Part D): password grant with that account (`POST $URL/auth/v1/token?grant_type=password`) | Response contains `"expires_in":3600` |

### Part C: database

```bash
supabase login
supabase link --project-ref <project-ref>          # asks for the database password
supabase migration list --linked                   # local: 15 rows, Remote column empty
supabase db push --dry-run                         # must list exactly the 15 migrations
supabase db push                                   # confirm; NEVER add --include-seed
supabase migration list --linked                   # Local and Remote now match for all 15
```

Then in the Dashboard SQL editor:

```sql
select count(*) from supabase_migrations.schema_migrations;                       -- 15
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;  -- no rows
select tablename, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename) as policies
from pg_tables t where schemaname = 'public' order by 1;   -- 8 tables; account_batches and audit_logs = 0
select count(*) from auth.users;                                                  -- 0 (no seed)
```

Run Dashboard → Advisors (Security) and resolve or consciously accept each finding. Accepted by design: the two `anon`-callable helper functions `fn_generate_classroom_code` and `fn_classrooms_code_immutable` (random code generator, trigger function) and default table grants to `anon` (blocked by RLS).

### Part D: staff

Follow `02-staff-bootstrap-runbook.md` (school id, first admin, teachers, verification, ops log). Then run B4.

### Part E: application deployment

| # | Action | Check |
|---|---|---|
| E1 | In the host, set the three variables (section 3.2) for this environment; the two `NEXT_PUBLIC_*` in the **build** environment | |
| E2 | Code gates on the tagged commit (`04`, phase 1) | all pass |
| E3 | Deploy the tagged commit | Build log lists `ƒ Middleware` |
| E4 | Search the deployed client JS for the first 12 characters of the service key | zero matches |
| E5 | Configure the security headers (section 3.3) and HTTPS redirect | `curl -sI https://<domain>/teacher/sign-in` shows the headers |
| E6 | Open `/teacher/sign-in` and sign in as the operator-created teacher | lands on `/teacher` (this also proves the variables are correct) |

### Part F: acceptance on staging

1. Run smoke test **S1–S15** from `04`. In particular:
   - **S4** proves `.invalid` auth emails are accepted by the hosted project.
   - **S9** is the rate-limit measurement. Record: requests accepted before the first `429`, which limit tripped (Auth logs), and the resulting limits for section 4.4.
   - **S13** is the session soak. Temporarily set the staging JWT expiry to **300 s** (never lower), keep a signed-in teacher active 20+ minutes with one idle gap longer than 300 s, confirm no unexpected sign-out, then **restore 3600**.
2. Run the backup restore drill into a scratch project and record the time taken.
3. Record the measured batch timings and choose the batch cap (`01`).
4. Fill the sign-off table. Any failure: fix, redeploy to staging, rerun the whole of Part F.

### Part G: production

1. Repeat Parts A–E on the production project with production keys and the pilot domain. No data is copied from staging.
2. Run B1–B4 and S1, S4, S6, S7, S8, S10 with **test accounts only**; then remove test accounts with a reviewed SQL clean-up (two-person rule, ops log).
3. Confirm the first automatic backup exists.
4. Apply the change-control rule: from now until the pilot ends, no change to JWT expiry, refresh-token rotation/reuse interval, signup settings, rate limits or keys without the process in `05` (section 6).

### Part H: go-live and operation

Follow `04` phases 5–7 (go-live day, support playbook, daily monitoring queries) and `04` phase 8 for rollback.

## 7. Settings that must never change during the pilot

| Setting | Failure mode if changed |
|---|---|
| JWT expiry (must stay 3600, always > 90 s) | At or below 90 s: every request double-refreshes and sessions end |
| Refresh-token rotation off, or reuse interval 0 | Parallel requests at refresh time revoke sessions |
| "Allow new users to sign up" on | Anyone with the public key can create auth users |
| Anonymous sign-ins on | Same, without email |
| Minimum password length above 8 or password requirements set | Student password change fails with a generic message |
| Secure password change on | Forced first-login change may require re-authentication |
| Keys rotated without rebuilding the app | Sign-in and every page fail |
| Database password or `service_role` key leaked | Full data exposure: treat as a security incident |

## 8. Follow-ups found by this review (not implemented; no code was changed)

| # | Item | Severity | Notes |
|---|---|---|---|
| F1 | Session cookie has no `Secure` flag (and is not `HttpOnly`) with the current `@supabase/ssr` defaults | P2, recommended before production | Mitigated by HTTPS-only + HSTS; hardening needs a small code change |
| F2 | Map Auth's `weak_password` error to a clear Korean message in the set-password action | P2 | Prerequisite for enabling leaked-password protection or a stricter minimum length |
| F3 | Security headers are not set by the app | P2 | Set at the host for now (section 3.3) |
| F4 | Batch size cap | P1 (existing) | `01` |
| F5 | Lockfile not committed | P1 (existing) | decision D3 in `04` |
| F6 | Remove `https://127.0.0.1:3000` from `additional_redirect_urls` when pushing settings to hosted | housekeeping | covered by section 4.2 (empty list) |

## 9. What remains unverifiable until a hosted project exists

Hosted Dashboard labels and plan limits (editable rate limits, PITR, MFA for operators); `.invalid` email acceptance (S4); which limiter counts password sign-ins and its enforcement (S9); the actual Postgres version; Security Advisor findings; `supabase config diff`/`push` against a hosted project; the host's request-time limit; backup restore time.
