BEGIN;
SELECT plan(11);

-- Fixtures (rolled back). Teacher t1 (owner) comes from seed.sql.
-- t2 = co-teacher of A, t3 = outsider, a1 = admin, s1 = student enrolled in A (active) and B (archived).
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000b1', 's1@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 't2@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b3', 't3@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b4', 'a1@t.invalid')
) AS v(id, email);

INSERT INTO public.profiles (id, school_id, role, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'student', 'S1'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T2'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T3'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a1', 'admin', 'A1');

INSERT INTO public.students (id, school_id, profile_id, student_no, grade)
VALUES ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000b1', '1', '1');

INSERT INTO public.classrooms (id, school_id, owner_id, name, archived_at) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'A', NULL),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'B-archived', now()),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'C-not-enrolled', NULL);

INSERT INTO public.classroom_teachers (classroom_id, teacher_id)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b2');

INSERT INTO public.classroom_enrollments (classroom_id, student_id) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1');

-- Student: only the active, non-archived, enrolled classroom is visible.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.classrooms WHERE id IN ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3')), 1, 'student sees exactly one classroom');
SELECT is((SELECT name FROM public.classrooms WHERE id IN ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3')), 'A', 'student sees only the active enrolled classroom');
SELECT is((SELECT count(*)::int FROM public.classrooms WHERE archived_at IS NOT NULL AND id IN ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3')), 0, 'student never sees archived classrooms');
SELECT is((SELECT count(*)::int FROM public.students WHERE id = '00000000-0000-4000-8000-0000000000c1'), 1, 'student sees only own student row');
RESET ROLE;

-- Owner: all own classrooms (including archived).
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.classrooms WHERE id IN ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3')), 3, 'owner sees all own classrooms');
RESET ROLE;

-- Co-teacher: only classrooms they were added to.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.classrooms WHERE id IN ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3')), 1, 'co-teacher sees only the classroom they co-teach');
SELECT is((SELECT name FROM public.classrooms WHERE id IN ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3')), 'A', 'co-teacher sees classroom A');
RESET ROLE;

-- Outsider teacher: nothing.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.classrooms WHERE id IN ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3')), 0, 'outsider teacher sees no classrooms');
RESET ROLE;

-- Admin has no direct RLS read policy: admin access goes through the service role in the app layer.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b4","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.classrooms WHERE id IN ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3')), 0, 'admin has no direct RLS read (service-role path only)');
RESET ROLE;

-- Direct client writes are denied for everyone (no INSERT/UPDATE policies).
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$UPDATE public.classrooms SET name = 'hacked' WHERE id IN ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3') RETURNING id$$,
  'owner cannot update classrooms directly with the user client');
SELECT throws_ok(
  $$INSERT INTO public.classroom_enrollments (classroom_id, student_id)
    VALUES ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1')$$,
  '42501', NULL, 'owner cannot insert enrollments directly with the user client');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
