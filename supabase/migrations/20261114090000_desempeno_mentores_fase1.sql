-- Desempeño de mentores · Fase 1: el motor de cálculo.
--
-- Diseño aprobado por Sofía el 13/11/2026 (/mnt/project-files/campus/desempeno-mentores/).
-- Esta fase NO cambia nada de lo que ya funciona: solo LEE clases, peticiones,
-- registros, evaluaciones trimestrales y justificaciones, y guarda el resultado
-- en tablas nuevas que de momento solo ve administración.
--
-- No toca pagos de mentores, ni el extra de 10 €, ni la hoja «Pagos».
--
-- 1. kiru_perf_settings: modo del sistema (oculto, aprendizaje, piloto, oficial)
--    y fecha de entrada en vigor. Solo cuentan datos desde esa fecha.
-- 2. kiru_perf_rule_versions: pesos, cobertura mínima y restas/topes por
--    incidencias, con versión. Una versión aprobada no se puede editar.
-- 3. kiru_perf_indicators: catálogo de los 17 indicadores con su ficha.
-- 4. kiru_perf_periods: trimestres del curso (sep-nov, dic-feb, mar-may, jun-ago).
-- 5. kiru_perf_values / kiru_perf_scores: valores de cada indicador y nota
--    provisional del trimestre en curso, recalculados cada noche.
-- 6. kiru_perf_events: historial que solo admite añadir.
-- 7. Cálculo automático de B1, B3, B4 (plazo de propuesta), E1 y E2, la nota por
--    dimensiones, la cobertura mínima y la regla de restas y topes.
-- 8. kiru_perf_preview: ensayo de administración con las fechas que elija (no guarda nada).
--    kiru_perf_admin_overview: lo que ve la pestaña «Desempeño» de administración.

-- 1. Ajustes --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_perf_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mode text NOT NULL DEFAULT 'oculto' CHECK (mode IN ('oculto', 'aprendizaje', 'piloto', 'oficial')),
  -- Primer día cuyos datos cuentan. Nada anterior se tiene en cuenta.
  data_from date NOT NULL DEFAULT '2027-01-01',
  -- Primer día con consecuencias (lanzamiento oficial).
  official_from date NOT NULL DEFAULT '2027-04-01',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (official_from >= data_from)
);
INSERT INTO public.kiru_perf_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.kiru_perf_settings IS
  'Desempeño de mentores: modo (oculto, aprendizaje, piloto, oficial) y fechas de entrada en vigor. Solo se cambia con kiru_perf_update_settings.';

-- 2. Versiones de reglas ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_perf_rule_versions (
  version integer PRIMARY KEY CHECK (version > 0),
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'aprobada', 'retirada')),
  rules jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object'),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'borrador') = (approved_at IS NULL))
);
COMMENT ON TABLE public.kiru_perf_rule_versions IS
  'Pesos, umbrales y efectos de incidencias con versión. Una versión aprobada no se edita: se crea otra. La vigente es la aprobada de número más alto.';

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
  -- Aprobada o retirada: solo se puede pasar de aprobada a retirada, sin tocar nada más.
  IF OLD.status = 'aprobada' AND NEW.status = 'retirada'
     AND NEW.rules = OLD.rules AND NEW.version = OLD.version AND NEW.approved_at = OLD.approved_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Una versión aprobada de las reglas no se modifica: crea una versión nueva.' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS kiru_perf_rule_versions_guard ON public.kiru_perf_rule_versions;
CREATE TRIGGER kiru_perf_rule_versions_guard
BEFORE UPDATE OR DELETE ON public.kiru_perf_rule_versions
FOR EACH ROW EXECUTE FUNCTION kiru_private.perf_rules_guard();

