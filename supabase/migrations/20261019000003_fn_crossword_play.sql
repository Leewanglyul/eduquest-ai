-- M2-2.4a F1: server functions for student crossword play (docs/m2/07 B.4, 08 B and C).
-- All service_role only (REVOKE from PUBLIC, anon, authenticated; Postgres grants EXECUTE to PUBLIC by default).
-- SECURITY INVOKER, search_path pinned, errors are P0001 with a stable CROSSWORD_PLAY_* code the TypeScript
-- service maps to Korean text. Nothing here returns an answer letter except: a reveal (one counted letter) and
-- fn_crossword_play_given (prefilled and revealed cells, the letters the student is legitimately given).
-- The caller (server code) passes the student id taken from the session; every function that takes an attempt
-- verifies membership of that student and re-checks the assignment access rule, so a guessed id gives
-- CROSSWORD_PLAY_NOT_FOUND.
--
-- Event sources (PM 2026-10-18): hint = check and chosung, reveal, submit. 'manual_entry' and 'autosave' exist in
-- the enum for later analytics; no function here writes them (no per-save record, data minimisation).

-- ---------------------------------------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------------------------------------

-- 초성 of an all-Hangul word; the first letter of an all-A-Z word; NULL for digits, mixed or empty answers.
CREATE FUNCTION public.fn_crossword_chosung(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cho constant text := 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  v_out text := '';
  v_code integer;
  i integer;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN RETURN NULL; END IF;
  IF p_text ~ '^[가-힣]+$' THEN
    FOR i IN 1..pg_catalog.char_length(p_text) LOOP
      v_code := pg_catalog.ascii(pg_catalog.substr(p_text, i, 1)) - 44032;
      v_out := v_out || pg_catalog.substr(v_cho, v_code / 588 + 1, 1);
    END LOOP;
    RETURN v_out;
  ELSIF p_text ~ '^[A-Z]+$' THEN
    RETURN pg_catalog.substr(p_text, 1, 1);
  END IF;
  RETURN NULL;
END;
$$;

-- One row per (word, cell) of a puzzle: number, direction, "row,col" key and the answer letter of that cell.
-- INTERNAL: it reads answers. Never expose it to a client.
CREATE FUNCTION public.fn_crossword_play_wordcells(p_puzzle_id uuid)
RETURNS TABLE (num integer, dir text, key text, ch text, single boolean)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH j AS (SELECT public.fn_crossword_words_json(p_puzzle_id) AS w)
  SELECT e.num, e.dir, c.r::text || ',' || c.c::text, c.ch, e.single
  FROM j
  CROSS JOIN LATERAL public.fn_crossword_cells(j.w) c
  JOIN LATERAL public.fn_crossword_expand(j.w) e ON e.idx = c.idx
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Access rule (A.1): the single implementation used by the list, start and every attempt function
-- ---------------------------------------------------------------------------------------------------------

-- ok = the student may see this assignment at all. reason: OPEN | CLOSED | NOT_OPEN_YET | NOT_FOUND.
-- readonly = may look but not change. save_allowed = a cell save is still accepted (grace after closes_at).
-- Not enrolled, removed, other school, archived classroom, unknown id and draft puzzle are all NOT_FOUND.
CREATE FUNCTION public.fn_crossword_play_access(p_student_id uuid, p_assignment_id uuid)
RETURNS TABLE (ok boolean, reason text, puzzle_id uuid, readonly boolean, save_allowed boolean)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  a record;
  v_now timestamptz := pg_catalog.now();
  v_has_attempt boolean;
BEGIN
  SELECT x.id AS aid, x.puzzle_id AS pid, x.status AS astatus, x.opens_at, x.closes_at, p.status AS pstatus
    INTO a
  FROM public.crossword_assignments x
  JOIN public.crossword_puzzles p ON p.id = x.puzzle_id
  JOIN public.classrooms c ON c.id = x.classroom_id AND c.archived_at IS NULL AND c.school_id = p.school_id
  JOIN public.students s ON s.id = p_student_id AND s.school_id = c.school_id
  JOIN public.classroom_enrollments en ON en.classroom_id = x.classroom_id AND en.student_id = s.id AND en.status = 'active'
  WHERE x.id = p_assignment_id;

  IF NOT FOUND OR a.pstatus = 'draft' THEN
    RETURN QUERY SELECT false, 'NOT_FOUND'::text, NULL::uuid, true, false;
    RETURN;
  END IF;

  IF a.astatus = 'open' AND a.pstatus = 'published'
     AND (a.opens_at IS NULL OR a.opens_at <= v_now) AND (a.closes_at IS NULL OR a.closes_at > v_now) THEN
    RETURN QUERY SELECT true, 'OPEN'::text, a.pid, false, true;
    RETURN;
  END IF;

  IF a.astatus = 'open' AND a.pstatus = 'published' AND a.opens_at IS NOT NULL AND a.opens_at > v_now THEN
    RETURN QUERY SELECT false, 'NOT_OPEN_YET'::text, NULL::uuid, true, false;
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.crossword_attempt_members m
                 WHERE m.assignment_id = a.aid AND m.student_id = p_student_id) INTO v_has_attempt;

  IF NOT v_has_attempt THEN
    IF a.pstatus = 'archived' THEN
      RETURN QUERY SELECT false, 'NOT_FOUND'::text, NULL::uuid, true, false;
    ELSE
      RETURN QUERY SELECT false, 'CLOSED'::text, NULL::uuid, true, false;
    END IF;
    RETURN;
  END IF;

  -- Closed with an attempt: read-only. Saves still land for a short grace after closes_at when the assignment was
  -- not closed by hand (an in-flight autosave is not lost); checks, reveals and submit are not accepted.
  RETURN QUERY SELECT true, 'CLOSED'::text, a.pid, true,
    (a.astatus = 'open' AND a.pstatus = 'published' AND a.closes_at IS NOT NULL
     AND a.closes_at + interval '120 seconds' > v_now);
