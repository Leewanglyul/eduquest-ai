# 2. Teacher / admin bootstrap runbook

Audience: the operator who sets up the pilot. Applies to **hosted** Supabase. Every SQL statement below was dry-run on the local stack (see "Verified" notes); the Dashboard clicks could only be checked on staging.

## How the app decides who is staff

- A staff member is **two rows**: a Supabase Auth user (email + password) and a `public.profiles` row whose `id` equals the auth user id.
- The app reads the role **only from `profiles.role`** (`teacher` or `admin`), never from auth metadata. Status must be `active`.
- `profiles.school_id` is a bare UUID: there is **no schools table**. Everyone in the pilot school must carry the **same** `school_id`. Different values = isolated schools: teachers with different values cannot see each other's classrooms or co-teach.
- Students are created inside the app by teachers and inherit the teacher's `school_id`.
- There is **no in-app screen** to create staff or to change a staff password. That is what this runbook is for.

## Rules

1. Never run `supabase db reset` or `seed.sql` against a hosted project. `seed.sql` creates `teacher@example.com` with a known password.
2. The service-role / secret key never goes into a browser, a chat, a ticket or a `NEXT_PUBLIC_` variable.
3. Do bootstrap with two people (one acts, one checks), and write every change in the ops log.
4. Do everything on **staging first**, then repeat on production.

## A. One-time: choose the pilot school id

In the Dashboard SQL editor:

```sql
select gen_random_uuid() as pilot_school_id;
```

Copy the value into the secure ops notes as `PILOT_SCHOOL_ID`. Do not generate a second one. (Verified locally.)

## B. Create the first admin

1. Dashboard → **Authentication → Users → Add user → Create new user**.
   - Email: the admin's real address. Password: 16+ random characters.
   - **Tick "Auto Confirm User"**, otherwise sign-in is refused.
2. In the SQL editor (replace the three placeholders):

```sql
insert into public.profiles (id, school_id, role, display_name, status)
select u.id, '<PILOT_SCHOOL_ID>'::uuid, 'admin', '<표시 이름>', 'active'
from auth.users u
where u.email = '<admin email>';
```

Expect `INSERT 0 1`. `INSERT 0 0` means the email was mistyped. There is intentionally **no** `on conflict`: running it twice fails loudly instead of silently changing a role. (Verified locally, including the duplicate error.)

## C. Create each teacher

Same as B with `role = 'teacher'`:

```sql
insert into public.profiles (id, school_id, role, display_name, status)
select u.id, '<PILOT_SCHOOL_ID>'::uuid, 'teacher', '<표시 이름>', 'active'
from auth.users u
where u.email = '<teacher email>';
```

Role differences: **teacher** manages classrooms they own or co-teach. **admin** can act on every classroom in the school (including archive/unarchive and co-teacher management) but is school-scoped, not global. Give admin to as few people as possible.

## D. Verify (every time)

```sql
select p.display_name, p.role, p.status, u.email,
       (u.email_confirmed_at is not null) as confirmed, u.last_sign_in_at
from public.profiles p join auth.users u on u.id = p.id
where p.role in ('teacher','admin')
order by p.role, p.display_name;
```

All rows `active` and `confirmed = true`. Then check isolation hygiene:

```sql
select count(distinct school_id) as school_ids from public.profiles;  -- expect 1 for a one-school pilot
select u.email from auth.users u left join public.profiles p on p.id = u.id where p.id is null;  -- auth users with no profile
```

The second query lists people who can authenticate but have no profile, so the app refuses them at sign-in with "교사 계정이 아닙니다…". Student auth users also have profiles, so this list should be empty in normal operation.

Finally, **sign in as the new person in the app** at `/teacher/sign-in`. A working login lands on `/teacher`.

## E. Hand over credentials

- Deliver the password in person or through a password manager share. Never by email, chat or ticket in plain text.
- Staff **cannot change their own password in the app** (known limitation, M2). Choose a strong random password at creation; rotate it through the Dashboard (below).

## F. Day-2 operations

| Need | How |
|---|---|
| Reset a staff password | Dashboard → Authentication → Users → the user → set a new password (or "Send password recovery" if SMTP is configured, see the hosted checklist). Tell them out of band. |
| Suspend a person now | See SQL below. They are refused at the next page load. |
| Reactivate | `update public.profiles set status = 'active' where id = (select id from auth.users where email = '<email>');` |
| Change role | `update public.profiles set role = 'teacher' where id = (select id from auth.users where email = '<email>');` Only `teacher` or `admin` for staff. |
| Who did what | `select a.created_at, a.action, pr.display_name as actor, a.metadata from public.audit_logs a left join public.profiles pr on pr.id = a.actor_id order by a.created_at desc limit 50;` |

Suspend + end all sessions (verified locally):

```sql
update public.profiles set status = 'suspended'
where id = (select id from auth.users where email = '<email>');

select public.fn_revoke_user_sessions((select id from auth.users where email = '<email>')) as sessions_revoked;
```

Suspension alone is enough to block the app (`requireActiveProfile` refuses non-active profiles); revoking sessions also ends the Auth session. A suspended teacher's classrooms stay owned by them: there is no ownership-transfer screen yet (M2). Add another teacher as co-teacher **before** suspending an owner if the class must continue.

## G. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "이메일 또는 비밀번호가 올바르지 않습니다." | Wrong password, or the auth user is not confirmed | Reset password; check `confirmed` in step D |
| "교사 계정이 아닙니다. 교사 계정으로 로그인해 주세요." | No profile row for this auth user, or the profile role is `student` | Step D queries; create or fix the profile row |
| "비활성 상태의 계정입니다. 관리자에게 문의해 주세요." | `status = 'suspended'` | Reactivate if intended |
| Signed in earlier, now bounced to sign-in on every page | Profile was suspended or deleted after sign-in, or the Auth session was revoked | Step D queries; sign in again |
| Two teachers cannot see each other's classroom | Different `school_id` values | Update to the one `PILOT_SCHOOL_ID` **before** they create classrooms |

## H. Record keeping (ops log)

For each change: date, who did it, who checked, email affected, role granted, reason. Keep `PILOT_SCHOOL_ID` and the list of admins in the same secure place as the production keys.
