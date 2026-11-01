BEGIN;
SELECT plan(61);

-- M2-3.4 P2 migration A: teacher team functions (P2 implementation package, PM 2026-11-01; D-1, D-2, D-3, D-9).
-- Fixtures (rolled back): teacher t1 (0001, owner of classroom d1 and of the puzzle), co-teacher d7 of d1, teacher d8
-- (owner of d2 only), admin d9, teacher da of another school, suspended teacher db; students c1 to c6 in d1, c7 in d2.
-- The puzzle (5 words, 6 cells) is assigned to d1 (t.a1, made a team assignment here) and d2 (t.a2, individual).

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000b1', 's1@t.invalid'), ('00000000-0000-4000-8000-0000000000b2', 's2@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b3', 's3@t.invalid'), ('00000000-0000-4000-8000-0000000000b4', 's4@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b5', 's5@t.invalid'), ('00000000-0000-4000-8000-0000000000b6', 's6@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b7', 's7@t.invalid'),
  ('00000000-0000-4000-8000-0000000000d7', 'co@t.invalid'), ('00000000-0000-4000-8000-0000000000d8', 'other@t.invalid'),
  ('00000000-0000-4000-8000-0000000000d9', 'admin@t.invalid'), ('00000000-0000-4000-8000-0000000000da', 'foreign@t.invalid'),
  ('00000000-0000-4000-8000-0000000000db', 'susp@t.invalid')
) AS v(id, email);
INSERT INTO public.profiles (id, school_id, role, display_name, status) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'student', 'S1', 'active'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'student', 'S2', 'active'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 'student', 'S3', 'active'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a1', 'student', 'S4', 'active'),
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-0000000000a1', 'student', 'S5', 'active'),
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-0000000000a1', 'student', 'S6', 'active'),
  ('00000000-0000-4000-8000-0000000000b7', '00000000-0000-4000-8000-0000000000a1', 'student', 'S7', 'active'),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'CoTeacher', 'active'),
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'OtherTeacher', 'active'),
  ('00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000a1', 'admin', 'Admin', 'active'),
  ('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-0000000000a2', 'teacher', 'ForeignTeacher', 'active'),
  ('00000000-0000-4000-8000-0000000000db', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'Suspended', 'suspended');
