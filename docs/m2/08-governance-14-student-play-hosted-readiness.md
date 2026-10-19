# 08 (governance 14). Student Play: hosted readiness

Status: **PM decision recorded: Option C, hold the student-data schema on hosted. 2026-10-19.** Written from the findings of the M2-2.4d/e hardening and the student-erasure fix. It does not approve anything: [pilot/14](../pilot/14-crossword-attempts-governance-draft.md) stays a draft, and [pilot/13](../pilot/13-d6-signoff.md) is not re-signed. Nothing in this file has been applied to the hosted project, and nothing will be until governance 14 is approved.

Related: [07 student play plan](07-m2-2-4-student-play-plan.md), [08 foundation plan](08-m2-2-4a-student-play-foundation-plan.md), [09 device validation](09-g5-device-validation.md), [pilot/14](../pilot/14-crossword-attempts-governance-draft.md).

## 1. Where things stand

| Area | Local | Hosted (`eduquest-ai-pilot`, `anlxidvwtogguyzrrvbs`) |
|---|---|---|
| Migrations | 28 | 16 applied (to `20261016000003`), **12 not applied** (`20261017000001` to `20261019000004`) |
| Content, crossword and attempt tables | present | **absent** |
| Student erasure with an attempt | fixed by `20261019000004` (GoTrue `deleteUser` HTTP 500 became 200; pgTAP 14 files / 559 pass) | not applicable yet (no attempt tables) |
| Student play screens | on automatically while the DB is local | **off** until `CROSSWORD_PLAY_ENABLED=true` |
| Devices | PC browser only (axe clean at 360, 800 and 1280 wide) | **no Galaxy Tab, no Chrome-on-tablet run yet** |

Commit of the erasure fix: `d5e329a` (not pushed to the git remote).

## 2. Findings that matter for hosting

1. **Erasure bug (fixed locally).** Deleting an auth user failed for any student with an attempt: the member cleanup trigger ran as invoker and `supabase_auth_admin` has no rights on `crossword_*`. The function is now `SECURITY DEFINER` with `search_path = pg_catalog, public`; API roles cannot execute it. pgTAP `00014` covers student, profile, attempt, members and events, and was shown to fail without the fix.
2. **The fix cannot be applied alone.** On hosted the function does not exist yet. Applying only `…0004` creates an unused function; applying it before `…0002` makes `…0002`'s `CREATE FUNCTION` fail. All 12 are pending together.
3. **Governance gate.** Migration `20261019000002` creates the attempt, member and event tables, which hold student data. Its header says governance 14 is not signed off. Per pilot/14, no real student may play before approval and a re-signed doc 13. Creating the (empty) tables on hosted is a separate question from letting students write to them.

## 3. PM decision (2026-10-19): Option C, current state kept

| Option | What it means | Notes |
|---|---|---|
| **A** | Apply all 12 in order | Hosted gets the attempt tables while governance 14 is still a draft. They stay empty and the play screens stay off. Needs the PM to accept "schema present, feature off" as compatible with the gate. |
| **B** | Merge `…0004` into `…0002` first (the function is defined as `SECURITY DEFINER` from the start), then apply the 11 remaining | Same exposure as A, one fewer migration, no INVOKER-then-DEFINER history. Only the local DB has run the old files, so history is not a problem. |
| **C** | Apply the content and crossword migrations (`…17` and `…18`, 8 files) now, hold the 4 `…19` files until governance 14 is approved | Teacher-side features reach hosted without student data. `…0004` and the erasure smoke test wait. |

**Decision: Option C.** The student-data schema (`20261019000002` and every object that depends on it, i.e. `…0003` and `…0004`) is not deployed to hosted until governance 14 is finally approved.

For now the current state is kept: **no `supabase db push`, no hosted schema change, no student-play data structure on hosted**, including the teacher-side `…17` and `…18` files. Allowed meanwhile: committing and pushing documents (git), and completing the governance text. The next step is to finish the governance 14 review, then decide whether Student Play is approved on hosted. If the `…17`/`…18` files are to go to hosted earlier, that needs its own PM go-ahead.

Risk per migration is listed in the report of 2026-10-19: all LOW except `…18000003` (large, MEDIUM), `…19000002` (student data, HIGH) and `…19000003` (play functions, MEDIUM). The only changes to existing objects are values added to `audit_action` and `audit_resource`.

## 4. Checklist for the later push (not to be run now)

- [ ] `supabase projects list` shows the linked project is `eduquest-ai-pilot`, and the PM confirms it is the intended target.
- [ ] `supabase db push --dry-run` lists exactly the migrations of the chosen option.
- [ ] Row counts of the existing hosted tables are noted before the push (students, classrooms, profiles).
- [ ] `.env.local` is on the hosted profile, `CROSSWORD_PLAY_ENABLED` is **not** set, and nobody runs `supabase db reset` or the dev seed against it.
- [ ] After the push: `supabase migration list` shows local and remote equal; `pnpm db:types` against hosted gives no diff against `src/types/database.ts`.

## 5. Hosted smoke test: student erasure (only after governance 14 is approved and the attempt tables exist on hosted)

Test accounts only, never real students, and removed at the end.

1. Create a test school student through the teacher flow (or `provisionStudentAccount`), enrolled in a test classroom with a published test puzzle.
2. Create an attempt as that student (open the puzzle with the play flag on for the test only, or call `fn_crossword_play_start` with the service role). Add one event (a check or an autosave).
3. Delete the auth user with `auth.admin.deleteUser`; expect **HTTP 200**, no error.
4. Verify all four are zero:

```sql
select
  (select count(*) from public.students where student_no like 'SMOKE%')               as students,
  (select count(*) from public.profiles where id = '<profile id>')                      as profiles,
  (select count(*) from public.crossword_attempts where id = '<attempt id>')            as attempts,
  (select count(*) from public.crossword_attempt_members where attempt_id = '<attempt id>') as members;
```

5. Delete the test classroom, puzzle and set, and turn the play flag off again.

Pass criteria: no HTTP error, and `students = profiles = attempts = members = 0` (events cascade with the attempt and are checked the same way).

## 6. Student play go / no-go

| Gate | State |
|---|---|
| Local automated checks (vitest 716, pgTAP 559, axe) | met |
| Erasure fix applied and smoke-tested on hosted | **not met** (held by the §3 decision until governance 14 is approved) |
| Governance 14 approved, doc 13 re-signed | **not met** |
| Galaxy Tab + Chrome device run, SC6 verdict (doc 09) | **not met** |
| Galaxy Tab + Samsung Internet (secondary) | not met, secondary |
| Screen reader session (TalkBack) | not met |
| Teacher override screen (reveal and check limits) | not built |

**NO-GO** until the rows marked "not met" are closed. Rules that stay as they are: pilot/14 §4 and doc 06 §12.5 G4 (a member erased keeps the attempt and the other members, no change without a separate decision); learning visibility and puzzle readability are never reduced; students never see each other's real names.
