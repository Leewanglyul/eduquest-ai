BEGIN;
SELECT plan(209);

-- M2-2.4a F1: student crossword attempts, members, events and the fn_crossword_play_* functions
-- (docs/m2/07 B and G.3, docs/m2/08 B and H).
--
-- Fixtures (rolled back). Teacher t1 (…0001) and school a1 come from seed.sql.
-- Students b1 (student c1), b4 (c4), b5 (c5). d1 and d2 are live classrooms of t1; c1 and c4 are enrolled in d1,
-- c1 also in d2; c5 is enrolled nowhere. Puzzle words (doc 04 §2.7 plus 차례), cells:
--   0,0 사 · 0,1 과 · 1,1 일 · 1,2 기 · 2,2 차 · 2,3 례
--   1 across 사과 (0,0 0,1) · 2 down 과일 (0,1 1,1) · 3 across 일기 (1,1 1,2) · 4 down 기차 (1,2 2,2) · 5 across 차례 (2,2 2,3)
-- Four published puzzles in d1 (PM SP-1/SP-2 defaults): easy (anytime, unlimited checks, 3 reveals), normal (word checks,
-- 5 checks, 2 reveals), hard (word checks, 3 checks, 1 reveal) and 'locked' (a teacher override: no checks, no reveals,
-- no chosung). The normal one is also assigned to d2.

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
-- Saves, tunes the draft (level and play settings) and publishes a puzzle; returns the puzzle id.
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

-- Helpers. S1/S4/S5 are the student ids; err() returns the error message of a statement; hint() its HINT.
CREATE FUNCTION pg_temp.s(p_n integer) RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-0000000000c' || p_n)::uuid $$;
CREATE FUNCTION pg_temp.err(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'no error'; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $$;
CREATE FUNCTION pg_temp.hint(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE h text;
BEGIN EXECUTE p_sql; RETURN 'no error';
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT; RETURN h; END $$;
CREATE FUNCTION pg_temp.start(p_student integer, p_assignment text, p_prefill text[] DEFAULT '{}') RETURNS uuid LANGUAGE sql AS $$
  SELECT (public.fn_crossword_play_start(pg_temp.s(p_student), p_assignment::uuid, p_prefill) ->> 'attemptId')::uuid $$;
CREATE FUNCTION pg_temp.rev(p_attempt uuid) RETURNS bigint LANGUAGE sql AS $$ SELECT revision FROM public.crossword_attempts WHERE id = p_attempt $$;
CREATE FUNCTION pg_temp.save(p_student integer, p_attempt uuid, p_patch jsonb, p_ms integer DEFAULT 0) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.fn_crossword_play_save(pg_temp.s(p_student), p_attempt, p_patch, p_ms) $$;
CREATE FUNCTION pg_temp.chk(p_student integer, p_attempt uuid, p_scope text, p_keys text[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.fn_crossword_play_check(pg_temp.s(p_student), p_attempt, p_scope, p_keys, pg_temp.rev(p_attempt)) $$;
CREATE FUNCTION pg_temp.sub(p_student integer, p_attempt uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.fn_crossword_play_submit(pg_temp.s(p_student), p_attempt, pg_temp.rev(p_attempt)) $$;
CREATE FUNCTION pg_temp.fill_correct(p_student integer, p_attempt uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.save(p_student, p_attempt, '{"0,0":"사","0,1":"과","1,1":"일","1,2":"기","2,2":"차","2,3":"례"}'::jsonb) $$;

-- =====================================================================================================
-- A. Structure
-- =====================================================================================================
SELECT has_table('public', 'crossword_attempts', 'crossword_attempts exists');
SELECT has_table('public', 'crossword_attempt_members', 'crossword_attempt_members exists');
SELECT has_table('public', 'crossword_attempt_events', 'crossword_attempt_events exists');
SELECT ok((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
  ('public.crossword_attempts'::regclass, 'public.crossword_attempt_members'::regclass, 'public.crossword_attempt_events'::regclass)),
  'RLS is on for all three attempt tables');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename IN
  ('crossword_attempts', 'crossword_attempt_members', 'crossword_attempt_events')), 0, 'no policy on any attempt table');
SELECT hasnt_column('public', 'crossword_attempts', 'student_id', 'the attempt names no student');
SELECT hasnt_column('public', 'crossword_attempts', 'owner_id', 'the attempt has no single owner column');
SELECT has_column('public', 'crossword_attempt_members', 'student_id', 'ownership lives in the member table');
SELECT has_column('public', 'crossword_attempt_events', 'actor_student_id', 'events keep the actor apart from the owner');
SELECT is((SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'public.crossword_attempt_event_source'::regtype),
  ARRAY['manual_entry','hint','reveal','autosave','submit'], 'event sources: manual_entry, hint, reveal, autosave, submit');
SELECT is((SELECT count(*)::int FROM pg_publication_tables WHERE tablename LIKE 'crossword%'), 0, 'no crossword table is in a publication');

-- =====================================================================================================
-- B. Privileges: students and teachers reach nothing through the API
-- =====================================================================================================
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (p.proname LIKE 'fn\_crossword\_play\_%' OR p.proname IN ('fn_crossword_chosung', 'fn_crossword_attempt_limits', 'fn_crossword_event_detail_ok', 'fn_crossword_attempt_members_cleanup'))
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))), 0,
  'no play function is executable by authenticated or anon');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'fn\_crossword\_play\_%' AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')), 0,
  'service_role can execute every play function');
SELECT ok(NOT has_table_privilege('authenticated', 'public.crossword_attempts', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.crossword_attempt_events', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.crossword_attempt_members', 'INSERT'), 'no client table privilege on attempts, members or events');

