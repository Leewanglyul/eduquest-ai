BEGIN;
SELECT plan(153);

-- Fixtures (rolled back). Teacher t1 (…0001) comes from seed.sql.
-- b1 student, b2 co-teacher of d1, b3 outsider teacher. d1/d2/d5 owned by t1 (d1 has co-teacher b2), d3 archived, d4 owned by b3.
-- Set e1 (owner t1, linked to d1) holds entries f001..f005 (provenance for the puzzle words).
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000b1', 's1@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 't2@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b3', 't3@t.invalid')
) AS v(id, email);

INSERT INTO public.profiles (id, school_id, role, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'student', 'S1'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T2'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T3');

INSERT INTO public.classrooms (id, school_id, owner_id, name, archived_at) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'A', NULL),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'B', NULL),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'C archived', now()),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b3', 'D', NULL),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'E', NULL);
INSERT INTO public.classroom_teachers (classroom_id, teacher_id) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b2');

INSERT INTO public.content_sets (id, school_id, owner_id, classroom_id, title) VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d1', 'S1');
INSERT INTO public.content_entries (id, set_id, position, term, definition, answer, script, normalizer_version) VALUES
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000e1', 1, '사과', 'c1', '사과', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-0000000000e1', 2, '과일', 'c2', '과일', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f003', '00000000-0000-4000-8000-0000000000e1', 3, '일기', 'c3', '일기', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f004', '00000000-0000-4000-8000-0000000000e1', 4, '기차', 'c4', '기차', 'hangul', 1),
  ('00000000-0000-4000-8000-00000000f005', '00000000-0000-4000-8000-0000000000e1', 5, '차례', 'c5', '차례', 'hangul', 1);

-- The worked example of doc 04 §2.7 plus 차례 (five words, a 3 x 4 board) as the words JSON the functions take.
SELECT set_config('t.words', '[
  {"number":1,"direction":"across","row":0,"col":0,"answer":"사과","clue":"빨간 과일","entryId":"00000000-0000-4000-8000-00000000f001"},
  {"number":2,"direction":"down","row":0,"col":1,"answer":"과일","clue":"먹는 것","entryId":"00000000-0000-4000-8000-00000000f002"},
  {"number":3,"direction":"across","row":1,"col":1,"answer":"일기","clue":"매일 쓰는 글","entryId":"00000000-0000-4000-8000-00000000f003"},
  {"number":4,"direction":"down","row":1,"col":2,"answer":"기차","clue":"레일 위의 탈것","entryId":"00000000-0000-4000-8000-00000000f004"},
  {"number":5,"direction":"across","row":2,"col":2,"answer":"차례","clue":"순서","entryId":"00000000-0000-4000-8000-00000000f005"}
]', true);
-- sha256 of the TypeScript canonicalPuzzleText for this puzzle with these entry ids.
SELECT set_config('t.hash', 'ff0717a4eabd6ea0d7d445cb0f38f651ac3043f027f7ee33aba1b56d5bc5a113', true);