END;
$$;

-- Limits of the puzzle behind an attempt, under neutral names (a later team pool changes only this function).
CREATE FUNCTION public.fn_crossword_attempt_limits(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'level', p.level,
    'checkMode', COALESCE(p.settings -> 'play' ->> 'checkMode', 'submitOnly'),
    -- Checks allowed per attempt (PM SP-2): a number, or null = unlimited. A puzzle saved before this setting existed
    -- has no key: submitOnly then means none, anything else unlimited (its scope rule still applies).
    'checksAllowed', CASE
      WHEN p.settings -> 'play' ? 'checksAllowed' THEN p.settings -> 'play' -> 'checksAllowed'
      WHEN COALESCE(p.settings -> 'play' ->> 'checkMode', 'submitOnly') = 'submitOnly' THEN pg_catalog.to_jsonb(0)
      ELSE 'null'::jsonb END,
    'revealsAllowed', COALESCE((p.settings -> 'play' ->> 'revealsPerStudent')::integer, 0),
    'chosungAllowed', COALESCE((p.settings -> 'play' ->> 'chosungAllowed')::boolean, false))
  FROM public.crossword_attempts a
  JOIN public.crossword_assignments x ON x.id = a.assignment_id
  JOIN public.crossword_puzzles p ON p.id = x.puzzle_id
  WHERE a.id = p_attempt_id
$$;

-- Locks the attempt, verifies the student is a member and still has access, and checks the mode:
--   'read'  : any state            'save'  : in progress and a save is still accepted (grace included)
--   'write' : in progress and the assignment is open (check, reveal, chosung, submit)
-- Errors: CROSSWORD_PLAY_NOT_FOUND (not a member or no access), CROSSWORD_PLAY_READONLY.
CREATE FUNCTION public.fn_crossword_play_enter(p_student_id uuid, p_attempt_id uuid, p_mode text)
RETURNS public.crossword_attempts
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_ok boolean;
  v_readonly boolean;
  v_save boolean;