-- =====================================================================================================
-- C. Access rule (A.1)
-- =====================================================================================================
SELECT is((SELECT reason FROM public.fn_crossword_play_access(pg_temp.s(1), current_setting('t.an')::uuid)), 'OPEN', 'enrolled student: open');
SELECT is((SELECT ok FROM public.fn_crossword_play_access(pg_temp.s(5), current_setting('t.an')::uuid)), false, 'not enrolled: no access');
SELECT is((SELECT reason FROM public.fn_crossword_play_access(pg_temp.s(5), current_setting('t.an')::uuid)), 'NOT_FOUND', 'not enrolled: not found');
SELECT is((SELECT reason FROM public.fn_crossword_play_access(pg_temp.s(1), gen_random_uuid())), 'NOT_FOUND', 'unknown assignment: not found');
SELECT is((SELECT reason FROM public.fn_crossword_play_access(gen_random_uuid(), current_setting('t.an')::uuid)), 'NOT_FOUND', 'unknown student: not found');
UPDATE public.classroom_enrollments SET status = 'removed', removed_at = now()
 WHERE student_id = pg_temp.s(4) AND classroom_id = '00000000-0000-4000-8000-0000000000d1';
SELECT is((SELECT reason FROM public.fn_crossword_play_access(pg_temp.s(4), current_setting('t.an')::uuid)), 'NOT_FOUND', 'removed enrollment: not found');
UPDATE public.classroom_enrollments SET status = 'active', removed_at = NULL
 WHERE student_id = pg_temp.s(4) AND classroom_id = '00000000-0000-4000-8000-0000000000d1';
SELECT is((SELECT reason FROM public.fn_crossword_play_access(pg_temp.s(4), current_setting('t.an')::uuid)), 'OPEN', 're-enrolled: open again');
UPDATE public.crossword_assignments SET opens_at = now() + interval '1 hour' WHERE id = current_setting('t.an')::uuid;
SELECT is((SELECT reason FROM public.fn_crossword_play_access(pg_temp.s(4), current_setting('t.an')::uuid)), 'NOT_OPEN_YET', 'before opens_at');
UPDATE public.crossword_assignments SET opens_at = NULL, closes_at = now() - interval '1 minute' WHERE id = current_setting('t.an')::uuid;
SELECT is((SELECT reason FROM public.fn_crossword_play_access(pg_temp.s(4), current_setting('t.an')::uuid)), 'CLOSED', 'after closes_at, no attempt: closed');
SELECT is((SELECT ok FROM public.fn_crossword_play_access(pg_temp.s(4), current_setting('t.an')::uuid)), false, 'after closes_at, no attempt: no access');
UPDATE public.crossword_assignments SET closes_at = NULL WHERE id = current_setting('t.an')::uuid;
UPDATE public.crossword_assignments SET status = 'closed', closed_at = now() WHERE id = current_setting('t.an')::uuid;
SELECT is((SELECT reason FROM public.fn_crossword_play_access(pg_temp.s(4), current_setting('t.an')::uuid)), 'CLOSED', 'closed by hand, no attempt: closed');
UPDATE public.crossword_assignments SET status = 'open', closed_at = NULL WHERE id = current_setting('t.an')::uuid;

-- =====================================================================================================
-- D. Start
-- =====================================================================================================
SELECT set_config('t.a1', pg_temp.start(1, current_setting('t.an'), ARRAY['2,3'])::text, true);
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE assignment_id = current_setting('t.an')::uuid), 1, 'first start creates one attempt');
SELECT is(pg_temp.start(1, current_setting('t.an'), ARRAY['0,0'])::text, current_setting('t.a1'), 'second start returns the same attempt');
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE assignment_id = current_setting('t.an')::uuid), 1, 'still one attempt after the second start');
SELECT is((SELECT prefill_keys FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), ARRAY['2,3'], 'prefill is frozen at creation, as keys');
SELECT is((SELECT (public.fn_crossword_play_start(pg_temp.s(1), current_setting('t.an')::uuid, '{}') ->> 'created')::boolean), false, 'start reports created=false on resume');
SELECT set_config('t.a4', pg_temp.start(4, current_setting('t.an'))::text, true);
SELECT isnt(current_setting('t.a4'), current_setting('t.a1'), 'two students, two attempts');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_members WHERE attempt_id = current_setting('t.a1')::uuid), 1, 'one member row');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.start(5, %L)$f$, current_setting('t.an'))), 'CROSSWORD_PLAY_NOT_FOUND', 'outsider cannot start');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.start(4, %L, ARRAY['9,9'])$f$, current_setting('t.ae'))), 'CROSSWORD_PLAY_BAD_CELL', 'prefill key outside the grid is refused');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_members (attempt_id, assignment_id, student_id) VALUES (%L, %L, %L)$f$,
  current_setting('t.a1'), current_setting('t.an'), pg_temp.s(1)), '23505', NULL, 'a student cannot be a member of two attempts of one assignment');
SELECT set_config('t.a1b', pg_temp.start(1, current_setting('t.an2'))::text, true);
SELECT isnt(current_setting('t.a1b'), current_setting('t.a1'), 'the same puzzle in two classrooms gives two attempts');
SELECT is((SELECT count(*)::int FROM public.fn_crossword_play_list(pg_temp.s(1))), 5, 'list: normal in d1 and d2, plus easy, hard and locked in d1');

