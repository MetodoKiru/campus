-- El mentor puede ver sus horarios sin ampliar permisos sobre la tabla de asignaciones.
CREATE OR REPLACE FUNCTION kiru_private.is_assigned_mentor(p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_mentors AS sm
    WHERE sm.student_id = p_student
      AND sm.mentor_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION kiru_private.is_assigned_mentor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION kiru_private.is_assigned_mentor(uuid) TO authenticated;

DROP POLICY IF EXISTS kiru_schedule_read_related ON public.kiru_student_schedule_slots;
CREATE POLICY kiru_schedule_read_related ON public.kiru_student_schedule_slots
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
    OR kiru_private.is_guardian_of(student_id)
    OR kiru_private.is_assigned_mentor(student_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin' AND p.is_active
    )
  );
