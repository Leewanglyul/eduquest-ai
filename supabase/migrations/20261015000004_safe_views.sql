-- Safe read models: no profile_id, usernames or synthetic emails. security_invoker => caller RLS applies.
CREATE VIEW public.v_students_safe
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.school_id,
  s.student_no,
  s.grade,
  p.display_name,
  p.status AS profile_status,
  s.created_at
FROM public.students s
JOIN public.profiles p ON p.id = s.profile_id;

CREATE VIEW public.v_classroom_activity_safe
WITH (security_invoker = true) AS
SELECT
  c.id AS classroom_id,
  c.school_id,
  c.name,
  c.archived_at,
  (SELECT count(*) FROM public.classroom_enrollments e
     WHERE e.classroom_id = c.id AND e.status = 'active')::integer AS active_student_count,
  (SELECT count(*) FROM public.classroom_teachers ct
     WHERE ct.classroom_id = c.id)::integer AS co_teacher_count,
  (SELECT max(a.created_at) FROM public.audit_logs a
     WHERE a.classroom_id = c.id) AS last_activity_at
FROM public.classrooms c;

REVOKE ALL ON public.v_students_safe FROM PUBLIC, anon;
REVOKE ALL ON public.v_classroom_activity_safe FROM PUBLIC, anon;
GRANT SELECT ON public.v_students_safe TO authenticated, service_role;
GRANT SELECT ON public.v_classroom_activity_safe TO authenticated, service_role;