-- Versión 1, aprobada por Sofía el 13/11/2026.
-- B: al quitar la puntualidad de B (ahora se valora en el formulario de familias, D2),
-- los pesos 40/20/20 de B1, B3 y B4 se llevan a 100 en la misma proporción: 50/25/25.
INSERT INTO public.kiru_perf_rule_versions (version, status, rules, note, approved_at)
VALUES (1, 'aprobada', $json${
  "dimensions": {"A": 30, "B": 25, "C": 20, "D": 15, "E": 10},
  "indicators": {
    "A1": 35, "A2": 25, "A3": 25, "A4": 15,
    "B1": 50, "B3": 25, "B4": 25,
    "C1": 35, "C2": 25, "C3": 25, "C4": 15,
    "D1": 40, "D2": 40, "D3": 20,
    "E1": 50, "E2": 30, "E3": 20
  },
  "coverage": {"dimension_min": 50, "total_min": 65, "min_dimensions": 4, "required": ["A", "B", "E"], "min_sessions": 4},
  "min_sample": {"B1": 4, "B3": 4, "B4": 1, "E1": 4, "E2": 1},
  "incidents": {"leve": 3, "leve_max": 15, "grave": 10, "grave_cap": 74, "muy_grave": 20, "muy_grave_cap": 59},
  "bands": [{"min": 90, "key": "excelente"}, {"min": 75, "key": "bueno"}, {"min": 60, "key": "mejorable"}, {"min": 40, "key": "deficiente"}, {"min": 0, "key": "muy_deficiente"}],
  "e1_hours": 24,
  "e2_window_days": 2
}$json$::jsonb,
'Versión 1 aprobada por Sofía (Administración) el 13/11/2026: pesos de dimensiones 30/25/20/15/10, pesos internos del diseño, restas −3/−10/−20 con máximo −15 por leves, topes 74 (grave) y 59 (muy grave, con revisión de continuidad). La puntualidad se valora solo en el formulario de familias (D2).',
'2026-11-13 13:25:21+00')
ON CONFLICT (version) DO NOTHING;

-- 3. Catálogo de indicadores ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_perf_indicators (
  code text PRIMARY KEY CHECK (code ~ '^[A-E][0-9]$'),
  dimension text NOT NULL CHECK (dimension IN ('A', 'B', 'C', 'D', 'E')),
  position smallint NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('auto', 'semi', 'humano', 'familias')),
  source text NOT NULL,
  missing_data text NOT NULL,
  -- Fase de implantación en la que empieza a calcularse.
  phase smallint NOT NULL CHECK (phase BETWEEN 1 AND 6),
  CHECK (left(code, 1) = dimension)
);
COMMENT ON TABLE public.kiru_perf_indicators IS 'Ficha de cada indicador de desempeño (qué mide, de dónde sale, qué pasa si faltan datos).';

