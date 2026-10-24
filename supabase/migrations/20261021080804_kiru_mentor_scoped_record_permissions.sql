DROP POLICY IF EXISTS kiru_records_insert_owner_admin ON public.kiru_app_records;
CREATE POLICY kiru_records_insert_authorized
ON public.kiru_app_records FOR INSERT TO authenticated
WITH CHECK (
  ((SELECT auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
  OR (
    owner_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
  )
  OR (
    record_type IN ('activity', 'task', 'progress', 'message')
    AND created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.student_mentors sm
      WHERE sm.student_id = kiru_app_records.owner_id
        AND sm.mentor_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS kiru_records_update_owner_admin ON public.kiru_app_records;
CREATE POLICY kiru_records_update_authorized
ON public.kiru_app_records FOR UPDATE TO authenticated
USING (
  ((SELECT auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
  OR (
    owner_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
  )
  OR (
    record_type IN ('activity', 'task', 'progress', 'message')
    AND EXISTS (
      SELECT 1 FROM public.student_mentors sm
      WHERE sm.student_id = kiru_app_records.owner_id
        AND sm.mentor_id = (SELECT auth.uid())
    )
  )
)
WITH CHECK (
  ((SELECT auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
  OR (
    owner_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
  )
  OR (
    record_type IN ('activity', 'task', 'progress', 'message')
    AND EXISTS (
      SELECT 1 FROM public.student_mentors sm
      WHERE sm.student_id = kiru_app_records.owner_id
        AND sm.mentor_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS kiru_records_delete_owner_admin ON public.kiru_app_records;
CREATE POLICY kiru_records_delete_authorized
ON public.kiru_app_records FOR DELETE TO authenticated
USING (
  ((SELECT auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
  OR (
    owner_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
  )
  OR (
    record_type IN ('activity', 'task', 'progress', 'message')
    AND EXISTS (
      SELECT 1 FROM public.student_mentors sm
      WHERE sm.student_id = kiru_app_records.owner_id
        AND sm.mentor_id = (SELECT auth.uid())
    )
  )
);