INSERT INTO public.students (id, school_id, profile_id, student_no, grade)
SELECT ('00000000-0000-4000-8000-0000000000c' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
       ('00000000-0000-4000-8000-0000000000b' || n)::uuid, n::text, '1'
FROM generate_series(1, 7) n;
INSERT INTO public.classrooms (id, school_id, owner_id, name) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'A'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'B');
INSERT INTO public.classroom_enrollments (classroom_id, student_id)
SELECT '00000000-0000-4000-8000-0000000000d1', ('00000000-0000-4000-8000-0000000000c' || n)::uuid FROM generate_series(1, 6) n;
INSERT INTO public.classroom_enrollments (classroom_id, student_id) VALUES
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c7');
INSERT INTO public.classroom_teachers (classroom_id, teacher_id) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d7');

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
SELECT set_config('t.a1', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.p')::uuid AND classroom_id = '00000000-0000-4000-8000-0000000000d1'), true);
SELECT set_config('t.a2', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.p')::uuid AND classroom_id = '00000000-0000-4000-8000-0000000000d2'), true);
-- d2 belongs to d8 from here on.
UPDATE public.classrooms SET owner_id = '00000000-0000-4000-8000-0000000000d8' WHERE id = '00000000-0000-4000-8000-0000000000d2';

CREATE FUNCTION pg_temp.s(p_n integer) RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-0000000000c' || p_n)::uuid $$;
CREATE FUNCTION pg_temp.u(p_x text) RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-0000000000' || p_x)::uuid $$;
CREATE FUNCTION pg_temp.t1() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
CREATE FUNCTION pg_temp.sch() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-0000000000a1'::uuid $$;
CREATE FUNCTION pg_temp.a1() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('t.a1')::uuid $$;
CREATE FUNCTION pg_temp.a2() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('t.a2')::uuid $$;
CREATE FUNCTION pg_temp.size(p_team uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.crossword_team_members WHERE team_id = p_team $$;
SELECT set_config('t.audit0', (SELECT count(*)::text FROM public.audit_logs), true);

-- ---- Privileges ----
SELECT ok(NOT bool_or(has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE')),
          'no team admin function is executable by anon or authenticated')
FROM unnest(ARRAY['public.fn_crossword_team_actor_ok(uuid,uuid,uuid,boolean)', 'public.fn_crossword_team_for_write(uuid,uuid,uuid)',
  'public.fn_set_crossword_assignment_mode(uuid,uuid,uuid,text)', 'public.fn_crossword_team_create(uuid,uuid,uuid,text)',
  'public.fn_crossword_team_delete(uuid,uuid,uuid)', 'public.fn_crossword_team_assign(uuid,uuid,uuid,uuid)',
  'public.fn_crossword_team_unassign(uuid,uuid,uuid,uuid)', 'public.fn_crossword_team_list(uuid,uuid,uuid)',
  'public.fn_crossword_team_help_resolve(uuid,uuid,uuid)']) f;
SELECT ok(bool_and(has_function_privilege('service_role', f, 'EXECUTE')), 'every team admin function is executable by service_role')
FROM unnest(ARRAY['public.fn_crossword_team_actor_ok(uuid,uuid,uuid,boolean)', 'public.fn_crossword_team_for_write(uuid,uuid,uuid)',
  'public.fn_set_crossword_assignment_mode(uuid,uuid,uuid,text)', 'public.fn_crossword_team_create(uuid,uuid,uuid,text)',
  'public.fn_crossword_team_delete(uuid,uuid,uuid)', 'public.fn_crossword_team_assign(uuid,uuid,uuid,uuid)',
  'public.fn_crossword_team_unassign(uuid,uuid,uuid,uuid)', 'public.fn_crossword_team_list(uuid,uuid,uuid)',
  'public.fn_crossword_team_help_resolve(uuid,uuid,uuid)']) f;
SELECT is((SELECT count(*)::int FROM pg_proc WHERE pronamespace = 'public'::regnamespace
           AND proname IN ('fn_crossword_team_actor_ok', 'fn_crossword_team_for_write', 'fn_set_crossword_assignment_mode',
             'fn_crossword_team_create', 'fn_crossword_team_delete', 'fn_crossword_team_assign', 'fn_crossword_team_unassign',
             'fn_crossword_team_list', 'fn_crossword_team_help_resolve')
           AND NOT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public']), 9,
          'all nine are SECURITY INVOKER with a pinned search_path');

-- ---- Play mode ----
SELECT is(public.fn_set_crossword_assignment_mode(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), 'team') ->> 'playMode', 'team', 'the owner sets team mode');
SELECT is((SELECT play_mode::text FROM public.crossword_assignments WHERE id = pg_temp.a1()), 'team', 'the assignment is team mode');
SELECT lives_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), 'team')$$, 'the same mode again is a no-op');
SELECT is(public.fn_set_crossword_assignment_mode(pg_temp.u('d7'), pg_temp.sch(), pg_temp.a1(), 'individual') ->> 'playMode', 'individual',
          'a co-teacher may change the mode (D-1)');
SELECT lives_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.u('d7'), pg_temp.sch(), pg_temp.a1(), 'team')$$, 'and back to team');
SELECT throws_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.u('d8'), pg_temp.sch(), pg_temp.a1(), 'individual')$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'a teacher of another classroom gets NOT_FOUND');
SELECT throws_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.u('d9'), pg_temp.sch(), pg_temp.a1(), 'individual')$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'the admin may not change the mode (D-1, read-only)');
SELECT throws_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.u('da'), pg_temp.sch(), pg_temp.a1(), 'individual')$$,
                 'P0001', 'CROSSWORD_FORBIDDEN', 'a teacher of another school is refused');
SELECT throws_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.u('db'), pg_temp.sch(), pg_temp.a1(), 'individual')$$,
                 'P0001', 'CROSSWORD_FORBIDDEN', 'a suspended teacher is refused');
