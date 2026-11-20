-- Llamadas semanales con las familias (decidido por Sofía el 15/11/2026).
--
-- · 20 minutos cada semana, por Zoom (sala fija del coordinador) o por teléfono si
--   la familia lo prefiere. Mejor con los dos padres. Misma hora cada semana.
-- · Ciclo de 4 semanas que empieza la semana de la primera clase del alumno:
--   semana 1 y 4 = familia + mentor + coordinador; semanas 2 y 3 = familia + coordinador.
-- · La disponibilidad se rellena en Jotform («Disponibilidad para llamadas · Familias»
--   y «· Equipo»). El webhook guarda cada respuesta aquí (cuenta la última).
-- · El campus busca solo la mejor hora común («match») y la confirma sola: avisa por
--   correo a la familia, al mentor y al coordinador, y al coordinador le da un enlace
--   de WhatsApp para avisar en el grupo de la familia.
-- · Después de las llamadas de las semanas 1 y 4, el coordinador valora al mentor del
--   1 al 5 (preparación, participación, comunicación, seguimiento y actitud) en el
--   campus: indicador D1 de «Desempeño de mentores».
--
-- Nada se envía mientras «llamadas».modo sea «apagado». En «prueba» solo se trabaja con
-- los alumnos de «alumnos_prueba». Todo se lee y escribe desde el servidor (service role).

-- 1. Ajustes ----------------------------------------------------------------------------------
INSERT INTO public.kiru_settings (key, value) VALUES
  ('llamadas', jsonb_build_object(
    'modo', 'apagado',
    'alumnos_prueba', '[]'::jsonb,
    'form_familias', 'https://form.jotform.com/263026244810045',
    'form_equipo', 'https://form.jotform.com/263026449536057',
    -- Nombre del campo oculto «Código de llamada (no tocar)» en los dos formularios.
    'campo_codigo', 'codigoDe'))
ON CONFLICT (key) DO NOTHING;

-- 2. Datos del equipo: código personal del formulario y sala de Zoom del coordinador -----------
CREATE TABLE IF NOT EXISTS public.kiru_call_staff (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Va oculto en el enlace del formulario del equipo y vuelve en la respuesta.
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  zoom_url text NOT NULL DEFAULT '' CHECK (zoom_url = '' OR (zoom_url ~ '^https://' AND length(zoom_url) <= 300)),
  -- El coordinador confirma que graba las reuniones y usa la aplicación de escritorio de Zoom.
  rules_ack_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.kiru_call_staff IS
  'Llamadas con familias: código personal del formulario de disponibilidad del equipo y sala fija de Zoom de cada coordinador.';

-- 3. Respuestas de disponibilidad (Jotform) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_call_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('familia', 'equipo')),
  -- Familia: el alumno. Equipo: la persona. Vacío si no se pudo reconocer (se enlaza a mano).
  student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_label text NOT NULL DEFAULT '' CHECK (length(role_label) <= 40),
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 200),
  email text NOT NULL DEFAULT '' CHECK (length(email) <= 200),
  -- [{ "d": 1-7 (1 = lunes), "from": "HH:MM", "to": "HH:MM" }]
  slots jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(slots) = 'array' AND pg_column_size(slots) < 20000),
  -- Días (1-7) en los que pueden los dos padres.
  both_parents_days smallint[] NOT NULL DEFAULT '{}',
  medium text NOT NULL DEFAULT 'zoom' CHECK (medium IN ('zoom', 'telefono')),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  commitments text NOT NULL DEFAULT '' CHECK (length(commitments) <= 1500),
  submission_id text CHECK (submission_id IS NULL OR length(submission_id) <= 64),
  answers jsonb CHECK (answers IS NULL OR (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) < 100000)),
  received_at timestamptz NOT NULL DEFAULT now(),
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_at timestamptz,
  CHECK (kind <> 'familia' OR profile_id IS NULL),
  CHECK (kind <> 'equipo' OR student_id IS NULL)
);
CREATE INDEX IF NOT EXISTS kiru_call_availability_student_idx ON public.kiru_call_availability (student_id, received_at DESC);
CREATE INDEX IF NOT EXISTS kiru_call_availability_profile_idx ON public.kiru_call_availability (profile_id, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS kiru_call_availability_submission_uidx ON public.kiru_call_availability (submission_id) WHERE submission_id IS NOT NULL;
COMMENT ON TABLE public.kiru_call_availability IS
  'Respuestas de los Jotform de disponibilidad para llamadas (familias y equipo). Cuenta la última de cada alumno o persona.';

-- 4. Plan de llamadas de cada alumno ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_call_plans (
  student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Va oculto en el enlace del formulario de la familia y vuelve en la respuesta.
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  -- Si se rellena, sustituye a la primera clase como inicio del ciclo (lunes de la semana 1).
  start_override date,
  coordinator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'sin_datos' CHECK (status IN ('sin_datos', 'sin_hueco', 'confirmada', 'pausada')),
  -- Hora fija (semanas 2 y 3, y también 1 y 4 si mentor_* está vacío). weekday 1 = lunes.
  weekday smallint CHECK (weekday BETWEEN 1 AND 7),
  start_time time,
  mentor_weekday smallint CHECK (mentor_weekday BETWEEN 1 AND 7),
  mentor_start_time time,
  medium text NOT NULL DEFAULT 'zoom' CHECK (medium IN ('zoom', 'telefono')),
  both_parents boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  confirmed_via text CHECK (confirmed_via IS NULL OR confirmed_via IN ('auto', 'manual')),
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Qué falta para el «match» o por qué no hay hueco; otras opciones encontradas.
  missing text[] NOT NULL DEFAULT '{}',
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array' AND pg_column_size(options) < 20000),
  -- Aviso a la familia para rellenar el formulario (incorporación).
  form_requested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'confirmada' OR (weekday IS NOT NULL AND start_time IS NOT NULL)),
  CHECK ((mentor_weekday IS NULL) = (mentor_start_time IS NULL))
);
CREATE INDEX IF NOT EXISTS kiru_call_plans_coordinator_idx ON public.kiru_call_plans (coordinator_id);
CREATE INDEX IF NOT EXISTS kiru_call_plans_mentor_idx ON public.kiru_call_plans (mentor_id);
COMMENT ON TABLE public.kiru_call_plans IS
  'Hora fija de la llamada semanal de cada alumno (la elige sola el campus con el «match»; Coordinación la puede cambiar).';

