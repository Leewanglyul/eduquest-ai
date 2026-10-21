# 18. TV-1: hosted verification plan, plan A (database only)

Status: **PLAN, PM verdict READY WITH CONDITIONS (2026-10-21). NOTHING IS EXECUTED.** This document contains scripts and steps; running any of them on the hosted project needs the approvals of §2. No `db push`, no deployment, no Production change, no flag change and no hosted data change is made by writing this plan. Related: [m2/17](17-tv1-hosting-impact-report.md) (impact report, READY WITH CONDITIONS), [m2/16](16-tv1-implementation-review.md), [m2/14](14-tv1-teacher-visibility-design.md), pgTAP `supabase/tests/00015_crossword_assignment_progress.test.sql`.

## 1. What plan A verifies, and what it does not

Plan A checks the **database function on the hosted project** with `SMOKE` test data, with no deployment and no student session:

| Verified | Not verified |
|---|---|
| the migration applied cleanly and the function exists with the intended privileges (anon and authenticated cannot execute, `service_role` can) | the teacher **page** and the link (need a database-connected deployment) |
| classroom-level authorization on the hosted schema: owner, co-teacher, admin allowed; other teacher, puzzle owner who is not staff, co-teacher of the other classroom, student id refused; unknown id and not-allowed id give the same error | real sign-in as a teacher |
| the numbers: states, filled/total cells, wrong submits, roster rules (removed and non-enrolled students absent), isolation between two classrooms sharing a puzzle | the feature flag behaviour on the page |
| the result columns are exactly the allow-list, the attempt tables remain closed (RLS on, no policy, no client privilege) | browser, Galaxy Tab and screen reader behaviour |
| cleanup returns every count to the baseline | |

The same checks run in pgTAP locally (33 tests); plan A repeats the important ones on the hosted database because hosted data, grants and versions can differ from the local stack. All 18 checks of the verify script and the cleanup were **dry-run on the local database on 2026-10-21**: 18 of 18 passed and the counts returned to the baseline.

## 2. Approvals and preconditions (all required before anything runs on hosted)

| # | Condition | Owner |
|---|---|---|
| 1 | The `db push` of the single migration `20261021000001` is approved (impact report m2/17, explicit PM go). Re-run `supabase db push --dry-run` first: it must list only that file | PM |
| 2 | **Separate approval to create test data on the pilot project:** 4 teacher/admin accounts and 5 student accounts (auth users plus profile rows), 2 classrooms, 1 word set, 1 published puzzle with 2 assignments, 4 attempts (5 members, 3 events). All carry the `SMOKE` prefix and fixed ids `5a000000-0000-4000-8000-*` | PM |
| 3 | The operating rule "no puzzle published on hosted" is **lifted for the verification window only**. The puzzle is created in the database, never through the application, and is assigned only to `SMOKE` classrooms that no real student is enrolled in | PM |
| 4 | `pilot/12` revision and `pilot/13` status are resolved, or the PM explicitly accepts running the test data check before they are (it uses no real student data) | PM, school |
| 5 | `CROSSWORD_PLAY_ENABLED` stays unset throughout; nothing in this plan turns the feature on, because the fixture is written with the database functions, not the app | PM (rule) |
| 6 | The person running the steps has the Supabase project access used so far (`supabase db query --linked`) and the project's service key in the local hosted env profile, which is never printed or pasted | Ops / engineering |

## 3. Test data inventory (all `SMOKE`)

