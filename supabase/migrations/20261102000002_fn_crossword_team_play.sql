-- M2-3.4 P2 migration B: team (collaboration) play. P2 implementation package (PM 2026-11-01), E-1 (b), E-2 (a),
-- E-3 (modified), E-8 (b), E-9 (a), D-4 to D-10.
--
-- Individual mode is unchanged: each modified function keeps its body and adds blocks guarded by the team flag. The one
-- addition shared by both modes is the FOR SHARE read of the assignment at the top of fn_crossword_play_start, so a
-- start and a mode change (fn_set_crossword_assignment_mode, FOR UPDATE) never interleave.
--
-- Team mode:
--   start   joins the team's attempt or creates it (the team row lock makes one attempt per team); NO_TEAM without a team
--   save    a key counts as changed only when its value really changes; revision +1 only then; cell writers follow the
--           changed keys; words completed by the save are recorded as solved with credits (E-8 (b))
--   reveal  ignores an older base revision (D-5); the revealed cell has no writer; solves recorded
--   submit  judges the latest saved state, no STALE (E-2)
--   check   unchanged: still STALE on an older revision (D-5)
--   limits  unchanged: counters live on the shared attempt row, so the budget is shared (D-6)
-- Solves are insert-only (D-7). Credits are historical facts (D-10): written once, never recalculated.
-- Participation and "모두 참여 달성" leave only after the team completed (D-8). Help requests are team-level, one open at
-- a time, 60 s after the previous resolution (D-9). Student-facing results never carry another student's id, name,
-- or per-student count (E-3).
-- New error codes: CROSSWORD_PLAY_NO_TEAM, CROSSWORD_PLAY_HELP_COOLDOWN (HINT = whole seconds left).

