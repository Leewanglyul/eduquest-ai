-- M2-1.1: atomic commit of a previewed CSV content import, plus the read views for the crossword generator.
-- One transaction: token/hash checks, authorisation, set create/lock, optional archive (replace), insert,
-- cap check, batch update, audit. Any exception rolls everything back, so there is no half-applied import
-- and no 'running' state. service_role only; the caller (server action) passes the acting teacher/admin.
--
-- Errors are raised as P0001 with a stable message code the TypeScript service maps to Korean text:
--   CONTENT_BATCH_NOT_FOUND, CONTENT_TOKEN_INVALID, CONTENT_ROWS_CHANGED, CONTENT_FORBIDDEN,
--   CONTENT_MODE_INVALID, CONTENT_NO_ROWS, CONTENT_TITLE_INVALID, CONTENT_TITLE_DUPLICATE,
--   CONTENT_CLASSROOM_INVALID, CONTENT_SET_NOT_FOUND, CONTENT_SET_ARCHIVED, CONTENT_SET_TOO_LARGE.
-- An expired preview is NOT raised (the status change to 'expired' must survive): the function returns
-- {"status":"expired"} instead.
CREATE OR REPLACE FUNCTION public.fn_commit_content_import(
  p_batch_id uuid,
  p_actor_id uuid,
  p_school_id uuid,
  p_token_hash text,
  p_rows_hash text,
  p_mode public.content_import_mode,
  p_set_id uuid,
  p_new_title text,
  p_classroom_id uuid,
  p_rows jsonb,
  p_max_entries integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_batch public.content_import_batches%ROWTYPE;
  v_actor_role public.user_role;
  v_actor_school uuid;
  v_actor_status public.profile_status;
  v_classroom public.classrooms%ROWTYPE;
  v_set public.content_sets%ROWTYPE;
  v_set_id uuid;
  v_is_owner boolean;
  v_is_coteacher boolean;
  v_accepted integer;
  v_skipped integer;
  v_archived integer := 0;
  v_live integer;
  v_max_pos integer;
  v_created boolean := false;
BEGIN
  IF p_rows IS NULL OR pg_catalog.jsonb_typeof(p_rows) <> 'array' OR pg_catalog.jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'CONTENT_NO_ROWS' USING ERRCODE = 'P0001';
  END IF;
  IF p_max_entries IS NULL OR p_max_entries < 1 THEN
    RAISE EXCEPTION 'CONTENT_SET_TOO_LARGE' USING ERRCODE = 'P0001';
  END IF;

  -- Claim the batch row. Concurrent commits with the same token serialise here; the loser sees 'completed'.
  SELECT * INTO v_batch
  FROM public.content_import_batches b
  WHERE b.id = p_batch_id AND b.actor_id = p_actor_id AND b.school_id = p_school_id
  FOR UPDATE;
  IF NOT FOUND OR v_batch.status <> 'previewed' THEN
    RAISE EXCEPTION 'CONTENT_BATCH_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_batch.commit_token_hash <> p_token_hash THEN
    RAISE EXCEPTION 'CONTENT_TOKEN_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF v_batch.expires_at < pg_catalog.now() THEN
    UPDATE public.content_import_batches SET status = 'expired' WHERE id = v_batch.id;
    RETURN pg_catalog.jsonb_build_object('status', 'expired');
  END IF;
  IF v_batch.rows_hash <> p_rows_hash
     OR v_batch.mode <> p_mode
     OR v_batch.set_id IS DISTINCT FROM p_set_id THEN
    RAISE EXCEPTION 'CONTENT_ROWS_CHANGED' USING ERRCODE = 'P0001';
  END IF;

  -- Acting user: active teacher or admin of this school.
  SELECT p.role, p.school_id, p.status INTO v_actor_role, v_actor_school, v_actor_status
  FROM public.profiles p WHERE p.id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_status <> 'active' OR v_actor_school <> p_school_id
     OR v_actor_role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_mode = 'create' THEN
    IF p_set_id IS NOT NULL THEN
      RAISE EXCEPTION 'CONTENT_MODE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF p_new_title IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_new_title)) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'CONTENT_TITLE_INVALID' USING ERRCODE = 'P0001';
    END IF;

    IF p_classroom_id IS NOT NULL THEN
      SELECT * INTO v_classroom FROM public.classrooms c WHERE c.id = p_classroom_id;
      IF NOT FOUND OR v_classroom.school_id <> p_school_id OR v_classroom.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'CONTENT_CLASSROOM_INVALID' USING ERRCODE = 'P0001';
      END IF;
      IF v_actor_role <> 'admin' AND NOT (
        v_classroom.owner_id = p_actor_id OR EXISTS (
          SELECT 1 FROM public.classroom_teachers ct
          WHERE ct.classroom_id = v_classroom.id AND ct.teacher_id = p_actor_id)
      ) THEN
        RAISE EXCEPTION 'CONTENT_CLASSROOM_INVALID' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    BEGIN
      INSERT INTO public.content_sets (school_id, owner_id, classroom_id, title)
      VALUES (p_school_id, p_actor_id, p_classroom_id, pg_catalog.btrim(p_new_title))
      RETURNING id INTO v_set_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'CONTENT_TITLE_DUPLICATE' USING ERRCODE = 'P0001';
    END;
    v_created := true;
    SELECT * INTO v_set FROM public.content_sets s WHERE s.id = v_set_id;
  ELSIF p_mode IN ('append', 'replace') THEN
    -- The classroom link is chosen when the set is created, never by an import into an existing set.
    IF p_set_id IS NULL OR p_classroom_id IS NOT NULL THEN
      RAISE EXCEPTION 'CONTENT_MODE_INVALID' USING ERRCODE = 'P0001';
    END IF;

    -- Row lock: serialises concurrent imports into the same set.
    SELECT * INTO v_set FROM public.content_sets s
    WHERE s.id = p_set_id AND s.school_id = p_school_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONTENT_SET_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_set.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'CONTENT_SET_ARCHIVED' USING ERRCODE = 'P0001';
    END IF;

    -- Default rights (decision D3): owner and admin may append and replace; a co-teacher of the linked
    -- classroom may append only.
    v_is_owner := (v_set.owner_id = p_actor_id);
    v_is_coteacher := v_set.classroom_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.classroom_teachers ct
      WHERE ct.classroom_id = v_set.classroom_id AND ct.teacher_id = p_actor_id);
    IF NOT (
      v_actor_role = 'admin'
      OR v_is_owner
      OR (p_mode = 'append' AND v_is_coteacher)
    ) THEN
      RAISE EXCEPTION 'CONTENT_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    v_set_id := v_set.id;

    IF p_mode = 'replace' THEN
      UPDATE public.content_entries
      SET archived_at = pg_catalog.timezone('utc', pg_catalog.now()), archived_batch_id = p_batch_id
      WHERE set_id = v_set_id AND archived_at IS NULL;
      GET DIAGNOSTICS v_archived = ROW_COUNT;
    END IF;
  ELSE
    RAISE EXCEPTION 'CONTENT_MODE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(pg_catalog.max(e.position), 0) INTO v_max_pos
  FROM public.content_entries e WHERE e.set_id = v_set_id;

  -- Rows arrive already normalised by the application; the table CHECKs and the partial unique index
  -- are the backstop. A conflict with a live entry (another commit landed since the preview) is skipped.
  INSERT INTO public.content_entries
    (set_id, position, term, definition, answer, script, normalizer_version, source_line, import_batch_id)
  SELECT
    v_set_id,
    v_max_pos + el.ord::integer,
    el.value ->> 'term',
    el.value ->> 'definition',
    el.value ->> 'answer',
    (el.value ->> 'script')::public.content_script,
    (el.value ->> 'normalizerVersion')::smallint,
    (el.value ->> 'line')::integer,
    p_batch_id
  FROM pg_catalog.jsonb_array_elements(p_rows) WITH ORDINALITY AS el(value, ord)
  ON CONFLICT (set_id, answer) WHERE archived_at IS NULL DO NOTHING;
  GET DIAGNOSTICS v_accepted = ROW_COUNT;
  v_skipped := pg_catalog.jsonb_array_length(p_rows) - v_accepted;

  SELECT pg_catalog.count(*)::integer INTO v_live
  FROM public.content_entries e WHERE e.set_id = v_set_id AND e.archived_at IS NULL;
  IF v_live > p_max_entries THEN
    -- Rolls back the whole import, including the archive step and a newly created set.
    RAISE EXCEPTION 'CONTENT_SET_TOO_LARGE' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.content_import_batches
  SET status = 'completed',
      set_id = v_set_id,
      accepted_rows = v_accepted,
      skipped_rows = v_skipped,
      archived_rows = v_archived,
      completed_at = pg_catalog.timezone('utc', pg_catalog.now())
  WHERE id = v_batch.id;

  -- Touch the set so "last updated" reflects the import (the trigger sets updated_at).
  UPDATE public.content_sets SET title = title WHERE id = v_set_id;

  -- Audit metadata carries counts, ids and hashes only: never a term or a definition.
  IF v_created THEN
    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, classroom_id, metadata)
    VALUES (
      p_actor_id, 'content_set.created', 'content_set', v_set_id, v_set.classroom_id,
      pg_catalog.jsonb_build_object('schoolId', p_school_id, 'batchId', v_batch.id, 'entryCount', v_accepted)
    );
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, classroom_id, metadata)
  VALUES (
    p_actor_id, 'content_set.import_completed', 'content_set', v_set_id, v_set.classroom_id,
    pg_catalog.jsonb_build_object(
      'schoolId', p_school_id,
      'batchId', v_batch.id,
      'mode', p_mode,
      'accepted', v_accepted,
      'skipped', v_skipped,
      'archived', v_archived,
      'sourceSha256', v_batch.source_sha256,
      'sourceBytes', v_batch.source_bytes
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'status', 'completed',
    'setId', v_set_id,
    'created', v_created,
    'accepted', v_accepted,
    'skipped', v_skipped,
    'archived', v_archived
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_commit_content_import(
  uuid, uuid, uuid, text, text, public.content_import_mode, uuid, text, uuid, jsonb, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_commit_content_import(
  uuid, uuid, uuid, text, text, public.content_import_mode, uuid, text, uuid, jsonb, integer
) TO service_role;

-- Read models for the UI and the crossword generator. security_invoker => the caller's RLS applies.
-- The summary view deliberately has no "last import" column: content_import_batches has no policy, so an
-- authenticated caller would always see NULL there.
CREATE VIEW public.v_content_entries_active
WITH (security_invoker = true) AS
SELECT
  e.set_id,
  e.id AS entry_id,
  e.position,
  e.term,
  e.definition,
  e.answer,
  e.answer_length,
  e.script
FROM public.content_entries e
JOIN public.content_sets s ON s.id = e.set_id
WHERE e.archived_at IS NULL AND s.archived_at IS NULL;

CREATE VIEW public.v_content_sets_summary
WITH (security_invoker = true) AS
SELECT
  s.id AS set_id,
  s.school_id,
  s.owner_id,
  s.classroom_id,
  s.title,
  s.archived_at,
  s.updated_at,
  (count(e.id) FILTER (WHERE e.archived_at IS NULL))::integer AS entry_count,
  min(e.answer_length) FILTER (WHERE e.archived_at IS NULL) AS min_answer_length,
  max(e.answer_length) FILTER (WHERE e.archived_at IS NULL) AS max_answer_length
FROM public.content_sets s
LEFT JOIN public.content_entries e ON e.set_id = s.id
GROUP BY s.id;

REVOKE ALL ON public.v_content_entries_active FROM PUBLIC, anon;
REVOKE ALL ON public.v_content_sets_summary FROM PUBLIC, anon;
GRANT SELECT ON public.v_content_entries_active TO authenticated, service_role;
GRANT SELECT ON public.v_content_sets_summary TO authenticated, service_role;
