-- Replace direct JWT-only administrator checks in public-table RLS policies
-- with a database-backed active-admin check. This prevents a stale admin JWT
-- from retaining direct table privileges after profiles.is_active is disabled.
CREATE OR REPLACE FUNCTION public.kiru_is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.is_active IS TRUE
      AND (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.kiru_is_active_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiru_is_active_admin() TO authenticated;

DO $$
DECLARE
  policy_row record;
  updated_qual text;
  updated_check text;
  admin_predicate constant text := $$((auth.jwt() -> 'app_metadata'::text) ->> 'kiru_role'::text) = 'admin'::text$$;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') LIKE '%kiru_role%'
        OR coalesce(with_check, '') LIKE '%kiru_role%'
      )
  LOOP
    IF policy_row.qual IS NOT NULL THEN
      updated_qual := replace(policy_row.qual, admin_predicate, '(select public.kiru_is_active_admin())');
      IF updated_qual <> policy_row.qual THEN
        EXECUTE format(
          'ALTER POLICY %I ON %I.%I USING (%s)',
          policy_row.policyname,
          policy_row.schemaname,
          policy_row.tablename,
          updated_qual
        );
      END IF;
    END IF;

    IF policy_row.with_check IS NOT NULL THEN
      updated_check := replace(policy_row.with_check, admin_predicate, '(select public.kiru_is_active_admin())');
      IF updated_check <> policy_row.with_check THEN
        EXECUTE format(
          'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
          policy_row.policyname,
          policy_row.schemaname,
          policy_row.tablename,
          updated_check
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.kiru_is_active_admin() IS
  'Returns true only when the authenticated user has an admin JWT and remains active in public.profiles. Used by public-table RLS policies.';
