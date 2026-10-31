-- Renovaciones de la mensualidad en el campus.
--
-- El correo de renovación lo sigue mandando el Apps Script de la hoja
-- «Contabilidad 26-27» (pestaña «Familias»). Cuando sale, el script copia la
-- propuesta aquí y la familia la ve también en su panel, con los mismos
-- botones: mantener el plan, un día más, no renovar y «ya he pagado».
--
-- Esta tabla es el árbitro entre el correo y el campus: los dos botones pasan
-- por una función que bloquea la fila y solo acepta la primera respuesta. Si la
-- familia pulsa después en el otro sitio, ve lo que ya eligió y no se
-- registra (ni se avisa a Sofía) otra vez.
--
-- Lo que se elige en el campus queda pendiente para la hoja (campus_seq >
-- sheet_seq) hasta que el script lo apunta en «Plan elegido próximo mes» y lo
-- confirma. Cuando se apunta el pago en «Ingresos», la fecha de fin avanza y
-- el script cierra el periodo anterior: el aviso desaparece del campus.

CREATE TABLE public.kiru_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_end date NOT NULL,
  -- Cómo aparece en la hoja, para que el script encuentre la fila.
  sheet_student text NOT NULL CHECK (length(trim(sheet_student)) BETWEEN 1 AND 120),
  guardian_email text NOT NULL CHECK (length(guardian_email) BETWEEN 3 AND 254),
  mentor_name text NOT NULL DEFAULT '' CHECK (length(mentor_name) <= 120),
  keep_label text NOT NULL CHECK (length(trim(keep_label)) BETWEEN 1 AND 120),
  keep_price numeric(8, 2) NOT NULL CHECK (keep_price >= 0),
  up_label text CHECK (length(trim(up_label)) BETWEEN 1 AND 120),
  up_price numeric(8, 2) CHECK (up_price >= 0),
  payment_info text NOT NULL DEFAULT '' CHECK (length(payment_info) <= 800),
  call_url text NOT NULL DEFAULT '' CHECK (call_url = '' OR call_url ~ '^https://'),
  plan text CHECK (plan IN ('mantener', 'subir', 'no_renueva')),
  plan_source text CHECK (plan_source IN ('correo', 'campus')),
  plan_at timestamptz,
  plan_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_reported_at timestamptz,
  paid_source text CHECK (paid_source IN ('correo', 'campus')),
  paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at timestamptz,
  campus_seq integer NOT NULL DEFAULT 0,
  sheet_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, period_end),
  CHECK ((plan IS NULL) = (plan_source IS NULL) AND (plan IS NULL) = (plan_at IS NULL)),
  CHECK ((paid_reported_at IS NULL) = (paid_source IS NULL)),
  CHECK ((up_label IS NULL) = (up_price IS NULL)),
  CHECK (plan IS DISTINCT FROM 'subir' OR up_label IS NOT NULL)
);
CREATE INDEX kiru_renewals_pending_sheet_idx ON public.kiru_renewals (updated_at) WHERE campus_seq > sheet_seq;
CREATE INDEX kiru_renewals_plan_by_idx ON public.kiru_renewals (plan_by);
CREATE INDEX kiru_renewals_paid_by_idx ON public.kiru_renewals (paid_by);

COMMENT ON TABLE public.kiru_renewals IS
  'Propuestas de renovación (una por alumno y fin de mensualidad). Las crea el Apps Script de Contabilidad; la familia responde por correo o en el campus y vale la primera respuesta.';

CREATE TRIGGER kiru_renewals_touch
BEFORE UPDATE ON public.kiru_renewals
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

ALTER TABLE public.kiru_renewals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_renewals FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_renewals FROM authenticated;

CREATE POLICY kiru_renewals_read ON public.kiru_renewals
FOR SELECT TO authenticated
USING ((SELECT kiru_private.is_admin()) OR kiru_private.is_guardian_of(student_id));

-- La campanita también avisa de la renovación.
ALTER TABLE public.kiru_notifications DROP CONSTRAINT kiru_notifications_kind_check;
ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check CHECK (kind IN (
  'objetivo_pendiente', 'objetivo_aprobado', 'objetivo_rechazado',
  'canje_solicitado', 'canje_completado', 'canje_aplazado', 'renovacion'
));

