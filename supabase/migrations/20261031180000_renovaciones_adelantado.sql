-- Renovaciones: tarjeta «Vuestra mensualidad» siempre visible y pago por
-- adelantado de varios meses con los descuentos de la web.
--
-- · El Apps Script copia aquí en cada sincronización (cada 10 min) la
--   mensualidad en curso de todas las familias, sin avisar en la campanita: la
--   familia puede dejar pagado el mes siguiente cuando quiera. La campanita y
--   el correo siguen llegando solo 7 días antes del fin (kiru_renewal_publish).
-- · prepay guarda las opciones de pago adelantado que calcula el script, por
--   plan: {"mantener": [{"meses": 3, "total": 997.5, "ahorro": 52.5, "pct": 5}, …], "subir": […]}.
--   months es lo que eligió la familia (1 = solo el mes siguiente).

ALTER TABLE public.kiru_renewals
  ADD COLUMN months smallint NOT NULL DEFAULT 1 CHECK (months BETWEEN 1 AND 12),
  ADD COLUMN prepay jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(prepay) = 'object');

-- Opciones de pago adelantado que llegan del script, ya limpias.
CREATE OR REPLACE FUNCTION kiru_private.renewal_prepay(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_object_agg(plan, opts), '{}'::jsonb)
  FROM (
    SELECT plan, jsonb_agg(jsonb_build_object(
        'meses', (o ->> 'meses')::int,
        'total', round((o ->> 'total')::numeric, 2),
        'ahorro', greatest(round(coalesce((o ->> 'ahorro')::numeric, 0), 2), 0),
        'pct', greatest(coalesce((o ->> 'pct')::numeric, 0), 0)
      ) ORDER BY (o ->> 'meses')::int) AS opts
    FROM unnest(ARRAY['mantener', 'subir']) AS plan,
         jsonb_array_elements(CASE WHEN jsonb_typeof(p -> plan) = 'array' THEN p -> plan ELSE '[]'::jsonb END) o
    WHERE jsonb_typeof(o) = 'object'
      AND (o ->> 'meses') ~ '^\d{1,2}$' AND (o ->> 'meses')::int BETWEEN 2 AND 12
      AND (o ->> 'total') ~ '^\d+(\.\d+)?$' AND (o ->> 'total')::numeric < 100000
      AND coalesce(o ->> 'ahorro', '0') ~ '^-?\d+(\.\d+)?$' AND coalesce(o ->> 'pct', '0') ~ '^\d+(\.\d+)?$'
    GROUP BY plan
  ) x
$$;

-- ¿Se puede elegir este número de meses para este plan?
CREATE OR REPLACE FUNCTION kiru_private.renewal_months_ok(r public.kiru_renewals, p_plan text, p_months int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_months = 1 OR (p_plan IN ('mantener', 'subir') AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(r.prepay -> p_plan, '[]'::jsonb)) o
    WHERE (o ->> 'meses')::int = p_months
  ))
$$;

-- Importe de lo elegido (mes suelto o pago adelantado).
CREATE OR REPLACE FUNCTION kiru_private.renewal_total(r public.kiru_renewals)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN r.plan NOT IN ('mantener', 'subir') OR r.plan IS NULL THEN NULL
    WHEN r.months = 1 THEN CASE r.plan WHEN 'mantener' THEN r.keep_price ELSE r.up_price END
    ELSE (SELECT (o ->> 'total')::numeric FROM jsonb_array_elements(coalesce(r.prepay -> r.plan, '[]'::jsonb)) o
          WHERE (o ->> 'meses')::int = r.months LIMIT 1)
  END
$$;

CREATE OR REPLACE FUNCTION kiru_private.renewal_json(r public.kiru_renewals, already boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'plan', r.plan, 'plan_source', r.plan_source, 'meses', r.months,
    'total', kiru_private.renewal_total(r),
    'paid_reported', r.paid_reported_at IS NOT NULL, 'paid_source', r.paid_source,
    'closed', r.closed_at IS NOT NULL, 'already', already
  )