-- =====================================================================================================
-- E. Save
-- =====================================================================================================
SELECT is((pg_temp.save(1, current_setting('t.a1')::uuid, '{"0,0":"사","0,1":"가"}'::jsonb) ->> 'revision')::int, 1, 'save bumps the revision');
SELECT is((SELECT cells FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), '{"0,0":"사","0,1":"가"}'::jsonb, 'cells hold what was typed');
SELECT is((pg_temp.save(1, current_setting('t.a1')::uuid, '{"1,1":"일"}'::jsonb) ->> 'revision')::int, 2, 'a second patch merges');
SELECT is((SELECT cells FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), '{"0,0":"사","0,1":"가","1,1":"일"}'::jsonb, 'merge keeps earlier cells');
SELECT is((pg_temp.save(1, current_setting('t.a1')::uuid, '{"0,1":null}'::jsonb) ->> 'filled')::int, 3, 'null removes a cell; filled counts typed plus prefilled cells');
SELECT is((SELECT cells FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), '{"0,0":"사","1,1":"일"}'::jsonb, 'null removed the key');
SELECT is((pg_temp.save(1, current_setting('t.a1')::uuid, '{}'::jsonb, 100) ->> 'revision')::int, 3, 'an empty patch does not bump the revision (three cell patches so far)');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"9,9":"사"}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CELL', 'a key outside the grid is refused');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"0,1":"ㅅ"}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CHAR', 'a lone jamo is refused');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"0,1":"a"}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CHAR', 'lowercase is refused');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"0,1":"사과"}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CHAR', 'two characters are refused');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"0,1":"😀"}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CHAR', 'emoji is refused');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"0,1":5}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CHAR', 'a number value is refused');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"2,3":"가"}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_LOCKED_CELL', 'a prefilled cell is locked');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '[]')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_PATCH', 'a non-object patch is refused');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, (SELECT jsonb_object_agg(g::text, '가') FROM generate_series(1, 226) g))$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_PATCH_TOO_LARGE', 'a patch over 225 keys is refused');
SELECT is((SELECT cells FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), '{"0,0":"사","1,1":"일"}'::jsonb, 'a refused patch changes nothing');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(4, %L, '{"0,0":"사"}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_NOT_FOUND', 'another student cannot save into this attempt');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"0,0":"사"}')$f$, gen_random_uuid())), 'CROSSWORD_PLAY_NOT_FOUND', 'unknown attempt: not found');
-- active time clamp: 100 000 ms asked, 2 s of wall clock since the previous save, 30 s cap
UPDATE public.crossword_attempts SET last_saved_at = now() - interval '2 seconds', active_ms = 0 WHERE id = current_setting('t.a1')::uuid;
SELECT pg_temp.save(1, current_setting('t.a1')::uuid, '{}'::jsonb, 100000);
SELECT is((SELECT active_ms FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), 2000::bigint, 'active time is clamped to the wall clock since the previous save');
UPDATE public.crossword_attempts SET last_saved_at = now() - interval '1 hour', active_ms = 0 WHERE id = current_setting('t.a1')::uuid;
SELECT pg_temp.save(1, current_setting('t.a1')::uuid, '{}'::jsonb, 100000);
SELECT is((SELECT active_ms FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), 30000::bigint, 'active time is capped at 30 s per save');
SELECT is((SELECT active_seconds FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), 30, 'active_seconds is derived');

-- closed, grace
UPDATE public.crossword_assignments SET closes_at = now() - interval '60 seconds' WHERE id = current_setting('t.an')::uuid;
SELECT is((SELECT readonly FROM public.fn_crossword_play_access(pg_temp.s(1), current_setting('t.an')::uuid)), true, 'past closes_at, with an attempt: read-only');
SELECT lives_ok(format($f$SELECT pg_temp.save(1, %L, '{"1,1":"일"}')$f$, current_setting('t.a1')), 'a save inside the 120 s grace is accepted');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'word', ARRAY['0,0','0,1'])$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_READONLY', 'a check after closes_at is refused');
UPDATE public.crossword_assignments SET closes_at = now() - interval '200 seconds' WHERE id = current_setting('t.an')::uuid;
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"1,1":"일"}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_READONLY', 'a save after the grace is refused');
UPDATE public.crossword_assignments SET closes_at = NULL WHERE id = current_setting('t.an')::uuid;
UPDATE public.crossword_assignments SET status = 'closed', closed_at = now() WHERE id = current_setting('t.an')::uuid;
SELECT is((SELECT save_allowed FROM public.fn_crossword_play_access(pg_temp.s(1), current_setting('t.an')::uuid)), false, 'closed by hand: no grace');
SELECT is((SELECT ok FROM public.fn_crossword_play_access(pg_temp.s(1), current_setting('t.an')::uuid)), true, 'closed by hand, with an attempt: still viewable');
SELECT is(pg_temp.start(1, current_setting('t.an'))::text, current_setting('t.a1'), 'closed: start resumes the existing attempt');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.start(5, %L)$f$, current_setting('t.an'))), 'CROSSWORD_PLAY_NOT_FOUND', 'closed: an outsider still gets not found');
UPDATE public.crossword_assignments SET status = 'open', closed_at = NULL WHERE id = current_setting('t.an')::uuid;

-- =====================================================================================================
-- F. Check (normal = onRequest, word scope only)
-- =====================================================================================================
SELECT pg_temp.save(1, current_setting('t.a1')::uuid, '{"0,1":"가"}'::jsonb);
SELECT is(pg_temp.chk(1, current_setting('t.a1')::uuid, 'word', ARRAY['0,0','0,1']) -> 'results',
  '[{"key":"0,0","status":"ok"},{"key":"0,1","status":"wrong"}]'::jsonb, 'word check: ok and wrong');
SELECT is(pg_temp.chk(1, current_setting('t.a1')::uuid, 'word', ARRAY['0,1','1,1']) -> 'results',
  '[{"key":"0,1","status":"wrong"},{"key":"1,1","status":"ok"}]'::jsonb, 'word check of the crossing word');
SELECT is(pg_temp.chk(1, current_setting('t.a1')::uuid, 'word', ARRAY['1,1','1,2']) -> 'results',
  '[{"key":"1,1","status":"ok"},{"key":"1,2","status":"empty"}]'::jsonb, 'an untouched cell is empty');
SELECT is(pg_temp.chk(1, current_setting('t.a1')::uuid, 'word', ARRAY['2,2','2,3']) -> 'results',
  '[{"key":"2,2","status":"empty"},{"key":"2,3","status":"ok"}]'::jsonb, 'a prefilled cell counts as ok');
