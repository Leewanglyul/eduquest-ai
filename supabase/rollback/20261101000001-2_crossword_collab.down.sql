-- ROLLBACK for M2-3.4 P1 (migrations 20261101000001 and 20261101000002). NOT a migration: never applied automatically.
-- Use only with explicit PM approval, against a target named in that approval. First line of defence is the flag
-- (COLLAB_PLAY_ENABLED off): with the flag off the schema has no effect, so dropping it is rarely needed.
--
-- Safe only when no team data exists. The guard below stops (and changes nothing) if any team, team member, cell
-- writer, solve, credit or help request row exists, or any assignment is in team mode. In that case stop and get a
-- PM decision: dropping these tables would delete student data.
--
-- How to apply (repo convention, docs/m2/17 §6): copy this body into a new forward migration with a new timestamp and
-- push that, so the migration history stays linear. Do not delete rows from supabase_migrations.schema_migrations.
-- Personal play is unaffected: no existing function reads the dropped objects.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.crossword_teams)
     OR EXISTS (SELECT 1 FROM public.crossword_team_members)
     OR EXISTS (SELECT 1 FROM public.crossword_attempt_cell_writers)
     OR EXISTS (SELECT 1 FROM public.crossword_attempt_word_solves)
     OR EXISTS (SELECT 1 FROM public.crossword_attempt_word_credits)
     OR EXISTS (SELECT 1 FROM public.crossword_team_help_requests)
     OR EXISTS (SELECT 1 FROM public.crossword_assignments WHERE play_mode <> 'individual')
     OR EXISTS (SELECT 1 FROM public.crossword_attempt_members WHERE last_active_at IS NOT NULL) THEN
    RAISE EXCEPTION 'CROSSWORD_COLLAB_ROLLBACK_HAS_DATA: team data exists, stop and ask the PM' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Reverse order of creation.
DROP TABLE public.crossword_team_help_requests;
DROP TABLE public.crossword_attempt_word_credits;
DROP TABLE public.crossword_attempt_word_solves;
DROP TABLE public.crossword_attempt_cell_writers;
DROP TABLE public.crossword_team_members;
DROP TABLE public.crossword_teams;

ALTER TABLE public.crossword_attempt_members DROP COLUMN last_active_at;

DROP TRIGGER trg_crossword_assignments_mode_lock ON public.crossword_assignments;
DROP FUNCTION public.fn_crossword_assignment_mode_lock();
ALTER TABLE public.crossword_assignments DROP COLUMN play_mode;

-- Migration 1.
DROP TYPE public.crossword_play_mode;
