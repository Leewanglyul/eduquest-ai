-- P0 fix: atomic student sign-in lockout.
--
-- The previous flow (read account -> check lock -> verify password -> read-modify-write counter) let
-- parallel requests all pass the lock check and under-count failures. Here every attempt first
-- RESERVES a slot with a single UPDATE (row-locked, so concurrent callers serialize and re-evaluate
-- the WHERE clause). At most `p_limit` password checks can be in flight/failed per window; the
-- failure of the final slot sets the lock.
--
--   begin:   reserve a slot            (before verifying the password)
--   fail:    lock when slots exhausted (after a failed password check)
--   success: existing reset (failed_attempts = 0, locked_until = NULL)

CREATE OR REPLACE FUNCTION public.fn_student_login_begin(
  p_account_id uuid,
  p_limit integer
)
RETURNS TABLE (allowed boolean, locked_until timestamptz)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.student_accounts%ROWTYPE;
BEGIN
  UPDATE public.student_accounts sa
  SET failed_attempts = CASE
        WHEN sa.locked_until IS NOT NULL AND sa.locked_until <= v_now THEN 1
        ELSE sa.failed_attempts + 1
      END,
      locked_until = CASE
        WHEN sa.locked_until IS NOT NULL AND sa.locked_until <= v_now THEN NULL
        ELSE sa.locked_until
      END
  WHERE sa.id = p_account_id
    AND (sa.locked_until IS NULL OR sa.locked_until <= v_now)
    AND (sa.failed_attempts < p_limit OR sa.locked_until <= v_now)
  RETURNING * INTO v_row;

  IF FOUND THEN
    allowed := true;
    locked_until := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Denied: either locked, or every slot in this window is already reserved.
  SELECT sa.locked_until INTO locked_until
  FROM public.student_accounts sa
  WHERE sa.id = p_account_id;
  allowed := false;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_student_login_fail(
  p_account_id uuid,
  p_limit integer,
  p_lock_minutes integer
)
RETURNS TABLE (locked boolean, locked_until timestamptz)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_until timestamptz;
BEGIN
  -- All slots reserved (>= limit) and no active lock yet => this failure completes the window: lock.
  UPDATE public.student_accounts sa
  SET locked_until = v_now + pg_catalog.make_interval(mins => p_lock_minutes)
  WHERE sa.id = p_account_id
    AND sa.failed_attempts >= p_limit
    AND (sa.locked_until IS NULL OR sa.locked_until <= v_now)
  RETURNING sa.locked_until INTO v_until;

  IF v_until IS NULL THEN
    SELECT sa.locked_until INTO v_until
    FROM public.student_accounts sa
    WHERE sa.id = p_account_id AND sa.locked_until > v_now;
  END IF;

  locked := v_until IS NOT NULL;
  locked_until := v_until;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_student_login_begin(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_student_login_fail(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_student_login_begin(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_student_login_fail(uuid, integer, integer) TO service_role;
