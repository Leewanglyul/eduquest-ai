BEGIN;
SELECT plan(60);

-- M2-3.4 P1 schema foundation (Gate 2 package, PM 2026-11-01): play mode and its lock (K23), the six collaboration
-- tables, access (RLS on, no policy, no client privilege) and erasure (G4 keep-and-detach, including the
-- supabase_auth_admin-like path of 00014). No play function is changed in P1, so team rows are written directly here.

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000b1', 's1@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 's2@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b3', 's3@t.invalid')
) AS v(id, email);
INSERT INTO public.profiles (id, school_id, role, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'student', 'S1'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'student', 'S2'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 'student', 'S3');
INSERT INTO public.students (id, school_id, profile_id, student_no, grade) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', '1', '1'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', '2', '1'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b3', '3', '1');
INSERT INTO public.classrooms (id, school_id, owner_id, name) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'A'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'B');
INSERT INTO public.classroom_enrollments (classroom_id, student_id) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c2'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c3');

INSERT INTO public.content_sets (id, school_id, owner_id, classroom_id, title) VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d1', 'S1');
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

INSERT INTO public.crossword_preview_tickets (id, school_id, actor_id, set_id, token_hash, placement_hash, expires_at)
VALUES ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000000e1', 'th', current_setting('t.hash'), now() + interval '15 minutes');
SELECT set_config('t.p', (public.fn_save_crossword('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000a1', 'th', '00000000-0000-4000-8000-0000000000e1', 'Puzzle 1', 'normal', '{}'::jsonb,
  '{"words":5}'::jsonb, 7::bigint, 1, current_setting('t.hash'), 3, 4, current_setting('t.words')::jsonb, 25, 5, NULL) ->> 'puzzleId'), true);
UPDATE public.crossword_puzzles SET settings = jsonb_build_object('play',
  '{"prefillPercent":0,"revealsPerStudent":2,"checksAllowed":5,"checkMode":"onRequest","chosungAllowed":true}'::jsonb)
WHERE id = current_setting('t.p')::uuid;
SELECT public.fn_publish_crossword(current_setting('t.p')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
  ARRAY['00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2']::uuid[], NULL, NULL);
-- t.a1: individual assignment (classroom A); t.a2: team assignment (classroom B).
SELECT set_config('t.a1', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.p')::uuid AND classroom_id = '00000000-0000-4000-8000-0000000000d1'), true);
SELECT set_config('t.a2', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.p')::uuid AND classroom_id = '00000000-0000-4000-8000-0000000000d2'), true);
CREATE FUNCTION pg_temp.s(p_n integer) RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-0000000000c' || p_n)::uuid $$;

-- ---- Structure ----
SELECT has_type('public', 'crossword_play_mode', 'the play mode enum exists');
SELECT enum_has_labels('public', 'crossword_play_mode', ARRAY['individual', 'team'], 'play mode values are individual, team');
SELECT col_type_is('public', 'crossword_assignments', 'play_mode', 'crossword_play_mode', 'assignments.play_mode has the enum type');
SELECT col_not_null('public', 'crossword_assignments', 'play_mode', 'play_mode is NOT NULL');
SELECT col_default_is('public', 'crossword_assignments', 'play_mode', 'individual'::public.crossword_play_mode, 'play_mode defaults to individual');
SELECT is((SELECT count(*)::int FROM public.crossword_assignments WHERE play_mode <> 'individual'), 0, 'every existing assignment is individual');
SELECT col_type_is('public', 'crossword_attempt_members', 'last_active_at', 'timestamp with time zone', 'members.last_active_at exists');
SELECT col_is_null('public', 'crossword_attempt_members', 'last_active_at', 'last_active_at is nullable');
SELECT has_table('public', 'crossword_teams', 'crossword_teams exists');
SELECT has_table('public', 'crossword_team_members', 'crossword_team_members exists');
SELECT has_table('public', 'crossword_attempt_cell_writers', 'crossword_attempt_cell_writers exists');
SELECT has_table('public', 'crossword_attempt_word_solves', 'crossword_attempt_word_solves exists');
SELECT has_table('public', 'crossword_attempt_word_credits', 'crossword_attempt_word_credits exists');
SELECT has_table('public', 'crossword_team_help_requests', 'crossword_team_help_requests exists');
SELECT columns_are('public', 'crossword_teams', ARRAY['id', 'assignment_id', 'label', 'attempt_id', 'created_by', 'created_at'], 'teams columns');
SELECT columns_are('public', 'crossword_team_members', ARRAY['team_id', 'assignment_id', 'student_id', 'joined_at'], 'team members columns');
SELECT columns_are('public', 'crossword_attempt_cell_writers', ARRAY['attempt_id', 'cell_key', 'student_id', 'written_at'], 'cell writers columns: no letter');
SELECT columns_are('public', 'crossword_attempt_word_solves', ARRAY['attempt_id', 'number', 'direction', 'solved_at'], 'word solves columns: no student');
SELECT columns_are('public', 'crossword_attempt_word_credits', ARRAY['attempt_id', 'number', 'direction', 'student_id'], 'word credits columns');
SELECT columns_are('public', 'crossword_team_help_requests', ARRAY['id', 'team_id', 'created_at', 'resolved_at', 'resolved_by'], 'help requests columns: no student, no text');
SELECT col_is_pk('public', 'crossword_team_members', ARRAY['team_id', 'student_id'], 'team members PK (team, student)');
SELECT col_is_pk('public', 'crossword_attempt_cell_writers', ARRAY['attempt_id', 'cell_key'], 'cell writers PK (attempt, cell): one row per cell');
SELECT col_is_pk('public', 'crossword_attempt_word_solves', ARRAY['attempt_id', 'number', 'direction'], 'word solves PK (attempt, number, direction)');
SELECT col_is_pk('public', 'crossword_attempt_word_credits', ARRAY['attempt_id', 'number', 'direction', 'student_id'], 'word credits PK (attempt, word, student)');

-- ---- Access ----
SELECT is((SELECT count(*)::int FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relrowsecurity AND relname IN
  ('crossword_teams', 'crossword_team_members', 'crossword_attempt_cell_writers', 'crossword_attempt_word_solves',
   'crossword_attempt_word_credits', 'crossword_team_help_requests')), 6, 'RLS is on for all six new tables');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename IN
  ('crossword_teams', 'crossword_team_members', 'crossword_attempt_cell_writers', 'crossword_attempt_word_solves',
   'crossword_attempt_word_credits', 'crossword_team_help_requests')), 0, 'no policy on any new table');
