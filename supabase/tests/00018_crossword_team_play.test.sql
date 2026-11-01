BEGIN;
SELECT plan(67);

-- M2-3.4 P2 migration B: team play (P2 implementation package, PM 2026-11-01; E-1 (b), E-2, E-3, E-8 (b), D-4 to D-10)
-- and the individual-mode regression of the functions it modifies. Fixtures as in 00017. Grid: 1A 사과 (0,0 0,1),
-- 2D 과일 (0,1 1,1), 3A 일기 (1,1 1,2), 4D 기차 (1,2 2,2), 5A 차례 (2,2 2,3). Teams on t.a1: 1팀 = c1 c2 c3, 2팀 = c4;
-- c5 and c6 start without a team. t.a2 stays individual (c7). Concurrency is serialized by the attempt and team row locks
-- and is not exercised here (one session).

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
CREATE FUNCTION pg_temp.x(p_name text) RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('t.' || p_name)::uuid $$;
CREATE FUNCTION pg_temp.rev(p_attempt uuid) RETURNS bigint LANGUAGE sql AS $$ SELECT revision FROM public.crossword_attempts WHERE id = p_attempt $$;
CREATE FUNCTION pg_temp.writer(p_attempt uuid, p_key text) RETURNS uuid LANGUAGE sql AS $$
  SELECT student_id FROM public.crossword_attempt_cell_writers WHERE attempt_id = p_attempt AND cell_key = p_key $$;
CREATE FUNCTION pg_temp.credits(p_attempt uuid, p_num int, p_dir text) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE(string_agg('c' || right(student_id::text, 1), ',' ORDER BY student_id), '')
  FROM public.crossword_attempt_word_credits WHERE attempt_id = p_attempt AND number = p_num AND direction = p_dir::public.crossword_direction $$;
CREATE FUNCTION pg_temp.solved(p_attempt uuid) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(number || left(direction::text, 1), ',' ORDER BY number, direction), '')
  FROM public.crossword_attempt_word_solves WHERE attempt_id = p_attempt $$;

SELECT public.fn_set_crossword_assignment_mode(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), 'team');
SELECT set_config('t.T1', public.fn_crossword_team_create(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), '1팀') ->> 'teamId', true);
SELECT set_config('t.T2', public.fn_crossword_team_create(pg_temp.t1(), pg_temp.sch(), pg_temp.a1(), '2팀') ->> 'teamId', true);
SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), pg_temp.x('T1'), pg_temp.s(n)) FROM generate_series(1, 3) n;
SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), pg_temp.x('T2'), pg_temp.s(4));

