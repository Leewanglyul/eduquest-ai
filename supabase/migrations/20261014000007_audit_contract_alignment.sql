-- Extend audit contracts to match TypeScript/runtime usage.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_resource'
      AND e.enumlabel = 'classroom'
  ) THEN
    ALTER TYPE public.audit_resource ADD VALUE 'classroom';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_resource'
      AND e.enumlabel = 'classroom_teacher'
  ) THEN
    ALTER TYPE public.audit_resource ADD VALUE 'classroom_teacher';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_resource'
      AND e.enumlabel = 'enrollment'
  ) THEN
    ALTER TYPE public.audit_resource ADD VALUE 'enrollment';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'classroom.created'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'classroom.created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'classroom.updated'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'classroom.updated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'classroom.archived'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'classroom.archived';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'classroom.unarchived'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'classroom.unarchived';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'classroom.co_teacher_added'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'classroom.co_teacher_added';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'classroom.co_teacher_removed'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'classroom.co_teacher_removed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'enrollment.added'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'enrollment.added';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'enrollment.removed'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'enrollment.removed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'enrollment.reactivated'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'enrollment.reactivated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'audit_action'
      AND e.enumlabel = 'enrollment.transferred'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'enrollment.transferred';
  END IF;
END
$$;
