-- Desempeño de mentores · Fase 1, ajustes tras la revisión final (13/11/2026).
--
-- Solo redefine el cálculo de indicadores (no cambia tablas, reglas ni permisos):
-- 1. B3: una cancelación del mentor marcada «no justificada» solo resta cuando la clase ya
--    está resuelta (forma parte de la base de B1). Antes podía restar una clase cuya
--    recuperación seguía en curso, que aún no está en la base.
-- 2. B4: la recuperación también cuenta en plazo si Coordinación o Administración la
--    programaron directamente en los 3 días, aunque no haya una propuesta de fechas.
-- 3. Borrar un perfil (por ejemplo, un administrador que ya no está) no debe quedar
--    bloqueado por el historial o las reglas aprobadas: se permite que la referencia a
--    esa persona pase a vacío, sin tocar nada más de la fila.

CREATE OR REPLACE FUNCTION kiru_private.perf_indicator_values(p_mentor uuid, p_from timestamptz, p_to timestamptz, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_now timestamptz := least(now(), p_to);
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_e1_hours int := coalesce((p_rules ->> 'e1_hours')::int, 24);
  v_e2_window int := coalesce((p_rules ->> 'e2_window_days')::int, 2);
  v_rec_days int := kiru_private.setting_int('recuperaciones_dias_sin_avanzar', 3);
  b record;
  v_ok int; v_fail int; v_total int; v_extra jsonb;
  v_min int;
BEGIN
  -- B1 · Clases previstas dadas -------------------------------------------------------
  -- Clases ordinarias del mentor asignado, ya terminadas, generadas para fechas del periodo.
  -- No cuentan: datos históricos, causas ajenas al mentor, clases que dio un sustituto
  -- ni clases sin registro todavía (eso solo pesa en E1).
  SELECT
    count(*) FILTER (WHERE (s.delivery = 'impartida' AND coalesce(s.delivered_by, s.mentor_id) = p_mentor)
                        OR (s.cancel_cause = 'mentor' AND s.recovery = 'realizada')) AS ok,
    count(*) FILTER (WHERE s.cancel_cause = 'mentor' AND s.delivery = 'no_impartida' AND s.recovery IN ('ninguna', 'sin_encaje')) AS fail,
    count(*) FILTER (WHERE s.cancel_cause = 'mentor' AND s.delivery = 'no_impartida' AND s.recovery IN ('pendiente', 'propuesta', 'programada')) AS rec_pending,
    count(*) FILTER (WHERE s.delivery = 'programada') AS no_log,
    count(*) FILTER (WHERE s.delivery = 'impartida' AND coalesce(s.delivered_by, s.mentor_id) <> p_mentor) AS substitute,
    count(*) FILTER (WHERE s.delivery IN ('no_impartida', 'anulada') AND coalesce(s.cancel_cause, '') <> 'mentor') AS other_cause,
    count(*) FILTER (WHERE s.cancel_cause = 'mentor' AND s.delivery = 'no_impartida' AND s.recovery = 'rechazada') AS family_declined,
    coalesce(jsonb_agg(s.id) FILTER (WHERE s.cancel_cause = 'mentor' AND s.delivery = 'no_impartida' AND s.recovery IN ('ninguna', 'sin_encaje')), '[]'::jsonb) AS fail_ids
  INTO b
  FROM public.kiru_class_sessions s
  WHERE s.mentor_id = p_mentor AND s.kind = 'regular'
    AND s.source <> 'historico' AND coalesce(s.cancel_cause, '') <> 'historico_sin_clasificar'
    AND s.original_start >= p_from AND s.original_start < p_to
    AND s.scheduled_end < v_now;
  v_total := b.ok + b.fail;
  v_min := coalesce((p_rules #>> '{min_sample,B1}')::int, 4);
  v_out := v_out || jsonb_build_object('B1', jsonb_build_object(
    'status', CASE WHEN v_total >= v_min THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN v_total >= v_min THEN round(100.0 * b.ok / v_total, 1) END,
    'ok', b.ok, 'total', v_total,
    'detail', jsonb_build_object('dadas', b.ok, 'perdidas_por_el_mentor', b.fail, 'recuperacion_en_curso', b.rec_pending,
      'sin_registro_todavia', b.no_log, 'dadas_por_sustituto', b.substitute, 'causa_ajena', b.other_cause,
      'familia_rechazo_recuperar', b.family_declined, 'minimo', v_min, 'clases_perdidas', b.fail_ids)));

  -- B3 · Cambios y cancelaciones --------------------------------------------------------
  -- Sobre las mismas clases resueltas de B1: cuántas tuvieron un cambio o cancelación del
  -- mentor que Coordinación marcó como no justificado. Lo pendiente de revisar no resta.
  SELECT
    -- Solo clases que forman parte de la base de B1 (resueltas): una cancelación con la
    -- recuperación aún en curso no resta todavía; restará cuando se resuelva.
    count(DISTINCT s.id) FILTER (WHERE r.incident = 'no_justificada' AND (
        (s.delivery = 'impartida' AND coalesce(s.delivered_by, s.mentor_id) = p_mentor)
        OR (s.cancel_cause = 'mentor' AND s.recovery = 'realizada')
        OR (s.cancel_cause = 'mentor' AND s.delivery = 'no_impartida' AND s.recovery IN ('ninguna', 'sin_encaje')))) AS bad,
    count(DISTINCT r.id) FILTER (WHERE r.incident IN ('potencial', 'abierta', 'mas_info')) AS reviewing,
    count(DISTINCT r.id) FILTER (WHERE r.incident = 'justificada') AS justified,
    count(DISTINCT r.id) FILTER (WHERE r.hours_notice IS NOT NULL AND r.hours_notice < 48) AS under48
  INTO b
  FROM public.kiru_class_sessions s
  JOIN public.kiru_class_requests r ON r.session_id = s.id
  WHERE s.mentor_id = p_mentor AND s.kind = 'regular'
    AND s.source <> 'historico' AND coalesce(s.cancel_cause, '') <> 'historico_sin_clasificar'
    AND s.original_start >= p_from AND s.original_start < p_to AND s.scheduled_end < v_now
    AND r.requester_role = 'mentor' AND r.kind IN ('cambio', 'cancelacion');
  v_min := coalesce((p_rules #>> '{min_sample,B3}')::int, 4);
  v_out := v_out || jsonb_build_object('B3', jsonb_build_object(
    'status', CASE WHEN v_total >= v_min THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN v_total >= v_min THEN round(100.0 * greatest(v_total - b.bad, 0) / v_total, 1) END,
    'ok', greatest(v_total - b.bad, 0), 'total', v_total,
    'detail', jsonb_build_object('no_justificados', b.bad, 'pendientes_de_revisar', b.reviewing,
      'justificados', b.justified, 'con_menos_de_48h', b.under48, 'minimo', v_min)));

  -- B4 · Recuperaciones: fechas propuestas dentro del plazo ----------------------------------
  -- Clases del mentor con una recuperación que organizar, canceladas dentro del periodo y cuyo
  -- plazo ya ha pasado. Cumple si hubo propuesta de fechas en plazo, una excepción aprobada o la
  -- familia renunció a recuperar.
  SELECT
    count(*) FILTER (WHERE x.on_time) AS ok,
    count(*) AS total,
    coalesce(jsonb_agg(x.id) FILTER (WHERE NOT x.on_time), '[]'::jsonb) AS late_ids
  INTO b
  FROM (
    SELECT s.id,
      (s.recovery_exception_at IS NOT NULL OR s.recovery = 'rechazada' OR EXISTS (
         SELECT 1 FROM public.kiru_class_requests r
         WHERE r.session_id = s.id AND r.kind = 'propuesta_recuperacion'
           AND r.created_at <= s.cancelled_at + make_interval(days => v_rec_days))
       -- También cumple si la recuperación se programó en plazo por otra vía (Coordinación o Administración).
       OR EXISTS (
         SELECT 1 FROM public.kiru_class_sessions x
         WHERE x.recovers_session_id = s.id
           AND x.created_at <= s.cancelled_at + make_interval(days => v_rec_days))) AS on_time
    FROM public.kiru_class_sessions s
    WHERE s.mentor_id = p_mentor AND s.kind = 'regular' AND s.delivery = 'no_impartida'
      AND s.source <> 'historico' AND coalesce(s.cancel_cause, '') <> 'historico_sin_clasificar'
      AND s.recovery <> 'ninguna'
      AND s.cancelled_at >= p_from AND s.cancelled_at < p_to
      AND s.cancelled_at + make_interval(days => v_rec_days) < v_now
  ) x;
  v_min := coalesce((p_rules #>> '{min_sample,B4}')::int, 1);
  v_out := v_out || jsonb_build_object('B4', jsonb_build_object(
    'status', CASE WHEN b.total = 0 THEN 'no_aplica' WHEN b.total >= v_min THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN b.total > 0 AND b.total >= v_min THEN round(100.0 * b.ok / b.total, 1) END,
    'ok', b.ok, 'total', b.total,
    'detail', jsonb_build_object('plazo_dias', v_rec_days, 'fuera_de_plazo', b.late_ids, 'minimo', v_min)));

  -- E1 · Registro de sesión en 24 h -----------------------------------------------------
  -- a) Clases que dio el mentor (también como sustituto): registro enviado a tiempo o no.
  -- b) Clases suyas ya pasadas y sin registro cuando han pasado las 24 h: fuera de plazo.
  -- c) Registros suyos que no están enlazados a ninguna clase: plazo hasta las 24 h del día siguiente.
  SELECT
    count(*) FILTER (WHERE x.on_time) AS ok,
    count(*) AS total,
    count(*) FILTER (WHERE x.kind = 'sin_registro') AS missing,
    count(*) FILTER (WHERE x.kind = 'clase' AND NOT x.on_time) AS late_linked,
    count(*) FILTER (WHERE x.kind = 'registro_suelto') AS loose
  INTO b
  FROM (
    SELECT 'clase'::text AS kind, (l.submitted_at <= s.scheduled_end + make_interval(hours => v_e1_hours)) AS on_time
    FROM public.kiru_class_sessions s
    JOIN public.kiru_session_logs l ON l.id = s.session_log_id
    WHERE s.delivery = 'impartida' AND coalesce(s.delivered_by, s.mentor_id) = p_mentor
      AND s.source <> 'historico'
      AND s.scheduled_start >= p_from AND s.scheduled_start < p_to
    UNION ALL
    SELECT 'sin_registro', false
    FROM public.kiru_class_sessions s
    WHERE s.mentor_id = p_mentor AND s.delivery = 'programada' AND s.source <> 'historico'
      AND s.scheduled_start >= p_from AND s.scheduled_start < p_to
      AND s.scheduled_end + make_interval(hours => v_e1_hours) < v_now
    UNION ALL
    SELECT 'registro_suelto',
      (l.submitted_at <= ((l.session_date + 1)::timestamp + interval '23 hours 59 minutes') AT TIME ZONE 'Europe/Madrid')
    FROM public.kiru_session_logs l
    WHERE l.mentor_id = p_mentor AND l.session_date IS NOT NULL
      AND coalesce(l.manual_status, '') <> 'archivado'
      AND NOT EXISTS (SELECT 1 FROM public.kiru_class_sessions s WHERE s.session_log_id = l.id)
      AND (l.session_date::timestamp AT TIME ZONE 'Europe/Madrid') >= p_from
      AND (l.session_date::timestamp AT TIME ZONE 'Europe/Madrid') < p_to
  ) x;
  v_min := coalesce((p_rules #>> '{min_sample,E1}')::int, 4);
  v_out := v_out || jsonb_build_object('E1', jsonb_build_object(
    'status', CASE WHEN b.total >= v_min THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN b.total >= v_min THEN round(100.0 * b.ok / b.total, 1) END,
    'ok', b.ok, 'total', b.total,
    'detail', jsonb_build_object('horas', v_e1_hours, 'sin_registro', b.missing, 'tarde', b.late_linked,
      'registros_sin_clase', b.loose, 'minimo', v_min)));

  -- E2 · Obligaciones con plazo -------------------------------------------------------------
  -- Formulario trimestral del mentor (plazo: su fecha + 2 días) y justificaciones de SkillCoins
  -- con fecha límite. Lo que aún está en plazo no cuenta.
  SELECT count(*) FILTER (WHERE x.on_time) AS ok, count(*) AS total,
         count(*) FILTER (WHERE x.kind = 'formulario') AS forms, count(*) FILTER (WHERE x.kind = 'justificacion') AS reviews
  INTO b
  FROM (
    SELECT 'formulario'::text AS kind,
      (e.status = 'completada' AND (e.completed_at AT TIME ZONE 'Europe/Madrid')::date <= e.due_on + v_e2_window) AS on_time
    FROM public.kiru_evaluations e
    WHERE e.target = 'mentor' AND e.mentor_id = p_mentor AND e.status <> 'cancelada'
      AND (e.due_on::timestamp AT TIME ZONE 'Europe/Madrid') >= p_from
      AND (e.due_on::timestamp AT TIME ZONE 'Europe/Madrid') < p_to
      AND (e.status = 'completada' OR e.due_on + v_e2_window < v_today)
    UNION ALL
    SELECT 'justificacion',
      (rv.answered_at IS NOT NULL AND (rv.answered_at AT TIME ZONE 'Europe/Madrid')::date <= rv.due_date)
    FROM public.kiru_skillcoin_reviews rv
    WHERE rv.mentor_id = p_mentor AND rv.due_date IS NOT NULL
      AND (rv.due_date::timestamp AT TIME ZONE 'Europe/Madrid') >= p_from
      AND (rv.due_date::timestamp AT TIME ZONE 'Europe/Madrid') < p_to
      AND (rv.answered_at IS NOT NULL OR rv.due_date < v_today)
  ) x;
  v_min := coalesce((p_rules #>> '{min_sample,E2}')::int, 1);
  v_out := v_out || jsonb_build_object('E2', jsonb_build_object(
    'status', CASE WHEN b.total = 0 THEN 'no_aplica' WHEN b.total >= v_min THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN b.total > 0 AND b.total >= v_min THEN round(100.0 * b.ok / b.total, 1) END,
    'ok', b.ok, 'total', b.total,
    'detail', jsonb_build_object('formularios', b.forms, 'justificaciones', b.reviews, 'margen_dias_formulario', v_e2_window)));

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.perf_indicator_values(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.perf_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Única excepción: al borrar un perfil, su referencia pasa a vacío (ON DELETE SET NULL).
  IF TG_OP = 'UPDATE' AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
     AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El historial de desempeño no se modifica ni se borra.' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION kiru_private.perf_rules_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'borrador' THEN
      RAISE EXCEPTION 'Una versión aprobada de las reglas no se borra.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'borrador' THEN RETURN NEW; END IF;
  -- Al borrar un perfil, quién creó o aprobó la versión pasa a vacío; nada más cambia.
  IF (to_jsonb(NEW) - 'approved_by' - 'created_by') = (to_jsonb(OLD) - 'approved_by' - 'created_by')
     AND (NEW.approved_by IS NULL OR NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by)
     AND (NEW.created_by IS NULL OR NEW.created_by IS NOT DISTINCT FROM OLD.created_by) THEN
    RETURN NEW;
  END IF;
  -- Aprobada o retirada: solo se puede pasar de aprobada a retirada, sin tocar nada más.
  IF OLD.status = 'aprobada' AND NEW.status = 'retirada'
     AND NEW.rules = OLD.rules AND NEW.version = OLD.version AND NEW.approved_at = OLD.approved_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Una versión aprobada de las reglas no se modifica: crea una versión nueva.' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.perf_events_append_only(), kiru_private.perf_rules_guard() FROM PUBLIC;