CREATE FUNCTION pg_temp.words() RETURNS jsonb LANGUAGE sql AS $$ SELECT current_setting('t.words')::jsonb $$;
CREATE FUNCTION pg_temp.ticket(p_n integer, p_hash text DEFAULT current_setting('t.hash'), p_ttl interval DEFAULT interval '15 minutes')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := ('00000000-0000-4000-8000-0000000a00' || lpad(p_n::text, 2, '0'))::uuid;
BEGIN
  INSERT INTO public.crossword_preview_tickets (id, school_id, actor_id, set_id, token_hash, placement_hash, expires_at)
  VALUES (v_id, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000e1', 'th', p_hash, now() + p_ttl);
  RETURN v_id;
END $$;
CREATE FUNCTION pg_temp.save(p_ticket uuid, p_actor uuid DEFAULT '00000000-0000-4000-8000-000000000001', p_token text DEFAULT 'th',
                             p_words jsonb DEFAULT NULL, p_rows integer DEFAULT 3, p_cols integer DEFAULT 4, p_hash text DEFAULT NULL,
                             p_puzzle uuid DEFAULT NULL, p_title text DEFAULT 'Fruit puzzle')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.fn_save_crossword(p_ticket, p_actor, '00000000-0000-4000-8000-0000000000a1', p_token,
    '00000000-0000-4000-8000-0000000000e1', p_title, 'normal', '{"checkMode":"onRequest"}'::jsonb, '{"words":5}'::jsonb,
    7::bigint, 1, COALESCE(p_hash, current_setting('t.hash')), p_rows, p_cols, COALESCE(p_words, pg_temp.words()), 25, 5, p_puzzle)
$$;
CREATE FUNCTION pg_temp.publish(p_puzzle uuid, p_actor uuid, p_classrooms uuid[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.fn_publish_crossword(p_puzzle, p_actor, '00000000-0000-4000-8000-0000000000a1', p_classrooms, NULL, NULL)
$$;
CREATE FUNCTION pg_temp.add_assign(p_puzzle uuid, p_actor uuid, p_classrooms uuid[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.fn_add_crossword_assignments(p_puzzle, p_actor, '00000000-0000-4000-8000-0000000000a1', p_classrooms, NULL, NULL)
$$;

-- A. Structure and grants.
SELECT has_table('public', 'crossword_puzzles', 'crossword_puzzles exists');
SELECT has_table('public', 'crossword_words', 'crossword_words exists');
SELECT has_table('public', 'crossword_assignments', 'crossword_assignments exists');
SELECT has_table('public', 'crossword_preview_tickets', 'crossword_preview_tickets exists');
SELECT has_table('public', 'crossword_attempts', 'crossword_attempts exists since M2-2.4a F1 (student data; behaviour pinned in 00013)');
SELECT ok((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
  ('public.crossword_puzzles'::regclass, 'public.crossword_words'::regclass, 'public.crossword_assignments'::regclass,
   'public.crossword_preview_tickets'::regclass)), 'RLS on all crossword tables');
SELECT ok(NOT has_function_privilege('authenticated', 'public.fn_publish_crossword(uuid,uuid,uuid,uuid[],timestamptz,timestamptz)', 'EXECUTE'),
  'authenticated cannot execute fn_publish_crossword');
SELECT ok(NOT has_function_privilege('authenticated', 'public.fn_add_crossword_assignments(uuid,uuid,uuid,uuid[],timestamptz,timestamptz)', 'EXECUTE'),
  'authenticated cannot execute fn_add_crossword_assignments');
SELECT ok(NOT has_function_privilege('anon', 'public.fn_create_crossword_version(uuid,uuid,uuid)', 'EXECUTE'),
  'anon cannot execute fn_create_crossword_version');
SELECT ok(has_function_privilege('service_role', 'public.fn_set_crossword_archived(uuid,uuid,uuid,boolean)', 'EXECUTE'),
  'service_role can execute fn_set_crossword_archived');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'crossword_puzzles_owner_id_fkey'), 'r',
  'puzzle owner is ON DELETE RESTRICT (transfer first, P1)');
SELECT is(public.fn_crossword_min_words(), 5, 'the database minimum is 5 multi-cell words (C2, same as CROSSWORD_MIN_WORDS)');

-- B. Hash parity and validator.
SELECT is(public.fn_crossword_placement_hash(1, 3, 4, pg_temp.words()), current_setting('t.hash'),
  'SQL placement hash equals the TypeScript canonical hash');
SELECT is(public.fn_crossword_validate_words(3, 4, pg_temp.words()), NULL, 'five-word example is valid');
SELECT is(public.fn_crossword_validate_words(2, 3, ((pg_temp.words() - 4) - 3)), NULL, 'three words on a 2x3 board are valid');
SELECT is(public.fn_crossword_validate_words(3, 4, '[]'::jsonb), 'CROSSWORD_EMPTY', 'empty puzzle');
SELECT is(public.fn_crossword_validate_words(3, 4, replace(pg_temp.words()::text, '"일기"', '"일가"')::jsonb),
  'CROSSWORD_LETTER_CONFLICT', 'two words disagree on a shared cell');
SELECT is(public.fn_crossword_validate_words(3, 4, (pg_temp.words() - 2)), 'CROSSWORD_UNINTENDED_RUN',
  'removing 일기 leaves 일 and 기 side by side: unintended word');
SELECT is(public.fn_crossword_validate_words(2, 4, pg_temp.words()), 'CROSSWORD_OUT_OF_BOUNDS', 'word leaves the board');
SELECT is(public.fn_crossword_validate_words(4, 4, pg_temp.words()), 'CROSSWORD_NOT_TRIMMED', 'board larger than its words');
SELECT is(public.fn_crossword_validate_words(3, 4, replace(pg_temp.words()::text, '"number": 3', '"number": 9')::jsonb),
  'CROSSWORD_BAD_NUMBERING', 'numbering must follow reading order');
SELECT is(public.fn_crossword_validate_words(5, 5,
  (SELECT jsonb_agg(e) FROM jsonb_array_elements(pg_temp.words()) e WHERE (e ->> 'number')::int IN (1, 2))
  || '[{"number":3,"direction":"across","row":4,"col":3,"answer":"학교"}]'::jsonb), 'CROSSWORD_DISCONNECTED',
  'a word that crosses nothing');
SELECT is(public.fn_crossword_validate_words(3, 4, pg_temp.words() || '[{"number":1,"direction":"down","row":0,"col":0,"answer":"사"}]'::jsonb),
  NULL, 'a one-character word on a cell the other direction does not use');
SELECT is(public.fn_crossword_validate_words(3, 4, pg_temp.words() || '[{"number":2,"direction":"across","row":0,"col":1,"answer":"과"}]'::jsonb),
  'CROSSWORD_SINGLE_INVALID', 'a one-character word in the direction of the word it sits on');
SELECT is(public.fn_crossword_validate_words(3, 4, pg_temp.words() || '[{"number":1,"direction":"down","row":0,"col":0,"answer":"배"}]'::jsonb),
  'CROSSWORD_SINGLE_INVALID', 'a one-character word with another letter than its cell');
SELECT is(public.fn_crossword_validate_words(3, 4, pg_temp.words() || '[{"number":6,"direction":"across","row":2,"col":0,"answer":"사과"}]'::jsonb),
  'CROSSWORD_DUPLICATE', 'an answer used twice');
SELECT is(public.fn_crossword_validate_words(3, 4, replace(pg_temp.words()::text, '"사과"', '"사 과"')::jsonb),
  'CROSSWORD_BAD_WORD', 'a space is not a cell character');

-- C. Save: ticket, hash, rights, counts, re-save.
SELECT pg_temp.ticket(1);
SELECT pg_temp.ticket(2, repeat('0', 64));
SELECT pg_temp.ticket(3);
SELECT pg_temp.ticket(4, current_setting('t.hash'), interval '-1 minute');
SELECT pg_temp.ticket(6, public.fn_crossword_placement_hash(1, 3, 3, (pg_temp.words() - 4)));
SELECT pg_temp.ticket(7);
INSERT INTO public.crossword_preview_tickets (id, school_id, actor_id, set_id, token_hash, placement_hash, expires_at)
VALUES ('00000000-0000-4000-8000-0000000a0005', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b3',
        '00000000-0000-4000-8000-0000000000e1', 'th', current_setting('t.hash'), now() + interval '15 minutes');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0001', p_token => 'wrong')$$, 'P0001', 'CROSSWORD_TICKET_INVALID', 'wrong token');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0004')$$, 'P0001', 'CROSSWORD_TICKET_INVALID', 'expired ticket');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0002', p_hash => repeat('0', 64))$$, 'P0001', 'CROSSWORD_HASH_MISMATCH', 'hash that is not the words hash');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0001', p_words => replace(pg_temp.words()::text, '"일기"', '"일가"')::jsonb)$$,
  'P0001', 'CROSSWORD_HASH_MISMATCH', 'words changed after the preview');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000000b3')$$, 'P0001', 'CROSSWORD_TICKET_INVALID', 'a ticket belongs to the teacher who previewed');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0005', '00000000-0000-4000-8000-0000000000b3')$$, 'P0001', 'CROSSWORD_FORBIDDEN', 'outsider teacher cannot save from a set they do not manage');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0006', p_words => (pg_temp.words() - 4), p_cols => 3, p_hash => public.fn_crossword_placement_hash(1, 3, 3, (pg_temp.words() - 4)))$$,
  'P0001', 'CROSSWORD_WORD_COUNT', 'four words never become a draft (C2)');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0003', p_rows => 2)$$, 'P0001', 'CROSSWORD_HASH_MISMATCH', 'size is part of the hash');