SELECT ok((SELECT (pg_temp.chk(1, current_setting('t.a1')::uuid, 'word', ARRAY['0,0','0,1']))::text !~ '[가-힣]'), 'a check reply contains no character');
SELECT is((SELECT checks_used FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid)::int, 5, 'each check is counted');
UPDATE public.crossword_attempts SET checks_used = 2 WHERE id = current_setting('t.a1')::uuid;
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'cell', ARRAY['0,0'])$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_CHECK_NOT_ALLOWED', 'normal: cell scope is not allowed');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'puzzle', NULL)$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_CHECK_NOT_ALLOWED', 'normal: puzzle scope is not allowed');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'word', ARRAY['0,0','1,1'])$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CELL', 'word scope needs exactly the cells of one word');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'word', ARRAY['0,0'])$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CELL', 'a part of a word is not a word');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'word', ARRAY['9,9','9,8'])$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CELL', 'keys outside the grid are refused');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_check(%L, %L, 'word', ARRAY['0,0','0,1'], 999)$f$, pg_temp.s(1), current_setting('t.a1'))), 'CROSSWORD_PLAY_STALE', 'a check at a stale revision is refused');
SELECT is((SELECT detail FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.a1')::uuid AND kind = 'check' ORDER BY id LIMIT 1),
  '{"scope":"word","words":[{"number":1,"direction":"across"}]}'::jsonb, 'a word check records the word number and direction only');
SELECT is((SELECT source::text FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.a1')::uuid AND kind = 'check' ORDER BY id LIMIT 1), 'hint', 'a check has source hint');
-- checks limit (normal: 5)
UPDATE public.crossword_attempts SET checks_used = 5 WHERE id = current_setting('t.a1')::uuid;
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'word', ARRAY['0,0','0,1'])$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_CHECK_LIMIT', 'normal: the sixth check is over the limit of 5');
UPDATE public.crossword_attempts SET checks_used = 0 WHERE id = current_setting('t.a1')::uuid;
-- rate window
UPDATE public.crossword_attempts SET check_window_start = now() - interval '10 seconds', check_window_count = 60 WHERE id = current_setting('t.a1')::uuid;
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'word', ARRAY['0,0','0,1'])$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_CHECK_RATE', 'more than 60 checks a minute are refused');
UPDATE public.crossword_attempts SET check_window_start = now() - interval '61 seconds' WHERE id = current_setting('t.a1')::uuid;
SELECT lives_ok(format($f$SELECT pg_temp.chk(1, %L, 'word', ARRAY['0,0','0,1'])$f$, current_setting('t.a1')), 'the window resets after a minute');
SELECT is((pg_temp.chk(1, current_setting('t.a1')::uuid, 'word', ARRAY['0,0','0,1']) ->> 'checksRemaining')::int, 3, 'normal: checksRemaining counts down from 5 (two used since the reset)');

-- easy = anytime
SELECT set_config('t.e1', pg_temp.start(1, current_setting('t.ae'), ARRAY['0,0'])::text, true);
SELECT pg_temp.save(1, current_setting('t.e1')::uuid, '{"0,1":"과","1,1":"틀"}'::jsonb);
SELECT is(pg_temp.chk(1, current_setting('t.e1')::uuid, 'cell', ARRAY['0,1']) -> 'results', '[{"key":"0,1","status":"ok"}]'::jsonb, 'easy: cell check');
SELECT is((SELECT detail FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.e1')::uuid ORDER BY id LIMIT 1),
  '{"scope":"cell","words":[{"number":1,"direction":"across"},{"number":2,"direction":"down"}]}'::jsonb, 'a cell on two words records both word references');
SELECT is(jsonb_array_length(pg_temp.chk(1, current_setting('t.e1')::uuid, 'puzzle', NULL) -> 'results'), 6, 'easy: puzzle check covers every cell once');
SELECT is((SELECT detail FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.e1')::uuid ORDER BY id DESC LIMIT 1),
  '{"scope":"puzzle"}'::jsonb, 'a puzzle check records no word');

-- hard = submitOnly
SELECT set_config('t.h1', pg_temp.start(1, current_setting('t.ah'))::text, true);
SELECT is((pg_temp.chk(1, current_setting('t.h1')::uuid, 'word', ARRAY['0,0','0,1']) ->> 'checksRemaining')::int, 2, 'hard: 3 checks allowed, 2 remaining after the first');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'cell', ARRAY['0,0'])$f$, current_setting('t.h1'))), 'CROSSWORD_PLAY_CHECK_NOT_ALLOWED', 'hard: word scope only');
UPDATE public.crossword_attempts SET checks_used = 3 WHERE id = current_setting('t.h1')::uuid;
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'word', ARRAY['0,0','0,1'])$f$, current_setting('t.h1'))), 'CROSSWORD_PLAY_CHECK_LIMIT', 'hard: the fourth check is over the limit of 3');
UPDATE public.crossword_attempts SET checks_used = 1 WHERE id = current_setting('t.h1')::uuid;
SELECT set_config('t.l1', pg_temp.start(1, current_setting('t.al'))::text, true);
SELECT is(pg_temp.err(format($f$SELECT pg_temp.chk(1, %L, 'word', ARRAY['0,0','0,1'])$f$, current_setting('t.l1'))), 'CROSSWORD_PLAY_CHECK_NOT_ALLOWED', 'override: no checks');

