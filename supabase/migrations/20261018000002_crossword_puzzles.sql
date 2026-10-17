-- M2-2.2a: crossword puzzles, their words and preview tickets (docs/m2/04 §6.2, 05 §2, §6).
-- A puzzle stores its own COPY of every answer and clue (self-contained: deleting a set or an entry never
-- changes a puzzle). Versions of one puzzle form a lineage (root_id, version, supersedes_id).
-- All writes go through the service role and the functions of migration 25.

CREATE TABLE public.crossword_puzzles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  -- RESTRICT like content_sets.owner_id (decision P1): transfer puzzles before deleting a teacher.
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Provenance only: a puzzle survives the deletion of its set.
  set_id uuid REFERENCES public.content_sets(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  level public.crossword_level NOT NULL,
  settings jsonb NOT NULL,
  stats jsonb NOT NULL,
  seed bigint NOT NULL,
  generator_version smallint NOT NULL,
  placement_hash text NOT NULL,
  rows smallint NOT NULL CHECK (rows BETWEEN 2 AND 15),
  cols smallint NOT NULL CHECK (cols BETWEEN 2 AND 15),
  status public.crossword_status NOT NULL DEFAULT 'draft',
  -- Version lineage. root_id is the id of version 1 (filled by trigger for version 1).
  root_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  supersedes_id uuid REFERENCES public.crossword_puzzles(id) ON DELETE SET NULL,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_crossword_status_dates CHECK (
    (status = 'archived') = (archived_at IS NOT NULL)
    AND (status <> 'published' OR published_at IS NOT NULL)
    AND (status <> 'draft' OR published_at IS NULL)
  ),
  -- Version 1 has no predecessor. Later versions have one, except after the predecessor was deleted
  -- (supersedes_id SET NULL, end-of-pilot deletion only), when the row is kept as history.
  CONSTRAINT chk_crossword_version_parent CHECK (version > 1 OR supersedes_id IS NULL),
  CONSTRAINT uq_crossword_lineage_version UNIQUE (root_id, version)
);

-- root_id points at the first version of the lineage (itself for version 1). Deferred: the row it points at
-- can be the row being inserted.
ALTER TABLE public.crossword_puzzles
  ADD CONSTRAINT crossword_puzzles_root_id_fkey
  FOREIGN KEY (root_id) REFERENCES public.crossword_puzzles(id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.fn_crossword_set_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.root_id IS NULL THEN
    NEW.root_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE triggers run before NOT NULL is checked, so callers may omit root_id for version 1.
CREATE TRIGGER trg_crossword_puzzles_root
BEFORE INSERT ON public.crossword_puzzles
FOR EACH ROW
EXECUTE FUNCTION public.fn_crossword_set_root();

CREATE TRIGGER trg_crossword_puzzles_updated_at
BEFORE UPDATE ON public.crossword_puzzles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Lineage invariants (docs/m2/05 §2).
CREATE UNIQUE INDEX uq_crossword_one_draft_per_lineage
  ON public.crossword_puzzles (root_id) WHERE status = 'draft';
CREATE UNIQUE INDEX uq_crossword_one_published_per_lineage
  ON public.crossword_puzzles (root_id) WHERE status = 'published';
CREATE UNIQUE INDEX uq_crossword_one_live_successor
  ON public.crossword_puzzles (supersedes_id) WHERE supersedes_id IS NOT NULL AND status <> 'archived';

CREATE INDEX idx_crossword_puzzles_owner ON public.crossword_puzzles (owner_id) WHERE archived_at IS NULL;
CREATE INDEX idx_crossword_puzzles_set ON public.crossword_puzzles (set_id) WHERE set_id IS NOT NULL;
CREATE INDEX idx_crossword_puzzles_root ON public.crossword_puzzles (root_id, version);

CREATE TABLE public.crossword_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id uuid NOT NULL REFERENCES public.crossword_puzzles(id) ON DELETE CASCADE,
  number smallint NOT NULL CHECK (number > 0),
  direction public.crossword_direction NOT NULL,
  row smallint NOT NULL CHECK (row >= 0),
  col smallint NOT NULL CHECK (col >= 0),
  answer text NOT NULL CHECK (answer ~ '^[가-힣A-Z0-9]+$' AND char_length(answer) BETWEEN 1 AND 15),
  length smallint GENERATED ALWAYS AS (char_length(answer)::smallint) STORED,
  -- C1: a one-character word is a one-cell word.
  single boolean GENERATED ALWAYS AS (char_length(answer) = 1) STORED,
  clue text NOT NULL CHECK (char_length(clue) BETWEEN 1 AND 200),
  source_entry_id uuid REFERENCES public.content_entries(id) ON DELETE SET NULL,
  CONSTRAINT uq_crossword_words_number UNIQUE (puzzle_id, direction, number),
  CONSTRAINT uq_crossword_words_start UNIQUE (puzzle_id, row, col, direction),
  CONSTRAINT uq_crossword_words_answer UNIQUE (puzzle_id, answer)
);

