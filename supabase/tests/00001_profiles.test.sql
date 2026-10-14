BEGIN;
SELECT plan(3);

SELECT has_table('public', 'profiles', 'profiles table exists');
SELECT has_column('public', 'profiles', 'role', 'profiles.role exists');
SELECT col_type_is('public', 'profiles', 'role', 'user_role', 'profiles.role uses user_role enum');

SELECT * FROM finish();
ROLLBACK;
