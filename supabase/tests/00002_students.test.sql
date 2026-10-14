BEGIN;
SELECT plan(5);

SELECT has_table('public', 'students', 'students table exists');
SELECT has_table('public', 'student_accounts', 'student_accounts table exists');
SELECT has_index('public', 'students', 'idx_students_school_student_no', 'school/student_no index exists');
SELECT col_is_unique('public', 'student_accounts', 'username', 'username is unique');
SELECT has_column('public', 'student_accounts', 'locked_until', 'lockout column exists');

SELECT * FROM finish();
ROLLBACK;
