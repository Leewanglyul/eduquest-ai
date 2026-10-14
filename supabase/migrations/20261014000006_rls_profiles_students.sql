ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY students_select_self ON public.students
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id);

CREATE POLICY student_accounts_select_self ON public.student_accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_accounts.student_id
        AND s.profile_id = (SELECT auth.uid())
    )
  );

-- audit_logs: RLS enabled with no policies => no client access; service role only.
