-- M2-2.2a: assignments (a published puzzle in a classroom), the crossword functions and the teacher read view
-- (docs/m2/05-m2-2-2-teacher-review-plan.md §4). crossword_attempts is student data and belongs to the M2-2.4
-- migration, after the governance update (docs/pilot/12). No student policy anywhere: all student access later goes
-- through server code using the service role.

CREATE TABLE public.crossword_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id uuid NOT NULL REFERENCES public.crossword_puzzles(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  status public.crossword_assignment_status NOT NULL DEFAULT 'open',
  opens_at timestamptz,
  closes_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_crossword_assignments_puzzle_classroom UNIQUE (puzzle_id, classroom_id),
  CONSTRAINT chk_crossword_assignment_window CHECK (opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at),
  CONSTRAINT chk_crossword_assignment_closed CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX idx_crossword_assignments_classroom_open ON public.crossword_assignments (classroom_id) WHERE status = 'open';
CREATE INDEX idx_crossword_assignments_puzzle ON public.crossword_assignments (puzzle_id);

ALTER TABLE public.crossword_assignments ENABLE ROW LEVEL SECURITY;

-- The puzzle owner check must not read crossword_puzzles under RLS: that policy reads assignments, which
-- would be a policy cycle. SECURITY DEFINER breaks it; it only answers "is this me?".
CREATE FUNCTION public.fn_is_crossword_owner(p_puzzle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crossword_puzzles p
    WHERE p.id = p_puzzle_id AND p.owner_id = (SELECT auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.fn_is_crossword_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_is_crossword_owner(uuid) TO authenticated, service_role;

-- Staff of the classroom: its owner and co-teachers; and the puzzle owner.
CREATE POLICY crossword_assignments_select_staff ON public.crossword_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = crossword_assignments.classroom_id AND c.owner_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.classroom_teachers ct WHERE ct.classroom_id = crossword_assignments.classroom_id AND ct.teacher_id = (SELECT auth.uid()))
    OR public.fn_is_crossword_owner(crossword_assignments.puzzle_id)
  );

-- Puzzles and words are also visible to the staff of any classroom they are assigned to (policies are OR-ed
-- with the owner/set policy of the previous migration). The check runs on assignments with the caller's RLS.
CREATE POLICY crossword_puzzles_select_assigned_staff ON public.crossword_puzzles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crossword_assignments a WHERE a.puzzle_id = crossword_puzzles.id));

-- Words inherit the visibility of their puzzle (sub-select under the caller's RLS).
CREATE POLICY crossword_words_select_via_puzzle ON public.crossword_words
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crossword_puzzles p WHERE p.id = crossword_words.puzzle_id));

-- Crossword validator, placement hash and the transactional functions for save, review edits,
-- versioning, publishing, closing and archiving (docs/m2/05-crossword-review-publish-versioning.md).
-- All service_role only; the caller (server action) passes the acting teacher/admin. Errors are P0001 with a
-- stable code the TypeScript service maps to Korean text. Audit metadata carries ids, counts and field names
-- only: never an answer or a clue.
--
-- Word JSON used by the functions: {number, direction, row, col, answer, clue, entryId}.

-- ---------------------------------------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------------------------------------

CREATE FUNCTION public.fn_crossword_expand(p_words jsonb)
RETURNS TABLE (idx integer, num integer, dir text, r integer, c integer, ans text, len integer, single boolean)
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT (t.ord - 1)::integer,
         (t.e ->> 'number')::integer,
         t.e ->> 'direction',
         (t.e ->> 'row')::integer,
         (t.e ->> 'col')::integer,
         t.e ->> 'answer',
         pg_catalog.char_length(t.e ->> 'answer'),
         pg_catalog.char_length(t.e ->> 'answer') = 1
  FROM pg_catalog.jsonb_array_elements(p_words) WITH ORDINALITY AS t(e, ord)
$$;

-- One row per occupied cell of each word (a one-character word has one cell).
CREATE FUNCTION public.fn_crossword_cells(p_words jsonb)
RETURNS TABLE (idx integer, r integer, c integer, ch text, single boolean, dir text)
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT x.idx,
         x.r + CASE WHEN x.dir = 'down' THEN k ELSE 0 END,
         x.c + CASE WHEN x.dir = 'across' THEN k ELSE 0 END,
         pg_catalog.substr(x.ans, k + 1, 1),
         x.single,
         x.dir
  FROM public.fn_crossword_expand(p_words) x
  CROSS JOIN LATERAL pg_catalog.generate_series(0, x.len - 1) AS k
$$;

-- Byte-identical to canonicalPuzzleText/placementHash in src/features/crossword/generator/generate.ts:
--   "v<version>\n<rows>x<cols>\n" + words sorted by number, then direction: number|direction|row|col|answer|entryId
CREATE FUNCTION public.fn_crossword_placement_hash(
  p_generator_version integer, p_rows integer, p_cols integer, p_words jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(E'\n',
          'v' || p_generator_version::text,
          p_rows::text || 'x' || p_cols::text,
          (SELECT pg_catalog.string_agg(
                    (e ->> 'number') || '|' || (e ->> 'direction') || '|' || (e ->> 'row') || '|' || (e ->> 'col')
                    || '|' || (e ->> 'answer') || '|' || COALESCE(e ->> 'entryId', ''),
                    E'\n' ORDER BY (e ->> 'number')::integer, (e ->> 'direction') COLLATE "C")
           FROM pg_catalog.jsonb_array_elements(p_words) AS e)),
        'UTF8')),
    'hex')
$$;

