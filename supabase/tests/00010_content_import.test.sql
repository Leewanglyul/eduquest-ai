BEGIN;
SELECT plan(46);

-- Fixtures (rolled back). Teacher t1 (owner) comes from seed.sql, school a1.
-- b2 = co-teacher of classroom d1, b3 = outsider teacher, b5 = suspended teacher.
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000b2', 't2@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b3', 't3@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b5', 't5@t.invalid')
) AS v(id, email);

INSERT INTO public.profiles (id, school_id, role, display_name, status) VALUES
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T2', 'active'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T3', 'active'),
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T5', 'suspended');

INSERT INTO public.classrooms (id, school_id, owner_id, name, archived_at) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'A', NULL),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'B-archived', now());
INSERT INTO public.classroom_teachers (classroom_id, teacher_id)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b2');

-- e1: linked to d1 (co-teacher b2 may append, not replace). e3: archived. e4: other school.
INSERT INTO public.content_sets (id, school_id, owner_id, classroom_id, title, archived_at) VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d1', 'Linked', NULL),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', NULL, 'Archived', now()),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', NULL, 'Other school', NULL);

-- Helpers (session-local). b(n): batch id. mk: insert a previewed batch. r: rows json from answers.
-- c: call the commit function as school a1 with a fixed rows hash 'rh'.
CREATE FUNCTION pg_temp.b(n int) RETURNS uuid LANGUAGE sql AS
$$ SELECT ('00000000-0000-4000-8000-00000000' || lpad(n::text, 4, '0'))::uuid $$;

CREATE FUNCTION pg_temp.mk(
  n int, actor uuid, mode public.content_import_mode, target uuid,
  token text DEFAULT 'tk', hash text DEFAULT 'rh', ttl interval DEFAULT interval '15 minutes'
) RETURNS void LANGUAGE sql AS
$$ INSERT INTO public.content_import_batches
     (id, school_id, actor_id, set_id, mode, commit_token_hash, rows_hash, source_sha256, source_bytes, total_rows, expires_at)
   VALUES (pg_temp.b(n), '00000000-0000-4000-8000-0000000000a1', actor, target, mode, token, hash, 'sha', 10, 1, now() + ttl) $$;

CREATE FUNCTION pg_temp.r(answers text[]) RETURNS jsonb LANGUAGE sql AS
$$ SELECT jsonb_agg(jsonb_build_object(
     'term', a, 'definition', 'd', 'answer', a, 'script', 'hangul', 'normalizerVersion', 1, 'line', ord + 1))
   FROM unnest(answers) WITH ORDINALITY AS u(a, ord) $$;

