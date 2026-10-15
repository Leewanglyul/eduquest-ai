BEGIN;
SELECT plan(4);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'audit_action' AND e.enumlabel = 'student.password_reissued'
  ),
  'audit_action has student.password_reissued');

SELECT ok(NOT has_function_privilege('authenticated', 'public.fn_revoke_user_sessions(uuid)', 'EXECUTE'), 'authenticated cannot revoke sessions');
SELECT ok(NOT has_function_privilege('anon', 'public.fn_revoke_user_sessions(uuid)', 'EXECUTE'), 'anon cannot revoke sessions');
SELECT ok(has_function_privilege('service_role', 'public.fn_revoke_user_sessions(uuid)', 'EXECUTE'), 'service_role can revoke sessions');

SELECT * FROM finish();
ROLLBACK;
