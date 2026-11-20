-- Seguimiento de recuperaciones: coordinación puede retirar las fechas que ha
-- propuesto el mentor y pedirle otras. La propuesta abierta queda «retirada»,
-- la recuperación vuelve a «Pendiente de organizar» (le toca al mentor) y se
-- avisa al mentor (con la nota de coordinación) y a la familia (que ya no tiene
-- que elegir). Reemplaza kiru_recuperaciones_gestionar; no toca datos.

CREATE OR REPLACE FUNCTION public.kiru_recuperaciones_gestionar(
  p_actor uuid, p_session uuid, p_action text, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.kiru_class_sessions;
  v_role text;
  v_g uuid;
  v_student text;
  v_req uuid;
  v_day text := to_char(now() AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD');
BEGIN
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa clase.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, s.mentor_id, s.student_id);
  IF v_role NOT IN ('coordinador', 'admin') THEN RAISE EXCEPTION 'Solo coordinación.' USING ERRCODE = '42501'; END IF;
  SELECT full_name INTO v_student FROM public.profiles WHERE id = s.student_id;

  IF p_action = 'recordar_mentor' THEN
    PERFORM kiru_private.class_notify(s.mentor_id, s.student_id, s.id, NULL, 'recuperacion_recordatorio',
      'Recuerda proponer fechas de recuperación',
      coalesce(v_student, '') || ': clase del ' || kiru_private.class_label(s.original_start) || '. ' || left(coalesce(p_note, ''), 300),
      'recuperacion_recordatorio:' || s.id || ':mentor:' || v_day);
  ELSIF p_action = 'recordar_familia' THEN
    FOR v_g IN SELECT kiru_private.class_guardians(s.student_id) LOOP
      PERFORM kiru_private.class_notify(v_g, s.student_id, s.id, NULL, 'recuperacion_recordatorio',
        'Tienes fechas de recuperación por elegir',
        'Clase del ' || kiru_private.class_label(s.original_start) || '. ' || left(coalesce(p_note, ''), 300),
        'recuperacion_recordatorio:' || s.id || ':familia:' || v_day);
    END LOOP;
  ELSIF p_action = 'pedir_otras_fechas' THEN
    IF s.recovery <> 'propuesta' THEN
      RAISE EXCEPTION 'Esta recuperación no tiene fechas propuestas que retirar.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT q.id INTO v_req FROM public.kiru_class_requests q
    WHERE q.session_id = s.id AND q.kind = 'propuesta_recuperacion' AND q.status = 'pendiente'
    ORDER BY q.created_at DESC LIMIT 1;
    IF v_req IS NULL THEN
      RAISE EXCEPTION 'No hay ninguna propuesta abierta para esta clase.' USING ERRCODE = 'check_violation';
    END IF;
    IF kiru_private.class_family_proposed(s.id) THEN
      RAISE EXCEPTION 'Las últimas fechas las ha propuesto la familia: ahora le toca responder al mentor.' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.kiru_class_requests
    SET status = 'retirada', decided_by = p_actor, decided_at = now(), decision_note = left(coalesce(p_note, ''), 2000)
    WHERE session_id = s.id AND kind = 'propuesta_recuperacion' AND status IN ('pendiente', 'mas_info', 'contrapropuesta');
    -- Vuelve a «Pendiente de organizar»: le toca al mentor y el plazo cuenta de nuevo.
    UPDATE public.kiru_class_sessions SET recovery = 'pendiente' WHERE id = s.id;

    PERFORM kiru_private.class_notify(s.mentor_id, s.student_id, s.id, v_req, 'recuperacion_recordatorio',
      'Propón otras fechas de recuperación',
      coalesce(v_student, '') || ': coordinación ha retirado las fechas que propusiste para recuperar la clase del '
        || kiru_private.class_label(s.original_start) || ' y te pide que propongas otras.'
        || CASE WHEN btrim(coalesce(p_note, '')) <> '' THEN ' Nota de coordinación: «' || left(btrim(p_note), 300) || '».' ELSE '' END
        || ' Entra en el campus y propón fechas nuevas.',
      'recuperacion_otras_fechas:' || v_req || ':mentor');
    FOR v_g IN SELECT kiru_private.class_guardians(s.student_id) LOOP
      PERFORM kiru_private.class_notify(v_g, s.student_id, s.id, v_req, 'recuperacion_recordatorio',
        'Las fechas de recuperación van a cambiar',
        'Las opciones que os enviamos para recuperar la clase del ' || kiru_private.class_label(s.original_start)
          || ' ya no están disponibles. En breve os llegarán otras para elegir. No tenéis que hacer nada por ahora.',
        'recuperacion_otras_fechas:' || v_req || ':familia');
    END LOOP;
  ELSIF p_action = 'excepcion_plazo' THEN
    IF length(btrim(coalesce(p_note, ''))) < 3 THEN RAISE EXCEPTION 'Explica la excepción y la fecha acordada.' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.kiru_class_sessions
    SET recovery_exception_note = left(p_note, 1000), recovery_exception_by = p_actor, recovery_exception_at = now()
    WHERE id = s.id;
  ELSE
    RAISE EXCEPTION 'Acción no válida.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM kiru_private.class_event(s.id, v_req, p_actor, p_action, jsonb_build_object('nota', left(coalesce(p_note, ''), 300)));
  RETURN jsonb_build_object('ok', true);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_recuperaciones_gestionar(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_recuperaciones_gestionar(uuid, uuid, text, text) TO service_role;
