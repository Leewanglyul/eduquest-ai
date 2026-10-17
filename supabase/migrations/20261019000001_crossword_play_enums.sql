-- M2-2.4a F1: enums for student crossword play (docs/m2/07-m2-2-4-student-play-plan.md B.1,
-- docs/m2/08-m2-2-4a-student-play-foundation-plan.md B).
-- Enum values only: a new enum value cannot be used in the transaction that adds it, so nothing else lives here.

CREATE TYPE public.crossword_attempt_status AS ENUM ('in_progress', 'completed');

-- What happened. 'entry' is reserved: the F1 functions never write it (no per-save event, data minimisation).
CREATE TYPE public.crossword_attempt_event_kind AS ENUM ('entry', 'check', 'chosung', 'reveal', 'submit_wrong', 'completed');

-- Where it came from, kept separate from the kind for later learning analytics (PM, 2026-10-18).
-- 'manual_entry' and 'autosave' are reserved for entry events; hint = check and chosung, reveal, submit.
CREATE TYPE public.crossword_attempt_event_source AS ENUM ('manual_entry', 'hint', 'reveal', 'autosave', 'submit');
