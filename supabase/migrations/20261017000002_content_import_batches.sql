-- M2-1.1: preview -> commit ticket for CSV content imports (counterpart of account_batches).
-- Holds hashes and counts only: no terms, no definitions, and never the uploaded file.
-- The set_id foreign key is added in the next migration (content_sets does not exist yet).
CREATE TABLE public.content_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Target set for append/replace (stored at preview); NULL for 'create' until the commit.
  set_id uuid,
  mode public.content_import_mode NOT NULL,
  status public.content_import_status NOT NULL DEFAULT 'previewed',
  -- sha256 hex of the raw commit token; the raw token is never stored.
  commit_token_hash text NOT NULL,
  -- sha256 hex of mode + target + prepared rows; the commit must present identical rows.
  rows_hash text NOT NULL,
  -- sha256 hex of the uploaded bytes (re-upload detection). The file itself is not retained.
  source_sha256 text NOT NULL,
  source_bytes integer NOT NULL CHECK (source_bytes > 0),
  total_rows integer NOT NULL CHECK (total_rows > 0),
  accepted_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  archived_rows integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamptz
);

CREATE INDEX idx_content_import_batches_actor ON public.content_import_batches (actor_id, created_at DESC);
CREATE INDEX idx_content_import_batches_set ON public.content_import_batches (set_id, created_at DESC);

-- RLS enabled with no policies => service role only (same as account_batches and audit_logs).
ALTER TABLE public.content_import_batches ENABLE ROW LEVEL SECURITY;