INSERT INTO public.kiru_perf_indicators (code, dimension, position, name, description, kind, source, missing_data, phase) VALUES
  ('A1', 'A', 1, 'Materiales Kiru', 'Evidencias bimestrales de «Descubrirme»: al menos 3 actividades realizadas por el alumno en cada bimestre.', 'semi', 'Evidencias bimestrales validadas por Coordinación.', 'Plazo sin vencer, entrega pendiente de revisar o exención aprobada: no cuenta.', 2),
  ('A2', 'A', 2, 'SkillCoins y misiones', 'SkillCoins registradas cada semana, resultado de la supervisión y evidencia bimestral de al menos 1 misión.', 'semi', 'Registro de sesión, supervisión de SkillCoins y evidencias bimestrales.', 'Sin semanas evaluables ni evidencias vencidas: pendiente.', 2),
  ('A3', 'A', 3, 'Cálculalo', 'Uso semanal cuando el plan del alumno lo incluye y calidad de una muestra de actividades.', 'humano', 'Ficha mensual de Coordinación con la vista de clase de Cálculalo.', 'Alumnos sin Cálculalo en su plan: no aplica.', 2),
  ('A4', 'A', 4, 'Uso de la plataforma', 'Trabajo con las herramientas del campus que el plan del alumno incluye (inglés, lengua, tarjetas), sin contar volumen.', 'auto', 'Tareas asignadas o revisadas en el campus.', 'Alumnos sin herramientas en su plan: no aplica.', 2),
  ('B1', 'B', 1, 'Clases previstas dadas', 'Clases dadas frente a las previstas. Solo cuentan en contra las canceladas por el mentor que no se recuperan.', 'auto', 'Clases del campus y causa de cancelación.', 'Menos de 4 clases resueltas en el trimestre: pendiente. Causas ajenas al mentor no cuentan.', 1),
  ('B3', 'B', 3, 'Cambios y cancelaciones', 'Clases sin cambios o cancelaciones del mentor que Coordinación haya considerado no justificados.', 'semi', 'Peticiones de cambio y cancelación con su revisión.', 'Cambios pendientes de revisar no perjudican.', 1),
  ('B4', 'B', 4, 'Recuperaciones', 'Recuperaciones con fechas propuestas dentro del plazo (3 días). En fases siguientes se añadirá que se realicen dentro del periodo pagado.', 'auto', 'Estados de recuperación y propuestas de fechas.', 'Sin recuperaciones que organizar: no aplica.', 1),
  ('C1', 'C', 1, 'Proactividad e iniciativa', 'Se anticipa, comunica dificultades a tiempo y propone soluciones.', 'humano', 'Ficha mensual de Coordinación.', 'Sin ficha del mes: pendiente.', 5),
  ('C2', 'C', 2, 'Autonomía y eficacia', 'Cumple sus responsabilidades sin necesitar recordatorios constantes.', 'humano', 'Ficha mensual de Coordinación (los recordatorios se ven como contexto).', 'Sin ficha del mes: pendiente.', 5),
  ('C3', 'C', 3, 'Mejora y aplicación del feedback', 'Aplica las correcciones y muestra mejora con hechos.', 'humano', 'Ficha mensual y avisos metodológicos con mejora observada.', 'Sin ficha del mes: pendiente.', 5),
  ('C4', 'C', 4, 'Responsabilidad y actitud profesional', 'Cumple compromisos, trato respetuoso, respeta normas y protocolos.', 'humano', 'Ficha mensual de Coordinación.', 'Sin ficha del mes: pendiente.', 5),
  ('D1', 'D', 1, 'Llamadas con familias', 'Valoración del coordinador tras la primera y la última llamada del periodo de pago (preparación, participación, comunicación, seguimiento y actitud).', 'humano', 'Tarjeta de valoración de llamadas en el campus.', 'Sin llamada prevista o ausencia por causa ajena: no cuenta.', 3),
  ('D2', 'D', 2, 'Valoración de las familias', 'Formulario trimestral de las familias sobre el mentor, incluida la profesionalidad y la puntualidad.', 'familias', 'Formulario nuevo de familias en el campus.', 'Menos de 3 familias distintas en 6 meses: no entra en la nota. Si una familia no responde, no cuenta.', 3),
  ('D3', 'D', 3, 'Reuniones de equipo', 'Asistencia (sin contar ausencias justificadas) y participación en las reuniones convocadas.', 'semi', 'Asistencia marcada en la reunión.', 'Sin reuniones convocadas: no aplica.', 3),
  ('E1', 'E', 1, 'Registro de sesión en 24 h', 'Registros enviados en las 24 horas siguientes al final de la clase.', 'auto', 'Hora de envío del registro y hora de la clase.', 'Menos de 4 clases en el trimestre: pendiente.', 1),
  ('E2', 'E', 2, 'Obligaciones con plazo', 'Formulario trimestral de seguimiento del alumno y respuestas a justificaciones entregados en plazo.', 'auto', 'Evaluaciones trimestrales del mentor y justificaciones de SkillCoins.', 'Plazo sin vencer: no cuenta. Sin obligaciones: no aplica.', 1),
  ('E3', 'E', 3, 'Corrección de los registros', 'Registros que Coordinación ha tenido que corregir por un error del mentor. Los avisos que manda el propio mentor sobre sus errores no restan.', 'semi', 'Marca de Coordinación sobre registros con error.', 'Sin marcas: no aplica.', 2)
ON CONFLICT (code) DO UPDATE SET
  dimension = EXCLUDED.dimension, position = EXCLUDED.position, name = EXCLUDED.name, description = EXCLUDED.description,
  kind = EXCLUDED.kind, source = EXCLUDED.source, missing_data = EXCLUDED.missing_data, phase = EXCLUDED.phase;

-- 4. Trimestres del curso ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_perf_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_on date NOT NULL UNIQUE,
  -- Primer día del trimestre siguiente (no incluido).
  ends_on date NOT NULL,
  label text NOT NULL,
  rule_version integer NOT NULL REFERENCES public.kiru_perf_rule_versions(version),
  status text NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto', 'cerrado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on > starts_on)
);