-- INTERNAL. True when the attempt belongs to a team-mode assignment.
CREATE FUNCTION public.fn_crossword_play_is_team(p_attempt_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((SELECT x.play_mode = 'team'
                   FROM public.crossword_attempts a JOIN public.crossword_assignments x ON x.id = a.assignment_id
                   WHERE a.id = p_attempt_id), false)
$$;

-- INTERNAL: reads answers. Records every word that touches p_keys, has no solve row yet and is now fully correct
-- (prefilled and revealed cells count as their letter). Credits go to the distinct current writers of the word's cells;
-- prefilled, revealed and detached (NULL) cells give none. Insert-only (D-7, D-10).
CREATE FUNCTION public.fn_crossword_team_record_solves(p_attempt_id uuid, p_keys text[])
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_puzzle uuid;
  w record;
BEGIN
  IF pg_catalog.cardinality(COALESCE(p_keys, '{}')) = 0 THEN RETURN; END IF;
  SELECT a.* INTO r FROM public.crossword_attempts a WHERE a.id = p_attempt_id;
  SELECT x.puzzle_id INTO v_puzzle FROM public.crossword_assignments x WHERE x.id = r.assignment_id;

  FOR w IN
    SELECT wc.num, wc.dir, pg_catalog.array_agg(wc.key) AS keys
    FROM public.fn_crossword_play_wordcells(v_puzzle) wc
    WHERE (wc.num, wc.dir) IN (SELECT z.num, z.dir FROM public.fn_crossword_play_wordcells(v_puzzle) z WHERE z.key = ANY (p_keys))
    GROUP BY wc.num, wc.dir
    HAVING pg_catalog.bool_and(
      CASE WHEN wc.key = ANY (r.prefill_keys) OR wc.key = ANY (r.revealed_keys) THEN wc.ch
           ELSE r.cells ->> wc.key END IS NOT DISTINCT FROM wc.ch)
  LOOP
    INSERT INTO public.crossword_attempt_word_solves (attempt_id, number, direction)
    VALUES (r.id, w.num, w.dir::public.crossword_direction)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.crossword_attempt_word_credits (attempt_id, number, direction, student_id)
      SELECT DISTINCT r.id, w.num, w.dir::public.crossword_direction, cw.student_id
      FROM public.crossword_attempt_cell_writers cw
      WHERE cw.attempt_id = r.id AND cw.cell_key = ANY (w.keys) AND cw.student_id IS NOT NULL
        AND NOT (cw.cell_key = ANY (r.prefill_keys) OR cw.cell_key = ANY (r.revealed_keys));
    END IF;
  END LOOP;
END;
$$;

-- INTERNAL: the team branch of fn_crossword_play_start (the caller holds FOR SHARE on the assignment).
-- Same result shape {attemptId, created, status}. A late joiner of a started team gets a member row (created = false).
CREATE FUNCTION public.fn_crossword_team_play_start(p_student_id uuid, p_assignment_id uuid, p_prefill_keys text[])
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ac record;
  v_team public.crossword_teams;
  v_attempt public.crossword_attempts;
  v_id uuid;
  v_keys text[] := COALESCE(p_prefill_keys, '{}');
BEGIN
  SELECT * INTO v_ac FROM public.fn_crossword_play_access(p_student_id, p_assignment_id);
  IF NOT COALESCE(v_ac.ok, false) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_%', v_ac.reason USING ERRCODE = 'P0001';
  END IF;

  SELECT t.* INTO v_team
  FROM public.crossword_team_members tm JOIN public.crossword_teams t ON t.id = tm.team_id
  WHERE tm.assignment_id = p_assignment_id AND tm.student_id = p_student_id
  FOR UPDATE OF t;

  SELECT a.* INTO v_attempt
  FROM public.crossword_attempt_members m JOIN public.crossword_attempts a ON a.id = m.attempt_id
  WHERE m.assignment_id = p_assignment_id AND m.student_id = p_student_id;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('attemptId', v_attempt.id, 'created', false, 'status', v_attempt.status);
  END IF;

  IF v_team.id IS NULL THEN RAISE EXCEPTION 'CROSSWORD_PLAY_NO_TEAM' USING ERRCODE = 'P0001'; END IF;
  IF v_ac.readonly THEN RAISE EXCEPTION 'CROSSWORD_PLAY_CLOSED' USING ERRCODE = 'P0001'; END IF;

  IF v_team.attempt_id IS NOT NULL THEN
    INSERT INTO public.crossword_attempt_members (attempt_id, assignment_id, student_id)
    VALUES (v_team.attempt_id, p_assignment_id, p_student_id);
    SELECT a.* INTO v_attempt FROM public.crossword_attempts a WHERE a.id = v_team.attempt_id;
    RETURN pg_catalog.jsonb_build_object('attemptId', v_attempt.id, 'created', false, 'status', v_attempt.status);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(v_keys) k
    WHERE k NOT IN (SELECT wc.key FROM public.fn_crossword_play_wordcells(v_ac.puzzle_id) wc)) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.crossword_attempts (assignment_id, prefill_keys)
  VALUES (p_assignment_id, ARRAY(SELECT DISTINCT k FROM pg_catalog.unnest(v_keys) k ORDER BY k))
  RETURNING id INTO v_id;
  UPDATE public.crossword_teams t SET attempt_id = v_id WHERE t.id = v_team.id;
  INSERT INTO public.crossword_attempt_members (attempt_id, assignment_id, student_id)
  VALUES (v_id, p_assignment_id, p_student_id);
  -- A word made only of prefilled cells is solved from the start, with no credit.
  PERFORM public.fn_crossword_team_record_solves(v_id, v_keys);

  RETURN pg_catalog.jsonb_build_object('attemptId', v_id, 'created', true, 'status', 'in_progress');
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Modified play functions (signatures unchanged)
-- ---------------------------------------------------------------------------------------------------------

-- Get or create the attempt (idempotent, race-safe). p_prefill_keys are chosen by the server code from answer
-- lengths only and frozen here at creation; an existing attempt keeps its own.
-- Returns {attemptId, created, status}. A closed assignment still resumes an existing attempt (read-only).
-- Team mode: fn_crossword_team_play_start.
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
  v_play_mode public.crossword_play_mode;
