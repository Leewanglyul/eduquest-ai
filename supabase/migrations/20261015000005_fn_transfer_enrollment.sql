-- Atomic enrollment transfer. service_role only; the caller (server action) passes the acting teacher/admin.
CREATE OR REPLACE FUNCTION public.fn_transfer_enrollment(
  source_classroom_id uuid,
  target_classroom_id uuid,
  student_id uuid,
  actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_role public.user_role;
  v_source public.classrooms%ROWTYPE;
  v_target public.classrooms%ROWTYPE;
  v_student_school uuid;
  v_source_enrollment uuid;
  v_target_enrollment uuid;
  v_reactivated boolean := false;
BEGIN
  IF source_classroom_id = target_classroom_id THEN
    RAISE EXCEPTION 'TRANSFER_SAME_CLASSROOM' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.role INTO v_actor_role
  FROM public.profiles p
  WHERE p.id = actor_id AND p.status = 'active';
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'TRANSFER_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- Lock both classrooms in a stable order to avoid deadlocks on concurrent opposite transfers.
  PERFORM 1 FROM public.classrooms c
  WHERE c.id IN (source_classroom_id, target_classroom_id)
  ORDER BY c.id
  FOR UPDATE;

  SELECT * INTO v_source FROM public.classrooms c WHERE c.id = source_classroom_id;
  SELECT * INTO v_target FROM public.classrooms c WHERE c.id = target_classroom_id;
  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'TRANSFER_CLASSROOM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_source.archived_at IS NOT NULL OR v_target.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'TRANSFER_CLASSROOM_ARCHIVED' USING ERRCODE = 'P0001';
  END IF;
  IF v_source.school_id <> v_target.school_id THEN
    RAISE EXCEPTION 'TRANSFER_CROSS_SCHOOL' USING ERRCODE = 'P0001';
  END IF;

  -- Owner or co-teacher of BOTH classrooms (admins bypass membership).
  IF v_actor_role <> 'admin' AND NOT (
    (v_source.owner_id = actor_id OR EXISTS (
      SELECT 1 FROM public.classroom_teachers ct
      WHERE ct.classroom_id = v_source.id AND ct.teacher_id = actor_id))
    AND
    (v_target.owner_id = actor_id OR EXISTS (
      SELECT 1 FROM public.classroom_teachers ct
      WHERE ct.classroom_id = v_target.id AND ct.teacher_id = actor_id))
  ) THEN
    RAISE EXCEPTION 'TRANSFER_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.school_id INTO v_student_school FROM public.students s WHERE s.id = fn_transfer_enrollment.student_id;
  IF v_student_school IS NULL OR v_student_school <> v_source.school_id THEN
    RAISE EXCEPTION 'TRANSFER_STUDENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT e.id INTO v_source_enrollment
  FROM public.classroom_enrollments e
  WHERE e.classroom_id = source_classroom_id
    AND e.student_id = fn_transfer_enrollment.student_id
    AND e.status = 'active'
  FOR UPDATE;
  IF v_source_enrollment IS NULL THEN
    RAISE EXCEPTION 'TRANSFER_NOT_ENROLLED' USING ERRCODE = 'P0001';
  END IF;

  SELECT e.id INTO v_target_enrollment
  FROM public.classroom_enrollments e
  WHERE e.classroom_id = target_classroom_id
    AND e.student_id = fn_transfer_enrollment.student_id
  FOR UPDATE;

  IF v_target_enrollment IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.classroom_enrollments e
               WHERE e.id = v_target_enrollment AND e.status = 'active') THEN
      RAISE EXCEPTION 'TRANSFER_ALREADY_ENROLLED' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.classroom_enrollments
    SET status = 'active', removed_at = NULL, enrolled_at = pg_catalog.timezone('utc', pg_catalog.now())
    WHERE id = v_target_enrollment;
    v_reactivated := true;
  ELSE
    INSERT INTO public.classroom_enrollments (classroom_id, student_id)
    VALUES (target_classroom_id, fn_transfer_enrollment.student_id)
    RETURNING id INTO v_target_enrollment;
  END IF;

  UPDATE public.classroom_enrollments
  SET status = 'removed', removed_at = pg_catalog.timezone('utc', pg_catalog.now())
  WHERE id = v_source_enrollment;

  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, classroom_id, metadata)
  VALUES (
    actor_id,
    'enrollment.transferred',
    'enrollment',
    v_target_enrollment,
    target_classroom_id,
    pg_catalog.jsonb_build_object(
      'sourceClassroomId', source_classroom_id,
      'targetClassroomId', target_classroom_id,
      'studentId', fn_transfer_enrollment.student_id,
      'sourceEnrollmentId', v_source_enrollment,
      'reactivated', v_reactivated
    )
  );

  RETURN v_target_enrollment;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_transfer_enrollment(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_transfer_enrollment(uuid, uuid, uuid, uuid) TO service_role;
