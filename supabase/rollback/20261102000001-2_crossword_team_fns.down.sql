-- ROLLBACK of M2-3.4 P2 (migrations 20261102000001 and 20261102000002). NOT a migration: apply only as a new forward
-- migration after PM approval (P2 implementation package section 5). Never delete supabase_migrations.schema_migrations rows.
-- Must run before any P1 rollback. Deletes no data: team rows, writers, solves, credits and help requests stay.
-- Restores fn_crossword_play_start/save/reveal/submit and fn_crossword_play_list verbatim from 20261019000003 and drops the
-- P2 functions. Guard: stops while a team attempt exists (the restored start would let a student without a team open a
-- solo attempt on a team assignment).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.crossword_teams WHERE attempt_id IS NOT NULL) THEN
    RAISE EXCEPTION 'CROSSWORD_TEAM_FNS_ROLLBACK_HAS_TEAM_ATTEMPTS: team attempts exist, stop and ask the PM';
  END IF;
END
$$;

DROP FUNCTION public.fn_crossword_team_state(uuid, uuid, bigint);
DROP FUNCTION public.fn_crossword_team_help_request(uuid, uuid);
DROP FUNCTION public.fn_crossword_team_help_resolve(uuid, uuid, uuid);
DROP FUNCTION public.fn_crossword_team_list(uuid, uuid, uuid);
DROP FUNCTION public.fn_crossword_team_unassign(uuid, uuid, uuid, uuid);
DROP FUNCTION public.fn_crossword_team_assign(uuid, uuid, uuid, uuid);
DROP FUNCTION public.fn_crossword_team_delete(uuid, uuid, uuid);
DROP FUNCTION public.fn_crossword_team_create(uuid, uuid, uuid, text);
DROP FUNCTION public.fn_set_crossword_assignment_mode(uuid, uuid, uuid, text);
DROP FUNCTION public.fn_crossword_team_for_write(uuid, uuid, uuid);
DROP FUNCTION public.fn_crossword_team_actor_ok(uuid, uuid, uuid, boolean);

-- Restored bodies (20261019000003).
DROP FUNCTION public.fn_crossword_play_list(uuid);
CREATE FUNCTION public.fn_crossword_play_list(p_student_id uuid)
RETURNS TABLE (
  assignment_id uuid, puzzle_id uuid, title text, classroom_id uuid, classroom_name text,
  level public.crossword_level, word_count integer, total_cells integer, closes_at timestamptz,
  attempt_id uuid, attempt_status public.crossword_attempt_status, filled_count integer, readonly boolean)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT x.id, p.id, p.title, c.id, c.name, p.level,
         (SELECT pg_catalog.count(*)::integer FROM public.crossword_words w WHERE w.puzzle_id = p.id),
         (SELECT pg_catalog.count(DISTINCT wc.key)::integer FROM public.fn_crossword_play_wordcells(p.id) wc),
         x.closes_at, att.id, att.status,
         CASE WHEN att.id IS NULL THEN 0 ELSE
           (SELECT pg_catalog.count(*)::integer FROM (
              SELECT pg_catalog.jsonb_object_keys(att.cells) AS k
              UNION SELECT pg_catalog.unnest(att.prefill_keys)
              UNION SELECT pg_catalog.unnest(att.revealed_keys)) u) END,
         NOT o.is_open
  FROM public.students s
  JOIN public.classroom_enrollments en ON en.student_id = s.id AND en.status = 'active'
  JOIN public.classrooms c ON c.id = en.classroom_id AND c.archived_at IS NULL AND c.school_id = s.school_id
  JOIN public.crossword_assignments x ON x.classroom_id = c.id
  JOIN public.crossword_puzzles p ON p.id = x.puzzle_id AND p.school_id = s.school_id
  LEFT JOIN public.crossword_attempt_members m ON m.assignment_id = x.id AND m.student_id = s.id
  LEFT JOIN public.crossword_attempts att ON att.id = m.attempt_id
  CROSS JOIN LATERAL (SELECT (x.status = 'open' AND p.status = 'published'
                              AND (x.opens_at IS NULL OR x.opens_at <= pg_catalog.now())
                              AND (x.closes_at IS NULL OR x.closes_at > pg_catalog.now())) AS is_open) o
  WHERE s.id = p_student_id
    AND (o.is_open OR (att.id IS NOT NULL AND p.status IN ('published', 'archived')))
