# 10. Pilot execution preparation

Hosted staging preparation checklist, pilot operator runbook, pilot risk register and the final readiness summary. Prepared 2026-10-16 from the repository state below. Documentation and validation only: no code, architecture or database change, and nothing in this document was committed.

## 0. Basis

| | |
|---|---|
| Repository state | `m1/issue-005-student-provisioning` @ `0833cac`, pushed; 48 commits ahead of `origin/main` (130 files), merges cleanly; no PR, no tag, no CI; lockfile untracked; `MAX_BATCH_ROWS` is **200** in code; 15 migrations |
| Code gates | green on the last full run (typecheck, lint, production build, clean 15-migration apply, pgTAP 7 files, vitest 78/78; Postgres 15 and 17) |
| Evidence tags | **[V-local]** verified on the local stack; **[V-code]** established by reading the code; **[staging]** can only be proven on a hosted project |

### Review of `docs/pilot/01`–`09`

Links: 0 broken. Smoke-test ids, decisions D1–D6 and the numbers in `01`, `04`–`09` agree. Findings of this pass:

| # | Finding | Action taken |
|---|---|---|
| F-1 | Two different lists were both numbered R1…: `05` readiness criteria (R1–R10) and the "required before pilot" items of `08`/`09` (R1–R12) | `05` criteria renamed **RC1–RC10**; `09` mapping column updated |
| F-2 | Statements that had become false ("docs commit unpushed", baseline commit and counts) in `05`, `07`, `09` | Corrected to the current state |
| F-3 | **New risk, not in earlier documents:** `studentSignInAction` treats *any* Auth error as a wrong password [V-code `src/features/auth/student-actions.ts:168`]. A rate-limit `429`, an Auth outage or a network error calls `recordLoginFailure`, so a class log-in burst above the hosted limit would also lock students for 15 minutes | Added as risk **A1**, required item **R13** (`08`, `09`), recommended fix **C9** (`08`), S9 criterion (`04`), and recovery SQL §3.7 |
| F-4 | **New risk:** Korean-locale Excel saves "CSV" as EUC-KR. The importer reads UTF-8, so `홍길동` arrives as `ȫ�浿` [V-local, decoding test] | Added as risk **B5**; the import steps (§3.5) tell teachers how to save and what to look for in the preview |
| F-5 | No click-level procedures existed for classroom creation, student import and emergency recovery | §3 below (recovery SQL validated on the local database) |

## 1. Hosted Staging Preparation Checklist

Create **`eduquest-staging`** first. Everything below is done and ticked on staging before production. Detail and Dashboard paths: `06`; exact commands: `08` §2.

### A. Required Supabase Cloud settings