-- Utilidades -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION kiru_private.norm_name(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(lower(translate(trim(coalesce(value, '')),
    'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç',
    'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc')), '\s+', ' ', 'g')
$$;

-- El alumno de la hoja: hijo/a activo de la familia con ese correo cuyo nombre
-- empieza por el de la hoja. Si la familia tiene un solo hijo/a, es ese.
CREATE OR REPLACE FUNCTION kiru_private.renewal_student(p_email text, p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH kids AS (
    SELECT DISTINCT s.id, kiru_private.norm_name(s.full_name) AS n
    FROM auth.users u
    JOIN public.profiles g ON g.id = u.id AND g.role = 'padre' AND g.is_active
    JOIN public.student_guardians sg ON sg.guardian_id = g.id
    JOIN public.profiles s ON s.id = sg.student_id AND s.is_active
    WHERE lower(u.email) = lower(trim(p_email)) AND trim(coalesce(p_email, '')) <> ''
  ),
  named AS (
    SELECT id FROM kids
    WHERE n = kiru_private.norm_name(p_name) OR n LIKE kiru_private.norm_name(p_name) || ' %'
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM named) = 1 THEN (SELECT id FROM named)
    WHEN (SELECT count(*) FROM named) = 0 AND (SELECT count(*) FROM kids) = 1 THEN (SELECT id FROM kids)
  END
$$;

CREATE OR REPLACE FUNCTION kiru_private.renewal_json(r public.kiru_renewals, already boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'plan', r.plan, 'plan_source', r.plan_source,
    'paid_reported', r.paid_reported_at IS NOT NULL, 'paid_source', r.paid_source,
    'closed', r.closed_at IS NOT NULL, 'already', already
  )
$$;

REVOKE ALL ON FUNCTION kiru_private.norm_name(text), kiru_private.renewal_student(text, text),
  kiru_private.renewal_json(public.kiru_renewals, boolean) FROM PUBLIC;

-- Pasos de la familia en el campus -----------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_renewal_choose(p_id uuid, p_plan text)
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
  UPDATE public.kiru_renewals
  SET plan = p_plan, plan_source = 'campus', plan_at = now(), plan_by = me, campus_seq = campus_seq + 1
  WHERE id = r.id
  RETURNING * INTO r;
  RETURN kiru_private.renewal_json(r, false);
END;
$$;

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
  RETURN kiru_private.renewal_json(r, false);
END;
$$;

-- Pasos del Apps Script (solo el servidor, con la clave de servicio) ---------------

-- Al salir el correo de renovación: crea (o actualiza) la propuesta del
-- periodo y avisa en la campanita. Los periodos anteriores de ese alumno se
-- cierran: si hay correo nuevo es que la mensualidad anterior ya se pagó.
CREATE OR REPLACE FUNCTION public.kiru_renewal_publish(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sid uuid := kiru_private.renewal_student(p_data ->> 'email', p_data ->> 'alumno');
  fin date := (p_data ->> 'fin')::date;
  r public.kiru_renewals;
  student_name text;
  -- Lo que ya estuviera apuntado en la hoja (al conectar con el campus a mitad de mes).
  sheet_plan text := CASE WHEN p_data ->> 'plan' IN ('mantener', 'no_renueva')
                            OR (p_data ->> 'plan' = 'subir' AND nullif(p_data ->> 'subir_etiqueta', '') IS NOT NULL)
                          THEN p_data ->> 'plan' END;
  sheet_paid boolean := coalesce((p_data ->> 'pagado')::boolean, false);
BEGIN
  IF sid IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  UPDATE public.kiru_renewals SET closed_at = now()
  WHERE student_id = sid AND period_end < fin AND closed_at IS NULL;

  INSERT INTO public.kiru_renewals AS k (student_id, period_end, sheet_student, guardian_email, mentor_name,
    keep_label, keep_price, up_label, up_price, payment_info, call_url,
    plan, plan_source, plan_at, paid_reported_at, paid_source)
  VALUES (sid, fin, trim(p_data ->> 'alumno'), lower(trim(p_data ->> 'email')), coalesce(p_data ->> 'mentor', ''),
    p_data ->> 'mantener_etiqueta', (p_data ->> 'mantener_precio')::numeric,
    nullif(p_data ->> 'subir_etiqueta', ''), nullif(p_data ->> 'subir_precio', '')::numeric,
    coalesce(p_data ->> 'pago', ''), coalesce(p_data ->> 'llamada', ''),
    sheet_plan, CASE WHEN sheet_plan IS NOT NULL THEN 'correo' END, CASE WHEN sheet_plan IS NOT NULL THEN now() END,
    CASE WHEN sheet_paid THEN now() END, CASE WHEN sheet_paid THEN 'correo' END)
  ON CONFLICT (student_id, period_end) DO UPDATE
  SET sheet_student = excluded.sheet_student, guardian_email = excluded.guardian_email,
      mentor_name = excluded.mentor_name, keep_label = excluded.keep_label, keep_price = excluded.keep_price,
      -- Si ya eligió «un día más», no se le quita la opción aunque cambie la hoja.
      up_label = CASE WHEN k.plan = 'subir' THEN k.up_label ELSE excluded.up_label END,
      up_price = CASE WHEN k.plan = 'subir' THEN k.up_price ELSE excluded.up_price END,
      payment_info = excluded.payment_info, call_url = excluded.call_url,
      plan = coalesce(k.plan, excluded.plan),
      plan_source = coalesce(k.plan_source, excluded.plan_source),
      plan_at = coalesce(k.plan_at, excluded.plan_at),
      paid_reported_at = coalesce(k.paid_reported_at, excluded.paid_reported_at),
      paid_source = coalesce(k.paid_source, excluded.paid_source)
  RETURNING * INTO r;

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

  RETURN kiru_private.renewal_json(r, false) || jsonb_build_object('found', true);
END;
$$;

-- Botón del correo. Si la familia ya respondió (en el correo o en el campus)
-- devuelve lo que eligió y no cambia nada.
CREATE OR REPLACE FUNCTION public.kiru_renewal_from_email(p_email text, p_student text, p_period_end date, p_action text)
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
    UPDATE public.kiru_renewals SET plan = p_action, plan_source = 'correo', plan_at = now()
    WHERE id = r.id RETURNING * INTO r;
  END IF;
  RETURN kiru_private.renewal_json(r, false) || jsonb_build_object('found', true);
END;
$$;

-- Revisión periódica del script. Recibe las familias de la hoja con su fecha
-- de fin actual (cierra los periodos ya pagados) y devuelve lo que se ha
-- respondido en el campus y la hoja todavía no sabe.
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
    CONTINUE WHEN sid IS NULL OR nullif(f ->> 'fin', '') IS NULL;
    UPDATE public.kiru_renewals SET closed_at = now()
    WHERE student_id = sid AND period_end < (f ->> 'fin')::date AND closed_at IS NULL;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'seq', r.campus_seq, 'alumno', r.sheet_student, 'email', r.guardian_email,
      'fin', r.period_end, 'plan', r.plan, 'plan_source', r.plan_source,
      'plan_label', CASE r.plan WHEN 'mantener' THEN r.keep_label WHEN 'subir' THEN r.up_label WHEN 'no_renueva' THEN 'No renueva' END,
      'plan_price', CASE r.plan WHEN 'mantener' THEN r.keep_price WHEN 'subir' THEN r.up_price END,
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

-- El script confirma que ya apuntó en la hoja (y avisó a Sofía) lo del campus.
-- Solo confirma hasta la versión que vio: un cambio posterior sigue pendiente.
CREATE OR REPLACE FUNCTION public.kiru_renewal_ack(p_items jsonb)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH items AS (
    SELECT (x ->> 'id')::uuid AS id, (x ->> 'seq')::integer AS seq
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) x
  ), done AS (
    UPDATE public.kiru_renewals r SET sheet_seq = greatest(r.sheet_seq, least(i.seq, r.campus_seq))
    FROM items i WHERE r.id = i.id AND r.sheet_seq < i.seq
    RETURNING r.id
  )
  SELECT count(*)::integer FROM done
$$;

REVOKE ALL ON FUNCTION
  public.kiru_renewal_choose(uuid, text),
  public.kiru_renewal_report_paid(uuid),
  public.kiru_renewal_publish(jsonb),
  public.kiru_renewal_from_email(text, text, date, text),
  public.kiru_renewal_sync(jsonb),
  public.kiru_renewal_ack(jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_renewal_choose(uuid, text), public.kiru_renewal_report_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.kiru_renewal_publish(jsonb),
  public.kiru_renewal_from_email(text, text, date, text),
  public.kiru_renewal_sync(jsonb),
  public.kiru_renewal_ack(jsonb)
TO service_role;