$$;

-- Get or create the attempt (idempotent, race-safe). p_prefill_keys are chosen by the server code from answer
-- lengths only and frozen here at creation; an existing attempt keeps its own.
-- Returns {attemptId, created, status}. A closed assignment still resumes an existing attempt (read-only).
CREATE OR REPLACE FUNCTION public.fn_crossword_play_start(p_student_id uuid, p_assignment_id uuid, p_prefill_keys text[])
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ac record;
  v_attempt public.crossword_attempts;
  v_id uuid;
  v_keys text[] := COALESCE(p_prefill_keys, '{}');
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_assignment_id::text || p_student_id::text, 0));

  SELECT * INTO v_ac FROM public.fn_crossword_play_access(p_student_id, p_assignment_id);
  IF NOT COALESCE(v_ac.ok, false) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_%', v_ac.reason USING ERRCODE = 'P0001';
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.crossword_attempt_members m JOIN public.crossword_attempts a ON a.id = m.attempt_id
  WHERE m.assignment_id = p_assignment_id AND m.student_id = p_student_id;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('attemptId', v_attempt.id, 'created', false, 'status', v_attempt.status);
  END IF;

  IF v_ac.readonly THEN RAISE EXCEPTION 'CROSSWORD_PLAY_CLOSED' USING ERRCODE = 'P0001'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(v_keys) k
    WHERE k NOT IN (SELECT wc.key FROM public.fn_crossword_play_wordcells(v_ac.puzzle_id) wc)) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.crossword_attempts (assignment_id, prefill_keys)
  VALUES (p_assignment_id, ARRAY(SELECT DISTINCT k FROM pg_catalog.unnest(v_keys) k ORDER BY k))
  RETURNING id INTO v_id;
  INSERT INTO public.crossword_attempt_members (attempt_id, assignment_id, student_id)
  VALUES (v_id, p_assignment_id, p_student_id);

  RETURN pg_catalog.jsonb_build_object('attemptId', v_id, 'created', true, 'status', 'in_progress');
END;
$$;