SELECT throws_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), 'pairs')$$,
                 'P0001', 'CROSSWORD_BAD_MODE', 'an unknown mode is refused');
SELECT throws_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.t1(), pg_temp.sch(), '00000000-0000-4000-8000-00000000dead', 'team')$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'an unknown assignment gets NOT_FOUND');

-- ---- Create ----
SELECT set_config('t.T1', public.fn_crossword_team_create(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), '1팀') ->> 'teamId', true);
SELECT isnt(current_setting('t.T1'), NULL, 'the owner creates team 1팀');
SELECT is(public.fn_crossword_team_create(pg_temp.u('d7'), pg_temp.sch(), pg_temp.a1(), '  2팀 ') ->> 'label', '2팀', 'a co-teacher creates a team; the label is trimmed');
SELECT set_config('t.T2', (SELECT id::text FROM public.crossword_teams WHERE assignment_id = pg_temp.a1() AND label = '2팀'), true);
SELECT throws_ok($$SELECT public.fn_crossword_team_create(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), '   ')$$,
                 'P0001', 'CROSSWORD_BAD_LABEL', 'an empty label is refused');
SELECT throws_ok($$SELECT public.fn_crossword_team_create(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), repeat('가', 21))$$,
                 'P0001', 'CROSSWORD_BAD_LABEL', 'a label longer than 20 is refused');
SELECT throws_ok($$SELECT public.fn_crossword_team_create(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), '1팀')$$,
                 'P0001', 'CROSSWORD_TEAM_LABEL_TAKEN', 'a duplicate label is refused');
SELECT throws_ok($$SELECT public.fn_crossword_team_create(pg_temp.u('d8'), pg_temp.sch(), pg_temp.a2(), '1팀')$$,
                 'P0001', 'CROSSWORD_NOT_TEAM_MODE', 'an individual assignment gets no team');
SELECT throws_ok($$SELECT public.fn_crossword_team_create(pg_temp.u('d8'), pg_temp.sch(), pg_temp.a1(), '9팀')$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'a teacher of another classroom cannot create a team');
SELECT throws_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), 'individual')$$,
                 'P0001', 'CROSSWORD_TEAMS_EXIST', 'team to individual is refused while teams exist');

-- ---- Assign (D-2) ----
SELECT is(public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(1)) ->> 'moved', 'false', 'c1 joins 1팀');
SELECT is(public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(1)) ->> 'moved', 'false', 'the same team again is a no-op');
SELECT is(pg_temp.size(current_setting('t.T1')::uuid), 1, 'still one row');
SELECT throws_ok($$SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(7))$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'a student of another classroom cannot be assigned');
SELECT throws_ok($$SELECT public.fn_crossword_team_assign(pg_temp.u('d8'), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(2))$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'a teacher of another classroom cannot assign');
SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(n)) FROM generate_series(2, 4) n;
SELECT is(pg_temp.size(current_setting('t.T1')::uuid), 4, '1팀 has four members');
SELECT throws_ok($$SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(5))$$,
                 'P0001', 'CROSSWORD_TEAM_FULL', 'a fifth member is refused (max 4)');
SELECT is(public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T2')::uuid, pg_temp.s(4)) ->> 'moved', 'true',
          'c4 moves to 2팀 before the start');
SELECT ok(pg_temp.size(current_setting('t.T1')::uuid) = 3 AND pg_temp.size(current_setting('t.T2')::uuid) = 1, 'the move leaves 3 and 1');
SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(5));
-- A member who left the classroom does not count toward the maximum.
UPDATE public.classroom_enrollments SET status = 'removed', removed_at = now()
WHERE classroom_id = '00000000-0000-4000-8000-0000000000d1' AND student_id = pg_temp.s(5);
SELECT lives_ok($$SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(6))$$,
                'a member who left the classroom does not count toward the maximum');
SELECT public.fn_crossword_team_unassign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(6));
UPDATE public.classroom_enrollments SET status = 'active', removed_at = NULL
WHERE classroom_id = '00000000-0000-4000-8000-0000000000d1' AND student_id = pg_temp.s(5);
SELECT public.fn_crossword_team_unassign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(5));

