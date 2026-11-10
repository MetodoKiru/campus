-- Periodos especiales (Navidad, Semana Santa y los que añada administración).
-- · Los periodos se configuran desde /admin (fechas, país o región, plazos y zonas),
--   nunca en el código: así sirven para cualquier año y cualquier país.
-- · Las familias dicen en su panel qué clases quieren y si aceptan sustituto.
-- · Los mentores dicen qué clases de sus alumnos pueden dar y si quieren sustituir.
-- · Coordinación y administración cruzan las respuestas (plan por alumno) y
--   administración aprueba el plan y el importe. La renovación de la hoja no
--   lleva precio hasta que el plan está aprobado (lo consulta el script).
-- · No se tocan el matching ordinario, student_mentors, el horario semanal,
--   las clases con fecha ni los pagos. Todo queda en el historial.
-- Solo se lee y escribe desde el servidor (service role) con comprobación de rol.

CREATE TABLE IF NOT EXISTS public.kiru_special_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  kind text NOT NULL DEFAULT 'otro' CHECK (kind IN ('navidad', 'semana_santa', 'verano', 'otro')),
  country text NOT NULL DEFAULT 'ES' CHECK (length(country) BETWEEN 2 AND 40),
  region text NOT NULL DEFAULT '' CHECK (length(region) <= 80),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  form_opens_on date NOT NULL,
  deadline_on date NOT NULL,
  exceptions_until date NOT NULL,
  closes_on date NOT NULL,
  zones text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiru_special_periods_dates CHECK (
    ends_on >= starts_on AND form_opens_on <= deadline_on AND deadline_on <= exceptions_until
    AND exceptions_until <= closes_on AND closes_on <= ends_on)
);

-- Respuesta de la familia, una por alumno y periodo (se puede cambiar hasta el cierre).
-- choices: [{"date": "2026-12-22", "start": "17:00", "end": "18:00", "wants": true}]
CREATE TABLE IF NOT EXISTS public.kiru_special_period_family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.kiru_special_periods(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  choices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(choices) = 'array'),
  accepts_substitute boolean NOT NULL DEFAULT true,
  extra_sessions smallint NOT NULL DEFAULT 0 CHECK (extra_sessions BETWEEN 0 AND 20),
  comments text NOT NULL DEFAULT '' CHECK (length(comments) <= 2000),
  late boolean NOT NULL DEFAULT false,
  answered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, student_id)
);

-- Disponibilidad de un mentor (con cuenta) o de un sustituto sin cuenta (lo apunta admin).
-- own_classes: [{"student_id": "…", "date": "…", "start": "17:00", "can": true}]
-- slots: [{"date": "2026-12-22", "manana": true, "tarde": false}] (para sustituir)
CREATE TABLE IF NOT EXISTS public.kiru_special_period_mentors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.kiru_special_periods(id) ON DELETE CASCADE,
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  external_name text NOT NULL DEFAULT '' CHECK (length(external_name) <= 120),
  external_email text NOT NULL DEFAULT '' CHECK (length(external_email) <= 254),
  own_classes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(own_classes) = 'array'),
  wants_to_substitute boolean NOT NULL DEFAULT false,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(slots) = 'array'),
  zones text[] NOT NULL DEFAULT '{}',
  max_sessions smallint NOT NULL DEFAULT 0 CHECK (max_sessions BETWEEN 0 AND 60),
  comments text NOT NULL DEFAULT '' CHECK (length(comments) <= 2000),
  answered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiru_special_period_mentors_who CHECK (mentor_id IS NOT NULL OR length(external_name) >= 2)
);
CREATE UNIQUE INDEX IF NOT EXISTS kiru_special_period_mentors_one
  ON public.kiru_special_period_mentors (period_id, mentor_id) WHERE mentor_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kiru_special_period_mentors_one_external
  ON public.kiru_special_period_mentors (period_id, lower(external_email)) WHERE mentor_id IS NULL AND external_email <> '';