-- ---- Privileges ----
SELECT ok(NOT bool_or(has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE'))
          AND bool_and(has_function_privilege('service_role', f, 'EXECUTE')),
          'new and replaced play functions: service_role only')
FROM unnest(ARRAY['public.fn_crossword_play_is_team(uuid)', 'public.fn_crossword_team_record_solves(uuid,text[])',
  'public.fn_crossword_team_play_start(uuid,uuid,text[])', 'public.fn_crossword_play_list(uuid)',
  'public.fn_crossword_team_state(uuid,uuid,bigint)', 'public.fn_crossword_team_help_request(uuid,uuid)',
  'public.fn_crossword_play_start(uuid,uuid,text[])', 'public.fn_crossword_play_save(uuid,uuid,jsonb,integer)',
  'public.fn_crossword_play_reveal(uuid,uuid,text,bigint)', 'public.fn_crossword_play_submit(uuid,uuid,bigint)']) f;
SELECT is((SELECT count(*)::int FROM pg_proc WHERE pronamespace = 'public'::regnamespace
           AND proname IN ('fn_crossword_play_is_team', 'fn_crossword_team_record_solves', 'fn_crossword_team_play_start',
             'fn_crossword_play_list', 'fn_crossword_team_state', 'fn_crossword_team_help_request', 'fn_crossword_play_start',
             'fn_crossword_play_save', 'fn_crossword_play_reveal', 'fn_crossword_play_submit')
           AND NOT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public']), 10,
          'all ten are SECURITY INVOKER with a pinned search_path');

-- ---- List (D-4) ----
SELECT is((SELECT play_mode::text || ':' || team_waiting FROM public.fn_crossword_play_list(pg_temp.s(5)) WHERE assignment_id = pg_temp.a1()),
          'team:true', 'a student without a team sees the team assignment as waiting for a team');
SELECT is((SELECT team_waiting FROM public.fn_crossword_play_list(pg_temp.s(1)) WHERE assignment_id = pg_temp.a1()), false,
          'a student with a team is not waiting');
SELECT is((SELECT play_mode::text || ':' || team_waiting FROM public.fn_crossword_play_list(pg_temp.s(7)) WHERE assignment_id = pg_temp.a2()),
          'individual:false', 'an individual assignment is never waiting');
SELECT is(pg_get_function_result('public.fn_crossword_play_list(uuid)'::regprocedure),
          'TABLE(assignment_id uuid, puzzle_id uuid, title text, classroom_id uuid, classroom_name text, level crossword_level, word_count integer, total_cells integer, closes_at timestamp with time zone, attempt_id uuid, attempt_status crossword_attempt_status, filled_count integer, readonly boolean, play_mode crossword_play_mode, team_waiting boolean)',
          'the first 13 list columns are unchanged, two are added at the end');

-- ---- Start ----
SELECT throws_ok($$SELECT public.fn_crossword_play_start(pg_temp.s(5), pg_temp.a1(), '{}')$$,
                 'P0001', 'CROSSWORD_PLAY_NO_TEAM', 'a student without a team cannot start');
SELECT set_config('t.x', public.fn_crossword_play_start(pg_temp.s(1), pg_temp.a1(), '{}') ->> 'attemptId', true);
SELECT is((SELECT attempt_id FROM public.crossword_teams WHERE id = pg_temp.x('T1')), pg_temp.x('x'), 'the first start creates the team attempt');
SELECT is(public.fn_crossword_play_start(pg_temp.s(2), pg_temp.a1(), '{}'),
          jsonb_build_object('attemptId', current_setting('t.x'), 'created', false, 'status', 'in_progress'), 'a teammate joins the same attempt');
SELECT is(public.fn_crossword_play_start(pg_temp.s(1), pg_temp.a1(), '{}') ->> 'attemptId', current_setting('t.x'), 'starting again resumes');
SELECT public.fn_crossword_play_start(pg_temp.s(3), pg_temp.a1(), '{}');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_members WHERE attempt_id = pg_temp.x('x')), 3, 'three members share it');
SELECT set_config('t.y', public.fn_crossword_play_start(pg_temp.s(4), pg_temp.a1(), ARRAY['2,2','2,3']) ->> 'attemptId', true);
SELECT is((SELECT count(DISTINCT attempt_id)::int FROM public.crossword_attempt_members WHERE assignment_id = pg_temp.a1()), 2,
          'one attempt per team');
SELECT is(pg_temp.solved(pg_temp.x('y')) || '|' || pg_temp.credits(pg_temp.x('y'), 5, 'across'), '5a|',
          'a word made only of prefilled cells is solved at the start, with no credit');

-- ---- Save: real changes only, writers, solves, credits ----
SELECT is(public.fn_crossword_play_save(pg_temp.s(1), pg_temp.x('x'), '{"0,0":"사"}', 0), '{"revision":1,"filled":1}'::jsonb,
          'the save result keeps its shape {revision, filled}');
SELECT is(pg_temp.writer(pg_temp.x('x'), '0,0'), pg_temp.s(1), 'the writer of 0,0 is c1');
SELECT is((public.fn_crossword_play_save(pg_temp.s(2), pg_temp.x('x'), '{"0,0":"사"}', 0) ->> 'revision')::int, 1,
          'the same letter again does not raise the revision');
SELECT is(pg_temp.writer(pg_temp.x('x'), '0,0'), pg_temp.s(1), 'and does not change the writer');
SELECT ok((SELECT bool_and(last_active_at IS NOT NULL) FROM public.crossword_attempt_members
           WHERE attempt_id = pg_temp.x('x') AND student_id IN (pg_temp.s(1), pg_temp.s(2)))
          AND (SELECT last_active_at IS NULL FROM public.crossword_attempt_members WHERE attempt_id = pg_temp.x('x') AND student_id = pg_temp.s(3)),
          'last_active_at is set only for students who saved');
