-- ISSUE-006: batch student provisioning (preview -> commit with single-use token).
CREATE TYPE public.account_batch_status AS ENUM ('previewed', 'running', 'completed', 'expired');

CREATE TABLE public.account_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.account_batch_status NOT NULL DEFAULT 'previewed',
  -- sha256 hex of the raw commit token; the raw token is never stored.
  commit_token_hash text NOT NULL,
  -- sha256 hex of the canonical valid-row list; commit must present identical rows.
  rows_hash text NOT NULL,
  total_rows integer NOT NULL CHECK (total_rows > 0),
  succeeded_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamptz
);

CREATE INDEX idx_account_batches_actor ON public.account_batches (actor_id, created_at DESC);

-- RLS enabled with no policies => service role only (same as audit_logs).
ALTER TABLE public.account_batches ENABLE ROW LEVEL SECURITY;
