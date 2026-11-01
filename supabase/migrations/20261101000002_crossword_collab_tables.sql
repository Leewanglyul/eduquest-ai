-- M2-3.4 P1: schema foundation for team (collaboration) play. Gate 2 package (PM, 2026-11-01), sections 2 and 8.4.
-- STUDENT DATA. Governance: K15, K23, G1-G5, decisions #1-#4, E-1, E-3 (modified), E-8 (b). Pilot governance update
-- (#6) is still open, so nothing here may be used with real students yet.
--
-- Schema only: no play function, API, UI or flag changes. Applied with no team rows, personal play is unchanged
-- (every assignment is 'individual').
--
-- Shape rules:
--   * a team attempt is still one crossword_attempts row; "whose attempt" stays the member table (one row per
--     teammate), so the existing play functions, limits and the member cleanup trigger keep working;
--   * no letter, answer, clue text or free text is stored in any new table;
--   * who wrote a cell keeps only the LAST writer (no history), and a word solve names no student: credit for a
--     solve is its own table so that erasing a student removes their credit and keeps the solve (G4);
--   * help requests are per team and never name the student who asked (decision #3, G2).
-- Erasure (G4 keep-and-detach): deleting a student removes their member, team-member and credit rows and blanks
-- their cell-writer rows; the team attempt and its letters stay. When the last member goes, the existing cleanup
-- trigger deletes the attempt and everything below it cascades. All of this is FK actions or the existing SECURITY
-- DEFINER trigger, so it also holds when the cascade starts from GoTrue (supabase_auth_admin).
-- RLS is enabled with NO policy and every client privilege is revoked, as for the attempt tables.

-- ---------------------------------------------------------------------------------------------------------
-- Play mode (K23)
-- ---------------------------------------------------------------------------------------------------------

ALTER TABLE public.crossword_assignments
  ADD COLUMN play_mode public.crossword_play_mode NOT NULL DEFAULT 'individual';

-- The mode is locked once any attempt exists for the assignment. Before that the teacher may still change it.
CREATE FUNCTION public.fn_crossword_assignment_mode_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.crossword_attempts a WHERE a.assignment_id = OLD.id) THEN
    RAISE EXCEPTION 'CROSSWORD_PLAY_MODE_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_crossword_assignments_mode_lock
BEFORE UPDATE OF play_mode ON public.crossword_assignments
FOR EACH ROW
WHEN (OLD.play_mode IS DISTINCT FROM NEW.play_mode)
EXECUTE FUNCTION public.fn_crossword_assignment_mode_lock();

-- Last activity per member, for the teacher's per-student view. Written by the team save function (P3).
ALTER TABLE public.crossword_attempt_members ADD COLUMN last_active_at timestamptz;

-- ---------------------------------------------------------------------------------------------------------
-- Teams (K15: one grid per team of 3-4; the size rule is checked by the team setup functions, P2)
-- ---------------------------------------------------------------------------------------------------------

CREATE TABLE public.crossword_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.crossword_assignments(id) ON DELETE CASCADE,
  label text NOT NULL,
  -- NULL until the team starts; set back to NULL if the attempt is removed (last member erased).
  attempt_id uuid,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_crossword_teams_id_assignment UNIQUE (id, assignment_id),
  CONSTRAINT uq_crossword_teams_assignment_label UNIQUE (assignment_id, label),
  CONSTRAINT uq_crossword_teams_attempt UNIQUE (attempt_id),
  CONSTRAINT chk_crossword_teams_label CHECK (pg_catalog.char_length(label) BETWEEN 1 AND 20),
  -- The attempt must belong to the same assignment as the team.
  CONSTRAINT fk_crossword_teams_attempt FOREIGN KEY (attempt_id, assignment_id)
    REFERENCES public.crossword_attempts (id, assignment_id) ON DELETE SET NULL (attempt_id)
);

