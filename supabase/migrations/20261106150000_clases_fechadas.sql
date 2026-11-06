-- Prioridad 1 · Clases con fecha, cambios, cancelaciones y recuperaciones
-- (diseño aprobado por Sofía el 06/11/2026).
--
-- Cada clase guarda cuatro datos independientes:
--   realización  (delivery):     programada · impartida · no_impartida · anulada
--   consumo      (consumption):  pendiente · consumida · conservada · no_aplica
--   remuneración (delivered_by): quien firma el registro del formulario. El
--                                campus NO calcula importes: la pestaña «Pagos»
--                                del Sheet sigue liquidando.
--   recuperación (recovery):     ninguna · pendiente · propuesta · sin_encaje ·
--                                programada · realizada · rechazada
--
-- Reglas clave:
--   * Solo un registro del formulario marca una clase como impartida. Un
--     registro ↔ una clase (session_log_id es único).
--   * El consumo de la familia se cuenta sobre las clases originales. Una
--     recuperación (kind = 'recuperacion') nunca consume: consume su original.
--   * Los festivos NO quitan clases. Solo los días sin clase de Kiru.
--   * «anulada» = la clase ya no estaba prevista (alumno en pausa, día sin
--     clase de Kiru o cambio de horario). No consume, no se paga y no se
--     muestra a la familia como cancelada.
--   * Nada se borra: los cambios quedan en kiru_class_events.
--
-- Todo se escribe desde el servidor (service_role) mediante las funciones
-- public.kiru_clases_*; authenticated solo lee lo que permiten las políticas.
-- Las tareas diarias usan pg_cron si la extensión está disponible.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 0. Ajustes ------------------------------------------------------------------
CREATE TABLE public.kiru_settings (
  key text PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 80),
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.kiru_settings IS
  'Parámetros de funcionamiento ajustables sin tocar código (p. ej. semanas de clases generadas por delante).';
ALTER TABLE public.kiru_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_settings TO authenticated;
GRANT ALL ON public.kiru_settings TO service_role;
CREATE POLICY kiru_settings_read ON public.kiru_settings FOR SELECT TO authenticated USING (true);

INSERT INTO public.kiru_settings (key, value) VALUES
  ('clases_semanas_por_delante', '4'::jsonb),
  ('clases_horas_aviso', '48'::jsonb),
  ('recuperaciones_dias_sin_avanzar', '3'::jsonb),
  ('recuperaciones_dias_aviso_fin_periodo', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION kiru_private.setting_int(p_key text, p_default int)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT (value #>> '{}')::int FROM public.kiru_settings WHERE key = p_key), p_default)
$$;
REVOKE ALL ON FUNCTION kiru_private.setting_int(text, int) FROM PUBLIC;

-- 1. Estado del servicio del alumno (fuente: pestaña «Familias») ---------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS service_status text NOT NULL DEFAULT 'activo'
    CHECK (service_status IN ('activo', 'en_pausa', 'baja')),
  ADD COLUMN IF NOT EXISTS municipality text NOT NULL DEFAULT ''
    CHECK (length(municipality) <= 120),
  ADD COLUMN IF NOT EXISTS service_status_source text NOT NULL DEFAULT 'inicial'
    CHECK (service_status_source IN ('inicial', 'familias')),
  ADD COLUMN IF NOT EXISTS service_status_synced_at timestamptz;

COMMENT ON COLUMN public.students.service_status IS
  'activo / en_pausa / baja. Fuente única: pestaña «Familias» de Contabilidad (llega por /api/familias/estado).';
COMMENT ON COLUMN public.students.municipality IS
  'Municipio del alumno. Fuente única: pestaña «Familias» de Contabilidad.';

-- Nadie lo cambia a mano desde el campus: solo la sincronización (servidor).
CREATE OR REPLACE FUNCTION kiru_private.students_service_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND (NEW.service_status IS DISTINCT FROM OLD.service_status
          OR NEW.municipality IS DISTINCT FROM OLD.municipality
          OR NEW.service_status_source IS DISTINCT FROM OLD.service_status_source
          OR NEW.service_status_synced_at IS DISTINCT FROM OLD.service_status_synced_at) THEN
    RAISE EXCEPTION 'El estado y el municipio del alumno se cambian en la pestaña «Familias».'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.students_service_status_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS students_service_status_guard ON public.students;
CREATE TRIGGER students_service_status_guard
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION kiru_private.students_service_status_guard();

-- 2. Días sin clase de Método Kiru --------------------------------------------
CREATE TABLE public.kiru_no_class_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 200),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kiru_no_class_days_active_uidx ON public.kiru_no_class_days (day) WHERE is_active;
CREATE INDEX kiru_no_class_days_created_by_idx ON public.kiru_no_class_days (created_by);
CREATE INDEX kiru_no_class_days_cancelled_by_idx ON public.kiru_no_class_days (cancelled_by);
COMMENT ON TABLE public.kiru_no_class_days IS
  'Días sin clase fijados por Método Kiru (los festivos NO quitan clases). Se anulan, nunca se borran.';
CREATE TRIGGER kiru_no_class_days_touch
BEFORE UPDATE ON public.kiru_no_class_days
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();
ALTER TABLE public.kiru_no_class_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_no_class_days FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_no_class_days TO authenticated;
GRANT ALL ON public.kiru_no_class_days TO service_role;
CREATE POLICY kiru_no_class_days_read ON public.kiru_no_class_days
FOR SELECT TO authenticated USING ((SELECT kiru_private.active_uid()) IS NOT NULL);

-- 3. Clases con fecha ---------------------------------------------------------
CREATE TABLE public.kiru_class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES public.kiru_student_schedule_slots(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'recuperacion')),
  recovers_session_id uuid REFERENCES public.kiru_class_sessions(id) ON DELETE RESTRICT,
  -- Fecha para la que se generó (periodo de consumo). No cambia al reprogramar.
  original_start timestamptz NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  delivery text NOT NULL DEFAULT 'programada'
    CHECK (delivery IN ('programada', 'impartida', 'no_impartida', 'anulada')),
  consumption text NOT NULL DEFAULT 'pendiente'
    CHECK (consumption IN ('pendiente', 'consumida', 'conservada', 'no_aplica')),
  recovery text NOT NULL DEFAULT 'ninguna'
    CHECK (recovery IN ('ninguna', 'pendiente', 'propuesta', 'sin_encaje', 'programada', 'realizada', 'rechazada')),
  cancel_cause text CHECK (cancel_cause IN (
    'familia_menos_48h', 'familia_con_aviso', 'no_presentado', 'mentor', 'excepcion',
    'dia_sin_clase_kiru', 'pausa_servicio', 'cambio_horario', 'historico_sin_clasificar')),
  cancel_note text NOT NULL DEFAULT '' CHECK (length(cancel_note) <= 2000),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Excepción de plazo aprobada por coordinación para una recuperación.
  recovery_exception_note text NOT NULL DEFAULT '' CHECK (length(recovery_exception_note) <= 1000),
  recovery_exception_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recovery_exception_at timestamptz,
  recovery_status_since timestamptz NOT NULL DEFAULT now(),
  session_log_id uuid UNIQUE REFERENCES public.kiru_session_logs(id) ON DELETE SET NULL,
  delivered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'horario' CHECK (source IN ('horario', 'recuperacion', 'historico', 'coordinacion')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiru_class_sessions_range CHECK (scheduled_end > scheduled_start),
  CONSTRAINT kiru_class_sessions_recovery_link CHECK ((kind = 'recuperacion') = (recovers_session_id IS NOT NULL)),
  CONSTRAINT kiru_class_sessions_recovery_consumption CHECK (kind = 'regular' OR consumption = 'no_aplica'),
  CONSTRAINT kiru_class_sessions_recovery_state CHECK (kind = 'regular' OR recovery = 'ninguna'),
  CONSTRAINT kiru_class_sessions_delivered_by CHECK (delivery = 'impartida' OR delivered_by IS NULL),
  -- Sin solapamientos: ni el mentor ni el alumno pueden tener dos clases vivas a la vez.
  CONSTRAINT kiru_class_sessions_mentor_overlap EXCLUDE USING gist (
    mentor_id WITH =, tstzrange(scheduled_start, scheduled_end) WITH &&
  ) WHERE (delivery IN ('programada', 'impartida')),
  CONSTRAINT kiru_class_sessions_student_overlap EXCLUDE USING gist (
    student_id WITH =, tstzrange(scheduled_start, scheduled_end) WITH &&
  ) WHERE (delivery IN ('programada', 'impartida'))
);
-- Generar dos veces no duplica: una clase por franja y fecha.
CREATE UNIQUE INDEX kiru_class_sessions_slot_uidx ON public.kiru_class_sessions (slot_id, original_start)
  WHERE slot_id IS NOT NULL AND kind = 'regular';
-- Una original solo puede tener una recuperación viva.
CREATE UNIQUE INDEX kiru_class_sessions_one_recovery_uidx ON public.kiru_class_sessions (recovers_session_id)
  WHERE kind = 'recuperacion' AND delivery IN ('programada', 'impartida');
CREATE INDEX kiru_class_sessions_student_idx ON public.kiru_class_sessions (student_id, scheduled_start);
CREATE INDEX kiru_class_sessions_mentor_idx ON public.kiru_class_sessions (mentor_id, scheduled_start);
CREATE INDEX kiru_class_sessions_delivered_by_idx ON public.kiru_class_sessions (delivered_by);
CREATE INDEX kiru_class_sessions_recovers_idx ON public.kiru_class_sessions (recovers_session_id);
CREATE INDEX kiru_class_sessions_slot_idx ON public.kiru_class_sessions (slot_id);
CREATE INDEX kiru_class_sessions_cancelled_by_idx ON public.kiru_class_sessions (cancelled_by);
CREATE INDEX kiru_class_sessions_exception_by_idx ON public.kiru_class_sessions (recovery_exception_by);
CREATE INDEX kiru_class_sessions_recovery_open_idx ON public.kiru_class_sessions (recovery)
  WHERE recovery IN ('pendiente', 'propuesta', 'sin_encaje', 'programada');