| Kind | Rows | Ids and names |
|---|---|---|
| Auth users (Auth admin API) | 9 | teachers `…a001` owner, `…a002` co-teacher, `…a003` other teacher; admin `…a004`; students `…b001` to `…b005`. E-mail `smoke-<suffix>@smoke.invalid` (the domain was accepted by the hosted project on 2026-10-20); a random password that is discarded: nobody signs in |
| Profiles | 9 | display names `SMOKE owner`, `SMOKE co-teacher`, `SMOKE other teacher`, `SMOKE admin`, `SMOKE s1` to `SMOKE s5` |
| Students | 5 | numbers `SMOKE-1` to `SMOKE-5` |
| Classrooms | 2 | `SMOKE class A` (owner `…a001`, co-teacher `…a002`), `SMOKE class B` (owner `…a003`) |
| Enrollments | 6 | A: s1 to s5 (s5 removed again), B: s1 |
| Word set and entries | 1 + 5 | `SMOKE set`, owner `…a001`, linked to class A |
| Puzzle | 1 | `SMOKE puzzle` (normal level), saved and published to class A through the database functions, assigned to class B by a direct insert |
| Attempts | 4 | s1 completes after one word check; s2 fills all cells wrong and submits once (s4 is a second member of that attempt); s5 starts and is removed from A; s1 types one letter in B |
| Preview ticket | 1 | `5a000000-0000-4000-8000-0000000a0001` (deleted at cleanup) |

The real teacher and the 64 students in the project are never referenced. **PM decision 2026-10-21: those 64 are assumed to possibly include real students, so this plan treats the project at the level of real student data.** Consequently no script here reads a name or student number of a non-`SMOKE` student: the count script only counts rows, the verification reads only the `SMOKE` classrooms, and the cleanup deletes only fixed `SMOKE` ids. The `SMOKE` classrooms are owned by `SMOKE` teachers, so nothing appears in the real teacher's screens. Note: the set and its entries use the ids `00000000-0000-4000-8000-0000000000e1` and `…f001` to `…f005` because the placement hash in the fixture is computed over those entry ids (the same ids as the pgTAP fixture).

## 4. Procedure

Use a working folder outside the repository for the generated files. `{{SCHOOL}}` in the scripts is replaced with the pilot school id (read it from `select distinct school_id from profiles` on the project; on 2026-10-20 it was `9e2de1e3-ed3b-446f-8e6a-8da531ae653e`).

**Step 0: baseline (read-only).** Run the count script (§5.4), record the row. Expected from 2026-10-21: attempts 0, assignments 0, `smoke_*` all 0.

**Step 1: push the migration (needs approval 1).** `supabase db push --dry-run` (must list only `20261021000001_crossword_assignment_progress.sql`), then `supabase db push`, then `supabase migration list` (no pending migration).

**Step 2: create the nine auth users (needs approval 2).** For each of the nine ids and suffixes, call the Auth admin API with the service key from the hosted profile (never echoed): `POST $URL/auth/v1/admin/users` with a JSON body `{ "id": "<id>", "email": "smoke-<suffix>@smoke.invalid", "password": "<random, discarded>", "email_confirm": true, "user_metadata": { "synthetic": true } }`. Expect HTTP 200 and the same id back. If the project refuses a fixed id, create the users without `id`, then replace the nine ids in the scripts by the returned ids before Step 3 (the cleanup uses the same list).

**Step 3: fixture (needs approvals 2 and 3).** `sed 's/{{SCHOOL}}/<id>/g' fixture.sql > fixture.run.sql`, then `supabase db query --linked -f fixture.run.sql`. The script is one transaction (`BEGIN`/`COMMIT`): if anything fails nothing is kept. It prints the two assignment ids. A failure at the hash check (`CROSSWORD_HASH_MISMATCH`) means an id of the set or entries was changed.

**Step 4: verify (read-only).** `supabase db query --linked -f verify.run.sql`. Every one of the 18 rows must have `pass = true`. Save the output as evidence E3.

**Step 5: counts during.** Run the count script again: expected (from the local dry run) attempts 4, attempt members 5, attempt events 3, and the `smoke_*` counts of the table in §3: profiles 9, students 5, classrooms 2, sets 1, puzzles 1; everything else equals the baseline plus the `SMOKE` rows.

**Step 6: cleanup.** `supabase db query --linked -f cleanup.run.sql` (puzzle, preview ticket, set, classrooms, students; assignments, attempts, members and events go with the puzzle and the students). Then delete the nine auth users with the Auth admin API (`DELETE $URL/auth/v1/admin/users/<id>`, expect HTTP 200 each; the profiles go with them). The student deletion path with attempts is the one verified on 2026-10-20.

**Step 7: counts after.** Run the count script. **Every column must equal the baseline of Step 0.** Any difference stops the process and is reported to the PM.

