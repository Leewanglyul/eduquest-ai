BEGIN;
SELECT plan(33);

-- TV-1: fn_crossword_assignment_progress (docs/m2/14, docs/m2/16). Teacher visibility of Student Play progress, read through a
-- service-role function. The access control is the check inside it: classroom owner, co-teacher of THAT classroom, or the
-- school's admin. Puzzle ownership or management alone is not enough (fn_crossword_actor_manages is puzzle-level).
--
-- Fixtures (rolled back) come from 00013: teacher t1 (0001, owner of classroom d1 and of the puzzles), students c1, c4, c5
-- (c1 and c4 in d1, c1 also in d2), classrooms d1 and d2, the normal puzzle assigned to both (assignment t.an in d1, t.an2 in d2).
-- Added here: co-teacher d7 of d1, a teacher d8 who owns d2 only, an admin d9, a teacher da of another school, a suspended
-- teacher db, and students c6 (removed from d1), c8 (never started), c9 (second member of c4's attempt).


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


-- ---- extra fixtures ----------------------------------------------------------------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000d7', 'co@t.invalid'),
  ('00000000-0000-4000-8000-0000000000d8', 'other@t.invalid'),
  ('00000000-0000-4000-8000-0000000000d9', 'admin@t.invalid'),
  ('00000000-0000-4000-8000-0000000000da', 'foreign@t.invalid'),
  ('00000000-0000-4000-8000-0000000000db', 'susp@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b6', 's6@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b8', 's8@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b9', 's9@t.invalid')
) AS v(id, email);
INSERT INTO public.profiles (id, school_id, role, display_name, status) VALUES
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'CoTeacher', 'active'),
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'OtherTeacher', 'active'),
  ('00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000a1', 'admin', 'Admin', 'active'),
  ('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-0000000000a2', 'teacher', 'ForeignTeacher', 'active'),
  ('00000000-0000-4000-8000-0000000000db', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'Suspended', 'suspended'),
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-0000000000a1', 'student', 'S6', 'active'),
  ('00000000-0000-4000-8000-0000000000b8', '00000000-0000-4000-8000-0000000000a1', 'student', 'S8', 'active'),
  ('00000000-0000-4000-8000-0000000000b9', '00000000-0000-4000-8000-0000000000a1', 'student', 'S9', 'active');
