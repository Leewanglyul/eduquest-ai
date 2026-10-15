# 4. M1 pilot deployment checklist

Order matters. Do not skip a phase; sign each gate in the table at the end. Companion documents: `01-batch-size-cap-plan.md`, `02-staff-bootstrap-runbook.md`, `03-hosted-supabase-checklist.md`.

## Phase 0: decisions needed before anything else

| # | Decision | Owner | Why it blocks |
|---|---|---|---|
| D1 | App hosting platform and its **request-time limit** | Eng | Sets the batch cap (plan 01) |
| D2 | Staff password recovery route: Dashboard-only, or custom SMTP | Ops | Staff cannot change passwords in the app |
| D3 | Whether to commit a package lockfile | Eng | `pnpm-lock.yaml` is currently untracked, so a fresh install resolves versions again. Reproducible builds need it committed |
| D4 | Pilot scope: school, classes, number of students, dates, supervising adults | PM | Guardrails below |
| D5 | Accept the audit-contract extension `student.password_reissued` | PM | Added with the password reissue feature |
| D6 | Data-protection and consent sign-off for storing student names, numbers and grades | School / PM | Outside engineering; needed before real students |

## Phase 1: code gates (on the release commit)

Run on the exact commit that will be deployed (tag it, e.g. `m1-pilot-rc1`, after the branch is merged through a pull request).

```bash
pnpm install --frozen-lockfile   # only meaningful once D3 is decided
pnpm typecheck
pnpm build                        # the output must list "Middleware"
supabase start
supabase db reset                 # LOCAL ONLY
supabase test db                  # pgTAP
pnpm test:access                  # vitest, refuses to run against a non-local URL
```

All must pass. Last recorded result on the current head: typecheck clean, pgTAP PASS (7 files), vitest 77/77 plus 1 location test, build lists the middleware.

Housekeeping to settle before the tag: uncommitted `next-env.d.ts` noise and the untracked `pnpm-*` files; CRLF/LF warnings on commit (an optional `.gitattributes`).

## Phase 2: staging environment

1. Create the staging Supabase project and apply section 1–5, 7–8, 10 of `03-hosted-supabase-checklist.md`.
2. `supabase link` → `supabase db push`. Verify 15 migrations and the catalog checks (checklist section 9).
3. Deploy the app to a staging URL with the three environment variables from the staging project.
4. Bootstrap one admin and one teacher (`02-staff-bootstrap-runbook.md`) using the staging project.
5. Confirm the build log shows "Middleware" and that the client bundle does not contain the service key.

## Phase 3: staging smoke test (the real acceptance test)

Use two browsers/profiles (teacher, student). Record result and time for each step.

| # | Step | Expected |
|---|---|---|
| S1 | Teacher signs in at `/teacher/sign-in` | Lands on `/teacher` |
| S2 | `/teacher` as a signed-out visitor, and `/student` as the teacher | Redirected to the matching sign-in |
| S3 | Create a classroom, note the code, rename it, copy the code | Works; code cannot be edited |
| S4 | Create one student with "학생 계정 만들기" | Account created and enrolled; username shown once. **This proves the `.invalid` email is accepted (checklist 3.6)** |
| S5 | Import a CSV of exactly the cap (see plan 01) | Preview shows rows; commit succeeds; credential CSV downloads; all rows on the roster |
| S5b | Import cap + 1 rows | Refused at preview, nothing created |
| S6 | Student first login with the temporary password | Forced to `/student/set-password`; opening `/student` directly bounces back; a too-short password shows a clear message |
| S7 | Student sets a new password | Lands on `/student`; sees only the active classroom |
| S8 | Lockout: 5 wrong passwords for one student | 5th shows "5회 실패하여 15분간 잠겼습니다"; correct password refused while locked |
| S8b | Fire the 5 wrong attempts as a burst (parallel) | Still locks, never more than 5 password checks (see `tests/access/student-auth-hardening.test.ts`) |
| S9 | **Class login test:** 30 students (or scripted equivalent) sign in within one minute | No rate-limit errors. If errors appear, fix checklist 6.1 before going on |
| S10 | Teacher reissues a student password | Shown once; old password and sessions dead; student is forced to change it |
| S11 | Archive a classroom as owner; a co-teacher tries the same | Owner succeeds; co-teacher refused; student no longer sees it |
| S12 | Add/remove/transfer a student; co-teacher of only one side tries a transfer | Allowed/refused as designed |
| S13 | **Session soak:** set staging JWT expiry to 300 s temporarily; keep a teacher signed in 20+ minutes with normal page loads, one idle gap longer than 300 s | Never bounced to sign-in. **Restore 3600 s afterwards** |
| S14 | Sign out (teacher and student) | Back to the right sign-in page |
| S15 | Query the audit log | Each step above produced its event; no password text anywhere |

Any failure → fix, redeploy to staging, rerun the whole table.

## Phase 4: production

1. Create the production project; apply the hosted checklist; do **not** copy staging data.
2. `supabase link` (prod ref) → `supabase db push`; verify 15 migrations; no seed.
3. Deploy the tagged commit with production variables.
4. Bootstrap admin(s) and teachers via the runbook (two-person rule, ops log).
5. Repeat S1, S4, S6, S7, S8, S10 on production with **test accounts**, then remove the test classroom, test students and test staff with a reviewed SQL clean-up approved by two people (record it in the ops log).
6. Take a manual backup / confirm the first automatic one.