## 5. Scripts

All scripts are SQL. They were dry-run on the local database. Nothing here contains a secret.

### 5.1 fixture.sql

```sql
BEGIN;
-- TV-1 hosted verification, DB-only (A plan). Fixture: all rows carry the SMOKE prefix and the ids 5a000000-0000-4000-8000-*.
-- Placeholder {{SCHOOL}} is the school id. The ten auth users (ids below) must already exist (created through the Auth admin API).
--   teachers  a001 owner of class A, a002 co-teacher of A, a003 owner of class B (not staff of A), admin a004
--   students  b001..b005 (profiles) -> d001..d005 (students): s1 completes, s2 one wrong submit, s3 never starts,
--             s4 second member of s2's attempt, s5 starts then is removed from A; s1 is also enrolled in B (one letter there)
INSERT INTO public.profiles (id, school_id, role, display_name, status) VALUES
  ('5a000000-0000-4000-8000-00000000a001', '{{SCHOOL}}', 'teacher', 'SMOKE owner', 'active'),
  ('5a000000-0000-4000-8000-00000000a002', '{{SCHOOL}}', 'teacher', 'SMOKE co-teacher', 'active'),
  ('5a000000-0000-4000-8000-00000000a003', '{{SCHOOL}}', 'teacher', 'SMOKE other teacher', 'active'),
  ('5a000000-0000-4000-8000-00000000a004', '{{SCHOOL}}', 'admin', 'SMOKE admin', 'active'),
  ('5a000000-0000-4000-8000-00000000b001', '{{SCHOOL}}', 'student', 'SMOKE s1', 'active'),
  ('5a000000-0000-4000-8000-00000000b002', '{{SCHOOL}}', 'student', 'SMOKE s2', 'active'),
  ('5a000000-0000-4000-8000-00000000b003', '{{SCHOOL}}', 'student', 'SMOKE s3', 'active'),
  ('5a000000-0000-4000-8000-00000000b004', '{{SCHOOL}}', 'student', 'SMOKE s4', 'active'),
  ('5a000000-0000-4000-8000-00000000b005', '{{SCHOOL}}', 'student', 'SMOKE s5', 'active');
INSERT INTO public.students (id, school_id, profile_id, student_no, grade) VALUES
  ('5a000000-0000-4000-8000-00000000d001', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000b001', 'SMOKE-1', '1'),
  ('5a000000-0000-4000-8000-00000000d002', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000b002', 'SMOKE-2', '1'),
  ('5a000000-0000-4000-8000-00000000d003', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000b003', 'SMOKE-3', '1'),
  ('5a000000-0000-4000-8000-00000000d004', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000b004', 'SMOKE-4', '1'),
  ('5a000000-0000-4000-8000-00000000d005', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000b005', 'SMOKE-5', '1');
INSERT INTO public.classrooms (id, school_id, owner_id, name) VALUES
  ('5a000000-0000-4000-8000-00000000c0a1', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000a001', 'SMOKE class A'),
  ('5a000000-0000-4000-8000-00000000c0b1', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000a003', 'SMOKE class B');
INSERT INTO public.classroom_teachers (classroom_id, teacher_id) VALUES
  ('5a000000-0000-4000-8000-00000000c0a1', '5a000000-0000-4000-8000-00000000a002');
INSERT INTO public.classroom_enrollments (classroom_id, student_id) VALUES
  ('5a000000-0000-4000-8000-00000000c0a1', '5a000000-0000-4000-8000-00000000d001'),
  ('5a000000-0000-4000-8000-00000000c0a1', '5a000000-0000-4000-8000-00000000d002'),
  ('5a000000-0000-4000-8000-00000000c0a1', '5a000000-0000-4000-8000-00000000d003'),
  ('5a000000-0000-4000-8000-00000000c0a1', '5a000000-0000-4000-8000-00000000d004'),
  ('5a000000-0000-4000-8000-00000000c0a1', '5a000000-0000-4000-8000-00000000d005'),
  ('5a000000-0000-4000-8000-00000000c0b1', '5a000000-0000-4000-8000-00000000d001');

INSERT INTO public.content_sets (id, school_id, owner_id, classroom_id, title) VALUES
  ('00000000-0000-4000-8000-0000000000e1', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000a001', '5a000000-0000-4000-8000-00000000c0a1', 'SMOKE set');
INSERT INTO public.content_entries (id, set_id, position, term, definition, answer, script, normalizer_version) VALUES
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000e1', 1, '사과', 'c1', '사과', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-0000000000e1', 2, '과일', 'c2', '과일', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f003', '00000000-0000-4000-8000-0000000000e1', 3, '일기', 'c3', '일기', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f004', '00000000-0000-4000-8000-0000000000e1', 4, '기차', 'c4', '기차', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f005', '00000000-0000-4000-8000-0000000000e1', 5, '차례', 'c5', '차례', 'hangul', 1);

SELECT set_config('t.words', '[
  {"number":1,"direction":"across","row":0,"col":0,"answer":"사과","clue":"빨간 과일","entryId":"00000000-0000-4000-8000-00000000f001"},
  {"number":2,"direction":"down","row":0,"col":1,"answer":"과일","clue":"먹는 것","entryId":"00000000-0000-4000-8000-00000000f002"},
  {"number":3,"direction":"across","row":1,"col":1,"answer":"일기","clue":"매일 쓰는 글","entryId":"00000000-0000-4000-8000-00000000f003"},
  {"number":4,"direction":"down","row":1,"col":2,"answer":"기차","clue":"레일 위의 탈것","entryId":"00000000-0000-4000-8000-00000000f004"},
  {"number":5,"direction":"across","row":2,"col":2,"answer":"차례","clue":"순서","entryId":"00000000-0000-4000-8000-00000000f005"}
]', true);
SELECT set_config('t.hash', 'ff0717a4eabd6ea0d7d445cb0f38f651ac3043f027f7ee33aba1b56d5bc5a113', true);

INSERT INTO public.crossword_preview_tickets (id, school_id, actor_id, set_id, token_hash, placement_hash, expires_at) VALUES
  ('5a000000-0000-4000-8000-0000000a0001', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000a001',
   '00000000-0000-4000-8000-0000000000e1', 'th', current_setting('t.hash'), now() + interval '15 minutes');
SELECT set_config('t.puzzle', (public.fn_save_crossword('5a000000-0000-4000-8000-0000000a0001', '5a000000-0000-4000-8000-00000000a001', '{{SCHOOL}}', 'th',
  '00000000-0000-4000-8000-0000000000e1', 'SMOKE puzzle', 'normal', '{}'::jsonb, '{"words":5}'::jsonb,
  7::bigint, 1, current_setting('t.hash'), 3, 4, current_setting('t.words')::jsonb, 25, 5, NULL) ->> 'puzzleId'), true);
UPDATE public.crossword_puzzles SET settings = '{"play":{"prefillPercent":0,"revealsPerStudent":1,"checksAllowed":3,"checkMode":"onRequest","chosungAllowed":false}}'::jsonb
  WHERE id = current_setting('t.puzzle')::uuid;
SELECT public.fn_publish_crossword(current_setting('t.puzzle')::uuid, '5a000000-0000-4000-8000-00000000a001', '{{SCHOOL}}',
  ARRAY['5a000000-0000-4000-8000-00000000c0a1']::uuid[], NULL, NULL);
-- Class B gets the same puzzle directly (the owner of A cannot publish into B): the two-classroom case.
INSERT INTO public.crossword_assignments (puzzle_id, classroom_id, created_by) VALUES
  (current_setting('t.puzzle')::uuid, '5a000000-0000-4000-8000-00000000c0b1', '5a000000-0000-4000-8000-00000000a001');
SELECT set_config('t.asgA', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.puzzle')::uuid AND classroom_id = '5a000000-0000-4000-8000-00000000c0a1'), true);
SELECT set_config('t.asgB', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.puzzle')::uuid AND classroom_id = '5a000000-0000-4000-8000-00000000c0b1'), true);

-- Attempts, through the same database functions the app uses. s1 completes after one word check; s2 fills every cell wrong and
-- submits once; s4 joins s2's attempt; s5 starts and is then removed from A; s1 also types one letter in B.
SELECT set_config('t.s1', (public.fn_crossword_play_start('5a000000-0000-4000-8000-00000000d001', current_setting('t.asgA')::uuid, '{}') ->> 'attemptId'), true);
SELECT public.fn_crossword_play_save('5a000000-0000-4000-8000-00000000d001', current_setting('t.s1')::uuid,
  '{"0,0":"사","0,1":"과","1,1":"일","1,2":"기","2,2":"차","2,3":"례"}'::jsonb, 0);
SELECT public.fn_crossword_play_check('5a000000-0000-4000-8000-00000000d001', current_setting('t.s1')::uuid, 'word', ARRAY['0,0','0,1'],
  (SELECT revision FROM public.crossword_attempts WHERE id = current_setting('t.s1')::uuid));
SELECT public.fn_crossword_play_submit('5a000000-0000-4000-8000-00000000d001', current_setting('t.s1')::uuid,
  (SELECT revision FROM public.crossword_attempts WHERE id = current_setting('t.s1')::uuid));
SELECT set_config('t.s2', (public.fn_crossword_play_start('5a000000-0000-4000-8000-00000000d002', current_setting('t.asgA')::uuid, '{}') ->> 'attemptId'), true);
SELECT public.fn_crossword_play_save('5a000000-0000-4000-8000-00000000d002', current_setting('t.s2')::uuid,
  '{"0,0":"가","0,1":"가","1,1":"가","1,2":"가","2,2":"가","2,3":"가"}'::jsonb, 0);
SELECT public.fn_crossword_play_submit('5a000000-0000-4000-8000-00000000d002', current_setting('t.s2')::uuid,
  (SELECT revision FROM public.crossword_attempts WHERE id = current_setting('t.s2')::uuid));
INSERT INTO public.crossword_attempt_members (attempt_id, assignment_id, student_id)
  VALUES (current_setting('t.s2')::uuid, current_setting('t.asgA')::uuid, '5a000000-0000-4000-8000-00000000d004');
SELECT public.fn_crossword_play_start('5a000000-0000-4000-8000-00000000d005', current_setting('t.asgA')::uuid, '{}');
UPDATE public.classroom_enrollments SET status = 'removed', removed_at = now()
  WHERE classroom_id = '5a000000-0000-4000-8000-00000000c0a1' AND student_id = '5a000000-0000-4000-8000-00000000d005';
SELECT set_config('t.s1b', (public.fn_crossword_play_start('5a000000-0000-4000-8000-00000000d001', current_setting('t.asgB')::uuid, '{}') ->> 'attemptId'), true);
SELECT public.fn_crossword_play_save('5a000000-0000-4000-8000-00000000d001', current_setting('t.s1b')::uuid, '{"0,0":"사"}'::jsonb, 0);

SELECT current_setting('t.asgA') AS assignment_a, current_setting('t.asgB') AS assignment_b;
COMMIT;
```

