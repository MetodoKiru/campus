-- Incorporación de familias en el campus (pedido por Sofía el 15/11/2026).
--
-- Cuando una familia entra por primera vez ve 3 pasos, uno detrás de otro:
--   1. Disponibilidad para la llamada semanal (Jotform «Disponibilidad para llamadas · Familias»).
--   2. Evaluación inicial de su hijo/a (se repite cada 3 meses).
--   3. Información extra, voluntaria: contactos del colegio, psicólogo… y archivos
--      (Jotform «Información extra de vuestro hijo/a · Método Kiru»).
--
-- Aquí solo se guarda lo del paso 3: un código por alumno (va oculto en el enlace del
-- formulario, campo «kiru_familia») y cada respuesta que llega por el webhook. Los pasos 1 y 2
-- se leen de sus propias tablas. Todo se lee y escribe desde el servidor (service role).

-- 1. Ajustes ----------------------------------------------------------------------------------
INSERT INTO public.kiru_settings (key, value) VALUES
  ('incorporacion_familias', jsonb_build_object(
    'form_info', 'https://form.jotform.com/263185065994065',
    'campo_codigo', 'kiru_familia'))
ON CONFLICT (key) DO NOTHING;

-- 2. Un registro por alumno: su código y si la familia ha dicho «no tenemos nada que añadir» -----
CREATE TABLE IF NOT EXISTS public.kiru_family_onboarding (
  student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  info_skipped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.kiru_family_onboarding IS
  'Incorporación de familias: código del formulario de información extra (paso 3) y si lo han saltado.';

-- 3. Respuestas del formulario de información extra -------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_family_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Vacío si no se pudo reconocer al alumno (se enlaza a mano).
  student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_name text NOT NULL DEFAULT '' CHECK (length(student_name) <= 200),
  email text NOT NULL DEFAULT '' CHECK (length(email) <= 200),
  -- Enlaces de Jotform a los archivos subidos (solo se abren con sesión de Jotform).
  files jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(files) = 'array' AND pg_column_size(files) < 20000),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) < 60000),
  submission_id text UNIQUE CHECK (submission_id IS NULL OR length(submission_id) <= 64),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_family_info_student_idx ON public.kiru_family_info (student_id, received_at DESC);
COMMENT ON TABLE public.kiru_family_info IS
  'Información extra de la familia (contactos del colegio, psicólogo… y archivos). Llega del webhook de Jotform.';

ALTER TABLE public.kiru_family_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_family_info ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_family_onboarding, public.kiru_family_info FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.kiru_family_onboarding, public.kiru_family_info TO service_role;

-- 4. Aviso al coordinador cuando llega información nueva ---------------------------------------
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
  'llamada_familia',
  'informacion_familia'
));