| ☐ | Area | Setting | Required value | Why / evidence | Verify |
|---|---|---|---|---|---|
| ☐ | Project | Region; Postgres version | Production region (Seoul for a Korean school); the version the project reports. **15 and 17 both pass the full suite** [V-local] | Latency multiplies across ~11 round trips per provisioned student | Dashboard shows version |
| ☐ | **Signup** | Allow new users to sign up | **OFF** | Students never self-register. [V-local] `422 signup_disabled` | `curl -s -X POST "$URL/auth/v1/signup" …` returns `signup_disabled`; no user created |
| ☐ | **Signup** | Allow anonymous sign-ins | **OFF** | [V-local] `422 anonymous_provider_disabled` | `curl … -d '{}'` |
| ☐ | **Providers** | Email | **Enabled**, and **every other provider disabled** (phone, OAuth, SAML, Web3, passkeys, magic link/OTP) | The app uses password sign-in only | `GET /auth/v1/settings`: under `external` only `"email":true` |
| ☐ | **Providers** | Confirm email | **OFF** (autoconfirm) | Matches the tested configuration; all accounts are admin-created and confirmed | settings endpoint `"mailer_autoconfirm":true` |
| ☐ | **Providers** | Secure password change | **OFF** | Avoids a re-authentication prompt in the forced first-login change | Dashboard |
| ☐ | **Password policy** | Minimum length | **8** | The app enforces 8; a higher project value makes the app form pass and Auth reject, shown only as a generic error (`06` §2) | Dashboard; S6 |
| ☐ | **Password policy** | Required characters | **none** | Same reason | Dashboard |
| ☐ | **Password policy** | Leaked-password protection | **OFF** for the pilot | A rejected common password shows only the generic error; enable after the message is mapped (`08` C2) | Dashboard |
| ☐ | **JWT lifetime** | JWT expiry | **3600 s**; always > 90 s, never below 300 s | [V-local] 60 s fails, 150 s passes; the 90 s refresh margin is `3 × 30 s` in the Auth client source | Staff password grant returns `"expires_in":3600`; S13 |
| ☐ | **Refresh tokens** | Rotation | **ON** | [V-local] | S13 |
| ☐ | **Refresh tokens** | Reuse interval | **10 s** (never 0) | [V-local] 0 revoked sessions under parallel requests | S13 |
| ☐ | URLs | Site URL; Redirect URLs | `https://<staging-domain>`; **empty** list | The app has no redirect or email-link flow | Dashboard |
| ☐ | Rate limits | Sign-ups and sign-ins; token refresh (per 5 min per IP) | **300** each if the plan allows (defaults 30 / 150) | All Supabase calls come from the app server: the whole school shares one IP. Local enforcement is off [V-local], so the real limit is measured, not read | **S9** |
| ☐ | Sessions | Time-box, inactivity timeout, single session | **unset** | Not needed for the pilot | Dashboard |
| ☐ | Backups | Daily backups (PITR if offered) | **ON** | System of record | Dashboard; R8 |
| ☐ | Operators | Dashboard accounts | MFA on, least privilege | The Dashboard reads all student data | Dashboard |
| ☐ | **Security Advisor** | Compare with the expected result | See below | Predicted from the local catalog | Dashboard → Advisors → Security |

Security Advisor expectations (predicted from the local catalog [V-local]; the hosted run is **[staging]**):

| Expected | Reason | Action |
|---|---|---|
| No "RLS disabled in public", no security-definer-view, no mutable-`search_path`, no extension-in-public, no exposed-`auth.users` finding | 8 of 8 tables have RLS; both views are `security_invoker`; 7 of 7 functions pin `search_path`; `pgcrypto` is in `extensions`; no view references `auth` | none |
| INFO "RLS enabled, no policy": `account_batches`, `audit_logs` | Service-role-only tables by design | Accept |
| Auth warning "leaked password protection disabled" | Deliberate (above) | Accept |
| Possible MFA-options note | The app has no MFA UI | Accept |
| `anon`-callable helpers `fn_generate_classroom_code`, `fn_classrooms_code_immutable`; default `anon` table grants | Harmless / blocked by RLS | Accept |

Anything else must be resolved or accepted in writing before production.

### B. Environment variable checklist

| ☐ | Variable | Source | Build time | Runtime | Secret | Notes |
|---|---|---|---|---|---|---|
| ☐ | `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL: `https://<project-ref>.supabase.co` | **Required** | Required | No | Inlined into the middleware at build; server code reads it at run time. Change = **rebuild** |
| ☐ | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page: anon / `sb_publishable_…` | **Required** | Required | No (public by design; used only by server code and the middleware) | Change = **rebuild** |
| ☐ | `SUPABASE_SERVICE_ROLE_KEY` | Same page: service_role / `sb_secret_…` | Not needed | **Required** | **YES** | Server only. Never in a `NEXT_PUBLIC_` variable, log, ticket, chat or the client bundle |

Rules and checks:

1. If the two public variables are missing at build time the build still succeeds, and the middleware then keeps a runtime lookup instead of inlining [V-local]. Always provide them at build time; S13 proves refresh works on the deployed build.
2. The code reads the variables lazily, so a wrong or missing value fails on the **first request** (S1), not at boot.
3. Staging and production use different projects and different values. Never reuse the local stack's keys.
4. After deploy: search the client JS for the service key's first 12 characters: **0 matches** [V-local on a local build].
5. `.env*` files are never committed (`.env.local` is untracked; `.env.example` has names only).

### C. Staging preparation sequence

