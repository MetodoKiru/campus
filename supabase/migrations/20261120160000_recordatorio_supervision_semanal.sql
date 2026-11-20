-- Recordatorio semanal para Coordinación (20/11/2026, pedido por Sofía).
--
-- Cada lunes, a cada coordinador con mentores (o a Administración si un mentor no tiene
-- coordinador): repasar «Supervisión» (notas de SkillCoins de la semana pasada y las
-- marcadas «para revisar»), con el número de justificaciones que esperan su valoración.
-- Mismas reglas que el resto: nada en modo oculto; correo en el resumen de las 19:00.

CREATE OR REPLACE FUNCTION kiru_private.coordination_reminders(p_today date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month date := (date_trunc('month', p_today) - interval '1 month')::date;
  v_label text;
  v_sent integer := 0;
  v_before integer;
  c record;
  e record;
BEGIN
  IF kiru_private.perf_mode() = 'oculto' THEN RETURN 0; END IF;

  -- Fichas de Cálculalo del mes anterior: días 1 y 5.
  IF extract(day FROM p_today) IN (1, 5) AND v_month >= date_trunc('month', kiru_private.perf_data_from())::date THEN
    v_label := (ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month FROM v_month)::int];
    FOR c IN
      SELECT sup AS coordinator_id, array_agg(DISTINCT kiru_private.first_name(sm.student_id) ORDER BY kiru_private.first_name(sm.student_id)) AS names
      FROM public.student_mentors sm
      JOIN public.profiles pm ON pm.id = sm.mentor_id AND pm.is_active
      JOIN public.profiles ps ON ps.id = sm.student_id AND ps.is_active
      CROSS JOIN LATERAL kiru_private.class_supervisors(sm.mentor_id) AS sup
      WHERE sm.assigned_at < (v_month + interval '1 month')
        AND NOT EXISTS (SELECT 1 FROM public.kiru_calculalo_checks k WHERE k.student_id = sm.student_id AND k.month = v_month)
      GROUP BY sup
    LOOP
      SELECT count(*) INTO v_before FROM public.kiru_notifications;
      PERFORM kiru_private.supervision_notify(c.coordinator_id, NULL, NULL, NULL, 'coordinacion_pendiente',
        CASE WHEN extract(day FROM p_today) = 1 THEN 'Fichas de Cálculalo de ' || v_label
             ELSE 'Recordatorio: fichas de Cálculalo de ' || v_label END,
        'Falta la ficha de ' || array_to_string(c.names[1:12], ', ')
          || CASE WHEN cardinality(c.names) > 12 THEN ' y ' || (cardinality(c.names) - 12) || ' más' ELSE '' END
          || '. Rellénalas en «Seguimiento», eligiendo ese mes arriba: semanas con 4 días o más y si el mentor preparó actividades.',
        'coordinacion:calculalo:' || v_month || ':' || c.coordinator_id || ':' || extract(day FROM p_today), true);
      IF (SELECT count(*) FROM public.kiru_notifications) > v_before THEN v_sent := v_sent + 1; END IF;
    END LOOP;
  END IF;

  -- Evidencias enviadas que llevan 2 días laborables sin revisar.
  FOR e IN
    SELECT ev.*, sup AS coordinator_id
    FROM public.kiru_material_evidence ev
    CROSS JOIN LATERAL kiru_private.class_supervisors(ev.mentor_id) AS sup
    WHERE ev.status = 'entregada'
      AND kiru_private.add_working_days(ev.status_since, 2) <= now()
  LOOP
    SELECT count(*) INTO v_before FROM public.kiru_notifications;
    PERFORM kiru_private.supervision_notify(e.coordinator_id, e.student_id, NULL, NULL, 'coordinacion_pendiente',
      'Evidencia por revisar',
      coalesce((SELECT full_name FROM public.profiles WHERE id = e.mentor_id), 'Un mentor') || ' envió '
        || CASE e.kind WHEN 'descubrirme' THEN '«Descubrirme»' ELSE 'la misión' END || ' de ' || kiru_private.first_name(e.student_id)
        || ' hace más de 2 días laborables. Valídala o pide una aclaración en «Seguimiento» → «Evidencias por revisar».',
      'coordinacion:evidencia:' || e.id || ':' || e.status_since || ':' || e.coordinator_id, true);
    IF (SELECT count(*) FROM public.kiru_notifications) > v_before THEN v_sent := v_sent + 1; END IF;
  END LOOP;

  -- Cada lunes: repaso semanal de «Supervisión», con las justificaciones que esperan valoración.
  IF extract(isodow FROM p_today) = 1 THEN
    FOR c IN
      SELECT sup AS coordinator_id,
             (SELECT count(*) FROM public.kiru_skillcoin_reviews rv
               WHERE rv.status IN ('respondida', 'pendiente_valoracion')
                 AND sup IN (SELECT kiru_private.class_supervisors(rv.mentor_id))) AS to_value
      FROM (SELECT DISTINCT sup
              FROM public.student_mentors sm
              JOIN public.profiles pm ON pm.id = sm.mentor_id AND pm.is_active
              JOIN public.profiles ps ON ps.id = sm.student_id AND ps.is_active
              CROSS JOIN LATERAL kiru_private.class_supervisors(sm.mentor_id) AS sup) s
    LOOP
      SELECT count(*) INTO v_before FROM public.kiru_notifications;
      PERFORM kiru_private.supervision_notify(c.coordinator_id, NULL, NULL, NULL, 'coordinacion_pendiente',
        'Repaso semanal de Supervisión',
        'Revisa en «Supervisión» las notas de SkillCoins de la semana pasada y las marcadas «para revisar».'
          || CASE WHEN c.to_value = 1 THEN ' Tienes 1 justificación por valorar.'
                  WHEN c.to_value > 1 THEN ' Tienes ' || c.to_value || ' justificaciones por valorar.' ELSE '' END,
        'coordinacion:supervision:' || p_today || ':' || c.coordinator_id, true);
      IF (SELECT count(*) FROM public.kiru_notifications) > v_before THEN v_sent := v_sent + 1; END IF;
    END LOOP;
  END IF;

  RETURN v_sent;
END;
$$;
REVOKE ALL ON FUNCTION kiru_private.coordination_reminders(date) FROM PUBLIC;