SELECT lives_ok($$SELECT set_config('t.v1', (pg_temp.save('00000000-0000-4000-8000-0000000a0001') ->> 'puzzleId'), true)$$, 'save from a valid ticket');
SELECT is((SELECT status::text FROM public.crossword_puzzles WHERE id = current_setting('t.v1')::uuid), 'draft', 'saved as draft');
SELECT is((SELECT (root_id = id AND version = 1 AND supersedes_id IS NULL) FROM public.crossword_puzzles WHERE id = current_setting('t.v1')::uuid), true, 'version 1 is its own root');
SELECT is((SELECT count(*)::int FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid), 5, 'five words stored');
SELECT is((SELECT length::int FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid AND answer = '사과'), 2, 'length is generated');
SELECT is((SELECT count(*)::int FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid AND source_entry_id IS NOT NULL), 5, 'provenance kept');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0001')$$, 'P0001', 'CROSSWORD_TICKET_INVALID', 'a ticket is single use');
SELECT is((SELECT count(*)::int FROM public.audit_logs WHERE action = 'crossword.created' AND resource_id = current_setting('t.v1')::uuid), 1, 'created is audited');
SELECT lives_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0007', p_puzzle => current_setting('t.v1')::uuid, p_title => 'Fruit puzzle 2')$$, 're-save replaces the grid of a draft');
SELECT is((SELECT title FROM public.crossword_puzzles WHERE id = current_setting('t.v1')::uuid), 'Fruit puzzle 2', 're-save updates the title');
SELECT is((SELECT count(*)::int FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid), 5, 're-save leaves five words');
SELECT is((SELECT count(*)::int FROM public.crossword_puzzles WHERE set_id = '00000000-0000-4000-8000-0000000000e1'), 1, 're-save did not create a second puzzle');