$$;

-- Crea o actualiza la mensualidad en curso de un alumno. Con p_notify avisa en
-- la campanita (solo cuando sale el correo de renovación, 7 días antes).
CREATE OR REPLACE FUNCTION kiru_private.renewal_upsert(p_data jsonb, p_notify boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  sid uuid := kiru_private.renewal_student(p_data ->> 'email', p_data ->> 'alumno');
  fin date := (p_data ->> 'fin')::date;
  r public.kiru_renewals;
  student_name text;
  prepay jsonb := kiru_private.renewal_prepay(p_data -> 'adelantado');
  -- Lo que ya estuviera apuntado en la hoja (al conectar con el campus a mitad de mes).
  sheet_plan text := CASE WHEN p_data ->> 'plan' IN ('mantener', 'no_renueva')
                            OR (p_data ->> 'plan' = 'subir' AND nullif(p_data ->> 'subir_etiqueta', '') IS NOT NULL)
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
    keep_label, keep_price, up_label, up_price, payment_info, call_url, prepay,
    plan, plan_source, plan_at, months, paid_reported_at, paid_source)
  VALUES (sid, fin, trim(p_data ->> 'alumno'), lower(trim(p_data ->> 'email')), coalesce(p_data ->> 'mentor', ''),
    p_data ->> 'mantener_etiqueta', (p_data ->> 'mantener_precio')::numeric,
    nullif(p_data ->> 'subir_etiqueta', ''), nullif(p_data ->> 'subir_precio', '')::numeric,
    coalesce(p_data ->> 'pago', ''), coalesce(p_data ->> 'llamada', ''), prepay,
    sheet_plan, CASE WHEN sheet_plan IS NOT NULL THEN 'correo' END, CASE WHEN sheet_plan IS NOT NULL THEN now() END,
    sheet_months, CASE WHEN sheet_paid THEN now() END, CASE WHEN sheet_paid THEN 'correo' END)
  ON CONFLICT (student_id, period_end) DO UPDATE
  SET sheet_student = excluded.sheet_student, guardian_email = excluded.guardian_email,
      mentor_name = excluded.mentor_name, payment_info = excluded.payment_info, call_url = excluded.call_url,
      -- Lo que ya eligieron no cambia aunque cambie la hoja (precios incluidos).
      keep_label = CASE WHEN k.plan IS NULL THEN excluded.keep_label ELSE k.keep_label END,
      keep_price = CASE WHEN k.plan IS NULL THEN excluded.keep_price ELSE k.keep_price END,
      up_label = CASE WHEN k.plan IS NULL THEN excluded.up_label ELSE k.up_label END,
      up_price = CASE WHEN k.plan IS NULL THEN excluded.up_price ELSE k.up_price END,
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
$$;

REVOKE ALL ON FUNCTION kiru_private.renewal_prepay(jsonb),
  kiru_private.renewal_months_ok(public.kiru_renewals, text, int),
  kiru_private.renewal_total(public.kiru_renewals),
  kiru_private.renewal_upsert(jsonb, boolean) FROM PUBLIC;

