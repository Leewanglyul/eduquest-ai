BEGIN;
SELECT plan(8);

-- Fixtures (rolled back). Teacher t1 comes from seed.sql.
INSERT INTO public.content_import_batches
  (id, school_id, actor_id, mode, status, commit_token_hash, rows_hash, source_sha256, source_bytes, total_rows, expires_at)
SELECT v.id::uuid, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
       'create', v.status::public.content_import_status, 'x', 'x', 'x', 1, 1, now() + v.expires::interval
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'previewed', '-3 days'),   -- stale preview: deleted
  ('00000000-0000-4000-8000-0000000000c2', 'expired',   '-3 days'),   -- stale expired: deleted
  ('00000000-0000-4000-8000-0000000000c3', 'previewed', '-1 hour'),   -- expired but inside the grace: kept
  ('00000000-0000-4000-8000-0000000000c4', 'previewed', '10 minutes'),-- live preview: kept
  ('00000000-0000-4000-8000-0000000000c5', 'completed', '-30 days')   -- history: kept
) AS v(id, status, expires);

SELECT ok(NOT has_function_privilege('authenticated', 'public.fn_cleanup_content_import_batches(interval)', 'EXECUTE'), 'authenticated cannot execute');
SELECT ok(NOT has_function_privilege('anon', 'public.fn_cleanup_content_import_batches(interval)', 'EXECUTE'), 'anon cannot execute');
SELECT ok(has_function_privilege('service_role', 'public.fn_cleanup_content_import_batches(interval)', 'EXECUTE'), 'service_role can execute');

SELECT is(public.fn_cleanup_content_import_batches(interval '1 day'), 2, 'two stale batches are deleted');
SELECT is((SELECT count(*)::int FROM public.content_import_batches
           WHERE id IN ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2')), 0, 'the stale previewed and expired batches are gone');
SELECT is((SELECT count(*)::int FROM public.content_import_batches
           WHERE id IN ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000c5')), 3,
          'recent, live and completed batches stay');
SELECT is(public.fn_cleanup_content_import_batches(interval '1 day'), 0, 'running it again deletes nothing');
SELECT throws_ok($$SELECT public.fn_cleanup_content_import_batches(interval '-1 day')$$, 'P0001', 'CONTENT_CLEANUP_GRACE_INVALID', 'a negative grace is refused');

SELECT * FROM finish();
ROLLBACK;
