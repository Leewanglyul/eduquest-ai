-- Teacher-initiated temporary password reissue.
--  * new audit action for the reissue event
--  * fn_revoke_user_sessions: deleting auth.sessions (refresh tokens cascade) ends every existing
--    session of the user, so an old/stolen session cannot ride the forced password change.

ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'student.password_reissued';

CREATE OR REPLACE FUNCTION public.fn_revoke_user_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_revoke_user_sessions(uuid) TO service_role;
