#!/usr/bin/env bash
set -euo pipefail

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-postgres}"
: "${PGPASSWORD:?PGPASSWORD must be set for the disposable test database}"

psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('test.jwt', true), '')::jsonb $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
INSERT INTO public.profiles (id, role, is_active) VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin', true),
  ('00000000-0000-4000-8000-000000000002', 'admin', false),
  ('00000000-0000-4000-8000-000000000003', 'mentor', true),
  ('00000000-0000-4000-8000-000000000004', 'alumno', true),
  ('00000000-0000-4000-8000-000000000005', 'padre', true),
  ('00000000-0000-4000-8000-000000000006', 'mentor', true),
  ('00000000-0000-4000-8000-000000000007', 'padre', true);

CREATE TABLE public.students (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id)
);
INSERT INTO public.students (profile_id) VALUES ('00000000-0000-4000-8000-000000000004');

CREATE TABLE public.student_mentors (
  student_id uuid PRIMARY KEY REFERENCES public.students(profile_id),
  mentor_id uuid NOT NULL REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_guardians (
  student_id uuid NOT NULL REFERENCES public.students(profile_id),
  guardian_id uuid NOT NULL REFERENCES public.profiles(id),
  relationship text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, guardian_id)
);

CREATE TABLE public.kiru_app_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  created_by uuid,
  record_type text NOT NULL DEFAULT 'progress'
);
ALTER TABLE public.kiru_app_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiru_records_read_authorized
  ON public.kiru_app_records
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR ((auth.jwt() -> 'app_metadata'::text) ->> 'kiru_role'::text) = 'admin'::text
  );
SQL

psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261024080000_harden_active_admin_rls.sql

psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT set_config('test.uid', '00000000-0000-4000-8000-000000000001', false);
SELECT set_config('test.jwt', '{"app_metadata":{"kiru_role":"admin"}}', false);
DO $test$
BEGIN
  IF NOT public.kiru_is_active_admin() THEN
    RAISE EXCEPTION 'Active administrator should pass the RLS helper check';
  END IF;
END;
$test$;

SELECT set_config('test.uid', '00000000-0000-4000-8000-000000000002', false);
DO $test$
BEGIN
  IF public.kiru_is_active_admin() THEN
    RAISE EXCEPTION 'Inactive administrator must fail the RLS helper check';
  END IF;
END;
$test$;

SELECT set_config('test.uid', '00000000-0000-4000-8000-000000000003', false);
DO $test$
BEGIN
  IF public.kiru_is_active_admin() THEN
    RAISE EXCEPTION 'Non-administrator must fail the RLS helper check';
  END IF;
END;
$test$;

DO $test$
DECLARE policy_qual text;
BEGIN
  SELECT qual INTO policy_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'kiru_app_records'
    AND policyname = 'kiru_records_read_authorized';

  IF policy_qual IS NULL OR position('kiru_is_active_admin' IN policy_qual) = 0 THEN
    RAISE EXCEPTION 'RLS policy was not rewritten to use the active-admin helper: %', policy_qual;
  END IF;
END;
$test$;

SELECT 'active-admin RLS migration validation passed' AS result;
SQL

psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261023182000_atomic_mentor_assignment.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261023183000_atomic_guardian_assignment.sql

psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT set_config('test.uid', '00000000-0000-4000-8000-000000000001', false);
SELECT set_config('test.jwt', '{"app_metadata":{"kiru_role":"admin"}}', false);

-- Reassigning the same student twice must not fail; changing mentor must replace
-- the single row keyed by student_id.
SELECT public.kiru_assign_student_mentor(
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003'
);
SELECT public.kiru_assign_student_mentor(
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003'
);
SELECT public.kiru_assign_student_mentor(
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000006'
);
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.student_mentors WHERE student_id = '00000000-0000-4000-8000-000000000004') <> 1
     OR (SELECT mentor_id FROM public.student_mentors WHERE student_id = '00000000-0000-4000-8000-000000000004') <> '00000000-0000-4000-8000-000000000006' THEN
    RAISE EXCEPTION 'Mentor assignment must leave exactly one row for the selected student';
  END IF;
END;
$test$;

-- Guardian replacement must also leave only the selected guardian.
SELECT public.kiru_assign_student_guardian(
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005'
);
SELECT public.kiru_assign_student_guardian(
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000007'
);
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.student_guardians WHERE student_id = '00000000-0000-4000-8000-000000000004') <> 1
     OR (SELECT guardian_id FROM public.student_guardians WHERE student_id = '00000000-0000-4000-8000-000000000004') <> '00000000-0000-4000-8000-000000000007' THEN
    RAISE EXCEPTION 'Guardian assignment must leave exactly one row for the selected student';
  END IF;
END;
$test$;

-- A mentor cannot call the admin-only assignment functions.
SELECT set_config('test.uid', '00000000-0000-4000-8000-000000000003', false);
SELECT set_config('test.jwt', '{"app_metadata":{"kiru_role":"mentor"}}', false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.kiru_assign_student_mentor(
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000003'
    );
    RAISE EXCEPTION 'Mentor assignment should reject a non-admin caller';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$test$;

SELECT 'active-admin RLS and atomic assignment migration tests passed' AS result;
SQL