-- =====================================================================================================
-- G. Reveal (normal: one)
-- =====================================================================================================
SELECT pg_temp.save(1, current_setting('t.a1')::uuid, '{"0,0":"사"}'::jsonb);
SELECT is(public.fn_crossword_play_reveal(pg_temp.s(1), current_setting('t.a1')::uuid, '1,1', pg_temp.rev(current_setting('t.a1')::uuid)) ->> 'char', '일', 'reveal returns that one letter');
SELECT is((SELECT reveals_used FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid)::int, 1, 'reveal is counted');
SELECT is((SELECT revealed_keys FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), ARRAY['1,1'], 'revealed keys are stored as keys');
SELECT is((SELECT cells ->> '1,1' FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), '일', 'the revealed letter is written to the cells');
SELECT is((SELECT (public.fn_crossword_attempt_limits(current_setting('t.a1')::uuid) ->> 'revealsAllowed')::int - reveals_used FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), 1, 'normal: 2 reveals allowed, 1 remaining after the first');
UPDATE public.crossword_attempts SET reveals_used = 2 WHERE id = current_setting('t.a1')::uuid;
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_reveal(%L, %L, '1,2', %s)$f$, pg_temp.s(1), current_setting('t.a1'), pg_temp.rev(current_setting('t.a1')::uuid))), 'CROSSWORD_PLAY_REVEAL_LIMIT', 'normal: the third reveal is over the limit of 2');
UPDATE public.crossword_attempts SET reveals_used = 1 WHERE id = current_setting('t.a1')::uuid;
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"1,1":"가"}')$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_LOCKED_CELL', 'a revealed cell is locked');
SELECT is((SELECT detail FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.a1')::uuid AND kind = 'reveal'),
  '{"scope":"cell","words":[{"number":2,"direction":"down"},{"number":3,"direction":"across"}]}'::jsonb, 'a reveal records the word references, not the letter');
SELECT is((SELECT source::text FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.a1')::uuid AND kind = 'reveal'), 'reveal', 'a reveal has source reveal');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_reveal(%L, %L, '1,2', 999)$f$, pg_temp.s(1), current_setting('t.a1'))), 'CROSSWORD_PLAY_STALE', 'a reveal at a stale revision is refused');
-- N3: revealing a cell the student already got right is not refused and never says "already correct"
SELECT pg_temp.save(1, current_setting('t.e1')::uuid, '{"1,2":"기"}'::jsonb);
SELECT is(public.fn_crossword_play_reveal(pg_temp.s(1), current_setting('t.e1')::uuid, '1,2', pg_temp.rev(current_setting('t.e1')::uuid)) ->> 'char', '기', 'easy: revealing an already-correct cell spends one and returns the letter');
SELECT is((public.fn_crossword_play_reveal(pg_temp.s(1), current_setting('t.e1')::uuid, '2,2', pg_temp.rev(current_setting('t.e1')::uuid)) ->> 'revealsRemaining')::int, 1, 'easy: 3 allowed, 2 used, 1 remaining');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_reveal(%L, %L, '0,0', %s)$f$, pg_temp.s(1), current_setting('t.e1'), pg_temp.rev(current_setting('t.e1')::uuid))), 'CROSSWORD_PLAY_LOCKED_CELL', 'a prefilled cell cannot be revealed');
SELECT set_config('t.h4', pg_temp.start(4, current_setting('t.ah'))::text, true);
SELECT is(public.fn_crossword_play_reveal(pg_temp.s(4), current_setting('t.h4')::uuid, '1,1', 0) ->> 'char', '일', 'hard: one reveal is allowed');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_reveal(%L, %L, '1,2', %s)$f$, pg_temp.s(4), current_setting('t.h4'), pg_temp.rev(current_setting('t.h4')::uuid))), 'CROSSWORD_PLAY_REVEAL_LIMIT', 'hard: the second reveal is over the limit of 1');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_reveal(%L, %L, '1,1', %s)$f$, pg_temp.s(1), current_setting('t.l1'), pg_temp.rev(current_setting('t.l1')::uuid))), 'CROSSWORD_PLAY_REVEAL_NOT_ALLOWED', 'override: no reveals');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_reveal(%L, %L, '9,9', %s)$f$, pg_temp.s(1), current_setting('t.e1'), pg_temp.rev(current_setting('t.e1')::uuid))), 'CROSSWORD_PLAY_BAD_CELL', 'a key outside the grid cannot be revealed');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_reveal(%L, %L, '2,3', 0)$f$, pg_temp.s(4), current_setting('t.a1'))), 'CROSSWORD_PLAY_NOT_FOUND', 'another student cannot reveal in this attempt');