SELECT is((public.fn_crossword_play_save(pg_temp.s(2), pg_temp.x('x'), '{"0,1":"과"}', 0) ->> 'revision')::int, 2, 'a real change raises it');
SELECT is(pg_temp.solved(pg_temp.x('x')), '1a', 'the save that completes 1 across records the solve (E-1 (b))');
SELECT is(pg_temp.credits(pg_temp.x('x'), 1, 'across'), 'c1,c2', 'both writers of the word are credited (E-8 (b))');
SELECT is(public.fn_crossword_play_save(pg_temp.s(3), pg_temp.x('x'), '{"0,1":"고"}', 0) ->> 'revision', '3', 'c3 overwrites a letter of the solved word');
SELECT is(pg_temp.solved(pg_temp.x('x')) || '|' || pg_temp.credits(pg_temp.x('x'), 1, 'across'), '1a|c1,c2',
          'the solve and its credits stay (D-7, D-10)');
SELECT is(pg_temp.writer(pg_temp.x('x'), '0,1'), pg_temp.s(3), 'the writer follows the change');
SELECT public.fn_crossword_play_save(pg_temp.s(3), pg_temp.x('x'), '{"0,1":null}', 0);
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_cell_writers WHERE attempt_id = pg_temp.x('x') AND cell_key = '0,1'), 0,
          'clearing a cell removes its writer row');
SELECT public.fn_crossword_play_save(pg_temp.s(3), pg_temp.x('x'), '{"0,1":"과","1,1":"일"}', 0);
SELECT is(pg_temp.credits(pg_temp.x('x'), 1, 'across'), 'c1,c2', 'credits are not recalculated when the word is correct again (D-10)');
SELECT is(pg_temp.credits(pg_temp.x('x'), 2, 'down'), 'c3', '2 down is credited to its writer');

-- ---- Reveal (D-5) and check ----
SELECT is(public.fn_crossword_play_reveal(pg_temp.s(1), pg_temp.x('x'), '1,2', 0) ->> 'char', '기', 'team reveal accepts an older base revision (D-5)');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_cell_writers WHERE attempt_id = pg_temp.x('x') AND cell_key = '1,2'), 0,
          'a revealed cell has no writer');
SELECT is(pg_temp.solved(pg_temp.x('x')) || '|' || pg_temp.credits(pg_temp.x('x'), 3, 'across'), '1a,2d,3a|c3',
          'the reveal completes 3 across; only the typed cell is credited');
SELECT throws_ok(format($$SELECT public.fn_crossword_play_check(%L, %L, 'word', ARRAY['0,0','0,1'], 0)$$, pg_temp.s(1), pg_temp.x('x')),
                 'P0001', 'CROSSWORD_PLAY_STALE', 'team check still validates the revision (D-5)');
SELECT lives_ok(format($$SELECT public.fn_crossword_play_check(%L, %L, 'word', ARRAY['0,0','0,1'], %s)$$, pg_temp.s(1), pg_temp.x('x'), pg_temp.rev(pg_temp.x('x'))),
                'a check on the current revision works');
SELECT is((public.fn_crossword_team_state(pg_temp.s(2), pg_temp.x('x'), 0) -> 'used')::text, '{"checks": 1, "chosung": 0, "reveals": 1, "wrongSubmits": 0}',
          'teammates see the shared team totals (G5)');
SELECT public.fn_crossword_play_reveal(pg_temp.s(2), pg_temp.x('x'), '2,3', 0);
SELECT throws_ok(format($$SELECT public.fn_crossword_play_reveal(%L, %L, '2,2', 0)$$, pg_temp.s(3), pg_temp.x('x')),
                 'P0001', 'CROSSWORD_PLAY_REVEAL_LIMIT', 'the reveal budget is shared by the team (D-6)');

-- ---- Team state (E-3, E-9, D-8) ----
SELECT is(public.fn_crossword_team_state(pg_temp.s(1), pg_temp.x('x'), pg_temp.rev(pg_temp.x('x'))) ? 'cells', false,
          'an unchanged revision sends no cells');
SELECT is((public.fn_crossword_team_state(pg_temp.s(1), pg_temp.x('x'), 0) -> 'otherKeys')::text, '["0,1", "1,1"]',
          'otherKeys lists the cells written by someone else');
SELECT ok(NOT (public.fn_crossword_team_state(pg_temp.s(1), pg_temp.x('x'), 0)::text ~ '00000000-0000-4000-8000-0000000000c'),
          'the state carries no student id');
SELECT is(public.fn_crossword_team_state(pg_temp.s(1), pg_temp.x('x'), 0) ? 'participation', false,
          'participation is hidden before completion (D-8)');
