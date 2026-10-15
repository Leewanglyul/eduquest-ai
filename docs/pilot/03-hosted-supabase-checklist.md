# 3. Hosted Supabase configuration checklist

> The exact settings, values and deployment procedure are consolidated in [06-hosted-pilot-configuration.md](06-hosted-pilot-configuration.md). Where this checklist and `06` differ, `06` is correct (corrections listed in `06` §2).

Apply to **staging first**, then production. Dashboard menu names are as of writing and may move; the *setting* matters, not the menu path.

Legend: **[V-local]** verified on the local stack during development (evidence noted). **[V-staging]** cannot be verified locally: you must test it on staging before production. Defaults quoted from Supabase documentation may change: confirm in the Dashboard.

## 1. Project

| # | Item | Required | Notes |
|---|---|---|---|
| 1.1 | Separate projects | `eduquest-staging` and `eduquest-prod` | Never test against production |
| 1.2 | Region | Closest to users and to the app host (Seoul `ap-northeast-2` for a Korean school) | Latency multiplies across ~11 round trips per provisioned student (see batch plan); also relevant to data-residency questions |
| 1.3 | Database password | Long random, in the secrets manager | Not used by the app (it talks to the HTTP APIs) |
| 1.4 | Organisation access | Least privilege; MFA on all Dashboard users | The Dashboard can read every student record |

## 2. API keys

| # | Item | Required | Notes |
|---|---|---|---|
| 2.1 | App environment variables | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (names from `src/lib/env.ts`) | The anon/publishable key may be public. **The service-role/secret key is server-only** |
| 2.2 | Key format | Either the legacy `anon`/`service_role` JWT keys or the newer `sb_publishable_…`/`sb_secret_…` keys | Same variable names; supabase-js accepts both |
| 2.3 | Never reuse local keys | The keys committed earlier in `.env.local` history are the **local stack defaults** (shared, public) | Hosted projects generate their own; do not copy them over |
| 2.4 | Service key exposure | Not in any `NEXT_PUBLIC_` variable, client bundle, log, or CI output | After the first deploy, search the built client JS for the first 10 characters of the key |

## 3. Authentication, sign-up and providers

| # | Item | Required | Evidence / test |
|---|---|---|---|
| 3.1 | **Allow new users to sign up** | **OFF** | [V-local] with `enable_signup = false` a direct `POST /auth/v1/signup` returned `422 signup_disabled`. Students never self-register; staff are created by the operator |
| 3.2 | Email provider | Enabled (password sign-in uses it) | Required |
| 3.3 | Confirm email | **OFF** (autoconfirm), matching the tested local configuration; accounts are created already confirmed by the app (`email_confirm: true`) and the runbook ("Auto Confirm User") | Decision and rationale in `06` §2. Verify a staff login works on staging |
| 3.4 | Anonymous sign-ins | **OFF** | The app has no anonymous flow |
| 3.5 | Other providers (OAuth, phone, magic link) | OFF | Smaller attack surface |
| 3.6 | **`.invalid` synthetic email accepted** | Creating a user with `<id>@students.eduquest.invalid` through the admin API must succeed | **[V-staging]**. Works locally; hosted email validation could differ. Smoke test step S4 |
| 3.7 | CAPTCHA / bot protection | Not enabled | Sign-in runs from the app server, so a browser CAPTCHA token is unavailable without code changes. Protection comes from the app lockout, opaque emails and rate limits |

## 4. Sessions and tokens

| # | Item | Required | Evidence |
|---|---|---|---|
| 4.1 | **JWT expiry** | Keep the default **3600 s**. Must stay **above 90 s**; do not set below 300 s | [V-local] a 60 s lifetime sits below the auth client's 90 s refresh margin, so every request refreshes at middleware *and* page and forks the refresh-token chain, ending the session. With 150 s lifetime, refresh behaved correctly through repeated expiries |
| 4.2 | **Refresh token rotation** | **ON** | [V-local] |
| 4.3 | **Refresh token reuse interval** | **≥ 10 s** (hosted default is 10) | [V-local] with a reuse interval of 0, parallel requests at refresh time revoked the session. The repo's `supabase/config.toml` now mirrors 10 s |
| 4.4 | Session time-box / inactivity timeout | Optional (plan-dependent). If set, tell users | Not required for the pilot |
| 4.5 | App middleware present | `src/middleware.ts` (not the repo root) | [V-local] a root-level file is ignored because the app uses `src/app`; a test pins the location. After deploy, confirm the build log lists "Middleware" |

## 5. Passwords

| # | Item | Required | Notes |
|---|---|---|---|
| 5.1 | Minimum password length | **8** (matches the app form) | Corrected in `06` §2: a higher project minimum makes the app form pass and the Auth server then reject it, shown only as the generic "비밀번호를 변경하지 못했습니다.". Temporary passwords are 14 random characters |
| 5.2 | Password requirements (letters/digits/symbols) | Enable if the plan allows | Check that the in-app set-password form shows a clear message for a rejected password (staging smoke test S6) |
| 5.3 | Leaked-password protection | **OFF for the pilot** | Enable only after the app shows a clear message for Auth's `weak_password` error (`06` §8, F2) |
| 5.4 | Secure password change | Leave defaults | Admin password updates revoke other sessions (observed locally on password change) |