| ☐ | Step | Done when |
|---|---|---|
| ☐ | C1 Decisions D1–D6 recorded (`04`) | Written outcomes |
| ☐ | C2 Create the project; apply section A | Dashboard equals the table |
| ☐ | C3 `supabase link`; `migration list --linked`; `db push --dry-run`; `db push` (never `--include-seed`) | 15/15 matched; RLS and policy queries as `06` Part C |
| ☐ | C4 Set section B variables in the host (public ones in the **build** environment) | Variables present |
| ☐ | C5 Deploy the tagged commit; HTTPS + security headers (`06` §3.3) | Build log lists `ƒ Middleware`; headers visible |
| ☐ | C6 Bootstrap one admin and one teacher (§3.2–3.3) | Both sign in |
| ☐ | C7 Smoke test S1–S15 (`04`); S9 with 30 then 60 sign-ins; S13 soak | Recorded results; S5b "blocked" until the cap exists |
| ☐ | C8 Backup restore drill; monitoring queries (`04` phase 7) run on hosted | Drill record; queries error-free |

## 2. Pilot assumptions, tested

| Assumption | Result |
|---|---|
| One school | Works by convention: one shared `school_id`. Not database-enforced (no schools table); check with `select count(distinct school_id) from public.profiles;` = 1 |
| 3–4 teachers, ≤ 100 students | [V-local] 4 teachers / 4 classrooms / 100 students on a production build: pages answered in about 0.2 s (p50 180–220 ms); 30 simultaneous log-ins: 0 failures, 950 ms. Excludes hosted rate limiting |
| ≤ 30 students per CSV | **Not enforced:** the code allows 200 and the page says "최대 200명". A class of 31–35 needs two files. Process rule until R2 |

## 3. Pilot operator runbook

Roles: **Ops** (Dashboard and host access), **Teacher**, **Admin** (app role). Always two people for account changes; log every change (who, who checked, when, why).

### 3.1 Environment setup

1. Install the CLI (2.120 or newer), `supabase login`. Node 24 and pnpm are needed only to build locally; the host builds the app.
2. Create the Supabase project and apply `1.A`. Run the three outside checks (`1.A` verify column).
3. `supabase link --project-ref <ref>`; `supabase db push`. **Never** `db reset`, `seed.sql` or `--include-seed` (the seed creates `teacher@example.com` with a known password).
4. Set the variables (`1.B`), deploy the tagged build, open `/teacher/sign-in`.

### 3.2 Initial admin bootstrap

1. In the SQL editor, once: `select gen_random_uuid();` and store it as `PILOT_SCHOOL_ID`. Never generate a second one.
2. Dashboard → Authentication → Users → Add user: real email, 16+ random characters, "Auto Confirm User" ticked. **[staging]** confirm Add user works while signups are OFF.
3. ```sql
   insert into public.profiles (id, school_id, role, display_name, status)
   select u.id, '<PILOT_SCHOOL_ID>'::uuid, 'admin', '<name>', 'active'
   from auth.users u where u.email = '<email>';
   ```
   Expect `INSERT 0 1`. A second run fails loudly by design [V-local].
4. Verify (`02` §D listing query): `active`, `confirmed`, one `school_id`. Sign in at `/teacher/sign-in`; expect `/teacher`. Hand the password over in person or by a password manager. Admins can act on every classroom in the school; keep them to one or two people.

### 3.3 Initial teacher bootstrap

Same as 3.2 with `'teacher'`. Before the first class, the teacher confirms: sign-in works and the dashboard shows "내 학급". Staff cannot change their own password in the app; resets are Dashboard-only (decision D2).

### 3.4 Initial classroom creation (teacher)

1. `/teacher` → **내 학급** → **새 학급 만들기**.
2. Enter the class name (max 80 characters) → **학급 만들기**. You land on the classroom page showing the read-only **학급 코드** (copy button).
3. Optional: **학급 설정** → **공동 담임 추가** to add a co-teacher (owner or admin only). A co-teacher can edit the name and manage the roster; only the owner or an admin can archive.
4. Check: the classroom appears under "내 학급" and the roster says 0명.

### 3.5 Initial student import (teacher or admin)

Pilot rule: **at most 30 rows per file** (R2). A class of 31+ is two files.