COMMENT ON TABLE public.kiru_class_sessions IS
  'Una fila por clase con fecha. Fuente principal de clases, cancelaciones y recuperaciones. Las recuperaciones apuntan a su clase original.';

CREATE TRIGGER kiru_class_sessions_touch
BEFORE UPDATE ON public.kiru_class_sessions
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

CREATE OR REPLACE FUNCTION kiru_private.class_recovery_since()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.recovery IS DISTINCT FROM OLD.recovery THEN
    NEW.recovery_status_since := now();
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.class_recovery_since() FROM PUBLIC;
CREATE TRIGGER kiru_class_sessions_recovery_since
BEFORE UPDATE ON public.kiru_class_sessions
FOR EACH ROW EXECUTE FUNCTION kiru_private.class_recovery_since();

-- 4. Solicitudes (cambios, cancelaciones, propuestas de recuperación y avisos)
CREATE TABLE public.kiru_class_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.kiru_class_sessions(id) ON DELETE CASCADE,
  session_log_id uuid REFERENCES public.kiru_session_logs(id) ON DELETE SET NULL,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cambio', 'cancelacion', 'propuesta_recuperacion', 'aviso_registro')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requester_role text NOT NULL CHECK (requester_role IN ('mentor', 'padre', 'coordinador', 'admin')),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 2000),
  reason_code text CHECK (reason_code IN ('cambio_acordado', 'recuperacion', 'sustitucion', 'error_registro', 'otro')),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  preferences text NOT NULL DEFAULT '' CHECK (length(preferences) <= 1000),
  -- [{ "start": timestamptz, "end": timestamptz }]
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) <= 10),
  hours_notice numeric(8, 1),
  late boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN (
    'pendiente', 'mas_info', 'contrapropuesta', 'aprobada', 'rechazada', 'retirada',
    'elegida', 'sin_encaje', 'gestionado', 'sustituida')),
  chosen_option jsonb,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 2000),
  reply text NOT NULL DEFAULT '' CHECK (length(reply) <= 2000),
  -- Incidencia del mentor: nunca es una sanción automática.
  incident text NOT NULL DEFAULT 'ninguna'
    CHECK (incident IN ('ninguna', 'potencial', 'abierta', 'justificada', 'no_justificada', 'mas_info')),
  incident_note text NOT NULL DEFAULT '' CHECK (length(incident_note) <= 2000),
  incident_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  incident_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiru_class_requests_target CHECK (session_id IS NOT NULL OR (kind = 'aviso_registro' AND session_log_id IS NOT NULL))
);
-- Solo una solicitud abierta por clase y tipo.
CREATE UNIQUE INDEX kiru_class_requests_open_uidx ON public.kiru_class_requests (session_id, kind)
  WHERE session_id IS NOT NULL AND status IN ('pendiente', 'mas_info', 'contrapropuesta');
CREATE UNIQUE INDEX kiru_class_requests_open_log_uidx ON public.kiru_class_requests (session_log_id)
  WHERE kind = 'aviso_registro' AND status IN ('pendiente', 'mas_info');
CREATE INDEX kiru_class_requests_session_idx ON public.kiru_class_requests (session_id);
CREATE INDEX kiru_class_requests_log_idx ON public.kiru_class_requests (session_log_id);
CREATE INDEX kiru_class_requests_mentor_idx ON public.kiru_class_requests (mentor_id, created_at DESC);
CREATE INDEX kiru_class_requests_student_idx ON public.kiru_class_requests (student_id);
CREATE INDEX kiru_class_requests_requested_by_idx ON public.kiru_class_requests (requested_by);
CREATE INDEX kiru_class_requests_decided_by_idx ON public.kiru_class_requests (decided_by);
CREATE INDEX kiru_class_requests_incident_by_idx ON public.kiru_class_requests (incident_reviewed_by);
COMMENT ON TABLE public.kiru_class_requests IS
  'Solicitudes de cambio y cancelación, propuestas de recuperación y avisos de registro, con la decisión de coordinación y la incidencia potencial del mentor.';
CREATE TRIGGER kiru_class_requests_touch
BEFORE UPDATE ON public.kiru_class_requests
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

-- 5. Historial (solo se añade) --------------------------------------------------
CREATE TABLE public.kiru_class_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid REFERENCES public.kiru_class_sessions(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.kiru_class_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 60),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kiru_class_events_session_idx ON public.kiru_class_events (session_id, created_at);
CREATE INDEX kiru_class_events_request_idx ON public.kiru_class_events (request_id);
CREATE INDEX kiru_class_events_actor_idx ON public.kiru_class_events (actor_id);
COMMENT ON TABLE public.kiru_class_events IS 'Historial de clases y solicitudes: quién hizo qué y cuándo. No se edita ni se borra.';

CREATE OR REPLACE FUNCTION kiru_private.class_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'El historial de clases no se puede modificar.' USING ERRCODE = '42501';
END
$$;
REVOKE ALL ON FUNCTION kiru_private.class_events_append_only() FROM PUBLIC;
CREATE TRIGGER kiru_class_events_append_only
BEFORE UPDATE OR DELETE ON public.kiru_class_events
FOR EACH ROW EXECUTE FUNCTION kiru_private.class_events_append_only();

-- 6. Cola de copia a Google Sheets («Sin clase» y «Recuperaciones») -------------
CREATE TABLE public.kiru_sheet_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target text NOT NULL CHECK (target IN ('sin_clase', 'recuperaciones')),
  -- Identificador estable de la fila en la hoja (id de clase o de día sin clase).
  row_key text NOT NULL CHECK (length(row_key) BETWEEN 1 AND 80),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'enviado', 'error')),
  attempts int NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '' CHECK (length(last_error) <= 1000),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Solo una versión pendiente por fila: la última gana.
CREATE UNIQUE INDEX kiru_sheet_outbox_pending_uidx ON public.kiru_sheet_outbox (target, row_key)
  WHERE status IN ('pendiente', 'error');
CREATE INDEX kiru_sheet_outbox_status_idx ON public.kiru_sheet_outbox (status, created_at);
COMMENT ON TABLE public.kiru_sheet_outbox IS
  'Cambios pendientes de copiar a las pestañas «Sin clase» y «Recuperaciones». Se marcan enviados solo cuando la hoja confirma.';
CREATE TRIGGER kiru_sheet_outbox_touch
BEFORE UPDATE ON public.kiru_sheet_outbox
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();
ALTER TABLE public.kiru_sheet_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_sheet_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_sheet_outbox TO authenticated;
GRANT ALL ON public.kiru_sheet_outbox TO service_role;
CREATE POLICY kiru_sheet_outbox_admin_read ON public.kiru_sheet_outbox
FOR SELECT TO authenticated USING ((SELECT kiru_private.is_admin()));

-- 7. Avisos: nuevos tipos y enlaces --------------------------------------------
ALTER TABLE public.kiru_notifications
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.kiru_class_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.kiru_class_requests(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS kiru_notifications_session_idx ON public.kiru_notifications (session_id);
CREATE INDEX IF NOT EXISTS kiru_notifications_request_idx ON public.kiru_notifications (request_id);
ALTER TABLE public.kiru_notifications DROP CONSTRAINT IF EXISTS kiru_notifications_kind_check;
ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check
  CHECK (kind IN ('objetivo_pendiente', 'objetivo_aprobado', 'objetivo_rechazado', 'canje_solicitado',
                  'canje_completado', 'canje_aplazado', 'renovacion', 'informe_progreso',
                  'clase_solicitud', 'clase_decision', 'clase_mas_info', 'recuperacion_propuesta',
                  'recuperacion_confirmada', 'recuperacion_sin_encaje', 'recuperacion_nueva',
                  'recuperacion_sin_avanzar', 'recuperacion_recordatorio', 'recuperacion_fin_periodo',
                  'registro_aviso', 'clase_incidencia'));

-- 8. Permisos de lectura -------------------------------------------------------
ALTER TABLE public.kiru_class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_class_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_class_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_class_sessions, public.kiru_class_requests, public.kiru_class_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_class_sessions, public.kiru_class_requests, public.kiru_class_events TO authenticated;
GRANT ALL ON public.kiru_class_sessions, public.kiru_class_requests, public.kiru_class_events TO service_role;

-- Mentor (asignado o sustituto), coordinador de ese mentor y administración.
-- Las familias leen por las vistas kiru_family_* de abajo (sin notas internas).
CREATE POLICY kiru_class_sessions_read ON public.kiru_class_sessions
FOR SELECT TO authenticated
USING (
  mentor_id = (SELECT kiru_private.active_uid())
  OR delivered_by = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR kiru_private.coordinates_mentor(mentor_id)
);

CREATE POLICY kiru_class_requests_read ON public.kiru_class_requests
FOR SELECT TO authenticated
USING (
  mentor_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR kiru_private.coordinates_mentor(mentor_id)
);

CREATE POLICY kiru_class_events_read ON public.kiru_class_events
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR EXISTS (
    SELECT 1 FROM public.kiru_class_sessions s
    WHERE s.id = kiru_class_events.session_id
      AND (s.mentor_id = (SELECT kiru_private.active_uid()) OR kiru_private.coordinates_mentor(s.mentor_id))
  )
);