## 6. Rate limits (important for a school)

All Supabase calls come from the **app server**, so every student looks like **one IP**. Per-IP limits therefore apply to the whole school at once.

| # | Item | Required | Notes |
|---|---|---|---|
| 6.1 | Sign-ups and sign-ins per 5 min per IP | CLI definition: sign-up and sign-in requests per 5 min per IP, default **30**. Pilot value **300** if the plan allows editing | **[V-staging]**. Locally 170 rapid sign-ins were not throttled (no enforcement), so local results say nothing about hosted. Exact keys, values and the S9 measurement are in `06` §4.4 |
| 6.2 | Token refreshes per 5 min per IP | Documented default 150 | Refreshes are rare at 3600 s lifetime |
| 6.3 | Emails per hour | Only matters with SMTP (section 7) | |
| 6.4 | If limits cannot be raised on the plan | Stagger class log-ins, or pick a plan that allows it | Record the decision in the sign-off table |

The app lockout (5 failures → 15 minutes) protects the app path. Because auth emails are opaque 128-bit values, the public auth endpoint cannot be targeted from a username (see `tests/access/synthetic-email.test.ts`).

## 7. Email (SMTP)

| # | Item | Required | Notes |
|---|---|---|---|
| 7.1 | Student emails | Never delivered. They end in `.invalid` and the app never triggers email for students | |
| 7.2 | Staff recovery email | Optional. The built-in SMTP is heavily rate-limited and not for production | Either configure custom SMTP, or reset staff passwords from the Dashboard (runbook F). Pick one and write it down |
| 7.3 | Site URL / redirect URLs | Set to the production origin only | Used in emails; remove `localhost` entries from production |

## 8. Data API, RLS and database

| # | Item | Required | Evidence |
|---|---|---|---|
| 8.1 | RLS on every `public` table | All 8 tables | [V-local] catalog check returned no table without RLS: `account_batches`, `audit_logs`, `classroom_enrollments`, `classroom_teachers`, `classrooms`, `profiles`, `student_accounts`, `students` |
| 8.2 | No client write policies | Writes only through the service role | [V-local] policy counts: `account_batches` 0, `audit_logs` 0, others 1–2 (SELECT only); pgTAP `00005`/`00003` assert it |
| 8.3 | Security Advisor (Dashboard → Advisors) | Run after migrations; resolve or consciously accept each finding | **[V-staging]** |
| 8.4 | SECURITY DEFINER functions | `fn_transfer_enrollment`, `fn_revoke_user_sessions`: `search_path` pinned, `EXECUTE` for `service_role` only | [V-local] catalog check + pgTAP |
| 8.5 | Auth lockout functions | `fn_student_login_begin/_fail`: `EXECUTE` for `service_role` only | [V-local] pgTAP `00006` |
| 8.6 | `anon` table privileges | The `anon` role holds full default privileges on `public` tables, blocked only because no policy grants `anon` anything | **Optional hardening:** revoke table privileges from `anon` after validating on staging that sign-in and all pages still work. Not required for the pilot |
| 8.7 | Views | `v_students_safe`, `v_classroom_activity_safe` use `security_invoker` | [V-local] |
| 8.8 | Exposed schemas | `public` only | Default |

## 9. Migrations

| # | Item | Required |
|---|---|---|
| 9.1 | Method | `supabase link --project-ref <ref>` then `supabase db push`. 16 migration files (`20261014000001` … `20261016000003`) apply in order |
| 9.2 | Never | `supabase db reset`, running `seed.sql`, or editing applied migrations |
| 9.3 | Verify | After push, run the catalog checks in section 8 and `select count(*) from supabase_migrations.schema_migrations;` (expect 15) |
| 9.4 | Types | `src/types/database.ts` is generated from local; regenerate against staging only if migrations change |

## 10. Backups, recovery and monitoring

| # | Item | Required | Notes |
|---|---|---|---|
| 10.1 | Backups | Daily backups on, and point-in-time recovery if the plan offers it | Student records and the audit log are the system of record |
| 10.2 | Restore drill | Restore a backup into a scratch project once before go-live | Confirms the procedure and the time it takes |
| 10.3 | Logs | Know where Auth and API logs are; note retention | Needed for incident review |
| 10.4 | Alerts | Project usage and error-rate alerts to a monitored address | |
| 10.5 | Network restrictions / SSL enforcement | SSL enforced; restrict direct DB access if the plan allows | The app does not use direct DB connections |

## 11. Things to leave off

Realtime and Storage are unused: leave them untouched. No Edge Functions, no database webhooks, no auth hooks.

## 12. Items you cannot verify without a hosted project (summary)

3.6 `.invalid` emails accepted · 6.1 rate-limit value and effect on a full class · 8.3 Security Advisor output · 4.3 actual reuse interval · 5.1/5.2 password policy behaviour in the set-password form · 7.2 whichever staff recovery route you choose.
