-- Recuperaciones: si ninguna fecha del mentor encaja, la familia propone las suyas
-- (día y hora, 1 a 3) y le llegan al mentor, que acepta una o propone otras.
-- Cada paso avisa por correo a quien tiene que actuar. Solo funciones nuevas o
-- reemplazadas; no toca datos.

-- ¿La última propuesta abierta de esta clase es de la familia?
CREATE OR REPLACE FUNCTION kiru_private.class_family_proposed(p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT q.requester_role = 'padre' FROM public.kiru_class_requests q
                   WHERE q.session_id = p_session AND q.kind = 'propuesta_recuperacion' AND q.status = 'pendiente'
                   ORDER BY q.created_at DESC LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION kiru_private.class_family_proposed(uuid) FROM PUBLIC;

-- La familia responde a una propuesta con sus propias fechas.
CREATE OR REPLACE FUNCTION public.kiru_recuperaciones_contraproponer(
  p_actor uuid, p_request uuid, p_options jsonb, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q public.kiru_class_requests;
  s public.kiru_class_sessions;
  v_role text;
  v_options jsonb;
  v_req uuid;
  v_to uuid;
  v_student text;
BEGIN
  SELECT * INTO q FROM public.kiru_class_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR q.kind <> 'propuesta_recuperacion' THEN RAISE EXCEPTION 'No existe esa propuesta.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, q.mentor_id, q.student_id);
  IF v_role <> 'padre' OR q.requester_role = 'padre' THEN
    RAISE EXCEPTION 'Solo la familia responde con sus fechas a una propuesta del mentor.' USING ERRCODE = '42501';
  END IF;
  IF q.status <> 'pendiente' THEN RAISE EXCEPTION 'Esta propuesta ya está respondida.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = q.session_id FOR UPDATE;
  v_options := kiru_private.class_clean_options(p_options, s.mentor_id, s.student_id, NULL);
  IF jsonb_array_length(v_options) NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Indica entre 1 y 3 fechas que os vengan bien.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM kiru_private.class_check_option_hours(v_options);
  SELECT full_name INTO v_student FROM public.profiles WHERE id = s.student_id;

  UPDATE public.kiru_class_requests SET status = 'sin_encaje', reply = left(coalesce(p_note, ''), 2000), decided_by = p_actor, decided_at = now()
  WHERE id = q.id;
  INSERT INTO public.kiru_class_requests (session_id, mentor_id, student_id, kind, requested_by, requester_role, reason, options)
  VALUES (s.id, s.mentor_id, s.student_id, 'propuesta_recuperacion', p_actor, 'padre', btrim(coalesce(p_note, '')), v_options)
  RETURNING id INTO v_req;
  -- Vuelve a contar el plazo: ahora le toca al mentor.
  UPDATE public.kiru_class_sessions SET recovery = 'sin_encaje' WHERE id = s.id;
  UPDATE public.kiru_class_sessions SET recovery = 'propuesta' WHERE id = s.id;
  PERFORM kiru_private.class_event(s.id, v_req, p_actor, 'recuperacion_propuesta_familia', jsonb_build_object('opciones', jsonb_array_length(v_options)));

  FOR v_to IN SELECT s.mentor_id UNION SELECT kiru_private.class_supervisors(s.mentor_id) LOOP
    PERFORM kiru_private.class_notify(v_to, s.student_id, s.id, v_req, 'recuperacion_propuesta',
      'La familia propone fechas de recuperación',
      coalesce(v_student, '') || ': ninguna de las fechas encajaba y la familia propone ' || jsonb_array_length(v_options)
        || CASE WHEN jsonb_array_length(v_options) = 1 THEN ' fecha' ELSE ' fechas' END
        || ' para recuperar la clase del ' || kiru_private.class_label(s.original_start)
        || '. Entra en el campus y acepta una o propón otras.',
      'recuperacion_propuesta:' || v_req);
  END LOOP;
  RETURN jsonb_build_object('id', v_req, 'estado', 'pendiente');
END
$$;
REVOKE ALL ON FUNCTION public.kiru_recuperaciones_contraproponer(uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_recuperaciones_contraproponer(uuid, uuid, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.kiru_recuperaciones_elegir(
  p_actor uuid, p_request uuid, p_option int, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q public.kiru_class_requests;
  s public.kiru_class_sessions;
  v_role text;
  v_opt jsonb;
  v_new uuid;
  v_sup uuid;
  v_student text;
BEGIN
  SELECT * INTO q FROM public.kiru_class_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR q.kind <> 'propuesta_recuperacion' THEN RAISE EXCEPTION 'No existe esa propuesta.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, q.mentor_id, q.student_id);
  -- Fechas del mentor o coordinación: elige la familia. Fechas de la familia: responde el mentor.
  IF q.requester_role = 'padre' THEN
    IF v_role NOT IN ('mentor', 'coordinador', 'admin') THEN
      RAISE EXCEPTION 'Estas fechas las ha propuesto la familia: responde el mentor.' USING ERRCODE = '42501';
    END IF;
    IF p_option IS NULL THEN
      RAISE EXCEPTION 'Si ninguna te encaja, propón tú otras fechas.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_role NOT IN ('padre', 'coordinador', 'admin') THEN
    RAISE EXCEPTION 'La fecha la elige la familia.' USING ERRCODE = '42501';
  END IF;
  IF q.status <> 'pendiente' THEN RAISE EXCEPTION 'Esta propuesta ya está respondida.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = q.session_id FOR UPDATE;
  SELECT full_name INTO v_student FROM public.profiles WHERE id = s.student_id;

  IF p_option IS NULL THEN
    UPDATE public.kiru_class_requests SET status = 'sin_encaje', reply = left(coalesce(p_note, ''), 2000), decided_by = p_actor, decided_at = now() WHERE id = q.id;
    UPDATE public.kiru_class_sessions SET recovery = 'sin_encaje' WHERE id = s.id;
    PERFORM kiru_private.class_event(s.id, q.id, p_actor, 'recuperacion_sin_encaje', jsonb_build_object('nota', left(coalesce(p_note, ''), 300)));
    FOR v_sup IN SELECT kiru_private.class_supervisors(s.mentor_id) UNION SELECT s.mentor_id LOOP
      PERFORM kiru_private.class_notify(v_sup, s.student_id, s.id, q.id, 'recuperacion_sin_encaje',
        'Ninguna fecha de recuperación encaja',
        coalesce(v_student, '') || ': hay que buscar otras fechas para recuperar la clase del ' || kiru_private.class_label(s.original_start) || '.',
        'recuperacion_sin_encaje:' || q.id);
    END LOOP;
    RETURN jsonb_build_object('id', q.id, 'estado', 'sin_encaje');
  END IF;

  v_opt := q.options -> p_option;
  IF v_opt IS NULL THEN RAISE EXCEPTION 'Elige una de las fechas propuestas.' USING ERRCODE = 'check_violation'; END IF;
  IF NOT kiru_private.class_slot_free(s.mentor_id, s.student_id, (v_opt->>'start')::timestamptz, (v_opt->>'end')::timestamptz, NULL) THEN
    RAISE EXCEPTION 'Esa fecha ya no está libre. Elige otra o avisa de que ninguna te encaja.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.kiru_class_sessions (student_id, mentor_id, kind, recovers_session_id, original_start,
    scheduled_start, scheduled_end, consumption, source)
  VALUES (s.student_id, s.mentor_id, 'recuperacion', s.id, (v_opt->>'start')::timestamptz,
    (v_opt->>'start')::timestamptz, (v_opt->>'end')::timestamptz, 'no_aplica', 'recuperacion')
  RETURNING id INTO v_new;

  UPDATE public.kiru_class_requests SET status = 'elegida', chosen_option = v_opt, decided_by = p_actor, decided_at = now(),
    reply = left(coalesce(p_note, ''), 2000) WHERE id = q.id;
  UPDATE public.kiru_class_sessions SET recovery = 'programada' WHERE id = s.id;
  PERFORM kiru_private.class_event(s.id, q.id, p_actor, 'recuperacion_programada', jsonb_build_object('recuperacion', v_new, 'fecha', v_opt->>'start'));
  PERFORM kiru_private.class_event(v_new, q.id, p_actor, 'creada_como_recuperacion', jsonb_build_object('original', s.id));
  PERFORM kiru_private.sheet_sync_session(v_new);

  FOR v_sup IN SELECT s.mentor_id UNION SELECT kiru_private.class_guardians(s.student_id) UNION SELECT kiru_private.class_supervisors(s.mentor_id) LOOP
    PERFORM kiru_private.class_notify(v_sup, s.student_id, v_new, q.id, 'recuperacion_confirmada',
      'Recuperación confirmada',
      coalesce(v_student, '') || ': la clase del ' || kiru_private.class_label(s.original_start) || ' se recupera el '
        || kiru_private.class_label((v_opt->>'start')::timestamptz) || '.',
      'recuperacion_confirmada:' || v_new);
  END LOOP;
  RETURN jsonb_build_object('id', q.id, 'estado', 'elegida', 'recuperacion', v_new);
END
$$;

CREATE OR REPLACE FUNCTION public.kiru_clases_tarea_diaria()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gen jsonb;
  v_days int := kiru_private.setting_int('recuperaciones_dias_sin_avanzar', 3);
  v_end_days int := kiru_private.setting_int('recuperaciones_dias_aviso_fin_periodo', 7);
  v_mentor_days int := kiru_private.setting_int('recuperaciones_dias_recordatorio_mentor', 2);
  v_mentor int := 0;
  v_stale int := 0;
  v_period int := 0;
  r record;
  v_sup uuid;
BEGIN
  v_gen := public.kiru_clases_generar();

  -- Antes de avisar a coordinación, un recordatorio amable al propio mentor
  -- (una vez por recuperación pendiente de proponer fechas).
  FOR r IN
    SELECT s.id, s.student_id, s.mentor_id, s.original_start, s.recovery_status_since, ps.full_name AS student_name
    FROM public.kiru_class_sessions s
    JOIN public.profiles ps ON ps.id = s.student_id
    WHERE s.kind = 'regular'
      AND (s.recovery = 'pendiente' OR (s.recovery = 'propuesta' AND kiru_private.class_family_proposed(s.id)))
      AND s.recovery_status_since < now() - make_interval(days => v_mentor_days)
  LOOP
    PERFORM kiru_private.class_notify(r.mentor_id, r.student_id, r.id, NULL, 'recuperacion_recordatorio',
      'Recuerda proponer fechas de recuperación',
      r.student_name || ': la clase del ' || kiru_private.class_label(r.original_start)
        || CASE WHEN kiru_private.class_family_proposed(r.id)
                THEN ' sigue pendiente de recuperar y la familia te ha propuesto fechas. Entra en el campus y acepta una o propón otras. '
                ELSE ' sigue pendiente de recuperar. Cuando puedas, entra en el campus y propón fechas. ' END
        || 'En Kiru valoramos mucho que cada mentor lo gestione por iniciativa propia, sin necesidad de recordatorios. '
        || 'Si mañana sigue pendiente, el campus avisará a tu coordinador para echarte una mano. ¡Gracias!',
      'recuperacion_recordatorio:' || r.id || ':auto:' || extract(epoch FROM r.recovery_status_since)::bigint);
    v_mentor := v_mentor + 1;
  END LOOP;

  -- Recuperaciones que llevan N días sin avanzar: aviso al coordinador del mentor
  -- (una vez por punto en que está). No crea incidencias.
  FOR r IN
    SELECT s.id, s.student_id, s.mentor_id, s.recovery, s.original_start, s.recovery_status_since, ps.full_name AS student_name
    FROM public.kiru_class_sessions s
    JOIN public.profiles ps ON ps.id = s.student_id
    WHERE s.kind = 'regular' AND s.recovery IN ('pendiente', 'propuesta', 'sin_encaje')
      AND s.recovery_status_since < now() - make_interval(days => v_days)
  LOOP
    FOR v_sup IN SELECT kiru_private.class_supervisors(r.mentor_id) LOOP
      PERFORM kiru_private.class_notify(v_sup, r.student_id, r.id, NULL, 'recuperacion_sin_avanzar',
        'Recuperación sin avanzar',
        r.student_name || ': clase del ' || kiru_private.class_label(r.original_start) || ' — '
          || CASE r.recovery WHEN 'pendiente' THEN 'el mentor aún no ha propuesto fechas'
                             WHEN 'propuesta' THEN CASE WHEN kiru_private.class_family_proposed(r.id)
                                                        THEN 'la familia propuso fechas y el mentor aún no ha respondido'
                                                        ELSE 'la familia aún no ha elegido fecha' END
                             ELSE 'ninguna fecha encajó' END || '.',
        'recuperacion_sin_avanzar:' || r.id || ':' || r.recovery || ':' || extract(epoch FROM r.recovery_status_since)::bigint);
      v_stale := v_stale + 1;
    END LOOP;
  END LOOP;

  -- Fin de periodo con recuperaciones pendientes: solo al coordinador del mentor.
  FOR r IN
    SELECT DISTINCT ON (s.id) s.id, s.student_id, s.mentor_id, s.original_start, p.coverage_end, ps.full_name AS student_name
    FROM public.kiru_class_sessions s
    JOIN public.kiru_payments p ON p.student_id = s.student_id
      AND p.coverage_start IS NOT NULL AND p.coverage_end IS NOT NULL
      AND (s.original_start AT TIME ZONE 'Europe/Madrid')::date >= p.coverage_start
      AND (s.original_start AT TIME ZONE 'Europe/Madrid')::date < p.coverage_end
    JOIN public.profiles ps ON ps.id = s.student_id
    WHERE s.kind = 'regular' AND s.recovery IN ('pendiente', 'propuesta', 'sin_encaje')
      AND p.coverage_end - (now() AT TIME ZONE 'Europe/Madrid')::date BETWEEN 0 AND v_end_days
    ORDER BY s.id, p.coverage_end
  LOOP
    FOR v_sup IN SELECT kiru_private.class_supervisors(r.mentor_id) LOOP
      PERFORM kiru_private.class_notify(v_sup, r.student_id, r.id, NULL, 'recuperacion_fin_periodo',
        'El periodo termina con una recuperación pendiente',
        r.student_name || ': el periodo acaba el ' || to_char(r.coverage_end, 'DD/MM') || ' y la clase del '
          || kiru_private.class_label(r.original_start) || ' sigue por recuperar. No se pierde: revisadla.',
        'recuperacion_fin_periodo:' || r.id || ':' || r.coverage_end);
      v_period := v_period + 1;
    END LOOP;
  END LOOP;

  RETURN v_gen || jsonb_build_object('recordatorios_mentor', v_mentor, 'avisos_sin_avanzar', v_stale, 'avisos_fin_periodo', v_period);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_clases_tarea_diaria() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_clases_tarea_diaria() TO service_role;