-- D. Review edits on a draft.
SELECT throws_ok($$SELECT public.fn_update_crossword_draft(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 'x', NULL)$$,
  'P0001', 'CROSSWORD_FORBIDDEN', 'outsider cannot edit');
SELECT lives_ok($$SELECT public.fn_update_crossword_draft(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'Renamed',
  '[{"number":1,"direction":"across","clue":"새 힌트"}]'::jsonb)$$, 'co-teacher of the set classroom edits title and a clue');
SELECT is((SELECT clue FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid AND number = 1 AND direction = 'across'), '새 힌트', 'clue changed');
SELECT is((SELECT title FROM public.crossword_puzzles WHERE id = current_setting('t.v1')::uuid), 'Renamed', 'title changed');
SELECT throws_ok($$SELECT public.fn_update_crossword_draft(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', NULL,
  jsonb_build_array(jsonb_build_object('number', 1, 'direction', 'across', 'clue', repeat('가', 201))))$$, 'P0001', 'CROSSWORD_CLUE_INVALID', 'clue too long');
SELECT throws_ok($$SELECT public.fn_update_crossword_draft(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', NULL,
  '[{"number":9,"direction":"across","clue":"x"}]'::jsonb)$$, 'P0001', 'CROSSWORD_WORD_NOT_FOUND', 'unknown word');
SELECT is((SELECT metadata::text FROM public.audit_logs WHERE action = 'crossword.updated' AND resource_id = current_setting('t.v1')::uuid AND metadata ->> 'fields' LIKE '%clues%') LIKE '%새 힌트%', false,
  'update audit has field names, not clue text');

-- E. Publish.
-- A four-word draft inserted behind the functions' back: the database itself refuses to publish it (C2).
INSERT INTO public.crossword_puzzles (id, school_id, owner_id, set_id, title, level, settings, stats, seed, generator_version, placement_hash, rows, cols)
VALUES ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000000e1', 'Four words', 'easy', '{}', '{}', 1, 1, 'x', 3, 3);
INSERT INTO public.crossword_words (puzzle_id, number, direction, row, col, answer, clue)
SELECT '00000000-0000-4000-8000-0000000b0001', (e ->> 'number')::smallint, (e ->> 'direction')::public.crossword_direction,
       (e ->> 'row')::smallint, (e ->> 'col')::smallint, e ->> 'answer', e ->> 'clue'
FROM jsonb_array_elements(pg_temp.words() - 4) e;
SELECT throws_ok($$SELECT pg_temp.publish('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d1']::uuid[])$$,
  'P0001', 'CROSSWORD_TOO_FEW_WORDS', 'fewer than 5 multi-cell words cannot be published (C2)');