## Phase 5: go-live day

- A named on-call person for the whole first week, with Dashboard and hosting access.
- Teachers get: sign-in URL, their account, a one-page guide (create class → import/add students → hand out credential sheets → what to do when a student forgets a password).
- Credential sheets are **paper or a screen share**, never email/chat. Teachers delete the CSV after distribution.
- First lesson supervised by someone who can reissue passwords on the spot.

## Phase 6: support playbook

| Report | Action |
|---|---|
| "Student forgot password" | Teacher → classroom → 학생 명단 관리 → 비밀번호 재발급; give the new temporary password in person |
| "Student locked out" | Waits 15 minutes, or the teacher reissues (clears the lock) |
| "Lost the credential sheet" | Reissue, same as above (the old password stops working) |
| "Import timed out / error mid-batch" | Teacher checks the roster; accounts that exist are listed there; reissue passwords for them; operator marks the stuck batch (query below) |
| "Teacher forgot password" | Operator sets a new one in the Dashboard (runbook F) |
| "Teacher left school" | Suspend (runbook F); add another co-teacher first if classes must continue |
| "Student sees no class" | Roster missing (add student), classroom archived (owner unarchives), or student signed in as a different account |
| "Everyone is signed out suddenly" | Check the JWT expiry / reuse-interval settings were not changed (checklist 4) and that the deployment still lists the middleware |

## Phase 7: monitoring queries (SQL editor, daily during the pilot)

All were syntax-checked on the local database.

```sql
-- Batches that never finished (timeout/crash). Mark stale ones expired.
select id, status, created_at from public.account_batches
where status in ('running','previewed') and created_at < now() - interval '15 minutes' order by created_at;
update public.account_batches set status = 'expired'
where status = 'running' and created_at < now() - interval '30 minutes';

-- Currently locked student accounts
select username, failed_attempts, locked_until from public.student_accounts
where locked_until > now() order by locked_until;

-- Students who have never completed the first-login password change
select count(*) from public.student_accounts where must_change_password;

-- Students with no active classroom (provisioned but not enrolled)
select s.student_no, p.display_name from public.students s
join public.profiles p on p.id = s.profile_id
where not exists (select 1 from public.classroom_enrollments e where e.student_id = s.id and e.status = 'active') order by 1;

-- Activity in the last day
select action, count(*) from public.audit_logs where created_at > now() - interval '1 day' group by 1 order by 2 desc;

-- Staff overview and anyone who can authenticate but has no profile
select p.display_name, p.role, p.status, u.email, u.last_sign_in_at from public.profiles p
join auth.users u on u.id = p.id where p.role in ('teacher','admin') order by p.role, p.display_name;
select u.email from auth.users u left join public.profiles p on p.id = u.id where p.id is null;
```

Also watch in the Dashboard: Auth logs for 429 responses (rate limits), and API error rate.

## Phase 8: rollback

- **Application:** redeploy the previous tag. Migrations are additive, so an earlier build normally still runs on the newer schema, but prove that on staging before relying on it. There are no down-migrations: undoing a schema change means restoring from backup.
- **Data:** restore from backup into a scratch project first; decide with the school before touching production data.
- **Accounts:** to stop access immediately, suspend profiles (runbook F) or disable the app route; students cannot self-register.
- Never roll back by `db reset`.

## Known limitations to tell the pilot teachers (accepted for M1)

- Staff cannot change their own password in the app; students can only change it during first login.
- No bulk password reissue, no re-download of a credential sheet, no student deletion or suspension screen.
- Batch import is capped (plan 01) and a failed or interrupted batch cannot be retried; fix by checking the roster.
- Creating an account and enrolling it are two steps; an enrollment failure is shown and the student can be added from the roster.
- Any teacher can see (and add) every student in the school from the add-student panel.
- Classrooms have a name and code only (no subject or grade).
- An owner who leaves cannot hand over the classroom; add a co-teacher first.
- Audit writes are best-effort: a failed audit write does not block the action.
- Admin reads use the service role (no direct row-level policy for admin).

## Pilot guardrails (set in D4; suggested defaults)

- One school, a small number of classes, supervised lessons, a fixed start and end date.
- Batch size at the cap; no more than a few new classes per day while the on-call is learning the system.
- Stop condition: any incident involving wrong-student data visibility, a lockout bypass, or unrecoverable credential loss pauses the pilot until reviewed.

## Sign-off

| Gate | Evidence | Signed by | Date |
|---|---|---|---|
| Phase 0 decisions D1–D6 recorded | | | |
| Phase 1 code gates passed on the tagged commit | command output | | |
| Hosted checklist complete (staging) | filled table | | |
| Smoke test S1–S15 passed (staging) | recorded results | | |
| Batch cap chosen from staging measurement | numbers + chosen cap | | |
| Production bootstrap done, test accounts removed | ops log | | |
| On-call and support contacts named | | | |
| **GO for pilot** | | | |