-- SQL twin of validatePuzzle (generator/validate.ts). NULL when valid, otherwise the first failing code.
CREATE FUNCTION public.fn_crossword_validate_words(p_rows integer, p_cols integer, p_words jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_total integer;
  v_multi integer;
  v_reached integer;
BEGIN
  IF p_words IS NULL OR pg_catalog.jsonb_typeof(p_words) <> 'array' OR pg_catalog.jsonb_array_length(p_words) = 0 THEN
    RETURN 'CROSSWORD_EMPTY';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_total FROM public.fn_crossword_expand(p_words);
  IF EXISTS (
    SELECT 1 FROM public.fn_crossword_expand(p_words) x
    WHERE x.dir IS NULL OR x.dir NOT IN ('across', 'down')
       OR x.ans IS NULL OR x.ans !~ '^[가-힣A-Z0-9]+$' OR x.len > 15
       OR x.r IS NULL OR x.c IS NULL OR x.r < 0 OR x.c < 0
       OR x.num IS NULL OR x.num < 1
  ) THEN
    RETURN 'CROSSWORD_BAD_WORD';
  END IF;

  IF (SELECT pg_catalog.count(DISTINCT x.ans) FROM public.fn_crossword_expand(p_words) x) <> v_total
     OR (SELECT pg_catalog.count(DISTINCT (x.r, x.c, x.dir)) FROM public.fn_crossword_expand(p_words) x) <> v_total THEN
    RETURN 'CROSSWORD_DUPLICATE';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_multi FROM public.fn_crossword_expand(p_words) x WHERE NOT x.single;
  IF v_multi = 0 THEN
    RETURN 'CROSSWORD_EMPTY';
  END IF;

  IF EXISTS (SELECT 1 FROM public.fn_crossword_cells(p_words) k WHERE k.r >= p_rows OR k.c >= p_cols) THEN
    RETURN 'CROSSWORD_OUT_OF_BOUNDS';
  END IF;

  -- Letters agree where words share a cell.
  IF EXISTS (
    SELECT 1 FROM public.fn_crossword_cells(p_words) k WHERE NOT k.single
    GROUP BY k.r, k.c HAVING pg_catalog.count(DISTINCT k.ch) > 1
  ) THEN
    RETURN 'CROSSWORD_LETTER_CONFLICT';
  END IF;

  -- Runs of two or more cells must be exactly the multi-cell words, in both directions.
  IF EXISTS (
    SELECT b.r, pg_catalog.min(b.c)::integer, pg_catalog.count(*)::integer
    FROM (SELECT d.r, d.c, d.c - pg_catalog.row_number() OVER (PARTITION BY d.r ORDER BY d.c) AS g
          FROM (SELECT DISTINCT k.r, k.c FROM public.fn_crossword_cells(p_words) k WHERE NOT k.single) d) b
    GROUP BY b.r, b.g HAVING pg_catalog.count(*) >= 2
    EXCEPT
    SELECT x.r, x.c, x.len FROM public.fn_crossword_expand(p_words) x WHERE x.dir = 'across' AND NOT x.single
  ) OR EXISTS (
    SELECT pg_catalog.min(b.r)::integer, b.c, pg_catalog.count(*)::integer
    FROM (SELECT d.r, d.c, d.r - pg_catalog.row_number() OVER (PARTITION BY d.c ORDER BY d.r) AS g
          FROM (SELECT DISTINCT k.r, k.c FROM public.fn_crossword_cells(p_words) k WHERE NOT k.single) d) b
    GROUP BY b.c, b.g HAVING pg_catalog.count(*) >= 2
    EXCEPT
    SELECT x.r, x.c, x.len FROM public.fn_crossword_expand(p_words) x WHERE x.dir = 'down' AND NOT x.single
  ) THEN
    RETURN 'CROSSWORD_UNINTENDED_RUN';
  END IF;
  IF EXISTS (
    SELECT x.r, x.c, x.len FROM public.fn_crossword_expand(p_words) x WHERE x.dir = 'across' AND NOT x.single
    EXCEPT
    SELECT b.r, pg_catalog.min(b.c)::integer, pg_catalog.count(*)::integer
    FROM (SELECT d.r, d.c, d.c - pg_catalog.row_number() OVER (PARTITION BY d.r ORDER BY d.c) AS g
          FROM (SELECT DISTINCT k.r, k.c FROM public.fn_crossword_cells(p_words) k WHERE NOT k.single) d) b
    GROUP BY b.r, b.g
  ) OR EXISTS (
    SELECT x.r, x.c, x.len FROM public.fn_crossword_expand(p_words) x WHERE x.dir = 'down' AND NOT x.single
    EXCEPT
    SELECT pg_catalog.min(b.r)::integer, b.c, pg_catalog.count(*)::integer
    FROM (SELECT d.r, d.c, d.r - pg_catalog.row_number() OVER (PARTITION BY d.c ORDER BY d.r) AS g
          FROM (SELECT DISTINCT k.r, k.c FROM public.fn_crossword_cells(p_words) k WHERE NOT k.single) d) b
    GROUP BY b.c, b.g
  ) THEN
    RETURN 'CROSSWORD_MISSING_RUN';
  END IF;

  -- A one-character word sits on a multi-cell word with the same letter, in the direction that word does not use.
  IF EXISTS (
    SELECT 1 FROM public.fn_crossword_cells(p_words) s
    WHERE s.single AND NOT EXISTS (
      SELECT 1 FROM public.fn_crossword_cells(p_words) m
      WHERE NOT m.single AND m.r = s.r AND m.c = s.c AND m.ch = s.ch)
  ) OR EXISTS (
    SELECT 1 FROM public.fn_crossword_cells(p_words) s
    JOIN public.fn_crossword_cells(p_words) m ON NOT m.single AND m.r = s.r AND m.c = s.c AND m.dir = s.dir
    WHERE s.single
  ) THEN
    RETURN 'CROSSWORD_SINGLE_INVALID';
  END IF;

  -- Connected: multi-cell words linked through shared cells.
  WITH RECURSIVE cw AS (
    SELECT k.idx, k.r, k.c FROM public.fn_crossword_cells(p_words) k WHERE NOT k.single
  ), edges AS (
    SELECT a.idx AS a, b.idx AS b FROM cw a JOIN cw b ON a.r = b.r AND a.c = b.c AND a.idx <> b.idx
  ), reach(idx) AS (
    SELECT pg_catalog.min(cw.idx) FROM cw
    UNION
    SELECT e.b FROM reach JOIN edges e ON e.a = reach.idx
  )
  SELECT pg_catalog.count(*)::integer INTO v_reached FROM reach;
  IF v_reached <> v_multi THEN
    RETURN 'CROSSWORD_DISCONNECTED';
  END IF;

  -- Trimmed to the bounding box of the board.
  IF EXISTS (
    SELECT 1 FROM public.fn_crossword_cells(p_words) k
    HAVING pg_catalog.min(k.r) <> 0 OR pg_catalog.min(k.c) <> 0
        OR pg_catalog.max(k.r) <> p_rows - 1 OR pg_catalog.max(k.c) <> p_cols - 1
  ) THEN
    RETURN 'CROSSWORD_NOT_TRIMMED';
  END IF;

  -- Numbering: reading order of the distinct start cells; words starting in one cell share the number.
  IF EXISTS (
    WITH starts AS (
      SELECT s.r, s.c, pg_catalog.dense_rank() OVER (ORDER BY s.r, s.c) AS rk
      FROM (SELECT DISTINCT x.r, x.c FROM public.fn_crossword_expand(p_words) x) s)
    SELECT 1 FROM public.fn_crossword_expand(p_words) x
    JOIN starts s ON s.r = x.r AND s.c = x.c
    WHERE x.num <> s.rk
  ) THEN
    RETURN 'CROSSWORD_BAD_NUMBERING';
  END IF;

  RETURN NULL;
END;
$$;

-- The words of a stored puzzle in the JSON shape the helpers expect.
CREATE FUNCTION public.fn_crossword_words_json(p_puzzle_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'number', w.number, 'direction', w.direction, 'row', w.row, 'col', w.col, 'answer', w.answer)
           ORDER BY w.number, w.direction), '[]'::jsonb)
  FROM public.crossword_words w WHERE w.puzzle_id = p_puzzle_id