SELECT is((public.fn_crossword_team_state(pg_temp.s(1), pg_temp.x('x'), 0) -> 'given')::text, '{"1,2": "기", "2,3": "례"}', 'given holds the revealed letters');
SELECT throws_ok(format($$SELECT public.fn_crossword_team_state(%L, %L, 0)$$, pg_temp.s(4), pg_temp.x('x')),
                 'P0001', 'CROSSWORD_PLAY_NOT_FOUND', 'another team cannot read the state');

-- ---- Help request (D-9) ----
SELECT is(public.fn_crossword_team_help_request(pg_temp.s(1), pg_temp.x('x')) ->> 'created', 'true', 'a teammate asks for help');
SELECT is(public.fn_crossword_team_help_request(pg_temp.s(2), pg_temp.x('x')) ->> 'created', 'false', 'a second ask returns the open request');
SELECT is((SELECT count(*)::int FROM public.crossword_team_help_requests WHERE team_id = pg_temp.x('T1')), 1, 'one open request per team');
SELECT is(public.fn_crossword_team_state(pg_temp.s(3), pg_temp.x('x'), 0) ->> 'helpOpen', 'true', 'the whole team sees it');
SELECT public.fn_crossword_team_help_resolve(pg_temp.t1(), pg_temp.sch(), id) FROM public.crossword_team_help_requests WHERE team_id = pg_temp.x('T1');
SELECT throws_ok(format($$SELECT public.fn_crossword_team_help_request(%L, %L)$$, pg_temp.s(2), pg_temp.x('x')),
                 'P0001', 'CROSSWORD_PLAY_HELP_COOLDOWN', 'a new request within 60 s of the resolution is refused');
UPDATE public.crossword_team_help_requests SET created_at = now() - interval '2 minutes', resolved_at = now() - interval '61 seconds'
WHERE team_id = pg_temp.x('T1');
SELECT is(public.fn_crossword_team_help_request(pg_temp.s(2), pg_temp.x('x')) ->> 'created', 'true', 'after the cooldown a new request is created');

-- ---- Submit (E-2) and participation (D-8, D-10) ----
SELECT public.fn_crossword_play_save(pg_temp.s(2), pg_temp.x('x'), '{"2,2":"차"}', 0);
SELECT is(pg_temp.solved(pg_temp.x('x')), '1a,2d,3a,4d,5a', 'all five words are solved');
SELECT is(public.fn_crossword_play_submit(pg_temp.s(1), pg_temp.x('x'), 0) ->> 'result', 'completed', 'team submit ignores an older base revision (E-2)');
SELECT is((public.fn_crossword_team_state(pg_temp.s(1), pg_temp.x('x'), 0) -> 'participation')::text, '{"me": true, "all": true}',
          'after completion the participation and "모두 참여 달성" are shown (D-8)');
-- A student added after completion is not in the population (D-10 rule 6).
SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), pg_temp.x('T1'), pg_temp.s(6));
SELECT is(public.fn_crossword_play_start(pg_temp.s(6), pg_temp.a1(), '{}') ->> 'status', 'completed', 'a late joiner of a completed team sees it read-only');
UPDATE public.crossword_attempt_members SET joined_at = now() + interval '1 minute' WHERE attempt_id = pg_temp.x('x') AND student_id = pg_temp.s(6);
SELECT is((public.fn_crossword_team_state(pg_temp.s(6), pg_temp.x('x'), 0) -> 'participation')::text, '{"me": false, "all": true}',
          'joining after completion inherits no credit and does not break the team result');

-- Late joiner before completion who earns no credit (2팀: c4 plays, c5 joins late).
SELECT public.fn_crossword_play_save(pg_temp.s(4), pg_temp.x('y'), '{"0,0":"사","0,1":"과","1,1":"일","1,2":"기"}', 0);
SELECT public.fn_crossword_team_assign(pg_temp.t1(), pg_temp.sch(), pg_temp.x('T2'), pg_temp.s(5));
SELECT public.fn_crossword_play_start(pg_temp.s(5), pg_temp.a1(), '{}');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_word_credits WHERE attempt_id = pg_temp.x('y') AND student_id = pg_temp.s(5)), 0,
          'a late joiner inherits no earlier credit (D-10)');