CREATE FUNCTION pg_temp.c(
  n int, actor uuid, token text, mode public.content_import_mode, target uuid, title text, rows jsonb,
  max_entries int DEFAULT 200, hash text DEFAULT 'rh', classroom uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql AS
$$ SELECT public.fn_commit_content_import(
     pg_temp.b(n), actor, '00000000-0000-4000-8000-0000000000a1'::uuid, token, hash, mode, target, title, classroom, rows, max_entries) $$;

-- A. Only the service role may execute the function.
SELECT ok(NOT has_function_privilege('authenticated',
  'public.fn_commit_content_import(uuid,uuid,uuid,text,text,public.content_import_mode,uuid,text,uuid,jsonb,integer)', 'EXECUTE'), 'authenticated cannot execute');
SELECT ok(NOT has_function_privilege('anon',
  'public.fn_commit_content_import(uuid,uuid,uuid,text,text,public.content_import_mode,uuid,text,uuid,jsonb,integer)', 'EXECUTE'), 'anon cannot execute');
SELECT ok(has_function_privilege('service_role',
  'public.fn_commit_content_import(uuid,uuid,uuid,text,text,public.content_import_mode,uuid,text,uuid,jsonb,integer)', 'EXECUTE'), 'service_role can execute');

-- B. create: new set, entries in file order, batch completed, audited without content.
SELECT pg_temp.mk(1, '00000000-0000-4000-8000-000000000001', 'create', NULL);
CREATE TEMP TABLE r_create AS
SELECT pg_temp.c(1, '00000000-0000-4000-8000-000000000001', 'tk', 'create', NULL, '  Created  ', pg_temp.r(ARRAY['사과', '도서관'])) AS j;

SELECT is((SELECT j->>'status' FROM r_create), 'completed', 'create commits');
SELECT is((SELECT (j->>'accepted')::int FROM r_create), 2, 'create accepts both rows');
SELECT is((SELECT title FROM public.content_sets WHERE id = (SELECT (j->>'setId')::uuid FROM r_create)), 'Created', 'title is trimmed');
SELECT is((SELECT array_agg(position ORDER BY position) FROM public.content_entries
           WHERE set_id = (SELECT (j->>'setId')::uuid FROM r_create)), ARRAY[1, 2], 'positions follow the file order');
SELECT is((SELECT status::text FROM public.content_import_batches WHERE id = pg_temp.b(1)), 'completed', 'batch is completed');
SELECT is((SELECT set_id FROM public.content_import_batches WHERE id = pg_temp.b(1)), (SELECT (j->>'setId')::uuid FROM r_create), 'batch points at the new set');
SELECT is((SELECT count(*)::int FROM public.audit_logs
           WHERE resource_id = (SELECT (j->>'setId')::uuid FROM r_create)
             AND action IN ('content_set.created', 'content_set.import_completed')), 2, 'create writes two audit rows');
SELECT is((SELECT count(*)::int FROM public.audit_logs
           WHERE action IN ('content_set.created', 'content_set.import_completed')
             AND (metadata::text LIKE '%사과%' OR metadata::text LIKE '%도서관%')), 0, 'audit metadata holds no terms');

-- C. The token is single use.
SELECT throws_ok(
  $$SELECT pg_temp.c(1, '00000000-0000-4000-8000-000000000001', 'tk', 'create', NULL, 'Again', pg_temp.r(ARRAY['사과']))$$,
  'P0001', 'CONTENT_BATCH_NOT_FOUND', 'a used batch cannot be committed again');

-- D. append: an answer that landed after the preview is skipped, not an error; positions continue.
SELECT pg_temp.mk(2, '00000000-0000-4000-8000-000000000001', 'append', (SELECT (j->>'setId')::uuid FROM r_create));
CREATE TEMP TABLE r_append AS
SELECT pg_temp.c(2, '00000000-0000-4000-8000-000000000001', 'tk', 'append', (SELECT (j->>'setId')::uuid FROM r_create), NULL,
                 pg_temp.r(ARRAY['사과', '귤'])) AS j;
SELECT is((SELECT (j->>'accepted')::int FROM r_append), 1, 'append accepts the new answer');
SELECT is((SELECT (j->>'skipped')::int FROM r_append), 1, 'append skips the answer already in the set');
SELECT cmp_ok((SELECT position FROM public.content_entries
               WHERE set_id = (SELECT (j->>'setId')::uuid FROM r_create) AND answer = '귤'), '>', 2, 'appended rows continue after the existing positions');
SELECT is((SELECT count(*)::int FROM public.content_entries
           WHERE set_id = (SELECT (j->>'setId')::uuid FROM r_create) AND archived_at IS NULL), 3, 'three live entries');

-- E. Token, hash, mode, target and actor checks leave the batch usable.
SELECT pg_temp.mk(3, '00000000-0000-4000-8000-000000000001', 'append', (SELECT (j->>'setId')::uuid FROM r_create));
SELECT throws_ok(
  $$SELECT pg_temp.c(3, '00000000-0000-4000-8000-000000000001', 'wrong', 'append', (SELECT (j->>'setId')::uuid FROM r_create), NULL, pg_temp.r(ARRAY['배']))$$,
  'P0001', 'CONTENT_TOKEN_INVALID', 'wrong token is refused');
SELECT throws_ok(
  $$SELECT pg_temp.c(3, '00000000-0000-4000-8000-000000000001', 'tk', 'append', (SELECT (j->>'setId')::uuid FROM r_create), NULL, pg_temp.r(ARRAY['배']), 200, 'other-hash')$$,
  'P0001', 'CONTENT_ROWS_CHANGED', 'a different rows hash is refused');
SELECT throws_ok(
  $$SELECT pg_temp.c(3, '00000000-0000-4000-8000-000000000001', 'tk', 'replace', (SELECT (j->>'setId')::uuid FROM r_create), NULL, pg_temp.r(ARRAY['배']))$$,
  'P0001', 'CONTENT_ROWS_CHANGED', 'a token from an append cannot commit a replace');
SELECT throws_ok(
  $$SELECT pg_temp.c(3, '00000000-0000-4000-8000-000000000001', 'tk', 'append', '00000000-0000-4000-8000-0000000000e1', NULL, pg_temp.r(ARRAY['배']))$$,
  'P0001', 'CONTENT_ROWS_CHANGED', 'a token cannot be moved to another set');
SELECT throws_ok(
  $$SELECT pg_temp.c(3, '00000000-0000-4000-8000-0000000000b3', 'tk', 'append', (SELECT (j->>'setId')::uuid FROM r_create), NULL, pg_temp.r(ARRAY['배']))$$,
  'P0001', 'CONTENT_BATCH_NOT_FOUND', 'another actor cannot use the batch');
SELECT is((SELECT status::text FROM public.content_import_batches WHERE id = pg_temp.b(3)), 'previewed', 'refusals leave the batch previewed');

-- F. An expired preview is marked expired (not rolled back) and nothing is written.
SELECT pg_temp.mk(4, '00000000-0000-4000-8000-000000000001', 'append', (SELECT (j->>'setId')::uuid FROM r_create), 'tk', 'rh', interval '-1 minute');
SELECT is((SELECT pg_temp.c(4, '00000000-0000-4000-8000-000000000001', 'tk', 'append', (SELECT (j->>'setId')::uuid FROM r_create), NULL, pg_temp.r(ARRAY['배']))->>'status'),
          'expired', 'an expired preview reports expired');
SELECT is((SELECT status::text FROM public.content_import_batches WHERE id = pg_temp.b(4)), 'expired', 'the batch is marked expired');

-- G. replace: old entries are archived with this batch id and the file becomes the set content.
SELECT pg_temp.mk(5, '00000000-0000-4000-8000-000000000001', 'replace', (SELECT (j->>'setId')::uuid FROM r_create));
CREATE TEMP TABLE r_replace AS
SELECT pg_temp.c(5, '00000000-0000-4000-8000-000000000001', 'tk', 'replace', (SELECT (j->>'setId')::uuid FROM r_create), NULL,
                 pg_temp.r(ARRAY['포도', '수박'])) AS j;
SELECT is((SELECT (j->>'archived')::int FROM r_replace), 3, 'replace archives the three old entries');
SELECT is((SELECT count(*)::int FROM public.content_entries
           WHERE set_id = (SELECT (j->>'setId')::uuid FROM r_create) AND archived_at IS NULL), 2, 'two live entries after replace');
SELECT is((SELECT count(*)::int FROM public.content_entries WHERE archived_batch_id = pg_temp.b(5)), 3, 'archived rows remember the batch');

-- H. A replace that would exceed the cap rolls back everything, including the archive step.
SELECT pg_temp.mk(6, '00000000-0000-4000-8000-000000000001', 'replace', (SELECT (j->>'setId')::uuid FROM r_create));
SELECT throws_ok(
  $$SELECT pg_temp.c(6, '00000000-0000-4000-8000-000000000001', 'tk', 'replace', (SELECT (j->>'setId')::uuid FROM r_create), NULL, pg_temp.r(ARRAY['A1', 'B2']), 1)$$,
  'P0001', 'CONTENT_SET_TOO_LARGE', 'the set cap is enforced');
SELECT is((SELECT count(*)::int FROM public.content_entries
           WHERE set_id = (SELECT (j->>'setId')::uuid FROM r_create) AND archived_at IS NULL), 2, 'the failed replace archived nothing');
SELECT is((SELECT status::text FROM public.content_import_batches WHERE id = pg_temp.b(6)), 'previewed', 'the failed replace left the batch previewed');

-- I. Authorisation: co-teacher may append to the linked set but not replace it; outsiders and suspended users may not.
SELECT pg_temp.mk(7, '00000000-0000-4000-8000-0000000000b2', 'append', '00000000-0000-4000-8000-0000000000e1');
SELECT lives_ok(
  $$SELECT pg_temp.c(7, '00000000-0000-4000-8000-0000000000b2', 'tk', 'append', '00000000-0000-4000-8000-0000000000e1', NULL, pg_temp.r(ARRAY['사과']))$$,
  'co-teacher can append to the linked set');
SELECT pg_temp.mk(8, '00000000-0000-4000-8000-0000000000b2', 'replace', '00000000-0000-4000-8000-0000000000e1');
SELECT throws_ok(
  $$SELECT pg_temp.c(8, '00000000-0000-4000-8000-0000000000b2', 'tk', 'replace', '00000000-0000-4000-8000-0000000000e1', NULL, pg_temp.r(ARRAY['사과']))$$,
  'P0001', 'CONTENT_FORBIDDEN', 'co-teacher cannot replace');
SELECT pg_temp.mk(9, '00000000-0000-4000-8000-0000000000b3', 'append', '00000000-0000-4000-8000-0000000000e1');
SELECT throws_ok(
  $$SELECT pg_temp.c(9, '00000000-0000-4000-8000-0000000000b3', 'tk', 'append', '00000000-0000-4000-8000-0000000000e1', NULL, pg_temp.r(ARRAY['사과']))$$,
  'P0001', 'CONTENT_FORBIDDEN', 'outsider cannot append');
SELECT pg_temp.mk(10, '00000000-0000-4000-8000-0000000000b5', 'create', NULL);
SELECT throws_ok(
  $$SELECT pg_temp.c(10, '00000000-0000-4000-8000-0000000000b5', 'tk', 'create', NULL, 'Suspended', pg_temp.r(ARRAY['사과']))$$,
  'P0001', 'CONTENT_FORBIDDEN', 'suspended teacher cannot import');

-- J. Target checks.
SELECT pg_temp.mk(11, '00000000-0000-4000-8000-000000000001', 'append', '00000000-0000-4000-8000-0000000000e3');
SELECT throws_ok(
  $$SELECT pg_temp.c(11, '00000000-0000-4000-8000-000000000001', 'tk', 'append', '00000000-0000-4000-8000-0000000000e3', NULL, pg_temp.r(ARRAY['사과']))$$,
  'P0001', 'CONTENT_SET_ARCHIVED', 'archived set is refused');
SELECT pg_temp.mk(12, '00000000-0000-4000-8000-000000000001', 'append', '00000000-0000-4000-8000-0000000000e4');
SELECT throws_ok(
  $$SELECT pg_temp.c(12, '00000000-0000-4000-8000-000000000001', 'tk', 'append', '00000000-0000-4000-8000-0000000000e4', NULL, pg_temp.r(ARRAY['사과']))$$,
  'P0001', 'CONTENT_SET_NOT_FOUND', 'a set of another school is not found');

-- K. create checks.
SELECT pg_temp.mk(13, '00000000-0000-4000-8000-000000000001', 'create', NULL);
SELECT throws_ok(
  $$SELECT pg_temp.c(13, '00000000-0000-4000-8000-000000000001', 'tk', 'create', NULL, ' created ', pg_temp.r(ARRAY['사과']))$$,
  'P0001', 'CONTENT_TITLE_DUPLICATE', 'duplicate live title is refused');
SELECT throws_ok(
  $$SELECT pg_temp.c(13, '00000000-0000-4000-8000-000000000001', 'tk', 'create', NULL, '   ', pg_temp.r(ARRAY['사과']))$$,
  'P0001', 'CONTENT_TITLE_INVALID', 'blank title is refused');
SELECT throws_ok(
  $$SELECT pg_temp.c(13, '00000000-0000-4000-8000-000000000001', 'tk', 'create', NULL, 'Archived room', pg_temp.r(ARRAY['사과']), 200, 'rh', '00000000-0000-4000-8000-0000000000d2')$$,
  'P0001', 'CONTENT_CLASSROOM_INVALID', 'archived classroom is refused');
SELECT pg_temp.mk(14, '00000000-0000-4000-8000-0000000000b3', 'create', NULL);
SELECT throws_ok(
  $$SELECT pg_temp.c(14, '00000000-0000-4000-8000-0000000000b3', 'tk', 'create', NULL, 'Not mine', pg_temp.r(ARRAY['사과']), 200, 'rh', '00000000-0000-4000-8000-0000000000d1')$$,
  'P0001', 'CONTENT_CLASSROOM_INVALID', 'a classroom the actor does not teach is refused');
SELECT throws_ok(
  $$SELECT pg_temp.c(13, '00000000-0000-4000-8000-000000000001', 'tk', 'create', '00000000-0000-4000-8000-0000000000e1', 'X', pg_temp.r(ARRAY['사과']))$$,
  'P0001', 'CONTENT_ROWS_CHANGED', 'create with a target set does not match the batch');
SELECT lives_ok(
  $$SELECT pg_temp.c(14, '00000000-0000-4000-8000-0000000000b3', 'tk', 'create', NULL, 'Mine', pg_temp.r(ARRAY['사과']))$$,
  'a plain create by another teacher works');
SELECT is((SELECT owner_id FROM public.content_sets WHERE title = 'Mine'), '00000000-0000-4000-8000-0000000000b3'::uuid, 'the committing teacher owns the new set');

-- L. Empty input.
SELECT throws_ok(
  $$SELECT pg_temp.c(13, '00000000-0000-4000-8000-000000000001', 'tk', 'create', NULL, 'Empty', '[]'::jsonb)$$,
  'P0001', 'CONTENT_NO_ROWS', 'an empty row list is refused');

-- M. Summary view (service role reads everything).
SELECT is((SELECT entry_count FROM public.v_content_sets_summary
           WHERE set_id = (SELECT (j->>'setId')::uuid FROM r_create)), 2, 'summary counts live entries only');
SELECT is((SELECT min_answer_length::int FROM public.v_content_sets_summary
           WHERE set_id = (SELECT (j->>'setId')::uuid FROM r_create)), 2, 'summary reports the shortest answer');

SELECT * FROM finish();
ROLLBACK;
