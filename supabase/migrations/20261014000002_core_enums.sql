CREATE TYPE public.user_role AS ENUM ('teacher', 'student', 'admin');
CREATE TYPE public.profile_status AS ENUM ('active', 'suspended');
CREATE TYPE public.audit_resource AS ENUM ('profile', 'student', 'account', 'batch');
CREATE TYPE public.audit_action AS ENUM (
  'student.provisioned',
  'student.batch_started',
  'student.batch_completed'
);
