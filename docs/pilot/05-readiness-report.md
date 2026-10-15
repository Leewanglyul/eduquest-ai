# 5. M1 Pilot Readiness Report

| | |
|---|---|
| Date | 2026-10-15 |
| Branch / commit verified | `m1/issue-005-student-provisioning` @ `9df58ab` (docs commit; application code unchanged since `89e77b4`) |
| Environment verified | Local Supabase stack + local Next.js. **Nothing was run on a hosted project.** |
| Method | Review only: commands re-run on the current head and both user workflows walked through in a real browser. No application code was changed. |

## Verdict: READY WITH CONDITIONS (conditional GO)

**GO for a staging deployment and a staged, supervised pilot. NO-GO for putting real students on production until the readiness criteria in section 7 are met.**

### Reasoning

For GO:

- Every control the product promises was exercised and held: teacher and student workflows end to end, forced first-login password reset, 5-failure lockout (including a parallel burst), student-only and teacher-area guards, owner/co-teacher/admin permissions, archived-classroom protection, school boundary, one-time credentials, audit trail.
- The security defects found during review were fixed and are pinned by tests that fail when the fix is removed (section 3).
- Database state is reproducible: a clean `db reset` applies all 15 migrations; RLS covers every table; no client write policies exist.
- Operational documentation exists (`docs/pilot/01`–`04`) and its SQL was executed against the database.

For "with conditions":