INSERT INTO public.students (id, school_id, profile_id, student_no, grade) VALUES
  ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b6', '6', '1'),
  ('00000000-0000-4000-8000-0000000000c8', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b8', '8', '1'),
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b9', '9', '1');
INSERT INTO public.classroom_teachers (classroom_id, teacher_id) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d7');
-- d2 belongs to another teacher; t1 (puzzle owner) is not staff of d2, and d8 manages the puzzle only through d2.
UPDATE public.classrooms SET owner_id = '00000000-0000-4000-8000-0000000000d8' WHERE id = '00000000-0000-4000-8000-0000000000d2';
INSERT INTO public.classroom_enrollments (classroom_id, student_id) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c6'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c8'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c9');

CREATE FUNCTION pg_temp.s(p_n integer) RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-0000000000c' || p_n)::uuid $$;
CREATE FUNCTION pg_temp.start(p_student integer, p_assignment text) RETURNS uuid LANGUAGE sql AS $$
  SELECT (public.fn_crossword_play_start(pg_temp.s(p_student), p_assignment::uuid, '{}') ->> 'attemptId')::uuid $$;
CREATE FUNCTION pg_temp.rev(p_attempt uuid) RETURNS bigint LANGUAGE sql AS $$ SELECT revision FROM public.crossword_attempts WHERE id = p_attempt $$;
CREATE FUNCTION pg_temp.err(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'no error'; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $$;
CREATE FUNCTION pg_temp.prog(p_actor uuid, p_assignment text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_catalog.string_agg(student_no || ':' || state || ':' || filled_count || ':' || wrong_submits, ' ' ORDER BY student_no)
  FROM public.fn_crossword_assignment_progress(p_actor, '00000000-0000-4000-8000-0000000000a1', p_assignment::uuid) $$;

-- c1: completes the puzzle in d1 after one word check. c4: fills every cell wrong and submits once. c9: second member of c4's
-- attempt. c6: starts, then is removed from d1. c8: never starts. c1 also has a one-letter attempt in d2.
SELECT set_config('t.c1', pg_temp.start(1, current_setting('t.an'))::text, true);
SELECT public.fn_crossword_play_save(pg_temp.s(1), current_setting('t.c1')::uuid,
  '{"0,0":"사","0,1":"과","1,1":"일","1,2":"기","2,2":"차","2,3":"례"}'::jsonb, 0);
SELECT public.fn_crossword_play_check(pg_temp.s(1), current_setting('t.c1')::uuid, 'word', ARRAY['0,0','0,1'], pg_temp.rev(current_setting('t.c1')::uuid));
SELECT public.fn_crossword_play_submit(pg_temp.s(1), current_setting('t.c1')::uuid, pg_temp.rev(current_setting('t.c1')::uuid));
SELECT set_config('t.c4', pg_temp.start(4, current_setting('t.an'))::text, true);
SELECT public.fn_crossword_play_save(pg_temp.s(4), current_setting('t.c4')::uuid,
  '{"0,0":"가","0,1":"가","1,1":"가","1,2":"가","2,2":"가","2,3":"가"}'::jsonb, 0);
SELECT public.fn_crossword_play_submit(pg_temp.s(4), current_setting('t.c4')::uuid, pg_temp.rev(current_setting('t.c4')::uuid));
INSERT INTO public.crossword_attempt_members (attempt_id, assignment_id, student_id)
  VALUES (current_setting('t.c4')::uuid, current_setting('t.an')::uuid, pg_temp.s(9));
SELECT set_config('t.c6', pg_temp.start(6, current_setting('t.an'))::text, true);
UPDATE public.classroom_enrollments SET status = 'removed', removed_at = now()
  WHERE classroom_id = '00000000-0000-4000-8000-0000000000d1' AND student_id = pg_temp.s(6);
SELECT set_config('t.c1b', pg_temp.start(1, current_setting('t.an2'))::text, true);
SELECT public.fn_crossword_play_save(pg_temp.s(1), current_setting('t.c1b')::uuid, '{"0,0":"사"}'::jsonb, 0);

-- ---- A. structure and privileges --------------------------------------------------------------------------------------
SELECT has_function('public', 'fn_crossword_assignment_progress', ARRAY['uuid', 'uuid', 'uuid'], 'the progress function exists');
SELECT is((SELECT array_agg(u.n ORDER BY u.o) FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS u(n, m, o)
  WHERE p.oid = 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)'::regprocedure AND u.m = 't'),
  ARRAY['student_id','student_no','display_name','state','filled_count','total_cells','last_saved_at','completed_at','checks_used','reveals_used','chosung_used','wrong_submits'],
  'the result columns are exactly the allow-list: no cells, keys, detail or answer');
SELECT ok(NOT has_function_privilege('anon', 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot execute it');
SELECT ok(NOT has_function_privilege('authenticated', 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)', 'EXECUTE'), 'authenticated cannot execute it');
SELECT ok(has_function_privilege('service_role', 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)', 'EXECUTE'), 'service_role can execute it');
SELECT ok((SELECT NOT prosecdef AND proconfig::text LIKE '%search_path=pg_catalog, public%' FROM pg_proc
  WHERE oid = 'public.fn_crossword_assignment_progress(uuid,uuid,uuid)'::regprocedure), 'SECURITY INVOKER with a pinned search_path');
SELECT ok((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
  ('public.crossword_attempts'::regclass, 'public.crossword_attempt_members'::regclass, 'public.crossword_attempt_events'::regclass))
  AND (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'crossword_attempt%') = 0
  AND NOT has_table_privilege('authenticated', 'public.crossword_attempts', 'SELECT'),
  'the attempt tables are unchanged: RLS on, no policy, no client privilege');

-- ---- B. who may read ---------------------------------------------------------------------------------------------------
SELECT is(pg_temp.prog('00000000-0000-4000-8000-000000000001', current_setting('t.an')), '1:completed:6:0 4:in_progress:6:1 8:not_started:0:0 9:in_progress:6:1',
  'owner of d1 sees d1: completed, in progress, not started, and the second member of the shared attempt');
SELECT is(pg_temp.prog('00000000-0000-4000-8000-0000000000d7', current_setting('t.an')), '1:completed:6:0 4:in_progress:6:1 8:not_started:0:0 9:in_progress:6:1',
  'a co-teacher of d1 sees the same');
SELECT is(pg_temp.prog('00000000-0000-4000-8000-0000000000d9', current_setting('t.an')), '1:completed:6:0 4:in_progress:6:1 8:not_started:0:0 9:in_progress:6:1',
  'the school admin sees the same (read-only)');
SELECT throws_ok(format($f$SELECT * FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000a1', %L)$f$, current_setting('t.an')),
  'P0001', 'CROSSWORD_NOT_FOUND', 'a teacher of the same school who is not staff of d1 is refused');
SELECT ok(public.fn_crossword_actor_manages('00000000-0000-4000-8000-0000000000d8', 'teacher', current_setting('t.pn')::uuid),
  'precondition: d8 DOES manage the puzzle (through d2): the puzzle-level helper would have let them in');
SELECT throws_ok(format($f$SELECT * FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', %L)$f$, current_setting('t.an2')),
  'P0001', 'CROSSWORD_NOT_FOUND', 'the puzzle owner t1 is not staff of d2 and cannot read the d2 assignment');
SELECT throws_ok(format($f$SELECT * FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-0000000000a2', %L)$f$, current_setting('t.an')),
  'P0001', 'CROSSWORD_NOT_FOUND', 'a teacher of another school, using their own school id, is refused');
SELECT throws_ok(format($f$SELECT * FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-0000000000a1', %L)$f$, current_setting('t.an')),
  'P0001', 'CROSSWORD_FORBIDDEN', 'a teacher of another school, using the assignment school id, is refused as not a member');
SELECT throws_ok(format($f$SELECT * FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', %L)$f$, current_setting('t.an')),
  'P0001', 'CROSSWORD_FORBIDDEN', 'a student id is refused');
SELECT throws_ok(format($f$SELECT * FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-0000000000db', '00000000-0000-4000-8000-0000000000a1', %L)$f$, current_setting('t.an')),
  'P0001', 'CROSSWORD_FORBIDDEN', 'a suspended teacher is refused');
SELECT is(
  pg_temp.err(format($f$SELECT * FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', %L)$f$, '00000000-0000-4000-8000-00000000ffff')),
  pg_temp.err(format($f$SELECT * FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000a1', %L)$f$, current_setting('t.an'))),
  'an unknown assignment id and a forbidden one give the same message: a guessed id learns nothing');

-- ---- C. two classrooms, one puzzle ------------------------------------------------------------------------------------
SELECT is(pg_temp.prog('00000000-0000-4000-8000-0000000000d8', current_setting('t.an2')), '1:in_progress:1:0',
  'the owner of d2 sees only d2: student 1 with one letter, none of the d1 students');
SELECT is(pg_temp.prog('00000000-0000-4000-8000-0000000000d9', current_setting('t.an2')), '1:in_progress:1:0', 'the admin sees d2 the same way');
SELECT is(pg_temp.prog('00000000-0000-4000-8000-000000000001', current_setting('t.an')) LIKE '1:completed:6:0%', true,
  'the same student is completed in d1 and in progress in d2: assignments do not mix');

-- ---- D. roster and numbers ---------------------------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid) WHERE student_no IN ('5','6')), 0,
  'a student removed from the classroom (6) and a student enrolled nowhere (5) are not listed');
SELECT is((SELECT array_agg(student_no ORDER BY n) FROM (SELECT student_no, row_number() OVER () AS n
  FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid)) q),
  ARRAY['1','4','8','9'], 'listed in student number order, never by progress');
SELECT is((SELECT count(DISTINCT total_cells)::int || ':' || min(total_cells) FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid)),
  '1:6', 'total_cells is the distinct cells of the puzzle (6), the same on every row');
SELECT is((SELECT filled_count FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid) WHERE student_no = '1'),
  (SELECT filled_count FROM public.fn_crossword_play_list(pg_temp.s(1)) WHERE assignment_id = current_setting('t.an')::uuid),
  'filled_count equals what the student own list shows');
SELECT is((SELECT checks_used || ':' || reveals_used || ':' || chosung_used || ':' || (last_saved_at IS NOT NULL) || ':' || (completed_at IS NOT NULL)
  FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid) WHERE student_no = '1'),
  '1:0:0:true:true', 'counters and times of the completed attempt: one check, saved, completed');
SELECT is((SELECT last_saved_at IS NULL AND completed_at IS NULL AND checks_used = 0 AND wrong_submits = 0 AND filled_count = 0
  FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid) WHERE student_no = '8'),
  true, 'a student who never started has zeros and no times');
SELECT is((SELECT wrong_submits FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid) WHERE student_no = '4'),
  (SELECT count(*)::int FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.c4')::uuid AND kind = 'submit_wrong'),
  'wrong_submits equals the number of submit_wrong events');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.c1')::uuid AND kind = 'submit_wrong')
  + (SELECT wrong_submits FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid) WHERE student_no = '1'), 0,
  'a completing submit adds neither a wrong submit nor an event');
SELECT is((SELECT filled_count FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid) WHERE student_no = '4'),
  (SELECT filled_count FROM public.fn_crossword_assignment_progress('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', current_setting('t.an')::uuid) WHERE student_no = '9'),
  'both members of a shared attempt show the same progress');

-- ---- E. states of the assignment ----------------------------------------------------------------------------------------
UPDATE public.crossword_assignments SET status = 'closed', closed_at = now() WHERE id = current_setting('t.an2')::uuid;
SELECT is(pg_temp.prog('00000000-0000-4000-8000-0000000000d8', current_setting('t.an2')), '1:in_progress:1:0', 'a closed assignment can still be read');
UPDATE public.classrooms SET archived_at = now() WHERE id = '00000000-0000-4000-8000-0000000000d2';
SELECT is(pg_temp.prog('00000000-0000-4000-8000-0000000000d8', current_setting('t.an2')), '1:in_progress:1:0', 'so can an assignment of an archived classroom');

-- ---- F. read-only -------------------------------------------------------------------------------------------------------
CREATE TEMP TABLE before_counts AS SELECT
  (SELECT count(*) FROM public.crossword_attempts) a, (SELECT count(*) FROM public.crossword_attempt_members) m, (SELECT count(*) FROM public.crossword_attempt_events) e;
SELECT pg_temp.prog('00000000-0000-4000-8000-000000000001', current_setting('t.an'));
SELECT is((SELECT (SELECT count(*) FROM public.crossword_attempts) = b.a AND (SELECT count(*) FROM public.crossword_attempt_members) = b.m
  AND (SELECT count(*) FROM public.crossword_attempt_events) = b.e FROM before_counts b), true, 'reading progress changes nothing');

SELECT * FROM finish();
ROLLBACK;
