-- Replace a student's guardian link atomically, avoiding partial delete/insert states.
CREATE OR REPLACE FUNCTION public.kiru_assign_student_guardian(
  p_student_id uuid,
  p_guardian_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS actor
    WHERE actor.id = auth.uid()
      AND actor.role = 'admin'
      AND actor.is_active IS TRUE
      AND (auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado para asignar tutores legales.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS student
    JOIN public.students AS s ON s.profile_id = student.id
    WHERE student.id = p_student_id
      AND student.role = 'alumno'
      AND student.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'El alumno no existe o no está activo.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS guardian
    WHERE guardian.id = p_guardian_id
      AND guardian.role = 'padre'
      AND guardian.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'El tutor legal no existe o no está activo.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.student_guardians
  WHERE student_id = p_student_id
    AND guardian_id <> p_guardian_id;

  INSERT INTO public.student_guardians (student_id, guardian_id)
  VALUES (p_student_id, p_guardian_id)
  ON CONFLICT (student_id, guardian_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.kiru_assign_student_guardian(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiru_assign_student_guardian(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.kiru_assign_student_guardian(uuid, uuid) IS
  'Atomically assigns one active legal guardian to one active student; callable by active administrators only.';
