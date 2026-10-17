-- M2-2.4a F1: student crossword attempts (docs/m2/07-m2-2-4-student-play-plan.md B.2, 08 B).
-- STUDENT DATA. Governance draft: docs/pilot/14-crossword-attempts-governance-draft.md (not yet signed off).
--
-- Shape rules (doc 06 §11.8 and §12.8, PM 2026-10-17/18):
--   * the attempt row names no student: "whose attempt" is the member table, so a later shared (team) attempt is
--     more member rows, not a different table;
--   * cells is a plain {"r,c": "사"} map with no identity;
--   * counters, revision and timing live on the attempt;
--   * events record WHO acted (nullable actor) separately from whose attempt it is, and never any letter.
-- RLS is enabled with NO policy and every client privilege is revoked: students and teachers cannot read these
-- tables through PostgREST. All access goes through the service-role functions of migration 3. A teacher read
-- policy belongs to M2-2.5 (results) and is a separate, reviewed migration.

CREATE TABLE public.crossword_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.crossword_assignments(id) ON DELETE CASCADE,
  status public.crossword_attempt_status NOT NULL DEFAULT 'in_progress',
  -- What the student typed (and letters written by a reveal). Never the prefilled cells.
  cells jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Keys only ("row,col"); the letter is derived from the puzzle on the server.
  prefill_keys text[] NOT NULL DEFAULT '{}',
  revealed_keys text[] NOT NULL DEFAULT '{}',
  checks_used smallint NOT NULL DEFAULT 0,
  reveals_used smallint NOT NULL DEFAULT 0,
  chosung_used smallint NOT NULL DEFAULT 0,
  submits_used smallint NOT NULL DEFAULT 0,
  last_wrong_submit_at timestamptz,
  -- Rate-limit state for checks (kept on the row so it holds on serverless hosts).
  check_window_start timestamptz,
  check_window_count smallint NOT NULL DEFAULT 0,
  active_ms bigint NOT NULL DEFAULT 0,
  active_seconds integer GENERATED ALWAYS AS ((active_ms / 1000)::integer) STORED,
  revision bigint NOT NULL DEFAULT 0,
  last_saved_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamptz,
  CONSTRAINT uq_crossword_attempts_id_assignment UNIQUE (id, assignment_id),
  CONSTRAINT chk_crossword_attempt_cells CHECK (pg_catalog.jsonb_typeof(cells) = 'object'),
  CONSTRAINT chk_crossword_attempt_completed CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT chk_crossword_attempt_counters CHECK (
    checks_used >= 0 AND reveals_used >= 0 AND chosung_used >= 0 AND submits_used >= 0
    AND check_window_count >= 0 AND active_ms >= 0 AND revision >= 0)
);
CREATE INDEX idx_crossword_attempts_assignment ON public.crossword_attempts (assignment_id);

CREATE TRIGGER trg_crossword_attempts_updated_at
BEFORE UPDATE ON public.crossword_attempts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Who the attempt belongs to. One row today; more rows later for a shared attempt.
-- unique (assignment_id, student_id): a student has one attempt per assignment, in any mode.
CREATE TABLE public.crossword_attempt_members (
  attempt_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (attempt_id, student_id),
  FOREIGN KEY (attempt_id, assignment_id)
    REFERENCES public.crossword_attempts (id, assignment_id) ON DELETE CASCADE,
  CONSTRAINT uq_crossword_attempt_members_assignment_student UNIQUE (assignment_id, student_id)
);
CREATE INDEX idx_crossword_attempt_members_student ON public.crossword_attempt_members (student_id);

-- Erasure: deleting a student removes their membership (cascade above); when no member is left the attempt goes
-- too. With one member this is "student erased -> attempt erased" (docs/pilot/12). What a SHARED attempt does when
-- one member is erased is open governance question G4 (doc 06 §12.5): this trigger and its pgTAP case are the
-- place to change it.
CREATE FUNCTION public.fn_crossword_attempt_members_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crossword_attempt_members m WHERE m.attempt_id = OLD.attempt_id) THEN
    DELETE FROM public.crossword_attempts WHERE id = OLD.attempt_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_crossword_attempt_members_cleanup
AFTER DELETE ON public.crossword_attempt_members
FOR EACH ROW
EXECUTE FUNCTION public.fn_crossword_attempt_members_cleanup();

