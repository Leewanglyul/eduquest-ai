# 12. D6 data governance policy

Status: **final text, awaiting signature.** Not in force until the sign-off in `13-d6-signoff.md` is signed. Closes decision D6 and required item R10 only after signing and after the erasure procedure (§3) has been rehearsed on staging (ST-56 / VER-43). Revised for the M2 word-set (CSV content) feature: new rows in §0.1, a rule in §1, a retention row in §2, deletion order in §3.4, set transfer in §4.3 and assumptions 7-8 in §5.

Parts: §1 consent policy · §2 retention policy · §3 erasure policy and procedure · §4 teacher suspension policy and procedure.

This is an operating policy for the M1 pilot. It is not legal advice. The school's data-protection contact (개인정보 보호책임자) must review §1 against the school's own privacy notice and the applicable law before signing.

## 0. Approval and fixed decisions

| Decision | Value | Source |
|---|---|---|
| Retention of pilot data | **30 days after the pilot end date**, then deleted | Decided by the PM |
| Approver of any deletion | **교무기획팀장** | Decided by the PM |
| Student data removal method | Delete the student's `auth.users` row; the database cascades | Decided by the PM |
| Audit logs | Kept after deletion, **in de-identified form** (§3.3), for **1 year** | Decided by the PM |
| Deletion SLA | A deletion request is **completed within 7 days** of being received, including approval (§3.1) | Decided by the PM |
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
| Word sets and entries (M2) | `public.content_sets`, `public.content_entries` | Intended no: vocabulary and clues written by teachers. It is free text, so a teacher could type personal data by mistake; the import and edit pages tell them not to (§1) | Not touched by deleting a student. Removed with the **set**: a teacher who owns sets cannot be deleted until the sets are transferred (§4.3) or deleted (§3.4) |
| Content import records (M2) | `public.content_import_batches` | No content: counts, hashes, sizes and times. The uploaded CSV file is not stored anywhere | Deleted with the acting teacher's profile (cascade) |
| Content audit rows (M2) | `public.audit_logs`, actions `content_set.*`, `content_entry.*` | No terms or definitions: only ids, counts and hashes | Kept 1 year like the other audit rows; nothing to de-identify |
| Temporary passwords | Nowhere | n/a | Never stored; shown once to the teacher |
| Backups | Supabase backups | Yes, until they expire | **No.** See §3.5 |

Staff (teacher and admin) accounts hold a name and a real email address in `profiles` and `auth.users`.

## 1. Consent policy

