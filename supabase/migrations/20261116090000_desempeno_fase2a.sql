-- Desempeño de mentores · Fase 2a (plan técnico aprobado por Sofía el 14/11/2026).
--
-- Tres datos nuevos que registra Coordinación y el cálculo de tres indicadores:
-- 1. kiru_student_plan_tools: inglés, lengua o tarjetas del campus que Coordinación
--    marca como obligatorios para un alumno. Lo básico (SkillCoins, Cálculalo,
--    «Descubrirme») es obligatorio para todos y no se marca. → A4
-- 2. kiru_calculalo_checks: ficha mensual de Cálculalo por alumno: semanas con 4 días
--    o más de trabajo y si el mentor preparó actividades. → A3
-- 3. kiru_log_error_marks: errores que Coordinación marca en un registro de sesión.
--    El mentor tiene 2 días laborables para contestar o corregir; si responde tarde o
--    no responde, el registro cuenta como incumplido. Si Coordinación retira la marca,
--    no cuenta. → E3
--
-- No cambia ninguna tabla en uso salvo para añadir dos tipos de aviso a la campanita.
-- No toca pagos de mentores ni el extra de 10 €. Todo se escribe con funciones que
-- comprueban el rol; el historial queda en kiru_perf_events.

-- 0. Avisos nuevos ----------------------------------------------------------------------
ALTER TABLE public.kiru_notifications DROP CONSTRAINT IF EXISTS kiru_notifications_kind_check;
ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check CHECK (kind IN (
  'objetivo_pendiente', 'objetivo_aprobado', 'objetivo_rechazado', 'canje_solicitado', 'canje_completado',
  'canje_aplazado', 'renovacion', 'informe_progreso', 'clase_solicitud', 'clase_decision', 'clase_mas_info',
  'recuperacion_propuesta', 'recuperacion_confirmada', 'recuperacion_sin_encaje', 'recuperacion_nueva',
  'recuperacion_sin_avanzar', 'recuperacion_recordatorio', 'recuperacion_fin_periodo', 'registro_aviso',
  'clase_incidencia', 'justificacion_solicitada', 'justificacion_respondida', 'justificacion_repregunta',
  'justificacion_cerrada', 'justificacion_recordatorio', 'justificacion_por_valorar', 'aviso_metodologico',
  'aviso_seguimiento', 'periodo_especial', 'evaluacion_trimestral',
  'horario_elegir', 'horario_confirmar', 'horario_confirmado', 'horario_otro', 'disponibilidad_actualizar',
  'disponibilidad_confirmar', 'disponibilidad_urgente', 'disponibilidad_falta',
  'registro_error', 'registro_error_respuesta'
));

-- Plazo en días laborables (lunes a viernes), hasta las 23:59 de Madrid del último día.
CREATE OR REPLACE FUNCTION kiru_private.add_working_days(p_from timestamptz, p_days integer)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_day date := (p_from AT TIME ZONE 'Europe/Madrid')::date;
  v_left integer := greatest(p_days, 0);
BEGIN
  WHILE v_left > 0 LOOP
    v_day := v_day + 1;
    IF extract(isodow FROM v_day) < 6 THEN v_left := v_left - 1; END IF;
  END LOOP;
  RETURN ((v_day + 1)::timestamp - interval '1 second') AT TIME ZONE 'Europe/Madrid';
END;
$$;

