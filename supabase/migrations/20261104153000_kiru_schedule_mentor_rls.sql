-- Solo el mentor indicado en cada franja puede consultarla.
DROP POLICY IF EXISTS kiru_schedule_read_related ON public.kiru_student_schedule_slots;
CREATE POLICY kiru_schedule_read_related ON public.kiru_student_schedule_slots
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
    OR kiru_private.is_guardian_of(student_id)
    OR (SELECT auth.uid()) = mentor_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin' AND p.is_active
    )
  );
