BEGIN;
SELECT plan(12);

-- Fixture: one student account (rolled back).
INSERT INTO auth.users (id, instance_id, aud, role, email)
VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1@t.invalid');
INSERT INTO public.profiles (id, school_id, role, display_name)
VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'student', 'S1');
INSERT INTO public.students (id, school_id, profile_id, student_no, grade)
VALUES ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', '1', '1');
INSERT INTO public.student_accounts (id, student_id, username, synthetic_email)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'u1', 'u1@x.invalid');

-- Slots 1..5 are granted.
SELECT is((SELECT allowed FROM public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)), true, 'attempt 1 allowed');
SELECT is((SELECT allowed FROM public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)), true, 'attempt 2 allowed');
SELECT is((SELECT allowed FROM public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)), true, 'attempt 3 allowed');
SELECT is((SELECT allowed FROM public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)), true, 'attempt 4 allowed');
SELECT is((SELECT allowed FROM public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)), true, 'attempt 5 allowed');

-- The 6th is refused even though no lock has been written yet (all slots reserved).
SELECT is((SELECT allowed FROM public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)), false, 'attempt 6 refused: slots exhausted');

-- Failure of the final slot writes the lock.
SELECT is((SELECT locked FROM public.fn_student_login_fail('00000000-0000-4000-8000-0000000000d1', 5, 15)), true, 'failure after 5 reserved attempts locks');
SELECT ok((SELECT locked_until > now() + interval '14 minutes' FROM public.student_accounts WHERE id = '00000000-0000-4000-8000-0000000000d1'), 'locked for ~15 minutes');

-- While locked, begin is refused and reports the lock time.
SELECT ok((SELECT NOT allowed AND locked_until IS NOT NULL FROM public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)), 'locked account refused with lock time');

-- After the lock expires the window restarts at 1 attempt.
UPDATE public.student_accounts SET locked_until = now() - interval '1 minute' WHERE id = '00000000-0000-4000-8000-0000000000d1';
SELECT is((SELECT allowed FROM public.fn_student_login_begin('00000000-0000-4000-8000-0000000000d1', 5)), true, 'allowed again after lock expiry');
SELECT is((SELECT failed_attempts FROM public.student_accounts WHERE id = '00000000-0000-4000-8000-0000000000d1'), 1, 'counter restarts at 1 after expiry');

-- Only the service role may call these.
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.fn_student_login_begin(uuid,integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.fn_student_login_fail(uuid,integer,integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.fn_student_login_begin(uuid,integer)', 'EXECUTE'),
  'execute is service_role only');

SELECT * FROM finish();
ROLLBACK;