-- Quién puede trabajar con los datos de un alumno: administración o su coordinador.
CREATE OR REPLACE FUNCTION kiru_private.follows_student(p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.is_admin() OR kiru_private.coordinates_student(p_student)
$$;

-- 1. Herramientas obligatorias por alumno ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_student_plan_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool text NOT NULL CHECK (tool IN ('ingles', 'lengua', 'tarjetas')),
  active_from date NOT NULL,
  active_to date,
  set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ended_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (active_to IS NULL OR active_to >= active_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS kiru_student_plan_tools_open_idx ON public.kiru_student_plan_tools (student_id, tool) WHERE active_to IS NULL;
COMMENT ON TABLE public.kiru_student_plan_tools IS
  'Herramientas del campus (inglés, lengua, tarjetas) que Coordinación hace obligatorias para un alumno, con sus fechas. Sin fila, no son obligatorias.';

-- 2. Ficha mensual de Cálculalo --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_calculalo_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  weeks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(weeks) = 'array' AND jsonb_array_length(weeks) <= 6),
  weeks_due integer NOT NULL DEFAULT 0 CHECK (weeks_due BETWEEN 0 AND 6),
  weeks_ok integer NOT NULL DEFAULT 0 CHECK (weeks_ok BETWEEN 0 AND 6),
  mentor_prepared boolean NOT NULL,
  quality smallint CHECK (quality BETWEEN 1 AND 5),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  checked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, month),
  CHECK (weeks_ok <= weeks_due)
);
CREATE INDEX IF NOT EXISTS kiru_calculalo_checks_mentor_idx ON public.kiru_calculalo_checks (mentor_id, month);
COMMENT ON TABLE public.kiru_calculalo_checks IS
  'Ficha mensual de Cálculalo que rellena Coordinación: semanas en las que el alumno trabajó 4 días o más (mirando las fechas de las actividades) y si el mentor preparó actividades.';