SELECT is((SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC') AND table_name IN
  ('crossword_teams', 'crossword_team_members', 'crossword_attempt_cell_writers', 'crossword_attempt_word_solves',
   'crossword_attempt_word_credits', 'crossword_team_help_requests')), 0, 'anon and authenticated have no privilege on the new tables');
SELECT ok(has_table_privilege('service_role', 'public.crossword_attempt_cell_writers', 'INSERT')
  AND has_table_privilege('service_role', 'public.crossword_teams', 'SELECT'), 'service_role can use the new tables');
SELECT ok(NOT has_function_privilege('authenticated', 'public.fn_crossword_assignment_mode_lock()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.fn_crossword_assignment_mode_lock()', 'EXECUTE'), 'API roles cannot execute the mode lock function');
SELECT ok((SELECT proconfig::text LIKE '%search_path=pg_catalog, public%' FROM pg_proc WHERE proname = 'fn_crossword_assignment_mode_lock'), 'the mode lock search_path is pinned');

-- ---- Mode lock (K23) ----
SELECT lives_ok($$ UPDATE public.crossword_assignments SET play_mode = 'team' WHERE id = current_setting('t.a2')::uuid $$,
  'the mode can change while no attempt exists');
SELECT is((SELECT play_mode::text FROM public.crossword_assignments WHERE id = current_setting('t.a2')::uuid), 'team', 'assignment 2 is now team');
-- Personal play still starts on the default mode (P1 changes no function).
SELECT set_config('t.x1', (public.fn_crossword_play_start(pg_temp.s(1), current_setting('t.a1')::uuid, '{}') ->> 'attemptId'), true);
SELECT isnt(current_setting('t.x1'), NULL, 'personal play still starts on an individual assignment');
SELECT throws_ok($$ UPDATE public.crossword_assignments SET play_mode = 'team' WHERE id = current_setting('t.a1')::uuid $$,
  'P0001', 'CROSSWORD_PLAY_MODE_LOCKED', 'the mode is locked once an attempt exists');
SELECT lives_ok($$ UPDATE public.crossword_assignments SET play_mode = 'individual' WHERE id = current_setting('t.a1')::uuid $$,
  'setting the same mode again is not a change');
SELECT lives_ok($$ UPDATE public.crossword_assignments SET closes_at = now() + interval '1 day' WHERE id = current_setting('t.a1')::uuid $$,
  'other columns of a locked assignment still update');