-- =====================================================================================================
-- H. 초성
-- =====================================================================================================
SELECT is(public.fn_crossword_chosung('사과'), 'ㅅㄱ', '초성 of 사과');
SELECT is(public.fn_crossword_chosung('까치'), 'ㄲㅊ', '초성 keeps double consonants (ㄲ)');
SELECT is(public.fn_crossword_chosung('쌍둥이'), 'ㅆㄷㅇ', '초성 keeps double consonants (ㅆ)');
SELECT is(public.fn_crossword_chosung('빵'), 'ㅃ', '초성 of 빵');
SELECT is(public.fn_crossword_chosung('쫓다'), 'ㅉㄷ', '초성 of 쫓다');
SELECT is(public.fn_crossword_chosung('닭고기'), 'ㄷㄱㄱ', '초성 of 닭고기');
SELECT is(public.fn_crossword_chosung('ABC'), 'A', 'Latin: first letter only');
SELECT is(public.fn_crossword_chosung('A1'), NULL, 'mixed Latin and digit: none');
SELECT is(public.fn_crossword_chosung('2024'), NULL, 'digits: none');
SELECT is(public.fn_crossword_chosung('3D프린터'), NULL, 'mixed Hangul and Latin: none');
SELECT is(public.fn_crossword_play_chosung(pg_temp.s(1), current_setting('t.a1')::uuid, 1, 'across') ->> 'chosung', 'ㅅㄱ', 'chosung hint of word 1');
SELECT is((SELECT chosung_used FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid)::int, 1, 'chosung is counted');
SELECT is((SELECT detail FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.a1')::uuid AND kind = 'chosung'),
  '{"scope":"word","words":[{"number":1,"direction":"across"}]}'::jsonb, 'chosung records the word reference only');
SELECT is((SELECT source::text FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.a1')::uuid AND kind = 'chosung'), 'hint', 'chosung has source hint');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_chosung(%L, %L, 1, 'across')$f$, pg_temp.s(1), current_setting('t.h1'))), 'CROSSWORD_PLAY_CHOSUNG_NOT_ALLOWED', 'hard: no 초성');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_chosung(%L, %L, 9, 'across')$f$, pg_temp.s(1), current_setting('t.a1'))), 'CROSSWORD_PLAY_BAD_CELL', 'unknown word number');

-- =====================================================================================================
-- I. Submit
-- =====================================================================================================
SELECT is(pg_temp.sub(1, current_setting('t.a1')::uuid) ->> 'result', 'incomplete', 'empty cells: incomplete');
SELECT is((pg_temp.sub(1, current_setting('t.a1')::uuid) ->> 'empty')::int, 2, 'incomplete reports the number of empty cells (1,2 and 2,2)');
SELECT is((SELECT submits_used FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid)::int, 0, 'incomplete is not counted as a wrong submit');
SELECT pg_temp.save(1, current_setting('t.a1')::uuid, '{"1,2":"틀","2,2":"차","0,1":"과"}'::jsonb);
SELECT is(pg_temp.sub(1, current_setting('t.a1')::uuid), '{"result":"wrong","wrongCells":1}'::jsonb, 'normal: a wrong submit reports the wrong-cell count');
SELECT is((SELECT submits_used FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid)::int, 1, 'a wrong submit is counted');
SELECT is(pg_temp.sub(1, current_setting('t.a1')::uuid) ->> 'result', 'wrong', 'normal: no cooldown after the first wrong submit');
SELECT is(pg_temp.sub(1, current_setting('t.a1')::uuid) ->> 'result', 'wrong', 'normal: no cooldown after the second wrong submit');
SELECT is(pg_temp.hint(format($f$SELECT pg_temp.sub(1, %L)$f$, current_setting('t.a1'))), '30', 'normal: a cooldown after the third wrong submit, with the seconds in the hint');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.sub(1, %L)$f$, current_setting('t.a1'))), 'CROSSWORD_PLAY_SUBMIT_COOLDOWN', 'the cooldown error code');
UPDATE public.crossword_attempts SET last_wrong_submit_at = now() - interval '31 seconds' WHERE id = current_setting('t.a1')::uuid;
SELECT is(pg_temp.sub(1, current_setting('t.a1')::uuid) ->> 'result', 'wrong', 'after the cooldown a submit is judged again');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_submit(%L, %L, 999)$f$, pg_temp.s(1), current_setting('t.a1'))), 'CROSSWORD_PLAY_STALE', 'a submit at a stale revision is refused');
-- hard: no count, cooldown right away
SELECT pg_temp.fill_correct(1, current_setting('t.h1')::uuid);
SELECT pg_temp.save(1, current_setting('t.h1')::uuid, '{"2,3":"가"}'::jsonb);
SELECT is(pg_temp.sub(1, current_setting('t.h1')::uuid), '{"result":"wrong"}'::jsonb, 'hard: a wrong submit gives no count');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.sub(1, %L)$f$, current_setting('t.h1'))), 'CROSSWORD_PLAY_SUBMIT_COOLDOWN', 'hard: the cooldown starts after the first wrong submit');
UPDATE public.crossword_attempts SET last_wrong_submit_at = now() - interval '40 seconds' WHERE id = current_setting('t.h1')::uuid;
SELECT pg_temp.save(1, current_setting('t.h1')::uuid, '{"2,3":"례"}'::jsonb);
SELECT is(pg_temp.sub(1, current_setting('t.h1')::uuid), '{"result":"completed","justCompleted":true}'::jsonb, 'hard: all correct completes');
SELECT is((SELECT status::text FROM public.crossword_attempts WHERE id = current_setting('t.h1')::uuid), 'completed', 'status is completed');
SELECT isnt((SELECT completed_at FROM public.crossword_attempts WHERE id = current_setting('t.h1')::uuid), NULL, 'completed_at is set');
SELECT is(pg_temp.sub(1, current_setting('t.h1')::uuid), '{"result":"completed","justCompleted":false}'::jsonb, 'a repeat submit is a no-op and never replays the celebration');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"2,3":"가"}')$f$, current_setting('t.h1'))), 'CROSSWORD_PLAY_READONLY', 'a completed attempt is read-only');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.h1')::uuid AND kind = 'completed' AND source = 'submit'), 1, 'one completed event with source submit');
SELECT is((SELECT detail FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.h1')::uuid AND kind = 'completed'), '{"wordsCompleted":5}'::jsonb, 'the completed event records wordsCompleted once, computed by the server (five words)');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.h1')::uuid AND detail ? 'wordsCompleted'), 1, 'wordsCompleted is written once, not on the repeat submit');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE kind <> 'completed' AND detail ? 'wordsCompleted'), 0, 'no other event kind carries wordsCompleted');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.h1')::uuid AND kind = 'submit_wrong' AND source = 'submit'), 1, 'one wrong-submit event');
-- prefilled and revealed cells count as correct on submit
SELECT pg_temp.save(1, current_setting('t.e1')::uuid, '{"0,1":"과","1,1":"일","2,3":"례"}'::jsonb);
SELECT is(pg_temp.sub(1, current_setting('t.e1')::uuid) ->> 'result', 'completed', 'easy: prefill and reveals count toward completion');

