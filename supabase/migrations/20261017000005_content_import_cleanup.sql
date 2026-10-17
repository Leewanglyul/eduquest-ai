-- M2-1.2: cleanup of content import tickets (docs/m2/02-implementation-plan.md, 1.2).
-- Previews that were never committed (status 'previewed' or 'expired') hold only hashes and counts, but they
-- accumulate. Completed batches are kept: they are the import history and are referenced by entries.
-- service_role only; the application calls it opportunistically when a preview is created, and Ops may run it.
CREATE OR REPLACE FUNCTION public.fn_cleanup_content_import_batches(p_grace interval DEFAULT interval '1 day')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_grace IS NULL OR p_grace < interval '0' THEN
    RAISE EXCEPTION 'CONTENT_CLEANUP_GRACE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.content_import_batches b
  WHERE b.status IN ('previewed', 'expired')
    AND b.expires_at < pg_catalog.now() - p_grace;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cleanup_content_import_batches(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_content_import_batches(interval) TO service_role;
