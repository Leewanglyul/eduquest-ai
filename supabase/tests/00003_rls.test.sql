BEGIN;
SELECT plan(4);

SELECT policies_are('public', 'profiles', ARRAY['profiles_select_self']);
SELECT policies_are('public', 'students', ARRAY['students_select_self']);
SELECT policies_are('public', 'student_accounts', ARRAY['student_accounts_select_self']);
SELECT policies_are('public', 'audit_logs', ARRAY[]::name[]);

SELECT * FROM finish();
ROLLBACK;
