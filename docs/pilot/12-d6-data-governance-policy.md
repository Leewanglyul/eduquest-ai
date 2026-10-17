# 12. D6 data governance policy (draft for approval)

Status: **DRAFT. Not in force until the approval table in §0 is signed.** Closes decision D6 and required item R10 only after signing and after the erasure procedure (§3) has been rehearsed on staging (ST-56 / VER-43).

This is an operating policy for the M1 pilot. It is not legal advice. The school's data-protection contact (개인정보 보호책임자) must review §1 against the school's own privacy notice and the applicable law before signing.

## 0. Approval and fixed decisions

| Decision | Value | Source |
|---|---|---|
| Retention of pilot data | **30 days after the pilot end date**, then deleted | Decided by the PM |
| Approver of any deletion | **교무기획팀장** | Decided by the PM |
| Student data removal method | Delete the student's `auth.users` row; the database cascades | Decided by the PM |
| Audit logs | Kept after deletion, **in de-identified form** (§3.3) | Decided by the PM |
| Pilot end date | ____-__-__ (fill in; the deletion deadline is this date + 30 days) | To be set (D4) |
| Data region | Seoul (record the actual Supabase region here: ________) | `10` risk G5 |

| Role | Name | Signature | Date |
|---|---|---|---|
| 교무기획팀장 (deletion approver) | | | |
| School data-protection contact | | | |
| PM | | | |
| Ops (executes deletions) | | | |
| Second person (checks deletions) | | | |

## 0.1 What the system stores (checked against the migrations)

| Data | Where | Personal? | Removed by deleting the auth user? |
|---|---|---|---|
| Name (`display_name`), role, status | `public.profiles` | Yes | Yes (`profiles.id` → `auth.users` ON DELETE CASCADE) |
| Student number, grade | `public.students` | Yes | Yes (cascade from `profiles`) |
| Username, synthetic email, lockout counters | `public.student_accounts`, `auth.users` | Yes: the username is derived from the student number | Yes |
| Classroom membership | `public.classroom_enrollments` | Yes (links a student to a class) | Yes (cascade from `students`) |
| Sign-in sessions and refresh tokens | `auth.sessions`, `auth.refresh_tokens` | Yes | Yes |
| Audit rows | `public.audit_logs` | `metadata` holds `studentId` and, for `student.provisioned`, the **`username`**; `actor_id` is the acting teacher | **No.** Kept; see §3.3 |
| Batch records | `public.account_batches` | No names or numbers: only counts, hashes and times | Deleted with the acting teacher's profile (cascade) |
| Temporary passwords | Nowhere | n/a | Never stored; shown once to the teacher |
| Backups | Supabase backups | Yes, until they expire | **No.** See §3.5 |

Staff (teacher and admin) accounts hold a name and a real email address in `profiles` and `auth.users`.

## 1. Consent policy

**Purpose.** Student names, student numbers and grades are used only to create sign-in accounts and class rosters for the EduQuest AI pilot, and to let teachers manage them.

**Who may be in the pilot.** Only students whose consent is on record before their account is created. No real student data goes into the staging project (`07`).

**Consent route.**
1. The school sends the notice in §1.1 to each student. Where the student is under the age at which the law requires a guardian's consent, the notice goes to the guardian and the guardian's consent is the one recorded. The school's data-protection contact confirms the age rule and the wording.
2. The class teacher keeps the signed or electronic consent list, **outside** EduQuest AI. The system does not store consent.
3. A teacher may create an account (single or CSV import) only for a student on that list. Import files contain only 이름, 학번, 학년.
4. A student, or the guardian, may withdraw consent at any time. Withdrawal is treated as an erasure request (§3) for that student.

**What is not collected.** No grades or marks of coursework, no photos, no contact details of students, no free-text profiles. If a later release adds any of these, this policy must be reviewed first.

**Staff.** Teachers and admins consent to hold an account (name and email) when they are bootstrapped (`02`).

### 1.1 Notice text (Korean; for the school to adapt and issue)

> **EduQuest AI 시범 운영 개인정보 수집·이용 안내**
>
> - 수집 항목: 이름, 학번, 학년
> - 이용 목적: 시범 운영 중 학습 계정 생성 및 학급 명단 관리
> - 보관 기간: 시범 운영 종료일로부터 30일 후 삭제
> - 삭제 요청: 학생 또는 보호자는 언제든지 삭제를 요청할 수 있으며, 교무기획팀장의 승인 후 삭제합니다.
> - 동의하지 않을 권리가 있으며, 동의하지 않아도 불이익은 없습니다.
> - 문의: ________ (개인정보 보호책임자)

