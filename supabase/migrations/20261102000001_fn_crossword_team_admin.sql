-- M2-3.4 P2 migration A: teacher functions for team (collaboration) play. P2 implementation package (PM 2026-11-01),
-- decisions D-1 to D-3, D-9, D-10.
--
-- Who may manage teams (D-1): the classroom's owner and its co-teachers. The school's admin may READ the team list but
-- not change it. Unknown ids and forbidden ids raise the same CROSSWORD_NOT_FOUND, so a guessed id learns nothing.
-- Team size (D-2): at most 4 actively enrolled members, enforced; fewer than 3 is a warning on the list only.
-- After the team's attempt exists (D-3): adding a late student is allowed, removing or moving a student out is not, and
-- the team cannot be deleted. The mode lock itself is the P1 trigger (CROSSWORD_PLAY_MODE_LOCKED).
--
-- Locking: every write locks the assignment row (FOR UPDATE). fn_crossword_play_start takes FOR SHARE on the same row,
-- so a team change and a student start never interleave.
--
-- Not audited: audit_action is an enum without team values, and adding values is a schema change outside P2 (open
-- item for the PM). No function here reads or returns letters, answers, solves or credits.
-- Error codes: CROSSWORD_NOT_FOUND, CROSSWORD_FORBIDDEN (not active staff of the school), CROSSWORD_BAD_MODE,
-- CROSSWORD_TEAMS_EXIST, CROSSWORD_PLAY_MODE_LOCKED, CROSSWORD_NOT_TEAM_MODE, CROSSWORD_ASSIGNMENT_NOT_OPEN,
-- CROSSWORD_BAD_LABEL, CROSSWORD_TEAM_LABEL_TAKEN, CROSSWORD_TEAM_STARTED, CROSSWORD_TEAM_FULL.

-- INTERNAL. The assignment row when the actor may manage (p_write) or read its teams; the row is locked on write.
CREATE FUNCTION public.fn_crossword_team_actor_ok(p_actor_id uuid, p_school_id uuid, p_assignment_id uuid, p_write boolean)
RETURNS public.crossword_assignments
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
  r public.crossword_assignments;
