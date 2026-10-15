BEGIN;
SELECT plan(9);

-- Fixture: one student account (rolled back).
INSERT INTO auth.users (id, instance_id, aud, role, email)
VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1@t.invalid');
INSERT INTO public.profiles (id, school_id, role, display_name)
VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'student', 'S1');
INSERT INTO public.students (id, school_id, profile_id, student_no, grade)
VALUES ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', '1', '1');
INSERT INTO public.student_accounts (id, student_id, username, synthetic_email)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'u1', 'u1@x.invalid');

-- Reserve three attempts, then give them back one by one.
SELECT public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5);
SELECT public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5);
SELECT public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5);
SELECT is((SELECT failed_attempts FROM public.student_accounts WHERE id = '00000000-0000-4000-8000-0000000000d1'), 3, 'three attempts reserved');

SELECT public.fn_student_login_release('00000000-0000-4000-8000-0000000000d1');
SELECT is((SELECT failed_attempts FROM public.student_accounts WHERE id = '00000000-0000-4000-8000-0000000000d1'), 2, 'release gives one slot back');

SELECT public.fn_student_login_release('00000000-0000-4000-8000-0000000000d1');
SELECT public.fn_student_login_release('00000000-0000-4000-8000-0000000000d1');
SELECT public.fn_student_login_release('00000000-0000-4000-8000-0000000000d1');
SELECT is((SELECT failed_attempts FROM public.student_accounts WHERE id = '00000000-0000-4000-8000-0000000000d1'), 0, 'never goes below zero');

-- A refunded window behaves like a fresh one: five more attempts are allowed, the sixth is refused.
SELECT is((SELECT count(*)::int FROM (SELECT (public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)).allowed AS ok FROM generate_series(1, 5)) t WHERE ok), 5, 'five attempts allowed after refunds');
SELECT is((SELECT allowed FROM public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)), false, 'sixth attempt refused');

-- The final credential failure locks; release must NOT undo or weaken an active lock.
SELECT public.fn_student_login_fail('00000000-0000-4000-8000-0000000000d1', 5, 15);
SELECT public.fn_student_login_release('00000000-0000-4000-8000-0000000000d1');
SELECT is((SELECT failed_attempts FROM public.student_accounts WHERE id = '00000000-0000-4000-8000-0000000000d1'), 5, 'release is a no-op while locked');
SELECT ok((SELECT locked_until > now() FROM public.student_accounts WHERE id = '00000000-0000-4000-8000-0000000000d1'), 'the lock is still active');

-- Only the service role may call it.
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.fn_student_login_release(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.fn_student_login_release(uuid)', 'EXECUTE'),
  'anon and authenticated cannot execute');
SELECT ok(has_function_privilege('service_role', 'public.fn_student_login_release(uuid)', 'EXECUTE'), 'service_role can execute');

SELECT * FROM finish();
ROLLBACK;