1. Prepare the file with the header `이름,학번,학년` (accepted aliases: 성명/name; 번호/studentno; grade). One row per student. **Student numbers must be unique** within the school.
2. **Save as "CSV UTF-8 (쉼표로 분리)".** The default "CSV" in Korean Excel is EUC-KR and the names arrive garbled (`ȫ�浿`).
3. Classroom page → **CSV로 일괄 만들기** → choose the file → **미리보기**.
4. Read the preview: row count, any red error rows (blank name, duplicate number), and **look at every name for garbled characters**. If any are garbled, stop, re-save as UTF-8 and upload again. Nothing has been created yet.
5. **N명 계정 생성** (the preview is valid for 15 minutes; after that, preview again).
6. **Immediately** press **계정 정보 CSV 내려받기**. The usernames and temporary passwords exist only on this screen and in this file. If the tab closed first: the accounts exist (see the roster), so reissue each password (3.6).
7. Check **학생 명단 관리**: every created student is listed. Rows that failed are shown with a reason; fix the file and import only those.
8. Hand out the credentials in person or on screen. Delete the downloaded CSV afterwards.
9. First login for each student: username and temporary password → forced to **비밀번호 설정** → new password of 8+ characters → student home shows the class.

Single student: classroom page → **학생 계정 만들기** (same one-time credential card).

### 3.6 Password reissue (teacher, or admin for any classroom)

1. Classroom → **학생 명단 관리** → the student's row → **비밀번호 재발급** → confirm.
2. A one-time panel shows the username and a new temporary password. Give it to the student in person.
3. Effects [V-local]: the old password stops working, the student's existing sessions end, any lock is cleared, and the student must set a new password at next login. The event is audited (never the password).
4. Reissue is allowed only for students actively enrolled in a **non-archived** classroom the person can manage. Otherwise unarchive first or ask an admin.

### 3.7 Emergency lockout recovery

Rule: **find the cause before unlocking many accounts.** Check the Auth logs for `429` (rate limit) or errors (outage) first, because every failed or errored sign-in counts toward the 5-failure lock (risk A1). Run SQL in the Dashboard SQL editor. Statements (a)–(c) were executed against the local database and behaved as described [V-local].

| Situation | Action |
|---|---|
| **One student locked** (lock lasts 15 min) | Easiest: teacher reissues the password (3.6). Or unlock only:<br>`update public.student_accounts set failed_attempts = 0, locked_until = null where username = '<username>';`<br>Other students stay locked. |
| **A class locked** | Unlock members of one classroom only:<br>`update public.student_accounts sa set failed_attempts = 0, locked_until = null from public.classroom_enrollments e where e.student_id = sa.student_id and e.status = 'active' and e.classroom_id = '<classroom id>' and (sa.locked_until is not null or sa.failed_attempts > 0);`<br>Students in other classrooms stay locked. Then stagger the class's log-ins. |
| **Everyone locked** | 1) Pause log-ins (announce). 2) Identify the cause (rate limit, outage, wrong setting). 3) Unlock all:<br>`update public.student_accounts set failed_attempts = 0, locked_until = null where locked_until is not null or failed_attempts > 0;`<br>4) Resume staggered. Record it in the ops log. |
| **List who is locked** | `select username, failed_attempts, locked_until from public.student_accounts where locked_until > now() order by locked_until;` |
| **Staff cannot sign in** | Check `select p.status, p.role, u.email, (u.email_confirmed_at is not null) as confirmed from public.profiles p join auth.users u on u.id = p.id where u.email = '<email>';` Wrong password → Dashboard reset. `suspended` → `update public.profiles set status = 'active' where id = (select id from auth.users where email = '<email>');` A `429` → wait five minutes. Staff have no app-level lock. |
| **The only admin is locked out or suspended** | A second admin fixes it. Otherwise an Ops Dashboard user resets the Auth password and runs the reactivation SQL above (and `update public.profiles set role = 'admin' …` only if the role was wrong). |
| **Many users signed out at once** | Not a lockout: check the JWT expiry (3600), reuse interval (10) and that the deployed build lists `ƒ Middleware` (`06` §4.3). |
| **Stop everything / resume** | `08` §2 F: host maintenance page; suspend teachers and students by role; `delete from auth.sessions;`. Resume by setting `status = 'active'` again. Student data is untouched [V-local]. |

## 4. Pilot risk register

Rating = likelihood × impact with the pilot constraints in force (`07` §2). **Owner** uses the roles in `09`. "Closed by" refers to the required items R1–R13.

### High

