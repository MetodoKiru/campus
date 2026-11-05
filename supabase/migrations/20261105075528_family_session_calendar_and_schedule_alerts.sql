
-- Avisos de registros con fecha en un día distinto al horario semanal activo.
-- La función no modifica sesiones: solo ofrece una lista filtrada para que
-- mentor y coordinación revisen cambios acordados sin registrar de nuevo.
CREATE OR REPLACE FUNCTION public.kiru_session_schedule_mismatches(p_days integer DEFAULT 90)
RETURNS TABLE (
  session_date date,
  student_id uuid,
  student_name text,
  mentor_id uuid,
  mentor_name text,
  session_weekday smallint,
  scheduled_weekdays smallint[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  first_day date := today - greatest(1, least(coalesce(p_days, 90), 365));
  is_server boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  me uuid := kiru_private.active_uid();
  admin boolean := kiru_private.is_admin();
BEGIN
  IF NOT is_server AND me IS NULL THEN
    RAISE EXCEPTION 'Tienes que entrar en el campus.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH recent_logs AS (
    -- Una alerta por alumno, mentor y fecha aunque el formulario se haya
    -- enviado varias veces para la misma sesión.
    SELECT DISTINCT ON (l.student_id, l.mentor_id, l.session_date)
      l.student_id, l.mentor_id, l.session_date, l.student_name, l.mentor_name
    FROM public.kiru_session_logs l
    WHERE l.student_id IS NOT NULL
      AND l.mentor_id IS NOT NULL
      AND l.session_date BETWEEN first_day AND today
    ORDER BY l.student_id, l.mentor_id, l.session_date, l.submitted_at, l.id
  ), mismatches AS (
    SELECT
      l.session_date,
      l.student_id,
      coalesce(ps.full_name, max(l.student_name)) AS student_name,
      l.mentor_id,
      coalesce(pm.full_name, max(l.mentor_name)) AS mentor_name,
      extract(isodow FROM l.session_date)::smallint AS session_weekday,
      array_agg(DISTINCT s.weekday ORDER BY s.weekday)::smallint[] AS scheduled_weekdays
    FROM recent_logs l
    JOIN public.kiru_student_schedule_slots s
      ON s.student_id = l.student_id
      AND s.mentor_id = l.mentor_id
      AND s.is_active
    LEFT JOIN public.profiles ps ON ps.id = l.student_id
    LEFT JOIN public.profiles pm ON pm.id = l.mentor_id
    GROUP BY l.session_date, l.student_id, ps.full_name, l.mentor_id, pm.full_name
    HAVING NOT bool_or(s.weekday = extract(isodow FROM l.session_date)::smallint)
  )
  SELECT m.session_date, m.student_id, m.student_name, m.mentor_id,
         m.mentor_name, m.session_weekday, m.scheduled_weekdays
  FROM mismatches m
  WHERE is_server OR admin OR m.mentor_id = me OR kiru_private.coordinates_mentor(m.mentor_id)
  ORDER BY m.session_date DESC, m.student_name, m.mentor_name;
END;
$$;

REVOKE ALL ON FUNCTION public.kiru_session_schedule_mismatches(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_session_schedule_mismatches(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.kiru_session_schedule_mismatches(integer) IS
  'Sesiones recientes fuera de los días semanales activos. Mentor ve las suyas; coordinación ve las de sus mentores; administración y el servidor ven todas.';