-- ---- List (D-1 read, D-2 warning) ----
SELECT is((SELECT count(*)::int FROM public.fn_crossword_team_list(pg_temp.t1(), pg_temp.sch(), pg_temp.a1())), 6,
          'the list has one row per member and per unassigned student (3 + 1 + 2)');
SELECT is((SELECT string_agg(label || ':' || member_count || ':' || under_min, ',' ORDER BY label)
           FROM (SELECT DISTINCT label, member_count, under_min FROM public.fn_crossword_team_list(pg_temp.t1(), pg_temp.sch(), pg_temp.a1())
                 WHERE team_id IS NOT NULL) x), '1팀:3:false,2팀:1:true', 'counts and the fewer-than-3 warning (D-2)');
SELECT is((SELECT string_agg(student_no, ',' ORDER BY student_no) FROM public.fn_crossword_team_list(pg_temp.t1(), pg_temp.sch(), pg_temp.a1())
           WHERE team_id IS NULL), '5,6', 'unassigned students are listed with no team');
SELECT lives_ok($$SELECT * FROM public.fn_crossword_team_list(pg_temp.u('d9'), pg_temp.sch(), pg_temp.a1())$$, 'the admin may read the list (D-1)');
SELECT throws_ok($$SELECT * FROM public.fn_crossword_team_list(pg_temp.u('d8'), pg_temp.sch(), pg_temp.a1())$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'a teacher of another classroom cannot read the list');
SELECT is(pg_get_function_result('public.fn_crossword_team_list(uuid,uuid,uuid)'::regprocedure),
          'TABLE(team_id uuid, label text, started boolean, member_count integer, under_min boolean, help_open boolean, student_id uuid, student_no text, display_name text)',
          'the list returns only the allow-listed columns (no cells, solves or credits)');

-- ---- Unassign and delete before the start ----
SELECT is(public.fn_crossword_team_unassign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T2')::uuid, pg_temp.s(4)) ->> 'removed', 'true',
          'a member is removed before the start');
SELECT is(public.fn_crossword_team_unassign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T2')::uuid, pg_temp.s(4)) ->> 'removed', 'false',
          'removing a non-member is a no-op');
SELECT set_config('t.T3', public.fn_crossword_team_create(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), '3팀') ->> 'teamId', true);
SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T3')::uuid, pg_temp.s(4));
SELECT throws_ok($$SELECT public.fn_crossword_team_delete(pg_temp.u('d8'), pg_temp.sch(), current_setting('t.T3')::uuid)$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'a teacher of another classroom cannot delete a team');
SELECT lives_ok($$SELECT public.fn_crossword_team_delete(pg_temp.t1(), pg_temp.sch(), current_setting('t.T3')::uuid)$$, 'a team is deleted before the start');
SELECT is((SELECT count(*)::int FROM public.crossword_team_members WHERE team_id = current_setting('t.T3')::uuid), 0, 'its member rows go with it');
SELECT throws_ok($$SELECT public.fn_crossword_team_delete(pg_temp.t1(), pg_temp.sch(), current_setting('t.T3')::uuid)$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'an unknown team gets NOT_FOUND');

-- ---- After the start (D-3) ----
SELECT set_config('t.x1', public.fn_crossword_play_start(pg_temp.s(1), pg_temp.a1(), '{}') ->> 'attemptId', true);
SELECT is((SELECT attempt_id::text FROM public.crossword_teams WHERE id = current_setting('t.T1')::uuid), current_setting('t.x1'), '1팀 has started');
SELECT throws_ok($$SELECT public.fn_crossword_team_unassign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(2))$$,
                 'P0001', 'CROSSWORD_TEAM_STARTED', 'removing a member after the start is refused');
SELECT throws_ok($$SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T2')::uuid, pg_temp.s(1))$$,
                 'P0001', 'CROSSWORD_TEAM_STARTED', 'moving a member out of a started team is refused');
