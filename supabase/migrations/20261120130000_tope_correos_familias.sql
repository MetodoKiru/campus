-- Familias (20/11/2026), puntos 3 y 5 del informe de carga de avisos.
--
-- 3. Tope de correos a familias: como mucho 3 al día y 5 en 7 días por adulto. Lo aplican
--    las rutas /api/avisos/clases, /pendientes y /llamadas con el ajuste «avisos_tope_familias».
--    Los exentos salen siempre (evaluaciones, cambios de clase y recuperaciones, horarios,
--    renovación). Lo que no cabe espera a que haya hueco; si pasan 3 días, solo queda en la campanita.
-- 5. Renovación: además del correo de la hoja (al adulto de la hoja), los demás adultos con cuenta
--    reciben el aviso por correo desde el campus.

CREATE OR REPLACE FUNCTION kiru_private.renewal_upsert(p_data jsonb, p_notify boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  sid uuid := kiru_private.renewal_student(p_data ->> 'email', p_data ->> 'alumno');
  fin date := (p_data ->> 'fin')::date;
  r public.kiru_renewals;
  student_name text;
  prepay jsonb := kiru_private.renewal_prepay(p_data -> 'adelantado');
  sheet_plan text := CASE WHEN p_data ->> 'plan' IN ('mantener', 'no_renueva')
                            OR (p_data ->> 'plan' = 'subir' AND nullif(p_data ->> 'subir_etiqueta', '') IS NOT NULL)
                            OR (p_data ->> 'plan' = 'bajar' AND nullif(p_data ->> 'bajar_etiqueta', '') IS NOT NULL)
                          THEN p_data ->> 'plan' END;
  sheet_months int := CASE WHEN coalesce(p_data ->> 'meses', '') ~ '^\d{1,2}$' THEN (p_data ->> 'meses')::int ELSE 1 END;
  sheet_paid boolean := coalesce((p_data ->> 'pagado')::boolean, false);
  no_raise boolean := false;
BEGIN
  IF sid IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF sheet_plan IS NULL OR sheet_plan = 'no_renueva' OR sheet_months NOT BETWEEN 1 AND 12
     OR (sheet_months > 1 AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(prepay -> sheet_plan, '[]'::jsonb)) o WHERE (o ->> 'meses')::int = sheet_months)) THEN
    sheet_months := 1;
  END IF;

  UPDATE public.kiru_renewals SET closed_at = now()
  WHERE student_id = sid AND period_end < fin AND closed_at IS NULL;

  -- Si al preparar el correo se vio que el mentor no tiene hueco, no se ofrece subir.
  IF to_regclass('public.kiru_availability_checks') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.kiru_availability_checks WHERE student_id = $1 AND period_end = $2 AND can_raise IS FALSE)'
      INTO no_raise USING sid, fin;
  END IF;
  IF no_raise AND sheet_plan IS DISTINCT FROM 'subir' THEN
    p_data := p_data || jsonb_build_object('subir_etiqueta', '', 'subir_precio', '');
    prepay := prepay - 'subir';
  END IF;

  INSERT INTO public.kiru_renewals AS k (student_id, period_end, sheet_student, guardian_email, mentor_name,
    keep_label, keep_price, up_label, up_price, down_label, down_price, payment_info, call_url, prepay,
    plan, plan_source, plan_at, months, paid_reported_at, paid_source)
  VALUES (sid, fin, trim(p_data ->> 'alumno'), lower(trim(p_data ->> 'email')), coalesce(p_data ->> 'mentor', ''),
    p_data ->> 'mantener_etiqueta', (p_data ->> 'mantener_precio')::numeric,
    nullif(p_data ->> 'subir_etiqueta', ''), nullif(p_data ->> 'subir_precio', '')::numeric,
    nullif(p_data ->> 'bajar_etiqueta', ''), CASE WHEN nullif(p_data ->> 'bajar_etiqueta', '') IS NOT NULL
                                                  THEN nullif(p_data ->> 'bajar_precio', '')::numeric END,
    coalesce(p_data ->> 'pago', ''), coalesce(p_data ->> 'llamada', ''), prepay,
    sheet_plan, CASE WHEN sheet_plan IS NOT NULL THEN 'correo' END, CASE WHEN sheet_plan IS NOT NULL THEN now() END,
    sheet_months, CASE WHEN sheet_paid THEN now() END, CASE WHEN sheet_paid THEN 'correo' END)
  ON CONFLICT (student_id, period_end) DO UPDATE
  SET sheet_student = excluded.sheet_student, guardian_email = excluded.guardian_email,
      mentor_name = excluded.mentor_name, payment_info = excluded.payment_info, call_url = excluded.call_url,
      keep_label = CASE WHEN k.plan IS NULL THEN excluded.keep_label ELSE k.keep_label END,
      keep_price = CASE WHEN k.plan IS NULL THEN excluded.keep_price ELSE k.keep_price END,
      up_label = CASE WHEN k.plan IS NULL THEN excluded.up_label ELSE k.up_label END,
      up_price = CASE WHEN k.plan IS NULL THEN excluded.up_price ELSE k.up_price END,
      down_label = CASE WHEN k.plan IS NULL THEN excluded.down_label ELSE k.down_label END,
      down_price = CASE WHEN k.plan IS NULL THEN excluded.down_price ELSE k.down_price END,
      prepay = CASE WHEN k.plan IS NULL THEN excluded.prepay ELSE k.prepay END,
      months = CASE WHEN k.plan IS NULL THEN excluded.months ELSE k.months END,
      plan = coalesce(k.plan, excluded.plan),
      plan_source = coalesce(k.plan_source, excluded.plan_source),
      plan_at = coalesce(k.plan_at, excluded.plan_at),
      paid_reported_at = coalesce(k.paid_reported_at, excluded.paid_reported_at),
      paid_source = coalesce(k.paid_source, excluded.paid_source)
  RETURNING * INTO r;

  IF p_notify THEN
    SELECT full_name INTO student_name FROM public.profiles WHERE id = sid;
    -- El correo de la hoja (borrador) va al adulto de la hoja; los demás adultos con cuenta
    -- reciben un aviso por correo desde el campus (20/11/2026: los dos adultos reciben todo).
    INSERT INTO public.kiru_notifications (recipient_id, student_id, kind, title, body, event_key, email_status)
    SELECT sg.guardian_id, sid, 'renovacion',
           'Renovación de la mensualidad de ' || split_part(coalesce(student_name, 'tu hijo/a'), ' ', 1),
           'Termina el ' || to_char(fin, 'DD/MM') || '. Elige cómo seguís desde el panel.',
           'renovacion:' || r.id,
           CASE WHEN coalesce(u.email, '') <> '' AND lower(u.email) <> lower(trim(coalesce(p_data ->> 'email', '')))
                     AND lower(u.email) NOT LIKE '%.invalid'
                THEN 'pendiente' ELSE 'no_aplica' END
    FROM public.student_guardians sg
    JOIN public.profiles p ON p.id = sg.guardian_id AND p.is_active AND p.role = 'padre'
    LEFT JOIN auth.users u ON u.id = sg.guardian_id
    WHERE sg.student_id = sid
    ON CONFLICT (recipient_id, event_key) DO NOTHING;
  END IF;

  RETURN kiru_private.renewal_json(r, false) || jsonb_build_object('found', true);