SELECT is(public.fn_crossword_play_submit(pg_temp.s(5), pg_temp.x('y'), 0) ->> 'result', 'completed', 'any member may submit');
SELECT is((public.fn_crossword_team_state(pg_temp.s(4), pg_temp.x('y'), 0) -> 'participation')::text, '{"me": true, "all": false}',
          'a member without a credit makes "모두 참여 달성" false');

-- ---- Individual mode regression (t.a2, c7) ----
SELECT set_config('t.i', public.fn_crossword_play_start(pg_temp.s(7), pg_temp.a2(), '{}') ->> 'attemptId', true);
SELECT is(public.fn_crossword_play_save(pg_temp.s(7), pg_temp.x('i'), '{"0,0":"사"}', 0), '{"revision":1,"filled":1}'::jsonb, 'individual save as before');
SELECT is((public.fn_crossword_play_save(pg_temp.s(7), pg_temp.x('i'), '{"0,0":"사"}', 0) ->> 'revision')::int, 2,
          'individual mode still raises the revision on any non-empty patch');
SELECT public.fn_crossword_play_save(pg_temp.s(7), pg_temp.x('i'), '{"0,1":"과"}', 0);
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_cell_writers WHERE attempt_id = pg_temp.x('i'))
        + (SELECT count(*)::int FROM public.crossword_attempt_word_solves WHERE attempt_id = pg_temp.x('i')), 0,
          'individual attempts record no writers and no solves');
SELECT is((SELECT last_active_at FROM public.crossword_attempt_members WHERE attempt_id = pg_temp.x('i')), NULL, 'nor last_active_at');
SELECT throws_ok(format($$SELECT public.fn_crossword_play_reveal(%L, %L, '1,1', 0)$$, pg_temp.s(7), pg_temp.x('i')),
                 'P0001', 'CROSSWORD_PLAY_STALE', 'individual reveal still requires the current revision');
SELECT throws_ok(format($$SELECT public.fn_crossword_play_submit(%L, %L, 0)$$, pg_temp.s(7), pg_temp.x('i')),
                 'P0001', 'CROSSWORD_PLAY_STALE', 'individual submit still requires the current revision');
SELECT throws_ok(format($$SELECT public.fn_crossword_team_state(%L, %L, 0)$$, pg_temp.s(7), pg_temp.x('i')),
                 'P0001', 'CROSSWORD_PLAY_NOT_FOUND', 'an individual attempt has no team state');
SELECT throws_ok(format($$SELECT public.fn_crossword_team_help_request(%L, %L)$$, pg_temp.s(7), pg_temp.x('i')),
                 'P0001', 'CROSSWORD_PLAY_NOT_FOUND', 'an individual attempt cannot ask for team help');

-- ---- Erasure (G4) ----
CREATE ROLE erasure_probe NOLOGIN;
GRANT DELETE, SELECT ON public.profiles TO erasure_probe;
GRANT erasure_probe TO CURRENT_USER;
CREATE POLICY erasure_probe_delete ON public.profiles FOR ALL TO erasure_probe USING (true);
SET LOCAL ROLE erasure_probe;
DELETE FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b3';
RESET ROLE;
SELECT is(pg_temp.solved(pg_temp.x('x')), '1a,2d,3a,4d,5a', 'erasing a teammate keeps the solves');
SELECT is(pg_temp.credits(pg_temp.x('x'), 2, 'down') || '|' || pg_temp.credits(pg_temp.x('x'), 1, 'across'), '|c1,c2',
          'only the erased student''s credits go');
SELECT ok(pg_temp.writer(pg_temp.x('x'), '0,1') IS NULL AND pg_temp.writer(pg_temp.x('x'), '1,1') IS NULL
          AND (SELECT count(*)::int FROM public.crossword_attempt_cell_writers WHERE attempt_id = pg_temp.x('x') AND cell_key IN ('0,1','1,1')) = 2,
          'their cells keep a detached (NULL) writer');
SET LOCAL ROLE erasure_probe;
DELETE FROM public.profiles WHERE id IN ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b6');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE id = pg_temp.x('x'))
        + (SELECT count(*)::int FROM public.crossword_attempt_word_solves WHERE attempt_id = pg_temp.x('x')), 0,
          'erasing every member removes the attempt and its solves');
SELECT is((SELECT attempt_id FROM public.crossword_teams WHERE id = pg_temp.x('T1')), NULL, 'the team is kept with no attempt');

SELECT * FROM finish();
ROLLBACK;
