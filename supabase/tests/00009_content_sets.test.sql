BEGIN;
SELECT plan(40);

-- Fixtures (rolled back). Teacher t1 (owner) comes from seed.sql.
-- b1 = student, b2 = co-teacher of classroom d1, b3 = outsider teacher, b4 = teacher deleted in the cascade test.
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000b1', 's1@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 't2@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b3', 't3@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b4', 't4@t.invalid')
) AS v(id, email);

INSERT INTO public.profiles (id, school_id, role, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'student', 'S1'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T2'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T3'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T4');

INSERT INTO public.classrooms (id, school_id, owner_id, name) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'A');
INSERT INTO public.classroom_teachers (classroom_id, teacher_id)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b2');

-- e1: owned by t1 and linked to classroom d1 (visible to co-teacher b2). e2: private to t1. f1: owned by b4.
INSERT INTO public.content_sets (id, school_id, owner_id, classroom_id, title) VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d1', 'S1'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', NULL, 'S2'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b4', NULL, 'T4 set');

INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version) VALUES
  ('00000000-0000-4000-8000-0000000000e1', 1, '사과', '과일', '사과', 'hangul', 1),
  ('00000000-0000-4000-8000-0000000000e1', 2, 'ice cream', '차가운 간식', 'ICECREAM', 'latin', 1),
  ('00000000-0000-4000-8000-0000000000e2', 1, '도서관', '책을 빌리는 곳', '도서관', 'hangul', 1),
  ('00000000-0000-4000-8000-0000000000f1', 1, '학교', '배우는 곳', '학교', 'hangul', 1);

INSERT INTO public.content_import_batches
  (id, school_id, actor_id, mode, commit_token_hash, rows_hash, source_sha256, source_bytes, total_rows, expires_at)
VALUES ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-000000000001', 'create', 'x', 'x', 'x', 10, 1, now() + interval '15 minutes');

-- A. Structure and RLS switches.
SELECT has_table('public', 'content_sets', 'content_sets exists');
SELECT has_table('public', 'content_entries', 'content_entries exists');
SELECT has_table('public', 'content_import_batches', 'content_import_batches exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.content_sets'::regclass), 'RLS on content_sets');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.content_entries'::regclass), 'RLS on content_entries');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.content_import_batches'::regclass), 'RLS on content_import_batches');

-- B. answer_length is generated from answer (code points = grid cells).
SELECT is((SELECT answer_length::int FROM public.content_entries WHERE answer = '사과'), 2, 'Hangul answer length counts syllables');
SELECT is((SELECT answer_length::int FROM public.content_entries WHERE answer = 'ICECREAM'), 8, 'Latin answer length counts letters');

-- C. Row level security.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.content_sets WHERE id IN ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000e2')), 2, 'owner sees both own sets');
SELECT is((SELECT count(*)::int FROM public.content_entries WHERE set_id IN ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000e2')), 3, 'owner sees the entries of own sets');
SELECT is((SELECT count(*)::int FROM public.content_import_batches), 0, 'batches have no client access');
SELECT is((SELECT count(*)::int FROM public.v_content_entries_active WHERE set_id = '00000000-0000-4000-8000-0000000000e1'), 2, 'owner sees active entries through the view');
SELECT throws_ok(
  $$INSERT INTO public.content_sets (school_id, owner_id, title)
    VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'client write')$$,
  '42501', NULL, 'authenticated cannot insert a set');
SELECT throws_ok(
  $$INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version)
    VALUES ('00000000-0000-4000-8000-0000000000e1', 9, '배', '과일', '배', 'hangul', 1)$$,
  '42501', NULL, 'authenticated cannot insert an entry');
DELETE FROM public.content_entries WHERE set_id = '00000000-0000-4000-8000-0000000000e1';
UPDATE public.content_sets SET title = 'changed' WHERE id = '00000000-0000-4000-8000-0000000000e1';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.content_entries WHERE set_id = '00000000-0000-4000-8000-0000000000e1'), 2, 'client delete changed nothing');
SELECT is((SELECT title FROM public.content_sets WHERE id = '00000000-0000-4000-8000-0000000000e1'), 'S1', 'client update changed nothing');