-- ---- Team attempt fixture: team 1 on assignment 2 with s1, s2, s3 ----
INSERT INTO public.crossword_teams (id, assignment_id, label, created_by) VALUES
  ('00000000-0000-4000-8000-00000000aa01', current_setting('t.a2')::uuid, '1팀', '00000000-0000-4000-8000-000000000001');
INSERT INTO public.crossword_team_members (team_id, assignment_id, student_id)
SELECT '00000000-0000-4000-8000-00000000aa01', current_setting('t.a2')::uuid, pg_temp.s(n) FROM generate_series(1, 3) n;
INSERT INTO public.crossword_attempts (id, assignment_id, cells) VALUES
  ('00000000-0000-4000-8000-00000000ab01', current_setting('t.a2')::uuid, '{"0,0":"사","0,1":"과","1,1":"일"}');
INSERT INTO public.crossword_attempt_members (attempt_id, assignment_id, student_id)
SELECT '00000000-0000-4000-8000-00000000ab01', current_setting('t.a2')::uuid, pg_temp.s(n) FROM generate_series(1, 3) n;
UPDATE public.crossword_teams SET attempt_id = '00000000-0000-4000-8000-00000000ab01' WHERE id = '00000000-0000-4000-8000-00000000aa01';
INSERT INTO public.crossword_attempt_cell_writers (attempt_id, cell_key, student_id) VALUES
  ('00000000-0000-4000-8000-00000000ab01', '0,0', pg_temp.s(1)),
  ('00000000-0000-4000-8000-00000000ab01', '0,1', pg_temp.s(2)),
  ('00000000-0000-4000-8000-00000000ab01', '1,1', pg_temp.s(3));
INSERT INTO public.crossword_attempt_word_solves (attempt_id, number, direction) VALUES
  ('00000000-0000-4000-8000-00000000ab01', 1, 'across');
INSERT INTO public.crossword_attempt_word_credits (attempt_id, number, direction, student_id) VALUES
  ('00000000-0000-4000-8000-00000000ab01', 1, 'across', pg_temp.s(1)),
  ('00000000-0000-4000-8000-00000000ab01', 1, 'across', pg_temp.s(2));
INSERT INTO public.crossword_team_help_requests (team_id) VALUES ('00000000-0000-4000-8000-00000000aa01');

-- ---- Constraints ----
SELECT throws_ok($$ INSERT INTO public.crossword_teams (assignment_id, label) VALUES (current_setting('t.a2')::uuid, '1팀') $$,
  '23505', NULL, 'team labels are unique per assignment');
SELECT throws_ok($$ INSERT INTO public.crossword_teams (assignment_id, label) VALUES (current_setting('t.a2')::uuid, '') $$,
  '23514', NULL, 'an empty team label is refused');
SELECT throws_ok($$ INSERT INTO public.crossword_teams (assignment_id, label, attempt_id) VALUES (current_setting('t.a2')::uuid, '2팀', '00000000-0000-4000-8000-00000000ab01') $$,
  '23505', NULL, 'an attempt belongs to at most one team');
SELECT throws_ok($$ INSERT INTO public.crossword_teams (assignment_id, label, attempt_id) VALUES (current_setting('t.a2')::uuid, 'X', current_setting('t.x1')::uuid) $$,
  '23503', NULL, 'a team cannot point at an attempt of another assignment');
INSERT INTO public.crossword_teams (id, assignment_id, label) VALUES ('00000000-0000-4000-8000-00000000aa02', current_setting('t.a2')::uuid, '2팀');
SELECT throws_ok($$ INSERT INTO public.crossword_team_members (team_id, assignment_id, student_id) VALUES ('00000000-0000-4000-8000-00000000aa02', current_setting('t.a2')::uuid, pg_temp.s(1)) $$,
  '23505', NULL, 'a student is in at most one team per assignment');
SELECT throws_ok($$ INSERT INTO public.crossword_team_members (team_id, assignment_id, student_id) VALUES ('00000000-0000-4000-8000-00000000aa02', current_setting('t.a1')::uuid, pg_temp.s(1)) $$,
  '23503', NULL, 'a team member row must match the team''s assignment');
SELECT throws_ok($$ INSERT INTO public.crossword_attempt_cell_writers (attempt_id, cell_key, student_id) VALUES ('00000000-0000-4000-8000-00000000ab01', '0,0', pg_temp.s(2)) $$,
  '23505', NULL, 'a cell has one writer row (no history)');
