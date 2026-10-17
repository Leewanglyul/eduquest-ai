-- M2-2.2a: enums and audit contract for crosswords (docs/m2/04-crossword-generator.md §6.1, 05-m2-2-2-teacher-review-plan.md §4.1).
-- The attempt status enum belongs to the M2-2.4 migration (student data, after the governance update).
-- Enum values only: a new enum value cannot be used in the transaction that adds it, so nothing else lives here.

CREATE TYPE public.crossword_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.crossword_level AS ENUM ('easy', 'normal', 'hard');
CREATE TYPE public.crossword_direction AS ENUM ('across', 'down');
CREATE TYPE public.crossword_assignment_status AS ENUM ('open', 'closed');

ALTER TYPE public.audit_resource ADD VALUE IF NOT EXISTS 'crossword';

ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'crossword.created';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'crossword.updated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'crossword.copied';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'crossword.published';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'crossword.assigned';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'crossword.assignment_closed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'crossword.archived';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'crossword.unarchived';
