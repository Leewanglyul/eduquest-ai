-- M1: classrooms and co-teachers. Owner lives on classrooms.owner_id; co-teachers in classroom_teachers.
-- Archive state: archived_at IS NOT NULL.
CREATE TABLE public.classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_classrooms_owner ON public.classrooms (owner_id);
CREATE INDEX idx_classrooms_school_active ON public.classrooms (school_id) WHERE archived_at IS NULL;

CREATE TRIGGER trg_classrooms_updated_at
BEFORE UPDATE ON public.classrooms
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.classroom_teachers (
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (classroom_id, teacher_id)
);

CREATE INDEX idx_classroom_teachers_teacher ON public.classroom_teachers (teacher_id);

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_teachers ENABLE ROW LEVEL SECURITY;

-- classroom_teachers: a teacher sees only their own memberships (no cross-table reference => no policy recursion).
CREATE POLICY classroom_teachers_select_self ON public.classroom_teachers
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = teacher_id);

-- classrooms: owners and co-teachers always. Student visibility is added with the enrollments migration.
CREATE POLICY classrooms_select_staff ON public.classrooms
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.classroom_teachers ct
      WHERE ct.classroom_id = classrooms.id
        AND ct.teacher_id = (SELECT auth.uid())
    )
  );

-- All writes go through the service role (server actions + audit).
