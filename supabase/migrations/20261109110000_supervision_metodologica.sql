-- Supervisión metodológica de SkillCoins (diseño aprobado por Sofía el 09/11/2026).
--
-- Qué añade, sin tocar nada de lo que ya existe:
--   * Solicitudes de justificación de una nota concreta (alumno + semana +
--     competencia) con sus respuestas, repreguntas y adjuntos.
--   * Avisos metodológicos por mentor, con nivel progresivo (1º, 2º, 3º) según
--     los avisos de la misma competencia en los últimos 6 meses.
--   * Historial de auditoría: cada paso queda apuntado y nunca se edita.
--   * Avisos en la campanita y por correo (cola kiru_notifications, que ya
--     manda el Apps Script de avisos), sin duplicados.
--
-- Lo que NO hace: no cambia kiru_session_logs, ni las SkillCoins, ni la tienda.
-- Si alguna vez hay que corregir una nota, lo hace administración con
-- kiru_sc_review_correct, que usa la tabla de correcciones de siempre y deja
-- enlazada la revisión.

-- 0. Ajustes ---------------------------------------------------------------------
INSERT INTO public.kiru_settings (key, value) VALUES
  ('avisos_metodologicos_vigencia_meses', '6'::jsonb),
  ('justificacion_dias_recordatorio_mentor', '3'::jsonb),
  ('justificacion_dias_recordatorio_coordinador', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 1. Qué registro de sesión da la nota de cada semana -----------------------------
-- Misma lectura y misma regla que kiru_private.skillcoin_weeks (vale el registro
-- completo más reciente de la semana), pero devolviendo también el registro y el
-- mentor. skillcoin_weeks no se toca: las pruebas comprueban que coinciden.
CREATE OR REPLACE FUNCTION kiru_private.skillcoin_week_logs(student uuid)
RETURNS TABLE (week date, log_id uuid, mentor_id uuid, submitted_at timestamptz,
               estudios integer, compromiso integer, organizacion integer, bienestar integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH scores AS (
    SELECT l.id, l.mentor_id, l.submitted_at,
           date_trunc('week', coalesce(l.session_date::timestamp, l.submitted_at AT TIME ZONE 'Europe/Madrid'))::date AS week,
           s.category, s.value, s.ord
    FROM public.kiru_session_logs l
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN x.q ~ 'estudios|aprendizaje|tecnicas de estudio' THEN 'estudios'
               WHEN x.q ~ 'compromiso|puntualidad|responsabilidad' THEN 'compromiso'
               WHEN x.q ~ 'organizacion|planificacion|agenda' THEN 'organizacion'
               WHEN x.q ~ 'bienestar|confianza|calma|estado de animo|emocional' THEN 'bienestar'
             END AS category,
             x.m[1]::integer AS value,
             x.ord
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.answers) = 'array' THEN l.answers ELSE '[]'::jsonb END)
           WITH ORDINALITY AS e(item, ord)
      CROSS JOIN LATERAL (
        SELECT lower(translate(coalesce(e.item ->> 'q', ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) AS q,
               regexp_match(replace(trim(coalesce(e.item ->> 'a', '')), ',', '.'), '^\s*(10|[0-9])\s*(?:/\s*10|sc)?\s*$', 'i') AS m,
               e.ord
      ) x
      WHERE x.m IS NOT NULL
    ) s
    WHERE l.student_id = student AND s.category IS NOT NULL
  ),
  per_log AS (
    SELECT id, mentor_id, submitted_at, week,
           (array_agg(value ORDER BY ord DESC) FILTER (WHERE category = 'estudios'))[1] AS estudios,
           (array_agg(value ORDER BY ord DESC) FILTER (WHERE category = 'compromiso'))[1] AS compromiso,
           (array_agg(value ORDER BY ord DESC) FILTER (WHERE category = 'organizacion'))[1] AS organizacion,
           (array_agg(value ORDER BY ord DESC) FILTER (WHERE category = 'bienestar'))[1] AS bienestar
    FROM scores
    GROUP BY id, mentor_id, submitted_at, week
  )
  SELECT DISTINCT ON (week) week, id, mentor_id, submitted_at, estudios, compromiso, organizacion, bienestar
  FROM per_log
  WHERE estudios IS NOT NULL AND compromiso IS NOT NULL AND organizacion IS NOT NULL AND bienestar IS NOT NULL
  ORDER BY week, submitted_at DESC
$$;
REVOKE ALL ON FUNCTION kiru_private.skillcoin_week_logs(uuid) FROM PUBLIC;

-- Quién supervisa a un mentor: su coordinador o administración.
CREATE OR REPLACE FUNCTION kiru_private.supervises_mentor(p_mentor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.is_admin() OR kiru_private.coordinates_mentor(p_mentor)
$$;
REVOKE ALL ON FUNCTION kiru_private.supervises_mentor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.supervises_mentor(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION kiru_private.competencia_label(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p WHEN 'estudios' THEN 'Estudios' WHEN 'compromiso' THEN 'Compromiso'
                WHEN 'organizacion' THEN 'Organización' WHEN 'bienestar' THEN 'Bienestar' ELSE 'General' END
$$;
REVOKE ALL ON FUNCTION kiru_private.competencia_label(text) FROM PUBLIC;

-- 2. Solicitudes de justificación --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_skillcoin_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Mentor que puso la nota (el del registro de sesión).
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Registro de sesión de donde sale la nota. Si algún día se borrara, la revisión sigue.
  session_log_id uuid REFERENCES public.kiru_session_logs(id) ON DELETE SET NULL,
  week date NOT NULL CHECK (extract(isodow FROM week) = 1),
  competencia text NOT NULL CHECK (competencia IN ('estudios', 'compromiso', 'organizacion', 'bienestar')),
  -- La nota tal como estaba al pedir la revisión (y las 4 de esa semana, como contexto).
  score_snapshot smallint NOT NULL CHECK (score_snapshot BETWEEN 0 AND 10),
  week_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_role text NOT NULL CHECK (requested_role IN ('coordinador', 'admin')),
  reason_code text NOT NULL DEFAULT 'otro'
    CHECK (reason_code IN ('maximo_repetido', 'sin_variacion', 'posible_contradiccion', 'maximo_sin_evolucion', 'otro')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  question text NOT NULL CHECK (length(trim(question)) BETWEEN 1 AND 2000),
  -- Plazo opcional para responder.
  due_date date,
  status text NOT NULL DEFAULT 'pendiente_respuesta'
    CHECK (status IN ('pendiente_respuesta', 'respondida', 'pendiente_valoracion', 'cerrada')),
  status_since timestamptz NOT NULL DEFAULT now(),
  -- Vuelta de pregunta-respuesta (sube con cada repregunta).
  round integer NOT NULL DEFAULT 1 CHECK (round >= 1),
  answered_at timestamptz,
  assessment_started_at timestamptz,
  assessment_started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution text CHECK (resolution IN ('adecuada', 'insuficiente', 'necesita_formacion', 'retirada')),
  resolution_note text NOT NULL DEFAULT '' CHECK (length(resolution_note) <= 2000),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'cerrada') = (resolution IS NOT NULL)),
  CHECK ((status = 'cerrada') = (resolved_at IS NOT NULL))
);
-- Una sola revisión abierta por nota.
CREATE UNIQUE INDEX IF NOT EXISTS kiru_skillcoin_reviews_open_uidx
  ON public.kiru_skillcoin_reviews (student_id, week, competencia) WHERE status <> 'cerrada';
CREATE INDEX IF NOT EXISTS kiru_skillcoin_reviews_mentor_idx ON public.kiru_skillcoin_reviews (mentor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_reviews_student_idx ON public.kiru_skillcoin_reviews (student_id, week);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_reviews_status_idx ON public.kiru_skillcoin_reviews (status, status_since);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_reviews_log_idx ON public.kiru_skillcoin_reviews (session_log_id);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_reviews_requested_by_idx ON public.kiru_skillcoin_reviews (requested_by);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_reviews_resolved_by_idx ON public.kiru_skillcoin_reviews (resolved_by);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_reviews_assessment_by_idx ON public.kiru_skillcoin_reviews (assessment_started_by);
COMMENT ON TABLE public.kiru_skillcoin_reviews IS
  'Solicitudes de justificación de una nota de SkillCoins. Nunca cambian la nota. Solo se escriben con las funciones kiru_*_sc_review*; no se borran.';

DROP TRIGGER IF EXISTS kiru_skillcoin_reviews_touch ON public.kiru_skillcoin_reviews;
CREATE TRIGGER kiru_skillcoin_reviews_touch
BEFORE UPDATE ON public.kiru_skillcoin_reviews
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

-- 3. Mensajes (respuestas y repreguntas): solo se añaden ---------------------------
CREATE TABLE IF NOT EXISTS public.kiru_skillcoin_review_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.kiru_skillcoin_reviews(id) ON DELETE RESTRICT,
  round integer NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_role text NOT NULL CHECK (author_role IN ('mentor', 'coordinador', 'admin')),
  kind text NOT NULL CHECK (kind IN ('respuesta', 'repregunta')),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  -- Criterio que usó el mentor para poner la nota (solo en respuestas).
  criteria text NOT NULL DEFAULT '' CHECK (length(criteria) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_review_messages_review_idx ON public.kiru_skillcoin_review_messages (review_id, created_at);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_review_messages_author_idx ON public.kiru_skillcoin_review_messages (author_id);
COMMENT ON TABLE public.kiru_skillcoin_review_messages IS 'Respuestas del mentor y repreguntas de coordinación. No se editan ni se borran.';

-- 4. Adjuntos (evidencias): solo se añaden ------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_skillcoin_review_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.kiru_skillcoin_reviews(id) ON DELETE RESTRICT,
  message_id uuid NOT NULL REFERENCES public.kiru_skillcoin_review_messages(id) ON DELETE RESTRICT,
  -- Ruta en el almacén privado kiru-evidencias: {review_id}/{message_id}/{nombre}
  storage_path text NOT NULL UNIQUE CHECK (length(storage_path) <= 400),
  file_name text NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_review_files_review_idx ON public.kiru_skillcoin_review_files (review_id);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_review_files_message_idx ON public.kiru_skillcoin_review_files (message_id);
CREATE INDEX IF NOT EXISTS kiru_skillcoin_review_files_uploaded_by_idx ON public.kiru_skillcoin_review_files (uploaded_by);
COMMENT ON TABLE public.kiru_skillcoin_review_files IS
  'Evidencias adjuntas (fotos del cuaderno, ejercicios, PDF). Datos de menores: solo las ven el mentor, su coordinador y administración.';

-- 5. Avisos metodológicos -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_methodology_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  review_id uuid REFERENCES public.kiru_skillcoin_reviews(id) ON DELETE RESTRICT,
  competencia text NOT NULL CHECK (competencia IN ('estudios', 'compromiso', 'organizacion', 'bienestar', 'general')),
  -- B = evidencias insuficientes; C = no sabe aplicar el criterio; manual = registrado a mano.
  origin text NOT NULL CHECK (origin IN ('insuficiente', 'necesita_formacion', 'manual')),
  -- Nivel según los avisos de la misma competencia en los últimos 6 meses (vigencia).
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 3),
  -- Avisos que contaban al crearlo (para que se pueda ver por qué tiene ese nivel).
  counted_warning_ids uuid[] NOT NULL DEFAULT '{}',
  criterion text NOT NULL CHECK (length(trim(criterion)) BETWEEN 1 AND 2000),
  expected_improvements text NOT NULL DEFAULT '' CHECK (length(expected_improvements) <= 2000),
  manual_reference text NOT NULL DEFAULT '' CHECK (length(manual_reference) <= 500),
  recommended_action text NOT NULL DEFAULT '' CHECK (length(recommended_action) <= 1000),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_revision', 'resuelto')),
  -- 2º aviso: reunión breve con coordinación.
  meeting_at timestamptz,
  meeting_done_at timestamptz,
  meeting_note text NOT NULL DEFAULT '' CHECK (length(meeting_note) <= 2000),
  -- 3er aviso: revisión metodológica obligatoria.
  assessment_kind text CHECK (assessment_kind IN ('prueba_conocimientos', 'evaluacion_practica')),
  assessment_requested_at timestamptz,
  assessment_result text NOT NULL DEFAULT '' CHECK (length(assessment_result) <= 2000),
  reinforcement_measures text NOT NULL DEFAULT '' CHECK (length(reinforcement_measures) <= 2000),
  assessment_recorded_at timestamptz,
  -- Cuándo se ha visto mejora.
  improvement_at timestamptz,
  improvement_note text NOT NULL DEFAULT '' CHECK (length(improvement_note) <= 2000),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note text NOT NULL DEFAULT '' CHECK (length(resolution_note) <= 2000),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'resuelto') = (resolved_at IS NOT NULL))
);
-- Una revisión genera como mucho un aviso.
CREATE UNIQUE INDEX IF NOT EXISTS kiru_methodology_warnings_review_uidx ON public.kiru_methodology_warnings (review_id) WHERE review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS kiru_methodology_warnings_mentor_idx ON public.kiru_methodology_warnings (mentor_id, competencia, created_at DESC);
CREATE INDEX IF NOT EXISTS kiru_methodology_warnings_created_by_idx ON public.kiru_methodology_warnings (created_by);
CREATE INDEX IF NOT EXISTS kiru_methodology_warnings_resolved_by_idx ON public.kiru_methodology_warnings (resolved_by);
COMMENT ON TABLE public.kiru_methodology_warnings IS
  'Avisos metodológicos por mentor. No conllevan sanciones automáticas. No se borran: los que tienen más de 6 meses dejan de contar para el nivel pero siguen en el historial.';

