-- M2-1.1: word sets and their entries (docs/m2/01-csv-content-pipeline.md §2.4, §2.5, §2.7).
-- Teachers own sets (owner_id). A set may be linked to one classroom so the classroom's owner and
-- co-teachers can see and manage it (decision D3). A set linked to an archived classroom is read-only (P2).
-- Soft delete/archive: archived_at IS NOT NULL. All writes go through the service role.

CREATE TABLE public.content_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  -- RESTRICT like classrooms.owner_id (decision P1): a teacher who owns sets cannot be deleted until the
  -- sets are transferred to another teacher (or deleted by the end-of-pilot run). See docs/pilot/12 §3.4, §4.3.
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_content_sets_owner ON public.content_sets (owner_id) WHERE archived_at IS NULL;
CREATE INDEX idx_content_sets_classroom ON public.content_sets (classroom_id) WHERE classroom_id IS NOT NULL;
-- One live title per teacher, so "the set called X" is never ambiguous.
CREATE UNIQUE INDEX uq_content_sets_owner_title_active
  ON public.content_sets (owner_id, lower(btrim(title))) WHERE archived_at IS NULL;

CREATE TRIGGER trg_content_sets_updated_at
BEFORE UPDATE ON public.content_sets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.content_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.content_sets(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  term text NOT NULL CHECK (char_length(term) BETWEEN 1 AND 60),
  definition text NOT NULL CHECK (char_length(definition) BETWEEN 1 AND 200),
  -- Grid form of the term (NFC, separators removed, Latin upper-cased). Database-level backstop for
  -- the TypeScript normaliser: whatever the app does, the generator only ever sees clean answers.
  answer text NOT NULL,
  answer_length smallint GENERATED ALWAYS AS (char_length(answer)::smallint) STORED,
  script public.content_script NOT NULL,
  normalizer_version smallint NOT NULL,
  source_line integer,
  import_batch_id uuid REFERENCES public.content_import_batches(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_batch_id uuid REFERENCES public.content_import_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  -- TypeScript bounds (answer 2..15) are tighter on purpose; these are hard physical limits.
  CONSTRAINT chk_content_entries_answer_grid_safe CHECK (answer ~ '^[가-힣A-Z0-9]+$'),
  CONSTRAINT chk_content_entries_answer_length CHECK (char_length(answer) BETWEEN 1 AND 30)
);

-- Duplicate handling: one live entry per answer per set.
CREATE UNIQUE INDEX uq_content_entries_set_answer_active
  ON public.content_entries (set_id, answer) WHERE archived_at IS NULL;
-- The generator's read path: live entries of one set in file order.
CREATE INDEX idx_content_entries_set_position
  ON public.content_entries (set_id, position) WHERE archived_at IS NULL;
CREATE INDEX idx_content_entries_import_batch ON public.content_entries (import_batch_id);

-- Closes the sets <-> batches cycle created by the previous migration.
ALTER TABLE public.content_import_batches
  ADD CONSTRAINT content_import_batches_set_id_fkey
  FOREIGN KEY (set_id) REFERENCES public.content_sets(id) ON DELETE SET NULL;

ALTER TABLE public.content_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_entries ENABLE ROW LEVEL SECURITY;

-- Set owner; the owner and the co-teachers of the linked classroom (the classroom owner lives in
-- classrooms.owner_id, not in classroom_teachers, so both are checked). Students and anon: no policy
-- => no access. Reading stays possible when the classroom is archived (archived = read-only).
-- No policy cycle: classroom_teachers is self-only and classrooms policies never read content_sets.
CREATE POLICY content_sets_select_staff ON public.content_sets
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR (
      classroom_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.classrooms c
          WHERE c.id = content_sets.classroom_id
            AND c.owner_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.classroom_teachers ct
          WHERE ct.classroom_id = content_sets.classroom_id
            AND ct.teacher_id = (SELECT auth.uid())
        )
      )
    )
  );

-- Entries inherit visibility from their set: the sub-select runs under the caller's RLS on content_sets.
CREATE POLICY content_entries_select_via_set ON public.content_entries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.content_sets s WHERE s.id = content_entries.set_id));

-- No INSERT/UPDATE/DELETE policies: all writes go through the service role (server actions + audit).