$$;

-- Active teacher or admin of this school, or CROSSWORD_FORBIDDEN.
CREATE FUNCTION public.fn_crossword_actor_role(p_actor_id uuid, p_school_id uuid)
RETURNS public.user_role
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
  v_school uuid;
  v_status public.profile_status;
BEGIN
  SELECT p.role, p.school_id, p.status INTO v_role, v_school, v_status FROM public.profiles p WHERE p.id = p_actor_id;
  IF v_role IS NULL OR v_status <> 'active' OR v_school <> p_school_id OR v_role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'CROSSWORD_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_role;
END;
$$;

-- Same rights as word sets (D3): admin, the puzzle owner, owner/co-teachers of the classroom linked to the source
-- set or of any classroom the puzzle is assigned to.
CREATE FUNCTION public.fn_crossword_actor_manages(p_actor_id uuid, p_role public.user_role, p_puzzle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT p_role = 'admin' OR EXISTS (
    SELECT 1 FROM public.crossword_puzzles p
    WHERE p.id = p_puzzle_id AND (
      p.owner_id = p_actor_id
      OR EXISTS (
        SELECT 1 FROM public.content_sets s
        WHERE s.id = p.set_id AND s.classroom_id IS NOT NULL AND (
          EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = s.classroom_id AND c.owner_id = p_actor_id)
          OR EXISTS (SELECT 1 FROM public.classroom_teachers ct WHERE ct.classroom_id = s.classroom_id AND ct.teacher_id = p_actor_id)))
      OR EXISTS (
        SELECT 1 FROM public.crossword_assignments a
        WHERE a.puzzle_id = p.id AND (
          EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = a.classroom_id AND c.owner_id = p_actor_id)
          OR EXISTS (SELECT 1 FROM public.classroom_teachers ct WHERE ct.classroom_id = a.classroom_id AND ct.teacher_id = p_actor_id)))))
$$;

-- Decision C2: a puzzle needs at least this many multi-cell words (one-cell words do not count). The application
-- constant CROSSWORD_MIN_WORDS is 5 as well; a test pins both.
CREATE FUNCTION public.fn_crossword_min_words()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$ SELECT 5 $$;