BEGIN
  SELECT a.* INTO r
  FROM public.crossword_attempts a
  JOIN public.crossword_attempt_members m ON m.attempt_id = a.id AND m.student_id = p_student_id
  WHERE a.id = p_attempt_id
  FOR UPDATE OF a;
  IF NOT FOUND THEN RAISE EXCEPTION 'CROSSWORD_PLAY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  SELECT ac.ok, ac.readonly, ac.save_allowed INTO v_ok, v_readonly, v_save
  FROM public.fn_crossword_play_access(p_student_id, r.assignment_id) ac;
  IF NOT COALESCE(v_ok, false) THEN RAISE EXCEPTION 'CROSSWORD_PLAY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  IF p_mode = 'save' AND (r.status <> 'in_progress' OR NOT v_save) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_READONLY' USING ERRCODE = 'P0001';
  ELSIF p_mode = 'write' AND (r.status <> 'in_progress' OR v_readonly) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_READONLY' USING ERRCODE = 'P0001';
  END IF;
  RETURN r;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- List and start
-- ---------------------------------------------------------------------------------------------------------

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
CREATE FUNCTION public.fn_crossword_play_start(p_student_id uuid, p_assignment_id uuid, p_prefill_keys text[])
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

-- ---------------------------------------------------------------------------------------------------------
-- Save (merge patch)
-- ---------------------------------------------------------------------------------------------------------

-- p_patch: {"r,c": "사" | null}. All or nothing. A key must be a cell of the puzzle, a value one character
-- [가-힣A-Z0-9] (NFD jamo and lowercase are refused), locked cells (prefill, reveal) are refused, at most 225 keys.
-- The merge never overwrites the whole map, so a second device cannot erase cells. p_active_ms is clamped to
-- 30 s and to the wall-clock time since the previous save. Returns {revision, filled}: "filled" is how many cells
-- hold a value, never how many are correct.
CREATE FUNCTION public.fn_crossword_play_save(p_student_id uuid, p_attempt_id uuid, p_patch jsonb, p_active_ms integer)
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

-- ---------------------------------------------------------------------------------------------------------
-- Check (statuses only, never a letter)
-- ---------------------------------------------------------------------------------------------------------