-- Event detail allow-list (PM 2026-10-17/18): only
--   {"scope": "cell" | "word" | "puzzle", "words": [{"number": <int>, "direction": "across" | "down"}]}
-- with at most two word references (a cell lies on at most two words). No letter, answer, cell key or other key
-- can be stored.
-- Exception (PM 2026-10-18): a 'completed' event may also carry {"wordsCompleted": <int>}, the number of words that were
-- fully correct when the student submitted, written once by the server. It is a count, never shown to the student, and
-- only allowed on kind 'completed' (chk_crossword_event_words_completed).
CREATE FUNCTION public.fn_crossword_event_detail_ok(p_detail jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_key text;
  v_word jsonb;
BEGIN
  IF p_detail IS NULL OR pg_catalog.jsonb_typeof(p_detail) <> 'object' THEN RETURN false; END IF;
  IF pg_catalog.length(p_detail::text) > 200 THEN RETURN false; END IF;
  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_detail) LOOP
    IF v_key NOT IN ('scope', 'words', 'wordsCompleted') THEN RETURN false; END IF;
  END LOOP;
  IF p_detail ? 'wordsCompleted' THEN
    IF pg_catalog.jsonb_typeof(p_detail -> 'wordsCompleted') <> 'number' OR (p_detail ->> 'wordsCompleted') !~ '^[0-9]{1,3}$' THEN
      RETURN false;
    END IF;
  END IF;
  IF p_detail ? 'scope' THEN
    IF pg_catalog.jsonb_typeof(p_detail -> 'scope') <> 'string' OR (p_detail ->> 'scope') NOT IN ('cell', 'word', 'puzzle') THEN
      RETURN false;
    END IF;
  END IF;
  IF p_detail ? 'words' THEN
    IF pg_catalog.jsonb_typeof(p_detail -> 'words') <> 'array' OR pg_catalog.jsonb_array_length(p_detail -> 'words') > 2 THEN
      RETURN false;
    END IF;
    FOR v_word IN SELECT pg_catalog.jsonb_array_elements(p_detail -> 'words') LOOP
      IF pg_catalog.jsonb_typeof(v_word) <> 'object' THEN RETURN false; END IF;
      FOR v_key IN SELECT pg_catalog.jsonb_object_keys(v_word) LOOP
        IF v_key NOT IN ('number', 'direction') THEN RETURN false; END IF;
      END LOOP;
      IF pg_catalog.jsonb_typeof(v_word -> 'number') <> 'number' OR (v_word ->> 'number') !~ '^[1-9][0-9]{0,2}$' THEN
        RETURN false;
      END IF;
      IF pg_catalog.jsonb_typeof(v_word -> 'direction') <> 'string' OR (v_word ->> 'direction') NOT IN ('across', 'down') THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;
  RETURN true;
END;
$$;

CREATE TABLE public.crossword_attempt_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES public.crossword_attempts(id) ON DELETE CASCADE,
  -- Who acted, separate from whose attempt it is. In M2-2.4 always the single member.
  actor_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  kind public.crossword_attempt_event_kind NOT NULL,
  source public.crossword_attempt_event_source NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_crossword_event_detail CHECK (public.fn_crossword_event_detail_ok(detail)),
  CONSTRAINT chk_crossword_event_words_completed CHECK (NOT (detail ? 'wordsCompleted') OR kind = 'completed'),
  CONSTRAINT chk_crossword_event_kind_source CHECK (
    (kind IN ('check', 'chosung') AND source = 'hint')
    OR (kind = 'reveal' AND source = 'reveal')
    OR (kind IN ('submit_wrong', 'completed') AND source = 'submit')
    OR (kind = 'entry' AND source IN ('manual_entry', 'autosave')))
);
CREATE INDEX idx_crossword_attempt_events_attempt ON public.crossword_attempt_events (attempt_id, created_at);

-- RLS on, no policy; no client privilege at all (defence in depth on top of "no policy").
ALTER TABLE public.crossword_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossword_attempt_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossword_attempt_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.crossword_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crossword_attempt_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crossword_attempt_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crossword_attempts TO service_role;
GRANT ALL ON public.crossword_attempt_members TO service_role;
GRANT ALL ON public.crossword_attempt_events TO service_role;

REVOKE ALL ON FUNCTION public.fn_crossword_attempt_members_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_event_detail_ok(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crossword_event_detail_ok(jsonb) TO service_role;