-- Vistas para familias: solo sus hijos y sin incidencias ni notas internas.
CREATE OR REPLACE VIEW public.kiru_family_classes
WITH (security_invoker = false)
AS
SELECT
  s.id, s.student_id, s.kind, s.recovers_session_id, s.original_start,
  s.scheduled_start, s.scheduled_end, s.delivery, s.consumption, s.recovery,
  s.cancel_cause, s.recovery_status_since,
  coalesce(pm.full_name, '') AS mentor_name,
  coalesce(pd.full_name, '') AS delivered_by_name,
  (s.scheduled_start IS DISTINCT FROM s.original_start AND s.kind = 'regular') AS rescheduled
FROM public.kiru_class_sessions s
LEFT JOIN public.profiles pm ON pm.id = s.mentor_id
LEFT JOIN public.profiles pd ON pd.id = s.delivered_by
WHERE s.delivery <> 'anulada'
  AND kiru_private.is_guardian_of(s.student_id);
COMMENT ON VIEW public.kiru_family_classes IS
  'Clases de los hijos del padre que consulta (sin anuladas, sin notas internas).';
REVOKE ALL ON public.kiru_family_classes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_family_classes TO authenticated;

CREATE OR REPLACE VIEW public.kiru_family_class_requests
WITH (security_invoker = false)
AS
SELECT
  r.id, r.session_id, r.student_id, r.kind, r.requester_role,
  (r.requested_by = kiru_private.active_uid()) AS requested_by_me,
  -- El motivo se muestra si lo escribió la familia o es la nota de una propuesta
  -- de recuperación (escrita para la familia). El motivo de un cambio del mentor es interno.
  CASE WHEN r.requester_role = 'padre' OR r.kind = 'propuesta_recuperacion' THEN r.reason ELSE '' END AS reason,
  r.preferences, r.options, r.hours_notice, r.late, r.status,
  r.chosen_option, r.decision_note, r.reply, r.decided_at, r.created_at
FROM public.kiru_class_requests r
WHERE r.kind IN ('cambio', 'cancelacion', 'propuesta_recuperacion')
  AND r.student_id IS NOT NULL
  AND kiru_private.is_guardian_of(r.student_id)
  -- Un cambio que pide el mentor solo lo ve la familia cuando coordinación lo resuelve.
  AND (r.requester_role IN ('padre', 'coordinador', 'admin') OR r.kind = 'propuesta_recuperacion'
       OR r.status IN ('aprobada', 'rechazada', 'contrapropuesta'));
COMMENT ON VIEW public.kiru_family_class_requests IS
  'Solicitudes y propuestas de recuperación de los hijos del padre que consulta; sin incidencias del mentor.';
REVOKE ALL ON public.kiru_family_class_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_family_class_requests TO authenticated;

