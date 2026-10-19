-- Student erasure must succeed even when crossword attempts exist (governance blocker, PM 2026-10-18).
--
-- Deleting an auth user cascades auth.users -> profiles -> students -> crossword_attempt_members. The member table's
-- AFTER DELETE trigger then reads the members and deletes the attempt. The function was SECURITY INVOKER, and the
-- cascade started from GoTrue (role supabase_auth_admin), which has no rights on crossword_* tables, so
-- auth.admin.deleteUser failed with "Database error deleting user" for every student who had an attempt. Deleting the
-- student row as postgres or service_role worked, which is why the earlier pgTAP erasure cases did not see it.
--
-- The function now runs with its owner's rights and a pinned search_path. It only ever deletes the attempt named by the
-- member row that was just removed, and it stays unreachable for API roles (execute revoked, as before).
CREATE OR REPLACE FUNCTION public.fn_crossword_attempt_members_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crossword_attempt_members m WHERE m.attempt_id = OLD.attempt_id) THEN
    DELETE FROM public.crossword_attempts WHERE id = OLD.attempt_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_crossword_attempt_members_cleanup() FROM PUBLIC, anon, authenticated;
