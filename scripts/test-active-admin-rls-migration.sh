#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
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
  ('00000000-0000-4000-8000-000000000003', 'mentor', true);

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