-- 5. Llamadas -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_family_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Lunes de la semana de la llamada y número de semana del ciclo (1-4).
  week_start date NOT NULL,
  week_no smallint NOT NULL CHECK (week_no BETWEEN 1 AND 4),
  with_mentor boolean NOT NULL,
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  coordinator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_start timestamptz NOT NULL,
  medium text NOT NULL DEFAULT 'zoom' CHECK (medium IN ('zoom', 'telefono')),
  moved boolean NOT NULL DEFAULT false,
  moved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'programada' CHECK (status IN ('programada', 'hecha', 'no_hecha', 'cancelada')),
  -- Solo semanas 1 y 4: si estuvo el mentor y su valoración (1-5).
  mentor_presence text CHECK (mentor_presence IS NULL OR mentor_presence IN ('estuvo', 'ausente', 'causa_ajena')),
  preparacion smallint CHECK (preparacion BETWEEN 1 AND 5),
  participacion smallint CHECK (participacion BETWEEN 1 AND 5),
  comunicacion smallint CHECK (comunicacion BETWEEN 1 AND 5),
  seguimiento smallint CHECK (seguimiento BETWEEN 1 AND 5),
  actitud smallint CHECK (actitud BETWEEN 1 AND 5),
  rating_average numeric(3, 2) GENERATED ALWAYS AS (
    CASE WHEN num_nonnulls(preparacion, participacion, comunicacion, seguimiento, actitud) = 0 THEN NULL
         ELSE round((coalesce(preparacion, 0) + coalesce(participacion, 0) + coalesce(comunicacion, 0)
                     + coalesce(seguimiento, 0) + coalesce(actitud, 0))::numeric
                    / num_nonnulls(preparacion, participacion, comunicacion, seguimiento, actitud), 2)
    END) STORED,
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 1500),
  -- Lo más importante que contaron los padres (opcional, una o dos frases).
  parents_topics text NOT NULL DEFAULT '' CHECK (length(parents_topics) <= 1500),
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Avisos ya creados (valorar, recordatorio…).
  steps text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, week_start),
  CHECK (with_mentor = (week_no IN (1, 4))),
  CHECK (mentor_presence IS NULL OR with_mentor)
);
CREATE INDEX IF NOT EXISTS kiru_family_calls_start_idx ON public.kiru_family_calls (scheduled_start);
CREATE INDEX IF NOT EXISTS kiru_family_calls_mentor_idx ON public.kiru_family_calls (mentor_id, scheduled_start);
CREATE INDEX IF NOT EXISTS kiru_family_calls_coordinator_idx ON public.kiru_family_calls (coordinator_id, scheduled_start);
COMMENT ON TABLE public.kiru_family_calls IS
  'Cada llamada semanal con una familia. En las semanas 1 y 4 el coordinador valora al mentor (1-5): indicador D1.';

