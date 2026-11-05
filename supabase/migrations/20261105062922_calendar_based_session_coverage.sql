-- El número de sesiones de un periodo se calcula con las franjas semanales
-- reales que caen dentro del intervalo cubierto, no con la aproximación de
-- cuatro semanas por mes.
CREATE OR REPLACE FUNCTION kiru_private.renewal_payment_reported(r public.kiru_renewals, p_source text, p_by uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_months int := CASE WHEN r.plan IN ('mantener', 'subir') THEN r.months ELSE 1 END;
  v_start date := coalesce((r.paid_reported_at AT TIME ZONE 'Europe/Madrid')::date, (now() AT TIME ZONE 'Europe/Madrid')::date);
  v_end date;
  v_label text := CASE r.plan WHEN 'mantener' THEN r.keep_label WHEN 'subir' THEN r.up_label ELSE NULL END;
  v_match text[];
  v_days smallint;
  v_sessions smallint;
  v_total numeric := coalesce(kiru_private.renewal_total(r), r.keep_price);
  v_author uuid := coalesce(p_by, kiru_private.system_author());
  v_concept text;
BEGIN
  IF v_author IS NULL THEN RETURN; END IF;
  v_months := greatest(1, least(v_months, 12));
  v_end := (v_start + make_interval(months => v_months))::date;

  v_match := regexp_match(lower(coalesce(v_label, '')), '([1-3])\s*d[ií]as?');
  IF v_match IS NOT NULL THEN
    v_days := v_match[1]::smallint;
  ELSE
    SELECT nullif(count(*), 0)::smallint INTO v_days
    FROM public.kiru_student_schedule_slots s
    WHERE s.student_id = r.student_id AND s.is_active;
  END IF;

  -- Cada franja activa representa una sesión semanal. generate_series incluye
  -- el inicio y excluye el día de renovación (v_end), igual que coverage_end.
  SELECT nullif(count(*), 0)::smallint INTO v_sessions
  FROM public.kiru_student_schedule_slots s
  CROSS JOIN LATERAL generate_series(
    v_start::timestamp,
    (v_end - 1)::timestamp,
    interval '1 day'
  ) AS scheduled_day(day)
  WHERE s.student_id = r.student_id
    AND s.is_active
    AND extract(isodow FROM scheduled_day.day)::smallint = s.weekday;

  v_concept := 'Acompañamiento del ' || to_char(v_start, 'DD/MM/YYYY') || ' al ' || to_char(v_end, 'DD/MM/YYYY')
    || CASE WHEN v_months > 1 THEN ' (' || v_months || ' meses)' ELSE '' END;

  UPDATE public.kiru_renewals
  SET paid_from = v_start, sessions_planned = v_sessions
  WHERE id = r.id;

  INSERT INTO public.kiru_payments (
    student_id, concept, amount_cents, due_date, status, notes, created_by, renewal_id,
    coverage_start, coverage_end, days_per_week, sessions_included, reported_at
  ) VALUES (
    r.student_id, v_concept, round(v_total * 100)::int, v_start, 'pending',
    'Pago comunicado por la familia desde ' || CASE p_source WHEN 'correo' THEN 'el correo' ELSE 'el campus' END || '; pendiente de confirmar.',
    v_author, r.id, v_start, v_end, v_days, v_sessions, r.paid_reported_at
  )
  ON CONFLICT (renewal_id) WHERE renewal_id IS NOT NULL DO UPDATE
  SET concept = excluded.concept,
      amount_cents = excluded.amount_cents,
      due_date = excluded.due_date,
      coverage_start = excluded.coverage_start,
      coverage_end = excluded.coverage_end,
      days_per_week = excluded.days_per_week,
      sessions_included = excluded.sessions_included,
      reported_at = excluded.reported_at;
END;
$function$;

-- Conserva una sola respuesta en el historial familiar cuando una misma sesión
-- se registró más de una vez; la más antigua es la fuente visible. Los registros
-- originales siguen intactos para revisión interna y auditoría.
CREATE OR REPLACE VIEW public.kiru_family_session_history
WITH (security_invoker = false)
AS
WITH parsed AS (
  SELECT
    l.id,
    l.student_id,
    l.session_date,
    l.mentor_id,
    l.mentor_name,
    l.submitted_at,
    COALESCE((
      SELECT NULLIF(btrim(answer.value ->> 'a'), '')
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(l.answers) = 'array' THEN l.answers ELSE '[]'::jsonb END
      ) AS answer(value)
      WHERE translate(lower(coalesce(answer.value ->> 'q', '')), 'áéíóú', 'aeiou') LIKE '%que se ha trabajado hoy%'
      LIMIT 1
    ), '') AS topic,
    COALESCE((
      SELECT NULLIF(regexp_replace(lower(btrim(answer.value ->> 'a')), '\s+', '', 'g'), '')
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(l.answers) = 'array' THEN l.answers ELSE '[]'::jsonb END
      ) AS answer(value)
      WHERE translate(lower(coalesce(answer.value ->> 'q', '')), 'áéíóú', 'aeiou') LIKE '%numero%sesion%'
      LIMIT 1
    ), '') AS session_number
  FROM public.kiru_session_logs AS l
  WHERE l.student_id IS NOT NULL
    AND l.session_date IS NOT NULL
    AND kiru_private.is_guardian_of(l.student_id)
), ranked AS (
  SELECT
    parsed.*,
    row_number() OVER (
      PARTITION BY student_id, session_date, coalesce(mentor_id::text, lower(mentor_name)),
        CASE WHEN session_number = '' THEN id::text ELSE session_number END
      ORDER BY submitted_at ASC, id ASC
    ) AS duplicate_rank
  FROM parsed
)
SELECT id, student_id, session_date, mentor_name, topic
FROM ranked
WHERE duplicate_rank = 1;

COMMENT ON VIEW public.kiru_family_session_history IS
  'Historial de sesiones realizadas y registradas para el padre vinculado; elimina duplicados por alumno, fecha, mentor y número de sesión, conservando la primera entrada y excluyendo respuestas e incidencias completas.';

REVOKE ALL ON public.kiru_family_session_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_family_session_history TO authenticated;
