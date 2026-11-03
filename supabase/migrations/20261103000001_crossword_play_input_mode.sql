-- Gate 3 PLAY-E5-1 (2026-11-03): the puzzle-level input mode. Function-only migration: no table, column, constraint or
-- row is added or changed.
--
--   fn_crossword_play_input_mode(puzzle)  'hangul' when every cell of the puzzle's words is one complete Hangul syllable,
--                                         otherwise 'mixed'. Returns the mode only: never a letter, never a cell.
--   fn_crossword_play_save                same body as 20261102000002; only the character rule changes: a 'hangul'
--                                         puzzle takes ^[가-힣]$, a 'mixed' one keeps ^[가-힣A-Z0-9]$. A refused
--                                         character raises CROSSWORD_PLAY_BAD_CHAR before anything is written (no
--                                         cell, no revision, no saved time, no cell writer).
--
-- Both run as the caller (service role only, like every play function); the save keeps its existing grants.

CREATE FUNCTION public.fn_crossword_play_input_mode(p_puzzle_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN COALESCE(pg_catalog.bool_and(wc.ch ~ '^[가-힣]$'), false) THEN 'hangul' ELSE 'mixed' END
  FROM public.fn_crossword_play_wordcells(p_puzzle_id) wc
$$;

-- p_patch: {"r,c": "사" | null}. All or nothing. A key must be a cell of the puzzle, a value one character
-- of the puzzle's input mode: [가-힣] for a 'hangul' puzzle, [가-힣A-Z0-9] for a 'mixed' one (NFD jamo and lowercase are
-- always refused), locked cells (prefill, reveal) are refused, at most 225 keys.
-- The merge never overwrites the whole map, so a second device cannot erase cells. p_active_ms is clamped to
-- 30 s and to the wall-clock time since the previous save. Returns {revision, filled}: "filled" is how many cells
-- hold a value, never how many are correct.
-- Team mode: only keys whose value really changes count (revision, cell writers, solves); the saver's last_active_at.
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
  v_team boolean;
  v_changed_keys text[];
  v_char text;
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'save');
  IF p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_patch)) > 225 THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_PATCH_TOO_LARGE' USING ERRCODE = 'P0001';
  END IF;

  SELECT x.puzzle_id INTO v_puzzle FROM public.crossword_assignments x WHERE x.id = r.assignment_id;
  v_char := CASE WHEN public.fn_crossword_play_input_mode(v_puzzle) = 'hangul' THEN '^[가-힣]$' ELSE '^[가-힣A-Z0-9]$' END;

  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_patch) e
             WHERE e.key NOT IN (SELECT wc.key FROM public.fn_crossword_play_wordcells(v_puzzle) wc)) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_patch) e
             WHERE e.value <> 'null'::jsonb
               AND NOT (pg_catalog.jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') ~ v_char)) THEN
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

  v_team := public.fn_crossword_play_is_team(r.id);
  IF v_team THEN
    v_changed_keys := ARRAY(
      SELECT e.key FROM pg_catalog.jsonb_each(p_patch) e
      WHERE (r.cells -> e.key) IS DISTINCT FROM (CASE WHEN e.value = 'null'::jsonb THEN NULL ELSE e.value END)
      ORDER BY e.key);
    v_changed := pg_catalog.cardinality(v_changed_keys) > 0;
  END IF;

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

  IF v_team THEN
    DELETE FROM public.crossword_attempt_cell_writers cw
    WHERE cw.attempt_id = r.id AND cw.cell_key = ANY (v_changed_keys) AND p_patch -> cw.cell_key = 'null'::jsonb;
    INSERT INTO public.crossword_attempt_cell_writers (attempt_id, cell_key, student_id, written_at)
    SELECT r.id, k, p_student_id, v_now FROM pg_catalog.unnest(v_changed_keys) k WHERE p_patch -> k <> 'null'::jsonb
    ON CONFLICT (attempt_id, cell_key) DO UPDATE SET student_id = EXCLUDED.student_id, written_at = EXCLUDED.written_at;
    PERFORM public.fn_crossword_team_record_solves(r.id, v_changed_keys);
    UPDATE public.crossword_attempt_members m SET last_active_at = v_now
    WHERE m.attempt_id = r.id AND m.student_id = p_student_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'revision', r.revision,
    'filled', (SELECT pg_catalog.count(*) FROM (
                 SELECT pg_catalog.jsonb_object_keys(r.cells) AS k
                 UNION SELECT pg_catalog.unnest(r.prefill_keys)
                 UNION SELECT pg_catalog.unnest(r.revealed_keys)) u));
END;
$$;


REVOKE ALL ON FUNCTION public.fn_crossword_play_input_mode(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_input_mode(uuid) TO service_role;