### 5.2 verify.sql (read-only)

```sql
-- TV-1 hosted verification, DB-only (A plan). Read-only: every statement is a SELECT. Placeholder {{SCHOOL}} is the school id.
-- One result table: name, expected, actual, pass. Every row must say pass = true.
CREATE FUNCTION pg_temp.err(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'no error'; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $$;
CREATE FUNCTION pg_temp.prog(p_actor uuid, p_assignment uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_catalog.string_agg(student_no || ':' || state || ':' || filled_count || ':' || wrong_submits, ' ' ORDER BY student_no)
  FROM public.fn_crossword_assignment_progress(p_actor, '{{SCHOOL}}', p_assignment) $$;
CREATE FUNCTION pg_temp.call(p_actor uuid, p_school uuid, p_assignment text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.err(format('SELECT * FROM public.fn_crossword_assignment_progress(%L, %L, %L)', p_actor, p_school, p_assignment)) $$;

WITH a AS (
  SELECT
    (SELECT x.id FROM public.crossword_assignments x JOIN public.crossword_puzzles p ON p.id = x.puzzle_id
       WHERE p.title = 'SMOKE puzzle' AND x.classroom_id = '5a000000-0000-4000-8000-00000000c0a1') AS asg_a,
    (SELECT x.id FROM public.crossword_assignments x JOIN public.crossword_puzzles p ON p.id = x.puzzle_id
       WHERE p.title = 'SMOKE puzzle' AND x.classroom_id = '5a000000-0000-4000-8000-00000000c0b1') AS asg_b
)
SELECT name, expected, actual, (expected IS NOT DISTINCT FROM actual) AS pass FROM (
  SELECT * FROM a, LATERAL (VALUES
    ('01 owner of A sees A', 'SMOKE-1:completed:6:0 SMOKE-2:in_progress:6:1 SMOKE-3:not_started:0:0 SMOKE-4:in_progress:6:1',
       pg_temp.prog('5a000000-0000-4000-8000-00000000a001', a.asg_a)),
    ('02 co-teacher of A sees A', 'SMOKE-1:completed:6:0 SMOKE-2:in_progress:6:1 SMOKE-3:not_started:0:0 SMOKE-4:in_progress:6:1',
       pg_temp.prog('5a000000-0000-4000-8000-00000000a002', a.asg_a)),
    ('03 admin sees A', 'SMOKE-1:completed:6:0 SMOKE-2:in_progress:6:1 SMOKE-3:not_started:0:0 SMOKE-4:in_progress:6:1',
       pg_temp.prog('5a000000-0000-4000-8000-00000000a004', a.asg_a)),
    ('04 owner of B sees only B', 'SMOKE-1:in_progress:1:0', pg_temp.prog('5a000000-0000-4000-8000-00000000a003', a.asg_b)),
    ('05 admin sees B', 'SMOKE-1:in_progress:1:0', pg_temp.prog('5a000000-0000-4000-8000-00000000a004', a.asg_b)),
    ('06 other teacher cannot read A', 'CROSSWORD_NOT_FOUND', pg_temp.call('5a000000-0000-4000-8000-00000000a003', '{{SCHOOL}}', a.asg_a::text)),
    ('07 puzzle owner is not staff of B', 'CROSSWORD_NOT_FOUND', pg_temp.call('5a000000-0000-4000-8000-00000000a001', '{{SCHOOL}}', a.asg_b::text)),
    ('08 co-teacher of A cannot read B', 'CROSSWORD_NOT_FOUND', pg_temp.call('5a000000-0000-4000-8000-00000000a002', '{{SCHOOL}}', a.asg_b::text)),
    ('09 student id is refused', 'CROSSWORD_FORBIDDEN', pg_temp.call('5a000000-0000-4000-8000-00000000b001', '{{SCHOOL}}', a.asg_a::text)),
    ('10 unknown assignment id, same message as 06', 'CROSSWORD_NOT_FOUND',
       pg_temp.call('5a000000-0000-4000-8000-00000000a001', '{{SCHOOL}}', '5a000000-0000-4000-8000-00000000ffff')),
    ('11 removed student and non-enrolled student are not listed', '0',
       (SELECT count(*)::text FROM public.fn_crossword_assignment_progress('5a000000-0000-4000-8000-00000000a001', '{{SCHOOL}}', a.asg_a) WHERE student_no = 'SMOKE-5')),
    ('12 total_cells is 6 on every row', '6',
       (SELECT min(total_cells)::text FROM public.fn_crossword_assignment_progress('5a000000-0000-4000-8000-00000000a001', '{{SCHOOL}}', a.asg_a))),
    ('13 wrong_submits equals submit_wrong events (s2)',
       (SELECT count(*)::text FROM public.crossword_attempt_events e JOIN public.crossword_attempt_members m ON m.attempt_id = e.attempt_id
          WHERE m.student_id = '5a000000-0000-4000-8000-00000000d002' AND e.kind = 'submit_wrong'),
       (SELECT wrong_submits::text FROM public.fn_crossword_assignment_progress('5a000000-0000-4000-8000-00000000a001', '{{SCHOOL}}', a.asg_a) WHERE student_no = 'SMOKE-2')),
    ('14 filled_count equals the student own list (s1)',
       (SELECT filled_count::text FROM public.fn_crossword_play_list('5a000000-0000-4000-8000-00000000d001') WHERE assignment_id = a.asg_a),
       (SELECT filled_count::text FROM public.fn_crossword_assignment_progress('5a000000-0000-4000-8000-00000000a001', '{{SCHOOL}}', a.asg_a) WHERE student_no = 'SMOKE-1')),
    ('15 result columns are the allow-list',
       'student_id,student_no,display_name,state,filled_count,total_cells,last_saved_at,completed_at,checks_used,reveals_used,chosung_used,wrong_submits',
       (SELECT string_agg(u.n, ',' ORDER BY u.o) FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS u(n, m, o)
          WHERE p.oid = 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)'::regprocedure AND u.m = 't')),
    ('16 anon and authenticated cannot execute, service_role can', 'false,false,true',
       has_function_privilege('anon', 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)', 'EXECUTE')::text || ',' ||
       has_function_privilege('authenticated', 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)', 'EXECUTE')::text || ',' ||
       has_function_privilege('service_role', 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)', 'EXECUTE')::text),
    ('17 attempt tables closed: RLS on, no policy, no client SELECT', 'true,0,false',
       (SELECT bool_and(relrowsecurity)::text FROM pg_class WHERE oid IN ('public.crossword_attempts'::regclass, 'public.crossword_attempt_members'::regclass, 'public.crossword_attempt_events'::regclass))
       || ',' || (SELECT count(*)::text FROM pg_policies WHERE tablename LIKE 'crossword_attempt%')
       || ',' || has_table_privilege('authenticated', 'public.crossword_attempts', 'SELECT')::text),
    ('18 function is SECURITY INVOKER with a pinned search_path', 'true',
       (SELECT (NOT prosecdef AND proconfig::text LIKE '%search_path=pg_catalog, public%')::text FROM pg_proc
          WHERE oid = 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)'::regprocedure))
  ) AS v(name, expected, actual)
) t ORDER BY name;
```

