BEGIN;
SELECT plan(33);

-- Gate 3 PLAY-E5-1, migration 20261103000001: the puzzle input mode and the save function's character rule.
-- Fixtures as in 00018 (rolled back). Grid: 1A 사과 (0,0 0,1), 2D 과일 (0,1 1,1), 3A 일기 (1,1 1,2), 4D 기차 (1,2 2,2),
-- 5A 차례 (2,2 2,3). Puzzle P is all Hangul. Puzzle M is the same grid with 5A = 차A, so cell 2,3 is the latin A.
-- P on d1 is a team assignment (1팀 = c1 c2); P and M on d2 are individual (c7).

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT ('00000000-0000-4000-8000-0000000000b' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       's' || n || '@t.invalid'
FROM unnest(ARRAY[1, 2, 7]) n;
INSERT INTO public.profiles (id, school_id, role, display_name, status)
SELECT ('00000000-0000-4000-8000-0000000000b' || n)::uuid, '00000000-0000-4000-8000-0000000000a1', 'student', 'S' || n, 'active'
FROM unnest(ARRAY[1, 2, 7]) n;
INSERT INTO public.students (id, school_id, profile_id, student_no, grade)
SELECT ('00000000-0000-4000-8000-0000000000c' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
       ('00000000-0000-4000-8000-0000000000b' || n)::uuid, n::text, '1'
FROM unnest(ARRAY[1, 2, 7]) n;
INSERT INTO public.classrooms (id, school_id, owner_id, name) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'A'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'B');
INSERT INTO public.classroom_enrollments (classroom_id, student_id) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c2'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c7');

INSERT INTO public.content_sets (id, school_id, owner_id, classroom_id, title) VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d1', 'S1');
INSERT INTO public.content_entries (id, set_id, position, term, definition, answer, script, normalizer_version) VALUES
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000e1', 1, '사과', 'c1', '사과', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-0000000000e1', 2, '과일', 'c2', '과일', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f003', '00000000-0000-4000-8000-0000000000e1', 3, '일기', 'c3', '일기', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f004', '00000000-0000-4000-8000-0000000000e1', 4, '기차', 'c4', '기차', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f005', '00000000-0000-4000-8000-0000000000e1', 5, '차례', 'c5', '차례', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f006', '00000000-0000-4000-8000-0000000000e1', 6, '차A', 'c6', '차A', 'mixed', 1);

