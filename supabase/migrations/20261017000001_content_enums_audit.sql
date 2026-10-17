-- M2-1.1: enums and audit contract for the CSV content pipeline (docs/m2/01-csv-content-pipeline.md §2.3, §2.10).
-- Enum values only: a new enum value cannot be used in the transaction that adds it, so nothing else lives here.

CREATE TYPE public.content_import_mode AS ENUM ('create', 'append', 'replace');
CREATE TYPE public.content_import_status AS ENUM ('previewed', 'completed', 'expired');
CREATE TYPE public.content_script AS ENUM ('hangul', 'latin', 'digit', 'mixed');

ALTER TYPE public.audit_resource ADD VALUE IF NOT EXISTS 'content_set';

ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'content_set.created';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'content_set.updated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'content_set.archived';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'content_set.unarchived';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'content_set.import_completed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'content_set.import_rejected';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'content_set.exported';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'content_entry.updated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'content_entry.archived';