Expected result: 18 rows, `pass = true` on every row. Rows 01 to 03 expect `SMOKE-1:completed:6:0 SMOKE-2:in_progress:6:1 SMOKE-3:not_started:0:0 SMOKE-4:in_progress:6:1`; rows 04 and 05 expect `SMOKE-1:in_progress:1:0`; rows 06 to 08 and 10 expect `CROSSWORD_NOT_FOUND`; row 09 expects `CROSSWORD_FORBIDDEN`.

### 5.3 cleanup.sql

```sql
-- TV-1 hosted verification: cleanup of the SMOKE data (everything except the auth users, which are deleted through the Auth admin API).
-- Placeholder {{SCHOOL}} is the school id. Deleting the puzzle removes its words, assignments and, through them, the attempts, members and events.
DELETE FROM public.crossword_puzzles WHERE school_id = '{{SCHOOL}}' AND title = 'SMOKE puzzle';
DELETE FROM public.crossword_preview_tickets WHERE id = '5a000000-0000-4000-8000-0000000a0001';
DELETE FROM public.content_sets WHERE id = '00000000-0000-4000-8000-0000000000e1';
DELETE FROM public.classrooms WHERE id IN ('5a000000-0000-4000-8000-00000000c0a1', '5a000000-0000-4000-8000-00000000c0b1');
DELETE FROM public.students WHERE id IN (
  '5a000000-0000-4000-8000-00000000d001', '5a000000-0000-4000-8000-00000000d002', '5a000000-0000-4000-8000-00000000d003',
  '5a000000-0000-4000-8000-00000000d004', '5a000000-0000-4000-8000-00000000d005');
SELECT 'cleanup done' AS status;
```