| ID | Category | Risk | Mitigation | Owner | Closed by |
|---|---|---|---|---|---|
| **A1** | Auth × rate limit | Any Auth error (rate-limit `429`, outage, network) counts as a wrong password [V-code]; a class log-in burst above the hosted limit locks students for 15 minutes and repeats on retry | Measure the limit (S9) and raise it; stagger log-ins; bulk-unlock SQL (3.7); recommended fix: don't consume an attempt on non-credential errors (`08` C9) | Ops, Eng, PM | R13, R1 |
| **L1** | Rate limit | The whole school shares one egress IP; the documented default of 30 sign-ins per 5 minutes per IP is below one class | Set 300 if the plan allows; otherwise stagger (about 25 per minute); measure in S9 | Ops | R1, R3 |
| **G1** | Data governance | Consent, retention and erasure undecided; no student delete/export feature | Signed decision D6; approved, staging-tested SQL erasure procedure: deleting a student's auth user cascades to profile, student record, account and enrollments [V-local FK rules]; audit rows remain with ids/usernames | School, PM, Eng | R10 |
| **B1** | Batch import | Cap is not implemented (200 in code): a large import can time out and lose the one-time passwords | Pilot rule ≤ 30 rows; implement the cap and measure (`01`); recovery = reissue | Eng, PM | R2 |

### Medium

| ID | Category | Risk | Mitigation | Owner | Closed by |
|---|---|---|---|---|---|
| A2 | Auth | A wrong JWT or reuse-interval setting signs everyone out | Change control; S13 soak; settings table `06` §4.3; first diagnostic: middleware listed in the build | Ops | R1, R3 |
| A3 | Auth | Weak student passwords (8 characters, leaked-password check off) | Teacher briefing; map the weak-password message then enable protection (`08` C2) | PM, Eng | R11 |
| A4 | Auth | Session cookie has no `Secure`/`HttpOnly` flag (library defaults) | HTTPS only + HSTS; recommended code change (`08` C1) | Eng, PM | R12 |
| A5 | Auth | Single-factor staff accounts with broad school access; no in-app password change | Long random passwords, 1–2 admins, suspend/revoke, Dashboard resets, M2 MFA | Ops | R7 |
| A6 | Auth | Hosted rejects the `.invalid` auth email domain | S4 on staging is the gate; if it fails stop and escalate: this is a design change | Ops, Eng | R1 |
| L2 | Rate limit | Token-refresh limit (150 per 5 min per IP) shared by all users, or multiple host egress IPs make capacity unpredictable | Raise to 300; record the host's egress behaviour in S9 | Ops | R1 |
| B2 | Batch import | Interrupted batch leaves accounts without credentials and a `running` row; not resumable | Roster check, reissue, monitoring query (`04` phase 7) | Teacher, On-call | R11 |
| B3 | Batch import | Credential CSV left in Downloads, mailed or shared | Hand out in person, delete the file, teacher guide, staff briefing | PM | R11 |
| B5 | Batch import | EUC-KR "CSV" garbles Korean names (preview catches it only if the teacher looks) | Save as UTF-8; preview check step in 3.5; teacher guide | PM | R11 |
| O1 | Operations | Staff creation is manual and depends on one operator | Runbook, two-person rule, second trained operator | Ops, PM | R7 |
| O2 | Operations | Release hygiene: lockfile untracked, no PR/tag/CI; deploying an unreviewed or non-reproducible build | Commit lockfile, reviewed PR, tag, gates on the tag | Eng, Reviewer | R9 |
| O3 | Operations | Backup/restore never rehearsed; no alerting | Restore drill, alert recipient | Ops | R8 |
| O4 | Operations | Support load: forgotten passwords handled one student at a time | On-call during weeks 1–2; reissue playbook | On-call | R11 |
| G2 | Data governance | Any teacher can list and add any student in the school | Accepted for a one-school pilot; tell teachers; M2 per-class visibility | PM | R11 |
| G3 | Data governance | Audit rows keep ids and usernames after erasure | State it in the erasure procedure and D6 | School, PM | R10 |
| G4 | Data governance | Dashboard operators can read all student data | MFA, least privilege, named operators | Ops | R3 |

### Low

