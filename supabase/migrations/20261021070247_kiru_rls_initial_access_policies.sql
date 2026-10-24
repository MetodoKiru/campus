-- Roles privilegiados se leen exclusivamente de app_metadata del JWT.
-- app_metadata solo debe modificarse desde entorno servidor de confianza.

CREATE POLICY profiles_read_self_admin_related_students ON public.profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  OR (
    role = 'alumno' AND (
      EXISTS (
        SELECT 1 FROM public.student_mentors sm
        WHERE sm.student_id = profiles.id AND sm.mentor_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.student_guardians sg
        WHERE sg.student_id = profiles.id AND sg.guardian_id = (SELECT auth.uid())
      )
    )
  )
);

CREATE POLICY profiles_admin_insert ON public.profiles
FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin');

CREATE POLICY profiles_admin_update ON public.profiles
FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin');

CREATE POLICY profiles_admin_delete ON public.profiles
FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin');

CREATE POLICY students_read_authorized ON public.students
FOR SELECT TO authenticated
USING (
  profile_id = (SELECT auth.uid())
  OR (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.student_mentors sm
    WHERE sm.student_id = students.profile_id AND sm.mentor_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.student_guardians sg
    WHERE sg.student_id = students.profile_id AND sg.guardian_id = (SELECT auth.uid())
  )
);

CREATE POLICY students_admin_insert ON public.students
FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin');

CREATE POLICY students_admin_update ON public.students
FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin');

CREATE POLICY students_admin_delete ON public.students
FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin');

CREATE POLICY student_mentors_read_involved ON public.student_mentors
FOR SELECT TO authenticated
USING (
  mentor_id = (SELECT auth.uid())
  OR student_id = (SELECT auth.uid())
  OR (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.student_guardians sg
    WHERE sg.student_id = student_mentors.student_id
      AND sg.guardian_id = (SELECT auth.uid())
  )
);

CREATE POLICY student_mentors_admin_insert ON public.student_mentors
FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = mentor_id AND p.role = 'mentor')
);

CREATE POLICY student_mentors_admin_update ON public.student_mentors
FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = mentor_id AND p.role = 'mentor')
);

CREATE POLICY student_mentors_admin_delete ON public.student_mentors
FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin');

CREATE POLICY student_guardians_read_involved ON public.student_guardians
FOR SELECT TO authenticated
USING (
  guardian_id = (SELECT auth.uid())
  OR student_id = (SELECT auth.uid())
  OR (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.student_mentors sm
    WHERE sm.student_id = student_guardians.student_id
      AND sm.mentor_id = (SELECT auth.uid())
  )
);

CREATE POLICY student_guardians_admin_insert ON public.student_guardians
FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = guardian_id AND p.role = 'padre')
);

CREATE POLICY student_guardians_admin_update ON public.student_guardians
FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = guardian_id AND p.role = 'padre')
);

CREATE POLICY student_guardians_admin_delete ON public.student_guardians
FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin');

GRANT SELECT ON public.profiles, public.students, public.student_mentors, public.student_guardians TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles, public.students, public.student_mentors, public.student_guardians TO authenticated;
