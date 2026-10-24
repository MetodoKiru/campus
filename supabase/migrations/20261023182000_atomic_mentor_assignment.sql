-- Make mentor reassignment atomic and validate both roles server-side.
CREATE OR REPLACE FUNCTION public.kiru_assign_student_mentor(
  p_student_id uuid,
  p_mentor_id uuid
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
    RAISE EXCEPTION 'No autorizado para asignar mentores.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS student
    WHERE student.id = p_student_id
      AND student.role = 'alumno'
      AND student.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'El alumno no existe o no está activo.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS mentor
    WHERE mentor.id = p_mentor_id
      AND mentor.role = 'mentor'
      AND mentor.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'El mentor no existe o no está activo.'
      USING ERRCODE = '22023';
  END IF;

  -- The production schema uses student_id as the primary key, enforcing one mentor per student.
  -- Upsert on that key so both new assignments and reassignments are atomic.
  INSERT INTO public.student_mentors (student_id, mentor_id)
  VALUES (p_student_id, p_mentor_id)
  ON CONFLICT (student_id)
  DO UPDATE SET mentor_id = EXCLUDED.mentor_id, assigned_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.kiru_assign_student_mentor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiru_assign_student_mentor(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.kiru_assign_student_mentor(uuid, uuid) IS
  'Atomically assigns one active mentor to one active student; callable by active administrators only.';
