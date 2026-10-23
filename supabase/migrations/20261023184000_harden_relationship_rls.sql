-- Harden direct relationship-table access: stale admin JWTs must not bypass profile deactivation.
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

ALTER POLICY student_mentors_admin_delete
  ON public.student_mentors
  USING ((select public.kiru_is_active_admin()));

ALTER POLICY student_mentors_admin_insert
  ON public.student_mentors
  WITH CHECK (
    (select public.kiru_is_active_admin())
    AND EXISTS (
      SELECT 1 FROM public.profiles AS mentor
      WHERE mentor.id = student_mentors.mentor_id
        AND mentor.role = 'mentor'
        AND mentor.is_active IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS student
      JOIN public.students AS s ON s.profile_id = student.id
      WHERE student.id = student_mentors.student_id
        AND student.role = 'alumno'
        AND student.is_active IS TRUE
    )
  );

ALTER POLICY student_mentors_admin_update
  ON public.student_mentors
  USING ((select public.kiru_is_active_admin()))
  WITH CHECK (
    (select public.kiru_is_active_admin())
    AND EXISTS (
      SELECT 1 FROM public.profiles AS mentor
      WHERE mentor.id = student_mentors.mentor_id
        AND mentor.role = 'mentor'
        AND mentor.is_active IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS student
      JOIN public.students AS s ON s.profile_id = student.id
      WHERE student.id = student_mentors.student_id
        AND student.role = 'alumno'
        AND student.is_active IS TRUE
    )
  );

ALTER POLICY student_mentors_read_involved
  ON public.student_mentors
  USING (
    mentor_id = (select auth.uid())
    OR student_id = (select auth.uid())
    OR (select public.kiru_is_active_admin())
  );

ALTER POLICY student_guardians_admin_delete
  ON public.student_guardians
  USING ((select public.kiru_is_active_admin()));

ALTER POLICY student_guardians_admin_insert
  ON public.student_guardians
  WITH CHECK (
    (select public.kiru_is_active_admin())
    AND EXISTS (
      SELECT 1 FROM public.profiles AS guardian
      WHERE guardian.id = student_guardians.guardian_id
        AND guardian.role = 'padre'
        AND guardian.is_active IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS student
      JOIN public.students AS s ON s.profile_id = student.id
      WHERE student.id = student_guardians.student_id
        AND student.role = 'alumno'
        AND student.is_active IS TRUE
    )
  );

ALTER POLICY student_guardians_admin_update
  ON public.student_guardians
  USING ((select public.kiru_is_active_admin()))
  WITH CHECK (
    (select public.kiru_is_active_admin())
    AND EXISTS (
      SELECT 1 FROM public.profiles AS guardian
      WHERE guardian.id = student_guardians.guardian_id
        AND guardian.role = 'padre'
        AND guardian.is_active IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS student
      JOIN public.students AS s ON s.profile_id = student.id
      WHERE student.id = student_guardians.student_id
        AND student.role = 'alumno'
        AND student.is_active IS TRUE
    )
  );

ALTER POLICY student_guardians_read_involved
  ON public.student_guardians
  USING (
    guardian_id = (select auth.uid())
    OR student_id = (select auth.uid())
    OR (select public.kiru_is_active_admin())
  );

COMMENT ON FUNCTION public.kiru_is_active_admin() IS
  'Returns true only for the current authenticated, active administrator. Used by relationship RLS policies.';