-- =====================================================================================================
-- J. Given letters, limits, list
-- =====================================================================================================
SELECT is(public.fn_crossword_play_given(pg_temp.s(1), current_setting('t.a1')::uuid), '{"1,1":"일","2,3":"례"}'::jsonb, 'given = prefilled plus revealed letters only');
SELECT is(pg_temp.err(format($f$SELECT public.fn_crossword_play_given(%L, %L)$f$, pg_temp.s(4), current_setting('t.a1'))), 'CROSSWORD_PLAY_NOT_FOUND', 'given needs membership');
SELECT is(public.fn_crossword_attempt_limits(current_setting('t.a1')::uuid), '{"level":"normal","checkMode":"onRequest","checksAllowed":5,"revealsAllowed":2,"chosungAllowed":true}'::jsonb, 'limits under neutral names (PM SP-1/SP-2: normal = 5 checks, 2 reveals)');
SELECT is(public.fn_crossword_attempt_limits(current_setting('t.e1')::uuid), '{"level":"easy","checkMode":"anytime","checksAllowed":null,"revealsAllowed":3,"chosungAllowed":true}'::jsonb, 'limits of the easy puzzle: unlimited checks (null), 3 reveals');
SELECT is(public.fn_crossword_attempt_limits(current_setting('t.h1')::uuid), '{"level":"hard","checkMode":"onRequest","checksAllowed":3,"revealsAllowed":1,"chosungAllowed":false}'::jsonb, 'limits of the hard puzzle: 3 checks, 1 reveal');
SELECT is(public.fn_crossword_attempt_limits(current_setting('t.l1')::uuid), '{"level":"normal","checkMode":"submitOnly","checksAllowed":0,"revealsAllowed":0,"chosungAllowed":false}'::jsonb, 'limits of a teacher override to none');
SET LOCAL session_replication_role = replica;
UPDATE public.crossword_puzzles SET settings = '{"play":{"checkMode":"onRequest","revealsPerStudent":1,"chosungAllowed":true}}'::jsonb WHERE id = current_setting('t.pl')::uuid;
SELECT is(public.fn_crossword_attempt_limits(current_setting('t.l1')::uuid) -> 'checksAllowed', 'null'::jsonb, 'a puzzle saved before checksAllowed existed: onRequest means unlimited');
UPDATE public.crossword_puzzles SET settings = '{"play":{"checkMode":"submitOnly","revealsPerStudent":0,"chosungAllowed":false}}'::jsonb WHERE id = current_setting('t.pl')::uuid;
SELECT is(public.fn_crossword_attempt_limits(current_setting('t.l1')::uuid) -> 'checksAllowed', to_jsonb(0), 'a puzzle saved before checksAllowed existed: submitOnly means none');
SET LOCAL session_replication_role = origin;
SELECT is((SELECT array_agg(DISTINCT attempt_status::text) FROM public.fn_crossword_play_list(pg_temp.s(1)) WHERE attempt_id IS NOT NULL ORDER BY 1), ARRAY['completed','in_progress'], 'list shows attempt states');
SELECT is((SELECT total_cells FROM public.fn_crossword_play_list(pg_temp.s(1)) WHERE assignment_id = current_setting('t.an')::uuid), 6, 'list: six distinct cells');
SELECT is((SELECT word_count FROM public.fn_crossword_play_list(pg_temp.s(1)) WHERE assignment_id = current_setting('t.an')::uuid), 5, 'list: five words');
SELECT is((SELECT count(*)::int FROM public.fn_crossword_play_list(pg_temp.s(5))), 0, 'list: a student in no classroom sees nothing');
SELECT is((SELECT count(*)::int FROM public.fn_crossword_play_list(pg_temp.s(4))), 4, 'list: c4 sees the four assignments of d1');
UPDATE public.classrooms SET archived_at = now() WHERE id = '00000000-0000-4000-8000-0000000000d2';
SELECT is((SELECT reason FROM public.fn_crossword_play_access(pg_temp.s(1), current_setting('t.an2')::uuid)), 'NOT_FOUND', 'archived classroom: not found, even with an attempt');
SELECT is(pg_temp.err(format($f$SELECT pg_temp.save(1, %L, '{"0,0":"사"}')$f$, current_setting('t.a1b'))), 'CROSSWORD_PLAY_NOT_FOUND', 'archived classroom: no save');
SELECT is((SELECT count(*)::int FROM public.fn_crossword_play_list(pg_temp.s(1)) WHERE classroom_id = '00000000-0000-4000-8000-0000000000d2'), 0, 'archived classroom: not listed');

