-- Keep relationship-table SELECT policies independent to avoid mutual RLS recursion.
DROP POLICY IF EXISTS student_mentors_read_involved ON public.student_mentors;
CREATE POLICY student_mentors_read_involved ON public.student_mentors
FOR SELECT TO authenticated
USING (
  mentor_id = (SELECT auth.uid())
  OR student_id = (SELECT auth.uid())
  OR (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
);

DROP POLICY IF EXISTS student_guardians_read_involved ON public.student_guardians;
CREATE POLICY student_guardians_read_involved ON public.student_guardians
FOR SELECT TO authenticated
USING (
  guardian_id = (SELECT auth.uid())
  OR student_id = (SELECT auth.uid())
  OR (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
);