-- p_patch: {"r,c": "사" | null}. All or nothing. A key must be a cell of the puzzle, a value one character
-- [가-힣A-Z0-9] (NFD jamo and lowercase are refused), locked cells (prefill, reveal) are refused, at most 225 keys.
-- The merge never overwrites the whole map, so a second device cannot erase cells. p_active_ms is clamped to
-- 30 s and to the wall-clock time since the previous save. Returns {revision, filled}: "filled" is how many cells
-- hold a value, never how many are correct.
CREATE OR REPLACE FUNCTION public.fn_crossword_play_save(p_student_id uuid, p_attempt_id uuid, p_patch jsonb, p_active_ms integer)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_puzzle uuid;
  v_now timestamptz := pg_catalog.now();
  v_remove text[];
  v_add jsonb;
  v_ms bigint;
  v_changed boolean;
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'save');
  IF p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_patch)) > 225 THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_PATCH_TOO_LARGE' USING ERRCODE = 'P0001';
  END IF;

  SELECT x.puzzle_id INTO v_puzzle FROM public.crossword_assignments x WHERE x.id = r.assignment_id;

  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_patch) e
             WHERE e.key NOT IN (SELECT wc.key FROM public.fn_crossword_play_wordcells(v_puzzle) wc)) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_patch) e
             WHERE e.value <> 'null'::jsonb
               AND NOT (pg_catalog.jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') ~ '^[가-힣A-Z0-9]$')) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CHAR' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_patch) e
             WHERE e.key = ANY (r.prefill_keys) OR e.key = ANY (r.revealed_keys)) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_LOCKED_CELL' USING ERRCODE = 'P0001';
  END IF;

  v_remove := ARRAY(SELECT e.key FROM pg_catalog.jsonb_each(p_patch) e WHERE e.value = 'null'::jsonb);
  SELECT COALESCE(pg_catalog.jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_add
  FROM pg_catalog.jsonb_each(p_patch) e WHERE e.value <> 'null'::jsonb;
  v_changed := p_patch <> '{}'::jsonb;

  v_ms := GREATEST(0, LEAST(
    COALESCE(p_active_ms, 0)::bigint,
    30000::bigint,
    pg_catalog.floor(EXTRACT(epoch FROM (v_now - COALESCE(r.last_saved_at, r.started_at))) * 1000)::bigint));

  UPDATE public.crossword_attempts a
  SET cells = (a.cells - v_remove) || v_add,
      revision = a.revision + CASE WHEN v_changed THEN 1 ELSE 0 END,
      active_ms = a.active_ms + v_ms,
      last_saved_at = v_now
  WHERE a.id = r.id
  RETURNING * INTO r;

  RETURN pg_catalog.jsonb_build_object(
    'revision', r.revision,
    'filled', (SELECT pg_catalog.count(*) FROM (
                 SELECT pg_catalog.jsonb_object_keys(r.cells) AS k
                 UNION SELECT pg_catalog.unnest(r.prefill_keys)
                 UNION SELECT pg_catalog.unnest(r.revealed_keys)) u));
END;
$$;

-- Spends one reveal and returns that one letter. Refuses only a LOCKED cell (prefill or an earlier reveal), which
-- the client already knows; it never says "this cell is already correct" (that would be a free check, PM N3).
-- The attempt row is locked FOR UPDATE, so parallel requests are serialized and cannot overspend.
CREATE OR REPLACE FUNCTION public.fn_crossword_play_reveal(p_student_id uuid, p_attempt_id uuid, p_key text, p_base_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_puzzle uuid;
  v_allowed integer;
  v_ch text;
  v_words jsonb;
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'write');
  IF p_base_revision IS DISTINCT FROM r.revision THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_STALE' USING ERRCODE = 'P0001';
  END IF;

  v_allowed := (public.fn_crossword_attempt_limits(r.id) ->> 'revealsAllowed')::integer;
  IF v_allowed <= 0 THEN RAISE EXCEPTION 'CROSSWORD_PLAY_REVEAL_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;

  SELECT x.puzzle_id INTO v_puzzle FROM public.crossword_assignments x WHERE x.id = r.assignment_id;
  SELECT cm.ch INTO v_ch FROM (SELECT DISTINCT wc.key, wc.ch FROM public.fn_crossword_play_wordcells(v_puzzle) wc) cm
  WHERE cm.key = p_key;
  IF v_ch IS NULL THEN RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001'; END IF;
  IF p_key = ANY (r.prefill_keys) OR p_key = ANY (r.revealed_keys) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_LOCKED_CELL' USING ERRCODE = 'P0001';
  END IF;
  IF r.reveals_used >= v_allowed THEN RAISE EXCEPTION 'CROSSWORD_PLAY_REVEAL_LIMIT' USING ERRCODE = 'P0001'; END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('number', q.num, 'direction', q.dir) ORDER BY q.num, q.dir), '[]'::jsonb)
    INTO v_words
  FROM (SELECT DISTINCT wc.num, wc.dir FROM public.fn_crossword_play_wordcells(v_puzzle) wc WHERE wc.key = p_key) q;

  UPDATE public.crossword_attempts a
  SET reveals_used = a.reveals_used + 1,
      revealed_keys = a.revealed_keys || p_key,
      cells = a.cells || pg_catalog.jsonb_build_object(p_key, v_ch),
      revision = a.revision + 1
  WHERE a.id = r.id
  RETURNING * INTO r;

  INSERT INTO public.crossword_attempt_events (attempt_id, actor_student_id, kind, source, detail)
  VALUES (r.id, p_student_id, 'reveal', 'reveal', pg_catalog.jsonb_build_object('scope', 'cell', 'words', v_words));

  RETURN pg_catalog.jsonb_build_object('key', p_key, 'char', v_ch,
    'revealsRemaining', v_allowed - r.reveals_used, 'revision', r.revision);
END;
$$;

