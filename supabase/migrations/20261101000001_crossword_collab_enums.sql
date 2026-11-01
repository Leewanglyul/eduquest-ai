-- M2-3.4 P1: enum for collaboration (team) play. Gate 2 package (PM, 2026-11-01), K23.
-- Enum values only: a new enum value cannot be used in the transaction that adds it, so nothing else lives here.

-- How an assignment is played. Chosen per assignment and locked once the first attempt exists (migration 2).
CREATE TYPE public.crossword_play_mode AS ENUM ('individual', 'team');
