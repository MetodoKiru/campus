-- Recordatorios para Coordinación (20/11/2026, pedido por Sofía).
--
-- Lo que el coordinador tiene que hacer y aún no se le recordaba:
-- 1. Ficha mensual de Cálculalo (A3): el día 1 de cada mes, aviso con los alumnos de sus
--    mentores que no tienen la ficha del mes anterior; el día 5, recordatorio si aún falta
--    alguna. Una sola notificación por coordinador y día, con la lista de alumnos.
-- 2. Evidencias enviadas sin revisar: a los 2 días laborables de llegar, un recordatorio por
--    entrega para que la valide o pida una aclaración.
-- Ya tenían recordatorio (no se tocan): valorar al mentor tras las llamadas de las semanas
-- 1 y 4 (llamadas), justificaciones por valorar y evidencias sin entregar tras 3 avisos.
--
-- Igual que el resto del sistema: nada mientras el modo sea «oculto» y solo cuentan los
-- meses desde «Cuentan datos desde» (01/01/2027). Si el mentor no tiene coordinador, el
-- aviso va a Administración. Los correos entran en el resumen diario de las 19:00.

-- 0. Tipo de aviso nuevo (se añade a los que ya hay) -------------------------------------
DO $kinds$
DECLARE
  v_kinds text[];
BEGIN
  -- La lista puede estar escrita como 'a'::text, 'b'::text o como '{a,b}'::text[].
  SELECT coalesce(array_agg(DISTINCT k), '{}') INTO v_kinds FROM (
    SELECT m[1] AS k
      FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_0-9]+)''', 'g') AS m
     WHERE c.conname = 'kiru_notifications_kind_check' AND c.conrelid = 'public.kiru_notifications'::regclass
    UNION
    SELECT trim(x)
      FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''\{([a-z_0-9, ]*)\}''', 'g') AS b,
           unnest(string_to_array(b[1], ',')) AS x
     WHERE c.conname = 'kiru_notifications_kind_check' AND c.conrelid = 'public.kiru_notifications'::regclass
  ) AS t WHERE k <> '';
  v_kinds := ARRAY(SELECT DISTINCT k FROM unnest(v_kinds || ARRAY['coordinacion_pendiente']) AS k ORDER BY 1);
  ALTER TABLE public.kiru_notifications DROP CONSTRAINT IF EXISTS kiru_notifications_kind_check;
  EXECUTE format('ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check CHECK (kind = ANY (%L::text[]))', v_kinds);
END
$kinds$;

-- 1. Recordatorios del día -------------------------------------------------------------------
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

  RETURN v_sent;
END;
$$;
REVOKE ALL ON FUNCTION kiru_private.coordination_reminders(date) FROM PUBLIC;

-- 2. La tarea diaria de las 8:00 UTC también los manda ---------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_evidencias_tarea_diaria()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new integer;
  v_sent integer;
  v_coord integer;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' AND kiru_private.active_uid() IS NOT NULL AND NOT kiru_private.is_admin() THEN
    RAISE EXCEPTION 'Solo Administración.' USING ERRCODE = '42501';
  END IF;
  v_new := kiru_private.evidence_generate();
  v_sent := kiru_private.evidence_reminders();
  v_coord := kiru_private.coordination_reminders((now() AT TIME ZONE 'Europe/Madrid')::date);
  RETURN jsonb_build_object('entregas_nuevas', v_new, 'recordatorios', v_sent, 'recordatorios_coordinacion', v_coord);
END;
$$;
