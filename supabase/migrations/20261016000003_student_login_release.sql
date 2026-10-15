-- A1: give back a reserved sign-in attempt when the Auth call failed for a reason that is NOT a
-- wrong password (rate limit, outage, network). fn_student_login_begin reserves a slot BEFORE the
-- password is verified; without this, every 429 / 5xx / timeout would count toward the lock.
--
-- Safety properties:
--  * one atomic UPDATE (row-locked), never goes below 0;
--  * does nothing while an active lock exists (a lock written by another request stays);
--  * only the service role can call it; the caller (the sign-in action) classifies the error and
--    refunds ONLY infrastructure failures, so a wrong password can never be refunded.

CREATE OR REPLACE FUNCTION public.fn_student_login_release(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.student_accounts sa
  SET failed_attempts = GREATEST(sa.failed_attempts - 1, 0)
  WHERE sa.id = p_account_id
    AND sa.failed_attempts > 0
    AND (sa.locked_until IS NULL OR sa.locked_until <= pg_catalog.clock_timestamp());
END;
$$;

REVOKE ALL ON FUNCTION public.fn_student_login_release(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_student_login_release(uuid) TO service_role;
