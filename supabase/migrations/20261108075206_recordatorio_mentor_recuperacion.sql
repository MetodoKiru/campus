-- Recuperaciones: texto más claro para el mentor y recordatorio automático al
-- propio mentor a los 2 días (antes de avisar a su coordinador a los 3).
-- Solo reemplaza dos funciones y añade un ajuste; no toca datos.
INSERT INTO public.kiru_settings (key, value) VALUES ('recuperaciones_dias_recordatorio_mentor', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION kiru_private.class_notify_new_recovery(p_session uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.kiru_class_sessions;
  v_sup uuid;
  v_student text;
BEGIN
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = p_session;
  IF s.recovery <> 'pendiente' THEN RETURN; END IF;
  SELECT full_name INTO v_student FROM public.profiles WHERE id = s.student_id;
  FOR v_sup IN SELECT kiru_private.class_supervisors(s.mentor_id) LOOP
    PERFORM kiru_private.class_notify(v_sup, s.student_id, s.id, NULL, 'recuperacion_nueva',
      'Recuperación pendiente de organizar',
      coalesce(v_student, '') || ': clase del ' || kiru_private.class_label(s.original_start) || ' por recuperar.',
      'recuperacion_nueva:' || s.id);
  END LOOP;
  PERFORM kiru_private.class_notify(s.mentor_id, s.student_id, s.id, NULL, 'recuperacion_nueva',
    'Tienes una clase por recuperar',
    coalesce(v_student, '') || ': la clase del ' || kiru_private.class_label(s.original_start)
      || ' quedó sin dar y la familia la conserva. Entra en el campus y propón dos o tres fechas para recuperarla lo antes posible: '
      || 'así la familia elige enseguida y no hace falta que intervenga tu coordinador. ¡Gracias por encargarte!',
    'recuperacion_nueva:' || s.id);
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
    WHERE s.kind = 'regular' AND s.recovery = 'pendiente'
      AND s.recovery_status_since < now() - make_interval(days => v_mentor_days)
  LOOP
    PERFORM kiru_private.class_notify(r.mentor_id, r.student_id, r.id, NULL, 'recuperacion_recordatorio',
      'Recuerda proponer fechas de recuperación',
      r.student_name || ': la clase del ' || kiru_private.class_label(r.original_start)
        || ' sigue pendiente de recuperar. Cuando puedas, entra en el campus y propón fechas. '
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
                             WHEN 'propuesta' THEN 'la familia aún no ha elegido fecha'
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
