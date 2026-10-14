CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action public.audit_action NOT NULL,
  resource_type public.audit_resource NOT NULL,
  resource_id uuid,
  classroom_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