SELECT throws_ok($$ INSERT INTO public.crossword_attempt_cell_writers (attempt_id, cell_key, student_id) VALUES ('00000000-0000-4000-8000-00000000ab01', '사', pg_temp.s(2)) $$,
  '23514', NULL, 'a cell key must look like "r,c" (no letter can be stored there)');
SELECT throws_ok($$ INSERT INTO public.crossword_attempt_word_credits (attempt_id, number, direction, student_id) VALUES ('00000000-0000-4000-8000-00000000ab01', 2, 'down', pg_temp.s(1)) $$,
  '23503', NULL, 'credit needs a solve row first');
SELECT throws_ok($$ INSERT INTO public.crossword_attempt_word_solves (attempt_id, number, direction) VALUES ('00000000-0000-4000-8000-00000000ab01', 0, 'down') $$,
  '23514', NULL, 'a word number is positive');
SELECT throws_ok($$ INSERT INTO public.crossword_team_help_requests (team_id, resolved_by) VALUES ('00000000-0000-4000-8000-00000000aa01', '00000000-0000-4000-8000-000000000001') $$,
  '23514', NULL, 'a help request has a resolver only once resolved');

-- ---- Erasure (G4 keep-and-detach), through a role with no crossword rights, like supabase_auth_admin (00014) ----
CREATE ROLE erasure_probe NOLOGIN;
GRANT DELETE, SELECT ON public.profiles TO erasure_probe;
GRANT erasure_probe TO CURRENT_USER;
CREATE POLICY erasure_probe_delete ON public.profiles FOR ALL TO erasure_probe USING (true);  -- rolled back with the test
SELECT ok(NOT has_table_privilege('erasure_probe', 'public.crossword_attempt_cell_writers', 'UPDATE')
  AND NOT has_table_privilege('erasure_probe', 'public.crossword_attempt_word_credits', 'DELETE'), 'the probe role has no right on the new tables');

SET LOCAL ROLE erasure_probe;
DELETE FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b1';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE id = '00000000-0000-4000-8000-00000000ab01'), 1, 'erasing one teammate keeps the team attempt');
SELECT is((SELECT cells FROM public.crossword_attempts WHERE id = '00000000-0000-4000-8000-00000000ab01'), '{"0,0":"사","0,1":"과","1,1":"일"}'::jsonb, 'the letters stay');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_cell_writers WHERE attempt_id = '00000000-0000-4000-8000-00000000ab01' AND cell_key = '0,0' AND student_id IS NULL), 1, 'the erased writer is detached (NULL), the cell row stays');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_word_credits WHERE student_id = pg_temp.s(1)), 0, 'the erased student''s credit is removed');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_word_credits WHERE attempt_id = '00000000-0000-4000-8000-00000000ab01'), 1, 'the other teammate''s credit stays');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_word_solves WHERE attempt_id = '00000000-0000-4000-8000-00000000ab01'), 1, 'the solve stays');
SELECT is((SELECT count(*)::int FROM public.crossword_team_members WHERE team_id = '00000000-0000-4000-8000-00000000aa01'), 2, 'the erased student''s team membership is removed');
SELECT is((SELECT count(*)::int FROM public.crossword_team_help_requests WHERE team_id = '00000000-0000-4000-8000-00000000aa01'), 1, 'the team''s help request stays');

-- Erase the other two: the existing cleanup trigger removes the attempt and everything below it cascades.
SET LOCAL ROLE erasure_probe;
DELETE FROM public.profiles WHERE id IN ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b3');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE id = '00000000-0000-4000-8000-00000000ab01'), 0, 'the last erasure removes the team attempt');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_cell_writers WHERE attempt_id = '00000000-0000-4000-8000-00000000ab01')
        + (SELECT count(*)::int FROM public.crossword_attempt_word_solves WHERE attempt_id = '00000000-0000-4000-8000-00000000ab01'), 0, 'writer and solve rows go with it');
SELECT is((SELECT attempt_id FROM public.crossword_teams WHERE id = '00000000-0000-4000-8000-00000000aa01'), NULL, 'the team is kept with no attempt');

-- Deleting the assignment removes its teams and their help requests.
DELETE FROM public.crossword_assignments WHERE id = current_setting('t.a2')::uuid;
SELECT is((SELECT count(*)::int FROM public.crossword_teams WHERE assignment_id = current_setting('t.a2')::uuid)
        + (SELECT count(*)::int FROM public.crossword_team_help_requests), 0, 'deleting the assignment removes its teams and help requests');

SELECT * FROM finish();
ROLLBACK;