BEGIN
  SELECT x.play_mode INTO v_play_mode FROM public.crossword_assignments x WHERE x.id = p_assignment_id FOR SHARE;
  IF v_play_mode = 'team' THEN
    RETURN public.fn_crossword_team_play_start(p_student_id, p_assignment_id, p_prefill_keys);
  END IF;

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

-- Spends one reveal and returns that one letter. Refuses only a LOCKED cell (prefill or an earlier reveal), which
-- the client already knows; it never says "this cell is already correct" (that would be a free check, PM N3).
-- The attempt row is locked FOR UPDATE, so parallel requests are serialized and cannot overspend.
-- Team mode: an older base revision is accepted (D-5); the revealed cell loses its writer; solves are recorded.
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
  v_team boolean;
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'write');
  v_team := public.fn_crossword_play_is_team(r.id);
  IF NOT v_team AND p_base_revision IS DISTINCT FROM r.revision THEN
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

  IF v_team THEN
    DELETE FROM public.crossword_attempt_cell_writers cw WHERE cw.attempt_id = r.id AND cw.cell_key = p_key;
    PERFORM public.fn_crossword_team_record_solves(r.id, ARRAY[p_key]);
  END IF;

  RETURN pg_catalog.jsonb_build_object('key', p_key, 'char', v_ch,
    'revealsRemaining', v_allowed - r.reveals_used, 'revision', r.revision);
END;
$$;

-- {result:'completed', justCompleted} | {result:'incomplete', empty} | {result:'wrong', wrongCells?}.
-- The completed event records wordsCompleted (a count of fully correct words, never returned to the student).
-- Completed twice is a no-op with justCompleted=false (a celebration never replays). A wrong submit counts and, on
-- hard (and after the third wrong submit on other levels), starts a 30 s cooldown: CROSSWORD_PLAY_SUBMIT_COOLDOWN
-- with the remaining whole seconds in HINT. The wrong-cell count is returned on easy and normal only.
-- Team mode: judged on the latest saved state, p_base_revision is not compared (E-2).
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
  IF NOT public.fn_crossword_play_is_team(r.id) AND p_base_revision IS DISTINCT FROM r.revision THEN
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

-- The result type gains two trailing columns (play_mode, team_waiting = team mode and the student has no team yet, D-4),
-- so the function is dropped and created again. The first 13 columns keep their names, types, order and meaning.
DROP FUNCTION public.fn_crossword_play_list(uuid);
CREATE FUNCTION public.fn_crossword_play_list(p_student_id uuid)
RETURNS TABLE (
  assignment_id uuid, puzzle_id uuid, title text, classroom_id uuid, classroom_name text,
  level public.crossword_level, word_count integer, total_cells integer, closes_at timestamptz,
  attempt_id uuid, attempt_status public.crossword_attempt_status, filled_count integer, readonly boolean,
  play_mode public.crossword_play_mode, team_waiting boolean)
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
         NOT o.is_open,
         x.play_mode,
         (x.play_mode = 'team' AND att.id IS NULL AND NOT EXISTS (
            SELECT 1 FROM public.crossword_team_members tm WHERE tm.assignment_id = x.id AND tm.student_id = s.id))
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

-- ---------------------------------------------------------------------------------------------------------
-- New student functions
-- ---------------------------------------------------------------------------------------------------------