-- 3. Errores en registros de sesión --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_log_error_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_log_id uuid NOT NULL REFERENCES public.kiru_session_logs(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('alumno_fecha', 'skillcoins', 'campos_vacios', 'contenido', 'otro')),
  comment text NOT NULL CHECK (length(trim(comment)) BETWEEN 1 AND 2000),
  marked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'respondida', 'retirada')),
  reply text NOT NULL DEFAULT '' CHECK (length(reply) <= 2000),
  replied_at timestamptz,
  withdrawn_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  withdrawn_at timestamptz,
  withdraw_reason text NOT NULL DEFAULT '' CHECK (length(withdraw_reason) <= 1000),
  CHECK (status <> 'respondida' OR replied_at IS NOT NULL),
  CHECK (status <> 'abierta' OR replied_at IS NULL),
  CHECK ((status = 'retirada') = (withdrawn_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS kiru_log_error_marks_live_idx ON public.kiru_log_error_marks (session_log_id) WHERE status <> 'retirada';
CREATE INDEX IF NOT EXISTS kiru_log_error_marks_mentor_idx ON public.kiru_log_error_marks (mentor_id, marked_at DESC);
COMMENT ON TABLE public.kiru_log_error_marks IS
  'Errores que Coordinación marca en un registro de sesión. Cuentan en E3 si el mentor no responde en 2 días laborables o responde tarde; si Coordinación la retira, no cuenta.';

-- 4. Permisos de lectura (nadie escribe directamente) ----------------------------------------
ALTER TABLE public.kiru_student_plan_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_calculalo_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_log_error_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kiru_student_plan_tools_read ON public.kiru_student_plan_tools;
CREATE POLICY kiru_student_plan_tools_read ON public.kiru_student_plan_tools FOR SELECT TO authenticated
  USING ((SELECT kiru_private.follows_student(student_id))
         OR EXISTS (SELECT 1 FROM public.student_mentors sm WHERE sm.student_id = kiru_student_plan_tools.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid())));
DROP POLICY IF EXISTS kiru_calculalo_checks_read ON public.kiru_calculalo_checks;
CREATE POLICY kiru_calculalo_checks_read ON public.kiru_calculalo_checks FOR SELECT TO authenticated
  USING ((SELECT kiru_private.follows_student(student_id)) OR (SELECT kiru_private.supervises_mentor(mentor_id)));
DROP POLICY IF EXISTS kiru_log_error_marks_read ON public.kiru_log_error_marks;
CREATE POLICY kiru_log_error_marks_read ON public.kiru_log_error_marks FOR SELECT TO authenticated
  USING (mentor_id = (SELECT kiru_private.active_uid()) OR (SELECT kiru_private.supervises_mentor(mentor_id)));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kiru_student_plan_tools, public.kiru_calculalo_checks, public.kiru_log_error_marks FROM anon, authenticated;
GRANT SELECT ON public.kiru_student_plan_tools, public.kiru_calculalo_checks, public.kiru_log_error_marks TO authenticated;

-- 5. Funciones de escritura ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_set_student_tool(p_student uuid, p_tool text, p_required boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_open public.kiru_student_plan_tools;
BEGIN
  IF v_me IS NULL OR NOT kiru_private.follows_student(p_student) THEN
    RAISE EXCEPTION 'Solo Coordinación de ese alumno o Administración pueden cambiar su plan.' USING ERRCODE = '42501';
  END IF;
  IF p_tool IS NULL OR p_tool NOT IN ('ingles', 'lengua', 'tarjetas') THEN
    RAISE EXCEPTION 'Herramienta no válida.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_open FROM public.kiru_student_plan_tools WHERE student_id = p_student AND tool = p_tool AND active_to IS NULL FOR UPDATE;
  IF p_required AND v_open.id IS NULL THEN
    INSERT INTO public.kiru_student_plan_tools (student_id, tool, active_from, set_by) VALUES (p_student, p_tool, v_today, v_me);
  ELSIF NOT p_required AND v_open.id IS NOT NULL THEN
    UPDATE public.kiru_student_plan_tools SET active_to = v_today, ended_by = v_me WHERE id = v_open.id;
  ELSE
    RETURN;
  END IF;
  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (v_me, 'plan_alumno', jsonb_build_object('alumno', p_student, 'herramienta', p_tool, 'obligatoria', p_required));
END;
$$;

CREATE OR REPLACE FUNCTION public.kiru_save_calculalo_check(
  p_student uuid, p_month date, p_weeks jsonb, p_prepared boolean, p_quality integer DEFAULT NULL, p_note text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_month date := date_trunc('month', p_month)::date;
  v_mentor uuid;
  v_due integer := 0;
  v_ok integer := 0;
  v_clean jsonb := '[]'::jsonb;
  w jsonb;
  v_week date;
  v_id uuid;
BEGIN
  IF v_me IS NULL OR NOT kiru_private.follows_student(p_student) THEN
    RAISE EXCEPTION 'Solo Coordinación de ese alumno o Administración pueden rellenar su ficha.' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR v_month > date_trunc('month', now() AT TIME ZONE 'Europe/Madrid')::date THEN
    RAISE EXCEPTION 'Elige un mes que ya haya empezado.' USING ERRCODE = 'P0001';
  END IF;
  IF p_prepared IS NULL THEN
    RAISE EXCEPTION 'Indica si el mentor preparó actividades.' USING ERRCODE = 'P0001';
  END IF;
  IF p_quality IS NOT NULL AND p_quality NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'La calidad va de 1 a 5.' USING ERRCODE = 'P0001';
  END IF;
  SELECT mentor_id INTO v_mentor FROM public.student_mentors WHERE student_id = p_student;
  IF v_mentor IS NULL THEN
    RAISE EXCEPTION 'Ese alumno no tiene mentor asignado.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(coalesce(p_weeks, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_weeks, '[]'::jsonb)) > 6 THEN
    RAISE EXCEPTION 'Las semanas no son válidas.' USING ERRCODE = 'P0001';
  END IF;
  -- Cada semana empieza en lunes y toca el mes; solo cuenta una vez.
  FOR w IN SELECT * FROM jsonb_array_elements(coalesce(p_weeks, '[]'::jsonb)) LOOP
    BEGIN
      v_week := (w ->> 'week')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Las semanas no son válidas.' USING ERRCODE = 'P0001';
    END;
    IF v_week IS NULL OR extract(isodow FROM v_week) <> 1 OR v_week > (v_month + interval '1 month' - interval '1 day')::date OR v_week + 6 < v_month THEN
      RAISE EXCEPTION 'Las semanas no son válidas.' USING ERRCODE = 'P0001';
    END IF;
    IF v_clean @> jsonb_build_array(jsonb_build_object('week', v_week)) THEN CONTINUE; END IF;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('week', v_week, 'ok', coalesce((w ->> 'ok')::boolean, false)));
    v_due := v_due + 1;
    IF coalesce((w ->> 'ok')::boolean, false) THEN v_ok := v_ok + 1; END IF;
  END LOOP;

  INSERT INTO public.kiru_calculalo_checks (student_id, mentor_id, month, weeks, weeks_due, weeks_ok, mentor_prepared, quality, note, checked_by)
  VALUES (p_student, v_mentor, v_month, v_clean, v_due, v_ok, p_prepared, p_quality, left(trim(coalesce(p_note, '')), 1000), v_me)
  ON CONFLICT (student_id, month) DO UPDATE SET
    weeks = EXCLUDED.weeks, weeks_due = EXCLUDED.weeks_due, weeks_ok = EXCLUDED.weeks_ok, mentor_prepared = EXCLUDED.mentor_prepared,
    quality = EXCLUDED.quality, note = EXCLUDED.note, checked_by = EXCLUDED.checked_by, updated_at = now()
  RETURNING id INTO v_id;
  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (v_me, 'ficha_calculalo', jsonb_build_object('alumno', p_student, 'mentor', v_mentor, 'mes', v_month,
    'semanas', v_due, 'semanas_ok', v_ok, 'preparo', p_prepared, 'calidad', p_quality));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiru_log_error_mark(p_log uuid, p_kind text, p_comment text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_log public.kiru_session_logs;
  v_due timestamptz := kiru_private.add_working_days(now(), 2);
  v_id uuid;
BEGIN
  SELECT * INTO v_log FROM public.kiru_session_logs WHERE id = p_log;
  IF v_log.id IS NULL OR v_log.mentor_id IS NULL THEN
    RAISE EXCEPTION 'Ese registro no tiene mentor asignado.' USING ERRCODE = 'P0001';
  END IF;
  IF v_me IS NULL OR NOT kiru_private.supervises_mentor(v_log.mentor_id) THEN
    RAISE EXCEPTION 'Solo puedes marcar registros de tus mentores.' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('alumno_fecha', 'skillcoins', 'campos_vacios', 'contenido', 'otro') THEN
    RAISE EXCEPTION 'Elige qué tipo de error es.' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(coalesce(p_comment, ''))) = 0 THEN
    RAISE EXCEPTION 'Explica al mentor qué hay que corregir.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kiru_log_error_marks WHERE session_log_id = p_log AND status <> 'retirada') THEN
    RAISE EXCEPTION 'Ese registro ya tiene un error marcado.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.kiru_log_error_marks (session_log_id, mentor_id, student_id, kind, comment, marked_by, due_at)
  VALUES (p_log, v_log.mentor_id, v_log.student_id, p_kind, left(trim(p_comment), 2000), v_me, v_due)
  RETURNING id INTO v_id;
  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (v_me, 'error_registro', jsonb_build_object('marca', v_id, 'registro', p_log, 'mentor', v_log.mentor_id, 'tipo', p_kind));
  PERFORM kiru_private.supervision_notify(v_log.mentor_id, v_log.student_id, NULL, NULL, 'registro_error',
    'Coordinación ha marcado un error en un registro de sesión',
    'Registro del ' || coalesce(to_char(v_log.session_date, 'DD/MM/YYYY'), 'día sin fecha') || ' de ' || kiru_private.first_name(v_log.student_id)
      || '. ' || left(trim(p_comment), 600) || ' Tienes hasta el ' || to_char(v_due AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY')
      || ' para corregirlo o contestar desde tu menú, en «Justificaciones».',
    'registro_error:' || v_id, true);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiru_log_error_reply(p_mark uuid, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_m public.kiru_log_error_marks;
BEGIN
  SELECT * INTO v_m FROM public.kiru_log_error_marks WHERE id = p_mark FOR UPDATE;
  IF v_m.id IS NULL OR v_m.mentor_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Solo el mentor del registro puede contestar.' USING ERRCODE = '42501';
  END IF;
  IF v_m.status <> 'abierta' THEN
    RAISE EXCEPTION 'Esta marca ya no admite respuesta.' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(coalesce(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'Escribe qué has corregido o tu explicación.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.kiru_log_error_marks SET status = 'respondida', reply = left(trim(p_body), 2000), replied_at = now() WHERE id = p_mark;
  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (v_me, 'error_registro_respuesta', jsonb_build_object('marca', p_mark, 'a_tiempo', now() <= v_m.due_at));
  PERFORM kiru_private.supervision_notify(v_m.marked_by, v_m.student_id, NULL, NULL, 'registro_error_respuesta',
    'Un mentor ha contestado a un error de registro',
    coalesce((SELECT full_name FROM public.profiles WHERE id = v_m.mentor_id), 'El mentor') || ' ha contestado'
      || CASE WHEN now() <= v_m.due_at THEN ' dentro del plazo' ELSE ' fuera de plazo' END || ': ' || left(trim(p_body), 600),
    'registro_error_respuesta:' || p_mark, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiru_log_error_withdraw(p_mark uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_m public.kiru_log_error_marks;
BEGIN
  SELECT * INTO v_m FROM public.kiru_log_error_marks WHERE id = p_mark FOR UPDATE;
  IF v_m.id IS NULL OR v_me IS NULL OR NOT kiru_private.supervises_mentor(v_m.mentor_id) THEN
    RAISE EXCEPTION 'Solo Coordinación de ese mentor o Administración pueden retirarla.' USING ERRCODE = '42501';
  END IF;
  IF v_m.status = 'retirada' THEN RETURN; END IF;
  IF length(trim(coalesce(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Escribe por qué se retira.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.kiru_log_error_marks
  SET status = 'retirada', withdrawn_by = v_me, withdrawn_at = now(), withdraw_reason = left(trim(p_reason), 1000)
  WHERE id = p_mark;
  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (v_me, 'error_registro_retirado', jsonb_build_object('marca', p_mark, 'motivo', left(trim(p_reason), 300)));
END;
$$;

REVOKE ALL ON FUNCTION public.kiru_set_student_tool(uuid, text, boolean),
  public.kiru_save_calculalo_check(uuid, date, jsonb, boolean, integer, text),
  public.kiru_log_error_mark(uuid, text, text), public.kiru_log_error_reply(uuid, text),
  public.kiru_log_error_withdraw(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_set_student_tool(uuid, text, boolean),
  public.kiru_save_calculalo_check(uuid, date, jsonb, boolean, integer, text),
  public.kiru_log_error_mark(uuid, text, text), public.kiru_log_error_reply(uuid, text),
  public.kiru_log_error_withdraw(uuid, text) TO authenticated;

-- 6. Cálculo de A3, A4 y E3 ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kiru_private.perf_indicator_values_2a(p_mentor uuid, p_from timestamptz, p_to timestamptz, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_now timestamptz := least(now(), p_to);
  v_from date := (p_from AT TIME ZONE 'Europe/Madrid')::date;
  v_to date := (p_to AT TIME ZONE 'Europe/Madrid')::date;          -- exclusivo
  v_today date := (v_now AT TIME ZONE 'Europe/Madrid')::date;
  b record;
  v_min int;
  v_usage numeric;
  v_value numeric;
BEGIN
  -- A3 · Cálculalo: 50 % semanas con 4 días o más, 50 % meses en los que el mentor preparó actividades.
  SELECT count(*) AS sheets, coalesce(sum(c.weeks_due), 0) AS due, coalesce(sum(c.weeks_ok), 0) AS ok,
         count(*) FILTER (WHERE c.mentor_prepared) AS prepared, round(avg(c.quality), 1) AS quality
  INTO b
  FROM public.kiru_calculalo_checks c
  WHERE c.mentor_id = p_mentor AND c.month >= date_trunc('month', v_from)::date AND c.month < v_to
    AND (c.month + interval '1 month')::date > v_from;
  v_min := coalesce((p_rules #>> '{min_sample,A3}')::int, 1);
  IF b.sheets >= v_min AND b.sheets > 0 THEN
    v_usage := CASE WHEN b.due > 0 THEN 1.0 * b.ok / b.due END;
    v_value := CASE WHEN v_usage IS NULL THEN 100.0 * b.prepared / b.sheets
                    ELSE 50 * v_usage + 50.0 * b.prepared / b.sheets END;
  ELSE
    v_value := NULL;
  END IF;
  v_out := v_out || jsonb_build_object('A3', jsonb_build_object(
    'status', CASE WHEN v_value IS NULL THEN 'pendiente' ELSE 'calculado' END,
    'value', round(v_value, 1), 'ok', b.ok, 'total', b.due,
    'detail', jsonb_build_object('fichas', b.sheets, 'semanas', b.due, 'semanas_con_4_dias', b.ok,
      'meses_con_actividades_preparadas', b.prepared, 'calidad_media', b.quality, 'minimo', v_min)));

  -- A4 · Plataforma: quincenas en las que el mentor asignó o revisó la herramienta obligatoria.
  WITH tools AS (
    SELECT t.student_id, t.tool,
           greatest(t.active_from, v_from, (sm.assigned_at AT TIME ZONE 'Europe/Madrid')::date) AS start_day,
           least(coalesce(t.active_to + 1, v_to), v_to, v_today) AS end_day   -- exclusivo
    FROM public.kiru_student_plan_tools t
    JOIN public.student_mentors sm ON sm.student_id = t.student_id AND sm.mentor_id = p_mentor
  ),
  blocks AS (
    SELECT t.student_id, t.tool, g::date AS b_start, (g + interval '14 days')::date AS b_end
    FROM tools t, generate_series(t.start_day::timestamp, (t.end_day - 14)::timestamp, interval '14 days') g
    WHERE t.end_day - t.start_day >= 14
  ),
  judged AS (
    SELECT bl.*, (
      CASE bl.tool
        WHEN 'tarjetas' THEN EXISTS (
          SELECT 1 FROM public.kiru_flashcard_sets f
          WHERE f.student_id = bl.student_id AND f.created_by = p_mentor
            AND ((f.created_at AT TIME ZONE 'Europe/Madrid')::date >= bl.b_start AND (f.created_at AT TIME ZONE 'Europe/Madrid')::date < bl.b_end
              OR (f.updated_at AT TIME ZONE 'Europe/Madrid')::date >= bl.b_start AND (f.updated_at AT TIME ZONE 'Europe/Madrid')::date < bl.b_end))
        ELSE EXISTS (
          SELECT 1 FROM public.kiru_app_records r
          WHERE r.record_type = 'task'
            AND r.data ->> 'kind' = CASE bl.tool WHEN 'ingles' THEN 'english_task' ELSE 'lengua_task' END
            AND (r.owner_id = bl.student_id OR r.data ->> 'studentId' = bl.student_id::text)
            AND (r.created_by = p_mentor OR r.data ->> 'mentorId' = p_mentor::text)
            AND ((r.created_at AT TIME ZONE 'Europe/Madrid')::date >= bl.b_start AND (r.created_at AT TIME ZONE 'Europe/Madrid')::date < bl.b_end
              OR (r.updated_at AT TIME ZONE 'Europe/Madrid')::date >= bl.b_start AND (r.updated_at AT TIME ZONE 'Europe/Madrid')::date < bl.b_end))
      END) AS ok
    FROM blocks bl
  )
  SELECT (SELECT count(*) FROM tools) AS tools, count(*) AS total, count(*) FILTER (WHERE ok) AS ok,
         count(*) FILTER (WHERE tool = 'ingles') AS ingles, count(*) FILTER (WHERE tool = 'lengua') AS lengua,
         count(*) FILTER (WHERE tool = 'tarjetas') AS tarjetas
  INTO b FROM judged;
  v_min := coalesce((p_rules #>> '{min_sample,A4}')::int, 1);
  v_out := v_out || jsonb_build_object('A4', jsonb_build_object(
    'status', CASE WHEN b.tools = 0 THEN 'no_aplica' WHEN b.total >= v_min AND b.total > 0 THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN b.tools > 0 AND b.total >= v_min AND b.total > 0 THEN round(100.0 * b.ok / b.total, 1) END,
    'ok', b.ok, 'total', b.total,
    'detail', jsonb_build_object('quincenas_ingles', b.ingles, 'quincenas_lengua', b.lengua, 'quincenas_tarjetas', b.tarjetas,
      'herramientas_obligatorias', b.tools, 'minimo', v_min)));

  -- E3 · Corrección de los registros: registros sin error marcado, o con error contestado en plazo.
  SELECT count(*) FILTER (WHERE x.state = 'ok') AS ok, count(*) FILTER (WHERE x.state = 'mal') AS bad,
         count(*) FILTER (WHERE x.state = 'en_plazo') AS waiting, count(*) FILTER (WHERE x.marked) AS marked
  INTO b
  FROM (
    SELECT (m.id IS NOT NULL) AS marked,
      CASE WHEN m.id IS NULL THEN 'ok'
           WHEN m.replied_at IS NOT NULL AND m.replied_at <= m.due_at THEN 'ok'
           WHEN m.replied_at IS NOT NULL THEN 'mal'
           WHEN m.due_at < v_now THEN 'mal'
           ELSE 'en_plazo' END AS state
    FROM public.kiru_session_logs l
    LEFT JOIN public.kiru_log_error_marks m ON m.session_log_id = l.id AND m.status <> 'retirada'
    WHERE l.mentor_id = p_mentor AND l.session_date IS NOT NULL AND coalesce(l.manual_status, '') <> 'archivado'
      AND l.session_date >= v_from AND l.session_date < v_to
  ) x;
  v_min := coalesce((p_rules #>> '{min_sample,E3}')::int, 4);
  v_out := v_out || jsonb_build_object('E3', jsonb_build_object(
    'status', CASE WHEN b.ok + b.bad >= v_min THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN b.ok + b.bad >= v_min THEN round(100.0 * b.ok / (b.ok + b.bad), 1) END,
    'ok', b.ok, 'total', b.ok + b.bad,
    'detail', jsonb_build_object('con_error_marcado', b.marked, 'sin_contestar_a_tiempo', b.bad,
      'en_plazo_de_respuesta', b.waiting, 'plazo_dias_laborables', 2, 'minimo', v_min)));

  RETURN v_out;
END;
$$;

-- El cálculo de cada mentor junta los indicadores de la Fase 1 y los de la Fase 2a.
CREATE OR REPLACE FUNCTION kiru_private.perf_compute(p_from timestamptz, p_to timestamptz, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m record;
  v_values jsonb;
  v_out jsonb := '[]'::jsonb;
BEGIN
  FOR m IN SELECT p.id, p.full_name FROM public.profiles p WHERE p.role = 'mentor' ORDER BY p.full_name LOOP
    v_values := kiru_private.perf_indicator_values(m.id, p_from, p_to, p_rules)
             || kiru_private.perf_indicator_values_2a(m.id, p_from, p_to, p_rules);
    -- Las incidencias llegan en la fase 5: de momento ninguna.
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'mentor_id', m.id, 'mentor_name', m.full_name, 'values', v_values,
      'score', kiru_private.perf_assemble(v_values, p_rules, '{"leve":0,"grave":0,"muy_grave":0}'::jsonb,
                 coalesce((v_values #>> '{B1,total}')::int, 0))));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.follows_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.follows_student(uuid) TO authenticated;
REVOKE ALL ON FUNCTION kiru_private.add_working_days(timestamptz, integer),
  kiru_private.perf_indicator_values_2a(uuid, timestamptz, timestamptz, jsonb),
  kiru_private.perf_compute(timestamptz, timestamptz, jsonb) FROM PUBLIC;

-- 7. Catálogo: cómo se mide ahora A3, A4 y E3 ------------------------------------------------
UPDATE public.kiru_perf_indicators SET
  description = 'Cálculalo es obligatorio para todos los alumnos (al menos 4 días por semana). 50 %: semanas en las que el alumno trabajó 4 días o más; 50 %: meses en los que el mentor preparó actividades. La calidad (1-5) se apunta, pero aún no cuenta.',
  source = 'Ficha mensual de Cálculalo que rellena Coordinación mirando las fechas de las actividades.',
  missing_data = 'Sin ficha del mes, queda pendiente (nunca cuenta como cero).'
WHERE code = 'A3';
UPDATE public.kiru_perf_indicators SET
  description = 'Inglés, lengua o tarjetas del campus solo cuando Coordinación los marca como obligatorios para el alumno. Cuenta las quincenas en las que el mentor asignó o revisó trabajo de esa herramienta, sin mirar el volumen.',
  source = 'Herramientas marcadas en la ficha del alumno y tareas del campus (inglés, lengua y tarjetas).',
  missing_data = 'Si el alumno no tiene ninguna herramienta obligatoria, no aplica.'
WHERE code = 'A4';
UPDATE public.kiru_perf_indicators SET
  description = 'Registros de sesión sin error marcado por Coordinación, o con el error contestado o corregido en 2 días laborables. Contestar tarde o no contestar cuenta como incumplido. Los avisos que manda el propio mentor no restan.',
  source = 'Botón «Error en el registro» de Coordinación y respuesta del mentor.',
  missing_data = 'Con menos de 4 registros en el trimestre, queda pendiente. Una marca retirada no cuenta.'
WHERE code = 'E3';