SELECT throws_ok($$SELECT public.fn_crossword_team_delete(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid)$$,
                 'P0001', 'CROSSWORD_TEAM_STARTED', 'deleting a started team is refused');
SELECT is(public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(6)) ->> 'moved', 'false',
          'a late student may be added to a started team');
SELECT throws_ok($$SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T1')::uuid, pg_temp.s(5))$$,
                 'P0001', 'CROSSWORD_TEAM_FULL', 'the maximum still holds after the start');
SELECT ok((SELECT bool_and(started) FROM public.fn_crossword_team_list(pg_temp.t1(), pg_temp.sch(), pg_temp.a1()) WHERE label = '1팀'),
          'the list shows 1팀 as started');

-- The mode lock (P1 trigger) through the function: an individual assignment with an attempt cannot become team.
SELECT public.fn_crossword_play_start(pg_temp.s(7), pg_temp.a2(), '{}');
SELECT throws_ok($$SELECT public.fn_set_crossword_assignment_mode(pg_temp.u('d8'), pg_temp.sch(), pg_temp.a2(), 'team')$$,
                 'P0001', 'CROSSWORD_PLAY_MODE_LOCKED', 'the mode is locked after the first attempt');

-- ---- Help resolve (D-1, D-9) ----
SELECT set_config('t.h1', (public.fn_crossword_team_help_request(pg_temp.s(1), current_setting('t.x1')::uuid) ->> 'open'), true);
SELECT set_config('t.h1', (SELECT id::text FROM public.crossword_team_help_requests WHERE team_id = current_setting('t.T1')::uuid), true);
SELECT ok((SELECT bool_and(help_open) FROM public.fn_crossword_team_list(pg_temp.t1(), pg_temp.sch(), pg_temp.a1()) WHERE label = '1팀'),
          'the list shows the open help request');
SELECT throws_ok($$SELECT public.fn_crossword_team_help_resolve(pg_temp.u('d8'), pg_temp.sch(), current_setting('t.h1')::uuid)$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'a teacher of another classroom cannot resolve');
SELECT throws_ok($$SELECT public.fn_crossword_team_help_resolve(pg_temp.u('d9'), pg_temp.sch(), current_setting('t.h1')::uuid)$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'the admin cannot resolve (read-only)');
SELECT set_config('t.r1', public.fn_crossword_team_help_resolve(pg_temp.u('d7'), pg_temp.sch(), current_setting('t.h1')::uuid) ->> 'resolvedAt', true);
SELECT is((SELECT resolved_by FROM public.crossword_team_help_requests WHERE id = current_setting('t.h1')::uuid), pg_temp.u('d7'),
          'a co-teacher resolves the request');
SELECT is(public.fn_crossword_team_help_resolve(pg_temp.t1(), pg_temp.sch(), current_setting('t.h1')::uuid) ->> 'resolvedAt', current_setting('t.r1'),
          'resolving again keeps the first resolution');
SELECT throws_ok($$SELECT public.fn_crossword_team_help_resolve(pg_temp.t1(), pg_temp.sch(), '00000000-0000-4000-8000-00000000dead')$$,
                 'P0001', 'CROSSWORD_NOT_FOUND', 'an unknown request gets NOT_FOUND');

-- ---- Closed assignment ----
UPDATE public.crossword_assignments SET status = 'closed', closed_at = now() WHERE id = pg_temp.a1();
SELECT throws_ok($$SELECT public.fn_crossword_team_create(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), '4팀')$$,
                 'P0001', 'CROSSWORD_ASSIGNMENT_NOT_OPEN', 'no team is created on a closed assignment');
SELECT throws_ok($$SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), current_setting('t.T2')::uuid, pg_temp.s(5))$$,
                 'P0001', 'CROSSWORD_ASSIGNMENT_NOT_OPEN', 'no student is assigned on a closed assignment');

-- ---- No audit row (open item: audit_action has no team values) ----
SELECT is((SELECT count(*)::text FROM public.audit_logs), current_setting('t.audit0'), 'team functions write no audit row');

SELECT * FROM finish();
ROLLBACK;