-- 9. Funciones internas --------------------------------------------------------
CREATE OR REPLACE FUNCTION kiru_private.madrid_ts(p_day date, p_time time)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT (p_day + p_time) AT TIME ZONE 'Europe/Madrid' $$;
REVOKE ALL ON FUNCTION kiru_private.madrid_ts(date, time) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.class_event(p_session uuid, p_request uuid, p_actor uuid, p_action text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.kiru_class_events (session_id, request_id, actor_id, action, detail)
  VALUES (p_session, p_request, p_actor, p_action, coalesce(p_detail, '{}'::jsonb))
$$;
REVOKE ALL ON FUNCTION kiru_private.class_event(uuid, uuid, uuid, text, jsonb) FROM PUBLIC;

-- Aviso en la campanita (y por correo: lo manda el Apps Script de avisos).
CREATE OR REPLACE FUNCTION kiru_private.class_notify(
  p_recipient uuid, p_student uuid, p_session uuid, p_request uuid,
  p_kind text, p_title text, p_body text, p_event_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.kiru_notifications (recipient_id, student_id, session_id, request_id, kind, title, body, event_key, email_status)
  SELECT p_recipient, p_student, p_session, p_request, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 1000),
         left(p_event_key, 200), 'pendiente'
  WHERE p_recipient IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_recipient AND p.is_active)
  ON CONFLICT (recipient_id, event_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION kiru_private.class_notify(uuid, uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;

-- Coordinador del mentor; si no tiene, administración.
CREATE OR REPLACE FUNCTION kiru_private.class_supervisors(p_mentor uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT cm.coordinator_id FROM public.kiru_coordinator_mentors cm
  JOIN public.profiles p ON p.id = cm.coordinator_id AND p.is_active
  WHERE cm.mentor_id = p_mentor
  UNION ALL
  SELECT p.id FROM public.profiles p
  WHERE p.role = 'admin' AND p.is_active
    AND NOT EXISTS (
      SELECT 1 FROM public.kiru_coordinator_mentors cm
      JOIN public.profiles c ON c.id = cm.coordinator_id AND c.is_active
      WHERE cm.mentor_id = p_mentor)
$$;
REVOKE ALL ON FUNCTION kiru_private.class_supervisors(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.class_guardians(p_student uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT sg.guardian_id FROM public.student_guardians sg
  JOIN public.profiles p ON p.id = sg.guardian_id AND p.is_active
  WHERE sg.student_id = p_student
$$;
REVOKE ALL ON FUNCTION kiru_private.class_guardians(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.class_label(p_start timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (ARRAY['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow FROM p_start AT TIME ZONE 'Europe/Madrid')::int]
         || ' ' || to_char(p_start AT TIME ZONE 'Europe/Madrid', 'DD/MM') || ' a las '
         || to_char(p_start AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
$$;
REVOKE ALL ON FUNCTION kiru_private.class_label(timestamptz) FROM PUBLIC;

-- ¿Está libre el hueco para mentor y alumno? (las restricciones de la tabla
-- vuelven a comprobarlo al guardar, para que no haya reservas dobles).
CREATE OR REPLACE FUNCTION kiru_private.class_slot_free(
  p_mentor uuid, p_student uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_end > p_start
     AND p_start > now()
     AND NOT EXISTS (
       SELECT 1 FROM public.kiru_class_sessions s
       WHERE s.delivery IN ('programada', 'impartida')
         AND (p_exclude IS NULL OR s.id <> p_exclude)
         AND (s.mentor_id = p_mentor OR s.student_id = p_student)
         AND tstzrange(s.scheduled_start, s.scheduled_end) && tstzrange(p_start, p_end))
     AND NOT EXISTS (
       SELECT 1 FROM public.kiru_no_class_days d
       WHERE d.is_active AND d.day = (p_start AT TIME ZONE 'Europe/Madrid')::date)
     AND NOT EXISTS (
       -- Reuniones de coordinación ya convocadas del grupo del mentor.
       SELECT 1 FROM public.kiru_coordination_meetings m
       JOIN public.kiru_coordinator_mentors cm ON cm.coordinator_id = m.coordinator_id
       WHERE cm.mentor_id = p_mentor
         AND m.status = 'confirmada'
         AND tstzrange(m.scheduled_at, m.scheduled_at + make_interval(mins => m.duration_minutes)) && tstzrange(p_start, p_end))
$$;
REVOKE ALL ON FUNCTION kiru_private.class_slot_free(uuid, uuid, timestamptz, timestamptz, uuid) FROM PUBLIC;

-- Valida la lista de opciones [{start,end}] y devuelve las normalizadas.
CREATE OR REPLACE FUNCTION kiru_private.class_clean_options(
  p_options jsonb, p_mentor uuid, p_student uuid, p_exclude uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' THEN RETURN v_out; END IF;
  IF jsonb_array_length(p_options) > 10 THEN
    RAISE EXCEPTION 'Como mucho 10 opciones.' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_options) LOOP
    BEGIN
      v_start := (v_item ->> 'start')::timestamptz;
      v_end := (v_item ->> 'end')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Hay una fecha propuesta que no es válida.' USING ERRCODE = 'check_violation';
    END;
    IF v_start IS NULL OR v_end IS NULL OR v_end <= v_start OR v_end - v_start > interval '3 hours' THEN
      RAISE EXCEPTION 'Hay una fecha propuesta que no es válida.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT kiru_private.class_slot_free(p_mentor, p_student, v_start, v_end, p_exclude) THEN
      RAISE EXCEPTION 'La opción del % ya no está libre.', kiru_private.class_label(v_start) USING ERRCODE = 'check_violation';
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('start', v_start, 'end', v_end));
  END LOOP;
  RETURN v_out;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.class_clean_options(jsonb, uuid, uuid, uuid) FROM PUBLIC;

-- Copia a la hoja (cola). Etiquetas legibles para «Quién cancela».
CREATE OR REPLACE FUNCTION kiru_private.cause_label(p_cause text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_cause
    WHEN 'familia_menos_48h' THEN 'Familia, menos de 48 h'
    WHEN 'familia_con_aviso' THEN 'Familia, con aviso'
    WHEN 'no_presentado' THEN 'No presentado'
    WHEN 'mentor' THEN 'Mentor'
    WHEN 'dia_sin_clase_kiru' THEN 'Día sin clase Kiru'
    WHEN 'excepcion' THEN 'Excepción'
    ELSE '' END
$$;
REVOKE ALL ON FUNCTION kiru_private.cause_label(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.sheet_queue(p_target text, p_key text, p_payload jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.kiru_sheet_outbox (target, row_key, payload)
  VALUES (p_target, p_key, p_payload)
  ON CONFLICT (target, row_key) WHERE status IN ('pendiente', 'error')
  DO UPDATE SET payload = excluded.payload, status = 'pendiente', updated_at = now()
$$;
REVOKE ALL ON FUNCTION kiru_private.sheet_queue(text, text, jsonb) FROM PUBLIC;

-- Fila de la hoja para una clase cancelada o recuperada.
CREATE OR REPLACE FUNCTION kiru_private.sheet_sync_session(p_session uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.kiru_class_sessions;
  o public.kiru_class_sessions;
  v_mentor text;
  v_student text;
BEGIN
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = p_session;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT full_name INTO v_mentor FROM public.profiles WHERE id = s.mentor_id;
  SELECT full_name INTO v_student FROM public.profiles WHERE id = s.student_id;

  IF s.kind = 'regular' AND (s.delivery = 'no_impartida' OR s.cancel_cause IS NOT NULL)
     AND coalesce(s.cancel_cause, '') NOT IN ('pausa_servicio', 'cambio_horario', 'dia_sin_clase_kiru') THEN
    PERFORM kiru_private.sheet_queue('sin_clase', s.id::text, jsonb_build_object(
      'fecha', to_char(s.original_start AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY'),
      'mentor', coalesce(v_mentor, ''),
      'alumno', coalesce(v_student, ''),
      'motivo', s.cancel_note,
      'quien_cancela', kiru_private.cause_label(s.cancel_cause),
      'id_clase', s.id::text,
      'anulada', s.delivery <> 'no_impartida'));
  ELSIF s.kind = 'recuperacion' THEN
    SELECT * INTO o FROM public.kiru_class_sessions WHERE id = s.recovers_session_id;
    PERFORM kiru_private.sheet_queue('recuperaciones', s.id::text, jsonb_build_object(
      'fecha_original', to_char(o.original_start AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY'),
      'mentor', coalesce(v_mentor, ''),
      'alumno', coalesce(v_student, ''),
      'fecha_recuperacion', to_char(s.scheduled_start AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY'),
      'hora_inicio', to_char(s.scheduled_start AT TIME ZONE 'Europe/Madrid', 'HH24:MI'),
      'hora_fin', to_char(s.scheduled_end AT TIME ZONE 'Europe/Madrid', 'HH24:MI'),
      'nota', CASE WHEN s.delivery = 'no_impartida' THEN 'Recuperación anulada' ELSE '' END,
      'quien_cancela', kiru_private.cause_label(o.cancel_cause),
      'id_clase', s.id::text,
      'anulada', s.delivery = 'no_impartida'));
  END IF;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.sheet_sync_session(uuid) FROM PUBLIC;

-- 10. Generación de clases ------------------------------------------------------
-- Crea las clases de los próximos N días (ajuste «clases_semanas_por_delante»)
-- para alumnos activos, saltando solo los días sin clase de Kiru. Repetirla no
-- duplica. También anula las clases futuras que ya no deben existir.
CREATE OR REPLACE FUNCTION public.kiru_clases_generar(p_from date DEFAULT NULL, p_until date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_from date := coalesce(p_from, v_today);
  v_until date := coalesce(p_until, v_today + 7 * greatest(1, least(kiru_private.setting_int('clases_semanas_por_delante', 4), 26)));
  v_created int := 0;
  v_cancelled int := 0;
  v_restored int := 0;
  r record;
BEGIN
  -- a) Clases futuras sin tocar que ya no deben existir: se anulan (no se borran).
  WITH stale AS (
    SELECT s.id,
      CASE
        WHEN st.service_status <> 'activo' THEN 'pausa_servicio'
        WHEN d.id IS NOT NULL THEN 'dia_sin_clase_kiru'
        ELSE 'cambio_horario'
      END AS cause
    FROM public.kiru_class_sessions s
    LEFT JOIN public.students st ON st.profile_id = s.student_id
    LEFT JOIN public.kiru_student_schedule_slots sl ON sl.id = s.slot_id
    LEFT JOIN public.kiru_no_class_days d ON d.is_active AND d.day = (s.original_start AT TIME ZONE 'Europe/Madrid')::date
    WHERE s.kind = 'regular' AND s.source = 'horario'
      AND s.delivery = 'programada'
      AND s.scheduled_start > now()
      AND s.scheduled_start = s.original_start
      AND NOT EXISTS (SELECT 1 FROM public.kiru_class_requests q WHERE q.session_id = s.id)
      AND (coalesce(st.service_status, 'activo') <> 'activo'
           OR d.id IS NOT NULL
           OR sl.id IS NULL OR NOT sl.is_active OR sl.mentor_id <> s.mentor_id
           OR NOT EXISTS (SELECT 1 FROM public.student_mentors sm WHERE sm.student_id = s.student_id AND sm.mentor_id = s.mentor_id))
  )
  UPDATE public.kiru_class_sessions s
  SET delivery = 'anulada', consumption = 'no_aplica', cancel_cause = stale.cause,
      cancelled_at = now(), cancelled_by = NULL
  FROM stale WHERE s.id = stale.id;
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- b) Las anuladas por día sin clase o pausa que vuelven a ser válidas se restauran.
  UPDATE public.kiru_class_sessions s
  SET delivery = 'programada', consumption = 'pendiente', cancel_cause = NULL, cancelled_at = NULL
  FROM public.kiru_student_schedule_slots sl, public.students st
  WHERE s.delivery = 'anulada' AND s.cancel_cause IN ('dia_sin_clase_kiru', 'pausa_servicio')
    AND s.scheduled_start > now()
    AND sl.id = s.slot_id AND sl.is_active AND sl.mentor_id = s.mentor_id
    AND st.profile_id = s.student_id AND st.service_status = 'activo'
    AND NOT EXISTS (SELECT 1 FROM public.kiru_no_class_days d
                    WHERE d.is_active AND d.day = (s.original_start AT TIME ZONE 'Europe/Madrid')::date)
    AND kiru_private.class_slot_free(s.mentor_id, s.student_id, s.scheduled_start, s.scheduled_end, s.id);
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  -- c) Nuevas clases desde el horario semanal.
  FOR r IN
    SELECT sl.id AS slot_id, sl.student_id, sl.mentor_id,
           kiru_private.madrid_ts(day::date, sl.start_time) AS starts,
           kiru_private.madrid_ts(day::date, sl.end_time) AS ends
    FROM public.kiru_student_schedule_slots sl
    JOIN public.students st ON st.profile_id = sl.student_id AND st.service_status = 'activo'
    JOIN public.profiles ps ON ps.id = sl.student_id AND ps.is_active
    JOIN public.student_mentors sm ON sm.student_id = sl.student_id AND sm.mentor_id = sl.mentor_id
    CROSS JOIN LATERAL generate_series(v_from::timestamp, v_until::timestamp, interval '1 day') AS day
    WHERE sl.is_active
      AND extract(isodow FROM day)::int = sl.weekday
      AND NOT EXISTS (SELECT 1 FROM public.kiru_no_class_days d WHERE d.is_active AND d.day = day::date)
  LOOP
    INSERT INTO public.kiru_class_sessions (student_id, mentor_id, slot_id, original_start, scheduled_start, scheduled_end)
    VALUES (r.student_id, r.mentor_id, r.slot_id, r.starts, r.starts, r.ends)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('creadas', v_created, 'anuladas', v_cancelled, 'restauradas', v_restored,
                            'desde', v_from, 'hasta', v_until);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_clases_generar(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_clases_generar(date, date) TO service_role;

-- 11. Enlace registro del formulario → clase -----------------------------------
CREATE OR REPLACE FUNCTION kiru_private.class_mark_delivered(p_session uuid, p_log uuid, p_by uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.kiru_class_sessions;
BEGIN
  UPDATE public.kiru_class_sessions
  SET delivery = 'impartida', session_log_id = p_log, delivered_by = p_by,
      consumption = CASE WHEN kind = 'regular' THEN 'consumida' ELSE consumption END,
      recovery = CASE WHEN kind = 'regular' AND recovery IN ('pendiente', 'propuesta', 'sin_encaje') THEN 'ninguna' ELSE recovery END
  WHERE id = p_session
  RETURNING * INTO s;
  IF s.kind = 'recuperacion' THEN
    -- La recuperación hecha consume su clase original (una sola vez).
    UPDATE public.kiru_class_sessions
    SET recovery = 'realizada',
        consumption = 'consumida'
    WHERE id = s.recovers_session_id;
    PERFORM kiru_private.class_event(s.recovers_session_id, NULL, p_actor, 'recuperacion_realizada', jsonb_build_object('recuperacion', s.id));
    PERFORM kiru_private.sheet_sync_session(s.id);
  END IF;
  PERFORM kiru_private.class_event(s.id, NULL, p_actor, 'impartida', jsonb_build_object('registro', p_log, 'impartida_por', p_by));
END
$$;
REVOKE ALL ON FUNCTION kiru_private.class_mark_delivered(uuid, uuid, uuid, uuid) FROM PUBLIC;

-- Busca la clase del registro: mismo alumno y mismo día, aún sin registro
-- (primero la del mismo mentor; si hay varias, la más temprana).
-- Si ya hay una clase impartida ese día con otro registro, este queda como
-- duplicado (sin enlazar) y no cuenta dos veces.
CREATE OR REPLACE FUNCTION kiru_private.link_session_log(p_log uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  l public.kiru_session_logs;
  v_session uuid;
BEGIN
  SELECT * INTO l FROM public.kiru_session_logs WHERE id = p_log;
  IF NOT FOUND OR l.student_id IS NULL OR l.session_date IS NULL OR l.manual_status = 'archivado' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.kiru_class_sessions WHERE session_log_id = l.id) THEN RETURN NULL; END IF;

  SELECT s.id INTO v_session
  FROM public.kiru_class_sessions s
  WHERE s.student_id = l.student_id
    AND (s.scheduled_start AT TIME ZONE 'Europe/Madrid')::date = l.session_date
    AND s.delivery = 'programada'
    AND s.session_log_id IS NULL
  ORDER BY (s.mentor_id = l.mentor_id) DESC, s.scheduled_start
  LIMIT 1
  FOR UPDATE;

  IF v_session IS NULL THEN RETURN NULL; END IF;
  PERFORM kiru_private.class_mark_delivered(v_session, l.id, coalesce(l.mentor_id, (SELECT mentor_id FROM public.kiru_class_sessions WHERE id = v_session)), NULL);
  RETURN v_session;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.link_session_log(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.session_log_link_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM kiru_private.link_session_log(NEW.id);
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.session_log_link_trigger() FROM PUBLIC;
CREATE TRIGGER kiru_session_logs_link_class
AFTER INSERT OR UPDATE OF student_id, session_date, mentor_id, manual_status ON public.kiru_session_logs
FOR EACH ROW EXECUTE FUNCTION kiru_private.session_log_link_trigger();

-- Registros que no están enlazados a ninguna clase (duplicados o fuera de horario).
CREATE OR REPLACE VIEW public.kiru_unlinked_session_logs
WITH (security_invoker = true)
AS
SELECT l.id, l.session_date, l.student_id, l.mentor_id, l.mentor_name, l.student_name, l.submitted_at,
       EXISTS (
         SELECT 1 FROM public.kiru_class_sessions s
         WHERE s.student_id = l.student_id
           AND (s.scheduled_start AT TIME ZONE 'Europe/Madrid')::date = l.session_date
           AND s.delivery = 'impartida') AS probable_duplicate
FROM public.kiru_session_logs l
WHERE l.student_id IS NOT NULL AND l.session_date IS NOT NULL
  AND coalesce(l.manual_status, '') <> 'archivado'
  AND NOT EXISTS (SELECT 1 FROM public.kiru_class_sessions s WHERE s.session_log_id = l.id);
REVOKE ALL ON public.kiru_unlinked_session_logs FROM PUBLIC, anon;
GRANT SELECT ON public.kiru_unlinked_session_logs TO authenticated;

-- 12. Comprobación de quién actúa -----------------------------------------------
-- Devuelve el papel del actor respecto de la clase o lanza un error.
CREATE OR REPLACE FUNCTION kiru_private.class_actor_role(p_actor uuid, p_mentor uuid, p_student uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_actor AND is_active;
  IF v_role = 'admin' THEN RETURN 'admin'; END IF;
  IF v_role = 'mentor' AND p_actor = p_mentor THEN RETURN 'mentor'; END IF;
  IF v_role = 'coordinador' AND EXISTS (
    SELECT 1 FROM public.kiru_coordinator_mentors WHERE mentor_id = p_mentor AND coordinator_id = p_actor) THEN
    RETURN 'coordinador';
  END IF;
  IF v_role = 'padre' AND p_student IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_guardians WHERE student_id = p_student AND guardian_id = p_actor) THEN
    RETURN 'padre';
  END IF;
  RAISE EXCEPTION 'No tienes permiso sobre esta clase.' USING ERRCODE = '42501';
END
$$;
REVOKE ALL ON FUNCTION kiru_private.class_actor_role(uuid, uuid, uuid) FROM PUBLIC;

-- 13. Solicitar cambio o cancelación ----------------------------------------------
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
  IF p_kind = 'cambio' AND v_role = 'mentor' AND jsonb_array_length(v_options) = 0 THEN
    RAISE EXCEPTION 'Propón al menos una fecha alternativa.' USING ERRCODE = 'check_violation';
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
REVOKE ALL ON FUNCTION public.kiru_clases_solicitar(uuid, uuid, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_clases_solicitar(uuid, uuid, text, text, jsonb, text, text) TO service_role;

-- Aplica una cancelación aprobada según quién cancela y la antelación.
CREATE OR REPLACE FUNCTION kiru_private.class_apply_cancel(
  p_session uuid, p_cause text, p_note text, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.kiru_class_sessions
  SET delivery = 'no_impartida',
      cancel_cause = p_cause,
      cancel_note = left(coalesce(p_note, ''), 2000),
      cancelled_at = now(),
      cancelled_by = p_actor,
      consumption = CASE WHEN kind = 'recuperacion' THEN 'no_aplica'
                         WHEN p_cause IN ('familia_menos_48h', 'no_presentado') THEN 'consumida'
                         ELSE 'conservada' END,
      recovery = CASE WHEN kind = 'recuperacion' THEN 'ninguna'
                      WHEN p_cause IN ('familia_menos_48h', 'no_presentado') THEN 'ninguna'
                      ELSE 'pendiente' END
  WHERE id = p_session;
  PERFORM kiru_private.class_event(p_session, NULL, p_actor, 'cancelada', jsonb_build_object('causa', p_cause));
  PERFORM kiru_private.sheet_sync_session(p_session);
END
$$;
REVOKE ALL ON FUNCTION kiru_private.class_apply_cancel(uuid, text, text, uuid) FROM PUBLIC;

-- Notifica la nueva recuperación pendiente a su coordinador.
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
    coalesce(v_student, '') || ': propón fechas para recuperar la clase del ' || kiru_private.class_label(s.original_start) || '.',
    'recuperacion_nueva:' || s.id);
END
$$;
REVOKE ALL ON FUNCTION kiru_private.class_notify_new_recovery(uuid) FROM PUBLIC;

-- 14. Decisión de coordinación ---------------------------------------------------
-- p_decision: aprobar | rechazar | contrapropuesta | mas_info | aprobar_cancelacion | aprobar_excepcion
CREATE OR REPLACE FUNCTION public.kiru_clases_decidir(
  p_actor uuid, p_request uuid, p_decision text, p_note text DEFAULT '',
  p_option int DEFAULT NULL, p_options jsonb DEFAULT '[]'::jsonb)
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
  v_options jsonb;
  v_status text;
  v_cause text;
  v_g uuid;
  v_title text;
  v_body text;
BEGIN
  SELECT * INTO q FROM public.kiru_class_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa solicitud.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, q.mentor_id, q.student_id);
  IF v_role NOT IN ('coordinador', 'admin') THEN
    RAISE EXCEPTION 'Solo coordinación decide sobre las solicitudes.' USING ERRCODE = '42501';
  END IF;
  IF q.kind NOT IN ('cambio', 'cancelacion') OR q.status NOT IN ('pendiente', 'mas_info', 'contrapropuesta') THEN
    RAISE EXCEPTION 'Esta solicitud ya está resuelta.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = q.session_id FOR UPDATE;

  IF p_decision = 'aprobar' THEN
    IF q.kind <> 'cambio' THEN RAISE EXCEPTION 'Para una cancelación usa «Aprobar cancelación».' USING ERRCODE = 'check_violation'; END IF;
    v_opt := q.options -> coalesce(p_option, 0);
    IF v_opt IS NULL THEN RAISE EXCEPTION 'Elige una de las fechas propuestas.' USING ERRCODE = 'check_violation'; END IF;
    IF s.delivery <> 'programada' THEN RAISE EXCEPTION 'La clase ya no está programada.' USING ERRCODE = 'check_violation'; END IF;
    IF NOT kiru_private.class_slot_free(s.mentor_id, s.student_id, (v_opt->>'start')::timestamptz, (v_opt->>'end')::timestamptz, s.id) THEN
      RAISE EXCEPTION 'Ese hueco ya no está libre. Propón otra fecha.' USING ERRCODE = 'check_violation';
    END IF;
    -- Misma clase movida: no se crea otra y se guarda la fecha anterior en el historial.
    PERFORM kiru_private.class_event(s.id, q.id, p_actor, 'reprogramada',
      jsonb_build_object('antes', s.scheduled_start, 'despues', v_opt->>'start'));
    UPDATE public.kiru_class_sessions
    SET scheduled_start = (v_opt->>'start')::timestamptz, scheduled_end = (v_opt->>'end')::timestamptz
    WHERE id = s.id;
    v_status := 'aprobada';
    v_title := 'Cambio de clase aprobado';
    v_body := 'La clase del ' || kiru_private.class_label(s.scheduled_start) || ' pasa al ' || kiru_private.class_label((v_opt->>'start')::timestamptz) || '.';
    UPDATE public.kiru_class_requests SET chosen_option = v_opt WHERE id = q.id;
  ELSIF p_decision IN ('aprobar_cancelacion', 'aprobar_excepcion') THEN
    IF s.delivery <> 'programada' THEN RAISE EXCEPTION 'La clase ya no está programada.' USING ERRCODE = 'check_violation'; END IF;
    v_cause := CASE
      WHEN p_decision = 'aprobar_excepcion' THEN 'excepcion'
      WHEN q.requester_role = 'mentor' THEN 'mentor'
      WHEN q.late THEN 'familia_menos_48h'
      ELSE 'familia_con_aviso' END;
    PERFORM kiru_private.class_apply_cancel(s.id, v_cause, q.reason, p_actor);
    PERFORM kiru_private.class_notify_new_recovery(s.id);
    v_status := 'aprobada';
    v_title := 'Cancelación aprobada';
    v_body := 'Clase del ' || kiru_private.class_label(s.scheduled_start) || ': '
      || CASE WHEN v_cause = 'familia_menos_48h' THEN 'cancelada con menos de 48 h; la sesión se considera consumida.'
              ELSE 'cancelada; la familia conserva la sesión para recuperarla.' END;
  ELSIF p_decision = 'rechazar' THEN
    v_status := 'rechazada';
    v_title := 'Solicitud no aprobada';
    v_body := 'La clase del ' || kiru_private.class_label(s.scheduled_start) || ' se mantiene.';
  ELSIF p_decision = 'contrapropuesta' THEN
    v_options := kiru_private.class_clean_options(p_options, s.mentor_id, s.student_id, s.id);
    IF jsonb_array_length(v_options) = 0 THEN RAISE EXCEPTION 'Propón al menos una fecha.' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.kiru_class_requests SET options = v_options WHERE id = q.id;
    v_status := 'contrapropuesta';
    v_title := 'Coordinación propone otra fecha';
    v_body := 'Para la clase del ' || kiru_private.class_label(s.scheduled_start) || '. Entra en el campus para responder.';
  ELSIF p_decision = 'mas_info' THEN
    v_status := 'mas_info';
    v_title := 'Coordinación necesita más información';
    v_body := 'Sobre la clase del ' || kiru_private.class_label(s.scheduled_start) || '.';
  ELSE
    RAISE EXCEPTION 'Decisión no válida.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.kiru_class_requests
  SET status = v_status, decided_by = p_actor, decided_at = now(),
      decision_note = left(coalesce(p_note, ''), 2000)
  WHERE id = q.id;
  PERFORM kiru_private.class_event(s.id, q.id, p_actor, 'decision_' || p_decision, jsonb_build_object('nota', left(coalesce(p_note, ''), 300)));

  -- Avisos: a quien lo pidió y a la otra parte (mentor y familias).
  IF v_status = 'mas_info' THEN
    PERFORM kiru_private.class_notify(q.requested_by, s.student_id, s.id, q.id, 'clase_mas_info', v_title, v_body,
      'clase_mas_info:' || q.id || ':' || extract(epoch FROM now())::bigint);
  ELSE
    PERFORM kiru_private.class_notify(s.mentor_id, s.student_id, s.id, q.id, 'clase_decision', v_title, v_body,
      'clase_decision:' || q.id || ':' || v_status);
    FOR v_g IN SELECT kiru_private.class_guardians(s.student_id) LOOP
      PERFORM kiru_private.class_notify(v_g, s.student_id, s.id, q.id, 'clase_decision', v_title, v_body,
        'clase_decision:' || q.id || ':' || v_status);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('id', q.id, 'estado', v_status);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_clases_decidir(uuid, uuid, text, text, int, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_clases_decidir(uuid, uuid, text, text, int, jsonb) TO service_role;

-- Respuesta de quien pidió: aceptar una contrapropuesta, dar más información o retirar.
CREATE OR REPLACE FUNCTION public.kiru_clases_responder(
  p_actor uuid, p_request uuid, p_action text, p_reply text DEFAULT '', p_option int DEFAULT NULL)
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
  v_sup uuid;
BEGIN
  SELECT * INTO q FROM public.kiru_class_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa solicitud.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, q.mentor_id, q.student_id);
  IF v_role NOT IN ('mentor', 'padre') OR (v_role = 'mentor' AND q.requester_role <> 'mentor')
     OR (v_role = 'padre' AND q.requester_role <> 'padre') THEN
    RAISE EXCEPTION 'Solo puede responder quien hizo la solicitud.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = q.session_id FOR UPDATE;

  IF p_action = 'aceptar' AND q.status = 'contrapropuesta' THEN
    v_opt := q.options -> coalesce(p_option, 0);
    IF v_opt IS NULL THEN RAISE EXCEPTION 'Elige una de las fechas.' USING ERRCODE = 'check_violation'; END IF;
    IF NOT kiru_private.class_slot_free(s.mentor_id, s.student_id, (v_opt->>'start')::timestamptz, (v_opt->>'end')::timestamptz, s.id) THEN
      RAISE EXCEPTION 'Ese hueco ya no está libre.' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM kiru_private.class_event(s.id, q.id, p_actor, 'reprogramada',
      jsonb_build_object('antes', s.scheduled_start, 'despues', v_opt->>'start'));
    UPDATE public.kiru_class_sessions
    SET scheduled_start = (v_opt->>'start')::timestamptz, scheduled_end = (v_opt->>'end')::timestamptz
    WHERE id = s.id;
    UPDATE public.kiru_class_requests SET status = 'aprobada', chosen_option = v_opt, reply = left(coalesce(p_reply, ''), 2000) WHERE id = q.id;
    FOR v_sup IN SELECT kiru_private.class_supervisors(q.mentor_id) UNION SELECT s.mentor_id UNION SELECT kiru_private.class_guardians(s.student_id) LOOP
      PERFORM kiru_private.class_notify(v_sup, s.student_id, s.id, q.id, 'clase_decision', 'Cambio de clase confirmado',
        'La clase pasa al ' || kiru_private.class_label((v_opt->>'start')::timestamptz) || '.', 'clase_decision:' || q.id || ':aceptada');
    END LOOP;
  ELSIF p_action = 'informar' AND q.status = 'mas_info' THEN
    IF length(btrim(coalesce(p_reply, ''))) < 3 THEN RAISE EXCEPTION 'Escribe la información.' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.kiru_class_requests SET status = 'pendiente', reply = left(p_reply, 2000) WHERE id = q.id;
    FOR v_sup IN SELECT kiru_private.class_supervisors(q.mentor_id) LOOP
      PERFORM kiru_private.class_notify(v_sup, s.student_id, s.id, q.id, 'clase_solicitud', 'Han respondido a tu petición de información',
        left(p_reply, 300), 'clase_info:' || q.id || ':' || extract(epoch FROM now())::bigint);
    END LOOP;
  ELSIF p_action = 'retirar' AND q.status IN ('pendiente', 'mas_info', 'contrapropuesta') THEN
    UPDATE public.kiru_class_requests SET status = 'retirada', reply = left(coalesce(p_reply, ''), 2000) WHERE id = q.id;
  ELSE
    RAISE EXCEPTION 'Esa acción no es posible ahora.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM kiru_private.class_event(s.id, q.id, p_actor, 'respuesta_' || p_action, '{}'::jsonb);
  RETURN jsonb_build_object('id', q.id);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_clases_responder(uuid, uuid, text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_clases_responder(uuid, uuid, text, text, int) TO service_role;

-- 15. Recuperaciones ---------------------------------------------------------------
-- El mentor (o coordinación) propone fechas para recuperar una clase.
-- Sirve para recuperaciones con derecho y para las voluntarias (familia canceló
-- con menos de 48 h o no se presentó): en ese caso la original sigue consumida.
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
REVOKE ALL ON FUNCTION public.kiru_recuperaciones_proponer(uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_recuperaciones_proponer(uuid, uuid, jsonb, text) TO service_role;

-- La familia elige una opción (p_option) o dice que ninguna le encaja (NULL).
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
  IF v_role NOT IN ('padre', 'coordinador', 'admin') THEN
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
REVOKE ALL ON FUNCTION public.kiru_recuperaciones_elegir(uuid, uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_recuperaciones_elegir(uuid, uuid, int, text) TO service_role;

-- Coordinación: recordatorio al mentor o a la familia, y excepción de plazo.
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
  ELSIF p_action = 'excepcion_plazo' THEN
    IF length(btrim(coalesce(p_note, ''))) < 3 THEN RAISE EXCEPTION 'Explica la excepción y la fecha acordada.' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.kiru_class_sessions
    SET recovery_exception_note = left(p_note, 1000), recovery_exception_by = p_actor, recovery_exception_at = now()
    WHERE id = s.id;
  ELSE
    RAISE EXCEPTION 'Acción no válida.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM kiru_private.class_event(s.id, NULL, p_actor, p_action, jsonb_build_object('nota', left(coalesce(p_note, ''), 300)));
  RETURN jsonb_build_object('ok', true);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_recuperaciones_gestionar(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_recuperaciones_gestionar(uuid, uuid, text, text) TO service_role;

-- Coordinación registra directamente una cancelación de la que se ha enterado
-- (p. ej. la familia no se presentó o el mentor avisó por teléfono).
CREATE OR REPLACE FUNCTION public.kiru_clases_registrar_cancelacion(
  p_actor uuid, p_session uuid, p_cause text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.kiru_class_sessions;
  v_role text;
BEGIN
  IF p_cause NOT IN ('familia_menos_48h', 'familia_con_aviso', 'no_presentado', 'mentor', 'excepcion') THEN
    RAISE EXCEPTION 'Motivo de cancelación no válido.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa clase.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, s.mentor_id, s.student_id);
  IF v_role NOT IN ('coordinador', 'admin') THEN RAISE EXCEPTION 'Solo coordinación.' USING ERRCODE = '42501'; END IF;
  IF s.delivery <> 'programada' THEN RAISE EXCEPTION 'La clase ya no está programada.' USING ERRCODE = 'check_violation'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 3 THEN RAISE EXCEPTION 'Explica el motivo.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM kiru_private.class_apply_cancel(s.id, p_cause, p_note, p_actor);
  PERFORM kiru_private.class_notify_new_recovery(s.id);
  RETURN jsonb_build_object('ok', true);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_clases_registrar_cancelacion(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_clases_registrar_cancelacion(uuid, uuid, text, text) TO service_role;

-- 16. Avisos de registros fuera de horario e incidencias ----------------------------
CREATE OR REPLACE FUNCTION public.kiru_registros_avisar(
  p_actor uuid, p_log uuid, p_reason_code text, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  l public.kiru_session_logs;
  v_req uuid;
  v_sup uuid;
BEGIN
  SELECT * INTO l FROM public.kiru_session_logs WHERE id = p_log;
  IF NOT FOUND OR l.mentor_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Solo el mentor que firmó el registro puede avisar.' USING ERRCODE = '42501';
  END IF;
  IF p_reason_code NOT IN ('cambio_acordado', 'recuperacion', 'sustitucion', 'error_registro', 'otro') THEN
    RAISE EXCEPTION 'Elige un motivo.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_reason_code = 'otro' AND length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Explica el motivo.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.kiru_class_requests (session_log_id, mentor_id, student_id, kind, requested_by, requester_role, reason_code, reason)
  VALUES (l.id, l.mentor_id, l.student_id, 'aviso_registro', p_actor, 'mentor', p_reason_code, btrim(coalesce(p_reason, '')))
  RETURNING id INTO v_req;
  PERFORM kiru_private.class_event(NULL, v_req, p_actor, 'aviso_registro', jsonb_build_object('motivo', p_reason_code, 'fecha', l.session_date));
  FOR v_sup IN SELECT kiru_private.class_supervisors(l.mentor_id) LOOP
    PERFORM kiru_private.class_notify(v_sup, l.student_id, NULL, v_req, 'registro_aviso',
      'Aviso sobre un registro de sesión',
      coalesce(l.mentor_name, '') || ' · ' || coalesce(l.student_name, '') || ' · ' || to_char(l.session_date, 'DD/MM')
        || ': ' || replace(p_reason_code, '_', ' ') || '.',
      'registro_aviso:' || v_req);
  END LOOP;
  RETURN jsonb_build_object('id', v_req);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_registros_avisar(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_registros_avisar(uuid, uuid, text, text) TO service_role;

-- Coordinación gestiona un aviso de registro: gestionado | mas_info | incidencia,
-- y puede enlazar el registro a la clase correcta (p_session) para que cuente una vez.
CREATE OR REPLACE FUNCTION public.kiru_registros_gestionar_aviso(
  p_actor uuid, p_request uuid, p_action text, p_note text DEFAULT '', p_session uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q public.kiru_class_requests;
  s public.kiru_class_sessions;
  v_role text;
  l public.kiru_session_logs;
BEGIN
  SELECT * INTO q FROM public.kiru_class_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR q.kind <> 'aviso_registro' THEN RAISE EXCEPTION 'No existe ese aviso.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, q.mentor_id, q.student_id);
  IF v_role NOT IN ('coordinador', 'admin') THEN RAISE EXCEPTION 'Solo coordinación.' USING ERRCODE = '42501'; END IF;

  IF p_session IS NOT NULL THEN
    SELECT * INTO l FROM public.kiru_session_logs WHERE id = q.session_log_id;
    SELECT * INTO s FROM public.kiru_class_sessions WHERE id = p_session FOR UPDATE;
    IF NOT FOUND OR s.student_id IS DISTINCT FROM l.student_id OR s.delivery <> 'programada' OR s.session_log_id IS NOT NULL THEN
      RAISE EXCEPTION 'Esa clase no se puede enlazar con este registro.' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.kiru_class_sessions WHERE session_log_id = l.id) THEN
      RAISE EXCEPTION 'Este registro ya está enlazado a otra clase.' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM kiru_private.class_mark_delivered(s.id, l.id, coalesce(l.mentor_id, s.mentor_id), p_actor);
  END IF;

  IF p_action = 'gestionado' THEN
    UPDATE public.kiru_class_requests SET status = 'gestionado', decided_by = p_actor, decided_at = now(), decision_note = left(coalesce(p_note, ''), 2000) WHERE id = q.id;
  ELSIF p_action = 'mas_info' THEN
    UPDATE public.kiru_class_requests SET status = 'mas_info', decided_by = p_actor, decided_at = now(), decision_note = left(coalesce(p_note, ''), 2000) WHERE id = q.id;
    PERFORM kiru_private.class_notify(q.mentor_id, q.student_id, NULL, q.id, 'clase_mas_info', 'Tu coordinador necesita más información',
      'Sobre el aviso de registro. ' || left(coalesce(p_note, ''), 300), 'registro_mas_info:' || q.id || ':' || extract(epoch FROM now())::bigint);
  ELSIF p_action = 'incidencia' THEN
    UPDATE public.kiru_class_requests SET status = 'gestionado', decided_by = p_actor, decided_at = now(),
      incident = 'abierta', incident_note = left(coalesce(p_note, ''), 2000), decision_note = left(coalesce(p_note, ''), 2000) WHERE id = q.id;
  ELSE
    RAISE EXCEPTION 'Acción no válida.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM kiru_private.class_event(p_session, q.id, p_actor, 'aviso_' || p_action, jsonb_build_object('nota', left(coalesce(p_note, ''), 300)));
  RETURN jsonb_build_object('ok', true);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_registros_gestionar_aviso(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_registros_gestionar_aviso(uuid, uuid, text, text, uuid) TO service_role;

-- El mentor responde a una petición de información sobre su aviso.
CREATE OR REPLACE FUNCTION public.kiru_registros_responder_aviso(p_actor uuid, p_request uuid, p_reply text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q public.kiru_class_requests;
  v_sup uuid;
BEGIN
  SELECT * INTO q FROM public.kiru_class_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR q.kind <> 'aviso_registro' OR q.mentor_id <> p_actor THEN RAISE EXCEPTION 'No existe ese aviso.' USING ERRCODE = '42501'; END IF;
  IF q.status <> 'mas_info' OR length(btrim(coalesce(p_reply, ''))) < 3 THEN RAISE EXCEPTION 'Escribe la información.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.kiru_class_requests SET status = 'pendiente', reply = left(p_reply, 2000) WHERE id = q.id;
  PERFORM kiru_private.class_event(NULL, q.id, p_actor, 'aviso_respuesta', '{}'::jsonb);
  FOR v_sup IN SELECT kiru_private.class_supervisors(q.mentor_id) LOOP
    PERFORM kiru_private.class_notify(v_sup, q.student_id, NULL, q.id, 'registro_aviso', 'El mentor ha respondido sobre un registro',
      left(p_reply, 300), 'registro_respuesta:' || q.id || ':' || extract(epoch FROM now())::bigint);
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_registros_responder_aviso(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_registros_responder_aviso(uuid, uuid, text) TO service_role;

-- Revisión de una incidencia (potencial por cambio tardío o abierta por un aviso).
CREATE OR REPLACE FUNCTION public.kiru_incidencias_revisar(p_actor uuid, p_request uuid, p_verdict text, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q public.kiru_class_requests;
  v_role text;
BEGIN
  IF p_verdict NOT IN ('justificada', 'no_justificada', 'mas_info') THEN
    RAISE EXCEPTION 'Valoración no válida.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO q FROM public.kiru_class_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR q.incident = 'ninguna' THEN RAISE EXCEPTION 'No hay incidencia que revisar.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, q.mentor_id, q.student_id);
  IF v_role NOT IN ('coordinador', 'admin') THEN RAISE EXCEPTION 'Solo coordinación.' USING ERRCODE = '42501'; END IF;
  UPDATE public.kiru_class_requests
  SET incident = p_verdict, incident_note = left(coalesce(p_note, ''), 2000), incident_reviewed_by = p_actor, incident_reviewed_at = now()
  WHERE id = q.id;
  PERFORM kiru_private.class_event(q.session_id, q.id, p_actor, 'incidencia_' || p_verdict, jsonb_build_object('nota', left(coalesce(p_note, ''), 300)));
  IF p_verdict = 'mas_info' THEN
    PERFORM kiru_private.class_notify(q.mentor_id, q.student_id, q.session_id, q.id, 'clase_incidencia',
      'Tu coordinador necesita más información', left(coalesce(p_note, ''), 300),
      'incidencia_mas_info:' || q.id || ':' || extract(epoch FROM now())::bigint);
  END IF;
  RETURN jsonb_build_object('ok', true);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_incidencias_revisar(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_incidencias_revisar(uuid, uuid, text, text) TO service_role;

-- 17. Días sin clase de Kiru ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_dias_sin_clase_guardar(p_actor uuid, p_day date, p_reason text, p_active boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'admin' AND is_active) THEN
    RAISE EXCEPTION 'Solo administración.' USING ERRCODE = '42501';
  END IF;
  IF p_active THEN
    IF length(btrim(coalesce(p_reason, ''))) < 1 THEN RAISE EXCEPTION 'Indica el motivo.' USING ERRCODE = 'check_violation'; END IF;
    INSERT INTO public.kiru_no_class_days (day, reason, created_by) VALUES (p_day, btrim(p_reason), p_actor)
    ON CONFLICT (day) WHERE is_active DO UPDATE SET reason = excluded.reason
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.kiru_no_class_days SET is_active = false, cancelled_by = p_actor, cancelled_at = now()
    WHERE day = p_day AND is_active RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Ese día no estaba marcado.' USING ERRCODE = 'no_data_found'; END IF;
  END IF;
  PERFORM kiru_private.sheet_queue('sin_clase', 'dia:' || p_day::text, jsonb_build_object(
    'fecha', to_char(p_day, 'DD/MM/YYYY'), 'mentor', '', 'alumno', '',
    'motivo', CASE WHEN p_active THEN btrim(p_reason) ELSE 'Anulado: ' || coalesce((SELECT reason FROM public.kiru_no_class_days WHERE id = v_id), '') END,
    'quien_cancela', kiru_private.cause_label('dia_sin_clase_kiru'),
    'id_clase', 'dia:' || p_day::text,
    'anulada', NOT p_active));
  PERFORM public.kiru_clases_generar();
  RETURN jsonb_build_object('id', v_id);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_dias_sin_clase_guardar(uuid, date, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_dias_sin_clase_guardar(uuid, date, text, boolean) TO service_role;

-- 18. Estado del servicio desde «Familias» --------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_familias_estado(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r jsonb;
  v_id uuid;
  v_status text;
  v_updated int := 0;
  v_unknown jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'Filas no válidas.' USING ERRCODE = 'check_violation';
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    BEGIN v_id := (r->>'campus_id')::uuid; EXCEPTION WHEN others THEN v_id := NULL; END;
    v_status := lower(btrim(coalesce(r->>'estado', '')));
    v_status := CASE
      WHEN v_status IN ('activo', 'activa') THEN 'activo'
      WHEN v_status IN ('en_pausa', 'pausa') OR v_status LIKE 'pausa%' THEN 'en_pausa'
      WHEN v_status = 'baja' THEN 'baja'
      ELSE NULL END;
    IF v_id IS NULL OR v_status IS NULL OR NOT EXISTS (SELECT 1 FROM public.students WHERE profile_id = v_id) THEN
      v_unknown := v_unknown || jsonb_build_array(coalesce(r->>'campus_id', ''));
      CONTINUE;
    END IF;
    UPDATE public.students
    SET service_status = v_status,
        municipality = left(btrim(coalesce(r->>'municipio', '')), 120),
        service_status_source = 'familias',
        service_status_synced_at = now()
    WHERE profile_id = v_id
      AND (service_status IS DISTINCT FROM v_status OR municipality IS DISTINCT FROM left(btrim(coalesce(r->>'municipio', '')), 120)
           OR service_status_source <> 'familias');
    IF FOUND THEN v_updated := v_updated + 1; END IF;
  END LOOP;
  IF v_updated > 0 THEN PERFORM public.kiru_clases_generar(); END IF;
  RETURN jsonb_build_object('actualizados', v_updated, 'no_reconocidos', v_unknown);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_familias_estado(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_familias_estado(jsonb) TO service_role;

-- 19. Tarea diaria: generar clases y avisos de seguimiento ------------------------
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
  v_stale int := 0;
  v_period int := 0;
  r record;
  v_sup uuid;
BEGIN
  v_gen := public.kiru_clases_generar();

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

  RETURN v_gen || jsonb_build_object('avisos_sin_avanzar', v_stale, 'avisos_fin_periodo', v_period);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_clases_tarea_diaria() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_clases_tarea_diaria() TO service_role;

-- 20. Resumen del periodo para familias y coordinación ---------------------------
-- Contratadas = foto del periodo (sessions_included). Consumidas y pendientes se
-- calculan siempre desde las clases originales del periodo.
CREATE OR REPLACE VIEW public.kiru_period_session_summary
WITH (security_invoker = false)
AS
SELECT
  p.id AS payment_id,
  p.student_id,
  p.coverage_start,
  p.coverage_end,
  p.status AS payment_status,
  p.sessions_included,
  count(s.id) FILTER (WHERE s.consumption = 'consumida') AS sessions_consumed,
  count(s.id) FILTER (WHERE s.delivery = 'impartida') AS sessions_delivered,
  count(s.id) FILTER (WHERE s.consumption = 'consumida' AND s.delivery = 'no_impartida') AS sessions_cancelled_consumed,
  count(s.id) FILTER (WHERE s.recovery IN ('pendiente', 'propuesta', 'sin_encaje', 'programada')) AS recoveries_open,
  count(s.id) FILTER (WHERE s.delivery = 'programada') AS sessions_scheduled
FROM public.kiru_payments p
LEFT JOIN public.kiru_class_sessions s
  ON s.student_id = p.student_id AND s.kind = 'regular' AND s.delivery <> 'anulada'
  AND (s.original_start AT TIME ZONE 'Europe/Madrid')::date >= p.coverage_start
  AND (s.original_start AT TIME ZONE 'Europe/Madrid')::date < p.coverage_end
WHERE p.coverage_start IS NOT NULL AND p.coverage_end IS NOT NULL
  AND (kiru_private.is_guardian_of(p.student_id) OR kiru_private.is_admin() OR kiru_private.coordinates_student(p.student_id))
GROUP BY p.id;
COMMENT ON VIEW public.kiru_period_session_summary IS
  'Sesiones contratadas (foto), consumidas, impartidas y recuperaciones abiertas por periodo pagado. Sin contadores manuales.';
REVOKE ALL ON public.kiru_period_session_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_period_session_summary TO authenticated;

-- Sesiones previstas de un alumno en [desde, hasta): horario semanal activo,
-- menos los días sin clase de Kiru (los festivos cuentan). Es el mismo cálculo
-- que la foto sessions_included; lo usa también el script de liquidaciones.
CREATE OR REPLACE FUNCTION public.kiru_sesiones_previstas(p_student uuid, p_from date, p_until date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_count int := 0;
BEGIN
  IF p_from IS NULL OR p_until IS NULL OR p_until <= p_from OR p_until - p_from > 400 THEN
    RAISE EXCEPTION 'Rango de fechas no válido.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT service_status INTO v_status FROM public.students WHERE profile_id = p_student;
  IF v_status IS NULL THEN RAISE EXCEPTION 'No existe ese alumno.' USING ERRCODE = 'no_data_found'; END IF;
  IF v_status = 'activo' THEN
    SELECT count(*) INTO v_count
    FROM public.kiru_student_schedule_slots s
    CROSS JOIN LATERAL generate_series(p_from::timestamp, (p_until - 1)::timestamp, interval '1 day') AS d(day)
    WHERE s.student_id = p_student AND s.is_active
      AND extract(isodow FROM d.day)::smallint = s.weekday
      AND NOT EXISTS (SELECT 1 FROM public.kiru_no_class_days n WHERE n.is_active AND n.day = d.day::date);
  END IF;
  RETURN jsonb_build_object('alumno', p_student, 'desde', p_from, 'hasta', p_until, 'estado', v_status, 'previstas', v_count);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_sesiones_previstas(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_sesiones_previstas(uuid, date, date) TO service_role;

-- La foto de previstas al crear el periodo descuenta los días sin clase de Kiru
-- (los festivos no). Se rehace la función de renovaciones con ese único cambio.
CREATE OR REPLACE FUNCTION kiru_private.renewal_payment_reported(r public.kiru_renewals, p_source text, p_by uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_months int := CASE WHEN r.plan IN ('mantener', 'subir') THEN r.months ELSE 1 END;
  v_start date := coalesce((r.paid_reported_at AT TIME ZONE 'Europe/Madrid')::date, (now() AT TIME ZONE 'Europe/Madrid')::date);
  v_end date;
  v_label text := CASE r.plan WHEN 'mantener' THEN r.keep_label WHEN 'subir' THEN r.up_label ELSE NULL END;
  v_match text[];
  v_days smallint;
  v_sessions smallint;
  v_total numeric := coalesce(kiru_private.renewal_total(r), r.keep_price);
  v_author uuid := coalesce(p_by, kiru_private.system_author());
  v_concept text;
BEGIN
  IF v_author IS NULL THEN RETURN; END IF;
  v_months := greatest(1, least(v_months, 12));
  v_end := (v_start + make_interval(months => v_months))::date;

  v_match := regexp_match(lower(coalesce(v_label, '')), '([1-3])\s*d[ií]as?');
  IF v_match IS NOT NULL THEN
    v_days := v_match[1]::smallint;
  ELSE
    SELECT nullif(count(*), 0)::smallint INTO v_days
    FROM public.kiru_student_schedule_slots s
    WHERE s.student_id = r.student_id AND s.is_active;
  END IF;

  SELECT nullif(count(*), 0)::smallint INTO v_sessions
  FROM public.kiru_student_schedule_slots s
  CROSS JOIN LATERAL generate_series(
    v_start::timestamp,
    (v_end - 1)::timestamp,
    interval '1 day'
  ) AS scheduled_day(day)
  WHERE s.student_id = r.student_id
    AND s.is_active
    AND extract(isodow FROM scheduled_day.day)::smallint = s.weekday
    AND NOT EXISTS (SELECT 1 FROM public.kiru_no_class_days d WHERE d.is_active AND d.day = scheduled_day.day::date);

  v_concept := 'Acompañamiento del ' || to_char(v_start, 'DD/MM/YYYY') || ' al ' || to_char(v_end, 'DD/MM/YYYY')
    || CASE WHEN v_months > 1 THEN ' (' || v_months || ' meses)' ELSE '' END;

  UPDATE public.kiru_renewals
  SET paid_from = v_start, sessions_planned = v_sessions
  WHERE id = r.id;

  INSERT INTO public.kiru_payments (
    student_id, concept, amount_cents, due_date, status, notes, created_by, renewal_id,
    coverage_start, coverage_end, days_per_week, sessions_included, reported_at
  ) VALUES (
    r.student_id, v_concept, round(v_total * 100)::int, v_start, 'pending',
    'Pago comunicado por la familia desde ' || CASE p_source WHEN 'correo' THEN 'el correo' ELSE 'el campus' END || '; pendiente de confirmar.',
    v_author, r.id, v_start, v_end, v_days, v_sessions, r.paid_reported_at
  )
  ON CONFLICT (renewal_id) WHERE renewal_id IS NOT NULL DO UPDATE
  SET concept = excluded.concept,
      amount_cents = excluded.amount_cents,
      due_date = excluded.due_date,
      coverage_start = excluded.coverage_start,
      coverage_end = excluded.coverage_end,
      days_per_week = excluded.days_per_week,
      sessions_included = excluded.sessions_included,
      reported_at = excluded.reported_at;
END;
$function$;

-- 21. Tarea programada (pg_cron, si está disponible en este Postgres) ---------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiru_clases_diaria';
      -- 03:15 UTC (04:15 o 05:15 en Madrid).
      PERFORM cron.schedule('kiru_clases_diaria', '15 3 * * *', 'SELECT public.kiru_clases_tarea_diaria()');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'pg_cron no disponible (%); la tarea diaria se ejecutará desde Vercel Cron.', SQLERRM;
    END;
  END IF;
END
$cron$;
