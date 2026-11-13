-- Cambio de intensidad en la renovación y nuevo horario (13/11/2026, «caso Alondra»).
--
-- 1. Disponibilidad semanal del mentor para dar clase (franjas por día). La
--    marca el mentor en su panel; se le recuerda cada mes.
-- 2. La renovación ofrece también «Bajar a X días» con su precio (además de
--    mantener y subir). La opción la manda la hoja «Contabilidad 26-27».
-- 3. Si la familia elige subir o bajar, se abre un cambio de horario:
--      elegir_familia → (la familia elige días y horas en el campus)
--      confirmar_mentor → (el mentor confirma o pide otro horario)
--      confirmado → (el día que empieza la nueva mensualidad) aplicado
--    Al bajar, la familia elige qué días conserva de los que ya tiene (o
--    cambia a otro hueco libre); al subir, solo ve los huecos libres de su
--    mentor (su disponibilidad menos las clases de sus otros alumnos).
--    Al aplicarse, el horario semanal cambia y las clases futuras se rehacen
--    solas (las del horario viejo quedan «anuladas · cambio de horario»).
-- 4. Familia y mentor reciben un aviso en la campanita y un correo (lo manda el
--    Apps Script de avisos cada 5 minutos). La hoja «Familias» recibe los días
--    y el precio nuevos (acción «horarios» de /api/renovaciones).
-- Nada se borra: el horario viejo queda inactivo y los cambios quedan guardados.

-- 0. Avisos nuevos -------------------------------------------------------------------
ALTER TABLE public.kiru_notifications DROP CONSTRAINT IF EXISTS kiru_notifications_kind_check;
ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check CHECK (kind IN (
  'objetivo_pendiente', 'objetivo_aprobado', 'objetivo_rechazado', 'canje_solicitado', 'canje_completado',
  'canje_aplazado', 'renovacion', 'informe_progreso', 'clase_solicitud', 'clase_decision', 'clase_mas_info',
  'recuperacion_propuesta', 'recuperacion_confirmada', 'recuperacion_sin_encaje', 'recuperacion_nueva',
  'recuperacion_sin_avanzar', 'recuperacion_recordatorio', 'recuperacion_fin_periodo', 'registro_aviso',
  'clase_incidencia', 'justificacion_solicitada', 'justificacion_respondida', 'justificacion_repregunta',
  'justificacion_cerrada', 'justificacion_recordatorio', 'justificacion_por_valorar', 'aviso_metodologico',
  'aviso_seguimiento', 'periodo_especial', 'evaluacion_trimestral',
  'horario_elegir', 'horario_confirmar', 'horario_confirmado', 'horario_otro', 'disponibilidad_actualizar'
));

-- 1. Disponibilidad semanal del mentor ------------------------------------------------
-- slots: [{"weekday": 2, "start": "16:00", "end": "20:00"}, ...] (weekday 1 = lunes)
CREATE TABLE IF NOT EXISTS public.kiru_mentor_class_availability (
  mentor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(slots) = 'array' AND jsonb_array_length(slots) <= 60),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.kiru_mentor_class_availability IS
  'Franjas semanales en las que cada mentor puede dar clase. Se usan para proponer horarios a las familias que cambian de intensidad.';

ALTER TABLE public.kiru_mentor_class_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_mentor_class_availability FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_mentor_class_availability TO authenticated;
GRANT ALL ON public.kiru_mentor_class_availability TO service_role;
CREATE POLICY kiru_mentor_class_availability_read ON public.kiru_mentor_class_availability
FOR SELECT TO authenticated USING (
  mentor_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR (SELECT kiru_private.coordinates_mentor(mentor_id))
);

-- Franjas válidas: hora en punto o y media, inicio < fin, sin solaparse en el mismo día.
CREATE OR REPLACE FUNCTION kiru_private.availability_clean(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v jsonb := '[]'::jsonb;
  o jsonb;
  d int;
  s time;
  e time;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Disponibilidad no válida.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p) > 60 THEN
    RAISE EXCEPTION 'Demasiadas franjas.' USING ERRCODE = '22023';
  END IF;
  FOR o IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(o) <> 'object' OR coalesce(o ->> 'weekday', '') !~ '^[1-7]$'
       OR coalesce(o ->> 'start', '') !~ '^([01]\d|2[0-3]):(00|30)$'
       OR coalesce(o ->> 'end', '') !~ '^(([01]\d|2[0-3]):(00|30)|24:00)$' THEN
      RAISE EXCEPTION 'Franja no válida.' USING ERRCODE = '22023';
    END IF;
    d := (o ->> 'weekday')::int;
    s := (o ->> 'start')::time;
    e := CASE WHEN o ->> 'end' = '24:00' THEN '23:59'::time ELSE (o ->> 'end')::time END;
    IF e <= s THEN
      RAISE EXCEPTION 'Cada franja tiene que acabar después de empezar.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v) x
               WHERE (x ->> 'weekday')::int = d AND (x ->> 'start')::time < e AND (x ->> 'end')::time > s) THEN
      RAISE EXCEPTION 'Hay franjas que se solapan el mismo día.' USING ERRCODE = '22023';
    END IF;
    v := v || jsonb_build_object('weekday', d, 'start', to_char(s, 'HH24:MI'), 'end', to_char(e, 'HH24:MI'));
  END LOOP;
  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'weekday')::int, x ->> 'start'), '[]'::jsonb) FROM jsonb_array_elements(v) x);
END
$$;
REVOKE ALL ON FUNCTION kiru_private.availability_clean(jsonb) FROM PUBLIC;