-- Co-teacher of the linked classroom: only the linked set and its entries.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.content_sets WHERE id IN ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000e2')), 1, 'co-teacher sees only the linked set');
SELECT is((SELECT count(*)::int FROM public.content_entries WHERE set_id IN ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000e2')), 2, 'co-teacher sees only the linked set entries');
RESET ROLE;

-- Outsider teacher: nothing.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.content_sets WHERE id IN ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000e2')), 0, 'outsider sees no sets');
SELECT is((SELECT count(*)::int FROM public.content_entries WHERE set_id IN ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000e2')), 0, 'outsider sees no entries');
SELECT is((SELECT count(*)::int FROM public.v_content_entries_active WHERE set_id = '00000000-0000-4000-8000-0000000000e1'), 0, 'outsider sees nothing through the view');
RESET ROLE;

-- Student: nothing.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.content_sets), 0, 'student sees no sets');
SELECT is((SELECT count(*)::int FROM public.content_entries), 0, 'student sees no entries');
RESET ROLE;

-- D. Constraints (run as the table owner).
SELECT throws_ok(
  $$INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version)
    VALUES ('00000000-0000-4000-8000-0000000000e2', 5, 'x', 'y', '사과!', 'hangul', 1)$$,
  '23514', NULL, 'answer with punctuation is refused');
SELECT throws_ok(
  $$INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version)
    VALUES ('00000000-0000-4000-8000-0000000000e2', 5, 'x', 'y', 'abc', 'latin', 1)$$,
  '23514', NULL, 'lowercase answer is refused');
SELECT throws_ok(
  $$INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version)
    VALUES ('00000000-0000-4000-8000-0000000000e2', 5, 'x', 'y', 'A B', 'latin', 1)$$,
  '23514', NULL, 'answer with a space is refused');
SELECT throws_ok(
  $$INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version)
    VALUES ('00000000-0000-4000-8000-0000000000e2', 5, 'x', 'y', '', 'latin', 1)$$,
  '23514', NULL, 'empty answer is refused');
SELECT throws_ok(
  $$INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version)
    VALUES ('00000000-0000-4000-8000-0000000000e2', 5, 'x', 'y', repeat('A', 31), 'latin', 1)$$,
  '23514', NULL, 'answer over the hard limit is refused');
SELECT throws_ok(
  $$INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version)
    VALUES ('00000000-0000-4000-8000-0000000000e2', 0, 'x', 'y', 'AB', 'latin', 1)$$,
  '23514', NULL, 'position must be positive');
SELECT throws_ok(
  $$INSERT INTO public.content_sets (school_id, owner_id, title)
    VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '   ')$$,
  '23514', NULL, 'blank title is refused');

-- Duplicate handling: one live entry per answer per set; archiving frees the answer.
SELECT throws_ok(
  $$INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version)
    VALUES ('00000000-0000-4000-8000-0000000000e1', 7, '사과', '또 다른 뜻', '사과', 'hangul', 1)$$,
  '23505', NULL, 'second live entry with the same answer is refused');
UPDATE public.content_entries SET archived_at = now()
WHERE set_id = '00000000-0000-4000-8000-0000000000e1' AND answer = '사과';
SELECT lives_ok(
  $$INSERT INTO public.content_entries (set_id, position, term, definition, answer, script, normalizer_version)
    VALUES ('00000000-0000-4000-8000-0000000000e1', 7, '사과', '새 뜻', '사과', 'hangul', 1)$$,
  'same answer is allowed once the first entry is archived');

-- Live title is unique per owner, ignoring case and surrounding spaces.
SELECT throws_ok(
  $$INSERT INTO public.content_sets (school_id, owner_id, title)
    VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', ' s2 ')$$,
  '23505', NULL, 'duplicate live title is refused');
UPDATE public.content_sets SET archived_at = now() WHERE id = '00000000-0000-4000-8000-0000000000e2';
SELECT lives_ok(
  $$INSERT INTO public.content_sets (school_id, owner_id, title)
    VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', ' s2 ')$$,
  'title can be reused after the first set is archived');

-- E. An archived set is hidden from the generator view.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.v_content_entries_active WHERE set_id = '00000000-0000-4000-8000-0000000000e2'), 0, 'archived set is hidden from v_content_entries_active');
RESET ROLE;

-- F. Cascades.
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000b4';
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b4'), 0, 'teacher profile removed');
SELECT is((SELECT count(*)::int FROM public.content_sets WHERE id = '00000000-0000-4000-8000-0000000000f1'), 0, 'deleting the owner removes the set');
SELECT is((SELECT count(*)::int FROM public.content_entries WHERE set_id = '00000000-0000-4000-8000-0000000000f1'), 0, 'deleting the owner removes the entries');

DELETE FROM public.classrooms WHERE id = '00000000-0000-4000-8000-0000000000d1';
SELECT is((SELECT count(*)::int FROM public.content_sets WHERE id = '00000000-0000-4000-8000-0000000000e1'), 1, 'deleting the classroom keeps the set');
SELECT is((SELECT classroom_id FROM public.content_sets WHERE id = '00000000-0000-4000-8000-0000000000e1'), NULL::uuid, 'the set is unlinked from the deleted classroom');

SELECT * FROM finish();
ROLLBACK;