-- p_scope 'cell' (one key), 'word' (the keys of exactly one word) or 'puzzle' (p_keys ignored). The preset decides
-- which scopes are allowed and the number of checks (checksAllowed, null = unlimited; CHECK_LIMIT when used up).
-- Works on SAVED state at p_base_revision; a moved revision gives CROSSWORD_PLAY_STALE so
-- a check never runs against stale cells. Counts once in checks_used and once in a 60 per minute window.
-- Returns {results: [{key, status: ok|wrong|empty}], checksUsed, checksRemaining (null = unlimited)}.
CREATE FUNCTION public.fn_crossword_play_check(
  p_student_id uuid, p_attempt_id uuid, p_scope text, p_keys text[], p_base_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_puzzle uuid;
  v_limits jsonb;
  v_mode text;
  v_checks_allowed jsonb;
  v_now timestamptz := pg_catalog.now();
  v_keys text[];
  v_words jsonb := '[]'::jsonb;
  v_results jsonb;
  v_count smallint;
  v_start timestamptz;
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'write');
  IF p_base_revision IS DISTINCT FROM r.revision THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_STALE' USING ERRCODE = 'P0001';
  END IF;

  v_limits := public.fn_crossword_attempt_limits(r.id);
  v_mode := v_limits ->> 'checkMode';
  v_checks_allowed := v_limits -> 'checksAllowed';
  IF v_mode = 'submitOnly' OR v_checks_allowed = pg_catalog.to_jsonb(0)
     OR (v_mode = 'onRequest' AND p_scope IS DISTINCT FROM 'word')
     OR p_scope IS NULL OR p_scope NOT IN ('cell', 'word', 'puzzle') THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_CHECK_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  IF pg_catalog.jsonb_typeof(v_checks_allowed) = 'number' AND r.checks_used >= (v_checks_allowed #>> '{}')::integer THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_CHECK_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  SELECT x.puzzle_id INTO v_puzzle FROM public.crossword_assignments x WHERE x.id = r.assignment_id;

  IF p_scope = 'puzzle' THEN
    v_keys := ARRAY(SELECT DISTINCT wc.key FROM public.fn_crossword_play_wordcells(v_puzzle) wc);
  ELSE
    v_keys := ARRAY(SELECT DISTINCT k FROM pg_catalog.unnest(COALESCE(p_keys, '{}')) k);
    IF pg_catalog.cardinality(v_keys) = 0
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_keys) k
                  WHERE k NOT IN (SELECT wc.key FROM public.fn_crossword_play_wordcells(v_puzzle) wc)) THEN
      RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001';
    END IF;
    IF p_scope = 'cell' THEN
      IF pg_catalog.cardinality(v_keys) <> 1 THEN RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001'; END IF;
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('number', q.num, 'direction', q.dir) ORDER BY q.num, q.dir), '[]'::jsonb)
        INTO v_words
      FROM (SELECT DISTINCT wc.num, wc.dir FROM public.fn_crossword_play_wordcells(v_puzzle) wc WHERE wc.key = v_keys[1]) q;
    ELSE
      -- the keys must be exactly the cells of one word
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('number', q.num, 'direction', q.dir) ORDER BY q.num, q.dir), '[]'::jsonb)
        INTO v_words
      FROM (SELECT wc.num, wc.dir
            FROM public.fn_crossword_play_wordcells(v_puzzle) wc
            GROUP BY wc.num, wc.dir
            HAVING ARRAY(SELECT DISTINCT z FROM pg_catalog.unnest(pg_catalog.array_agg(wc.key)) z ORDER BY z)
                   = ARRAY(SELECT DISTINCT z FROM pg_catalog.unnest(v_keys) z ORDER BY z)) q;
      IF pg_catalog.jsonb_array_length(v_words) = 0 THEN
        RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF r.check_window_start IS NULL OR v_now - r.check_window_start >= interval '60 seconds' THEN
    v_start := v_now; v_count := 1;
  ELSE
    v_start := r.check_window_start; v_count := r.check_window_count + 1;
    IF v_count > 60 THEN RAISE EXCEPTION 'CROSSWORD_PLAY_CHECK_RATE' USING ERRCODE = 'P0001'; END IF;
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', q.key, 'status', q.status) ORDER BY q.key), '[]'::jsonb)
    INTO v_results
  FROM (
    SELECT cm.key,
           CASE
             WHEN cm.key = ANY (r.prefill_keys) OR cm.key = ANY (r.revealed_keys) THEN 'ok'
             WHEN r.cells ->> cm.key IS NULL THEN 'empty'
             WHEN r.cells ->> cm.key = cm.ch THEN 'ok'
             ELSE 'wrong' END AS status
    FROM (SELECT DISTINCT wc.key, wc.ch FROM public.fn_crossword_play_wordcells(v_puzzle) wc) cm
    WHERE cm.key = ANY (v_keys)) q;

  UPDATE public.crossword_attempts a
  SET checks_used = a.checks_used + 1, check_window_start = v_start, check_window_count = v_count
  WHERE a.id = r.id
  RETURNING * INTO r;

  INSERT INTO public.crossword_attempt_events (attempt_id, actor_student_id, kind, source, detail)
  VALUES (r.id, p_student_id, 'check', 'hint',
          CASE WHEN p_scope = 'puzzle' THEN pg_catalog.jsonb_build_object('scope', 'puzzle')
               ELSE pg_catalog.jsonb_build_object('scope', p_scope, 'words', v_words) END);

  RETURN pg_catalog.jsonb_build_object('results', v_results, 'checksUsed', r.checks_used,
    'checksRemaining', CASE WHEN pg_catalog.jsonb_typeof(v_checks_allowed) = 'number'
                            THEN pg_catalog.to_jsonb((v_checks_allowed #>> '{}')::integer - r.checks_used) ELSE 'null'::jsonb END);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Reveal one letter
-- ---------------------------------------------------------------------------------------------------------

-- Spends one reveal and returns that one letter. Refuses only a LOCKED cell (prefill or an earlier reveal), which
-- the client already knows; it never says "this cell is already correct" (that would be a free check, PM N3).
-- The attempt row is locked FOR UPDATE, so parallel requests are serialized and cannot overspend.
CREATE FUNCTION public.fn_crossword_play_reveal(p_student_id uuid, p_attempt_id uuid, p_key text, p_base_revision bigint)
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

-- ---------------------------------------------------------------------------------------------------------
-- 초성
-- ---------------------------------------------------------------------------------------------------------

CREATE FUNCTION public.fn_crossword_play_chosung(p_student_id uuid, p_attempt_id uuid, p_number integer, p_direction text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_answer text;
  v_cho text;
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'write');
  IF NOT COALESCE((public.fn_crossword_attempt_limits(r.id) ->> 'chosungAllowed')::boolean, false) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_CHOSUNG_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  IF p_direction IS NULL OR p_direction NOT IN ('across', 'down') THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001';
  END IF;

  SELECT w.answer INTO v_answer
  FROM public.crossword_assignments x
  JOIN public.crossword_words w ON w.puzzle_id = x.puzzle_id AND w.number = p_number AND w.direction = p_direction::public.crossword_direction
  WHERE x.id = r.assignment_id;
  IF v_answer IS NULL THEN RAISE EXCEPTION 'CROSSWORD_PLAY_BAD_CELL' USING ERRCODE = 'P0001'; END IF;

  v_cho := public.fn_crossword_chosung(v_answer);
  IF v_cho IS NULL THEN RAISE EXCEPTION 'CROSSWORD_PLAY_CHOSUNG_UNAVAILABLE' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.crossword_attempts a SET chosung_used = a.chosung_used + 1 WHERE a.id = r.id;
  INSERT INTO public.crossword_attempt_events (attempt_id, actor_student_id, kind, source, detail)
  VALUES (r.id, p_student_id, 'chosung', 'hint',
          pg_catalog.jsonb_build_object('scope', 'word',
            'words', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('number', p_number, 'direction', p_direction))));

  RETURN pg_catalog.jsonb_build_object('chosung', v_cho);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Submit (the only way to complete)
-- ---------------------------------------------------------------------------------------------------------

-- {result:'completed', justCompleted} | {result:'incomplete', empty} | {result:'wrong', wrongCells?}.
-- Completed twice is a no-op with justCompleted=false (a celebration never replays). A wrong submit counts and, on
-- hard (and after the third wrong submit on other levels), starts a 30 s cooldown: CROSSWORD_PLAY_SUBMIT_COOLDOWN
-- with the remaining whole seconds in HINT. The wrong-cell count is returned on easy and normal only.
CREATE FUNCTION public.fn_crossword_play_submit(p_student_id uuid, p_attempt_id uuid, p_base_revision bigint)
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
    INSERT INTO public.crossword_attempt_events (attempt_id, actor_student_id, kind, source, detail)
    VALUES (r.id, p_student_id, 'completed', 'submit', '{}'::jsonb);
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

-- ---------------------------------------------------------------------------------------------------------
-- The letters the student is given (prefill and reveals): the only bulk letter exit
-- ---------------------------------------------------------------------------------------------------------

CREATE FUNCTION public.fn_crossword_play_given(p_student_id uuid, p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_attempts;
  v_puzzle uuid;
BEGIN
  r := public.fn_crossword_play_enter(p_student_id, p_attempt_id, 'read');
  SELECT x.puzzle_id INTO v_puzzle FROM public.crossword_assignments x WHERE x.id = r.assignment_id;
  RETURN COALESCE((
    SELECT pg_catalog.jsonb_object_agg(cm.key, cm.ch)
    FROM (SELECT DISTINCT wc.key, wc.ch FROM public.fn_crossword_play_wordcells(v_puzzle) wc) cm
    WHERE cm.key = ANY (r.prefill_keys) OR cm.key = ANY (r.revealed_keys)), '{}'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.fn_crossword_chosung(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_wordcells(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_attempt_limits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_enter(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_list(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_start(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_save(uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_check(uuid, uuid, text, text[], bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_reveal(uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_chosung(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_submit(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_play_given(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_crossword_chosung(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_wordcells(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_access(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_attempt_limits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_enter(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_list(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_start(uuid, uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_save(uuid, uuid, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_check(uuid, uuid, text, text[], bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_reveal(uuid, uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_chosung(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_submit(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_play_given(uuid, uuid) TO service_role;