### 5.4 count.sql (read-only)

```sql
-- TV-1 hosted verification: counts (read-only). Run before the fixture (baseline), after the verification and after the cleanup.
SELECT
  (SELECT count(*) FROM public.profiles)                   AS profiles,
  (SELECT count(*) FROM public.students)                   AS students,
  (SELECT count(*) FROM public.classrooms)                 AS classrooms,
  (SELECT count(*) FROM public.classroom_teachers)         AS classroom_teachers,
  (SELECT count(*) FROM public.classroom_enrollments)      AS enrollments,
  (SELECT count(*) FROM public.content_sets)               AS content_sets,
  (SELECT count(*) FROM public.crossword_puzzles)          AS puzzles,
  (SELECT count(*) FROM public.crossword_assignments)      AS assignments,
  (SELECT count(*) FROM public.crossword_attempts)         AS attempts,
  (SELECT count(*) FROM public.crossword_attempt_members)  AS attempt_members,
  (SELECT count(*) FROM public.crossword_attempt_events)   AS attempt_events,
  (SELECT count(*) FROM auth.users)                        AS auth_users,
  (SELECT count(*) FROM public.profiles WHERE display_name LIKE 'SMOKE%')            AS smoke_profiles,
  (SELECT count(*) FROM public.students WHERE student_no LIKE 'SMOKE%')              AS smoke_students,
  (SELECT count(*) FROM public.classrooms WHERE name LIKE 'SMOKE%')                  AS smoke_classrooms,
  (SELECT count(*) FROM public.content_sets WHERE title LIKE 'SMOKE%')               AS smoke_sets,
  (SELECT count(*) FROM public.crossword_puzzles WHERE title LIKE 'SMOKE%')          AS smoke_puzzles;
```