SELECT is((SELECT status::text FROM public.crossword_puzzles WHERE id = '00000000-0000-4000-8000-0000000b0001'), 'draft', 'the refused publish left a draft');
SELECT throws_ok($$SELECT pg_temp.publish(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', ARRAY[]::uuid[])$$, 'P0001', 'CROSSWORD_CLASSROOM_INVALID', 'no classroom');
SELECT throws_ok($$SELECT pg_temp.publish(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d3']::uuid[])$$, 'P0001', 'CROSSWORD_CLASSROOM_ARCHIVED', 'archived classroom (P2)');
SELECT throws_ok($$SELECT pg_temp.publish(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d4']::uuid[])$$, 'P0001', 'CROSSWORD_CLASSROOM_INVALID', 'classroom the actor does not manage');
SELECT throws_ok($$SELECT pg_temp.publish(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-0000000000b2', ARRAY['00000000-0000-4000-8000-0000000000d2']::uuid[])$$, 'P0001', 'CROSSWORD_CLASSROOM_INVALID', 'co-teacher cannot publish to a classroom they do not teach');
SELECT throws_ok($$SELECT pg_temp.publish(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-0000000000b3', ARRAY['00000000-0000-4000-8000-0000000000d4']::uuid[])$$, 'P0001', 'CROSSWORD_FORBIDDEN', 'outsider cannot publish');
SELECT throws_ok($$SELECT public.fn_publish_crossword(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
  ARRAY['00000000-0000-4000-8000-0000000000d1']::uuid[], now(), now() - interval '1 day')$$, 'P0001', 'CROSSWORD_WINDOW_INVALID', 'closing before opening');
SELECT is((SELECT status::text FROM public.crossword_puzzles WHERE id = current_setting('t.v1')::uuid), 'draft', 'failed publishes left a draft');
SELECT lives_ok($$SELECT pg_temp.publish(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001',
  ARRAY['00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d1']::uuid[])$$, 'publish to two classrooms');
SELECT is((SELECT status::text FROM public.crossword_puzzles WHERE id = current_setting('t.v1')::uuid), 'published', 'published');
SELECT is((SELECT count(*)::int FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.v1')::uuid AND status = 'open'), 2, 'one assignment per classroom (duplicates folded)');
SELECT throws_ok($$SELECT pg_temp.publish(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d1']::uuid[])$$, 'P0001', 'CROSSWORD_NOT_DRAFT', 'cannot publish twice');
SELECT throws_ok($$SELECT public.fn_update_crossword_draft(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'x', NULL)$$, 'P0001', 'CROSSWORD_NOT_DRAFT', 'published puzzle is frozen for the functions');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0003', p_puzzle => current_setting('t.v1')::uuid)$$, 'P0001', 'CROSSWORD_NOT_DRAFT', 'a published puzzle cannot be re-saved');
SELECT is((SELECT (metadata ->> 'wordCount')::int FROM public.audit_logs WHERE action = 'crossword.published' AND resource_id = current_setting('t.v1')::uuid), 5, 'published is audited with a count');
SELECT is((SELECT metadata::text FROM public.audit_logs WHERE action = 'crossword.published' AND resource_id = current_setting('t.v1')::uuid) ~ '사과|과일|일기|기차', false, 'publish audit has no answers');

-- F. Immutability after publish holds for every path, including direct SQL (C4).
SELECT throws_ok($$UPDATE public.crossword_words SET clue = 'changed' WHERE puzzle_id = current_setting('t.v1')::uuid AND number = 1$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'published clue cannot change');
SELECT throws_ok($$UPDATE public.crossword_words SET answer = '배추' WHERE puzzle_id = current_setting('t.v1')::uuid AND number = 5$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'published answer cannot change');
SELECT throws_ok($$UPDATE public.crossword_words SET row = 1 WHERE puzzle_id = current_setting('t.v1')::uuid AND number = 5$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'published position cannot change');
SELECT throws_ok($$INSERT INTO public.crossword_words (puzzle_id, number, direction, row, col, answer, clue) VALUES (current_setting('t.v1')::uuid, 9, 'down', 0, 3, '배', 'x')$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'no word can be added to a published puzzle');
SELECT throws_ok($$DELETE FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid AND number = 5$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'no word can be removed from a published puzzle');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET title = 'changed' WHERE id = current_setting('t.v1')::uuid$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'published title cannot change');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET level = 'hard' WHERE id = current_setting('t.v1')::uuid$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'published level cannot change');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET settings = '{"x":1}' WHERE id = current_setting('t.v1')::uuid$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'published settings cannot change');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET rows = 5 WHERE id = current_setting('t.v1')::uuid$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'published grid size cannot change');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET published_at = now() - interval '1 day' WHERE id = current_setting('t.v1')::uuid$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'published_at is set once');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET status = 'draft' WHERE id = current_setting('t.v1')::uuid$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'a published puzzle never returns to draft');
SELECT lives_ok($$UPDATE public.crossword_puzzles SET owner_id = '00000000-0000-4000-8000-0000000000b2' WHERE id = current_setting('t.v1')::uuid$$, 'ownership transfer is allowed on a published puzzle (P1)');
SELECT lives_ok($$UPDATE public.crossword_puzzles SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE id = current_setting('t.v1')::uuid$$, 'and back');
SELECT is((SELECT clue FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid AND number = 1 AND direction = 'across'), '새 힌트', 'nothing changed');

-- G. Assign a published puzzle to further classrooms (Q6).
SELECT throws_ok($$SELECT pg_temp.add_assign('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d5']::uuid[])$$, 'P0001', 'CROSSWORD_NOT_PUBLISHED', 'a draft is published, not assigned');
SELECT throws_ok($$SELECT pg_temp.add_assign(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-0000000000b3', ARRAY['00000000-0000-4000-8000-0000000000d4']::uuid[])$$, 'P0001', 'CROSSWORD_FORBIDDEN', 'outsider cannot assign');
SELECT throws_ok($$SELECT pg_temp.add_assign(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d3']::uuid[])$$, 'P0001', 'CROSSWORD_CLASSROOM_ARCHIVED', 'archived classroom (P2)');
SELECT throws_ok($$SELECT pg_temp.add_assign(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d4']::uuid[])$$, 'P0001', 'CROSSWORD_CLASSROOM_INVALID', 'classroom the actor does not manage');
SELECT throws_ok($$SELECT pg_temp.add_assign(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d1']::uuid[])$$, 'P0001', 'CROSSWORD_ALREADY_ASSIGNED', 'already assigned there');
SELECT lives_ok($$SELECT pg_temp.add_assign(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d5']::uuid[])$$, 'assign to one more classroom');
SELECT is((SELECT count(*)::int FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.v1')::uuid AND status = 'open'), 3, 'three open assignments');
SELECT is((SELECT count(*)::int FROM public.audit_logs WHERE action = 'crossword.assigned' AND resource_id = current_setting('t.v1')::uuid), 1, 'assigned is audited');

-- H. Versioning.
SELECT throws_ok($$SELECT public.fn_create_crossword_version(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1')$$,
  'P0001', 'CROSSWORD_FORBIDDEN', 'outsider cannot create a version');
SELECT lives_ok($$SELECT set_config('t.v2', (public.fn_create_crossword_version(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1') ->> 'puzzleId'), true)$$,
  'co-teacher creates version 2 from the published puzzle');
SELECT is((SELECT (root_id = current_setting('t.v1')::uuid AND version = 2 AND supersedes_id = current_setting('t.v1')::uuid AND status = 'draft'
                   AND owner_id = '00000000-0000-4000-8000-000000000001' AND published_at IS NULL)
           FROM public.crossword_puzzles WHERE id = current_setting('t.v2')::uuid), true, 'v2 is a draft in the lineage, owner kept');
SELECT is((SELECT count(*)::int FROM public.crossword_words WHERE puzzle_id = current_setting('t.v2')::uuid), 5, 'words copied');
SELECT is((SELECT clue FROM public.crossword_words WHERE puzzle_id = current_setting('t.v2')::uuid AND number = 1 AND direction = 'across'), '새 힌트', 'clues copied');
SELECT is((SELECT placement_hash FROM public.crossword_puzzles WHERE id = current_setting('t.v2')::uuid), current_setting('t.hash'), 'placement hash copied');
SELECT is((SELECT count(*)::int FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.v2')::uuid), 0, 'assignments are not copied');
SELECT is((SELECT count(*)::int FROM public.audit_logs WHERE action = 'crossword.copied' AND resource_id = current_setting('t.v2')::uuid), 1, 'copy is audited as crossword.copied');
SELECT throws_ok($$SELECT public.fn_create_crossword_version(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1')$$,
  'P0001', 'CROSSWORD_VERSION_EXISTS', 'one draft per lineage');
SELECT throws_ok($$SELECT public.fn_create_crossword_version(current_setting('t.v2')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1')$$,
  'P0001', 'CROSSWORD_VERSION_SOURCE_INVALID', 'a never-published draft is edited in place, not versioned');
SELECT throws_ok($$INSERT INTO public.crossword_puzzles (school_id, owner_id, title, level, settings, stats, seed, generator_version, placement_hash, rows, cols, root_id, version)
  SELECT school_id, owner_id, title, level, settings, stats, seed, generator_version, placement_hash, rows, cols, root_id, 2 FROM public.crossword_puzzles WHERE id = current_setting('t.v1')::uuid$$,
  '23505', NULL, 'a version number is unique within a lineage');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET version = 7 WHERE id = current_setting('t.v2')::uuid$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'lineage columns never change');
SELECT throws_ok($$SELECT pg_temp.save('00000000-0000-4000-8000-0000000a0003', p_puzzle => current_setting('t.v2')::uuid)$$, 'P0001', 'CROSSWORD_RESAVE_NOT_ALLOWED', 'the grid of a later version is the grid it was copied from');
SELECT lives_ok($$SELECT public.fn_update_crossword_draft(current_setting('t.v2')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'Version two',
  '[{"number":2,"direction":"down","clue":"고친 힌트"}]'::jsonb)$$, 'edit title and a clue in version 2');
SELECT is((SELECT clue FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid AND number = 2 AND direction = 'down'), '먹는 것', 'version 1 clue untouched');

SELECT lives_ok($$SELECT set_config('t.pub2', (pg_temp.publish(current_setting('t.v2')::uuid, '00000000-0000-4000-8000-000000000001', ARRAY['00000000-0000-4000-8000-0000000000d1']::uuid[]))::text, true)$$,
  'publish version 2 to one classroom');
SELECT is((SELECT status::text FROM public.crossword_puzzles WHERE id = current_setting('t.v1')::uuid), 'archived', 'version 1 archived by the publish');
SELECT is((SELECT status::text FROM public.crossword_puzzles WHERE id = current_setting('t.v2')::uuid), 'published', 'version 2 published');
SELECT is((SELECT count(*)::int FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.v1')::uuid AND status = 'closed'), 3, 'version 1 assignments closed');
SELECT is(jsonb_array_length(current_setting('t.pub2')::jsonb -> 'supersededClassroomIds'), 3, 'publish reports the classrooms that lost the old version');
SELECT is((SELECT count(*)::int FROM public.audit_logs WHERE action = 'crossword.archived' AND resource_id = current_setting('t.v1')::uuid AND metadata ->> 'reason' = 'superseded'), 1, 'supersede is audited');
SELECT throws_ok($$SELECT public.fn_set_crossword_archived(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', false)$$,
  'P0001', 'CROSSWORD_RESTORE_NOT_ALLOWED', 'a published puzzle cannot be restored: a new version is required');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET status = 'draft', archived_at = NULL WHERE id = current_setting('t.v1')::uuid$$,
  'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'and not by direct SQL either');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET title = 'x' WHERE id = current_setting('t.v1')::uuid$$,
  'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'an archived published puzzle is still frozen');
SELECT throws_ok($$SELECT public.fn_create_crossword_version(current_setting('t.v1')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1')$$,
  'P0001', 'CROSSWORD_VERSION_EXISTS', 'a version cannot branch off an older one');

-- Abandoned draft does not block a new one; version numbers are not reused; an unpublished puzzle restores.
SELECT lives_ok($$SELECT set_config('t.v3', (public.fn_create_crossword_version(current_setting('t.v2')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1') ->> 'puzzleId'), true)$$, 'version 3 draft');
SELECT lives_ok($$SELECT public.fn_set_crossword_archived(current_setting('t.v3')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', true)$$, 'abandon version 3');
SELECT throws_ok($$UPDATE public.crossword_words SET clue = 'x' WHERE puzzle_id = current_setting('t.v3')::uuid AND number = 1$$, 'P0001', 'CROSSWORD_PUBLISHED_IMMUTABLE', 'an archived puzzle is frozen until restored');
SELECT lives_ok($$SELECT set_config('t.v4', (public.fn_create_crossword_version(current_setting('t.v2')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1') ->> 'puzzleId'), true)$$, 'a new draft after an abandoned one');
SELECT is((SELECT version FROM public.crossword_puzzles WHERE id = current_setting('t.v4')::uuid), 4, 'the next version number is 4, not 3 again');
SELECT throws_ok($$SELECT public.fn_set_crossword_archived(current_setting('t.v3')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', false)$$,
  'P0001', 'CROSSWORD_VERSION_EXISTS', 'restoring a draft is refused while another draft exists');
SELECT lives_ok($$SELECT public.fn_set_crossword_archived(current_setting('t.v4')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', true)$$, 'archive version 4');
SELECT lives_ok($$SELECT public.fn_set_crossword_archived(current_setting('t.v3')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', false)$$, 'restore version 3 (never published) once nothing blocks it');
SELECT is((SELECT status::text FROM public.crossword_puzzles WHERE id = current_setting('t.v3')::uuid), 'draft', 'version 3 is a draft again');
SELECT lives_ok($$UPDATE public.crossword_words SET clue = 'editable again' WHERE puzzle_id = current_setting('t.v3')::uuid AND number = 1$$, 'and editable again');
SELECT throws_ok($$UPDATE public.crossword_puzzles SET status = 'draft', archived_at = NULL WHERE id = current_setting('t.v4')::uuid$$,
  '23505', NULL, 'the index allows one draft per lineage even for direct writes');

-- I. Closing and archiving.
SELECT lives_ok($$SELECT public.fn_close_crossword_assignment(
  (SELECT id FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.v2')::uuid LIMIT 1),
  '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1')$$, 'co-teacher closes an assignment of a frozen puzzle');
SELECT throws_ok($$SELECT public.fn_close_crossword_assignment(
  (SELECT id FROM public.crossword_assignments WHERE puzzle_id = current_setting('t.v2')::uuid LIMIT 1),
  '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1')$$, 'P0001', 'CROSSWORD_ASSIGNMENT_NOT_OPEN', 'already closed');
SELECT lives_ok($$SELECT public.fn_set_crossword_archived(current_setting('t.v2')::uuid, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', true)$$, 'archive the published version 2');
SELECT is((SELECT count(*)::int FROM public.crossword_puzzles WHERE root_id = current_setting('t.v1')::uuid AND status = 'published'), 0, 'no published version left in the lineage');

-- J. Row level security. Students and anon never see words; tickets have no client access.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.crossword_words), 0, 'student sees no words (no answers through the API)');
SELECT is((SELECT count(*)::int FROM public.crossword_puzzles), 0, 'student sees no puzzles');
SELECT is((SELECT count(*)::int FROM public.crossword_assignments), 0, 'student sees no assignments');
SELECT is((SELECT count(*)::int FROM public.crossword_preview_tickets), 0, 'tickets have no client access');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.crossword_puzzles), 0, 'outsider teacher sees no puzzle');
SELECT is((SELECT count(*)::int FROM public.crossword_words), 0, 'outsider teacher sees no words');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.crossword_puzzles WHERE root_id = current_setting('t.v1')::uuid), 4, 'co-teacher sees the lineage through the set classroom');
SELECT is((SELECT count(*)::int FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid), 5, 'co-teacher sees the words');
SELECT ok((SELECT count(*)::int FROM public.crossword_assignments) >= 1, 'co-teacher sees the assignments of their classroom');
SELECT is((SELECT word_count FROM public.v_crossword_puzzles_summary WHERE puzzle_id = current_setting('t.v3')::uuid), 5, 'summary view works for staff');
SELECT throws_ok($$INSERT INTO public.crossword_words (puzzle_id, number, direction, row, col, answer, clue) VALUES (current_setting('t.v3')::uuid, 9, 'across', 0, 0, '배', 'x')$$,
  '42501', NULL, 'authenticated cannot insert words');
UPDATE public.crossword_puzzles SET title = 'client write' WHERE id = current_setting('t.v3')::uuid;
RESET ROLE;
SELECT is((SELECT title FROM public.crossword_puzzles WHERE id = current_setting('t.v3')::uuid), 'Version two', 'client update changed nothing');

-- K. Cleanup of tickets (before the set is deleted: tickets cascade from it).
SELECT is(public.fn_cleanup_crossword_tickets(interval '0'), 1, 'cleanup removes the expired ticket');
SELECT throws_ok($$SELECT public.fn_cleanup_crossword_tickets(interval '-1 day')$$, 'P0001', 'CROSSWORD_CLEANUP_GRACE_INVALID', 'negative grace refused');

-- L. Independence from the set, and whole-lineage deletion (end-of-pilot run).
DELETE FROM public.content_sets WHERE id = '00000000-0000-4000-8000-0000000000e1';
SELECT is((SELECT count(*)::int FROM public.crossword_puzzles WHERE root_id = current_setting('t.v1')::uuid), 4, 'deleting the set keeps the puzzles, published ones included');
SELECT is((SELECT count(*)::int FROM public.crossword_words WHERE puzzle_id = current_setting('t.v1')::uuid AND source_entry_id IS NULL), 5, 'provenance becomes NULL, answers and clues stay');
SELECT is(public.fn_crossword_validate_words(3, 4, public.fn_crossword_words_json(current_setting('t.v1')::uuid)), NULL, 'stored words still validate');
SELECT lives_ok($$DELETE FROM public.crossword_puzzles WHERE root_id = current_setting('t.v1')::uuid$$, 'deleting a whole lineage works through the triggers');
SELECT is((SELECT count(*)::int FROM public.crossword_words WHERE puzzle_id IN (current_setting('t.v1')::uuid, current_setting('t.v2')::uuid)), 0, 'words of the deleted lineage are gone');
SELECT is((SELECT count(*)::int FROM public.crossword_assignments WHERE puzzle_id IN (current_setting('t.v1')::uuid, current_setting('t.v2')::uuid)), 0, 'assignments of the deleted lineage are gone');

SELECT * FROM finish();
ROLLBACK;