-- Team state for polling (E-9). Always {revision, status, changed, helpOpen, used}; when p_known_revision differs from
-- the revision also {cells, given, otherKeys}; after completion also {participation: {me, all}} (D-8).
-- otherKeys: cells whose current writer is not this student (E-3: never who). participation population (D-10): members
-- who joined at or before completion and are still actively enrolled.
CREATE FUNCTION public.fn_crossword_team_state(p_student_id uuid, p_attempt_id uuid, p_known_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_classroom uuid;
  v_out jsonb;
  v_changed boolean;
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'read');
  IF NOT public.fn_crossword_play_is_team(r.id) THEN RAISE EXCEPTION 'CROSSWORD_PLAY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT x.classroom_id INTO v_classroom FROM public.crossword_assignments x WHERE x.id = r.assignment_id;
  v_changed := p_known_revision IS DISTINCT FROM r.revision;

  v_out := pg_catalog.jsonb_build_object(
    'revision', r.revision,
    'status', r.status,
    'changed', v_changed,
    'helpOpen', EXISTS (SELECT 1 FROM public.crossword_teams t JOIN public.crossword_team_help_requests h ON h.team_id = t.id
                        WHERE t.attempt_id = r.id AND h.resolved_at IS NULL),
    'used', pg_catalog.jsonb_build_object('checks', r.checks_used, 'reveals', r.reveals_used,
                                          'chosung', r.chosung_used, 'wrongSubmits', r.submits_used));

  IF v_changed THEN
    v_out := v_out || pg_catalog.jsonb_build_object(
      'cells', r.cells,
      'given', public.fn_crossword_play_given(p_student_id, r.id),
      'otherKeys', pg_catalog.to_jsonb(ARRAY(
        SELECT cw.cell_key FROM public.crossword_attempt_cell_writers cw
        WHERE cw.attempt_id = r.id AND cw.student_id IS DISTINCT FROM p_student_id ORDER BY cw.cell_key)));
  END IF;

  IF r.status = 'completed' THEN
    v_out := v_out || pg_catalog.jsonb_build_object('participation', (
      WITH pop AS (
        SELECT m.student_id FROM public.crossword_attempt_members m
        JOIN public.classroom_enrollments en ON en.classroom_id = v_classroom AND en.student_id = m.student_id AND en.status = 'active'
        WHERE m.attempt_id = r.id AND m.joined_at <= r.completed_at),
      part AS (
        SELECT pop.student_id, EXISTS (SELECT 1 FROM public.crossword_attempt_word_credits c
                                       WHERE c.attempt_id = r.id AND c.student_id = pop.student_id) AS yes
        FROM pop)
      SELECT pg_catalog.jsonb_build_object(
        'me', EXISTS (SELECT 1 FROM public.crossword_attempt_word_credits c WHERE c.attempt_id = r.id AND c.student_id = p_student_id),
        'all', COALESCE(pg_catalog.bool_and(part.yes), false))
      FROM part));
  END IF;
  RETURN v_out;
END;
$$;

-- Team help request (G2, D-9). One open request per team: an open one is returned (created = false). A new one is
-- refused for 60 s after the previous resolution. Who asked is not stored.
CREATE FUNCTION public.fn_crossword_team_help_request(p_student_id uuid, p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_team public.crossword_teams;
  h public.crossword_team_help_requests;
  v_last timestamptz;
  v_now timestamptz := pg_catalog.now();
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'write');
  SELECT t.* INTO v_team FROM public.crossword_teams t WHERE t.attempt_id = r.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CROSSWORD_PLAY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  SELECT x.* INTO h FROM public.crossword_team_help_requests x
  WHERE x.team_id = v_team.id AND x.resolved_at IS NULL ORDER BY x.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('open', true, 'created', false, 'createdAt', h.created_at);
  END IF;

  SELECT pg_catalog.max(x.resolved_at) INTO v_last FROM public.crossword_team_help_requests x WHERE x.team_id = v_team.id;
  IF v_last IS NOT NULL AND v_now - v_last < interval '60 seconds' THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_HELP_COOLDOWN' USING ERRCODE = 'P0001',
      HINT = pg_catalog.ceil(60 - EXTRACT(epoch FROM (v_now - v_last)))::integer::text;
  END IF;

  INSERT INTO public.crossword_team_help_requests (team_id, created_at) VALUES (v_team.id, v_now) RETURNING * INTO h;
  RETURN pg_catalog.jsonb_build_object('open', true, 'created', true, 'createdAt', h.created_at);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.fn_crossword_play_is_team(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_record_solves(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_play_start(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_list(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_state(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_help_request(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_crossword_play_is_team(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_record_solves(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_play_start(uuid, uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_list(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_state(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_help_request(uuid, uuid) TO service_role;