DROP TRIGGER IF EXISTS kiru_methodology_warnings_touch ON public.kiru_methodology_warnings;
CREATE TRIGGER kiru_methodology_warnings_touch
BEFORE UPDATE ON public.kiru_methodology_warnings
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

-- 6. Historial de auditoría -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_supervision_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid REFERENCES public.kiru_skillcoin_reviews(id) ON DELETE RESTRICT,
  warning_id uuid REFERENCES public.kiru_methodology_warnings(id) ON DELETE RESTRICT,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 60),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (review_id IS NOT NULL OR warning_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS kiru_supervision_events_review_idx ON public.kiru_supervision_events (review_id, created_at);
CREATE INDEX IF NOT EXISTS kiru_supervision_events_warning_idx ON public.kiru_supervision_events (warning_id, created_at);
CREATE INDEX IF NOT EXISTS kiru_supervision_events_mentor_idx ON public.kiru_supervision_events (mentor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kiru_supervision_events_actor_idx ON public.kiru_supervision_events (actor_id);
COMMENT ON TABLE public.kiru_supervision_events IS 'Historial de supervisión: quién hizo qué y cuándo. No se edita ni se borra.';

-- Mensajes, adjuntos e historial no se modifican ni se borran nunca; revisiones y
-- avisos no se borran (sus cambios quedan en el historial).
CREATE OR REPLACE FUNCTION kiru_private.supervision_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'El historial de supervisión no se puede modificar ni borrar.' USING ERRCODE = '42501';
END
$$;
REVOKE ALL ON FUNCTION kiru_private.supervision_append_only() FROM PUBLIC;
DROP TRIGGER IF EXISTS kiru_skillcoin_review_messages_append_only ON public.kiru_skillcoin_review_messages;
CREATE TRIGGER kiru_skillcoin_review_messages_append_only BEFORE UPDATE OR DELETE ON public.kiru_skillcoin_review_messages
FOR EACH ROW EXECUTE FUNCTION kiru_private.supervision_append_only();
DROP TRIGGER IF EXISTS kiru_skillcoin_review_files_append_only ON public.kiru_skillcoin_review_files;
CREATE TRIGGER kiru_skillcoin_review_files_append_only BEFORE UPDATE OR DELETE ON public.kiru_skillcoin_review_files
FOR EACH ROW EXECUTE FUNCTION kiru_private.supervision_append_only();
DROP TRIGGER IF EXISTS kiru_supervision_events_append_only ON public.kiru_supervision_events;
CREATE TRIGGER kiru_supervision_events_append_only BEFORE UPDATE OR DELETE ON public.kiru_supervision_events
FOR EACH ROW EXECUTE FUNCTION kiru_private.supervision_append_only();
DROP TRIGGER IF EXISTS kiru_skillcoin_reviews_no_delete ON public.kiru_skillcoin_reviews;
CREATE TRIGGER kiru_skillcoin_reviews_no_delete BEFORE DELETE ON public.kiru_skillcoin_reviews
FOR EACH ROW EXECUTE FUNCTION kiru_private.supervision_append_only();
DROP TRIGGER IF EXISTS kiru_methodology_warnings_no_delete ON public.kiru_methodology_warnings;
CREATE TRIGGER kiru_methodology_warnings_no_delete BEFORE DELETE ON public.kiru_methodology_warnings
FOR EACH ROW EXECUTE FUNCTION kiru_private.supervision_append_only();

-- 7. Correcciones enlazadas a una revisión (columna nueva, opcional) ---------------
ALTER TABLE public.kiru_skillcoin_corrections
  ADD COLUMN IF NOT EXISTS review_id uuid REFERENCES public.kiru_skillcoin_reviews(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS kiru_skillcoin_corrections_review_idx ON public.kiru_skillcoin_corrections (review_id);

-- 8. Avisos: tipos nuevos y enlaces -----------------------------------------------------
ALTER TABLE public.kiru_notifications
  ADD COLUMN IF NOT EXISTS review_id uuid REFERENCES public.kiru_skillcoin_reviews(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS warning_id uuid REFERENCES public.kiru_methodology_warnings(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS kiru_notifications_review_idx ON public.kiru_notifications (review_id);
CREATE INDEX IF NOT EXISTS kiru_notifications_warning_idx ON public.kiru_notifications (warning_id);
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
                  'aviso_metodologico', 'aviso_seguimiento'));

-- 9. Permisos de lectura (escribir: solo con las funciones) -----------------------------
ALTER TABLE public.kiru_skillcoin_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_skillcoin_review_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_skillcoin_review_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_methodology_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_supervision_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_skillcoin_reviews, public.kiru_skillcoin_review_messages, public.kiru_skillcoin_review_files,
  public.kiru_methodology_warnings, public.kiru_supervision_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_skillcoin_reviews, public.kiru_skillcoin_review_messages, public.kiru_skillcoin_review_files,
  public.kiru_methodology_warnings, public.kiru_supervision_events TO authenticated;

CREATE OR REPLACE FUNCTION kiru_private.can_see_review(p_review uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kiru_skillcoin_reviews r
    WHERE r.id = p_review
      AND (r.mentor_id = kiru_private.active_uid() OR kiru_private.supervises_mentor(r.mentor_id))
  )
$$;
REVOKE ALL ON FUNCTION kiru_private.can_see_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_see_review(uuid) TO authenticated;

DROP POLICY IF EXISTS kiru_skillcoin_reviews_read ON public.kiru_skillcoin_reviews;
CREATE POLICY kiru_skillcoin_reviews_read ON public.kiru_skillcoin_reviews
FOR SELECT TO authenticated
USING (mentor_id = (SELECT kiru_private.active_uid()) OR (SELECT kiru_private.is_admin()) OR kiru_private.coordinates_mentor(mentor_id));
DROP POLICY IF EXISTS kiru_skillcoin_review_messages_read ON public.kiru_skillcoin_review_messages;
CREATE POLICY kiru_skillcoin_review_messages_read ON public.kiru_skillcoin_review_messages
FOR SELECT TO authenticated USING (kiru_private.can_see_review(review_id));
DROP POLICY IF EXISTS kiru_skillcoin_review_files_read ON public.kiru_skillcoin_review_files;
CREATE POLICY kiru_skillcoin_review_files_read ON public.kiru_skillcoin_review_files
FOR SELECT TO authenticated USING (kiru_private.can_see_review(review_id));
DROP POLICY IF EXISTS kiru_methodology_warnings_read ON public.kiru_methodology_warnings;
CREATE POLICY kiru_methodology_warnings_read ON public.kiru_methodology_warnings
FOR SELECT TO authenticated
USING (mentor_id = (SELECT kiru_private.active_uid()) OR (SELECT kiru_private.is_admin()) OR kiru_private.coordinates_mentor(mentor_id));
-- El historial completo es de coordinación y administración.
DROP POLICY IF EXISTS kiru_supervision_events_read ON public.kiru_supervision_events;
CREATE POLICY kiru_supervision_events_read ON public.kiru_supervision_events
FOR SELECT TO authenticated
USING ((SELECT kiru_private.is_admin()) OR kiru_private.coordinates_mentor(mentor_id));

-- 10. Almacén privado de evidencias ------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kiru-evidencias', 'kiru-evidencias', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

-- Subir: solo el autor del mensaje, dentro de su carpeta {review}/{mensaje}/ y
-- mientras la revisión no esté cerrada. Nadie cambia ni borra (solo el servidor).
CREATE OR REPLACE FUNCTION kiru_private.can_upload_evidence(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kiru_skillcoin_review_messages m
    JOIN public.kiru_skillcoin_reviews r ON r.id = m.review_id
    WHERE r.status <> 'cerrada'
      AND m.author_id = kiru_private.active_uid()
      AND m.created_at > now() - interval '1 day'
      AND split_part(p_name, '/', 1) = r.id::text
      AND split_part(p_name, '/', 2) = m.id::text
      AND split_part(p_name, '/', 3) <> ''
      AND split_part(p_name, '/', 4) = ''
  )
$$;
REVOKE ALL ON FUNCTION kiru_private.can_upload_evidence(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_upload_evidence(text) TO authenticated;

CREATE OR REPLACE FUNCTION kiru_private.can_read_evidence(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN kiru_private.can_see_review(split_part(p_name, '/', 1)::uuid) ELSE false END
$$;
REVOKE ALL ON FUNCTION kiru_private.can_read_evidence(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_read_evidence(text) TO authenticated;

DROP POLICY IF EXISTS "Kiru evidencias upload" ON storage.objects;
CREATE POLICY "Kiru evidencias upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'kiru-evidencias' AND kiru_private.can_upload_evidence(name));
DROP POLICY IF EXISTS "Kiru evidencias read" ON storage.objects;
CREATE POLICY "Kiru evidencias read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'kiru-evidencias' AND kiru_private.can_read_evidence(name));

-- 11. Utilidades internas ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION kiru_private.supervision_event(p_review uuid, p_warning uuid, p_mentor uuid, p_action text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.kiru_supervision_events (review_id, warning_id, mentor_id, actor_id, action, detail)
  VALUES (p_review, p_warning, p_mentor, kiru_private.active_uid(), p_action, coalesce(p_detail, '{}'::jsonb))
$$;
REVOKE ALL ON FUNCTION kiru_private.supervision_event(uuid, uuid, uuid, text, jsonb) FROM PUBLIC;

-- Aviso en la campanita. Con p_email, también por correo (lo manda el Apps Script
-- de avisos, que ya está instalado). La clave event_key evita duplicados.
CREATE OR REPLACE FUNCTION kiru_private.supervision_notify(
  p_recipient uuid, p_student uuid, p_review uuid, p_warning uuid,
  p_kind text, p_title text, p_body text, p_event_key text, p_email boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.kiru_notifications (recipient_id, student_id, review_id, warning_id, kind, title, body, event_key, email_status)
  SELECT p_recipient, p_student, p_review, p_warning, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 1000),
         left(p_event_key, 200), CASE WHEN p_email THEN 'pendiente' ELSE 'no_aplica' END
  WHERE p_recipient IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_recipient AND p.is_active)
  ON CONFLICT (recipient_id, event_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION kiru_private.supervision_notify(uuid, uuid, uuid, uuid, text, text, text, text, boolean) FROM PUBLIC;

-- Nombre de pila (los correos llevan lo mínimo del alumno).
CREATE OR REPLACE FUNCTION kiru_private.first_name(p uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(nullif(split_part(trim(full_name), ' ', 1), ''), 'el alumno') FROM public.profiles WHERE id = p
$$;
REVOKE ALL ON FUNCTION kiru_private.first_name(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.week_label(p date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 'semana del ' || to_char(p, 'DD/MM/YYYY')
$$;
REVOKE ALL ON FUNCTION kiru_private.week_label(date) FROM PUBLIC;

-- Destinatarios en coordinación de una revisión: quien la pidió si sigue
-- pudiendo verla; si no, el coordinador actual del mentor o administración.
CREATE OR REPLACE FUNCTION kiru_private.review_supervisors(p_review uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH r AS (SELECT * FROM public.kiru_skillcoin_reviews WHERE id = p_review),
  requester AS (
    SELECT r.requested_by AS id FROM r
    JOIN public.profiles p ON p.id = r.requested_by AND p.is_active
    WHERE p.role = 'admin'
       OR EXISTS (SELECT 1 FROM public.kiru_coordinator_mentors cm WHERE cm.mentor_id = r.mentor_id AND cm.coordinator_id = r.requested_by)
  )
  SELECT id FROM requester
  UNION ALL
  SELECT s FROM r, kiru_private.class_supervisors(r.mentor_id) s WHERE NOT EXISTS (SELECT 1 FROM requester)
$$;
REVOKE ALL ON FUNCTION kiru_private.review_supervisors(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.my_supervision_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN kiru_private.is_admin() THEN 'admin' ELSE kiru_private.kiru_role() END
$$;
REVOKE ALL ON FUNCTION kiru_private.my_supervision_role() FROM PUBLIC;

-- 12. Evaluaciones para supervisar ---------------------------------------------------------
-- Una fila por alumno y semana con las 4 notas del registro que cuenta, el mentor
-- que las puso, las observaciones de texto de ese registro y la nota vigente si
-- administración la corrigió. Solo los alumnos de los mentores que supervisa
-- quien la llama (administración: todos).
CREATE OR REPLACE FUNCTION public.kiru_supervision_evaluations(p_since date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := kiru_private.my_supervision_role();
  v_since date := coalesce(p_since, (now() AT TIME ZONE 'Europe/Madrid')::date - 365);
BEGIN
  IF v_role NOT IN ('admin', 'coordinador') THEN
    RAISE EXCEPTION 'Solo coordinación y administración pueden supervisar evaluaciones.' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH students AS (
      SELECT DISTINCT l.student_id
      FROM public.kiru_session_logs l
      WHERE l.student_id IS NOT NULL AND l.mentor_id IS NOT NULL
        AND kiru_private.supervises_mentor(l.mentor_id)
    ),
    weeks AS (
      SELECT s.student_id, w.*
      FROM students s CROSS JOIN LATERAL kiru_private.skillcoin_week_logs(s.student_id) w
      WHERE w.week >= v_since AND kiru_private.supervises_mentor(w.mentor_id)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'studentId', w.student_id,
      'studentName', ps.full_name,
      'mentorId', w.mentor_id,
      'mentorName', pm.full_name,
      'logId', w.log_id,
      'week', w.week,
      'sessionDate', l.session_date,
      'scores', jsonb_build_object('estudios', w.estudios, 'compromiso', w.compromiso, 'organizacion', w.organizacion, 'bienestar', w.bienestar),
      'current', (SELECT jsonb_build_object('estudios', c.estudios, 'compromiso', c.compromiso, 'organizacion', c.organizacion,
                    'bienestar', c.bienestar, 'at', c.created_at, 'reason', c.reason)
                  FROM public.kiru_skillcoin_corrections c
                  WHERE c.student_id = w.student_id AND c.week = w.week
                  ORDER BY c.created_at DESC LIMIT 1),
      'observations', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('q', e.item ->> 'q', 'a', e.item ->> 'a') ORDER BY e.ord), '[]'::jsonb)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.answers) = 'array' THEN l.answers ELSE '[]'::jsonb END)
             WITH ORDINALITY AS e(item, ord)
        WHERE trim(coalesce(e.item ->> 'a', '')) <> ''
          AND lower(translate(coalesce(e.item ->> 'q', ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) !~ '^skillcoins|^mes de la sesion|numero de sesion|es la sesion sc|^marca temporal|^nombre|^alumno|^mentor|correo'
      )
    ) ORDER BY ps.full_name, w.week DESC), '[]'::jsonb)
    FROM weeks w
    JOIN public.kiru_session_logs l ON l.id = w.log_id
    JOIN public.profiles ps ON ps.id = w.student_id
    LEFT JOIN public.profiles pm ON pm.id = w.mentor_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_supervision_evaluations(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_supervision_evaluations(date) TO authenticated;

-- 13. Solicitar justificación (coordinador del mentor o administración) -------------------
CREATE OR REPLACE FUNCTION public.kiru_request_sc_review(
  p_log uuid, p_competencia text, p_reason_code text, p_reason text, p_question text, p_due_date date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_role text := kiru_private.my_supervision_role();
  v_log public.kiru_session_logs;
  v_week record;
  v_score integer;
  v_id uuid;
BEGIN
  SELECT * INTO v_log FROM public.kiru_session_logs WHERE id = p_log;
  IF v_log.id IS NULL OR v_log.student_id IS NULL OR v_log.mentor_id IS NULL THEN
    RAISE EXCEPTION 'Ese registro de sesión no tiene alumno y mentor asignados.' USING ERRCODE = 'P0001';
  END IF;
  IF v_role NOT IN ('admin', 'coordinador') OR NOT kiru_private.supervises_mentor(v_log.mentor_id) THEN
    RAISE EXCEPTION 'Solo puedes revisar las evaluaciones de tus mentores.' USING ERRCODE = '42501';
  END IF;
  IF p_competencia IS NULL OR p_competencia NOT IN ('estudios', 'compromiso', 'organizacion', 'bienestar') THEN
    RAISE EXCEPTION 'Elige una competencia.' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) = 0 OR length(trim(coalesce(p_question, ''))) = 0 THEN
    RAISE EXCEPTION 'Escribe el motivo y la pregunta para el mentor.' USING ERRCODE = 'P0001';
  END IF;
  IF p_due_date IS NOT NULL AND p_due_date < (now() AT TIME ZONE 'Europe/Madrid')::date THEN
    RAISE EXCEPTION 'El plazo no puede ser anterior a hoy.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_week FROM kiru_private.skillcoin_week_logs(v_log.student_id) w WHERE w.log_id = p_log;
  IF v_week.log_id IS NULL THEN
    RAISE EXCEPTION 'Ese registro no es el que cuenta para las SkillCoins de su semana.' USING ERRCODE = 'P0001';
  END IF;
  v_score := CASE p_competencia WHEN 'estudios' THEN v_week.estudios WHEN 'compromiso' THEN v_week.compromiso
                                WHEN 'organizacion' THEN v_week.organizacion ELSE v_week.bienestar END;
  IF EXISTS (SELECT 1 FROM public.kiru_skillcoin_reviews r
             WHERE r.student_id = v_log.student_id AND r.week = v_week.week AND r.competencia = p_competencia AND r.status <> 'cerrada') THEN
    RAISE EXCEPTION 'Ya hay una revisión abierta de esa nota.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.kiru_skillcoin_reviews
    (student_id, mentor_id, session_log_id, week, competencia, score_snapshot, week_scores, requested_by, requested_role,
     reason_code, reason, question, due_date)
  VALUES (v_log.student_id, v_log.mentor_id, p_log, v_week.week, p_competencia, v_score,
          jsonb_build_object('estudios', v_week.estudios, 'compromiso', v_week.compromiso, 'organizacion', v_week.organizacion, 'bienestar', v_week.bienestar),
          v_me, v_role,
          CASE WHEN p_reason_code IN ('maximo_repetido', 'sin_variacion', 'posible_contradiccion', 'maximo_sin_evolucion') THEN p_reason_code ELSE 'otro' END,
          left(trim(p_reason), 1000), left(trim(p_question), 2000), p_due_date)
  RETURNING id INTO v_id;

  PERFORM kiru_private.supervision_event(v_id, NULL, v_log.mentor_id, 'solicitada',
    jsonb_build_object('competencia', p_competencia, 'nota', v_score, 'motivo', left(trim(p_reason), 1000), 'pregunta', left(trim(p_question), 2000)));
  PERFORM kiru_private.supervision_notify(v_log.mentor_id, v_log.student_id, v_id, NULL, 'justificacion_solicitada',
    'Coordinación te pide justificar una nota de SkillCoins',
    kiru_private.first_name(v_log.student_id) || ', ' || kiru_private.competencia_label(p_competencia) || ' (' || v_score || '/10), '
      || kiru_private.week_label(v_week.week) || '. Pregunta: ' || left(trim(p_question), 600)
      || CASE WHEN p_due_date IS NOT NULL THEN ' Plazo para responder: ' || to_char(p_due_date, 'DD/MM/YYYY') || '.' ELSE '' END
      || ' Puedes responder con una explicación, observaciones de la sesión o fotos del trabajo.',
    'justificacion_solicitada:' || v_id, true);
  RETURN v_id;
END;
$$;

-- 14. Responder (mentor de la revisión) ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_answer_sc_review(p_review uuid, p_body text, p_criteria text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_r public.kiru_skillcoin_reviews;
  v_msg uuid;
  v_sup uuid;
BEGIN
  SELECT * INTO v_r FROM public.kiru_skillcoin_reviews WHERE id = p_review FOR UPDATE;
  IF v_r.id IS NULL OR v_r.mentor_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Solo el mentor que puso la nota puede responder.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status NOT IN ('pendiente_respuesta', 'respondida') THEN
    RAISE EXCEPTION 'Esta revisión ya no admite respuestas.' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(coalesce(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'Escribe tu respuesta.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.kiru_skillcoin_review_messages (review_id, round, author_id, author_role, kind, body, criteria)
  VALUES (p_review, v_r.round, v_me, 'mentor', 'respuesta', left(trim(p_body), 4000), left(trim(coalesce(p_criteria, '')), 2000))
  RETURNING id INTO v_msg;
  IF v_r.status = 'pendiente_respuesta' THEN
    UPDATE public.kiru_skillcoin_reviews SET status = 'respondida', status_since = now(), answered_at = now() WHERE id = p_review;
  END IF;
  PERFORM kiru_private.supervision_event(p_review, NULL, v_r.mentor_id, 'respondida', jsonb_build_object('mensaje', v_msg, 'vuelta', v_r.round));
  -- Un solo aviso por vuelta, aunque el mentor envíe varios mensajes.
  FOR v_sup IN SELECT kiru_private.review_supervisors(p_review) LOOP
    PERFORM kiru_private.supervision_notify(v_sup, v_r.student_id, p_review, NULL, 'justificacion_respondida',
      'Un mentor ha respondido a una justificación',
      coalesce((SELECT full_name FROM public.profiles WHERE id = v_r.mentor_id), 'El mentor') || ' ha respondido sobre '
        || kiru_private.competencia_label(v_r.competencia) || ' (' || v_r.score_snapshot || '/10) de '
        || kiru_private.first_name(v_r.student_id) || ', ' || kiru_private.week_label(v_r.week) || '. Ya puedes valorarla.',
      'justificacion_respondida:' || p_review || ':' || v_r.round, true);
  END LOOP;
  RETURN v_msg;
END;
$$;

-- Registrar un adjunto ya subido al almacén (autor del mensaje).
CREATE OR REPLACE FUNCTION public.kiru_sc_review_add_file(p_message uuid, p_path text, p_name text, p_mime text, p_size integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_m public.kiru_skillcoin_review_messages;
  v_r public.kiru_skillcoin_reviews;
  v_id uuid;
BEGIN
  SELECT * INTO v_m FROM public.kiru_skillcoin_review_messages WHERE id = p_message;
  IF v_m.id IS NULL OR v_m.author_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Solo quien escribió el mensaje puede adjuntar archivos.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_r FROM public.kiru_skillcoin_reviews WHERE id = v_m.review_id;
  IF v_r.status = 'cerrada' THEN
    RAISE EXCEPTION 'La revisión ya está cerrada.' USING ERRCODE = 'P0001';
  END IF;
  IF p_path IS NULL OR split_part(p_path, '/', 1) <> v_r.id::text OR split_part(p_path, '/', 2) <> v_m.id::text
     OR split_part(p_path, '/', 3) = '' OR split_part(p_path, '/', 4) <> '' THEN
    RAISE EXCEPTION 'Ruta de archivo no válida.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'kiru-evidencias' AND o.name = p_path) THEN
    RAISE EXCEPTION 'El archivo no se ha subido.' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.kiru_skillcoin_review_files WHERE message_id = p_message) >= 10 THEN
    RAISE EXCEPTION 'Como mucho 10 archivos por mensaje.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.kiru_skillcoin_review_files (review_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (v_r.id, p_message, p_path, left(trim(p_name), 200), p_mime, p_size, v_me)
  RETURNING id INTO v_id;
  PERFORM kiru_private.supervision_event(v_r.id, NULL, v_r.mentor_id, 'adjunto', jsonb_build_object('archivo', v_id, 'nombre', left(trim(p_name), 200)));
  RETURN v_id;
END;
$$;

-- 15. Coordinación: empezar a valorar y repreguntar -------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_sc_review_start_assessment(p_review uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_r public.kiru_skillcoin_reviews;
BEGIN
  SELECT * INTO v_r FROM public.kiru_skillcoin_reviews WHERE id = p_review FOR UPDATE;
  IF v_r.id IS NULL OR NOT kiru_private.supervises_mentor(v_r.mentor_id) OR kiru_private.my_supervision_role() NOT IN ('admin', 'coordinador') THEN
    RAISE EXCEPTION 'No puedes valorar esta revisión.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'respondida' THEN RETURN; END IF;
  UPDATE public.kiru_skillcoin_reviews
  SET status = 'pendiente_valoracion', status_since = now(), assessment_started_at = now(), assessment_started_by = kiru_private.active_uid()
  WHERE id = p_review;
  PERFORM kiru_private.supervision_event(p_review, NULL, v_r.mentor_id, 'en_valoracion', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiru_sc_review_ask_more(p_review uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := kiru_private.my_supervision_role();
  v_r public.kiru_skillcoin_reviews;
  v_msg uuid;
BEGIN
  SELECT * INTO v_r FROM public.kiru_skillcoin_reviews WHERE id = p_review FOR UPDATE;
  IF v_r.id IS NULL OR v_role NOT IN ('admin', 'coordinador') OR NOT kiru_private.supervises_mentor(v_r.mentor_id) THEN
    RAISE EXCEPTION 'No puedes repreguntar en esta revisión.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status NOT IN ('respondida', 'pendiente_valoracion') THEN
    RAISE EXCEPTION 'Solo se puede repreguntar cuando el mentor ya ha respondido.' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(coalesce(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'Escribe la aclaración que necesitas.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.kiru_skillcoin_reviews SET status = 'pendiente_respuesta', status_since = now(), round = round + 1 WHERE id = p_review;
  INSERT INTO public.kiru_skillcoin_review_messages (review_id, round, author_id, author_role, kind, body)
  VALUES (p_review, v_r.round + 1, kiru_private.active_uid(), v_role, 'repregunta', left(trim(p_body), 4000))
  RETURNING id INTO v_msg;
  PERFORM kiru_private.supervision_event(p_review, NULL, v_r.mentor_id, 'repregunta', jsonb_build_object('mensaje', v_msg, 'vuelta', v_r.round + 1));
  PERFORM kiru_private.supervision_notify(v_r.mentor_id, v_r.student_id, p_review, NULL, 'justificacion_repregunta',
    'Coordinación necesita una aclaración sobre tu justificación',
    kiru_private.first_name(v_r.student_id) || ', ' || kiru_private.competencia_label(v_r.competencia) || ', '
      || kiru_private.week_label(v_r.week) || ': ' || left(trim(p_body), 600),
    'justificacion_repregunta:' || p_review || ':' || (v_r.round + 1), true);
  RETURN v_msg;
END;
$$;

-- 16. Avisos metodológicos ------------------------------------------------------------------
-- Nivel: 1 + avisos del mismo mentor y competencia de los últimos 6 meses (máx. 3).
-- Los anteriores no se borran: solo dejan de contar.
CREATE OR REPLACE FUNCTION kiru_private.warning_counted(p_mentor uuid, p_competencia text, p_at timestamptz DEFAULT now())
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(w.id ORDER BY w.created_at), '{}')
  FROM public.kiru_methodology_warnings w
  WHERE w.mentor_id = p_mentor AND w.competencia = p_competencia
    AND w.created_at > p_at - make_interval(months => greatest(1, kiru_private.setting_int('avisos_metodologicos_vigencia_meses', 6)))
    AND w.created_at <= p_at
$$;
REVOKE ALL ON FUNCTION kiru_private.warning_counted(uuid, text, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.kiru_methodology_warning_next_level(p_mentor uuid, p_competencia text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF NOT kiru_private.supervises_mentor(p_mentor) THEN
    RAISE EXCEPTION 'No supervisas a este mentor.' USING ERRCODE = '42501';
  END IF;
  v_ids := kiru_private.warning_counted(p_mentor, p_competencia);
  RETURN jsonb_build_object('level', least(3, coalesce(array_length(v_ids, 1), 0) + 1), 'counted', to_jsonb(v_ids));
END;
$$;

CREATE OR REPLACE FUNCTION kiru_private.create_warning(
  p_mentor uuid, p_review uuid, p_competencia text, p_origin text,
  p_criterion text, p_improvements text, p_manual_reference text, p_recommended text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
  v_level int;
  v_id uuid;
  v_title text;
  v_student uuid;
BEGIN
  IF length(trim(coalesce(p_criterion, ''))) = 0 THEN
    RAISE EXCEPTION 'Explica qué criterio debe revisar el mentor.' USING ERRCODE = 'P0001';
  END IF;
  -- Evita que dos avisos simultáneos calculen el mismo nivel.
  PERFORM pg_advisory_xact_lock(hashtext('kiru_warning:' || p_mentor::text || ':' || p_competencia));
  v_ids := kiru_private.warning_counted(p_mentor, p_competencia);
  v_level := least(3, coalesce(array_length(v_ids, 1), 0) + 1);
  INSERT INTO public.kiru_methodology_warnings
    (mentor_id, review_id, competencia, origin, level, counted_warning_ids, criterion, expected_improvements,
     manual_reference, recommended_action, created_by)
  VALUES (p_mentor, p_review, p_competencia, p_origin, v_level, v_ids, left(trim(p_criterion), 2000),
          left(trim(coalesce(p_improvements, '')), 2000), left(trim(coalesce(p_manual_reference, '')), 500),
          left(trim(coalesce(p_recommended, '')), 1000), kiru_private.active_uid())
  RETURNING id INTO v_id;
  PERFORM kiru_private.supervision_event(p_review, v_id, p_mentor, 'aviso_creado',
    jsonb_build_object('nivel', v_level, 'competencia', p_competencia, 'origen', p_origin, 'cuentan', to_jsonb(v_ids)));
  v_title := CASE v_level WHEN 1 THEN 'Recordatorio metodológico' WHEN 2 THEN 'Aviso metodológico: revisión con coordinación'
             ELSE 'Aviso metodológico: revisión metodológica obligatoria' END;
  SELECT student_id INTO v_student FROM public.kiru_skillcoin_reviews WHERE id = p_review;
  PERFORM kiru_private.supervision_notify(p_mentor, v_student, p_review, v_id, 'aviso_metodologico',
    v_title || ' (' || kiru_private.competencia_label(p_competencia) || ')',
    'Criterio a revisar: ' || left(trim(p_criterion), 450)
      || CASE WHEN trim(coalesce(p_improvements, '')) <> '' THEN ' Mejoras esperadas: ' || left(trim(p_improvements), 250) ELSE '' END
      || CASE WHEN trim(coalesce(p_manual_reference, '')) <> '' THEN ' Referencia del manual: ' || left(trim(p_manual_reference), 150) ELSE '' END
      || CASE v_level WHEN 2 THEN ' Tu coordinador te propondrá una reunión breve para repasar los criterios.'
                      WHEN 3 THEN ' Coordinación te indicará cómo será la revisión de conocimientos.' ELSE '' END,
    'aviso_metodologico:' || v_id, true);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION kiru_private.create_warning(uuid, uuid, text, text, text, text, text, text) FROM PUBLIC;

-- Aviso registrado a mano (sin revisión).
CREATE OR REPLACE FUNCTION public.kiru_methodology_warning_create(
  p_mentor uuid, p_competencia text, p_criterion text, p_improvements text DEFAULT '',
  p_manual_reference text DEFAULT '', p_recommended text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF kiru_private.my_supervision_role() NOT IN ('admin', 'coordinador') OR NOT kiru_private.supervises_mentor(p_mentor) THEN
    RAISE EXCEPTION 'Solo puedes registrar avisos de tus mentores.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_mentor AND role = 'mentor') THEN
    RAISE EXCEPTION 'Esa persona no es mentor.' USING ERRCODE = 'P0001';
  END IF;
  IF p_competencia IS NULL OR p_competencia NOT IN ('estudios', 'compromiso', 'organizacion', 'bienestar', 'general') THEN
    RAISE EXCEPTION 'Elige una competencia.' USING ERRCODE = 'P0001';
  END IF;
  RETURN kiru_private.create_warning(p_mentor, NULL, p_competencia, 'manual', p_criterion, p_improvements, p_manual_reference, p_recommended);
END;
$$;

-- 17. Resolver la revisión (A, B, C o retirarla) --------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_resolve_sc_review(
  p_review uuid, p_resolution text, p_note text DEFAULT '',
  p_criterion text DEFAULT '', p_improvements text DEFAULT '', p_manual_reference text DEFAULT '', p_recommended text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_r public.kiru_skillcoin_reviews;
  v_warning uuid;
BEGIN
  SELECT * INTO v_r FROM public.kiru_skillcoin_reviews WHERE id = p_review FOR UPDATE;
  IF v_r.id IS NULL OR kiru_private.my_supervision_role() NOT IN ('admin', 'coordinador') OR NOT kiru_private.supervises_mentor(v_r.mentor_id) THEN
    RAISE EXCEPTION 'No puedes cerrar esta revisión.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status = 'cerrada' THEN
    RAISE EXCEPTION 'La revisión ya está cerrada.' USING ERRCODE = 'P0001';
  END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('adecuada', 'insuficiente', 'necesita_formacion', 'retirada') THEN
    RAISE EXCEPTION 'Elige el resultado de la revisión.' USING ERRCODE = 'P0001';
  END IF;
  IF p_resolution <> 'retirada' AND v_r.status = 'pendiente_respuesta' THEN
    RAISE EXCEPTION 'Espera a que el mentor responda antes de valorar (o retira la solicitud).' USING ERRCODE = 'P0001';
  END IF;
  IF p_resolution = 'retirada' AND length(trim(coalesce(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Explica por qué se retira la solicitud.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kiru_skillcoin_reviews
  SET status = 'cerrada', status_since = now(), resolution = p_resolution, resolution_note = left(trim(coalesce(p_note, '')), 2000),
      resolved_by = kiru_private.active_uid(), resolved_at = now()
  WHERE id = p_review;
  PERFORM kiru_private.supervision_event(p_review, NULL, v_r.mentor_id, 'cerrada',
    jsonb_build_object('resultado', p_resolution, 'nota', left(trim(coalesce(p_note, '')), 2000)));

  IF p_resolution IN ('insuficiente', 'necesita_formacion') THEN
    v_warning := kiru_private.create_warning(v_r.mentor_id, p_review, v_r.competencia, p_resolution,
      p_criterion, p_improvements, p_manual_reference,
      CASE WHEN p_resolution = 'necesita_formacion' AND trim(coalesce(p_recommended, '')) = ''
           THEN 'Sesión de repaso o formación sobre el criterio de ' || kiru_private.competencia_label(v_r.competencia) || '.'
           ELSE p_recommended END);
  ELSE
    -- Sin aviso: solo campanita (sin correo) para que el mentor sepa que está cerrada.
    PERFORM kiru_private.supervision_notify(v_r.mentor_id, v_r.student_id, p_review, NULL, 'justificacion_cerrada',
      CASE WHEN p_resolution = 'adecuada' THEN 'Tu justificación se ha validado' ELSE 'Coordinación ha retirado una solicitud de justificación' END,
      kiru_private.first_name(v_r.student_id) || ', ' || kiru_private.competencia_label(v_r.competencia) || ', ' || kiru_private.week_label(v_r.week)
        || CASE WHEN trim(coalesce(p_note, '')) <> '' THEN '. ' || left(trim(p_note), 500) ELSE '.' END,
      'justificacion_cerrada:' || p_review, false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'warningId', v_warning);
END;
$$;

-- 18. Seguimiento de avisos ----------------------------------------------------------------
-- Acciones: en_revision, programar_reunion {at}, reunion_realizada {note},
-- solicitar_revision {kind}, registrar_resultado {result, measures},
-- mejora {note}, resolver {note}. Cada una queda en el historial.
CREATE OR REPLACE FUNCTION public.kiru_methodology_warning_update(p_warning uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_w public.kiru_methodology_warnings;
  v_note text := left(trim(coalesce(p_payload ->> 'note', '')), 2000);
  v_at timestamptz;
  v_kind text;
BEGIN
  SELECT * INTO v_w FROM public.kiru_methodology_warnings WHERE id = p_warning FOR UPDATE;
  IF v_w.id IS NULL OR kiru_private.my_supervision_role() NOT IN ('admin', 'coordinador') OR NOT kiru_private.supervises_mentor(v_w.mentor_id) THEN
    RAISE EXCEPTION 'No puedes cambiar este aviso.' USING ERRCODE = '42501';
  END IF;
  IF v_w.status = 'resuelto' AND p_action <> 'mejora' THEN
    RAISE EXCEPTION 'El aviso ya está resuelto.' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'en_revision' THEN
    UPDATE public.kiru_methodology_warnings SET status = 'en_revision' WHERE id = p_warning;
  ELSIF p_action = 'programar_reunion' THEN
    BEGIN v_at := (p_payload ->> 'at')::timestamptz; EXCEPTION WHEN others THEN v_at := NULL; END;
    IF v_at IS NULL THEN RAISE EXCEPTION 'Indica la fecha y hora de la reunión.' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.kiru_methodology_warnings SET meeting_at = v_at, status = 'en_revision' WHERE id = p_warning;
    PERFORM kiru_private.supervision_notify(v_w.mentor_id, NULL, v_w.review_id, p_warning, 'aviso_seguimiento',
      'Reunión de seguimiento metodológico',
      'Tu coordinador ha fijado una reunión breve para repasar los criterios de ' || kiru_private.competencia_label(v_w.competencia)
        || ' el ' || to_char(v_at AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY "a las" HH24:MI') || '.'
        || CASE WHEN v_note <> '' THEN ' ' || left(v_note, 400) ELSE '' END,
      'aviso_reunion:' || p_warning || ':' || extract(epoch FROM v_at)::bigint, true);
  ELSIF p_action = 'reunion_realizada' THEN
    UPDATE public.kiru_methodology_warnings SET meeting_done_at = now(), meeting_note = v_note, status = 'en_revision' WHERE id = p_warning;
  ELSIF p_action = 'solicitar_revision' THEN
    v_kind := p_payload ->> 'kind';
    IF v_kind IS NULL OR v_kind NOT IN ('prueba_conocimientos', 'evaluacion_practica') THEN
      RAISE EXCEPTION 'Elige prueba de conocimientos o evaluación práctica.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.kiru_methodology_warnings SET assessment_kind = v_kind, assessment_requested_at = now(), status = 'en_revision' WHERE id = p_warning;
    PERFORM kiru_private.supervision_notify(v_w.mentor_id, NULL, v_w.review_id, p_warning, 'aviso_seguimiento',
      'Revisión metodológica',
      'Coordinación te pide ' || CASE v_kind WHEN 'prueba_conocimientos' THEN 'repetir la prueba de conocimientos metodológicos'
        ELSE 'una evaluación práctica' END || ' sobre ' || kiru_private.competencia_label(v_w.competencia) || '.'
        || CASE WHEN v_note <> '' THEN ' ' || left(v_note, 400) ELSE '' END,
      'aviso_revision:' || p_warning || ':' || v_kind, true);
  ELSIF p_action = 'registrar_resultado' THEN
    IF trim(coalesce(p_payload ->> 'result', '')) = '' THEN
      RAISE EXCEPTION 'Escribe el resultado de la revisión.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.kiru_methodology_warnings
    SET assessment_result = left(trim(p_payload ->> 'result'), 2000),
        reinforcement_measures = left(trim(coalesce(p_payload ->> 'measures', '')), 2000),
        assessment_recorded_at = now(), status = 'en_revision'
    WHERE id = p_warning;
  ELSIF p_action = 'mejora' THEN
    UPDATE public.kiru_methodology_warnings SET improvement_at = now(), improvement_note = v_note WHERE id = p_warning;
  ELSIF p_action = 'resolver' THEN
    UPDATE public.kiru_methodology_warnings
    SET status = 'resuelto', resolved_at = now(), resolved_by = kiru_private.active_uid(), resolution_note = v_note
    WHERE id = p_warning;
  ELSE
    RAISE EXCEPTION 'Acción no válida.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM kiru_private.supervision_event(v_w.review_id, p_warning, v_w.mentor_id, p_action, coalesce(p_payload, '{}'::jsonb));
END;
$$;

-- 19. Corrección autorizada de una nota (solo administración) ----------------------------------
-- Usa la tabla de correcciones de siempre (la nota original del registro no se toca) y
-- deja enlazada la revisión.
CREATE OR REPLACE FUNCTION public.kiru_sc_review_correct(p_review uuid, p_new_score integer, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_r public.kiru_skillcoin_reviews;
  v_w record;
  v_prior jsonb;
BEGIN
  IF NOT kiru_private.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede corregir una nota.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_r FROM public.kiru_skillcoin_reviews WHERE id = p_review;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'Revisión no encontrada.' USING ERRCODE = 'P0001'; END IF;
  IF p_new_score IS NULL OR p_new_score NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION 'La nota va de 0 a 10.' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Explica el motivo de la corrección.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_w FROM kiru_private.skillcoin_weeks(v_r.student_id) w WHERE w.week = v_r.week;
  IF v_w.week IS NULL THEN RAISE EXCEPTION 'No hay SkillCoins de esa semana.' USING ERRCODE = 'P0001'; END IF;
  v_prior := jsonb_build_object('estudios', v_w.estudios, 'compromiso', v_w.compromiso, 'organizacion', v_w.organizacion, 'bienestar', v_w.bienestar);
  INSERT INTO public.kiru_skillcoin_corrections
    (student_id, week, estudios, compromiso, organizacion, bienestar, previous, reason, corrected_by, corrected_role, review_id)
  VALUES (v_r.student_id, v_r.week,
    CASE WHEN v_r.competencia = 'estudios' THEN p_new_score ELSE v_w.estudios END,
    CASE WHEN v_r.competencia = 'compromiso' THEN p_new_score ELSE v_w.compromiso END,
    CASE WHEN v_r.competencia = 'organizacion' THEN p_new_score ELSE v_w.organizacion END,
    CASE WHEN v_r.competencia = 'bienestar' THEN p_new_score ELSE v_w.bienestar END,
    v_prior, left('Revisión metodológica: ' || trim(p_reason), 500), kiru_private.active_uid(), 'admin', p_review);
  PERFORM kiru_private.refresh_skillcoins_record(v_r.student_id);
  PERFORM kiru_private.supervision_event(p_review, NULL, v_r.mentor_id, 'nota_corregida',
    jsonb_build_object('antes', v_prior -> v_r.competencia, 'despues', p_new_score, 'motivo', left(trim(p_reason), 500)));
END;
$$;

-- 20. Tarea diaria: recordatorios (una vez por vuelta) -----------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_supervision_tarea_diaria()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mentor_days int := kiru_private.setting_int('justificacion_dias_recordatorio_mentor', 3);
  v_coord_days int := kiru_private.setting_int('justificacion_dias_recordatorio_coordinador', 5);
  v_mentor int := 0;
  v_coord int := 0;
  r record;
  v_sup uuid;
BEGIN
  FOR r IN
    SELECT * FROM public.kiru_skillcoin_reviews
    WHERE status = 'pendiente_respuesta'
      AND CASE WHEN due_date IS NOT NULL AND round = 1
               -- Con plazo: el día antes de que venza (o ya vencido).
               THEN (now() AT TIME ZONE 'Europe/Madrid')::date >= due_date - 1
               ELSE status_since < now() - make_interval(days => v_mentor_days) END
  LOOP
    PERFORM kiru_private.supervision_notify(r.mentor_id, r.student_id, r.id, NULL, 'justificacion_recordatorio',
      'Tienes una justificación de SkillCoins pendiente',
      kiru_private.first_name(r.student_id) || ', ' || kiru_private.competencia_label(r.competencia) || ' (' || r.score_snapshot || '/10), '
        || kiru_private.week_label(r.week)
        || CASE WHEN r.due_date IS NOT NULL AND r.round = 1 THEN '. El plazo para responder es el ' || to_char(r.due_date, 'DD/MM/YYYY') || '.'
                ELSE '. Cuando puedas, responde desde tu panel.' END,
      'justificacion_recordatorio:' || r.id || ':' || r.round, true);
    v_mentor := v_mentor + 1;
  END LOOP;
  FOR r IN
    SELECT * FROM public.kiru_skillcoin_reviews
    WHERE status IN ('respondida', 'pendiente_valoracion') AND status_since < now() - make_interval(days => v_coord_days)
  LOOP
    FOR v_sup IN SELECT kiru_private.review_supervisors(r.id) LOOP
      PERFORM kiru_private.supervision_notify(v_sup, r.student_id, r.id, NULL, 'justificacion_por_valorar',
        'Justificación pendiente de valorar',
        coalesce((SELECT full_name FROM public.profiles WHERE id = r.mentor_id), 'Un mentor') || ' respondió hace días sobre '
          || kiru_private.competencia_label(r.competencia) || ' de ' || kiru_private.first_name(r.student_id) || '. Falta tu valoración.',
        'justificacion_por_valorar:' || r.id || ':' || r.round, true);
    END LOOP;
    v_coord := v_coord + 1;
  END LOOP;
  RETURN jsonb_build_object('recordatorios_mentor', v_mentor, 'por_valorar', v_coord);
END;
$$;

-- 21. Permisos de las funciones ------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public.kiru_request_sc_review(uuid, text, text, text, text, date),
  public.kiru_answer_sc_review(uuid, text, text),
  public.kiru_sc_review_add_file(uuid, text, text, text, integer),
  public.kiru_sc_review_start_assessment(uuid),
  public.kiru_sc_review_ask_more(uuid, text),
  public.kiru_methodology_warning_next_level(uuid, text),
  public.kiru_methodology_warning_create(uuid, text, text, text, text, text),
  public.kiru_resolve_sc_review(uuid, text, text, text, text, text, text),
  public.kiru_methodology_warning_update(uuid, text, jsonb),
  public.kiru_sc_review_correct(uuid, integer, text),
  public.kiru_supervision_tarea_diaria()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.kiru_request_sc_review(uuid, text, text, text, text, date),
  public.kiru_answer_sc_review(uuid, text, text),
  public.kiru_sc_review_add_file(uuid, text, text, text, integer),
  public.kiru_sc_review_start_assessment(uuid),
  public.kiru_sc_review_ask_more(uuid, text),
  public.kiru_methodology_warning_next_level(uuid, text),
  public.kiru_methodology_warning_create(uuid, text, text, text, text, text),
  public.kiru_resolve_sc_review(uuid, text, text, text, text, text, text),
  public.kiru_methodology_warning_update(uuid, text, jsonb),
  public.kiru_sc_review_correct(uuid, integer, text)
TO authenticated;
REVOKE EXECUTE ON FUNCTION public.kiru_supervision_tarea_diaria() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_supervision_tarea_diaria() TO service_role;

-- 22. Tarea programada (pg_cron, si está disponible) --------------------------------------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiru_supervision_diaria';
      PERFORM cron.schedule('kiru_supervision_diaria', '45 7 * * *', 'SELECT public.kiru_supervision_tarea_diaria()');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'pg_cron no disponible (%); la tarea diaria se ejecutará desde Vercel Cron.', SQLERRM;
    END;
  END IF;
END
$cron$;
