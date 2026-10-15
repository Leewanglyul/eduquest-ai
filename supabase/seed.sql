-- Local development seed. NEVER run against production.
-- Teacher: teacher@example.com / DevTeacher#12345
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING / DO UPDATE).

DO $$
DECLARE
  v_user_id   uuid := '00000000-0000-4000-8000-000000000001';
  v_school_id uuid := '00000000-0000-4000-8000-0000000000a1';
  v_email     text := 'teacher@example.com';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt('DevTeacher#12345', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id, v_user_id::text, 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', v_email,
                       'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  INSERT INTO public.profiles (id, school_id, role, display_name, status)
  VALUES (v_user_id, v_school_id, 'teacher', 'Dev Teacher', 'active')
  ON CONFLICT (id) DO UPDATE
    SET role = 'teacher', status = 'active';
END
$$;