-- =====================================================================================================
-- K. Event allow-list: no letter, answer, cell or other key can be stored
-- =====================================================================================================
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '{"letter":"가"}')$f$, current_setting('t.a1')), '23514', NULL, 'detail: unknown key refused');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '{"words":[{"number":1,"direction":"across","answer":"사과"}]}')$f$, current_setting('t.a1')), '23514', NULL, 'detail: answer inside a word reference refused');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '{"cell":"0,0"}')$f$, current_setting('t.a1')), '23514', NULL, 'detail: cell key refused');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '{"scope":"word","words":[{"number":1,"direction":"across"},{"number":2,"direction":"down"},{"number":3,"direction":"across"}]}')$f$, current_setting('t.a1')), '23514', NULL, 'detail: three word references refused');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '{"scope":"사과"}')$f$, current_setting('t.a1')), '23514', NULL, 'detail: free text scope refused');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '{"words":[{"number":"사","direction":"across"}]}')$f$, current_setting('t.a1')), '23514', NULL, 'detail: a letter as the word number refused');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '{"words":[{"number":1,"direction":"sideways"}]}')$f$, current_setting('t.a1')), '23514', NULL, 'detail: bad direction refused');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '[]')$f$, current_setting('t.a1')), '23514', NULL, 'detail: non-object refused');
SELECT lives_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '{"scope":"word","words":[{"number":1,"direction":"across"}]}')$f$, current_setting('t.a1')), 'detail: a valid shape is accepted');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'check', 'hint', '{"wordsCompleted":3}')$f$, current_setting('t.a1')), '23514', NULL, 'wordsCompleted is refused on a check event');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'completed', 'submit', '{"wordsCompleted":"5"}')$f$, current_setting('t.a1')), '23514', NULL, 'wordsCompleted must be a number');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'completed', 'submit', '{"wordsCompleted":-1}')$f$, current_setting('t.a1')), '23514', NULL, 'wordsCompleted cannot be negative');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'completed', 'submit', '{"wordsCompleted":1000}')$f$, current_setting('t.a1')), '23514', NULL, 'wordsCompleted is at most three digits');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'completed', 'submit', '{"wordsCompleted":2,"letter":"가"}')$f$, current_setting('t.a1')), '23514', NULL, 'wordsCompleted does not open the door to other keys');
SELECT lives_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source, detail) VALUES (%L, 'completed', 'submit', '{"wordsCompleted":2}')$f$, current_setting('t.a1')), 'wordsCompleted is accepted on a completed event');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source) VALUES (%L, 'reveal', 'hint')$f$, current_setting('t.a1')), '23514', NULL, 'kind and source must agree (reveal/hint refused)');
SELECT throws_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source) VALUES (%L, 'completed', 'autosave')$f$, current_setting('t.a1')), '23514', NULL, 'kind and source must agree (completed/autosave refused)');
SELECT lives_ok(format($f$INSERT INTO public.crossword_attempt_events (attempt_id, kind, source) VALUES (%L, 'entry', 'manual_entry'), (%L, 'entry', 'autosave')$f$, current_setting('t.a1'), current_setting('t.a1')), 'entry events are allowed with manual_entry or autosave (reserved)');
DELETE FROM public.crossword_attempt_events WHERE actor_student_id IS NULL;
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE replace(detail::text, 'wordsCompleted', '') ~ '[가-힣A-Z]'), 0, 'no event detail anywhere holds a Hangul or upper-case character (apart from the key name wordsCompleted)');
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE EXISTS (SELECT 1 FROM unnest(prefill_keys || revealed_keys) k WHERE k !~ '^[0-9]+,[0-9]+$')), 0, 'prefill and revealed keys are keys, never letters');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE actor_student_id IS DISTINCT FROM (SELECT student_id FROM public.crossword_attempt_members m WHERE m.attempt_id = crossword_attempt_events.attempt_id)), 0, 'in individual play the actor is always the single member');

-- =====================================================================================================
-- L. Student and teacher JWT: nothing is readable through the API
-- =====================================================================================================
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT count(*) FROM public.crossword_attempts$$, '42501', NULL, 'student: attempts are not readable');
SELECT throws_ok($$SELECT count(*) FROM public.crossword_attempt_members$$, '42501', NULL, 'student: members are not readable');
SELECT throws_ok($$SELECT count(*) FROM public.crossword_attempt_events$$, '42501', NULL, 'student: events are not readable');
SELECT throws_ok($$INSERT INTO public.crossword_attempts (assignment_id) VALUES (gen_random_uuid())$$, '42501', NULL, 'student: cannot insert an attempt');
SELECT is((SELECT count(*)::int FROM public.crossword_words), 0, 'student: zero crossword_words rows');
SELECT is((SELECT count(*)::int FROM public.crossword_puzzles), 0, 'student: zero crossword_puzzles rows');
SELECT is((SELECT count(*)::int FROM public.crossword_assignments), 0, 'student: zero crossword_assignments rows');
SELECT is((SELECT count(*)::int FROM public.v_crossword_puzzles_summary), 0, 'student: zero summary rows');
SELECT throws_ok($$SELECT public.fn_crossword_play_access(gen_random_uuid(), gen_random_uuid())$$, '42501', NULL, 'student: no rpc on the access function');
SELECT throws_ok($$SELECT public.fn_crossword_play_wordcells(gen_random_uuid())$$, '42501', NULL, 'student: no rpc on the answer-reading helper');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT count(*) FROM public.crossword_attempts$$, '42501', NULL, 'teacher: no attempt policy yet (M2-2.5)');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT count(*) FROM public.crossword_attempt_events$$, '42501', NULL, 'anon: events are not readable');
RESET ROLE;

-- =====================================================================================================
-- M. Erasure and cascades
-- =====================================================================================================
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events WHERE attempt_id = current_setting('t.a4')::uuid), 0, 'c4 attempt: no events yet');
DELETE FROM public.students WHERE id = pg_temp.s(4);
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE id = current_setting('t.a4')::uuid), 0, 'erasing the only member erases the attempt');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_members WHERE student_id = pg_temp.s(4)), 0, 'erasing a student erases the membership');
-- a shared attempt (shape only, no UI): the attempt survives while any member is left
INSERT INTO public.students (id, school_id, profile_id, student_no, grade)
  VALUES ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b4', '6', '1');
INSERT INTO public.crossword_attempt_members (attempt_id, assignment_id, student_id)
  VALUES (current_setting('t.a1')::uuid, current_setting('t.an')::uuid, '00000000-0000-4000-8000-0000000000c6');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_members WHERE attempt_id = current_setting('t.a1')::uuid), 2, 'a second member can be added to an attempt (shared-attempt shape)');
DELETE FROM public.students WHERE id = '00000000-0000-4000-8000-0000000000c6';
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), 1, 'a shared attempt survives the erasure of one member');
DELETE FROM public.classrooms WHERE id = '00000000-0000-4000-8000-0000000000d2';
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE id = current_setting('t.a1b')::uuid), 0, 'deleting a classroom removes its assignments and their attempts');
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE id = current_setting('t.a1')::uuid), 1, 'other attempts are untouched');
DELETE FROM public.students WHERE id = pg_temp.s(1);
SELECT is((SELECT count(*)::int FROM public.crossword_attempts WHERE assignment_id IN (current_setting('t.an')::uuid, current_setting('t.ae')::uuid, current_setting('t.ah')::uuid)), 0, 'erasing the last member erases the attempts and their events');
SELECT is((SELECT count(*)::int FROM public.crossword_attempt_events), 0, 'no event is left behind');

SELECT * FROM finish();
ROLLBACK;