## 6. Evidence to keep

| # | Evidence |
|---|---|
| E1 | `supabase db push --dry-run` output and `migration list` before and after |
| E2 | Baseline, during and after output of the count script |
| E3 | The 18-row output of verify.sql |
| E4 | HTTP status of the nine user creations and nine deletions (status codes only) |
| E5 | Date, time and who ran each step; the PM approvals referenced by date |

## 7. Stop conditions and decision rule

**Stop at once and report** if: the dry-run lists anything but the one migration; the fixture fails; any verify row has `pass = false`; any count after cleanup differs from the baseline; any `SMOKE` row remains; a real student, teacher or classroom appears in any `SMOKE` result; or `CROSSWORD_PLAY_ENABLED` turns out to be defined.

**Plan A passes** when all 18 rows pass and every count after cleanup equals the baseline. The result is then evidence for "the TV-1 function behaves on the hosted database as in pgTAP". It does **not** close TV-1: the page, the link and the flag behaviour still need a database-connected deployment, and the governance steps still apply.

## 8. Known consequences and risks

| Item | Handling |
|---|---|
| **Audit rows stay.** `fn_save_crossword` and `fn_publish_crossword` write two `audit_logs` rows (`crossword.created`, `crossword.published`) containing ids, level, word count and the classroom id; no names, answers or clues. Audit rows are retained by design (pilot/12 §2) and were also left by the 2026-10-20 smoke test | **Decision (PM, 2026-10-21): keep the two audit rows.** They identify nothing (ids, level, word count, classroom id) |
| The `SMOKE` puzzle is published in the database | No student can reach it: it is assigned only to `SMOKE` classrooms with `SMOKE` students, the flag is off, and the window is short |
| Creating teacher and admin accounts on the pilot project | They cannot sign in (random discarded password); deleted at Step 6; counts compared |
| Fixed ids could collide with an existing row | the baseline shows all `SMOKE` counts 0 and the ids use a reserved pattern; the fixture is one transaction, so a collision aborts everything |
| The transaction behaviour of `supabase db query -f` | worked as one unit on 2026-10-20; the script also has explicit `BEGIN`/`COMMIT`; the local dry-run used a plain psql session |
| The migration on hosted is irreversible only in the sense of a forward `DROP FUNCTION` | rollback in m2/17 §6 |
| Two extra hosted students (62 to 64) are unexplained and the 64 may include real students | the baseline in Step 0 absorbs them; they are not touched, not listed and not read (see §3) |

## 9. Decision requested

1. Approve this plan as the hosted verification route A (database only), or ask for changes.
2. ~~Decide the audit-row handling of §8~~ **Decided 2026-10-21: keep the two audit rows.**
3. Execution still waits for the approvals of §2, in particular the push of the migration and the test-data approval.