-- {result:'completed', justCompleted} | {result:'incomplete', empty} | {result:'wrong', wrongCells?}.
-- The completed event records wordsCompleted (a count of fully correct words, never returned to the student).
-- Completed twice is a no-op with justCompleted=false (a celebration never replays). A wrong submit counts and, on
-- hard (and after the third wrong submit on other levels), starts a 30 s cooldown: CROSSWORD_PLAY_SUBMIT_COOLDOWN
-- with the remaining whole seconds in HINT. The wrong-cell count is returned on easy and normal only.
CREATE OR REPLACE FUNCTION public.fn_crossword_play_submit(p_student_id uuid, p_attempt_id uuid, p_base_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_puzzle uuid;
  v_level public.crossword_level;
  v_now timestamptz := pg_catalog.now();
  v_empty integer;
  v_wrong integer;
  v_words_done integer;
  v_remaining integer;
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'read');
  IF r.status = 'completed' THEN
    RETURN pg_catalog.jsonb_build_object('result', 'completed', 'justCompleted', false);
  END IF;
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'write');
  IF p_base_revision IS DISTINCT FROM r.revision THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_STALE' USING ERRCODE = 'P0001';
  END IF;

  SELECT x.puzzle_id, p.level INTO v_puzzle, v_level
  FROM public.crossword_assignments x JOIN public.crossword_puzzles p ON p.id = x.puzzle_id WHERE x.id = r.assignment_id;

  SELECT pg_catalog.count(*) FILTER (WHERE eff IS NULL),
         pg_catalog.count(*) FILTER (WHERE eff IS NOT NULL AND eff <> cm.ch)
    INTO v_empty, v_wrong
  FROM (SELECT DISTINCT wc.key, wc.ch FROM public.fn_crossword_play_wordcells(v_puzzle) wc) cm
  CROSS JOIN LATERAL (SELECT CASE WHEN cm.key = ANY (r.prefill_keys) OR cm.key = ANY (r.revealed_keys)
                                  THEN cm.ch ELSE r.cells ->> cm.key END AS eff) e(eff);

  IF v_empty > 0 THEN
    RETURN pg_catalog.jsonb_build_object('result', 'incomplete', 'empty', v_empty);
  END IF;

  IF v_wrong = 0 THEN
    UPDATE public.crossword_attempts a
    SET status = 'completed', completed_at = v_now, revision = a.revision + 1
    WHERE a.id = r.id;
    -- words_completed (PM 2026-10-18): computed once, here, from the saved cells; kept in the event, never returned.
    SELECT pg_catalog.count(*)::integer INTO v_words_done FROM (
      SELECT wc.num, wc.dir
      FROM public.fn_crossword_play_wordcells(v_puzzle) wc
      GROUP BY wc.num, wc.dir
      HAVING pg_catalog.bool_and(
        CASE WHEN wc.key = ANY (r.prefill_keys) OR wc.key = ANY (r.revealed_keys) THEN wc.ch
             ELSE r.cells ->> wc.key END = wc.ch)) w;
    INSERT INTO public.crossword_attempt_events (attempt_id, actor_student_id, kind, source, detail)
    VALUES (r.id, p_student_id, 'completed', 'submit', pg_catalog.jsonb_build_object('wordsCompleted', v_words_done));
    RETURN pg_catalog.jsonb_build_object('result', 'completed', 'justCompleted', true);
  END IF;

  IF r.last_wrong_submit_at IS NOT NULL AND (v_level = 'hard' OR r.submits_used >= 3)
     AND v_now - r.last_wrong_submit_at < interval '30 seconds' THEN
    v_remaining := pg_catalog.ceil(30 - EXTRACT(epoch FROM (v_now - r.last_wrong_submit_at)))::integer;
    RAISE EXCEPTION 'CROSSWORD_PLAY_SUBMIT_COOLDOWN' USING ERRCODE = 'P0001', HINT = v_remaining::text;
  END IF;

  UPDATE public.crossword_attempts a
  SET submits_used = a.submits_used + 1, last_wrong_submit_at = v_now
  WHERE a.id = r.id;
  INSERT INTO public.crossword_attempt_events (attempt_id, actor_student_id, kind, source, detail)
  VALUES (r.id, p_student_id, 'submit_wrong', 'submit', '{}'::jsonb);

  IF v_level = 'hard' THEN
    RETURN pg_catalog.jsonb_build_object('result', 'wrong');
  END IF;
  RETURN pg_catalog.jsonb_build_object('result', 'wrong', 'wrongCells', v_wrong);
END;
$$;

DROP FUNCTION public.fn_crossword_team_play_start(uuid, uuid, text[]);
DROP FUNCTION public.fn_crossword_team_record_solves(uuid, text[]);
DROP FUNCTION public.fn_crossword_play_is_team(uuid);

REVOKE ALL ON FUNCTION public.fn_crossword_play_list(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_list(uuid) TO service_role;