-- Classrooms a puzzle may be assigned to: same school, live (archived = read-only, P2), and managed by the actor.
-- Returns the de-duplicated ids.
CREATE FUNCTION public.fn_crossword_check_classrooms(
  p_actor_id uuid, p_role public.user_role, p_school_id uuid, p_classroom_ids uuid[]
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ids uuid[];
  v_cid uuid;
  v_classroom public.classrooms%ROWTYPE;
BEGIN
  SELECT pg_catalog.array_agg(DISTINCT x) INTO v_ids FROM pg_catalog.unnest(p_classroom_ids) AS x WHERE x IS NOT NULL;
  IF v_ids IS NULL OR pg_catalog.cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'CROSSWORD_CLASSROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;
  FOREACH v_cid IN ARRAY v_ids LOOP
    SELECT * INTO v_classroom FROM public.classrooms c WHERE c.id = v_cid;
    IF NOT FOUND OR v_classroom.school_id <> p_school_id THEN
      RAISE EXCEPTION 'CROSSWORD_CLASSROOM_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF p_role <> 'admin' AND NOT (
      v_classroom.owner_id = p_actor_id OR EXISTS (
        SELECT 1 FROM public.classroom_teachers ct WHERE ct.classroom_id = v_cid AND ct.teacher_id = p_actor_id)
    ) THEN
      RAISE EXCEPTION 'CROSSWORD_CLASSROOM_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF v_classroom.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'CROSSWORD_CLASSROOM_ARCHIVED' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN v_ids;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Save: preview ticket -> draft (or re-save of a version-1 draft)
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.fn_save_crossword(
  p_ticket_id uuid,
  p_actor_id uuid,
  p_school_id uuid,
  p_token_hash text,
  p_set_id uuid,
  p_title text,
  p_level public.crossword_level,
  p_settings jsonb,
  p_stats jsonb,
  p_seed bigint,
  p_generator_version integer,
  p_placement_hash text,
  p_rows integer,
  p_cols integer,
  p_words jsonb,
  p_max_words integer,
  p_max_singles integer,
  -- NULL: create version 1. Set: replace the grid of this draft (re-save after a regenerate). Only a version-1 draft:
  -- the grid of a later version is the grid of the version it was copied from.
  p_puzzle_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
  v_ticket public.crossword_preview_tickets%ROWTYPE;
  v_set public.content_sets%ROWTYPE;
  v_puzzle public.crossword_puzzles%ROWTYPE;
  v_code text;
  v_multi integer;
  v_single integer;
  v_id uuid;
BEGIN
  v_role := public.fn_crossword_actor_role(p_actor_id, p_school_id);

  SELECT * INTO v_ticket FROM public.crossword_preview_tickets t
  WHERE t.id = p_ticket_id AND t.actor_id = p_actor_id AND t.school_id = p_school_id
  FOR UPDATE;
  IF NOT FOUND OR v_ticket.used_at IS NOT NULL OR v_ticket.expires_at < pg_catalog.now()
     OR v_ticket.token_hash <> p_token_hash THEN
    RAISE EXCEPTION 'CROSSWORD_TICKET_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF v_ticket.set_id IS DISTINCT FROM p_set_id THEN
    RAISE EXCEPTION 'CROSSWORD_TICKET_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_words IS NULL OR pg_catalog.jsonb_typeof(p_words) <> 'array' THEN
    RAISE EXCEPTION 'CROSSWORD_EMPTY' USING ERRCODE = 'P0001';
  END IF;
  -- The browser sends options and seed only; the application regenerated the words. The hash binds all of it.
  IF v_ticket.placement_hash <> p_placement_hash
     OR p_placement_hash <> public.fn_crossword_placement_hash(p_generator_version, p_rows, p_cols, p_words) THEN
    RAISE EXCEPTION 'CROSSWORD_HASH_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_set FROM public.content_sets s WHERE s.id = p_set_id AND s.school_id = p_school_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CROSSWORD_SET_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_set.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'CROSSWORD_SET_ARCHIVED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (
    v_role = 'admin' OR v_set.owner_id = p_actor_id
    OR (v_set.classroom_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = v_set.classroom_id AND c.owner_id = p_actor_id)
      OR EXISTS (SELECT 1 FROM public.classroom_teachers ct WHERE ct.classroom_id = v_set.classroom_id AND ct.teacher_id = p_actor_id)))
  ) THEN
    RAISE EXCEPTION 'CROSSWORD_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF v_set.classroom_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.classrooms c WHERE c.id = v_set.classroom_id AND c.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'CROSSWORD_CLASSROOM_ARCHIVED' USING ERRCODE = 'P0001';
  END IF;

  IF p_title IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'CROSSWORD_TITLE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_code := public.fn_crossword_validate_words(p_rows, p_cols, p_words);
  IF v_code IS NOT NULL THEN
    RAISE EXCEPTION '%', v_code USING ERRCODE = 'P0001';
  END IF;

  -- Decision C2: fewer than the minimum of multi-cell words never becomes a draft.
  SELECT pg_catalog.count(*) FILTER (WHERE NOT x.single)::integer, pg_catalog.count(*) FILTER (WHERE x.single)::integer
  INTO v_multi, v_single FROM public.fn_crossword_expand(p_words) x;
  IF v_multi < public.fn_crossword_min_words() OR v_multi > p_max_words OR v_single > p_max_singles THEN
    RAISE EXCEPTION 'CROSSWORD_WORD_COUNT' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_words) e
    WHERE (e ->> 'clue') IS NULL OR pg_catalog.char_length(e ->> 'clue') NOT BETWEEN 1 AND 200
  ) THEN
    RAISE EXCEPTION 'CROSSWORD_CLUE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_puzzle_id IS NULL THEN
    INSERT INTO public.crossword_puzzles
      (school_id, owner_id, set_id, title, level, settings, stats, seed, generator_version, placement_hash, rows, cols)
    VALUES
      (p_school_id, p_actor_id, p_set_id, pg_catalog.btrim(p_title), p_level, p_settings, p_stats, p_seed,
       p_generator_version, p_placement_hash, p_rows, p_cols)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_puzzle FROM public.crossword_puzzles p
    WHERE p.id = p_puzzle_id AND p.school_id = p_school_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF NOT public.fn_crossword_actor_manages(p_actor_id, v_role, p_puzzle_id) THEN
      RAISE EXCEPTION 'CROSSWORD_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    IF v_puzzle.status <> 'draft' THEN
      RAISE EXCEPTION 'CROSSWORD_NOT_DRAFT' USING ERRCODE = 'P0001';
    END IF;
    IF v_puzzle.version <> 1 OR v_puzzle.set_id IS DISTINCT FROM p_set_id THEN
      RAISE EXCEPTION 'CROSSWORD_RESAVE_NOT_ALLOWED' USING ERRCODE = 'P0001';
    END IF;
    v_id := p_puzzle_id;
    DELETE FROM public.crossword_words WHERE puzzle_id = v_id;
    UPDATE public.crossword_puzzles
    SET title = pg_catalog.btrim(p_title), level = p_level, settings = p_settings, stats = p_stats, seed = p_seed,
        generator_version = p_generator_version, placement_hash = p_placement_hash, rows = p_rows, cols = p_cols
    WHERE id = v_id;
  END IF;

  INSERT INTO public.crossword_words (puzzle_id, number, direction, row, col, answer, clue, source_entry_id)
  SELECT v_id, (e ->> 'number')::smallint, (e ->> 'direction')::public.crossword_direction,
         (e ->> 'row')::smallint, (e ->> 'col')::smallint, e ->> 'answer', e ->> 'clue',
         (SELECT ce.id FROM public.content_entries ce WHERE ce.id = (e ->> 'entryId')::uuid)
  FROM pg_catalog.jsonb_array_elements(p_words) e;

  UPDATE public.crossword_preview_tickets SET used_at = pg_catalog.timezone('utc', pg_catalog.now()) WHERE id = v_ticket.id;

  IF p_puzzle_id IS NULL THEN
    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
    VALUES (p_actor_id, 'crossword.created', 'crossword', v_id,
            pg_catalog.jsonb_build_object('schoolId', p_school_id, 'setId', p_set_id, 'level', p_level,
                                          'wordCount', v_multi + v_single, 'version', 1));
  ELSE
    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
    VALUES (p_actor_id, 'crossword.updated', 'crossword', v_id,
            pg_catalog.jsonb_build_object('schoolId', p_school_id, 'fields', pg_catalog.to_jsonb(ARRAY['grid'])));
  END IF;

  RETURN pg_catalog.jsonb_build_object('puzzleId', v_id, 'version', 1);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Review edits on a draft: title and clue wording only
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.fn_update_crossword_draft(
  p_puzzle_id uuid,
  p_actor_id uuid,
  p_school_id uuid,
  p_title text,
  p_clues jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
  v_puzzle public.crossword_puzzles%ROWTYPE;
  v_fields text[] := ARRAY[]::text[];
  v_expected integer;
  v_updated integer;
BEGIN
  v_role := public.fn_crossword_actor_role(p_actor_id, p_school_id);

  SELECT * INTO v_puzzle FROM public.crossword_puzzles p WHERE p.id = p_puzzle_id AND p.school_id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.fn_crossword_actor_manages(p_actor_id, v_role, p_puzzle_id) THEN
    RAISE EXCEPTION 'CROSSWORD_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- Published puzzles are frozen: students hold progress against them. Make a new version instead.
  IF v_puzzle.status <> 'draft' THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_DRAFT' USING ERRCODE = 'P0001';
  END IF;

  IF p_title IS NOT NULL THEN
    IF pg_catalog.char_length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'CROSSWORD_TITLE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.crossword_puzzles SET title = pg_catalog.btrim(p_title) WHERE id = p_puzzle_id;
    v_fields := pg_catalog.array_append(v_fields, 'title');
  END IF;

  IF p_clues IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(p_clues) <> 'array' THEN
      RAISE EXCEPTION 'CROSSWORD_CLUE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_clues) e
      WHERE (e ->> 'clue') IS NULL OR pg_catalog.char_length(pg_catalog.btrim(e ->> 'clue')) NOT BETWEEN 1 AND 200
    ) THEN
      RAISE EXCEPTION 'CROSSWORD_CLUE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    v_expected := pg_catalog.jsonb_array_length(p_clues);
    UPDATE public.crossword_words w
    SET clue = pg_catalog.btrim(e ->> 'clue')
    FROM pg_catalog.jsonb_array_elements(p_clues) e
    WHERE w.puzzle_id = p_puzzle_id
      AND w.number = (e ->> 'number')::smallint
      AND w.direction = (e ->> 'direction')::public.crossword_direction;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> v_expected THEN
      RAISE EXCEPTION 'CROSSWORD_WORD_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    v_fields := pg_catalog.array_append(v_fields, 'clues');
  END IF;

  IF pg_catalog.cardinality(v_fields) > 0 THEN
    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
    VALUES (p_actor_id, 'crossword.updated', 'crossword', p_puzzle_id,
            pg_catalog.jsonb_build_object('schoolId', p_school_id, 'fields', pg_catalog.to_jsonb(v_fields)));
  END IF;
  RETURN pg_catalog.jsonb_build_object('puzzleId', p_puzzle_id, 'fields', pg_catalog.to_jsonb(v_fields));
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Versioning: copy a published puzzle into a new draft
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.fn_create_crossword_version(p_source_id uuid, p_actor_id uuid, p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
  v_src public.crossword_puzzles%ROWTYPE;
  v_new_id uuid;
  v_version integer;
BEGIN
  v_role := public.fn_crossword_actor_role(p_actor_id, p_school_id);

  SELECT * INTO v_src FROM public.crossword_puzzles p WHERE p.id = p_source_id AND p.school_id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.fn_crossword_actor_manages(p_actor_id, v_role, p_source_id) THEN
    RAISE EXCEPTION 'CROSSWORD_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- Only a puzzle that was published is a version worth continuing; a draft is edited in place.
  IF v_src.published_at IS NULL THEN
    RAISE EXCEPTION 'CROSSWORD_VERSION_SOURCE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Serialise version creation per lineage.
  PERFORM 1 FROM public.crossword_puzzles p WHERE p.root_id = v_src.root_id FOR UPDATE;

  -- One draft per lineage, and a new version continues the latest published one.
  IF EXISTS (SELECT 1 FROM public.crossword_puzzles p WHERE p.root_id = v_src.root_id AND p.status = 'draft')
     OR EXISTS (SELECT 1 FROM public.crossword_puzzles p
                WHERE p.root_id = v_src.root_id AND p.published_at IS NOT NULL AND p.version > v_src.version) THEN
    RAISE EXCEPTION 'CROSSWORD_VERSION_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.max(p.version) + 1 INTO v_version FROM public.crossword_puzzles p WHERE p.root_id = v_src.root_id;

  INSERT INTO public.crossword_puzzles
    (school_id, owner_id, set_id, title, level, settings, stats, seed, generator_version, placement_hash,
     rows, cols, root_id, version, supersedes_id)
  VALUES
    (v_src.school_id, v_src.owner_id, v_src.set_id, v_src.title, v_src.level, v_src.settings, v_src.stats, v_src.seed,
     v_src.generator_version, v_src.placement_hash, v_src.rows, v_src.cols, v_src.root_id, v_version, v_src.id)
  RETURNING id INTO v_new_id;

  INSERT INTO public.crossword_words (puzzle_id, number, direction, row, col, answer, clue, source_entry_id)
  SELECT v_new_id, w.number, w.direction, w.row, w.col, w.answer, w.clue, w.source_entry_id
  FROM public.crossword_words w WHERE w.puzzle_id = v_src.id;

  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  VALUES (p_actor_id, 'crossword.copied', 'crossword', v_new_id,
          pg_catalog.jsonb_build_object('schoolId', p_school_id, 'fromPuzzleId', v_src.id, 'rootId', v_src.root_id,
                                        'version', v_version));

  RETURN pg_catalog.jsonb_build_object('puzzleId', v_new_id, 'version', v_version, 'rootId', v_src.root_id);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Publish: draft -> published, assignments, supersede the previous published version
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.fn_publish_crossword(
  p_puzzle_id uuid,
  p_actor_id uuid,
  p_school_id uuid,
  p_classroom_ids uuid[],
  p_opens_at timestamptz,
  p_closes_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
  v_puzzle public.crossword_puzzles%ROWTYPE;
  v_ids uuid[];
  v_code text;
  v_prev public.crossword_puzzles%ROWTYPE;
  v_superseded_id uuid;
  v_superseded_classrooms uuid[] := ARRAY[]::uuid[];
  v_multi integer;
  v_words integer;
BEGIN
  v_role := public.fn_crossword_actor_role(p_actor_id, p_school_id);

  SELECT * INTO v_puzzle FROM public.crossword_puzzles p WHERE p.id = p_puzzle_id AND p.school_id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.fn_crossword_actor_manages(p_actor_id, v_role, p_puzzle_id) THEN
    RAISE EXCEPTION 'CROSSWORD_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF v_puzzle.status <> 'draft' THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_DRAFT' USING ERRCODE = 'P0001';
  END IF;

  IF p_opens_at IS NOT NULL AND p_closes_at IS NOT NULL AND p_opens_at >= p_closes_at THEN
    RAISE EXCEPTION 'CROSSWORD_WINDOW_INVALID' USING ERRCODE = 'P0001';
  END IF;
  v_ids := public.fn_crossword_check_classrooms(p_actor_id, v_role, p_school_id, p_classroom_ids);

  -- Decision C2: at least the minimum number of multi-cell words, counted from the stored words.
  SELECT pg_catalog.count(*) FILTER (WHERE NOT w.single)::integer, pg_catalog.count(*)::integer
  INTO v_multi, v_words FROM public.crossword_words w WHERE w.puzzle_id = p_puzzle_id;
  IF v_multi < public.fn_crossword_min_words() THEN
    RAISE EXCEPTION 'CROSSWORD_TOO_FEW_WORDS' USING ERRCODE = 'P0001';
  END IF;

  -- Validate again from the stored words: nothing the browser or an older save said is trusted.
  v_code := public.fn_crossword_validate_words(v_puzzle.rows, v_puzzle.cols, public.fn_crossword_words_json(p_puzzle_id));
  IF v_code IS NOT NULL THEN
    RAISE EXCEPTION '%', v_code USING ERRCODE = 'P0001';
  END IF;

  -- Supersede the published version of the lineage first (the unique index allows one published version).
  PERFORM 1 FROM public.crossword_puzzles p WHERE p.root_id = v_puzzle.root_id FOR UPDATE;
  SELECT * INTO v_prev FROM public.crossword_puzzles p
  WHERE p.root_id = v_puzzle.root_id AND p.status = 'published' AND p.id <> p_puzzle_id;
  IF FOUND THEN
    v_superseded_id := v_prev.id;
    SELECT COALESCE(pg_catalog.array_agg(a.classroom_id), ARRAY[]::uuid[]) INTO v_superseded_classrooms
    FROM public.crossword_assignments a WHERE a.puzzle_id = v_prev.id AND a.status = 'open';
    UPDATE public.crossword_assignments
    SET status = 'closed', closed_at = pg_catalog.timezone('utc', pg_catalog.now())
    WHERE puzzle_id = v_prev.id AND status = 'open';
    UPDATE public.crossword_puzzles
    SET status = 'archived', archived_at = pg_catalog.timezone('utc', pg_catalog.now())
    WHERE id = v_prev.id;
    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
    VALUES (p_actor_id, 'crossword.archived', 'crossword', v_prev.id,
            pg_catalog.jsonb_build_object('schoolId', p_school_id, 'reason', 'superseded', 'byPuzzleId', p_puzzle_id));
  END IF;

  UPDATE public.crossword_puzzles
  SET status = 'published', published_at = pg_catalog.timezone('utc', pg_catalog.now())
  WHERE id = p_puzzle_id;

  INSERT INTO public.crossword_assignments (puzzle_id, classroom_id, opens_at, closes_at, created_by)
  SELECT p_puzzle_id, x, p_opens_at, p_closes_at, p_actor_id FROM pg_catalog.unnest(v_ids) AS x;

  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  VALUES (p_actor_id, 'crossword.published', 'crossword', p_puzzle_id,
          pg_catalog.jsonb_build_object('schoolId', p_school_id, 'classroomIds', pg_catalog.to_jsonb(v_ids),
                                        'level', v_puzzle.level, 'wordCount', v_words,
                                        'version', v_puzzle.version, 'supersededPuzzleId', v_superseded_id));

  RETURN pg_catalog.jsonb_build_object(
    'puzzleId', p_puzzle_id,
    'version', v_puzzle.version,
    'classroomIds', pg_catalog.to_jsonb(v_ids),
    'supersededPuzzleId', v_superseded_id,
    'supersededClassroomIds', pg_catalog.to_jsonb(v_superseded_classrooms));
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Assign a published puzzle to additional classrooms (Q6). The puzzle stays frozen; assignments are separate rows.
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.fn_add_crossword_assignments(
  p_puzzle_id uuid,
  p_actor_id uuid,
  p_school_id uuid,
  p_classroom_ids uuid[],
  p_opens_at timestamptz,
  p_closes_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
  v_puzzle public.crossword_puzzles%ROWTYPE;
  v_ids uuid[];
BEGIN
  v_role := public.fn_crossword_actor_role(p_actor_id, p_school_id);

  SELECT * INTO v_puzzle FROM public.crossword_puzzles p WHERE p.id = p_puzzle_id AND p.school_id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.fn_crossword_actor_manages(p_actor_id, v_role, p_puzzle_id) THEN
    RAISE EXCEPTION 'CROSSWORD_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF v_puzzle.status <> 'published' THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_PUBLISHED' USING ERRCODE = 'P0001';
  END IF;
  IF p_opens_at IS NOT NULL AND p_closes_at IS NOT NULL AND p_opens_at >= p_closes_at THEN
    RAISE EXCEPTION 'CROSSWORD_WINDOW_INVALID' USING ERRCODE = 'P0001';
  END IF;
  v_ids := public.fn_crossword_check_classrooms(p_actor_id, v_role, p_school_id, p_classroom_ids);

  -- A classroom that already has an assignment (open or closed) is not assigned again; reopening is a separate decision.
  IF EXISTS (SELECT 1 FROM public.crossword_assignments a WHERE a.puzzle_id = p_puzzle_id AND a.classroom_id = ANY (v_ids)) THEN
    RAISE EXCEPTION 'CROSSWORD_ALREADY_ASSIGNED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.crossword_assignments (puzzle_id, classroom_id, opens_at, closes_at, created_by)
  SELECT p_puzzle_id, x, p_opens_at, p_closes_at, p_actor_id FROM pg_catalog.unnest(v_ids) AS x;

  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  VALUES (p_actor_id, 'crossword.assigned', 'crossword', p_puzzle_id,
          pg_catalog.jsonb_build_object('schoolId', p_school_id, 'classroomIds', pg_catalog.to_jsonb(v_ids)));

  RETURN pg_catalog.jsonb_build_object('puzzleId', p_puzzle_id, 'classroomIds', pg_catalog.to_jsonb(v_ids));
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Close one assignment (the puzzle stays published)
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.fn_close_crossword_assignment(p_assignment_id uuid, p_actor_id uuid, p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
  v_a public.crossword_assignments%ROWTYPE;
  v_school uuid;
BEGIN
  v_role := public.fn_crossword_actor_role(p_actor_id, p_school_id);

  SELECT a.* INTO v_a FROM public.crossword_assignments a WHERE a.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  SELECT p.school_id INTO v_school FROM public.crossword_puzzles p WHERE p.id = v_a.puzzle_id;
  IF v_school <> p_school_id THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.fn_crossword_actor_manages(p_actor_id, v_role, v_a.puzzle_id) THEN
    RAISE EXCEPTION 'CROSSWORD_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF v_a.status <> 'open' THEN
    RAISE EXCEPTION 'CROSSWORD_ASSIGNMENT_NOT_OPEN' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crossword_assignments
  SET status = 'closed', closed_at = pg_catalog.timezone('utc', pg_catalog.now())
  WHERE id = p_assignment_id;

  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, classroom_id, metadata)
  VALUES (p_actor_id, 'crossword.assignment_closed', 'crossword', v_a.puzzle_id, v_a.classroom_id,
          pg_catalog.jsonb_build_object('schoolId', p_school_id, 'assignmentId', p_assignment_id));
  RETURN pg_catalog.jsonb_build_object('assignmentId', p_assignment_id, 'status', 'closed');
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Archive / restore. Restore only for a puzzle that was never published (docs/m2/05 §1).
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.fn_set_crossword_archived(
  p_puzzle_id uuid, p_actor_id uuid, p_school_id uuid, p_archive boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
  v_puzzle public.crossword_puzzles%ROWTYPE;
  v_closed integer := 0;
BEGIN
  v_role := public.fn_crossword_actor_role(p_actor_id, p_school_id);

  SELECT * INTO v_puzzle FROM public.crossword_puzzles p WHERE p.id = p_puzzle_id AND p.school_id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.fn_crossword_actor_manages(p_actor_id, v_role, p_puzzle_id) THEN
    RAISE EXCEPTION 'CROSSWORD_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_archive THEN
    IF v_puzzle.status = 'archived' THEN
      RAISE EXCEPTION 'CROSSWORD_ALREADY_ARCHIVED' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.crossword_assignments
    SET status = 'closed', closed_at = pg_catalog.timezone('utc', pg_catalog.now())
    WHERE puzzle_id = p_puzzle_id AND status = 'open';
    GET DIAGNOSTICS v_closed = ROW_COUNT;
    UPDATE public.crossword_puzzles
    SET status = 'archived', archived_at = pg_catalog.timezone('utc', pg_catalog.now())
    WHERE id = p_puzzle_id;
    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
    VALUES (p_actor_id, 'crossword.archived', 'crossword', p_puzzle_id,
            pg_catalog.jsonb_build_object('schoolId', p_school_id, 'reason', 'manual', 'closedAssignments', v_closed));
  ELSE
    IF v_puzzle.status <> 'archived' THEN
      RAISE EXCEPTION 'CROSSWORD_NOT_ARCHIVED' USING ERRCODE = 'P0001';
    END IF;
    IF v_puzzle.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'CROSSWORD_RESTORE_NOT_ALLOWED' USING ERRCODE = 'P0001';
    END IF;
    BEGIN
      UPDATE public.crossword_puzzles SET status = 'draft', archived_at = NULL WHERE id = p_puzzle_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'CROSSWORD_VERSION_EXISTS' USING ERRCODE = 'P0001';
    END;
    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
    VALUES (p_actor_id, 'crossword.unarchived', 'crossword', p_puzzle_id,
            pg_catalog.jsonb_build_object('schoolId', p_school_id));
  END IF;
  RETURN pg_catalog.jsonb_build_object('puzzleId', p_puzzle_id, 'archived', p_archive, 'closedAssignments', v_closed);
END;
$$;

-- Previews that were never saved hold only hashes, but they accumulate (counterpart of the CSV cleanup).
CREATE FUNCTION public.fn_cleanup_crossword_tickets(p_grace interval DEFAULT interval '1 day')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_grace IS NULL OR p_grace < interval '0' THEN
    RAISE EXCEPTION 'CROSSWORD_CLEANUP_GRACE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.crossword_preview_tickets t
  WHERE t.expires_at < pg_catalog.now() - p_grace OR (t.used_at IS NOT NULL AND t.used_at < pg_catalog.now() - p_grace);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Grants: service_role only (the one exception is fn_is_crossword_owner, used by a policy).
-- ---------------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_crossword_expand(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_cells(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_placement_hash(integer, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_validate_words(integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_words_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_actor_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_actor_manages(uuid, public.user_role, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_save_crossword(uuid, uuid, uuid, text, uuid, text, public.crossword_level, jsonb, jsonb, bigint, integer, text, integer, integer, jsonb, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_update_crossword_draft(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_create_crossword_version(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_publish_crossword(uuid, uuid, uuid, uuid[], timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_close_crossword_assignment(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_crossword_archived(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cleanup_crossword_tickets(interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_min_words() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_check_classrooms(uuid, public.user_role, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_add_crossword_assignments(uuid, uuid, uuid, uuid[], timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_crossword_expand(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_cells(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_placement_hash(integer, integer, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_validate_words(integer, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_words_json(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_actor_role(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_actor_manages(uuid, public.user_role, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_save_crossword(uuid, uuid, uuid, text, uuid, text, public.crossword_level, jsonb, jsonb, bigint, integer, text, integer, integer, jsonb, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_update_crossword_draft(uuid, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_create_crossword_version(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publish_crossword(uuid, uuid, uuid, uuid[], timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_close_crossword_assignment(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_set_crossword_archived(uuid, uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_crossword_tickets(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_min_words() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_check_classrooms(uuid, public.user_role, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_add_crossword_assignments(uuid, uuid, uuid, uuid[], timestamptz, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------------------------------------
-- Read model for the teacher list. security_invoker => the caller's RLS applies (no answers, no clues).
-- ---------------------------------------------------------------------------------------------------------
CREATE VIEW public.v_crossword_puzzles_summary
WITH (security_invoker = true) AS
SELECT
  p.id AS puzzle_id,
  p.school_id,
  p.owner_id,
  p.set_id,
  p.title,
  p.level,
  p.status,
  p.root_id,
  p.version,
  p.supersedes_id,
  p.rows,
  p.cols,
  p.published_at,
  p.archived_at,
  p.updated_at,
  (SELECT pg_catalog.count(*) FROM public.crossword_words w WHERE w.puzzle_id = p.id)::integer AS word_count,
  (SELECT pg_catalog.count(*) FROM public.crossword_assignments a WHERE a.puzzle_id = p.id AND a.status = 'open')::integer AS open_assignments,
  EXISTS (
    SELECT 1 FROM public.crossword_puzzles n WHERE n.supersedes_id = p.id AND n.status <> 'archived'
  ) AS has_live_successor
FROM public.crossword_puzzles p;

REVOKE ALL ON public.v_crossword_puzzles_summary FROM PUBLIC, anon;
GRANT SELECT ON public.v_crossword_puzzles_summary TO authenticated, service_role;
