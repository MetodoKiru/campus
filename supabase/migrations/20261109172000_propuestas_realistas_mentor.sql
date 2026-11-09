-- Fechas que propone el mentor (cambio de clase o recuperación): solo opciones
-- realistas. Al menos 3, en 3 días distintos; nunca en viernes; la clase termina
-- como tarde a las 20:30 (hora de Madrid). Coordinación y familias no tienen
-- este límite. Los valores se pueden ajustar en kiru_settings (día 5 = viernes; 0 = ninguno).
INSERT INTO public.kiru_settings (key, value) VALUES
  ('propuestas_mentor_minimas', '3'::jsonb),
  ('propuestas_mentor_fin_max_minutos', '1230'::jsonb),
  ('propuestas_mentor_dia_no_permitido', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION kiru_private.class_check_mentor_options(p_options jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_min int := kiru_private.setting_int('propuestas_mentor_minimas', 3);
  v_end_max int := kiru_private.setting_int('propuestas_mentor_fin_max_minutos', 1230);
  v_blocked int := kiru_private.setting_int('propuestas_mentor_dia_no_permitido', 5);
  v_item jsonb;
  v_start timestamp;
  v_end timestamp;
  v_days int;
BEGIN
  SELECT count(DISTINCT ((value ->> 'start')::timestamptz AT TIME ZONE 'Europe/Madrid')::date)
  INTO v_days FROM jsonb_array_elements(coalesce(p_options, '[]'::jsonb));
  IF jsonb_array_length(coalesce(p_options, '[]'::jsonb)) < v_min OR v_days < v_min THEN
    RAISE EXCEPTION 'Propón al menos % fechas, cada una en un día distinto.', v_min USING ERRCODE = 'check_violation';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_options) LOOP
    v_start := (v_item ->> 'start')::timestamptz AT TIME ZONE 'Europe/Madrid';
    v_end := (v_item ->> 'end')::timestamptz AT TIME ZONE 'Europe/Madrid';
    IF extract(isodow FROM v_start) = v_blocked THEN
      RAISE EXCEPTION 'Los viernes no se pueden proponer (%).', to_char(v_start, 'DD/MM') USING ERRCODE = 'check_violation';
    END IF;
    IF v_end::date <> v_start::date OR extract(hour FROM v_end) * 60 + extract(minute FROM v_end) > v_end_max THEN
      RAISE EXCEPTION 'La clase tiene que terminar como tarde a las %:% (%).',
        lpad((v_end_max / 60)::text, 2, '0'), lpad((v_end_max % 60)::text, 2, '0'), to_char(v_start, 'DD/MM HH24:MI')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.class_check_mentor_options(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.kiru_clases_solicitar(
  p_actor uuid, p_session uuid, p_kind text, p_reason text,
  p_options jsonb DEFAULT '[]'::jsonb, p_details text DEFAULT '', p_preferences text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.kiru_class_sessions;
  v_role text;
  v_hours numeric;
  v_late boolean;
  v_options jsonb;
  v_req uuid;
  v_sup uuid;
  v_g uuid;
  v_mentor_name text;
  v_student_name text;
  v_limit int := kiru_private.setting_int('clases_horas_aviso', 48);
BEGIN
  IF p_kind NOT IN ('cambio', 'cancelacion') THEN
    RAISE EXCEPTION 'Tipo de solicitud no válido.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa clase.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, s.mentor_id, s.student_id);
  IF v_role NOT IN ('mentor', 'padre') THEN
    RAISE EXCEPTION 'Las solicitudes las hacen el mentor o la familia.' USING ERRCODE = '42501';
  END IF;
  IF s.delivery <> 'programada' OR s.scheduled_start <= now() THEN
    RAISE EXCEPTION 'Solo se pueden gestionar clases que aún no han empezado.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Explica el motivo.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kiru_class_requests q
             WHERE q.session_id = s.id AND q.kind IN ('cambio', 'cancelacion')
               AND q.status IN ('pendiente', 'mas_info', 'contrapropuesta')) THEN
    RAISE EXCEPTION 'Esta clase ya tiene una solicitud en curso.' USING ERRCODE = 'unique_violation';
  END IF;

  v_hours := round((extract(epoch FROM (s.scheduled_start - now())) / 3600.0)::numeric, 1);
  v_late := v_hours < v_limit;
  v_options := CASE WHEN p_kind = 'cambio'
                    THEN kiru_private.class_clean_options(p_options, s.mentor_id, s.student_id, s.id)
                    ELSE '[]'::jsonb END;
  IF p_kind = 'cambio' AND v_role = 'mentor' THEN
    PERFORM kiru_private.class_check_mentor_options(v_options);
  END IF;

  INSERT INTO public.kiru_class_requests (session_id, mentor_id, student_id, kind, requested_by, requester_role,
    reason, details, preferences, options, hours_notice, late, incident)
  VALUES (s.id, s.mentor_id, s.student_id, p_kind, p_actor, v_role,
    btrim(p_reason), btrim(coalesce(p_details, '')), btrim(coalesce(p_preferences, '')), v_options, v_hours, v_late,
    CASE WHEN v_role = 'mentor' AND v_late THEN 'potencial' ELSE 'ninguna' END)
  RETURNING id INTO v_req;

  PERFORM kiru_private.class_event(s.id, v_req, p_actor, 'solicitud_' || p_kind,
    jsonb_build_object('rol', v_role, 'horas_antelacion', v_hours, 'tardia', v_late));

  SELECT full_name INTO v_mentor_name FROM public.profiles WHERE id = s.mentor_id;
  SELECT full_name INTO v_student_name FROM public.profiles WHERE id = s.student_id;
  FOR v_sup IN SELECT kiru_private.class_supervisors(s.mentor_id) LOOP
    PERFORM kiru_private.class_notify(v_sup, s.student_id, s.id, v_req, 'clase_solicitud',
      CASE p_kind WHEN 'cambio' THEN 'Solicitud de cambio de clase' ELSE 'Solicitud de cancelación' END,
      coalesce(v_student_name, '') || ' con ' || coalesce(v_mentor_name, '') || ', clase del '
        || kiru_private.class_label(s.scheduled_start) || '. Pide: '
        || CASE v_role WHEN 'mentor' THEN 'el mentor' ELSE 'la familia' END
        || CASE WHEN v_late THEN ' (con menos de ' || v_limit || ' h).' ELSE '.' END,
      'clase_solicitud:' || v_req);
  END LOOP;
  -- La otra parte se entera: si pide la familia, el mentor; si pide el mentor,
  -- la familia solo cuando coordinación decida (no se le alarma antes).
  IF v_role = 'padre' THEN
    PERFORM kiru_private.class_notify(s.mentor_id, s.student_id, s.id, v_req, 'clase_solicitud',
      CASE p_kind WHEN 'cambio' THEN 'La familia pide cambiar una clase' ELSE 'La familia pide cancelar una clase' END,
      coalesce(v_student_name, '') || ', clase del ' || kiru_private.class_label(s.scheduled_start) || '. Coordinación lo revisará.',
      'clase_solicitud:' || v_req);
  END IF;

  RETURN jsonb_build_object('id', v_req, 'horas_antelacion', v_hours, 'tardia', v_late,
                            'incidencia', v_role = 'mentor' AND v_late);
END
$$;

CREATE OR REPLACE FUNCTION public.kiru_recuperaciones_proponer(
  p_actor uuid, p_session uuid, p_options jsonb, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.kiru_class_sessions;
  v_role text;
  v_options jsonb;
  v_req uuid;
  v_g uuid;
  v_mentor text;
BEGIN
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR s.kind <> 'regular' THEN RAISE EXCEPTION 'No existe esa clase.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, s.mentor_id, s.student_id);
  IF v_role NOT IN ('mentor', 'coordinador', 'admin') THEN
    RAISE EXCEPTION 'Las fechas de recuperación las propone el mentor o coordinación.' USING ERRCODE = '42501';
  END IF;
  IF s.delivery <> 'no_impartida'
     OR NOT (s.recovery IN ('pendiente', 'propuesta', 'sin_encaje', 'rechazada')
             OR (s.recovery = 'ninguna' AND s.cancel_cause IN ('familia_menos_48h', 'no_presentado'))) THEN
    RAISE EXCEPTION 'Esta clase no tiene una recuperación por organizar.' USING ERRCODE = 'check_violation';
  END IF;
  v_options := kiru_private.class_clean_options(p_options, s.mentor_id, s.student_id, NULL);
  IF jsonb_array_length(v_options) = 0 THEN RAISE EXCEPTION 'Propón al menos una fecha.' USING ERRCODE = 'check_violation'; END IF;
  IF v_role = 'mentor' THEN PERFORM kiru_private.class_check_mentor_options(v_options); END IF;

  -- Una propuesta nueva sustituye a la anterior que siga abierta.
  UPDATE public.kiru_class_requests SET status = 'sustituida'
  WHERE session_id = s.id AND kind = 'propuesta_recuperacion' AND status IN ('pendiente', 'mas_info', 'contrapropuesta');

  INSERT INTO public.kiru_class_requests (session_id, mentor_id, student_id, kind, requested_by, requester_role, reason, options)
  VALUES (s.id, s.mentor_id, s.student_id, 'propuesta_recuperacion', p_actor, v_role, btrim(coalesce(p_note, '')), v_options)
  RETURNING id INTO v_req;

  UPDATE public.kiru_class_sessions SET recovery = 'propuesta' WHERE id = s.id;
  PERFORM kiru_private.class_event(s.id, v_req, p_actor, 'recuperacion_propuesta', jsonb_build_object('opciones', jsonb_array_length(v_options)));

  SELECT full_name INTO v_mentor FROM public.profiles WHERE id = s.mentor_id;
  FOR v_g IN SELECT kiru_private.class_guardians(s.student_id) LOOP
    PERFORM kiru_private.class_notify(v_g, s.student_id, s.id, v_req, 'recuperacion_propuesta',
      'Elige la fecha de recuperación',
      coalesce(v_mentor, 'El mentor') || ' propone ' || jsonb_array_length(v_options) || ' opciones para recuperar la clase del '
        || kiru_private.class_label(s.original_start) || '. Entra en el campus para elegir.',
      'recuperacion_propuesta:' || v_req);
  END LOOP;
  RETURN jsonb_build_object('id', v_req);
END
$$;