| ID | Category | Risk | Mitigation | Owner |
|---|---|---|---|---|
| A7 | Auth | Direct guessing against the public Auth API | Auth email is 128 random bits, not derivable from the username [V-local] | none needed |
| A8 | Auth | Lock message reveals that a username exists (only for locked accounts) | Accepted | PM |
| B4 | Batch import | Duplicate student number shows the raw database message at commit | Preview catches duplicates inside the file; fix the file | Eng (M2) |
| O5 | Operations | Dependency advisories: 4 `postcss` findings pinned inside Next 15 (build-time, our own CSS only) | Written acceptance or override; Next 16 in M2 | Eng, PM |
| O6 | Operations | Node/pnpm drift (`engines` is `>=20`; all testing on 24.19) | Pin the host to Node 24 | Ops |
| O7 | Operations | Two lint warnings; `next lint` deprecated | Housekeeping | Eng |
| G5 | Data governance | Data-residency requirement unknown | Choose the region deliberately (Seoul) and record it in D6 | School |

## 5. Final Pilot Readiness Summary

# FINAL PILOT STATUS: READY WITH CONDITIONS

**Justification**

- *Established:* every build, type, lint, database and test gate passes on the pushed head, on Postgres 15 and 17. Both user workflows were walked end to end in a browser; scale (4 teachers, 100 students) and a 30-student simultaneous log-in were tested; the recovery switches and the unlock SQL were exercised on the local database and leave student data untouched.
- *Why not READY:* nothing has been run on a hosted project, and this pass found one more interaction that only the hosted rate limit can expose (A1/L1: a rate-limited sign-in counts as a wrong password). The 30-per-import limit is a process rule, not product behaviour. Release hygiene and the non-engineering items are open.
- *Why not NOT READY:* no new feature or architecture change is required. The engineering work is the batch cap (R2) and the lockfile commit (R9), plus one optional small fix (C9). The rest is configuration, rehearsal, decisions and sign-off, each with a written procedure and a pass criterion.

### Unresolved blockers

Effort is active hands-on time (see `09` for elapsed time and dependencies).

| # | Blocker | Mitigation / closure | Owner | Estimated effort |
|---|---|---|---|---|
| R1 | Staging acceptance incl. S4, S9, S13 | Run `04` phase 3 and section 1.C | Ops + Eng | 1 day (+0.5 per rerun) |
| R2 | Batch cap (30) measured; S5b passes. Or signed process-only acceptance | Change per `01`; measure on staging | Eng, Reviewer (PM for acceptance) | 0.5–1 day (acceptance 30 min) |
| R3 | Production settings applied and verified | `1.A`, `06` §4 | Ops | 2–3 h |
| R4 | Security Advisor matches the expected list | `1.A` table | Ops | 1 h (+0–2 h) |
| R5 | Environment variables correct; service key never in the client | `1.B` | Ops, Eng | 1 h per environment |
| R6 | 15 migrations deployed, no seed | `08` §2 C | Ops | 1 h per environment |
| R7 | Production staff bootstrapped, two-person rule, test accounts removed | §3.2–3.3, `02` | Ops + second person | 1–2 h |
| R8 | Backups, restore drill, alert recipient | `06` §3, `04` phase 8 | Ops | 3–5 h |
| R9 | Lockfile, advisory decision, reviewed PR, tag | `09` R9 | Eng, Reviewer, PM | 2–3 days elapsed (review dominates) |
| R10 | Consent, retention, erasure procedure | D6 and risk G1 | School, PM, Eng | Eng 3–4 h; decision days to weeks |
| R11 | On-call, contacts, teacher guide (include the UTF-8 CSV and credential-handling steps), constraints accepted | §3, `07` §2 | PM, On-call, Eng | about 1 day |
| R12 | HTTPS and security headers | `06` §3.3 | Ops | 1–2 h per environment |
| R13 | Auth errors vs lockout: S9 clean at 60 sign-ins in five minutes and no student locked; unlock SQL rehearsed; optional fix C9 | §3.7, `08` C9 | Ops, PM (Eng for the fix) | 1 h (fix 0.5 day) |

Estimated total: about **6–8 working days elapsed** with an engineer, an operator and a reviewer in parallel, assuming the consent decision (D6) does not block.

**Condition for GO:** R1–R13 closed with the evidence listed in `09`, and no High-rated risk in section 4 still open without a written acceptance by the PM.