## 2. Retention policy

| Item | Rule |
|---|---|
| Student personal data (profile, student record, account, enrollments, sessions) | Kept while the pilot runs. **Deleted no later than 30 days after the pilot end date** (§3.4) |
| Teacher and admin accounts | Suspended on the pilot end date (§4). Deleted in the same deletion run, after the students (§3.4), unless the PM records a reason to keep a named account |
| Audit logs | Kept after student deletion in the de-identified form of §3.3. Retention period of the de-identified logs: ________ (PM to set; proposed: 1 year) |
| Ops erasure ledger (§3.2) | Kept for the life of the audit logs; contains no names or usernames |
| Supabase backups | Follow the project plan's backup retention (record it: ________ days). Deleted data can still exist in a backup until it expires |
| Auth and API logs | Follow the plan's log retention (record it: ________). The app logs only status, error name and code for sign-in problems, never usernames |

**Early deletion.** Any student may be deleted earlier under §3. Nothing in the pilot may keep a student's data beyond the date above.

**Extension.** Only the 교무기획팀장 can approve keeping data past the 30 days, in writing, with a new date.

## 3. Student erasure procedure

Applies to: a single student (withdrawal of consent, a request, a mistaken account) and the end-of-pilot deletion.

### 3.1 Request and approval

1. **Request.** The student, the guardian or the class teacher gives the request to the 교무기획팀장. Record the date, who asked, and a case number (no names in the ops log).
2. **Approval.** Only the **교무기획팀장** approves, in writing. No deletion is run without an approval reference.
3. **Execution.** Ops runs §3.3 with a second person present (the two-person rule from `02`). Staging first, as ST-56, before the first production deletion.
4. **Confirmation.** The 교무기획팀장 is told the deletion is done and that backups will age out (§3.5).

### 3.2 Erasure ledger (kept by Ops, outside the database)

One row per deleted student: case number, `student_id` (the UUID; it no longer points to anything after deletion), date deleted, approval reference, who ran it, who checked it. **No name, student number or username.**

### 3.3 Run (single student)

Run in the Supabase SQL editor as the project owner, in one transaction. Set `<username>` from the roster or the credential sheet.

```sql
begin;

-- 1. Identify the student and write the student_id into the ledger.
select p.id as auth_user_id, s.id as student_id, sa.id as account_id
from public.student_accounts sa
join public.students s on s.id = sa.student_id
join public.profiles p on p.id = s.profile_id
where sa.username = '<username>';
-- Expect exactly one row. If not exactly one, ROLLBACK and stop.

-- 2. De-identify the audit rows BEFORE the delete: remove the username (it is derived from the
--    student number). Other fields are opaque UUIDs that point to nothing after step 3.
update public.audit_logs
set metadata = metadata - 'username'
where metadata->>'username' = '<username>';
-- Expect the count of provisioning rows for this student (normally 1).

-- 3. Delete the auth user. Cascades to profile, student, account, enrollments, sessions.
delete from auth.users where id = '<auth_user_id>';
-- Expect DELETE 1.

-- 4. Verify, still inside the transaction.
select
  (select count(*) from public.profiles           where id         = '<auth_user_id>') as profiles,
  (select count(*) from public.students           where id         = '<student_id>')   as students,
  (select count(*) from public.student_accounts   where student_id = '<student_id>')   as accounts,
  (select count(*) from public.classroom_enrollments where student_id = '<student_id>') as enrollments,
  (select count(*) from auth.users                where id         = '<auth_user_id>') as auth_users,
  (select count(*) from public.audit_logs         where metadata->>'username' = '<username>') as audit_with_username;
-- Expect 0 in every column. If any is not 0, ROLLBACK and escalate.

commit;
```

**What remains, by design.** Audit rows keep their action, time, acting teacher, classroom and opaque UUIDs (`studentId`, `resource_id`). With the student record gone, these identify nobody on their own.

Rehearse this on staging as **ST-56** (create a student, enroll them, run §3.3, check the counts). Record the output as VER-43.

### 3.4 Run (end of pilot, all students, then staff)

Only after the 교무기획팀장 has approved the bulk deletion, on or before the pilot end date + 30 days. Take a manual backup note first (§3.5). `<school_id>` is the pilot school id.