-- The five words with 5A = p_last (entry f005 for 차례, f006 for 차A).
CREATE FUNCTION pg_temp.words(p_last text, p_entry text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(
    '{"number":1,"direction":"across","row":0,"col":0,"answer":"사과","clue":"빨간 과일","entryId":"00000000-0000-4000-8000-00000000f001"}'::jsonb,
    '{"number":2,"direction":"down","row":0,"col":1,"answer":"과일","clue":"먹는 것","entryId":"00000000-0000-4000-8000-00000000f002"}'::jsonb,
    '{"number":3,"direction":"across","row":1,"col":1,"answer":"일기","clue":"매일 쓰는 글","entryId":"00000000-0000-4000-8000-00000000f003"}'::jsonb,
    '{"number":4,"direction":"down","row":1,"col":2,"answer":"기차","clue":"레일 위의 탈것","entryId":"00000000-0000-4000-8000-00000000f004"}'::jsonb,
    jsonb_build_object('number', 5, 'direction', 'across', 'row', 2, 'col', 2, 'answer', p_last, 'clue', '순서',
                       'entryId', '00000000-0000-4000-8000-00000000' || p_entry)) $$;
-- Saves and publishes one puzzle to the given classrooms; returns its id.
CREATE FUNCTION pg_temp.make_puzzle(p_n integer, p_words jsonb, p_classrooms uuid[]) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_ticket uuid := ('00000000-0000-4000-8000-0000000a000' || p_n)::uuid;
  v_hash text := public.fn_crossword_placement_hash(1, 3, 4, p_words);
  v_id uuid;
BEGIN
  INSERT INTO public.crossword_preview_tickets (id, school_id, actor_id, set_id, token_hash, placement_hash, expires_at)
  VALUES (v_ticket, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000e1', 'th', v_hash, now() + interval '15 minutes');
  SELECT (public.fn_save_crossword(v_ticket, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'th',
    '00000000-0000-4000-8000-0000000000e1', 'Puzzle ' || p_n, 'normal', '{}'::jsonb, '{"words":5}'::jsonb,
    7::bigint, 1, v_hash, 3, 4, p_words, 25, 5, NULL) ->> 'puzzleId')::uuid INTO v_id;
  UPDATE public.crossword_puzzles SET settings = jsonb_build_object('play',
    '{"prefillPercent":0,"revealsPerStudent":2,"checksAllowed":5,"checkMode":"onRequest","chosungAllowed":true}'::jsonb)
  WHERE id = v_id;
  PERFORM public.fn_publish_crossword(v_id, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', p_classrooms, NULL, NULL);
  RETURN v_id;
END $$;

SELECT set_config('t.p', pg_temp.make_puzzle(1, pg_temp.words('차례', 'f005'),
  ARRAY['00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2']::uuid[])::text, true);
SELECT set_config('t.m', pg_temp.make_puzzle(2, pg_temp.words('차A', 'f006'),
  ARRAY['00000000-0000-4000-8000-0000000000d2']::uuid[])::text, true);
SELECT set_config('t.a1', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.p')::uuid AND classroom_id = '00000000-0000-4000-8000-0000000000d1'), true);
SELECT set_config('t.a2', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.p')::uuid AND classroom_id = '00000000-0000-4000-8000-0000000000d2'), true);
SELECT set_config('t.a3', (SELECT id::text FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.m')::uuid), true);

CREATE FUNCTION pg_temp.s(p_n integer) RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-0000000000c' || p_n)::uuid $$;
CREATE FUNCTION pg_temp.x(p_name text) RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('t.' || p_name)::uuid $$;
CREATE FUNCTION pg_temp.err(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'no error'; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $$;
CREATE FUNCTION pg_temp.save_err(p_student integer, p_attempt text, p_patch text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.err(format('SELECT public.fn_crossword_play_save(%L, %L, %L::jsonb, 0)', pg_temp.s(p_student), current_setting('t.' || p_attempt), p_patch)) $$;
CREATE FUNCTION pg_temp.save(p_student integer, p_attempt text, p_patch jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.fn_crossword_play_save(pg_temp.s(p_student), pg_temp.x(p_attempt), p_patch, 0) $$;
-- What a save can write: revision, cells, last saved time, cell writers, solved words.
CREATE FUNCTION pg_temp.fp(p_attempt text) RETURNS text LANGUAGE sql AS $$
  SELECT a.revision || '|' || a.cells::text || '|' || COALESCE(a.last_saved_at::text, '-') || '|' ||
         (SELECT count(*) FROM public.crossword_attempt_cell_writers w WHERE w.attempt_id = a.id) || '|' ||
         (SELECT count(*) FROM public.crossword_attempt_word_solves s WHERE s.attempt_id = a.id)
  FROM public.crossword_attempts a WHERE a.id = pg_temp.x(p_attempt) $$;

-- ---- The helper: shape and privileges ----
SELECT has_function('public', 'fn_crossword_play_input_mode', ARRAY['uuid'], 'fn_crossword_play_input_mode(uuid) exists');
SELECT is((SELECT provolatile::text || ':' || prosecdef::text || ':' || prorettype::regtype::text FROM pg_proc
           WHERE oid = 'public.fn_crossword_play_input_mode(uuid)'::regprocedure), 's:false:text',
          'the helper is STABLE, SECURITY INVOKER and returns text');
SELECT ok((SELECT proconfig @> ARRAY['search_path=pg_catalog, public'] FROM pg_proc
           WHERE oid = 'public.fn_crossword_play_input_mode(uuid)'::regprocedure), 'the helper pins its search_path');
SELECT ok(NOT bool_or(has_function_privilege(r, f, 'EXECUTE')), 'anon and authenticated cannot run the helper or the save')
FROM unnest(ARRAY['anon', 'authenticated']) r,
     unnest(ARRAY['public.fn_crossword_play_input_mode(uuid)', 'public.fn_crossword_play_save(uuid,uuid,jsonb,integer)']) f;
SELECT ok(bool_and(has_function_privilege('service_role', f, 'EXECUTE')), 'the service role runs both')
FROM unnest(ARRAY['public.fn_crossword_play_input_mode(uuid)', 'public.fn_crossword_play_save(uuid,uuid,jsonb,integer)']) f;
SELECT is((SELECT prosecdef::text || ':' || (proconfig @> ARRAY['search_path=pg_catalog, public'])::text FROM pg_proc
           WHERE oid = 'public.fn_crossword_play_save(uuid,uuid,jsonb,integer)'::regprocedure), 'false:true',
          'the replaced save is still SECURITY INVOKER with a pinned search_path');

-- ---- Derivation ----
SELECT is(public.fn_crossword_play_input_mode(pg_temp.x('p')), 'hangul', 'an all-Hangul puzzle is hangul');
SELECT is(public.fn_crossword_play_input_mode(pg_temp.x('m')), 'mixed', 'a puzzle with a latin cell is mixed');
SELECT is(public.fn_crossword_play_input_mode('00000000-0000-4000-8000-0000000fffff'), 'mixed', 'an unknown puzzle is mixed (no cell, no claim)');

-- ---- Individual, Hangul puzzle (c7 on a2) ----
SELECT set_config('t.i', public.fn_crossword_play_start(pg_temp.s(7), pg_temp.x('a2'), '{}') ->> 'attemptId', true);
SELECT is((pg_temp.save(7, 'i', '{"0,0":"사"}') ->> 'revision')::int, 1, 'individual hangul: a syllable is saved');
SELECT set_config('t.fp_i', pg_temp.fp('i'), true);
SELECT is(pg_temp.save_err(7, 'i', '{"0,1":"H"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'individual hangul: H is refused');
SELECT is(pg_temp.save_err(7, 'i', '{"0,1":"R"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'individual hangul: R is refused');
SELECT is(pg_temp.save_err(7, 'i', '{"0,1":"7"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'individual hangul: a digit is refused');
SELECT is(pg_temp.save_err(7, 'i', '{"0,1":"h"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'individual hangul: lowercase is refused');
SELECT is(pg_temp.save_err(7, 'i', '{"0,1":"ㅅ"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'individual hangul: a lone jamo is still refused');
SELECT is(pg_temp.save_err(7, 'i', '{"0,1":"과","1,1":"R"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'individual hangul: one bad cell refuses the whole patch');
SELECT is(pg_temp.fp('i'), current_setting('t.fp_i'), 'individual hangul: after the refusals no cell, revision or saved time changed');
SELECT is((pg_temp.save(7, 'i', '{"0,1":"과"}') ->> 'revision')::int, 2, 'individual hangul: the next valid save works');

-- ---- Team, Hangul puzzle (1팀 = c1 c2 on a1) ----
SELECT public.fn_set_crossword_assignment_mode('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', pg_temp.x('a1'), 'team');
SELECT set_config('t.T1', public.fn_crossword_team_create('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', pg_temp.x('a1'), '1팀') ->> 'teamId', true);
SELECT public.fn_crossword_team_assign('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', pg_temp.x('T1'), pg_temp.s(n)) FROM unnest(ARRAY[1, 2]) n;
SELECT set_config('t.t', public.fn_crossword_play_start(pg_temp.s(1), pg_temp.x('a1'), '{}') ->> 'attemptId', true);
SELECT is(public.fn_crossword_play_start(pg_temp.s(2), pg_temp.x('a1'), '{}') ->> 'attemptId', current_setting('t.t'), 'team: both members share one attempt');
SELECT is((pg_temp.save(1, 't', '{"0,0":"사"}') ->> 'revision')::int, 1, 'team hangul: a syllable is saved');
SELECT set_config('t.fp_t', pg_temp.fp('t'), true);
SELECT is(pg_temp.save_err(2, 't', '{"2,2":"H"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'team hangul: H is refused');
SELECT is(pg_temp.save_err(2, 't', '{"2,3":"R"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'team hangul: R is refused');
SELECT is(pg_temp.save_err(2, 't', '{"0,0":null,"2,2":"H"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'team hangul: a clear next to a bad cell is refused too');
SELECT is(pg_temp.fp('t'), current_setting('t.fp_t'), 'team hangul: no cell, revision, saved time, writer or solve changed');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_cell_writers WHERE attempt_id = pg_temp.x('t') AND student_id = pg_temp.s(2)), 0,
          'team hangul: the refused member has no writer record');
SELECT is((pg_temp.save(2, 't', '{"0,1":"과"}') ->> 'revision')::int, 2, 'team hangul: the next valid save works');

-- ---- Rows written before the migration are not touched ----
UPDATE public.crossword_attempts SET cells = cells || '{"2,2":"H","2,3":"R"}'::jsonb WHERE id = pg_temp.x('t');
SELECT is((pg_temp.save(1, 't', '{"1,1":"일"}') ->> 'revision')::int, 3, 'existing latin cells do not block a later valid save');
SELECT is((SELECT (cells ->> '2,2') || (cells ->> '2,3') FROM public.crossword_attempts WHERE id = pg_temp.x('t')), 'HR',
          'existing latin cells are kept as they are (no row is rewritten)');

-- ---- Mixed puzzle (c7 on a3) ----
SELECT set_config('t.mx', public.fn_crossword_play_start(pg_temp.s(7), pg_temp.x('a3'), '{}') ->> 'attemptId', true);
SELECT is((pg_temp.save(7, 'mx', '{"2,3":"A"}') ->> 'revision')::int, 1, 'mixed: a latin letter is saved');
SELECT is((pg_temp.save(7, 'mx', '{"2,3":"7"}') ->> 'revision')::int, 2, 'mixed: a digit is saved');
SELECT is((pg_temp.save(7, 'mx', '{"0,0":"사"}') ->> 'revision')::int, 3, 'mixed: a syllable is saved');
SELECT is(pg_temp.save_err(7, 'mx', '{"2,3":"a"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'mixed: lowercase is still refused');
SELECT is(pg_temp.save_err(7, 'mx', '{"2,3":"AB"}'), 'CROSSWORD_PLAY_BAD_CHAR', 'mixed: two characters are still refused');

SELECT * FROM finish();
ROLLBACK;