-- unique (assignment_id, student_id): a student is in at most one team per assignment.
CREATE TABLE public.crossword_team_members (
  team_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (team_id, student_id),
  FOREIGN KEY (team_id, assignment_id)
    REFERENCES public.crossword_teams (id, assignment_id) ON DELETE CASCADE,
  CONSTRAINT uq_crossword_team_members_assignment_student UNIQUE (assignment_id, student_id)
);
CREATE INDEX idx_crossword_team_members_student ON public.crossword_team_members (student_id);

-- ---------------------------------------------------------------------------------------------------------
-- Who wrote a cell, which words are solved, who gets credit (E-1 (b), E-3 modified, E-8 (b))
-- ---------------------------------------------------------------------------------------------------------

-- The last writer of each typed cell: one row per cell, no history. The save that clears a cell deletes its row.
-- Students only ever learn "not my cell" from this (E-3); teachers see counts.
CREATE TABLE public.crossword_attempt_cell_writers (
  attempt_id uuid NOT NULL REFERENCES public.crossword_attempts(id) ON DELETE CASCADE,
  cell_key text NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  written_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (attempt_id, cell_key),
  CONSTRAINT chk_crossword_cell_writers_key CHECK (cell_key ~ '^[0-9]{1,2},[0-9]{1,2}$')
);
CREATE INDEX idx_crossword_cell_writers_student ON public.crossword_attempt_cell_writers (student_id);

-- One row per solved word. Names no student, so it survives any erasure.
CREATE TABLE public.crossword_attempt_word_solves (
  attempt_id uuid NOT NULL REFERENCES public.crossword_attempts(id) ON DELETE CASCADE,
  number smallint NOT NULL CHECK (number > 0),
  direction public.crossword_direction NOT NULL,
  solved_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (attempt_id, number, direction)
);

-- Credit for a solve: the writers of the word's cells at solve time, recorded once (E-8 (b)). At most
-- words x members rows per attempt. Prefilled and revealed cells have no writer and give no credit.
CREATE TABLE public.crossword_attempt_word_credits (
  attempt_id uuid NOT NULL,
  number smallint NOT NULL,
  direction public.crossword_direction NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY (attempt_id, number, direction, student_id),
  FOREIGN KEY (attempt_id, number, direction)
    REFERENCES public.crossword_attempt_word_solves (attempt_id, number, direction) ON DELETE CASCADE
);
CREATE INDEX idx_crossword_word_credits_student ON public.crossword_attempt_word_credits (student_id);

-- ---------------------------------------------------------------------------------------------------------
-- Help requests (decision #3, G2: one fixed button, per team, no student, no free text)
-- ---------------------------------------------------------------------------------------------------------

CREATE TABLE public.crossword_team_help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.crossword_teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  resolved_at timestamptz,
  -- The teacher who marked it handled.
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_crossword_help_resolved CHECK (resolved_by IS NULL OR resolved_at IS NOT NULL),
  CONSTRAINT chk_crossword_help_order CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);
CREATE INDEX idx_crossword_help_requests_team ON public.crossword_team_help_requests (team_id, created_at);

-- ---------------------------------------------------------------------------------------------------------
-- Access: RLS on, no policy; no client privilege at all. Service-role functions only (P2-P4).
-- ---------------------------------------------------------------------------------------------------------

ALTER TABLE public.crossword_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossword_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossword_attempt_cell_writers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossword_attempt_word_solves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossword_attempt_word_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossword_team_help_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.crossword_teams FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crossword_team_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crossword_attempt_cell_writers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crossword_attempt_word_solves FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crossword_attempt_word_credits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crossword_team_help_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crossword_teams TO service_role;
GRANT ALL ON public.crossword_team_members TO service_role;
GRANT ALL ON public.crossword_attempt_cell_writers TO service_role;
GRANT ALL ON public.crossword_attempt_word_solves TO service_role;
GRANT ALL ON public.crossword_attempt_word_credits TO service_role;
GRANT ALL ON public.crossword_team_help_requests TO service_role;

REVOKE ALL ON FUNCTION public.fn_crossword_assignment_mode_lock() FROM PUBLIC, anon, authenticated;