**Scope and assumptions.** This is an **internal educational pilot in a single school**. Accounts are created only by teachers (single or CSV import); there is no public self-registration (sign-up is off in Supabase Auth). **No guardian consent is required or collected.** If any of these assumptions changes (a second school, self-registration, use outside the school's own teaching), this policy must be reviewed and re-signed before the change.

**Purpose.** Student names, student numbers and grades are used only to create sign-in accounts and class rosters for the EduQuest AI pilot, and to let teachers manage them.

**Who may be in the pilot.** Only students of the pilot classes who have been given the notice in §1.1 and whose acknowledgement is on record before their account is created. No real student data goes into the staging project (`07`).

**Consent route.**
1. The class teacher gives the notice in §1.1 to each student of the pilot class. The school's data-protection contact approves the wording.
2. The class teacher keeps the acknowledgement list (signed or electronic), **outside** EduQuest AI. The system does not store it.
3. A teacher may create an account (single or CSV import) only for a student on that list. Import files contain only 이름, 학번, 학년.
4. A student may withdraw at any time and may ask for deletion at any time. Withdrawal is treated as an erasure request (§3) for that student.

**What is not collected.** No grades or marks of coursework, no photos, no contact details of students, no free-text profiles. If a later release adds any of these, this policy must be reviewed first.

**Word lists (M2).** Teachers may upload vocabulary lists (CSV `term,definition`) that later feed quizzes and crosswords. A list must not contain the name, student number or any other personal data of a student, a colleague or anyone else. The upload and edit pages say so in Korean ("학생 이름, 학번 등 개인정보는 넣지 마세요."), and the teacher who uploads is responsible for the content. If personal data is found in a list, it is handled like an erasure request: the whole set is deleted (§3.4 shows the statement), archived entries included, and the ledger records the case.

**Staff.** Teachers and admins consent to hold an account (name and email) when they are bootstrapped (`02`).

### 1.1 Notice text (Korean; for the school to adapt and issue)

> **EduQuest AI 시범 운영 개인정보 수집·이용 안내**
>
> - 수집 항목: 이름, 학번, 학년
> - 이용 목적: 시범 운영 중 학습 계정 생성 및 학급 명단 관리
> - 보관 기간: 시범 운영 종료일로부터 30일 후 삭제
> - 삭제 요청: 학생은 언제든지 삭제를 요청할 수 있으며, 교무기획팀장의 승인 후 7일 이내에 삭제합니다.
> - 동의하지 않을 권리가 있으며, 동의하지 않아도 불이익은 없습니다.
> - 문의: ________ (개인정보 보호책임자)

## 2. Retention policy

| Item | Rule |
|---|---|
| Student personal data (profile, student record, account, enrollments, sessions) | Kept while the pilot runs. **Deleted no later than 30 days after the pilot end date** (§3.4) |
| Teacher word sets and entries (M2) | Kept while the pilot runs. Replaced and archived entries are kept too (archive only, nothing is purged). **Deleted in the end-of-pilot run, before the teachers** (§3.4). Teachers can download their sets before then |
| Teacher and admin accounts | Suspended on the pilot end date (§4). Deleted in the same deletion run, after the students (§3.4), unless the PM records a reason to keep a named account |
| Audit logs | Kept after student deletion in the de-identified form of §3.3 for **1 year** from the log row's creation date. After that they are deleted: `delete from public.audit_logs where created_at < now() - interval '1 year';` (run by Ops with a second person, logged) |
| Ops erasure ledger (§3.2) | Kept for the life of the audit logs; contains no names or usernames |
| Supabase backups | Follow the project plan's backup retention (record it: ________ days). Deleted data can still exist in a backup until it expires |
| Auth and API logs | Follow the plan's log retention (record it: ________). The app logs only status, error name and code for sign-in problems, never usernames |

**Early deletion.** Any student may be deleted earlier under §3. Nothing in the pilot may keep a student's data beyond the date above.

**Extension.** Only the 교무기획팀장 can approve keeping data past the 30 days, in writing, with a new date.

## 3. Student erasure procedure

Applies to: a single student (withdrawal of consent, a request, a mistaken account) and the end-of-pilot deletion.

### 3.1 Request and approval

**SLA: 7 days.** The deletion is completed and confirmed within **7 calendar days of the request being received**. Approval is part of that time.

1. **Request (day 0).** The student, or the class teacher on the student's behalf, gives the request to the 교무기획팀장. Record the date, who asked, and a case number (no names in the ops log).
2. **Approval (by day 3).** Only the **교무기획팀장** approves, in writing. No deletion is run without an approval reference. If the 교무기획팀장 is unavailable, the request waits for them or for a deputy they have named in writing; nobody else may approve.
3. **Execution (by day 6).** Ops runs §3.3 with a second person present (the two-person rule from `02`). Staging first, as ST-56, before the first production deletion.
4. **Confirmation (by day 7).** The requester and the 교무기획팀장 are told the deletion is done and that backups will age out (§3.5). A missed deadline is recorded in the ledger with the reason.

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

-- Word sets (M2): content_sets.owner_id is ON DELETE RESTRICT, so the sets go before their owners.
-- Deleting a set cascades to its entries; content_import_batches keep only counts and lose set_id.
delete from public.content_sets where school_id = '<school_id>';

-- Staff: teachers (their account_batches cascade). Admins only if the PM has approved it.
delete from auth.users
where id in (select id from public.profiles where role = 'teacher' and school_id = '<school_id>');

-- Verify: all expect 0.
select
  (select count(*) from public.profiles    where school_id = '<school_id>' and role in ('student','teacher')) as profiles,
  (select count(*) from public.students    where school_id = '<school_id>') as students,
  (select count(*) from public.classrooms  where school_id = '<school_id>') as classrooms,
  (select count(*) from public.content_sets where school_id = '<school_id>') as content_sets,
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
- **Word sets (M2).** A teacher who owns word sets cannot be deleted: the database refuses until the sets are transferred. Transfer all sets of the leaving teacher to another active teacher of the same school (two-person rule, approval by the PM). Classroom owners and co-teachers of a linked classroom can already read and manage a linked set; an archived classroom's sets are read-only.

  ```sql
  begin;
  with moved as (
    update public.content_sets
    set owner_id = '<new_owner_id>'
    where owner_id = '<old_owner_id>' and school_id = '<school_id>'
    returning id, classroom_id
  )
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, classroom_id, metadata)
  select null, 'content_set.updated', 'content_set', id, classroom_id,
         jsonb_build_object('fields', jsonb_build_array('owner_id'), 'transferredTo', '<new_owner_id>')
  from moved;
  -- Expect one audit row per set. A unique violation means the new owner already has a live set with the
  -- same title: rename one of them first and repeat.
  select count(*) as still_owned from public.content_sets where owner_id = '<old_owner_id>';  -- expect 0
  commit;
  ```
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
| 1 | The notice wording in §1.1 (no guardian consent: internal, teacher-created, single-school pilot) | School data-protection contact |
| 2 | The pilot end date, which sets the 30-day deletion deadline | PM (D4) |
| 3 | ~~Retention of the de-identified audit logs~~ **Decided: 1 year** | PM |
| 4 | Backup and log retention in days for the chosen plan | Ops |
| 5 | Admin accounts: kept or deleted at the end | PM |
| 6 | ~~Response time for an erasure request~~ **Decided: 7 days** (calendar days, from receipt, approval included; the 3/6/7-day split in §3.1 is a working guide) | 교무기획팀장 |
| 7 | Word lists (M2) contain no personal data of students; teachers are told on the import and edit pages (§1) | School data-protection contact |
| 8 | Teachers download the word sets they want to keep before the end-of-pilot run (§3.4) | PM |

## 6. Closure evidence for D6 / R10

- ☐ §0 table signed by all five roles
- ☐ §5 assumptions 1, 2, 4, 5, 7 and 8 answered (3 and 6 are decided)
- ☐ ST-56 / VER-43 run on staging with §3.3; output attached
- ☐ Word sets (M2) rehearsed on staging: create a set, try to delete its owner (refused), transfer it with §4.3, then run the §3.4 statements; `content_sets` count is 0
- ☐ Consent list process in place with the class teachers
- ☐ Erasure ledger created (empty)
- ☐ Ops know §4 (a dry run of suspend and reactivate on a test teacher: ST-29)