-- Plan del alumno en el periodo: quién da cada clase y el importe aprobado.
-- assignments: [{"date": "…", "start": "17:00", "end": "18:00", "who": "habitual" | "sustituto" | "sin_cobertura" | "no_quiere",
--                "substitute_id": "<id de kiru_special_period_mentors>"}]
-- amounts: [{"period_start": "2026-12-19", "period_end": "2027-01-19", "amount": 194.44, "suggested": 194.44}]
--          (una línea por mensualidad afectada; sin líneas = el importe no cambia)
CREATE TABLE IF NOT EXISTS public.kiru_special_period_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.kiru_special_periods(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assignments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assignments) = 'array'),
  amounts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(amounts) = 'array'),
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'propuesto', 'aprobado')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  revision int NOT NULL DEFAULT 1,
  proposed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposed_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, student_id)
);

-- Historial: quién hizo qué y cuándo. Nunca se borra.
CREATE TABLE IF NOT EXISTS public.kiru_special_period_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid REFERENCES public.kiru_special_periods(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 2 AND 60),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_special_period_log_period ON public.kiru_special_period_log (period_id, created_at DESC);

ALTER TABLE public.kiru_special_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_special_period_family ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_special_period_mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_special_period_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_special_period_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_special_periods, public.kiru_special_period_family, public.kiru_special_period_mentors,
  public.kiru_special_period_plans, public.kiru_special_period_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.kiru_special_periods, public.kiru_special_period_family, public.kiru_special_period_mentors,
  public.kiru_special_period_plans, public.kiru_special_period_log TO service_role;

-- Avisos (campanita + correo con el script de avisos de siempre).
ALTER TABLE public.kiru_notifications DROP CONSTRAINT IF EXISTS kiru_notifications_kind_check;
ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check
  CHECK (kind IN ('objetivo_pendiente', 'objetivo_aprobado', 'objetivo_rechazado', 'canje_solicitado',
                  'canje_completado', 'canje_aplazado', 'renovacion', 'informe_progreso',
                  'clase_solicitud', 'clase_decision', 'clase_mas_info', 'recuperacion_propuesta',
                  'recuperacion_confirmada', 'recuperacion_sin_encaje', 'recuperacion_nueva',
                  'recuperacion_sin_avanzar', 'recuperacion_recordatorio', 'recuperacion_fin_periodo',
                  'registro_aviso', 'clase_incidencia',
                  'justificacion_solicitada', 'justificacion_respondida', 'justificacion_repregunta',
                  'justificacion_cerrada', 'justificacion_recordatorio', 'justificacion_por_valorar',
                  'aviso_metodologico', 'aviso_seguimiento',
                  'periodo_especial'));

-- Periodos de partida (se cambian desde /admin). Solo si todavía no hay ninguno.
INSERT INTO public.kiru_special_periods (name, kind, country, region, starts_on, ends_on, form_opens_on, deadline_on, exceptions_until, closes_on, zones, notes)
SELECT v.* FROM (VALUES
  ('Navidad 2026', 'navidad', 'ES', 'Madrid', date '2026-12-22', date '2027-01-07', date '2026-11-15', date '2026-12-05', date '2026-12-10', date '2026-12-11',
   ARRAY['Pozuelo','Somosaguas','Aravaca','Valdemarín','Las Rozas','Majadahonda','Boadilla','Madrid centro','Chamberí/Moncloa','Nuevos Ministerios/Chamartín','Retiro'],
   'Decidido por Sofía el 10/11/2026.'),
  ('Semana Santa 2027', 'semana_santa', 'ES', 'Madrid', date '2027-03-19', date '2027-03-29', date '2027-02-15', date '2027-03-01', date '2027-03-05', date '2027-03-08',
   ARRAY['Pozuelo','Somosaguas','Aravaca','Valdemarín','Las Rozas','Majadahonda','Boadilla','Madrid centro','Chamberí/Moncloa','Nuevos Ministerios/Chamartín','Retiro'],
   'Del viernes anterior al Domingo de Ramos al Lunes de Pascua. Revisar con el calendario escolar.')
) AS v(name, kind, country, region, starts_on, ends_on, form_opens_on, deadline_on, exceptions_until, closes_on, zones, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.kiru_special_periods);
