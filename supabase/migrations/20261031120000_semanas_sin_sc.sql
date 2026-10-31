-- Semanas sin SkillCoins.
--
-- Si un alumno tuvo clase una semana (lunes a domingo, por la fecha de la
-- sesión del «Registro de sesión») y esa semana no tiene SkillCoins (ni de la
-- hoja ni corregidas en el campus), es una posible incidencia de metodología
-- del mentor. Esta función lo calcula al vuelo, sin guardar nada:
--
-- · el mentor ve las suyas,
-- · el coordinador, las de sus mentores,
-- · administración y el servidor (para el correo del lunes), todas.
--
-- Solo cuenta semanas ya terminadas y desde el 5/10/2026, cuando empezó el
-- registro SC semanal con el formulario nuevo.

CREATE OR REPLACE FUNCTION public.kiru_missing_sc_weeks(p_weeks integer DEFAULT 8)
RETURNS TABLE (
  week date, student_id uuid, student_name text, mentor_id uuid, mentor_name text,
  sessions integer, session_dates date[], respondent_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_week date := date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date;
  first_week date := greatest(date '2026-10-05', current_week - 7 * greatest(1, least(coalesce(p_weeks, 8), 52)));
  is_server boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  me uuid := kiru_private.active_uid();
  admin boolean := kiru_private.is_admin();
BEGIN
  IF NOT is_server AND me IS NULL THEN
    RAISE EXCEPTION 'Tienes que entrar en el campus.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH sessions AS (
    SELECT date_trunc('week', l.session_date)::date AS wk, l.student_id AS sid, l.mentor_id AS mid,
           l.mentor_name AS mname, l.student_name AS sname, l.session_date AS d, l.respondent_email AS email
    FROM public.kiru_session_logs l
    WHERE l.student_id IS NOT NULL AND l.session_date IS NOT NULL
      AND l.session_date >= first_week AND l.session_date < current_week
  ),
  grouped AS (
    SELECT s.wk, s.sid, s.mid, max(s.mname) AS mname, max(s.sname) AS sname,
           count(*)::integer AS n, array_agg(DISTINCT s.d ORDER BY s.d) AS dates, max(s.email) AS email
    FROM sessions s
    GROUP BY s.wk, s.sid, s.mid
  )
  SELECT g.wk, g.sid, coalesce(ps.full_name, g.sname), g.mid, coalesce(pm.full_name, g.mname),
         g.n, g.dates, g.email
  FROM grouped g
  LEFT JOIN public.profiles ps ON ps.id = g.sid
  LEFT JOIN public.profiles pm ON pm.id = g.mid
  WHERE NOT EXISTS (SELECT 1 FROM kiru_private.skillcoin_weeks(g.sid) w WHERE w.week = g.wk)
    AND (is_server OR admin OR g.mid = me OR kiru_private.coordinates_mentor(g.mid))
  ORDER BY g.wk DESC, 3, 5;
END;
$$;

REVOKE ALL ON FUNCTION public.kiru_missing_sc_weeks(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_missing_sc_weeks(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.kiru_missing_sc_weeks(integer) IS
  'Semanas terminadas en las que un alumno tuvo clase y no tiene SkillCoins. Mentor: las suyas; coordinador: sus mentores; admin y servidor: todas.';
