-- Panel de familias: historial de pagos y sesiones del plan vigente.
--
-- · Historial de pagos (kiru_payments, que administración sigue creando y
--   editando como siempre):
--     - Al pulsar «Ya he pagado» (campus o correo) se apunta un pago
--       «por confirmar» enlazado a la renovación (renewal_id).
--     - El Apps Script de «Contabilidad 26-27» copia los cobros de «Ingresos»
--       de cada familia (external_reference 'ingresos:…'). Si había un pago
--       por confirmar de esa familia, se convierte en ese cobro (no se duplica).
-- · Sesiones: el script manda el inicio del periodo pagado (paid_from, la
--   columna «Servicio desde») y las sesiones previstas según el horario, sin
--   clase y recuperaciones. Las hechas se cuentan aquí, con los registros de
--   sesión del alumno en ese periodo (sin enseñar su contenido a la familia).
--
-- Sin DROP: solo se añaden columnas, índices y funciones.

ALTER TABLE public.kiru_renewals
  ADD COLUMN paid_from date,
  ADD COLUMN sessions_planned smallint CHECK (sessions_planned BETWEEN 0 AND 400);

ALTER TABLE public.kiru_payments
  ADD COLUMN renewal_id uuid REFERENCES public.kiru_renewals(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX kiru_payments_renewal_uidx ON public.kiru_payments (renewal_id) WHERE renewal_id IS NOT NULL;
-- Para saber qué pagos se han editado a mano en administración.
CREATE TRIGGER kiru_payments_touch
BEFORE UPDATE ON public.kiru_payments
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();
CREATE UNIQUE INDEX kiru_payments_sheet_ref_uidx ON public.kiru_payments (external_reference) WHERE external_reference LIKE 'ingresos:%';

-- Quién figura como autor de lo que apunta el sistema.
CREATE OR REPLACE FUNCTION kiru_private.system_author()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT id FROM public.profiles WHERE role = 'admin' AND is_active ORDER BY created_at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION kiru_private.fecha_corta(d date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT extract(day FROM d)::int || ' ' || (ARRAY['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month FROM d)::int]
    || ' ' || extract(year FROM d)::int
$$;

-- «Ya he pagado»: un pago por confirmar en el historial (uno por renovación).
CREATE OR REPLACE FUNCTION kiru_private.renewal_payment_reported(r public.kiru_renewals, p_source text, p_by uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  months int := CASE WHEN r.plan IN ('mantener', 'subir') THEN r.months ELSE 1 END;
  hasta date := (r.period_end + make_interval(months => months))::date;
  total numeric := coalesce(kiru_private.renewal_total(r), r.keep_price);
  author uuid := coalesce(p_by, kiru_private.system_author());
BEGIN
  IF author IS NULL THEN RETURN; END IF;
  INSERT INTO public.kiru_payments (student_id, concept, amount_cents, due_date, status, notes, created_by, renewal_id)
  VALUES (r.student_id,
    'Mensualidad del ' || kiru_private.fecha_corta(r.period_end) || ' al ' || kiru_private.fecha_corta(hasta)
      || CASE WHEN months > 1 THEN ' (' || months || ' meses)' ELSE '' END,
    round(total * 100)::int, r.period_end, 'pending',
    'Avisado por la familia desde ' || CASE p_source WHEN 'correo' THEN 'el correo' ELSE 'el campus' END || '. Pendiente de confirmar.',
    author, r.id)
  ON CONFLICT (renewal_id) WHERE renewal_id IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.system_author(), kiru_private.fecha_corta(date),
  kiru_private.renewal_payment_reported(public.kiru_renewals, text, uuid) FROM PUBLIC;

-- Los mismos pasos de antes, ahora también apuntando el pago en el historial.
CREATE OR REPLACE FUNCTION public.kiru_renewal_report_paid(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.kiru_renewals;
  me uuid := kiru_private.active_uid();
BEGIN
  SELECT * INTO r FROM public.kiru_renewals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR NOT kiru_private.is_guardian_of(r.student_id) THEN
    RAISE EXCEPTION 'No encontramos esta renovación.' USING ERRCODE = '42501';
  END IF;
  IF r.paid_reported_at IS NOT NULL OR r.closed_at IS NOT NULL OR r.plan = 'no_renueva' THEN
    RETURN kiru_private.renewal_json(r, true);
  END IF;
  UPDATE public.kiru_renewals
  SET paid_reported_at = now(), paid_source = 'campus', paid_by = me, campus_seq = campus_seq + 1
  WHERE id = r.id
  RETURNING * INTO r;
  PERFORM kiru_private.renewal_payment_reported(r, 'campus', me);
  RETURN kiru_private.renewal_json(r, false);
END;
$$;

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
    PERFORM kiru_private.renewal_payment_reported(r, 'correo', NULL);
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

-- Cobros de «Ingresos» de una familia. Cada uno entra una sola vez (por su
-- referencia). Si la familia había avisado de un pago, ese aviso pasa a ser
-- el cobro. Si Sofía cambia o borra la fila en la hoja, la copia sin tocar en
-- el campus se actualiza o se quita; las que se editaron en administración se respetan.
CREATE OR REPLACE FUNCTION kiru_private.payments_from_sheet(p_student uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  it jsonb;
  ref text;
  desde date;
  hasta date;
  fecha date;
  cents int;
  v_concept text;
  author uuid := kiru_private.system_author();
  refs text[] := ARRAY[]::text[];
  reported uuid;
BEGIN
  IF author IS NULL OR p_student IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN jsonb_typeof(it) <> 'object'
      OR coalesce(it ->> 'ref', '') !~ '^[0-9a-f]{8,64}$'
      OR coalesce(it ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$'
      OR coalesce(it ->> 'importe', '') !~ '^\d+(\.\d+)?$';
    ref := 'ingresos:' || (it ->> 'ref');
    refs := refs || ref;
    fecha := (it ->> 'fecha')::date;
    desde := CASE WHEN coalesce(it ->> 'desde', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (it ->> 'desde')::date END;
    hasta := CASE WHEN coalesce(it ->> 'hasta', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (it ->> 'hasta')::date END;
    cents := least(round((it ->> 'importe')::numeric * 100), 10000000)::int;
    v_concept := CASE WHEN desde IS NOT NULL AND hasta IS NOT NULL
      THEN 'Mensualidad del ' || kiru_private.fecha_corta(desde) || ' al ' || kiru_private.fecha_corta(hasta)
      ELSE 'Pago del ' || kiru_private.fecha_corta(fecha) END;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.kiru_payments WHERE external_reference = ref);
    -- ¿Había un aviso «ya he pagado» de esta familia sin confirmar?
    -- (primero el del mismo periodo: «Servicio desde» = fin de la mensualidad avisada)
    SELECT p.id INTO reported FROM public.kiru_payments p
    JOIN public.kiru_renewals k ON k.id = p.renewal_id
    -- (también si administración ya lo marcó como pagado a mano, si es del mismo periodo)
    WHERE p.student_id = p_student AND p.external_reference IS NULL
      AND (p.status = 'pending' OR (p.status = 'paid' AND k.period_end = desde))
    ORDER BY (k.period_end = desde) DESC, p.created_at LIMIT 1 FOR UPDATE OF p;
    IF reported IS NOT NULL THEN
      UPDATE public.kiru_payments
      SET status = 'paid', paid_at = fecha, amount_cents = cents, concept = v_concept, external_reference = ref,
          notes = 'Confirmado en Contabilidad.'
      WHERE id = reported;
    ELSE
      INSERT INTO public.kiru_payments (student_id, concept, amount_cents, due_date, status, paid_at, external_reference, notes, created_by)
      VALUES (p_student, v_concept, cents, desde, 'paid', fecha, ref, 'Cobro apuntado en Contabilidad.', author);
    END IF;
  END LOOP;
  -- Filas que ya no están en la hoja (solo las que nadie ha editado en el campus).
  DELETE FROM public.kiru_payments
  WHERE student_id = p_student AND external_reference LIKE 'ingresos:%' AND renewal_id IS NULL
    AND NOT (external_reference = ANY (refs)) AND updated_at <= created_at + interval '2 seconds';
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.payments_from_sheet(uuid, jsonb) FROM PUBLIC;

-- Datos del periodo pagado (inicio y sesiones previstas), que manda el script.
CREATE OR REPLACE FUNCTION kiru_private.renewal_period(p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  sid uuid := kiru_private.renewal_student(p_data ->> 'email', p_data ->> 'alumno');
BEGIN
  IF sid IS NULL OR coalesce(p_data ->> 'fin', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN; END IF;
  UPDATE public.kiru_renewals
  SET paid_from = CASE WHEN coalesce(p_data ->> 'desde', '') ~ '^\d{4}-\d{2}-\d{2}$' AND (p_data ->> 'desde')::date < period_end
                       THEN (p_data ->> 'desde')::date END,
      sessions_planned = CASE WHEN coalesce(p_data ->> 'sesiones_previstas', '') ~ '^\d{1,3}$'
                              THEN least((p_data ->> 'sesiones_previstas')::int, 400) END
  WHERE student_id = sid AND period_end = (p_data ->> 'fin')::date
    AND (paid_from IS DISTINCT FROM CASE WHEN coalesce(p_data ->> 'desde', '') ~ '^\d{4}-\d{2}-\d{2}$' AND (p_data ->> 'desde')::date < period_end THEN (p_data ->> 'desde')::date END
      OR sessions_planned IS DISTINCT FROM CASE WHEN coalesce(p_data ->> 'sesiones_previstas', '') ~ '^\d{1,3}$' THEN least((p_data ->> 'sesiones_previstas')::int, 400) END);
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.renewal_period(jsonb) FROM PUBLIC;

-- Sincronización: además de lo de antes, el periodo pagado y los cobros.
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
    sid := kiru_private.renewal_student(f ->> 'email', f ->> 'alumno');
    CONTINUE WHEN sid IS NULL;
    IF jsonb_typeof(f -> 'datos') = 'object' THEN
      PERFORM kiru_private.renewal_upsert(f -> 'datos', false);
      PERFORM kiru_private.renewal_period(f -> 'datos');
    ELSIF nullif(f ->> 'fin', '') IS NOT NULL THEN
      UPDATE public.kiru_renewals SET closed_at = now()
      WHERE student_id = sid AND period_end < (f ->> 'fin')::date AND closed_at IS NULL;
    END IF;
    IF jsonb_typeof(f -> 'pagos') = 'array' THEN
      PERFORM kiru_private.payments_from_sheet(sid, f -> 'pagos');
    END IF;
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

-- Sesiones del periodo pagado para la familia: solo el número, sin el
-- contenido de los registros (que es del mentor y de administración).
CREATE OR REPLACE FUNCTION public.kiru_family_sessions(p_renewal uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.kiru_renewals;
  done int;
BEGIN
  SELECT * INTO r FROM public.kiru_renewals WHERE id = p_renewal;
  IF NOT FOUND OR NOT ((SELECT kiru_private.is_admin()) OR kiru_private.is_guardian_of(r.student_id)) THEN
    RAISE EXCEPTION 'No encontramos esta mensualidad.' USING ERRCODE = '42501';
  END IF;
  IF r.paid_from IS NULL THEN
    RETURN jsonb_build_object('desde', NULL, 'hasta', r.period_end, 'previstas', r.sessions_planned, 'hechas', NULL);
  END IF;
  SELECT count(DISTINCT l.session_date) INTO done
  FROM public.kiru_session_logs l
  WHERE l.student_id = r.student_id AND l.session_date >= r.paid_from AND l.session_date < r.period_end
    AND l.manual_status IS DISTINCT FROM 'archivado';
  RETURN jsonb_build_object('desde', r.paid_from, 'hasta', r.period_end, 'previstas', r.sessions_planned, 'hechas', done);
END;
$$;

REVOKE ALL ON FUNCTION public.kiru_family_sessions(uuid), public.kiru_renewal_sync(jsonb),
  public.kiru_renewal_report_paid(uuid), public.kiru_renewal_from_email_months(text, text, date, text, integer)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.kiru_renewal_sync(jsonb), public.kiru_renewal_from_email_months(text, text, date, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_family_sessions(uuid), public.kiru_renewal_report_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_renewal_sync(jsonb), public.kiru_renewal_from_email_months(text, text, date, text, integer) TO service_role;