ALTER TABLE public.kiru_call_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_call_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_call_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_family_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_call_staff, public.kiru_call_availability, public.kiru_call_plans, public.kiru_family_calls
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.kiru_call_staff, public.kiru_call_availability, public.kiru_call_plans, public.kiru_family_calls
  TO service_role;

-- 6. Avisos ---------------------------------------------------------------------------------
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
  'registro_error', 'registro_error_respuesta',
  'disponibilidad_enviada',
  'llamada_familia'
));

-- 7. Indicador D1 ---------------------------------------------------------------------------
-- Media de las valoraciones del coordinador (semanas 1 y 4) dentro del periodo, pasada a
-- 0-100 (1 = 0, 5 = 100). «No estuvo (sin avisar)» cuenta como 1 en todo; «causa ajena» y
-- las llamadas que no se hicieron no cuentan. Sin ninguna valoración: pendiente.
CREATE OR REPLACE FUNCTION kiru_private.perf_indicator_values_d1(p_mentor uuid, p_from timestamptz, p_to timestamptz, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_data_from timestamptz := coalesce(
    ((SELECT data_from FROM public.kiru_perf_settings LIMIT 1)::timestamp AT TIME ZONE 'Europe/Madrid'), p_from);
  v_min int := coalesce((p_rules #>> '{min_sample,D1}')::int, 1);
  b record;
BEGIN
  SELECT count(*) AS calls,
         count(*) FILTER (WHERE c.mentor_presence = 'ausente') AS absences,
         round(avg(CASE WHEN c.mentor_presence = 'ausente' THEN 1 ELSE c.rating_average END), 2) AS avg5,
         round(avg(c.preparacion), 2) AS preparacion, round(avg(c.participacion), 2) AS participacion,
         round(avg(c.comunicacion), 2) AS comunicacion, round(avg(c.seguimiento), 2) AS seguimiento,
         round(avg(c.actitud), 2) AS actitud
  INTO b
  FROM public.kiru_family_calls c
  WHERE c.mentor_id = p_mentor AND c.with_mentor AND c.status = 'hecha'
    AND (c.mentor_presence = 'ausente' OR (c.mentor_presence = 'estuvo' AND c.rating_average IS NOT NULL))
    AND c.scheduled_start >= greatest(p_from, v_data_from) AND c.scheduled_start < p_to;
  RETURN jsonb_build_object('D1', jsonb_build_object(
    'status', CASE WHEN b.calls >= v_min THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN b.calls >= v_min THEN round((b.avg5 - 1) * 25, 1) END,
    'ok', b.calls - b.absences, 'total', b.calls,
    'detail', jsonb_build_object('llamadas', b.calls, 'ausencias', b.absences, 'media_sobre_5', b.avg5,
      'preparacion', b.preparacion, 'participacion', b.participacion, 'comunicacion', b.comunicacion,
      'seguimiento', b.seguimiento, 'actitud', b.actitud)));
END;
$$;

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
             || kiru_private.perf_indicator_values_2a(m.id, p_from, p_to, p_rules)
             || kiru_private.perf_indicator_values_d2(m.id, p_from, p_to, p_rules)
             || kiru_private.perf_indicator_values_d1(m.id, p_from, p_to, p_rules);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'mentor_id', m.id, 'mentor_name', m.full_name, 'values', v_values,
      'score', kiru_private.perf_assemble(v_values, p_rules, '{"leve":0,"grave":0,"muy_grave":0}'::jsonb,
                 coalesce((v_values #>> '{B1,total}')::int, 0))));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.perf_indicator_values_d1(uuid, timestamptz, timestamptz, jsonb),
  kiru_private.perf_compute(timestamptz, timestamptz, jsonb) FROM PUBLIC;

UPDATE public.kiru_perf_indicators SET
  description = 'Después de las llamadas de las semanas 1 y 4 de cada ciclo, el coordinador valora de 1 a 5 la preparación, la participación, la comunicación, el seguimiento y la actitud del mentor (1 = 0, 5 = 100).',
  source = 'Valoración del coordinador en el campus (pestaña «Llamadas con familias»).',
  missing_data = 'Sin llamada con mentor en el periodo: pendiente. Ausencia por causa ajena o llamada que no se hizo: no cuenta. Ausencia sin avisar: cuenta como 1.'
WHERE code = 'D1';