-- El mentor guarda su disponibilidad (o administración la de un mentor).
CREATE OR REPLACE FUNCTION public.kiru_disponibilidad_guardar(p_slots jsonb, p_notes text DEFAULT '', p_mentor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := kiru_private.active_uid();
  v_mentor uuid := coalesce(p_mentor, me);
  v_slots jsonb := kiru_private.availability_clean(p_slots);
BEGIN
  IF me IS NULL OR NOT (
       (v_mentor = me AND kiru_private.kiru_role() = 'mentor')
       OR kiru_private.is_admin()) THEN
    RAISE EXCEPTION 'No puedes cambiar esta disponibilidad.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_mentor AND role = 'mentor') THEN
    RAISE EXCEPTION 'No existe ese mentor.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.kiru_mentor_class_availability (mentor_id, slots, notes, updated_at)
  VALUES (v_mentor, v_slots, left(coalesce(p_notes, ''), 500), now())
  ON CONFLICT (mentor_id) DO UPDATE SET slots = excluded.slots, notes = excluded.notes, updated_at = now();
  -- Ya no hace falta el recordatorio pendiente.
  UPDATE public.kiru_notifications SET read_at = coalesce(read_at, now())
  WHERE recipient_id = v_mentor AND kind = 'disponibilidad_actualizar' AND read_at IS NULL;
  RETURN jsonb_build_object('ok', true, 'slots', v_slots);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_disponibilidad_guardar(jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_disponibilidad_guardar(jsonb, text, uuid) TO authenticated;

-- 2. Renovación: opción «bajar» -------------------------------------------------------
ALTER TABLE public.kiru_renewals
  ADD COLUMN IF NOT EXISTS down_label text CHECK (down_label IS NULL OR length(trim(down_label)) BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS down_price numeric(8, 2) CHECK (down_price IS NULL OR down_price >= 0);
ALTER TABLE public.kiru_renewals DROP CONSTRAINT IF EXISTS kiru_renewals_down_pair;
ALTER TABLE public.kiru_renewals ADD CONSTRAINT kiru_renewals_down_pair CHECK ((down_label IS NULL) = (down_price IS NULL));
ALTER TABLE public.kiru_renewals DROP CONSTRAINT IF EXISTS kiru_renewals_plan_check;
ALTER TABLE public.kiru_renewals ADD CONSTRAINT kiru_renewals_plan_check CHECK (plan IN ('mantener', 'subir', 'bajar', 'no_renueva'));
ALTER TABLE public.kiru_renewals DROP CONSTRAINT IF EXISTS kiru_renewals_down_needed;
ALTER TABLE public.kiru_renewals ADD CONSTRAINT kiru_renewals_down_needed CHECK (plan IS DISTINCT FROM 'bajar' OR down_label IS NOT NULL);

CREATE OR REPLACE FUNCTION kiru_private.renewal_plan_label(r public.kiru_renewals)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE r.plan WHEN 'mantener' THEN r.keep_label WHEN 'subir' THEN r.up_label
                     WHEN 'bajar' THEN r.down_label WHEN 'no_renueva' THEN 'No renueva' END
$$;
CREATE OR REPLACE FUNCTION kiru_private.renewal_plan_price(r public.kiru_renewals)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE r.plan WHEN 'mantener' THEN r.keep_price WHEN 'subir' THEN r.up_price WHEN 'bajar' THEN r.down_price END
$$;
REVOKE ALL ON FUNCTION kiru_private.renewal_plan_label(public.kiru_renewals), kiru_private.renewal_plan_price(public.kiru_renewals) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.renewal_prepay(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT coalesce(jsonb_object_agg(plan, opts), '{}'::jsonb)
  FROM (
    SELECT plan, jsonb_agg(jsonb_build_object(
        'meses', (o ->> 'meses')::int,
        'total', round((o ->> 'total')::numeric, 2),
        'ahorro', greatest(round(coalesce((o ->> 'ahorro')::numeric, 0), 2), 0),
        'pct', greatest(coalesce((o ->> 'pct')::numeric, 0), 0)
      ) ORDER BY (o ->> 'meses')::int) AS opts
    FROM unnest(ARRAY['mantener', 'subir', 'bajar']) AS plan,
         jsonb_array_elements(CASE WHEN jsonb_typeof(p -> plan) = 'array' THEN p -> plan ELSE '[]'::jsonb END) o
    WHERE jsonb_typeof(o) = 'object'
      AND (o ->> 'meses') ~ '^\d{1,2}$' AND (o ->> 'meses')::int BETWEEN 2 AND 12
      AND (o ->> 'total') ~ '^\d+(\.\d+)?$' AND (o ->> 'total')::numeric < 100000
      AND coalesce(o ->> 'ahorro', '0') ~ '^-?\d+(\.\d+)?$' AND coalesce(o ->> 'pct', '0') ~ '^\d+(\.\d+)?$'
    GROUP BY plan
  ) x
$function$;

CREATE OR REPLACE FUNCTION kiru_private.renewal_months_ok(r public.kiru_renewals, p_plan text, p_months integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT p_months = 1 OR (p_plan IN ('mantener', 'subir', 'bajar') AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(r.prepay -> p_plan, '[]'::jsonb)) o
    WHERE (o ->> 'meses')::int = p_months
  ))
$function$;

CREATE OR REPLACE FUNCTION kiru_private.renewal_total(r public.kiru_renewals)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN r.plan IS NULL OR r.plan NOT IN ('mantener', 'subir', 'bajar') THEN NULL
    WHEN r.months = 1 THEN kiru_private.renewal_plan_price(r)
    ELSE (SELECT (o ->> 'total')::numeric FROM jsonb_array_elements(coalesce(r.prepay -> r.plan, '[]'::jsonb)) o
          WHERE (o ->> 'meses')::int = r.months LIMIT 1)
  END
$function$;

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
    INSERT INTO public.kiru_notifications (recipient_id, student_id, kind, title, body, event_key)
    SELECT sg.guardian_id, sid, 'renovacion',
           'Renovación de la mensualidad de ' || split_part(coalesce(student_name, 'tu hijo/a'), ' ', 1),
           'Termina el ' || to_char(fin, 'DD/MM') || '. Elige cómo seguís desde el panel.',
           'renovacion:' || r.id
    FROM public.student_guardians sg
    JOIN public.profiles p ON p.id = sg.guardian_id AND p.is_active AND p.role = 'padre'
    WHERE sg.student_id = sid
    ON CONFLICT (recipient_id, event_key) DO NOTHING;
  END IF;

  RETURN kiru_private.renewal_json(r, false) || jsonb_build_object('found', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.kiru_renewal_choose_months(p_id uuid, p_plan text, p_months integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r public.kiru_renewals;
  me uuid := kiru_private.active_uid();
BEGIN
  IF p_plan NOT IN ('mantener', 'subir', 'bajar', 'no_renueva') THEN
    RAISE EXCEPTION 'Opción no válida.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.kiru_renewals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR NOT kiru_private.is_guardian_of(r.student_id) THEN
    RAISE EXCEPTION 'No encontramos esta renovación.' USING ERRCODE = '42501';
  END IF;
  IF r.plan IS NOT NULL OR r.closed_at IS NOT NULL THEN
    RETURN kiru_private.renewal_json(r, true);
  END IF;
  IF (p_plan = 'subir' AND r.up_label IS NULL) OR (p_plan = 'bajar' AND r.down_label IS NULL) THEN
    RAISE EXCEPTION 'Esta opción no está disponible.' USING ERRCODE = '22023';
  END IF;
  IF p_plan = 'no_renueva' THEN p_months := 1; END IF;
  IF p_months IS NULL OR NOT kiru_private.renewal_months_ok(r, p_plan, p_months) THEN
    RAISE EXCEPTION 'Esta opción de pago no está disponible.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.kiru_renewals
  SET plan = p_plan, months = p_months, plan_source = 'campus', plan_at = now(), plan_by = me, campus_seq = campus_seq + 1
  WHERE id = r.id
  RETURNING * INTO r;
  RETURN kiru_private.renewal_json(r, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.kiru_renewal_from_email_months(p_email text, p_student text, p_period_end date, p_action text, p_months integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  sid uuid := kiru_private.renewal_student(p_email, p_student);
  r public.kiru_renewals;
BEGIN
  IF p_action NOT IN ('mantener', 'subir', 'bajar', 'no_renueva', 'pagado') THEN
    RAISE EXCEPTION 'Opción no válida.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.kiru_renewals
  WHERE student_id = sid AND period_end = p_period_end FOR UPDATE;
  IF sid IS NULL OR NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF p_action = 'pagado' THEN
    IF r.paid_reported_at IS NOT NULL OR r.closed_at IS NOT NULL OR r.plan = 'no_renueva' THEN
      RETURN kiru_private.renewal_json(r, true) || jsonb_build_object('found', true);
    END IF;
    UPDATE public.kiru_renewals SET paid_reported_at = now(), paid_source = 'correo'
    WHERE id = r.id RETURNING * INTO r;
    PERFORM kiru_private.renewal_payment_reported(r, 'correo', NULL);
  ELSE
    IF r.plan IS NOT NULL OR r.closed_at IS NOT NULL THEN
      RETURN kiru_private.renewal_json(r, true) || jsonb_build_object('found', true);
    END IF;
    IF (p_action = 'subir' AND r.up_label IS NULL) OR (p_action = 'bajar' AND r.down_label IS NULL) THEN
      RAISE EXCEPTION 'Esta opción no está disponible.' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'no_renueva' THEN p_months := 1; END IF;
    IF p_months IS NULL OR NOT kiru_private.renewal_months_ok(r, p_action, p_months) THEN
      RAISE EXCEPTION 'Esta opción de pago no está disponible.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.kiru_renewals SET plan = p_action, months = p_months, plan_source = 'correo', plan_at = now()
    WHERE id = r.id RETURNING * INTO r;
  END IF;
  RETURN kiru_private.renewal_json(r, false) || jsonb_build_object('found', true);
END;
$function$;

-- La sincronización con la hoja: igual que antes, con la etiqueta y el precio de «bajar».
CREATE OR REPLACE FUNCTION public.kiru_renewal_sync(p_families jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  f jsonb;
  sid uuid;
  pending jsonb;
BEGIN
  FOR f IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_families) = 'array' THEN p_families ELSE '[]'::jsonb END)
  LOOP
    sid := kiru_private.renewal_student(f ->> 'email', f ->> 'alumno');
    CONTINUE WHEN sid IS NULL;
    IF jsonb_typeof(f -> 'datos') = 'object' THEN
      PERFORM kiru_private.renewal_upsert(f -> 'datos', false);
      IF to_regprocedure('kiru_private.renewal_period(jsonb)') IS NOT NULL THEN
        EXECUTE 'SELECT kiru_private.renewal_period($1)' USING f -> 'datos';
      END IF;
    ELSIF nullif(f ->> 'fin', '') IS NOT NULL THEN
      UPDATE public.kiru_renewals SET closed_at = now()
      WHERE student_id = sid AND period_end < (f ->> 'fin')::date AND closed_at IS NULL;
    END IF;
    IF jsonb_typeof(f -> 'pagos') = 'array' AND to_regprocedure('kiru_private.payments_from_sheet(uuid,jsonb)') IS NOT NULL THEN
      EXECUTE 'SELECT kiru_private.payments_from_sheet($1, $2)' USING sid, f -> 'pagos';
    END IF;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'seq', r.campus_seq, 'alumno', r.sheet_student, 'email', r.guardian_email,
      'fin', r.period_end, 'plan', r.plan, 'plan_source', r.plan_source, 'meses', r.months,
      'plan_label', kiru_private.renewal_plan_label(r),
      'plan_price', kiru_private.renewal_plan_price(r),
      'total', kiru_private.renewal_total(r),
      'paid_reported_at', r.paid_reported_at, 'paid_source', r.paid_source,
      'familia', coalesce(nullif(pp.full_name, ''), nullif(pb.full_name, ''), '')
    ) ORDER BY r.updated_at), '[]'::jsonb)
  INTO pending
  FROM public.kiru_renewals r
  LEFT JOIN public.profiles pp ON pp.id = r.plan_by
  LEFT JOIN public.profiles pb ON pb.id = r.paid_by
  WHERE r.campus_seq > r.sheet_seq;

  RETURN jsonb_build_object('pendientes', pending);
END;
$function$;

-- El pago comunicado: igual que antes, contando «bajar» y hasta 7 días por semana.
CREATE OR REPLACE FUNCTION kiru_private.renewal_payment_reported(r public.kiru_renewals, p_source text, p_by uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_months int := CASE WHEN r.plan IN ('mantener', 'subir', 'bajar') THEN r.months ELSE 1 END;
  v_start date := coalesce((r.paid_reported_at AT TIME ZONE 'Europe/Madrid')::date, (now() AT TIME ZONE 'Europe/Madrid')::date);
  v_end date;
  v_label text := CASE WHEN r.plan IN ('mantener', 'subir', 'bajar') THEN kiru_private.renewal_plan_label(r) END;
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

  v_match := regexp_match(lower(coalesce(v_label, '')), '([1-7])\s*d[ií]as?');
  IF v_match IS NOT NULL THEN
    v_days := v_match[1]::smallint;
  ELSE
    SELECT nullif(count(*), 0)::smallint INTO v_days
    FROM public.kiru_student_schedule_slots s
    WHERE s.student_id = r.student_id AND s.is_active;
  END IF;

  SELECT nullif(count(*), 0)::smallint INTO v_sessions
  FROM public.kiru_student_schedule_slots s
  CROSS JOIN LATERAL generate_series(v_start::timestamp, (v_end - 1)::timestamp, interval '1 day') AS scheduled_day(day)
  WHERE s.student_id = r.student_id
    AND s.is_active
    AND extract(isodow FROM scheduled_day.day)::smallint = s.weekday
    AND NOT EXISTS (SELECT 1 FROM public.kiru_no_class_days d WHERE d.is_active AND d.day = scheduled_day.day::date);

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

-- 3. Cambios de horario -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_schedule_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  renewal_id uuid UNIQUE REFERENCES public.kiru_renewals(id) ON DELETE SET NULL,
  from_days smallint NOT NULL CHECK (from_days BETWEEN 0 AND 7),
  to_days smallint NOT NULL CHECK (to_days BETWEEN 1 AND 7),
  effective_from date NOT NULL,
  status text NOT NULL DEFAULT 'elegir_familia'
    CHECK (status IN ('elegir_familia', 'confirmar_mentor', 'confirmado', 'aplicado', 'cancelado')),
  -- El horario semanal completo que quedará: [{"weekday": 2, "start": "17:45", "end": "18:45"}]
  chosen_slots jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(chosen_slots) = 'array'),
  family_note text NOT NULL DEFAULT '' CHECK (length(family_note) <= 600),
  mentor_note text NOT NULL DEFAULT '' CHECK (length(mentor_note) <= 600),
  chosen_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  chosen_at timestamptz,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  applied_at timestamptz,
  sheet_synced_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kiru_schedule_changes_open_idx ON public.kiru_schedule_changes (student_id)
  WHERE status IN ('elegir_familia', 'confirmar_mentor', 'confirmado');
CREATE INDEX IF NOT EXISTS kiru_schedule_changes_mentor_idx ON public.kiru_schedule_changes (mentor_id, status);
COMMENT ON TABLE public.kiru_schedule_changes IS
  'Cambio de horario tras subir o bajar la intensidad en la renovación: la familia elige, el mentor confirma y se aplica al empezar la nueva mensualidad.';

CREATE TRIGGER kiru_schedule_changes_touch
BEFORE UPDATE ON public.kiru_schedule_changes
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

ALTER TABLE public.kiru_schedule_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_schedule_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_schedule_changes TO authenticated;
GRANT ALL ON public.kiru_schedule_changes TO service_role;
CREATE POLICY kiru_schedule_changes_read ON public.kiru_schedule_changes
FOR SELECT TO authenticated USING (
  (SELECT kiru_private.is_admin())
  OR kiru_private.is_guardian_of(student_id)
  OR mentor_id = (SELECT kiru_private.active_uid())
);

-- Avisos de cambios de horario (campanita + correo).
CREATE OR REPLACE FUNCTION kiru_private.schedule_notify(p_change uuid, p_recipients uuid[], p_kind text, p_title text, p_body text, p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.kiru_notifications (recipient_id, student_id, kind, title, body, event_key, email_status)
  SELECT r, c.student_id, p_kind, left(p_title, 200), left(p_body, 1000), 'horario:' || p_change || ':' || p_key, 'pendiente'
  FROM public.kiru_schedule_changes c, unnest(p_recipients) AS r
  WHERE c.id = p_change AND r IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r AND p.is_active)
  ON CONFLICT (recipient_id, event_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION kiru_private.schedule_notify(uuid, uuid[], text, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.student_guardians_ids(p_student uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(sg.guardian_id), '{}')
  FROM public.student_guardians sg
  JOIN public.profiles p ON p.id = sg.guardian_id AND p.is_active AND p.role = 'padre'
  WHERE sg.student_id = p_student
$$;
REVOKE ALL ON FUNCTION kiru_private.student_guardians_ids(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.weekday_name(d int)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT (ARRAY['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])[d] $$;

-- «martes 17:45 y sábado 11:00»
CREATE OR REPLACE FUNCTION kiru_private.slots_text(p jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(regexp_replace(string_agg(kiru_private.weekday_name((x ->> 'weekday')::int) || ' ' || (x ->> 'start'), ', '
                                 ORDER BY (x ->> 'weekday')::int, x ->> 'start'), ', ([^,]*)$', ' y \1'), '')
  FROM jsonb_array_elements(coalesce(p, '[]'::jsonb)) x
$$;
REVOKE ALL ON FUNCTION kiru_private.weekday_name(int), kiru_private.slots_text(jsonb) FROM PUBLIC;

-- Horario actual del alumno en formato de franjas.
CREATE OR REPLACE FUNCTION kiru_private.student_slots(p_student uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('weekday', s.weekday, 'start', to_char(s.start_time, 'HH24:MI'),
                                               'end', to_char(s.end_time, 'HH24:MI')) ORDER BY s.weekday, s.start_time), '[]'::jsonb)
  FROM public.kiru_student_schedule_slots s
  WHERE s.student_id = p_student AND s.is_active
$$;
REVOKE ALL ON FUNCTION kiru_private.student_slots(uuid) FROM PUBLIC;

-- Opciones de horario para un cambio: las clases que el alumno ya tiene (si
-- siguen siendo con ese mentor) y los huecos libres del mentor (cada media
-- hora dentro de su disponibilidad), sin pisar las clases de otros alumnos ni
-- los horarios que otras familias ya han elegido y están por confirmar.
CREATE OR REPLACE FUNCTION kiru_private.schedule_options(p_change uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.kiru_schedule_changes;
  v_minutes int;
  v_current jsonb;
  v_free jsonb;
BEGIN
  SELECT * INTO c FROM public.kiru_schedule_changes WHERE id = p_change;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(round(avg(extract(epoch FROM (s.end_time - s.start_time)) / 60))::int, 60) INTO v_minutes
  FROM public.kiru_student_schedule_slots s WHERE s.student_id = c.student_id AND s.is_active;
  v_minutes := greatest(30, least(v_minutes, 180));

  SELECT coalesce(jsonb_agg(jsonb_build_object('weekday', s.weekday, 'start', to_char(s.start_time, 'HH24:MI'),
                                               'end', to_char(s.end_time, 'HH24:MI'), 'current', true)
                            ORDER BY s.weekday, s.start_time), '[]'::jsonb)
  INTO v_current
  FROM public.kiru_student_schedule_slots s
  WHERE s.student_id = c.student_id AND s.is_active AND (c.mentor_id IS NULL OR s.mentor_id = c.mentor_id);

  WITH avail AS (
    SELECT (x ->> 'weekday')::int AS d, (x ->> 'start')::time AS s, (x ->> 'end')::time AS e
    FROM public.kiru_mentor_class_availability a, jsonb_array_elements(a.slots) x
    WHERE a.mentor_id = c.mentor_id
  ), starts AS (
    SELECT a.d, t::time AS s, (t + make_interval(mins => v_minutes))::time AS e
    FROM avail a
    CROSS JOIN LATERAL generate_series('2000-01-01'::timestamp + a.s,
                                       '2000-01-01'::timestamp + a.e - make_interval(mins => v_minutes),
                                       interval '30 minutes') AS t
    WHERE '2000-01-01'::timestamp + a.e - make_interval(mins => v_minutes) >= '2000-01-01'::timestamp + a.s
  ), busy AS (
    SELECT s.weekday::int AS d, s.start_time AS s, s.end_time AS e
    FROM public.kiru_student_schedule_slots s
    WHERE s.mentor_id = c.mentor_id AND s.is_active AND s.student_id <> c.student_id
    UNION ALL
    SELECT (x ->> 'weekday')::int, (x ->> 'start')::time, (x ->> 'end')::time
    FROM public.kiru_schedule_changes o, jsonb_array_elements(o.chosen_slots) x
    WHERE o.mentor_id = c.mentor_id AND o.id <> c.id AND o.student_id <> c.student_id
      AND o.status IN ('confirmar_mentor', 'confirmado')
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('weekday', st.d, 'start', to_char(st.s, 'HH24:MI'),
                                               'end', to_char(st.e, 'HH24:MI'), 'current', false)
                            ORDER BY st.d, st.s), '[]'::jsonb)
  INTO v_free
  FROM starts st
  WHERE NOT EXISTS (SELECT 1 FROM busy b WHERE b.d = st.d AND b.s < st.e AND b.e > st.s)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_current) cur
                    WHERE (cur ->> 'weekday')::int = st.d AND (cur ->> 'start')::time = st.s);

  RETURN v_current || v_free;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.schedule_options(uuid) FROM PUBLIC;

-- Al elegir subir o bajar en la renovación (correo o campus) se abre el cambio de horario.
CREATE OR REPLACE FUNCTION kiru_private.renewal_open_schedule_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_change uuid;
  v_mentor uuid;
  v_from smallint;
  v_to smallint;
  v_match text[];
  v_name text;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_avail public.kiru_mentor_class_availability;
BEGIN
  IF NEW.plan IS NULL OR NEW.plan NOT IN ('subir', 'bajar') OR (TG_OP = 'UPDATE' AND OLD.plan IS NOT DISTINCT FROM NEW.plan) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.kiru_schedule_changes WHERE renewal_id = NEW.id) THEN RETURN NEW; END IF;

  SELECT count(*)::smallint INTO v_from FROM public.kiru_student_schedule_slots WHERE student_id = NEW.student_id AND is_active;
  v_match := regexp_match(lower(kiru_private.renewal_plan_label(NEW)), '([1-7])\s*d[ií]as?');
  v_to := CASE WHEN v_match IS NOT NULL THEN v_match[1]::smallint
               WHEN NEW.plan = 'subir' THEN least(v_from + 1, 7)
               ELSE greatest(v_from - 1, 1) END;
  SELECT sm.mentor_id INTO v_mentor FROM public.student_mentors sm
  JOIN public.profiles p ON p.id = sm.mentor_id AND p.is_active
  WHERE sm.student_id = NEW.student_id
  ORDER BY (SELECT count(*) FROM public.kiru_student_schedule_slots s WHERE s.student_id = NEW.student_id AND s.mentor_id = sm.mentor_id AND s.is_active) DESC
  LIMIT 1;

  -- Si ya había un cambio abierto (de otra renovación), se cancela: vale el último.
  UPDATE public.kiru_schedule_changes SET status = 'cancelado'
  WHERE student_id = NEW.student_id AND status IN ('elegir_familia', 'confirmar_mentor', 'confirmado');

  INSERT INTO public.kiru_schedule_changes (student_id, mentor_id, renewal_id, from_days, to_days, effective_from)
  VALUES (NEW.student_id, v_mentor, NEW.id, v_from, v_to, greatest(NEW.period_end, v_today + 1))
  RETURNING id INTO v_change;

  SELECT split_part(coalesce(full_name, ''), ' ', 1) INTO v_name FROM public.profiles WHERE id = NEW.student_id;
  PERFORM kiru_private.schedule_notify(v_change, kiru_private.student_guardians_ids(NEW.student_id), 'horario_elegir',
    'Elige el nuevo horario de ' || coalesce(nullif(v_name, ''), 'tu hijo/a'),
    'Habéis elegido ' || lower(kiru_private.renewal_plan_label(NEW)) || ' a partir del '
      || to_char(greatest(NEW.period_end, v_today + 1), 'DD/MM') || '. Entra en el campus y elige '
      || CASE WHEN NEW.plan = 'bajar' THEN 'qué día' || CASE WHEN v_to > 1 THEN 's' ELSE '' END || ' queréis conservar.'
              ELSE 'el nuevo día y hora entre los huecos libres de su mentor.' END,
    'elegir');

  -- Si al subir el mentor no tiene la disponibilidad al día, se le pide que la actualice.
  IF NEW.plan = 'subir' AND v_mentor IS NOT NULL THEN
    SELECT * INTO v_avail FROM public.kiru_mentor_class_availability WHERE mentor_id = v_mentor;
    IF NOT FOUND OR jsonb_array_length(v_avail.slots) = 0 OR v_avail.updated_at < now() - interval '30 days' THEN
      PERFORM kiru_private.schedule_notify(v_change, ARRAY[v_mentor], 'disponibilidad_actualizar',
        'Actualiza tu disponibilidad para dar clase',
        coalesce(nullif(v_name, ''), 'Un alumno') || ' va a tener una clase más a la semana. Marca en tu panel los días y horas en los que puedes dar clase para que su familia elija el nuevo horario.',
        'disponibilidad');
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.renewal_open_schedule_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS kiru_renewals_schedule_change ON public.kiru_renewals;
CREATE TRIGGER kiru_renewals_schedule_change
AFTER INSERT OR UPDATE OF plan ON public.kiru_renewals
FOR EACH ROW EXECUTE FUNCTION kiru_private.renewal_open_schedule_change();

-- Lo que ve la familia o el mentor de un cambio (con las opciones si le toca elegir).
CREATE OR REPLACE FUNCTION public.kiru_horario_ver(p_change uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.kiru_schedule_changes;
  me uuid := kiru_private.active_uid();
  r public.kiru_renewals;
BEGIN
  SELECT * INTO c FROM public.kiru_schedule_changes WHERE id = p_change;
  IF NOT FOUND OR me IS NULL OR NOT (kiru_private.is_guardian_of(c.student_id) OR c.mentor_id = me OR kiru_private.is_admin()) THEN
    RAISE EXCEPTION 'No encontramos este cambio de horario.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.kiru_renewals WHERE id = c.renewal_id;
  RETURN jsonb_build_object(
    'id', c.id, 'status', c.status, 'from_days', c.from_days, 'to_days', c.to_days,
    'effective_from', c.effective_from, 'chosen_slots', c.chosen_slots,
    'family_note', c.family_note, 'mentor_note', c.mentor_note,
    'plan', r.plan, 'plan_label', kiru_private.renewal_plan_label(r), 'plan_price', kiru_private.renewal_plan_price(r),
    'current_slots', kiru_private.student_slots(c.student_id),
    'student', (SELECT full_name FROM public.profiles WHERE id = c.student_id),
    'mentor', (SELECT full_name FROM public.profiles WHERE id = c.mentor_id),
    'mentor_has_availability', EXISTS (SELECT 1 FROM public.kiru_mentor_class_availability a
                                       WHERE a.mentor_id = c.mentor_id AND jsonb_array_length(a.slots) > 0),
    'options', CASE WHEN c.status = 'elegir_familia' THEN kiru_private.schedule_options(c.id) ELSE '[]'::jsonb END
  );
END
$$;
REVOKE ALL ON FUNCTION public.kiru_horario_ver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_horario_ver(uuid) TO authenticated;

-- La familia elige el horario completo que quedará (to_days franjas, una por día).
CREATE OR REPLACE FUNCTION public.kiru_horario_elegir(p_change uuid, p_slots jsonb, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.kiru_schedule_changes;
  me uuid := kiru_private.active_uid();
  v_options jsonb;
  v_clean jsonb;
  v_name text;
BEGIN
  SELECT * INTO c FROM public.kiru_schedule_changes WHERE id = p_change FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR NOT (kiru_private.is_guardian_of(c.student_id) OR kiru_private.is_admin()) THEN
    RAISE EXCEPTION 'No encontramos este cambio de horario.' USING ERRCODE = '42501';
  END IF;
  IF c.status <> 'elegir_familia' THEN
    RAISE EXCEPTION 'Este horario ya está elegido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_slots) IS DISTINCT FROM 'array' OR jsonb_array_length(p_slots) <> c.to_days THEN
    RAISE EXCEPTION 'Elige % día%.', c.to_days, CASE WHEN c.to_days > 1 THEN 's' ELSE '' END USING ERRCODE = '22023';
  END IF;
  v_options := kiru_private.schedule_options(c.id);
  SELECT jsonb_agg(jsonb_build_object('weekday', (o ->> 'weekday')::int, 'start', o ->> 'start', 'end', o ->> 'end')
                   ORDER BY (o ->> 'weekday')::int, o ->> 'start')
  INTO v_clean
  FROM jsonb_array_elements(p_slots) x
  JOIN jsonb_array_elements(v_options) o
    ON (o ->> 'weekday')::int = (x ->> 'weekday')::int AND o ->> 'start' = x ->> 'start';
  IF v_clean IS NULL OR jsonb_array_length(v_clean) <> c.to_days THEN
    RAISE EXCEPTION 'Alguna de las horas ya no está libre. Vuelve a elegir.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT (x ->> 'weekday')) FROM jsonb_array_elements(v_clean) x) <> c.to_days THEN
    RAISE EXCEPTION 'Elige días distintos.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.kiru_schedule_changes
  SET chosen_slots = v_clean, family_note = left(coalesce(p_note, ''), 600), chosen_by = me, chosen_at = now(),
      status = 'confirmar_mentor', mentor_note = '', reminded_at = NULL
  WHERE id = c.id RETURNING * INTO c;

  SELECT split_part(coalesce(full_name, ''), ' ', 1) INTO v_name FROM public.profiles WHERE id = c.student_id;
  PERFORM kiru_private.schedule_notify(c.id, ARRAY[c.mentor_id], 'horario_confirmar',
    'Confirma el nuevo horario de ' || coalesce(nullif(v_name, ''), 'tu alumno'),
    'Su familia ha elegido: ' || kiru_private.slots_text(v_clean) || ', a partir del ' || to_char(c.effective_from, 'DD/MM')
      || '. Entra en tu panel para confirmarlo o pedir otro horario.',
    'confirmar:' || extract(epoch FROM c.chosen_at)::bigint);
  RETURN jsonb_build_object('ok', true, 'status', c.status, 'chosen_slots', c.chosen_slots);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_horario_elegir(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_horario_elegir(uuid, jsonb, text) TO authenticated;

-- Aplica los cambios confirmados cuya fecha ha llegado: cambia el horario semanal
-- y rehace las clases futuras. Repetirla no hace nada nuevo.
CREATE OR REPLACE FUNCTION public.kiru_horarios_aplicar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.kiru_schedule_changes;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_count int := 0;
BEGIN
  FOR c IN SELECT * FROM public.kiru_schedule_changes
           WHERE status = 'confirmado' AND effective_from <= v_today AND mentor_id IS NOT NULL
           ORDER BY effective_from FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.kiru_student_schedule_slots s SET is_active = false, updated_at = now()
    WHERE s.student_id = c.student_id AND s.is_active
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.chosen_slots) x
                      WHERE (x ->> 'weekday')::int = s.weekday AND (x ->> 'start')::time = s.start_time
                        AND s.mentor_id = c.mentor_id);
    INSERT INTO public.kiru_student_schedule_slots (student_id, mentor_id, weekday, start_time, end_time, is_active, source)
    SELECT c.student_id, c.mentor_id, (x ->> 'weekday')::smallint, (x ->> 'start')::time, (x ->> 'end')::time, true, 'campus'
    FROM jsonb_array_elements(c.chosen_slots) x
    ON CONFLICT (student_id, weekday, start_time) DO UPDATE
    SET mentor_id = excluded.mentor_id, end_time = excluded.end_time, is_active = true, updated_at = now();
    UPDATE public.kiru_schedule_changes SET status = 'aplicado', applied_at = now() WHERE id = c.id;
    v_count := v_count + 1;
  END LOOP;
  IF v_count > 0 AND to_regprocedure('public.kiru_clases_generar(date,date)') IS NOT NULL THEN
    PERFORM public.kiru_clases_generar(NULL, NULL);
  END IF;
  RETURN v_count;
END
$$;
REVOKE ALL ON FUNCTION public.kiru_horarios_aplicar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_horarios_aplicar() TO service_role;

-- El mentor (o administración) confirma o pide otro horario.
CREATE OR REPLACE FUNCTION public.kiru_horario_decidir(p_change uuid, p_ok boolean, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.kiru_schedule_changes;
  me uuid := kiru_private.active_uid();
  v_name text;
  v_note text := left(trim(coalesce(p_note, '')), 600);
BEGIN
  SELECT * INTO c FROM public.kiru_schedule_changes WHERE id = p_change FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR NOT (c.mentor_id = me OR kiru_private.is_admin()) THEN
    RAISE EXCEPTION 'No encontramos este cambio de horario.' USING ERRCODE = '42501';
  END IF;
  IF c.status <> 'confirmar_mentor' THEN
    RAISE EXCEPTION 'Este horario ya no está pendiente de confirmar.' USING ERRCODE = '22023';
  END IF;
  IF NOT p_ok AND v_note = '' THEN
    RAISE EXCEPTION 'Cuéntale a la familia por qué no te encaja (por ejemplo, qué otro día podrías).' USING ERRCODE = '22023';
  END IF;
  SELECT split_part(coalesce(full_name, ''), ' ', 1) INTO v_name FROM public.profiles WHERE id = c.student_id;

  IF p_ok THEN
    UPDATE public.kiru_schedule_changes
    SET status = 'confirmado', decided_by = me, decided_at = now(), mentor_note = v_note
    WHERE id = c.id RETURNING * INTO c;
    PERFORM kiru_private.schedule_notify(c.id, kiru_private.student_guardians_ids(c.student_id), 'horario_confirmado',
      'Nuevo horario de ' || coalesce(nullif(v_name, ''), 'tu hijo/a') || ' confirmado',
      'A partir del ' || to_char(c.effective_from, 'DD/MM') || ' las clases serán: ' || kiru_private.slots_text(c.chosen_slots) || '.'
        || CASE WHEN v_note <> '' THEN ' Nota del mentor: ' || v_note ELSE '' END,
      'confirmado');
    PERFORM public.kiru_horarios_aplicar();
  ELSE
    UPDATE public.kiru_schedule_changes
    SET status = 'elegir_familia', decided_by = me, decided_at = now(), mentor_note = v_note, chosen_slots = '[]'::jsonb, reminded_at = NULL
    WHERE id = c.id RETURNING * INTO c;
    PERFORM kiru_private.schedule_notify(c.id, kiru_private.student_guardians_ids(c.student_id), 'horario_otro',
      'Elige otro horario para ' || coalesce(nullif(v_name, ''), 'tu hijo/a'),
      'El horario elegido no le encaja al mentor: ' || v_note || ' Entra en el campus y elige otro.',
      'otro:' || extract(epoch FROM c.decided_at)::bigint);
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', c.status);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_horario_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_horario_decidir(uuid, boolean, text) TO authenticated;

-- Administración puede cancelar un cambio (p. ej. si la familia luego no renueva).
CREATE OR REPLACE FUNCTION public.kiru_horario_cancelar(p_change uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT kiru_private.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede cancelar un cambio de horario.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.kiru_schedule_changes SET status = 'cancelado'
  WHERE id = p_change AND status IN ('elegir_familia', 'confirmar_mentor', 'confirmado');
  RETURN jsonb_build_object('ok', FOUND);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_horario_cancelar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_horario_cancelar(uuid) TO authenticated;

-- Tarea diaria: aplica los cambios del día, recuerda a quien lleve 2 días sin
-- responder (una sola vez) y, el día 1 de cada mes, pide a los mentores con
-- alumnos que revisen su disponibilidad si hace más de 30 días que no la tocan
-- (un aviso al mes como mucho).
CREATE OR REPLACE FUNCTION public.kiru_horarios_tarea_diaria()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_applied int;
  v_reminders int := 0;
  v_mentors int := 0;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  c record;
BEGIN
  v_applied := public.kiru_horarios_aplicar();

  FOR c IN SELECT ch.*, split_part(coalesce(p.full_name, ''), ' ', 1) AS name
           FROM public.kiru_schedule_changes ch JOIN public.profiles p ON p.id = ch.student_id
           WHERE ch.status IN ('elegir_familia', 'confirmar_mentor') AND ch.reminded_at IS NULL
             AND greatest(ch.created_at, coalesce(ch.chosen_at, ch.created_at), coalesce(ch.decided_at, ch.created_at)) < now() - interval '2 days'
  LOOP
    IF c.status = 'elegir_familia' THEN
      PERFORM kiru_private.schedule_notify(c.id, kiru_private.student_guardians_ids(c.student_id), 'horario_elegir',
        'Recordatorio: elige el nuevo horario de ' || coalesce(nullif(c.name, ''), 'tu hijo/a'),
        'Para que las clases sigan sin cortes a partir del ' || to_char(c.effective_from, 'DD/MM') || ', entra en el campus y elige el horario.',
        'recordatorio');
    ELSE
      PERFORM kiru_private.schedule_notify(c.id, ARRAY[c.mentor_id], 'horario_confirmar',
        'Recordatorio: confirma el nuevo horario de ' || coalesce(nullif(c.name, ''), 'tu alumno'),
        'La familia eligió ' || kiru_private.slots_text(c.chosen_slots) || '. Confírmalo o pide otro horario desde tu panel.',
        'recordatorio');
    END IF;
    UPDATE public.kiru_schedule_changes SET reminded_at = now() WHERE id = c.id;
    v_reminders := v_reminders + 1;
  END LOOP;

  IF extract(day FROM v_today) = 1 THEN
    WITH due AS (
      SELECT DISTINCT p.id
      FROM public.profiles p
      JOIN public.student_mentors sm ON sm.mentor_id = p.id
      LEFT JOIN public.kiru_mentor_class_availability a ON a.mentor_id = p.id
      WHERE p.role = 'mentor' AND p.is_active
        AND (a.mentor_id IS NULL OR a.updated_at < now() - interval '30 days')
    ), sent AS (
      INSERT INTO public.kiru_notifications (recipient_id, kind, title, body, event_key, email_status)
      SELECT id, 'disponibilidad_actualizar', '¿Sigue igual tu disponibilidad?',
             'Revisa en tu panel los días y horas en los que puedes dar clase este mes. Así las familias que cambian de horario ven huecos reales.',
             'disponibilidad:' || to_char(v_today, 'YYYY-MM'), 'pendiente'
      FROM due
      ON CONFLICT (recipient_id, event_key) DO NOTHING
      RETURNING recipient_id
    )
    SELECT count(*) INTO v_mentors FROM sent;
  END IF;

  RETURN jsonb_build_object('aplicados', v_applied, 'recordatorios', v_reminders, 'mentores_avisados', v_mentors);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_horarios_tarea_diaria() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_horarios_tarea_diaria() TO service_role;

-- Para la hoja «Familias»: cambios aplicados que la hoja todavía no ha apuntado.
CREATE OR REPLACE FUNCTION public.kiru_horarios_para_hoja()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'alumno', coalesce(r.sheet_student, p.full_name), 'email', coalesce(r.guardian_email, ''),
      'dias', c.to_days, 'precio', kiru_private.renewal_plan_price(r), 'plan', r.plan,
      'horario', kiru_private.slots_text(c.chosen_slots), 'desde', c.effective_from
    ) ORDER BY c.applied_at), '[]'::jsonb)
  FROM public.kiru_schedule_changes c
  JOIN public.profiles p ON p.id = c.student_id
  LEFT JOIN public.kiru_renewals r ON r.id = c.renewal_id
  WHERE c.status = 'aplicado' AND c.sheet_synced_at IS NULL
$$;
CREATE OR REPLACE FUNCTION public.kiru_horarios_hoja_ok(p_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH done AS (
    UPDATE public.kiru_schedule_changes SET sheet_synced_at = now()
    WHERE id = ANY (p_ids) AND status = 'aplicado' AND sheet_synced_at IS NULL RETURNING id
  ) SELECT count(*)::int FROM done
$$;
REVOKE ALL ON FUNCTION public.kiru_horarios_para_hoja(), public.kiru_horarios_hoja_ok(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_horarios_para_hoja(), public.kiru_horarios_hoja_ok(uuid[]) TO service_role;

-- 4. Tarea programada (antes de la de clases, que rehace las clases del día) ---------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiru_horarios_diaria';
      -- 03:05 UTC (04:05 o 05:05 en Madrid).
      PERFORM cron.schedule('kiru_horarios_diaria', '5 3 * * *', 'SELECT public.kiru_horarios_tarea_diaria()');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'pg_cron no disponible (%); la tarea diaria se ejecutará desde Vercel Cron.', SQLERRM;
    END;
  END IF;
END
$cron$;