-- Trimestre del curso que contiene un día: sep-nov, dic-feb, mar-may, jun-ago.
CREATE OR REPLACE FUNCTION kiru_private.perf_quarter(p_day date, OUT starts_on date, OUT ends_on date, OUT label text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  m int := extract(month FROM p_day);
  y int := extract(year FROM p_day);
BEGIN
  IF m BETWEEN 9 AND 11 THEN
    starts_on := make_date(y, 9, 1); ends_on := make_date(y, 12, 1); label := 'Sep-nov ' || y;
  ELSIF m = 12 THEN
    starts_on := make_date(y, 12, 1); ends_on := make_date(y + 1, 3, 1); label := 'Dic ' || y || '-feb ' || (y + 1);
  ELSIF m <= 2 THEN
    starts_on := make_date(y - 1, 12, 1); ends_on := make_date(y, 3, 1); label := 'Dic ' || (y - 1) || '-feb ' || y;
  ELSIF m <= 5 THEN
    starts_on := make_date(y, 3, 1); ends_on := make_date(y, 6, 1); label := 'Mar-may ' || y;
  ELSE
    starts_on := make_date(y, 6, 1); ends_on := make_date(y, 9, 1); label := 'Jun-ago ' || y;
  END IF;
END;
$$;

-- 5. Valores y notas provisionales -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_perf_values (
  period_id uuid NOT NULL REFERENCES public.kiru_perf_periods(id) ON DELETE RESTRICT,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  indicator text NOT NULL REFERENCES public.kiru_perf_indicators(code),
  status text NOT NULL CHECK (status IN ('calculado', 'pendiente', 'no_aplica')),
  value numeric(5, 1) CHECK (value IS NULL OR value BETWEEN 0 AND 100),
  ok integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  -- Desglose y referencias a los datos de origen (ids de clases, peticiones…).
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period_id, mentor_id, indicator),
  CHECK ((status = 'calculado') = (value IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS kiru_perf_values_mentor_idx ON public.kiru_perf_values (mentor_id);

CREATE TABLE IF NOT EXISTS public.kiru_perf_scores (
  period_id uuid NOT NULL REFERENCES public.kiru_perf_periods(id) ON DELETE RESTRICT,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_version integer NOT NULL REFERENCES public.kiru_perf_rule_versions(version),
  -- Provisional: se recalcula cada noche. La consolidación trimestral llega en una fase posterior.
  status text NOT NULL DEFAULT 'provisional' CHECK (status IN ('provisional')),
  result jsonb NOT NULL,
  performance numeric(5, 1),
  coverage numeric(5, 1) NOT NULL DEFAULT 0,
  final numeric(5, 1),
  category text,
  publishable boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period_id, mentor_id)
);
CREATE INDEX IF NOT EXISTS kiru_perf_scores_mentor_idx ON public.kiru_perf_scores (mentor_id);

-- 6. Historial ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_perf_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 60),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_perf_events_created_idx ON public.kiru_perf_events (created_at DESC);

CREATE OR REPLACE FUNCTION kiru_private.perf_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'El historial de desempeño no se modifica ni se borra.' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS kiru_perf_events_append_only ON public.kiru_perf_events;
CREATE TRIGGER kiru_perf_events_append_only
BEFORE UPDATE OR DELETE ON public.kiru_perf_events
FOR EACH ROW EXECUTE FUNCTION kiru_private.perf_events_append_only();

-- Permisos: en la Fase 1 solo administración lee. Nadie escribe directamente:
-- todo pasa por las funciones de abajo.
ALTER TABLE public.kiru_perf_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_perf_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_perf_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_perf_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_perf_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_perf_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_perf_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_perf_settings, public.kiru_perf_rule_versions, public.kiru_perf_indicators, public.kiru_perf_periods,
  public.kiru_perf_values, public.kiru_perf_scores, public.kiru_perf_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_perf_settings, public.kiru_perf_rule_versions, public.kiru_perf_indicators, public.kiru_perf_periods,
  public.kiru_perf_values, public.kiru_perf_scores, public.kiru_perf_events TO authenticated;

DO $pol$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kiru_perf_settings', 'kiru_perf_rule_versions', 'kiru_perf_indicators', 'kiru_perf_periods',
                           'kiru_perf_values', 'kiru_perf_scores', 'kiru_perf_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT kiru_private.is_admin()))', t || '_admin_read', t);
  END LOOP;
END
$pol$;

-- 7. Cálculo -------------------------------------------------------------------------------

-- Reglas vigentes: la versión aprobada de número más alto.
CREATE OR REPLACE FUNCTION kiru_private.perf_current_rules(OUT version integer, OUT rules jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.version, r.rules FROM public.kiru_perf_rule_versions r
  WHERE r.status = 'aprobada' ORDER BY r.version DESC LIMIT 1
$$;

-- Indicadores automáticos de un mentor entre dos instantes [p_from, p_to).
-- Devuelve {"B1": {"status", "value", "ok", "total", "detail"}, ...}.
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
    count(DISTINCT s.id) FILTER (WHERE r.incident = 'no_justificada') AS bad,
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
           AND r.created_at <= s.cancelled_at + make_interval(days => v_rec_days))) AS on_time
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