-- Preview -> save ticket (doc 04 §4.3). Hashes and ids only: never a word, answer or clue.
CREATE TABLE public.crossword_preview_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  set_id uuid REFERENCES public.content_sets(id) ON DELETE CASCADE,
  -- sha256 hex of the raw token; the raw token is never stored.
  token_hash text NOT NULL,
  placement_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_crossword_preview_tickets_actor ON public.crossword_preview_tickets (actor_id, created_at DESC);

ALTER TABLE public.crossword_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossword_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossword_preview_tickets ENABLE ROW LEVEL SECURITY; -- no policy => service role only

-- Staff only. Students and anon have no policy, so the solution cannot be read with a student token even
-- through the REST API. The assignments table is added by the next migration; the policy that needs it is
-- created there. Here: the owner, and the owner/co-teachers of the classroom linked to the source set.
CREATE POLICY crossword_puzzles_select_owner_or_set_staff ON public.crossword_puzzles
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.content_sets s
      WHERE s.id = crossword_puzzles.set_id
        AND s.classroom_id IS NOT NULL
        AND (
          EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = s.classroom_id AND c.owner_id = (SELECT auth.uid()))
          OR EXISTS (SELECT 1 FROM public.classroom_teachers ct WHERE ct.classroom_id = s.classroom_id AND ct.teacher_id = (SELECT auth.uid()))
        )
    )
  );

-- ---------------------------------------------------------------------------------------------------------
-- Immutability (decision C4, docs/m2/05-m2-2-2-teacher-review-plan.md §4.2). Application code can have bugs, so
-- "a published puzzle never changes" is also enforced here, for every path including the service role.
-- A change means: new draft -> new version (fn_create_crossword_version).
-- ---------------------------------------------------------------------------------------------------------

-- Words can change only while their puzzle is a draft. When the puzzle row is already gone (ON DELETE CASCADE of
-- a whole puzzle, end-of-pilot deletion) there is nothing to protect and the delete goes through.
CREATE FUNCTION public.fn_crossword_words_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_puzzle_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.puzzle_id ELSE NEW.puzzle_id END;
  v_status public.crossword_status;
BEGIN
  -- The ON DELETE SET NULL of source_entry_id (an entry or its set was deleted) is the only change a frozen word allows.
  IF TG_OP = 'UPDATE' AND NEW.source_entry_id IS NULL
     AND NEW.puzzle_id = OLD.puzzle_id AND NEW.number = OLD.number AND NEW.direction = OLD.direction
     AND NEW.row = OLD.row AND NEW.col = OLD.col AND NEW.answer = OLD.answer AND NEW.clue = OLD.clue THEN
    RETURN NEW;
  END IF;
  SELECT p.status INTO v_status FROM public.crossword_puzzles p WHERE p.id = v_puzzle_id;
  IF FOUND AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'CROSSWORD_PUBLISHED_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.puzzle_id <> OLD.puzzle_id THEN
    RAISE EXCEPTION 'CROSSWORD_PUBLISHED_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_crossword_words_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.crossword_words
FOR EACH ROW
EXECUTE FUNCTION public.fn_crossword_words_immutable();

-- Once a puzzle leaves 'draft', only these may change: status (published -> archived; archived -> draft only if it was
-- never published), archived_at, updated_at, owner_id (ownership transfer, P1), and set_id / supersedes_id going to NULL
-- (the ON DELETE SET NULL actions). published_at is set once, by the publish, and never changes after.
CREATE FUNCTION public.fn_crossword_puzzles_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    -- Lineage columns never change once the row exists.
    IF NEW.root_id <> OLD.root_id OR NEW.version <> OLD.version
       OR (NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id AND NEW.supersedes_id IS NOT NULL) THEN
      RAISE EXCEPTION 'CROSSWORD_PUBLISHED_IMMUTABLE' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.school_id <> OLD.school_id OR NEW.title <> OLD.title OR NEW.level <> OLD.level
     OR NEW.settings <> OLD.settings OR NEW.stats <> OLD.stats OR NEW.seed <> OLD.seed
     OR NEW.generator_version <> OLD.generator_version OR NEW.placement_hash <> OLD.placement_hash
     OR NEW.rows <> OLD.rows OR NEW.cols <> OLD.cols
     OR NEW.root_id <> OLD.root_id OR NEW.version <> OLD.version OR NEW.created_at <> OLD.created_at
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR (NEW.set_id IS DISTINCT FROM OLD.set_id AND NEW.set_id IS NOT NULL)
     OR (NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id AND NEW.supersedes_id IS NOT NULL) THEN
    RAISE EXCEPTION 'CROSSWORD_PUBLISHED_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'published' AND NEW.status = 'archived')
      OR (OLD.status = 'archived' AND NEW.status = 'archived')
      OR (OLD.status = 'archived' AND NEW.status = 'draft' AND OLD.published_at IS NULL)
    ) THEN
      RAISE EXCEPTION 'CROSSWORD_PUBLISHED_IMMUTABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crossword_puzzles_immutable
BEFORE UPDATE ON public.crossword_puzzles
FOR EACH ROW
EXECUTE FUNCTION public.fn_crossword_puzzles_immutable();