```sql
begin;

-- Students: de-identify the audit rows, then delete the auth users (cascades).
update public.audit_logs set metadata = metadata - 'username' where metadata ? 'username';

delete from auth.users
where id in (select id from public.profiles where role = 'student' and school_id = '<school_id>');

-- Classrooms must go before their owners: classrooms.owner_id is ON DELETE RESTRICT.
-- (Deleting a classroom cascades to its enrollments and co-teacher rows.)
delete from public.classrooms where school_id = '<school_id>';

-- Staff: teachers (their account_batches cascade). Admins only if the PM has approved it.
delete from auth.users
where id in (select id from public.profiles where role = 'teacher' and school_id = '<school_id>');

-- Verify: all expect 0.
select
  (select count(*) from public.profiles    where school_id = '<school_id>' and role in ('student','teacher')) as profiles,
  (select count(*) from public.students    where school_id = '<school_id>') as students,
  (select count(*) from public.classrooms  where school_id = '<school_id>') as classrooms,
  (select count(*) from public.audit_logs  where metadata ? 'username') as audit_with_username;

commit;
```

Admin accounts are not removed here unless the PM records it, because deleting the last admin removes the ability to operate the project.

### 3.5 Backups

Deleting rows does not remove them from existing Supabase backups. Therefore:
- Tell the requester that copies in backups age out under the plan's retention (record the number of days in §2).
- **If a backup or point-in-time recovery is ever restored, re-run the deletions** listed in the erasure ledger (by `student_id` / auth user id) before the restored database is used.
- Do not use a backup to recover a deleted student.

## 4. Teacher suspension procedure

A suspended teacher cannot sign in, and their existing sessions end at once. Nothing is deleted. Students, classrooms and enrollments stay intact.

**When.** A teacher leaves the pilot, a credential is lost or stolen, a teacher account is misused, or the pilot ends (all staff).

**Who.** Ops, on the written instruction of the PM or the 교무기획팀장. Deletion of a teacher is a separate step (§3.4) and cannot happen while they own classrooms.

### 4.1 Suspend

```sql
-- 1. Find the account (expect exactly one row).
select u.id, p.display_name, p.role, p.status
from auth.users u join public.profiles p on p.id = u.id
where u.email = '<email>';

-- 2. Block access.
update public.profiles set status = 'suspended'
where id = (select id from auth.users where email = '<email>');

-- 3. End every session now (returns the number of sessions removed).
select public.fn_revoke_user_sessions((select id from auth.users where email = '<email>'));
```

### 4.2 Verify

- The teacher is refused at `/teacher/sign-in`, and an already-open session is bounced (ST-29 / VER-41).
- `select status from public.profiles where id = '<id>';` → `suspended`.
- Their classrooms and students are untouched. Students can still sign in.

### 4.3 After suspending

- **Classroom continuity.** Ownership transfer is not in M1. A suspended owner's classrooms stay visible to co-teachers; a class with no co-teacher must be managed by an admin, or the owner is reactivated briefly. Record who looks after each affected class.
- **Student credentials.** If the teacher had printed credential sheets, ask for them to be returned or destroyed. Reissue passwords for affected students (`student.password_reissued` is audited).
- **Record** date, reason, approver and who ran it in the ops log.

### 4.4 Reactivate

```sql
update public.profiles set status = 'active'
where id = (select id from auth.users where email = '<email>');
```

The teacher signs in again with their existing password (suspension does not change it). If the credential was compromised, reset the password in the Dashboard first.

### 4.5 Emergency stop (all users)

For an incident, use the emergency stop and resume steps in `08` §F. They suspend teachers and students by role and delete all sessions, without deleting data.

## 5. Assumptions to confirm before signing

| # | Assumption | Owner |
|---|---|---|
| 1 | The guardian-consent age rule and the notice wording in §1.1 | School data-protection contact |
| 2 | The pilot end date, which sets the 30-day deletion deadline | PM (D4) |
| 3 | Retention of the de-identified audit logs (proposed 1 year) | PM |
| 4 | Backup and log retention in days for the chosen plan | Ops |
| 5 | Admin accounts: kept or deleted at the end | PM |
| 6 | Response time for an erasure request (not decided here; proposed: approve within 5 working days) | 교무기획팀장 |

## 6. Closure evidence for D6 / R10

- ☐ §0 table signed by all five roles
- ☐ §5 assumptions answered
- ☐ ST-56 / VER-43 run on staging with §3.3; output attached
- ☐ Consent list process in place with the class teachers
- ☐ Erasure ledger created (empty)
- ☐ Ops know §4 (a dry run of suspend and reactivate on a test teacher: ST-29)