-- Nota final a partir de la nota ponderada y las incidencias aprobadas del trimestre.
-- Regla aprobada: final = el menor entre (nota − restas) y el tope de la incidencia más grave.
CREATE OR REPLACE FUNCTION kiru_private.perf_final(p_performance numeric, p_leves int, p_graves int, p_muy_graves int, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  inc jsonb := coalesce(p_rules -> 'incidents', '{}'::jsonb);
  v_leves numeric := least(coalesce(p_leves, 0) * coalesce((inc ->> 'leve')::numeric, 3), coalesce((inc ->> 'leve_max')::numeric, 15));
  v_ded numeric;
  v_cap numeric;
  v_final numeric;
  v_band jsonb;
  v_category text;
BEGIN
  IF p_performance IS NULL THEN
    RETURN jsonb_build_object('final', NULL, 'deductions', NULL, 'cap', NULL, 'category', NULL, 'continuity_review', coalesce(p_muy_graves, 0) > 0);
  END IF;
  v_ded := v_leves
         + coalesce(p_graves, 0) * coalesce((inc ->> 'grave')::numeric, 10)
         + coalesce(p_muy_graves, 0) * coalesce((inc ->> 'muy_grave')::numeric, 20);
  v_cap := CASE WHEN coalesce(p_muy_graves, 0) > 0 THEN coalesce((inc ->> 'muy_grave_cap')::numeric, 59)
                WHEN coalesce(p_graves, 0) > 0 THEN coalesce((inc ->> 'grave_cap')::numeric, 74) END;
  v_final := greatest(0, p_performance - v_ded);
  IF v_cap IS NOT NULL THEN v_final := least(v_final, v_cap); END IF;
  v_final := round(v_final, 1);
  FOR v_band IN SELECT * FROM jsonb_array_elements(coalesce(p_rules -> 'bands', '[]'::jsonb)) LOOP
    IF v_final >= (v_band ->> 'min')::numeric THEN v_category := v_band ->> 'key'; EXIT; END IF;
  END LOOP;
  RETURN jsonb_build_object('final', v_final, 'deductions', v_ded, 'cap', v_cap, 'category', v_category,
    'continuity_review', coalesce(p_muy_graves, 0) > 0);
END;
$$;

-- De los valores de los indicadores a la nota: dimensiones, cobertura, ponderada y final.
-- p_values: {"B1": {"status", "value"}, ...}; los indicadores que no vienen están «pendientes».
-- p_incidents: {"leve": n, "grave": n, "muy_grave": n} (aprobadas por Administración).
CREATE OR REPLACE FUNCTION kiru_private.perf_assemble(p_values jsonb, p_rules jsonb, p_incidents jsonb, p_sessions int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  cov jsonb := coalesce(p_rules -> 'coverage', '{}'::jsonb);
  v_dim_min numeric := coalesce((cov ->> 'dimension_min')::numeric, 50);
  v_total_min numeric := coalesce((cov ->> 'total_min')::numeric, 65);
  v_min_dims int := coalesce((cov ->> 'min_dimensions')::int, 4);
  v_min_sessions int := coalesce((cov ->> 'min_sessions')::int, 4);
  d record;
  i record;
  v_calc_w numeric; v_na_w numeric; v_all_w numeric; v_sum numeric;
  v_dims jsonb := '{}'::jsonb;
  v_perf_sum numeric := 0; v_perf_w numeric := 0; v_cov numeric := 0; v_with int := 0;
  v_perf numeric; v_reasons text[] := '{}'; v_req text;
  v_value jsonb;
  v_final jsonb;
BEGIN
  FOR d IN SELECT key AS dim, value::numeric AS w FROM jsonb_each_text(p_rules -> 'dimensions') ORDER BY key LOOP
    v_calc_w := 0; v_na_w := 0; v_all_w := 0; v_sum := 0;
    FOR i IN SELECT key AS code, value::numeric AS w FROM jsonb_each_text(p_rules -> 'indicators') WHERE left(key, 1) = d.dim LOOP
      v_all_w := v_all_w + i.w;
      v_value := p_values -> i.code;
      IF v_value ->> 'status' = 'calculado' THEN
        v_calc_w := v_calc_w + i.w;
        v_sum := v_sum + i.w * (v_value ->> 'value')::numeric;
      ELSIF v_value ->> 'status' = 'no_aplica' THEN
        v_na_w := v_na_w + i.w;
      END IF;
    END LOOP;
    IF v_calc_w > 0 AND v_all_w > 0 AND 100 * (v_calc_w + v_na_w) / v_all_w >= v_dim_min THEN
      v_dims := v_dims || jsonb_build_object(d.dim, jsonb_build_object(
        'value', round(v_sum / v_calc_w, 2), 'coverage', round(100 * (v_calc_w + v_na_w) / v_all_w, 1), 'weight', d.w));
      v_perf_sum := v_perf_sum + d.w * v_sum / v_calc_w;
      v_perf_w := v_perf_w + d.w;
      v_cov := v_cov + d.w * (v_calc_w + v_na_w) / v_all_w;
      v_with := v_with + 1;
    ELSE
      v_dims := v_dims || jsonb_build_object(d.dim, jsonb_build_object(
        'value', NULL, 'coverage', CASE WHEN v_all_w > 0 THEN round(100 * (v_calc_w + v_na_w) / v_all_w, 1) ELSE 0 END, 'weight', d.w));
    END IF;
  END LOOP;

  v_perf := CASE WHEN v_perf_w > 0 THEN round(v_perf_sum / v_perf_w, 1) END;

  FOR v_req IN SELECT jsonb_array_elements_text(coalesce(cov -> 'required', '[]'::jsonb)) LOOP
    IF v_dims #>> ARRAY[v_req, 'value'] IS NULL THEN
      v_reasons := v_reasons || ('Falta la dimensión ' || v_req);
    END IF;
  END LOOP;
  IF v_with < v_min_dims THEN v_reasons := v_reasons || ('Solo ' || v_with || ' de 5 dimensiones con nota (mínimo ' || v_min_dims || ')'); END IF;
  IF v_cov < v_total_min THEN v_reasons := v_reasons || ('Cobertura del ' || round(v_cov, 1) || ' % (mínimo ' || v_total_min || ' %)'); END IF;
  IF coalesce(p_sessions, 0) < v_min_sessions THEN v_reasons := v_reasons || ('Menos de ' || v_min_sessions || ' clases en el trimestre'); END IF;

  -- Sin información suficiente no hay nota final ni categoría (nunca se inventa una).
  -- La nota ponderada parcial se guarda solo para que administración vea por dónde va.
  v_final := kiru_private.perf_final(CASE WHEN cardinality(v_reasons) = 0 THEN v_perf END,
    coalesce((p_incidents ->> 'leve')::int, 0), coalesce((p_incidents ->> 'grave')::int, 0), coalesce((p_incidents ->> 'muy_grave')::int, 0), p_rules);

  RETURN jsonb_build_object(
    'dimensions', v_dims,
    'performance', v_perf,
    'coverage', round(v_cov, 1),
    'publishable', cardinality(v_reasons) = 0 AND v_perf IS NOT NULL,
    'reasons', to_jsonb(v_reasons),
    'incidents', coalesce(p_incidents, '{}'::jsonb)) || v_final;
END;
$$;

-- Cálculo de todos los mentores entre dos instantes (no guarda nada).
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
    v_values := kiru_private.perf_indicator_values(m.id, p_from, p_to, p_rules);
    -- Las incidencias llegan en la fase 5: de momento ninguna.
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'mentor_id', m.id, 'mentor_name', m.full_name, 'values', v_values,
      'score', kiru_private.perf_assemble(v_values, p_rules, '{"leve":0,"grave":0,"muy_grave":0}'::jsonb,
                 coalesce((v_values #>> '{B1,total}')::int, 0))));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.perf_rules_guard(), kiru_private.perf_events_append_only(),
  kiru_private.perf_quarter(date), kiru_private.perf_current_rules(),
  kiru_private.perf_indicator_values(uuid, timestamptz, timestamptz, jsonb),
  kiru_private.perf_final(numeric, int, int, int, jsonb), kiru_private.perf_assemble(jsonb, jsonb, jsonb, int),
  kiru_private.perf_compute(timestamptz, timestamptz, jsonb) FROM PUBLIC;

-- Recalcula el trimestre en curso y lo guarda. Lo llama la tarea nocturna o administración.
CREATE OR REPLACE FUNCTION public.kiru_perf_recompute()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  st public.kiru_perf_settings;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  q record;
  v_rules record;
  v_period uuid;
  v_from timestamptz; v_to timestamptz;
  v_rows jsonb;
  r jsonb;
  k text;
  v_count int := 0;
BEGIN
  -- Con usuario: solo administración. Sin usuario: la tarea nocturna (pg_cron) o el servidor.
  IF auth.uid() IS NOT NULL THEN
    IF NOT kiru_private.is_admin() THEN RAISE EXCEPTION 'Solo administración.' USING ERRCODE = '42501'; END IF;
  ELSIF NOT (coalesce(auth.jwt() ->> 'role', '') = 'service_role' OR session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'Solo administración.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO st FROM public.kiru_perf_settings WHERE id;
  IF v_today < st.data_from THEN
    RETURN jsonb_build_object('calculado', false, 'motivo', 'El sistema empieza a contar el ' || to_char(st.data_from, 'DD/MM/YYYY') || '.');
  END IF;
  SELECT * INTO v_rules FROM kiru_private.perf_current_rules();
  SELECT * INTO q FROM kiru_private.perf_quarter(v_today);

  INSERT INTO public.kiru_perf_periods (starts_on, ends_on, label, rule_version)
  VALUES (q.starts_on, q.ends_on, q.label, v_rules.version)
  ON CONFLICT (starts_on) DO NOTHING;
  SELECT id INTO v_period FROM public.kiru_perf_periods WHERE starts_on = q.starts_on;
  -- Los periodos anteriores que sigan abiertos quedan cerrados (ya no se recalculan).
  UPDATE public.kiru_perf_periods SET status = 'cerrado' WHERE status = 'abierto' AND starts_on < q.starts_on;

  -- Primer trimestre parcial: solo desde la entrada en vigor.
  v_from := (greatest(q.starts_on, st.data_from)::timestamp AT TIME ZONE 'Europe/Madrid');
  v_to := (q.ends_on::timestamp AT TIME ZONE 'Europe/Madrid');
  v_rows := kiru_private.perf_compute(v_from, v_to, (SELECT rules FROM public.kiru_perf_rule_versions WHERE version =
              (SELECT rule_version FROM public.kiru_perf_periods WHERE id = v_period)));

  FOR r IN SELECT * FROM jsonb_array_elements(v_rows) LOOP
    FOR k IN SELECT jsonb_object_keys(r -> 'values') LOOP
      INSERT INTO public.kiru_perf_values (period_id, mentor_id, indicator, status, value, ok, total, detail, computed_at)
      VALUES (v_period, (r ->> 'mentor_id')::uuid, k, r #>> ARRAY['values', k, 'status'],
              (r #>> ARRAY['values', k, 'value'])::numeric, coalesce((r #>> ARRAY['values', k, 'ok'])::int, 0),
              coalesce((r #>> ARRAY['values', k, 'total'])::int, 0), coalesce(r #> ARRAY['values', k, 'detail'], '{}'::jsonb), now())
      ON CONFLICT (period_id, mentor_id, indicator) DO UPDATE SET
        status = EXCLUDED.status, value = EXCLUDED.value, ok = EXCLUDED.ok, total = EXCLUDED.total,
        detail = EXCLUDED.detail, computed_at = EXCLUDED.computed_at;
    END LOOP;
    INSERT INTO public.kiru_perf_scores (period_id, mentor_id, rule_version, result, performance, coverage, final, category, publishable, computed_at)
    VALUES (v_period, (r ->> 'mentor_id')::uuid, (SELECT rule_version FROM public.kiru_perf_periods WHERE id = v_period), r -> 'score',
            (r #>> '{score,performance}')::numeric, coalesce((r #>> '{score,coverage}')::numeric, 0),
            (r #>> '{score,final}')::numeric, r #>> '{score,category}', coalesce((r #>> '{score,publishable}')::boolean, false), now())
    ON CONFLICT (period_id, mentor_id) DO UPDATE SET
      rule_version = EXCLUDED.rule_version, result = EXCLUDED.result, performance = EXCLUDED.performance,
      coverage = EXCLUDED.coverage, final = EXCLUDED.final, category = EXCLUDED.category,
      publishable = EXCLUDED.publishable, computed_at = EXCLUDED.computed_at;
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (kiru_private.active_uid(), 'recalculo', jsonb_build_object('periodo', q.label, 'mentores', v_count));
  RETURN jsonb_build_object('calculado', true, 'periodo', q.label, 'mentores', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_perf_recompute() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_perf_recompute() TO authenticated, service_role;

-- 8. Ensayo de administración: mismas reglas, fechas libres, no guarda nada ------------------
CREATE OR REPLACE FUNCTION public.kiru_perf_preview(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rules record;
BEGIN
  IF NOT kiru_private.is_admin() THEN RAISE EXCEPTION 'Solo administración.' USING ERRCODE = '42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'Elige una fecha de inicio anterior a la de fin.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_to - p_from > 190 THEN
    RAISE EXCEPTION 'El ensayo admite como mucho seis meses.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_rules FROM kiru_private.perf_current_rules();
  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to, 'rule_version', v_rules.version,
    'mentors', kiru_private.perf_compute((p_from::timestamp AT TIME ZONE 'Europe/Madrid'),
                                         ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Madrid'), v_rules.rules));
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_perf_preview(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_perf_preview(date, date) TO authenticated;

-- Ajustes: solo administración; queda en el historial.
CREATE OR REPLACE FUNCTION public.kiru_perf_update_settings(p_mode text, p_data_from date, p_official_from date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old public.kiru_perf_settings;
BEGIN
  IF NOT kiru_private.is_admin() THEN RAISE EXCEPTION 'Solo administración.' USING ERRCODE = '42501'; END IF;
  IF p_mode NOT IN ('oculto', 'aprendizaje', 'piloto', 'oficial') THEN
    RAISE EXCEPTION 'Modo no válido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_from IS NULL OR p_official_from IS NULL OR p_official_from < p_data_from THEN
    RAISE EXCEPTION 'La fecha oficial no puede ser anterior a la de entrada en vigor.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO old FROM public.kiru_perf_settings WHERE id;
  UPDATE public.kiru_perf_settings
  SET mode = p_mode, data_from = p_data_from, official_from = p_official_from,
      updated_by = kiru_private.active_uid(), updated_at = now()
  WHERE id;
  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (kiru_private.active_uid(), 'ajustes', jsonb_build_object(
    'antes', jsonb_build_object('modo', old.mode, 'desde', old.data_from, 'oficial', old.official_from),
    'despues', jsonb_build_object('modo', p_mode, 'desde', p_data_from, 'oficial', p_official_from)));
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_perf_update_settings(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_perf_update_settings(text, date, date) TO authenticated;

-- Todo lo que necesita la pantalla de administración en una sola llamada.
CREATE OR REPLACE FUNCTION public.kiru_perf_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period public.kiru_perf_periods;
BEGIN
  IF NOT kiru_private.is_admin() THEN RAISE EXCEPTION 'Solo administración.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_period FROM public.kiru_perf_periods ORDER BY starts_on DESC LIMIT 1;
  RETURN jsonb_build_object(
    'settings', (SELECT to_jsonb(s) - 'id' FROM public.kiru_perf_settings s WHERE s.id),
    'rules', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.version DESC) FROM public.kiru_perf_rule_versions r),
    'indicators', (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.dimension, i.position) FROM public.kiru_perf_indicators i),
    'period', to_jsonb(v_period),
    'mentors', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'mentor_id', sc.mentor_id, 'mentor_name', p.full_name, 'score', sc.result, 'computed_at', sc.computed_at,
        'values', (SELECT jsonb_object_agg(v.indicator, jsonb_build_object('status', v.status, 'value', v.value, 'ok', v.ok, 'total', v.total, 'detail', v.detail))
                   FROM public.kiru_perf_values v WHERE v.period_id = sc.period_id AND v.mentor_id = sc.mentor_id))
        ORDER BY p.full_name)
      FROM public.kiru_perf_scores sc JOIN public.profiles p ON p.id = sc.mentor_id
      WHERE sc.period_id = v_period.id), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC)
      FROM (SELECT * FROM public.kiru_perf_events ORDER BY created_at DESC LIMIT 20) e), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_perf_admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_perf_admin_overview() TO authenticated;

-- Tarea nocturna ---------------------------------------------------------------------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiru_desempeno_diaria';
      -- 04:15 UTC (05:15 o 06:15 en Madrid), después de la tarea de clases.
      PERFORM cron.schedule('kiru_desempeno_diaria', '15 4 * * *', 'SELECT public.kiru_perf_recompute()');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'pg_cron no disponible (%); se puede recalcular desde el panel de administración.', SQLERRM;
    END;
  END IF;
END
$cron$;