-- Al salir el correo de renovación (7 días antes): igual que antes, con aviso.
CREATE OR REPLACE FUNCTION public.kiru_renewal_publish(p_data jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.renewal_upsert(p_data, true)
$$;

-- La familia elige en el campus: plan y, si quiere, varios meses por adelantado.
-- (Funciones nuevas con otro nombre; las de antes siguen y llaman a estas.)
CREATE OR REPLACE FUNCTION public.kiru_renewal_choose_months(p_id uuid, p_plan text, p_months integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.kiru_renewals;
  me uuid := kiru_private.active_uid();
BEGIN
  IF p_plan NOT IN ('mantener', 'subir', 'no_renueva') THEN
    RAISE EXCEPTION 'Opción no válida.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.kiru_renewals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR NOT kiru_private.is_guardian_of(r.student_id) THEN
    RAISE EXCEPTION 'No encontramos esta renovación.' USING ERRCODE = '42501';
  END IF;
  IF r.plan IS NOT NULL OR r.closed_at IS NOT NULL THEN
    RETURN kiru_private.renewal_json(r, true);
  END IF;
  IF p_plan = 'subir' AND r.up_label IS NULL THEN
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
$$;

CREATE OR REPLACE FUNCTION public.kiru_renewal_choose(p_id uuid, p_plan text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.kiru_renewal_choose_months(p_id, p_plan, 1)
$$;

-- Botón del correo (también con meses por adelantado).
CREATE OR REPLACE FUNCTION public.kiru_renewal_from_email_months(p_email text, p_student text, p_period_end date, p_action text, p_months integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sid uuid := kiru_private.renewal_student(p_email, p_student);
  r public.kiru_renewals;
BEGIN
  IF p_action NOT IN ('mantener', 'subir', 'no_renueva', 'pagado') THEN
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
  ELSE
    IF r.plan IS NOT NULL OR r.closed_at IS NOT NULL THEN
      RETURN kiru_private.renewal_json(r, true) || jsonb_build_object('found', true);
    END IF;
    IF p_action = 'subir' AND r.up_label IS NULL THEN
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
$$;

CREATE OR REPLACE FUNCTION public.kiru_renewal_from_email(p_email text, p_student text, p_period_end date, p_action text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.kiru_renewal_from_email_months(p_email, p_student, p_period_end, p_action, 1)
$$;

-- Sincronización: además de cerrar los periodos pagados, deja visible la
-- mensualidad en curso de cada familia (sin campanita) si llegan sus datos.
CREATE OR REPLACE FUNCTION public.kiru_renewal_sync(p_families jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  f jsonb;
  sid uuid;
  pending jsonb;
BEGIN
  FOR f IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_families) = 'array' THEN p_families ELSE '[]'::jsonb END)
  LOOP
    IF jsonb_typeof(f -> 'datos') = 'object' THEN
      PERFORM kiru_private.renewal_upsert(f -> 'datos', false);
      CONTINUE;
    END IF;
    sid := kiru_private.renewal_student(f ->> 'email', f ->> 'alumno');
    CONTINUE WHEN sid IS NULL OR nullif(f ->> 'fin', '') IS NULL;
    UPDATE public.kiru_renewals SET closed_at = now()
    WHERE student_id = sid AND period_end < (f ->> 'fin')::date AND closed_at IS NULL;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'seq', r.campus_seq, 'alumno', r.sheet_student, 'email', r.guardian_email,
      'fin', r.period_end, 'plan', r.plan, 'plan_source', r.plan_source, 'meses', r.months,
      'plan_label', CASE r.plan WHEN 'mantener' THEN r.keep_label WHEN 'subir' THEN r.up_label WHEN 'no_renueva' THEN 'No renueva' END,
      'plan_price', CASE r.plan WHEN 'mantener' THEN r.keep_price WHEN 'subir' THEN r.up_price END,
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
$$;

REVOKE ALL ON FUNCTION
  public.kiru_renewal_choose_months(uuid, text, integer),
  public.kiru_renewal_choose(uuid, text),
  public.kiru_renewal_publish(jsonb),
  public.kiru_renewal_from_email_months(text, text, date, text, integer),
  public.kiru_renewal_from_email(text, text, date, text),
  public.kiru_renewal_sync(jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_renewal_choose_months(uuid, text, integer), public.kiru_renewal_choose(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.kiru_renewal_publish(jsonb),
  public.kiru_renewal_from_email_months(text, text, date, text, integer),
  public.kiru_renewal_from_email(text, text, date, text),
  public.kiru_renewal_sync(jsonb)
TO service_role;
