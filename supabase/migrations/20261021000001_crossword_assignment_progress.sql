-- TV-1: minimal teacher visibility of Student Play progress (docs/m2/14, reviewed in docs/m2/16).
--
-- One read function, no table, enum, trigger or policy. The attempt tables keep RLS on with no policy and no client
-- privilege: a teacher reads progress only through this function, called by server code with the service role, so the
-- access control is the check inside the function.
--
-- Who may read (PM 2026-10-20, classroom-scoped): the classroom's owner, a co-teacher of that classroom, and the school's
-- admin (read-only: the function writes nothing). Owning or managing the PUZZLE is not enough: fn_crossword_actor_manages
-- is puzzle-level and would show a teacher the students of a classroom they have nothing to do with, so it is not used.
-- An unknown assignment id and one the actor may not read raise the same CROSSWORD_NOT_FOUND, so a guessed id learns nothing.
--
-- What it returns (the result type is the allow-list): per active enrolled student of the assignment's classroom the
-- student number, name, state, counts and times. NEVER the typed letters (cells), the prefilled or revealed keys, event
-- detail, answers or clues.
--
-- SECURITY INVOKER like the play functions: the caller is service_role, which already has the table rights.
CREATE FUNCTION public.fn_crossword_assignment_progress(
  p_actor_id uuid,
  p_school_id uuid,
  p_assignment_id uuid
)
RETURNS TABLE (
  student_id uuid,
  student_no text,
  display_name text,
  state text,
  filled_count integer,
  total_cells integer,
  last_saved_at timestamptz,
  completed_at timestamptz,
  checks_used integer,
  reveals_used integer,
  chosung_used integer,
  wrong_submits integer
)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  v_role public.user_role;
  v_classroom uuid;
  v_puzzle uuid;
  v_total integer;
BEGIN
  -- Active teacher or admin of this school, else CROSSWORD_FORBIDDEN.
  v_role := public.fn_crossword_actor_role(p_actor_id, p_school_id);

  -- Classroom-level authorization: owner, co-teacher of THIS classroom, or admin of the school.
  SELECT x.classroom_id, x.puzzle_id INTO v_classroom, v_puzzle
  FROM public.crossword_assignments x
  JOIN public.classrooms c ON c.id = x.classroom_id AND c.school_id = p_school_id
  WHERE x.id = p_assignment_id
    AND (
      v_role = 'admin'
      OR c.owner_id = p_actor_id
      OR EXISTS (
        SELECT 1 FROM public.classroom_teachers ct
        WHERE ct.classroom_id = c.id AND ct.teacher_id = p_actor_id)
    );
  IF v_classroom IS NULL THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Cells of the puzzle: computed once, not per student.
  SELECT pg_catalog.count(DISTINCT wc.key)::integer INTO v_total
  FROM public.fn_crossword_play_wordcells(v_puzzle) wc;

  RETURN QUERY
  SELECT
    s.id,
    s.student_no,
    p.display_name,
    CASE WHEN att.id IS NULL THEN 'not_started' ELSE att.status::text END,
    -- Same expression as the student's own list (fn_crossword_play_list): counts only, no keys leave.
    CASE WHEN att.id IS NULL THEN 0 ELSE (
      SELECT pg_catalog.count(*)::integer FROM (
        SELECT pg_catalog.jsonb_object_keys(att.cells) AS k
        UNION SELECT pg_catalog.unnest(att.prefill_keys)
        UNION SELECT pg_catalog.unnest(att.revealed_keys)) u) END,
    v_total,
    att.last_saved_at,
    att.completed_at,
    COALESCE(att.checks_used, 0)::integer,
    COALESCE(att.reveals_used, 0)::integer,
    COALESCE(att.chosung_used, 0)::integer,
    -- submits_used is incremented only by a wrong submit (together with its submit_wrong event); a completing submit
    -- returns before the counter, so this is the number of wrong submits.
    COALESCE(att.submits_used, 0)::integer
  FROM public.classroom_enrollments en
  JOIN public.students s ON s.id = en.student_id AND s.school_id = p_school_id
  JOIN public.profiles p ON p.id = s.profile_id
  LEFT JOIN public.crossword_attempt_members m ON m.assignment_id = p_assignment_id AND m.student_id = s.id
  LEFT JOIN public.crossword_attempts att ON att.id = m.attempt_id
  WHERE en.classroom_id = v_classroom AND en.status = 'active'
  ORDER BY s.student_no, p.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_crossword_assignment_progress(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crossword_assignment_progress(uuid, uuid, uuid) TO service_role;