- The behaviours that decide whether the first lesson works are **hosted-only and untested**: the per-IP auth rate limit (all students share the app server's IP), acceptance of the `.invalid` auth email, the host's request-time limit, and the actual Auth settings.
- The batch size cap is **designed but not implemented**; the UI still advertises 200 rows (about 59 s sequential locally).
- Release hygiene is incomplete: lockfile untracked, docs commit unpushed, nothing merged or tagged.
- Staff creation is a manual, one-operator procedure, and data-protection/consent sign-off (D6) is unrecorded.

None of these needs new product features. They are verification, one small change (the cap) and housekeeping.

## 1. Evidence

All results are from this review session on the head above unless stated.

| Area | Command / method | Result |
|---|---|---|
| Typecheck | `tsc --noEmit` | Clean |
| Build | `pnpm build` | Passes; output lists **Middleware** (93.7 kB) |
| Lint | `pnpm lint` | 0 errors, 2 warnings (`_role` unused, `src/features/classrooms/domain.ts:52–53`). `next lint` is deprecated in Next 16 |
| Migrations | `supabase db reset` from empty | All 15 files applied; 15 rows in `supabase_migrations.schema_migrations` |
| RLS coverage | catalog query on `public` | 8 of 8 tables have RLS: `account_batches`, `audit_logs`, `classroom_enrollments`, `classroom_teachers`, `classrooms`, `profiles`, `student_accounts`, `students`. Policies are SELECT-only (0 write policies). `account_batches` and `audit_logs` have none (service role only) |
| Views | catalog query | `v_students_safe`, `v_classroom_activity_safe` are `security_invoker=true` |
| Function privileges | catalog query | `fn_transfer_enrollment`, `fn_revoke_user_sessions`, `fn_student_login_begin/_fail`: no `anon`/`authenticated` EXECUTE. Two helpers (`fn_generate_classroom_code`, `fn_classrooms_code_immutable`) are executable by them: harmless (random code generator, trigger function) |
| SECURITY DEFINER | catalog query | `search_path` pinned on both |
| DB tests | `supabase test db` | PASS, 7 files |
| App tests | `vitest run` | **78/78**, 6 files (authorization matrix, lockout race, forced reset, opaque email, session refresh, password reissue, page guards) |
| Mutation checks | break the fix, rerun | Tests failed for: lockout, forced reset, session middleware, enrollment check, session-revocation function, archive permission |
| Key exposure | grep `.next/static` for the service key | 0 files. Key referenced only in `src/lib/env.ts` and `src/lib/supabase/admin.ts` |
| Dependency audit | `pnpm audit --prod` | 4 advisories (2 high, 2 moderate), **all one `postcss` 8.4.31 copy bundled inside Next**; build-time tool needing attacker-controlled CSS/source maps, which the app does not accept |
| Docs vs code | grep constants, labels, messages, files | All checked claims match |
| Admin password change ends old sessions | script | Old refresh token rejected ("Refresh Token Not Found") |
| Server log | dev server during the walkthrough | 0 errors |
| Audit | query after the walkthrough | All contract actions present; 0 rows containing password text |

### Teacher workflow (browser, current head)

Sign in → create classroom (code generated, read-only) → create one student (username and one-time password shown, enrolled) → import a 3-row CSV (preview, commit token, 3/3 created, credential download offered) → roster shows all 4 students → reissue a password from the roster (shown once) → archive as owner (edit form locks).

### Student workflow (browser, current head)

First login with the temporary password lands on `/student/set-password`; opening `/student` directly bounces back; a 5-character password is refused with "비밀번호는 8자 이상이어야 합니다."; a valid password lands on `/student` showing name, grade and the classroom; sign-out works; 4 wrong passwords show the generic error, the 5th shows "5회 실패하여 15분간 잠겼습니다", and the **correct** password is then refused while locked; after a teacher reissue the student signs in with the new password, is forced to change it again, and after the classroom is archived sees "아직 등록된 학급이 없습니다."

### Measurements

| Item | Value |
|---|---|
| Provision + enroll, sequential | 294 ms/row local → 30 rows ≈ 9 s, 200 rows ≈ **59 s** |
| Provision + enroll, 4-way concurrency | 67 ms/row local → 200 rows ≈ 13 s |
| Auth rate limit | 170 rapid password sign-ins from one IP in 17 s were all answered `400` (none `429`): local limiting is not enforced; no inference possible for hosted |

## 2. Resolved during the pilot review cycle (history)

| Finding | Severity then | Fix | Pinned by |
|---|---|---|---|
| Student lockout bypassed by parallel requests (20 parallel → 20 password checks, stored count 2, no lock) | P0 | Atomic reserve-then-verify RPCs `fn_student_login_begin/_fail` | `student-auth-hardening.test.ts`, pgTAP `00006` |
| Forced password reset bypassable by opening `/student` | P0 | `requireStudentAreaPage()` redirect to set-password; fails closed | same test + `page-guards.test.ts` |
| Lockout bypassable through the public Auth API because the auth email was derived from the visible username | P0-class | Opaque `<128-bit id>@students.eduquest.invalid` | `synthetic-email.test.ts` |
| Sessions ended at first page load after token expiry (no refresh) | P1 | Session-refresh middleware | `session-refresh.test.ts` |
| Middleware silently ignored because it sat at the repo root while the app is in `src/app` | P1 (caught by live check) | Moved to `src/middleware.ts`; location pinned by test | `session-refresh.test.ts` |
| No way to recover a lost/forgotten student password | P1 | Teacher-initiated reissue (forces change, clears lock, revokes sessions, audited) | `password-reissue.test.ts`, pgTAP `00007` |
| `/teacher/sign-in` returned 500 (non-async exports in a `"use server"` file) | P1 | Constants un-exported | browser check |

## 3. P0 findings (open): none

No open finding in the current head meets the P0 bar (data exposure across users, authentication or lockout bypass, loss of the forced-reset rule). The product-level P0s above are fixed and regression-tested.

Condition attached: this holds only while the Auth settings in the hosted checklist (JWT lifetime > 90 s, refresh-token rotation on, reuse interval ≥ 10 s, signups off) are applied exactly. A wrong value does not expose data; it signs users out.

## 4. P1 findings (open): must be closed before real students

| # | Finding | Risk | Close by |
|---|---|---|---|
| P1-1 | **Hosted behaviour unverified:** per-IP auth rate limit (class login), `.invalid` email acceptance, host request limit, Auth settings, Security Advisor, password policy | First lesson fails or users are throttled | Staging smoke test S1–S15 (`04`), especially S4 and S9 |
| P1-2 | **Batch cap not implemented.** UI says 200; 200 rows ≈ 59 s locally, slower hosted; a timeout loses the one-time passwords | Credential loss, stuck `running` batch | Implement `01-batch-size-cap-plan.md` items 1–3 (and 4–6), or enforce ≤ 30 by process and measure on staging |
| P1-3 | **Lockfile untracked** (`pnpm-lock.yaml`), so deploys resolve versions again; 4 `postcss` advisories via Next | Non-reproducible build; scanner noise | Decide D3, commit the lockfile, upgrade Next or add an override |
| P1-4 | **Release hygiene:** docs commit unpushed; no PR, merge or tag | Deploying an unreviewed state | Push, review via PR, tag e.g. `m1-pilot-rc1` |
| P1-5 | **Recovery not rehearsed:** no backup restore drill, no alerting; staff bootstrap never run on a hosted project | Slow, error-prone incident response | Hosted checklist section 10; run the runbook on staging with the two-person rule |
| P1-6 | **Data-protection/consent sign-off (D6) not recorded**; no student delete/export feature | Cannot lawfully start or fulfil requests | School/PM decision; erasure by approved SQL until a feature exists |

## 5. P2 findings (open): accept and track

- Staff cannot change their own password in the app; recovery is Dashboard-only (D2).
- No bulk password reissue; no re-download of a credential sheet; no student suspend/delete screen.
- Account creation and enrollment are separate steps (failure is shown; fix from the roster). Batches are not resumable or retryable; stuck batches are cleaned with the monitoring query.
- Classroom owner cannot hand over ownership; add a co-teacher before leaving.
- Any teacher can list and add any student in the school (privacy by school, not by class).
- `school_id` is a bare UUID with no schools table; a typo silently isolates a user.
- Route guards are per page (static test enforces them); no centralised layout guard.
- Admin reads use the service role (no direct RLS policy for admin); `anon` holds default table privileges (blocked by RLS); two harmless helper functions are callable by `anon`.
- Audit writes are best-effort (failure does not block the action).
- In-app student password minimum is 8 characters (project policy is the backstop).
- Add-student panel loads up to 500 students and filters in the browser.
- Each protected navigation makes two Auth calls (middleware + page guard).
- UI walkthrough is manual (no browser E2E automation); tests are local-only by design and there is no CI.
- Lint: 2 warnings; `next lint` deprecated.
- Classrooms have no subject or grade; the student home shows the student's own grade.
- Batch preview does not check student numbers against the database, so duplicates surface at commit.
- Raw database text (constraint name) is shown for a duplicate student number.

## 6. Pilot constraints

Scope

- One school, 3–4 teachers, about 100 students, 3–4 classes; fixed start and end dates; reviews at day 5 and day 14.
- Only students with recorded consent (D6). No real data in staging.

Operation

- Named on-call person for the first two weeks, with Dashboard and hosting access, able to reissue passwords on the spot.
- Run the daily monitoring queries (`04`, phase 7) during week 1; weekly backup check after.
- No deploys during school hours; no changes to JWT lifetime, refresh-token rotation or reuse interval during the pilot.
- Staff changes only through the runbook, two-person rule, logged.

Usage

- CSV imports of **at most 30 rows** until the cap is implemented and measured; larger classes use several files.
- Stagger class log-ins (about 25 per minute) until the rate limit is verified on staging.
- Credential sheets handed out in person or on screen, never by email or chat; teachers delete the CSV afterwards.
- Forgotten password or lockout: teacher reissues from the roster. An owner adds a co-teacher before leaving.

Stop rule

- Any wrong-student data exposure, lockout bypass, or unrecoverable credential loss pauses the pilot until reviewed.

## 7. Readiness criteria (all required to move from "Ready with Conditions" to "Ready")

| # | Criterion | Evidence required | Status |
|---|---|---|---|
| R1 | Code gates pass on the tagged commit: typecheck, lint, build (lists Middleware), pgTAP, vitest | Command output attached | Met on `9df58ab` (local) |
| R2 | Staging smoke test S1–S15 passes, including `.invalid` email (S4) and 30-student class login (S9) | Filled results table | **Open** |
| R3 | Batch cap implemented and its value chosen from a staging measurement | Code + measurement | **Open** |
| R4 | Lockfile committed; dependency advisories resolved or consciously accepted | Commit + decision note | **Open** |
| R5 | Docs pushed, branch merged through a reviewed PR, release tagged | PR link, tag | **Open** |
| R6 | Hosted checklist (`03`) complete on staging and production, including Security Advisor | Filled checklist | **Open** |
| R7 | Backup restore drill completed; alert recipient set | Drill record | **Open** |
| R8 | Staff bootstrapped on production with the two-person rule; test accounts removed | Ops log | **Open** |
| R9 | Decisions D1–D6 recorded (host, staff recovery route, lockfile, scope, audit contract extension, consent) | Decision log | **Open** |
| R10 | On-call and support contacts named; teacher one-page guide issued | Names, document | **Open** |

## 8. What this review did not cover

Anything on a hosted project; behaviour under real load; an accessibility audit; legal and data-protection review (outside engineering).
