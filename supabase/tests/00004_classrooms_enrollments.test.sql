BEGIN;
SELECT plan(14);

-- Fixtures (rolled back). Teacher t1 comes from seed.sql; add a student, a second teacher and two classrooms.
INSERT INTO auth.users (id, instance_id, aud, role, email)
VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1@t.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't2@t.invalid');

INSERT INTO public.profiles (id, school_id, role, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'student', 'S1'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'T2');

INSERT INTO public.students (id, school_id, profile_id, student_no, grade)
VALUES ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000b1', '1', '1');

INSERT INTO public.classrooms (id, school_id, owner_id, name) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'A'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'B');

INSERT INTO public.classroom_enrollments (classroom_id, student_id)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1');

SELECT has_view('public', 'v_students_safe', 'v_students_safe exists');
SELECT has_view('public', 'v_classroom_activity_safe', 'v_classroom_activity_safe exists');
SELECT hasnt_column('public', 'v_students_safe', 'profile_id', 'safe view hides profile_id');

SELECT throws_ok(
  $$INSERT INTO public.classroom_enrollments (classroom_id, student_id)
    VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1')$$,
  '23505', NULL, 'unique(classroom_id, student_id)');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.fn_transfer_enrollment(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'authenticated cannot execute');
SELECT ok(NOT has_function_privilege('anon',
  'public.fn_transfer_enrollment(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot execute');
SELECT ok(has_function_privilege('service_role',
  'public.fn_transfer_enrollment(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'service_role can execute');

-- Non-member teacher is rejected.
SELECT throws_ok(
  $$SELECT public.fn_transfer_enrollment('00000000-0000-4000-8000-0000000000d1',
      '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1',
      '00000000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'TRANSFER_FORBIDDEN', 'non-member rejected');

-- Owner transfers.
SELECT lives_ok(
  $$SELECT public.fn_transfer_enrollment('00000000-0000-4000-8000-0000000000d1',
      '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1',
      '00000000-0000-4000-8000-000000000001')$$, 'owner transfer succeeds');

SELECT is((SELECT status::text FROM public.classroom_enrollments
  WHERE classroom_id = '00000000-0000-4000-8000-0000000000d1'), 'removed', 'source removed');
SELECT is((SELECT status::text FROM public.classroom_enrollments
  WHERE classroom_id = '00000000-0000-4000-8000-0000000000d2'), 'active', 'target active');
SELECT is((SELECT count(*)::int FROM public.audit_logs WHERE action = 'enrollment.transferred'), 1, 'audited');

-- Source no longer active => second transfer fails and changes nothing.
SELECT throws_ok(
  $$SELECT public.fn_transfer_enrollment('00000000-0000-4000-8000-0000000000d1',
      '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1',
      '00000000-0000-4000-8000-000000000001')$$,
  'P0001', 'TRANSFER_NOT_ENROLLED', 'repeat rejected');

-- Archived classroom blocks transfer.
UPDATE public.classrooms SET archived_at = now() WHERE id = '00000000-0000-4000-8000-0000000000d1';
SELECT throws_ok(
  $$SELECT public.fn_transfer_enrollment('00000000-0000-4000-8000-0000000000d2',
      '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1',
      '00000000-0000-4000-8000-000000000001')$$,
  'P0001', 'TRANSFER_CLASSROOM_ARCHIVED', 'archived rejected');

SELECT * FROM finish();
ROLLBACK;
