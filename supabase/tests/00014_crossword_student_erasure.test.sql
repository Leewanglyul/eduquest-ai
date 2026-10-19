BEGIN;
SELECT plan(13);

-- Student erasure through the auth user (docs/m2/07 G.3, governance blocker 2026-10-18).
-- auth.admin.deleteUser deletes auth.users as supabase_auth_admin, which has no rights on crossword_* tables. The
-- cascade auth.users -> profiles -> students -> crossword_attempt_members fires the member cleanup trigger, which must
-- delete the attempt (and its events) even then. 00013 deletes students as postgres and could not see this.
-- The cascade is run here as a role that, like supabase_auth_admin, has no right on any crossword table.

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000b1', 's1@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b4', 's4@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b5', 's5@t.invalid')
) AS v(id, email);
INSERT INTO public.profiles (id, school_id, role, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'student', 'S1'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a1', 'student', 'S4'),
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-0000000000a1', 'student', 'S5');
INSERT INTO public.students (id, school_id, profile_id, student_no, grade) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', '1', '1'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b4', '4', '1'),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b5', '5', '1');
INSERT INTO public.classrooms (id, school_id, owner_id, name) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'A'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'B');
INSERT INTO public.classroom_enrollments (classroom_id, student_id) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c4'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1');

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

CREATE FUNCTION pg_temp.words() RETURNS jsonb LANGUAGE sql AS $$ SELECT current_setting('t.words')::jsonb $$;
CREATE FUNCTION pg_temp.ticket(p_n integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := ('00000000-0000-4000-8000-0000000a00' || lpad(p_n::text, 2, '0'))::uuid;
BEGIN
  INSERT INTO public.crossword_preview_tickets (id, school_id, actor_id, set_id, token_hash, placement_hash, expires_at)
  VALUES (v_id, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000e1', 'th', current_setting('t.hash'), now() + interval '15 minutes');
  RETURN v_id;
END $$;
CREATE FUNCTION pg_temp.make_puzzle(p_n integer, p_level public.crossword_level, p_play jsonb, p_classrooms uuid[]) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  SELECT (public.fn_save_crossword(pg_temp.ticket(p_n), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'th',
    '00000000-0000-4000-8000-0000000000e1', 'Puzzle ' || p_n, p_level, '{}'::jsonb, '{"words":5}'::jsonb,
    7::bigint, 1, current_setting('t.hash'), 3, 4, pg_temp.words(), 25, 5, NULL) ->> 'puzzleId')::uuid INTO v_id;
  UPDATE public.crossword_puzzles SET settings = jsonb_build_object('play', p_play) WHERE id = v_id;
  PERFORM public.fn_publish_crossword(v_id, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', p_classrooms, NULL, NULL);
  RETURN v_id;
END $$;

SELECT set_config('t.pn', pg_temp.make_puzzle(1, 'normal',
  '{"prefillPercent":10,"revealsPerStudent":2,"checksAllowed":5,"checkMode":"onRequest","chosungAllowed":true}'::jsonb,
  ARRAY['00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2']::uuid[])::text, true);
SELECT set_config('t.pe', pg_temp.make_puzzle(2, 'easy',
  '{"prefillPercent":25,"revealsPerStudent":3,"checksAllowed":null,"checkMode":"anytime","chosungAllowed":true}'::jsonb,
  ARRAY['00000000-0000-4000-8000-0000000000d1']::uuid[])::text, true);
SELECT set_config('t.ph', pg_temp.make_puzzle(3, 'hard',
  '{"prefillPercent":0,"revealsPerStudent":1,"checksAllowed":3,"checkMode":"onRequest","chosungAllowed":false}'::jsonb,
  ARRAY['00000000-0000-4000-8000-0000000000d1']::uuid[])::text, true);
SELECT set_config('t.pl', pg_temp.make_puzzle(4, 'normal',
  '{"prefillPercent":0,"revealsPerStudent":0,"checksAllowed":0,"checkMode":"submitOnly","chosungAllowed":false}'::jsonb,
  ARRAY['00000000-0000-4000-8000-0000000000d1']::uuid[])::text, true);

SELECT set_config('t.an', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.pn')::uuid AND classroom_id = '00000000-0000-4000-8000-0000000000d1'), true);
SELECT set_config('t.an2', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.pn')::uuid AND classroom_id = '00000000-0000-4000-8000-0000000000d2'), true);
SELECT set_config('t.ae', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.pe')::uuid), true);
SELECT set_config('t.ah', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.ph')::uuid), true);
SELECT set_config('t.al', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.pl')::uuid), true);


CREATE FUNCTION pg_temp.s(p_n integer) RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-0000000000c' || p_n)::uuid $$;
CREATE FUNCTION pg_temp.start(p_student integer, p_assignment text) RETURNS uuid LANGUAGE sql AS $$
  SELECT (public.fn_crossword_play_start(pg_temp.s(p_student), p_assignment::uuid, '{}') ->> 'attemptId')::uuid $$;

-- A role that, like supabase_auth_admin, can delete profiles and has no right on any crossword table.
-- (postgres cannot grant on auth.users or SET ROLE supabase_auth_admin, so the probe deletes the profile row, which is
-- exactly what the auth.users cascade does next: profiles -> students -> members -> trigger.)
CREATE ROLE erasure_probe NOLOGIN;
GRANT DELETE, SELECT ON public.profiles TO erasure_probe;
GRANT erasure_probe TO CURRENT_USER;
CREATE POLICY erasure_probe_delete ON public.profiles FOR ALL TO erasure_probe USING (true);  -- rolled back with the test

-- Student 1 (b1) has an attempt with events; student 4 (b4) has a shared attempt with student 5's membership.
SELECT set_config('t.a1', pg_temp.start(1, current_setting('t.an'))::text, true);
INSERT INTO public.crossword_attempt_events (attempt_id, actor_student_id, kind, source, detail) VALUES
  (current_setting('t.a1')::uuid, pg_temp.s(1), 'check', 'hint', '{"scope":"word","words":[{"number":1,"direction":"across"}]}'),
  (current_setting('t.a1')::uuid, pg_temp.s(1), 'entry', 'autosave', '{}');
SELECT set_config('t.a4', pg_temp.start(4, current_setting('t.an'))::text, true);
INSERT INTO public.crossword_attempt_members (attempt_id, assignment_id, student_id)
  VALUES (current_setting('t.a4')::uuid, current_setting('t.an')::uuid, pg_temp.s(5));

SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.a1')::uuid), 2, 'setup: the attempt has events');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE proname = 'fn_crossword_attempt_members_cleanup'), 'the member cleanup trigger function is SECURITY DEFINER');
SELECT ok((SELECT proconfig::text LIKE '%search_path=pg_catalog, public%' FROM pg_proc WHERE proname = 'fn_crossword_attempt_members_cleanup'), 'its search_path is pinned');
SELECT ok(NOT has_function_privilege('authenticated', 'public.fn_crossword_attempt_members_cleanup()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.fn_crossword_attempt_members_cleanup()', 'EXECUTE'), 'API roles still cannot execute it');
SELECT ok(NOT has_table_privilege('erasure_probe', 'public.crossword_attempts', 'DELETE'), 'the probe role has no right on the attempts table, like supabase_auth_admin');

-- Erase the student the way deleteUser does (profile row; the real call also removes the auth row).
SET LOCAL ROLE erasure_probe;
DELETE FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b1';
RESET ROLE;

SELECT is((SELECT count(*)::int FROM public.students WHERE id = pg_temp.s(1)), 0, 'the student is removed');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b1'), 0, 'the profile is removed');
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), 0, 'the attempt is removed');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_members WHERE attempt_id = current_setting('t.a1')::uuid), 0, 'the members are removed');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.a1')::uuid), 0, 'the events are removed');

-- Shared-attempt shape: erasing one member through auth keeps the attempt for the other (doc 06 §12.5 G4 is still open).
SET LOCAL ROLE erasure_probe;
DELETE FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b4';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE id = current_setting('t.a4')::uuid), 1, 'a shared attempt survives the erasure of one member');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_members WHERE attempt_id = current_setting('t.a4')::uuid), 1, 'the other member is still there');
SELECT is((SELECT count(*)::int FROM public.students WHERE id = pg_temp.s(4)), 0, 'the erased student is removed');

SELECT * FROM finish();
ROLLBACK;
