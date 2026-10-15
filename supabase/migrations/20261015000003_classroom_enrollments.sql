-- M1: enrollments. A student may belong to many active classrooms; removed rows are kept so they can be reactivated.
CREATE TYPE public.enrollment_status AS ENUM ('active', 'removed');

CREATE TABLE public.classroom_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status public.enrollment_status NOT NULL DEFAULT 'active',
  enrolled_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  removed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_classroom_enrollments_classroom_student UNIQUE (classroom_id, student_id),
  CONSTRAINT chk_enrollment_removed_at CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);

CREATE INDEX idx_classroom_enrollments_student_active
  ON public.classroom_enrollments (student_id) WHERE status = 'active';

CREATE TRIGGER trg_classroom_enrollments_updated_at
BEFORE UPDATE ON public.classroom_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.classroom_enrollments ENABLE ROW LEVEL SECURITY;

-- Students see only their own active enrollments.
CREATE POLICY classroom_enrollments_select_self ON public.classroom_enrollments
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = classroom_enrollments.student_id
        AND s.profile_id = (SELECT auth.uid())
    )
  );

-- Students see a classroom only while it is not archived and they are actively enrolled.
CREATE POLICY classrooms_select_enrolled_student ON public.classrooms
  FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.classroom_enrollments e
      JOIN public.students s ON s.id = e.student_id
      WHERE e.classroom_id = classrooms.id
        AND e.status = 'active'
        AND s.profile_id = (SELECT auth.uid())
    )
  );