BEGIN
  v_role := public.fn_crossword_actor_role(p_actor_id, p_school_id);

  SELECT x.* INTO r
  FROM public.crossword_assignments x
  JOIN public.classrooms c ON c.id = x.classroom_id AND c.school_id = p_school_id
  WHERE x.id = p_assignment_id
    AND ((v_role = 'admin' AND NOT p_write)
      OR c.owner_id = p_actor_id
      OR EXISTS (SELECT 1 FROM public.classroom_teachers ct WHERE ct.classroom_id = c.id AND ct.teacher_id = p_actor_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  IF p_write THEN
    SELECT x.* INTO r FROM public.crossword_assignments x WHERE x.id = p_assignment_id FOR UPDATE;
  END IF;
  RETURN r;
END;
$$;

-- INTERNAL. The team row (locked) and its assignment row (locked by the actor check, write mode).
CREATE FUNCTION public.fn_crossword_team_for_write(p_actor_id uuid, p_school_id uuid, p_team_id uuid)
RETURNS public.crossword_teams
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_assignment uuid;
  t public.crossword_teams;
BEGIN
  SELECT x.assignment_id INTO v_assignment FROM public.crossword_teams x WHERE x.id = p_team_id;
  IF v_assignment IS NULL THEN RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.fn_crossword_team_actor_ok(p_actor_id, p_school_id, v_assignment, true);
  SELECT x.* INTO t FROM public.crossword_teams x WHERE x.id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  RETURN t;
END;
$$;

-- Set the play mode. Same mode again is a no-op. team -> individual is refused while teams exist; any change after the
-- first attempt is refused by the P1 trigger.
CREATE FUNCTION public.fn_set_crossword_assignment_mode(p_actor_id uuid, p_school_id uuid, p_assignment_id uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_assignments;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('individual', 'team') THEN
    RAISE EXCEPTION 'CROSSWORD_BAD_MODE' USING ERRCODE = 'P0001';
  END IF;
  r := public.fn_crossword_team_actor_ok(p_actor_id, p_school_id, p_assignment_id, true);

  IF r.play_mode::text <> p_mode THEN
    IF p_mode = 'individual' AND EXISTS (SELECT 1 FROM public.crossword_teams t WHERE t.assignment_id = r.id) THEN
      RAISE EXCEPTION 'CROSSWORD_TEAMS_EXIST' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.crossword_assignments x SET play_mode = p_mode::public.crossword_play_mode WHERE x.id = r.id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('assignmentId', r.id, 'playMode', p_mode);
END;
$$;

CREATE FUNCTION public.fn_crossword_team_create(p_actor_id uuid, p_school_id uuid, p_assignment_id uuid, p_label text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.crossword_assignments;
  v_label text := pg_catalog.btrim(COALESCE(p_label, ''));
  v_id uuid;
BEGIN
  r := public.fn_crossword_team_actor_ok(p_actor_id, p_school_id, p_assignment_id, true);
  IF r.play_mode <> 'team' THEN RAISE EXCEPTION 'CROSSWORD_NOT_TEAM_MODE' USING ERRCODE = 'P0001'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'CROSSWORD_ASSIGNMENT_NOT_OPEN' USING ERRCODE = 'P0001'; END IF;
  IF pg_catalog.char_length(v_label) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'CROSSWORD_BAD_LABEL' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crossword_teams t WHERE t.assignment_id = r.id AND t.label = v_label) THEN
    RAISE EXCEPTION 'CROSSWORD_TEAM_LABEL_TAKEN' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.crossword_teams (assignment_id, label, created_by)
  VALUES (r.id, v_label, p_actor_id)
  RETURNING id INTO v_id;
  RETURN pg_catalog.jsonb_build_object('teamId', v_id, 'label', v_label);
END;
$$;

-- Only before the team's attempt exists (D-3). Its member rows go with it.
CREATE FUNCTION public.fn_crossword_team_delete(p_actor_id uuid, p_school_id uuid, p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  t public.crossword_teams;
BEGIN
  t := public.fn_crossword_team_for_write(p_actor_id, p_school_id, p_team_id);
  IF t.attempt_id IS NOT NULL THEN RAISE EXCEPTION 'CROSSWORD_TEAM_STARTED' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.crossword_teams x WHERE x.id = t.id;
  RETURN pg_catalog.jsonb_build_object('teamId', t.id);
END;
$$;

-- Add a student to a team, or move them from another team of the same assignment. Adding to a started team is allowed
-- (late joiner, D-3); moving out of a started team is not. At most 4 actively enrolled members (D-2). The same team
-- again is a no-op.
CREATE FUNCTION public.fn_crossword_team_assign(p_actor_id uuid, p_school_id uuid, p_team_id uuid, p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  t public.crossword_teams;
  r public.crossword_assignments;
  v_from public.crossword_teams;
  v_size integer;
BEGIN
  t := public.fn_crossword_team_for_write(p_actor_id, p_school_id, p_team_id);
  SELECT x.* INTO r FROM public.crossword_assignments x WHERE x.id = t.assignment_id;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'CROSSWORD_ASSIGNMENT_NOT_OPEN' USING ERRCODE = 'P0001'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.classroom_enrollments en
    JOIN public.students s ON s.id = en.student_id AND s.school_id = p_school_id
    WHERE en.classroom_id = r.classroom_id AND en.student_id = p_student_id AND en.status = 'active') THEN
    RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT x.* INTO v_from
  FROM public.crossword_team_members tm JOIN public.crossword_teams x ON x.id = tm.team_id
  WHERE tm.assignment_id = r.id AND tm.student_id = p_student_id
  FOR UPDATE OF x;
  IF FOUND AND v_from.id = t.id THEN
    RETURN pg_catalog.jsonb_build_object('teamId', t.id, 'studentId', p_student_id, 'moved', false);
  END IF;
  IF FOUND AND v_from.attempt_id IS NOT NULL THEN
    RAISE EXCEPTION 'CROSSWORD_TEAM_STARTED' USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_size
  FROM public.crossword_team_members tm
  JOIN public.classroom_enrollments en ON en.classroom_id = r.classroom_id AND en.student_id = tm.student_id AND en.status = 'active'
  WHERE tm.team_id = t.id;
  IF v_size >= 4 THEN RAISE EXCEPTION 'CROSSWORD_TEAM_FULL' USING ERRCODE = 'P0001'; END IF;

  IF v_from.id IS NOT NULL THEN
    UPDATE public.crossword_team_members tm SET team_id = t.id, joined_at = pg_catalog.timezone('utc', pg_catalog.now())
    WHERE tm.assignment_id = r.id AND tm.student_id = p_student_id;
  ELSE
    INSERT INTO public.crossword_team_members (team_id, assignment_id, student_id) VALUES (t.id, r.id, p_student_id);
  END IF;
  RETURN pg_catalog.jsonb_build_object('teamId', t.id, 'studentId', p_student_id, 'moved', v_from.id IS NOT NULL);
END;
$$;

-- Only before the team's attempt exists (D-3). A student who is not on the team is a no-op (removed = false).
CREATE FUNCTION public.fn_crossword_team_unassign(p_actor_id uuid, p_school_id uuid, p_team_id uuid, p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  t public.crossword_teams;
  v_n integer;
BEGIN
  t := public.fn_crossword_team_for_write(p_actor_id, p_school_id, p_team_id);
  IF t.attempt_id IS NOT NULL THEN RAISE EXCEPTION 'CROSSWORD_TEAM_STARTED' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.crossword_team_members tm WHERE tm.team_id = t.id AND tm.student_id = p_student_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('teamId', t.id, 'studentId', p_student_id, 'removed', v_n > 0);
END;
$$;

-- Teams of an assignment with their actively enrolled members, plus one row per actively enrolled student without a
-- team (team columns NULL). A team with no member appears once with NULL student columns. Admin may read (D-1).
-- under_min is the D-2 warning. Never letters, cells, solves or credits.
CREATE FUNCTION public.fn_crossword_team_list(p_actor_id uuid, p_school_id uuid, p_assignment_id uuid)
RETURNS TABLE (
  team_id uuid, label text, started boolean, member_count integer, under_min boolean, help_open boolean,
  student_id uuid, student_no text, display_name text)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  r public.crossword_assignments;
BEGIN
  r := public.fn_crossword_team_actor_ok(p_actor_id, p_school_id, p_assignment_id, false);

  RETURN QUERY
  WITH active AS (
    SELECT s.id, s.student_no, p.display_name
    FROM public.classroom_enrollments en
    JOIN public.students s ON s.id = en.student_id AND s.school_id = p_school_id
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE en.classroom_id = r.classroom_id AND en.status = 'active'),
  teams AS (
    SELECT t.id, t.label, t.attempt_id IS NOT NULL AS started,
           (SELECT pg_catalog.count(*)::integer FROM public.crossword_team_members tm JOIN active a ON a.id = tm.student_id
            WHERE tm.team_id = t.id) AS n,
           EXISTS (SELECT 1 FROM public.crossword_team_help_requests h WHERE h.team_id = t.id AND h.resolved_at IS NULL) AS help
    FROM public.crossword_teams t WHERE t.assignment_id = r.id)
  SELECT t.id, t.label, t.started, t.n, t.n < 3, t.help, a.id, a.student_no, a.display_name
  FROM teams t
  LEFT JOIN public.crossword_team_members tm ON tm.team_id = t.id
  LEFT JOIN active a ON a.id = tm.student_id
  WHERE tm.student_id IS NULL OR a.id IS NOT NULL
  UNION ALL
  SELECT NULL, NULL, NULL, NULL, NULL, NULL, a.id, a.student_no, a.display_name
  FROM active a
  WHERE NOT EXISTS (SELECT 1 FROM public.crossword_team_members tm WHERE tm.assignment_id = r.id AND tm.student_id = a.id)
  ORDER BY 2 NULLS LAST, 8, 9;
END;
$$;

-- Resolve a help request of a team of a classroom the actor manages (D-1). Resolving again returns the first resolution.
CREATE FUNCTION public.fn_crossword_team_help_resolve(p_actor_id uuid, p_school_id uuid, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_assignment uuid;
  h public.crossword_team_help_requests;
BEGIN
  SELECT t.assignment_id INTO v_assignment
  FROM public.crossword_team_help_requests x JOIN public.crossword_teams t ON t.id = x.team_id
  WHERE x.id = p_request_id;
  IF v_assignment IS NULL THEN RAISE EXCEPTION 'CROSSWORD_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.fn_crossword_team_actor_ok(p_actor_id, p_school_id, v_assignment, true);

  SELECT x.* INTO h FROM public.crossword_team_help_requests x WHERE x.id = p_request_id FOR UPDATE;
  IF h.resolved_at IS NULL THEN
    UPDATE public.crossword_team_help_requests x
    SET resolved_at = pg_catalog.now(), resolved_by = p_actor_id
    WHERE x.id = h.id
    RETURNING * INTO h;
  END IF;
  RETURN pg_catalog.jsonb_build_object('requestId', h.id, 'resolvedAt', h.resolved_at);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_crossword_team_actor_ok(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_for_write(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_crossword_assignment_mode(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_create(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_delete(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_assign(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_unassign(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_list(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_crossword_team_help_resolve(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_crossword_team_actor_ok(uuid, uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_for_write(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_set_crossword_assignment_mode(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_create(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_delete(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_assign(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_unassign(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_list(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_crossword_team_help_resolve(uuid, uuid, uuid) TO service_role;