END;
$function$;

INSERT INTO public.kiru_settings (key, value) VALUES ('avisos_tope_familias', jsonb_build_object(
  'activo', true,
  'dia', 3,
  'semana', 5,
  'exentos', jsonb_build_array('evaluacion_trimestral', 'renovacion',
    'clase_solicitud', 'clase_decision', 'clase_mas_info',
    'recuperacion_propuesta', 'recuperacion_confirmada', 'recuperacion_sin_encaje',
    'horario_elegir', 'horario_confirmado', 'horario_otro')))
ON CONFLICT (key) DO NOTHING;

-- 6. Administración también recibe resumen, pero por la mañana (8:00): los avisos del campus
--    para admin se juntan en un correo al día. Solo añade lo que falta; no toca lo demás del ajuste.
UPDATE public.kiru_settings
SET value = value
  || jsonb_build_object('roles', CASE WHEN value -> 'roles' ? 'admin' THEN value -> 'roles' ELSE coalesce(value -> 'roles', '[]'::jsonb) || '["admin"]'::jsonb END)
  || jsonb_build_object('hora_por_rol', coalesce(value -> 'hora_por_rol', '{}'::jsonb) || jsonb_build_object('admin', 8)),
    updated_at = now()
WHERE key = 'avisos_resumen' AND NOT (coalesce(value -> 'hora_por_rol', '{}'::jsonb) ? 'admin');
