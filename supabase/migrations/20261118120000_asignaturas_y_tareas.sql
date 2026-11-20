-- Asignaturas, recursos, preguntas y tareas con entrega (diseño aprobado por Sofía el 18/11/2026).
--
-- Qué añade, sin tocar nada de lo que ya existe:
--   * Catálogo de asignaturas: las 7 de siempre pasan a ser «comunes» y cada mentor
--     puede crear las suyas (solo para sus alumnos). Administración puede hacer
--     común una asignatura de un mentor.
--   * Qué asignaturas ve cada alumno (antes se guardaba pero el panel del alumno no
--     lo leía: veía siempre las 7).
--   * Dentro de cada asignatura, lo que manda el mentor: recurso (texto + enlace),
--     pregunta «¿has hecho esto?» o tarea con fecha y hora de entrega.
--   * Entregas del alumno con la hora del servidor y archivos (foto, PDF, Word) en
--     el almacén privado «kiru-entregas». Estado: pendiente / a tiempo / tarde /
--     no entregada. Se puede entregar tarde (queda «tarde» con la hora real).
--   * Avisos en la campanita (nueva tarea, recordatorio 24 h antes, entrega
--     recibida, revisión del mentor, resumen diario de tareas sin entregar).
--   * Las familias solo ven el estado de las tareas (no el contenido ni archivos).
--   * Los archivos se borran el 31 de agosto; la entrega, su hora y su estado se quedan.
--
-- Lo que NO hace: no toca pagos, cuotas, SkillCoins ni puntuaciones. Los datos
-- antiguos (kiru_app_records) se copian y NO se borran.
--
-- Se puede ejecutar dos veces sin problema.

-- 1. Quién sigue a un alumno (sin familias) ---------------------------------------------
-- El propio alumno, su mentor, su coordinador y administración. Las familias ven
-- solo el estado mediante kiru_family_subject_tasks.
CREATE OR REPLACE FUNCTION kiru_private.can_follow_student(student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    student = kiru_private.active_uid()
    OR kiru_private.is_admin()
    OR EXISTS (SELECT 1 FROM public.student_mentors sm
               WHERE sm.student_id = student AND sm.mentor_id = kiru_private.active_uid())
    OR kiru_private.coordinates_student(student),
    false)
$$;
REVOKE ALL ON FUNCTION kiru_private.can_follow_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_follow_student(uuid) TO authenticated;

-- Quién puede mandar cosas a un alumno: su mentor o administración.
CREATE OR REPLACE FUNCTION kiru_private.can_teach_student(student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    kiru_private.is_admin()
    OR (kiru_private.kiru_role() = 'mentor' AND EXISTS (
          SELECT 1 FROM public.student_mentors sm
          WHERE sm.student_id = student AND sm.mentor_id = kiru_private.active_uid())),
    false)
$$;
REVOKE ALL ON FUNCTION kiru_private.can_teach_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_teach_student(uuid) TO authenticated;

-- 2. Catálogo de asignaturas -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Código de las asignaturas de siempre (geo, his…): enlaza con los recursos fijos del panel.
  code text UNIQUE CHECK (code IS NULL OR code ~ '^[a-z0-9_]{2,20}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  -- NULL = común para todos; si no, solo la usa ese mentor con sus alumnos.
  owner_mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Para crecer a otros países y cursos (NULL = cualquiera).
  country text NOT NULL DEFAULT 'ES' CHECK (country ~ '^[A-Z]{2}$'),
  course_level text CHECK (course_level IS NULL OR length(course_level) <= 40),
  sort_order integer NOT NULL DEFAULT 100,
  archived_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kiru_subjects_name_uidx
  ON public.kiru_subjects (coalesce(owner_mentor_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)))
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS kiru_subjects_owner_idx ON public.kiru_subjects (owner_mentor_id);
CREATE INDEX IF NOT EXISTS kiru_subjects_created_by_idx ON public.kiru_subjects (created_by);
COMMENT ON TABLE public.kiru_subjects IS
  'Asignaturas. Comunes (owner_mentor_id NULL) o de un mentor. Solo se escribe con las funciones kiru_subject_*.';

INSERT INTO public.kiru_subjects (code, name, sort_order) VALUES
  ('geo', 'Geografía', 10),
  ('his', 'Historia', 20),
  ('fis', 'Física y Química', 30),
  ('len', 'Lengua y Literatura', 40),
  ('ing', 'Inglés', 50),
  ('qui', 'Química', 60),
  ('bio', 'Biología', 70)
ON CONFLICT (code) DO NOTHING;

-- 3. Qué asignaturas ve cada alumno --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_student_subjects (
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.kiru_subjects(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, subject_id)
);
CREATE INDEX IF NOT EXISTS kiru_student_subjects_subject_idx ON public.kiru_student_subjects (subject_id);
CREATE INDEX IF NOT EXISTS kiru_student_subjects_added_by_idx ON public.kiru_student_subjects (added_by);
COMMENT ON TABLE public.kiru_student_subjects IS
  'Asignaturas visibles para cada alumno. La activa su mentor (o administración).';

-- 4. Lo que manda el mentor dentro de una asignatura ---------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_subject_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.kiru_subjects(id) ON DELETE RESTRICT,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- recurso = recomendación con enlace opcional; pregunta = «¿has hecho esto?»; tarea = con plazo.
  kind text NOT NULL CHECK (kind IN ('recurso', 'pregunta', 'tarea')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 2000),
  url text CHECK (url IS NULL OR (url ~* '^https?://' AND length(url) <= 1000)),
  due_at timestamptz,
  -- Zona horaria en la que el mentor puso la hora (para mostrarla igual en otros países).
  time_zone text NOT NULL DEFAULT 'Europe/Madrid' CHECK (length(time_zone) <= 60),
  requires_file boolean NOT NULL DEFAULT false,
  -- Lo mismo mandado a varios alumnos a la vez comparte batch_id.
  batch_id uuid,
  seen_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  feedback text NOT NULL DEFAULT '' CHECK (length(feedback) <= 1000),
  archived_at timestamptz,
  -- Recomendaciones antiguas copiadas de kiru_app_records (para no duplicarlas).
  legacy_record_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'tarea' OR due_at IS NOT NULL),
  CHECK (kind = 'tarea' OR (due_at IS NULL AND NOT requires_file))
);
CREATE INDEX IF NOT EXISTS kiru_subject_items_student_idx ON public.kiru_subject_items (student_id, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kiru_subject_items_subject_idx ON public.kiru_subject_items (subject_id);
CREATE INDEX IF NOT EXISTS kiru_subject_items_author_idx ON public.kiru_subject_items (author_id);
CREATE INDEX IF NOT EXISTS kiru_subject_items_reviewed_by_idx ON public.kiru_subject_items (reviewed_by);
CREATE INDEX IF NOT EXISTS kiru_subject_items_due_idx ON public.kiru_subject_items (due_at) WHERE kind = 'tarea' AND archived_at IS NULL;
COMMENT ON TABLE public.kiru_subject_items IS
  'Recursos, preguntas y tareas que el mentor manda a un alumno dentro de una asignatura. Solo se escribe con funciones.';

-- 5. Entregas y respuestas del alumno -------------------------------------------------------
-- Cada entrega es una fila nueva: nunca se edita ni se borra. La hora es la del servidor.
CREATE TABLE IF NOT EXISTS public.kiru_subject_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.kiru_subject_items(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answer text CHECK (answer IS NULL OR answer IN ('si', 'a_medias', 'no')),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  -- Plazo que había en ese momento (por si el mentor lo cambia después).
  due_at_snapshot timestamptz,
  late boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS kiru_subject_submissions_item_idx ON public.kiru_subject_submissions (item_id, submitted_at);
CREATE INDEX IF NOT EXISTS kiru_subject_submissions_student_idx ON public.kiru_subject_submissions (student_id);
COMMENT ON TABLE public.kiru_subject_submissions IS
  'Entregas y respuestas del alumno. La hora la pone el servidor. Solo se añaden.';

CREATE TABLE IF NOT EXISTS public.kiru_subject_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.kiru_subject_submissions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.kiru_subject_items(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Ruta en el almacén privado kiru-entregas: {alumno}/{tarea}/{nombre}
  storage_path text NOT NULL UNIQUE CHECK (length(storage_path) <= 400),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (length(mime_type) <= 120),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 0 AND 10485760),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Fin de curso: se borra el archivo y se queda la fila para el historial.
  deleted_at timestamptz,
  deleted_reason text CHECK (deleted_reason IS NULL OR length(deleted_reason) <= 60)
);
CREATE INDEX IF NOT EXISTS kiru_subject_files_submission_idx ON public.kiru_subject_files (submission_id);
CREATE INDEX IF NOT EXISTS kiru_subject_files_item_idx ON public.kiru_subject_files (item_id);
CREATE INDEX IF NOT EXISTS kiru_subject_files_student_idx ON public.kiru_subject_files (student_id);
CREATE INDEX IF NOT EXISTS kiru_subject_files_alive_idx ON public.kiru_subject_files (created_at) WHERE deleted_at IS NULL;

-- Entregas y archivos: solo se añaden; lo único que cambia es marcar el archivo borrado.
CREATE OR REPLACE FUNCTION kiru_private.subject_submission_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'kiru_subject_files' AND TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) ->> 'deleted_at' IS NULL AND to_jsonb(NEW) ->> 'deleted_at' IS NOT NULL
       AND (to_jsonb(NEW) - 'deleted_at' - 'deleted_reason') = (to_jsonb(OLD) - 'deleted_at' - 'deleted_reason') THEN
      RETURN NEW;
    END IF;
  END IF;
  -- Borrar un alumno o una tarea archivada por administración arrastra sus entregas.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Las entregas no se pueden modificar ni borrar.' USING ERRCODE = '42501';
END
$$;
REVOKE ALL ON FUNCTION kiru_private.subject_submission_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS kiru_subject_submissions_append_only ON public.kiru_subject_submissions;
CREATE TRIGGER kiru_subject_submissions_append_only BEFORE UPDATE OR DELETE ON public.kiru_subject_submissions
FOR EACH ROW EXECUTE FUNCTION kiru_private.subject_submission_guard();
DROP TRIGGER IF EXISTS kiru_subject_files_append_only ON public.kiru_subject_files;
CREATE TRIGGER kiru_subject_files_append_only BEFORE UPDATE OR DELETE ON public.kiru_subject_files
FOR EACH ROW EXECUTE FUNCTION kiru_private.subject_submission_guard();

-- 6. Estado de cada envío ------------------------------------------------------------------------
-- tarea: pendiente / a_tiempo / tarde / no_entregada
-- pregunta: sin_responder / respondida;  recurso: nuevo / visto
CREATE OR REPLACE FUNCTION kiru_private.subject_item_status(p_kind text, p_due timestamptz, p_first timestamptz, p_seen timestamptz, p_now timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_kind
    WHEN 'tarea' THEN CASE
      WHEN p_first IS NOT NULL AND p_first <= p_due THEN 'a_tiempo'
      WHEN p_first IS NOT NULL THEN 'tarde'
      WHEN p_now > p_due THEN 'no_entregada'
      ELSE 'pendiente' END
    WHEN 'pregunta' THEN CASE WHEN p_first IS NULL THEN 'sin_responder' ELSE 'respondida' END
    ELSE CASE WHEN p_seen IS NULL THEN 'nuevo' ELSE 'visto' END
  END
$$;

-- Vista con el estado calculado. Usa los permisos de quien consulta (security_invoker).
CREATE OR REPLACE VIEW public.kiru_subject_items_status
WITH (security_invoker = true) AS
SELECT i.*,
       s.name AS subject_name,
       s.code AS subject_code,
       f.first_submitted_at,
       f.last_submitted_at,
       f.submissions_count,
       f.last_answer,
       kiru_private.subject_item_status(i.kind, i.due_at, f.first_submitted_at, i.seen_at) AS status
FROM public.kiru_subject_items i
JOIN public.kiru_subjects s ON s.id = i.subject_id
LEFT JOIN LATERAL (
  SELECT min(x.submitted_at) AS first_submitted_at,
         max(x.submitted_at) AS last_submitted_at,
         count(*)::integer AS submissions_count,
         (SELECT y.answer FROM public.kiru_subject_submissions y WHERE y.item_id = i.id ORDER BY y.submitted_at DESC LIMIT 1) AS last_answer
  FROM public.kiru_subject_submissions x
  WHERE x.item_id = i.id
) f ON true;
GRANT SELECT ON public.kiru_subject_items_status TO authenticated;
GRANT EXECUTE ON FUNCTION kiru_private.subject_item_status(text, timestamptz, timestamptz, timestamptz, timestamptz) TO authenticated;

-- 7. Permisos de lectura (RLS) ---------------------------------------------------------------
ALTER TABLE public.kiru_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_student_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_subject_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_subject_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_subject_files ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_subjects, public.kiru_student_subjects, public.kiru_subject_items,
  public.kiru_subject_submissions, public.kiru_subject_files FROM anon, authenticated;
REVOKE ALL ON public.kiru_subjects, public.kiru_student_subjects, public.kiru_subject_items,
  public.kiru_subject_submissions, public.kiru_subject_files, public.kiru_subject_items_status FROM anon;
GRANT SELECT ON public.kiru_subjects, public.kiru_student_subjects, public.kiru_subject_items,
  public.kiru_subject_submissions, public.kiru_subject_files TO authenticated;

-- Asignaturas: las comunes, las propias, y las que tiene activadas un alumno que puedes ver.
DROP POLICY IF EXISTS kiru_subjects_read ON public.kiru_subjects;
CREATE POLICY kiru_subjects_read ON public.kiru_subjects
FOR SELECT TO authenticated
USING (
  owner_mentor_id IS NULL
  OR owner_mentor_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR EXISTS (SELECT 1 FROM public.kiru_student_subjects ss
             WHERE ss.subject_id = kiru_subjects.id AND kiru_private.can_view_student(ss.student_id))
);

DROP POLICY IF EXISTS kiru_student_subjects_read ON public.kiru_student_subjects;
CREATE POLICY kiru_student_subjects_read ON public.kiru_student_subjects
FOR SELECT TO authenticated
USING (kiru_private.can_view_student(student_id));

DROP POLICY IF EXISTS kiru_subject_items_read ON public.kiru_subject_items;
CREATE POLICY kiru_subject_items_read ON public.kiru_subject_items
FOR SELECT TO authenticated
USING (kiru_private.can_follow_student(student_id)
       AND (archived_at IS NULL OR student_id <> (SELECT kiru_private.active_uid())));

DROP POLICY IF EXISTS kiru_subject_submissions_read ON public.kiru_subject_submissions;
CREATE POLICY kiru_subject_submissions_read ON public.kiru_subject_submissions
FOR SELECT TO authenticated
USING (kiru_private.can_follow_student(student_id));

DROP POLICY IF EXISTS kiru_subject_files_read ON public.kiru_subject_files;
CREATE POLICY kiru_subject_files_read ON public.kiru_subject_files
FOR SELECT TO authenticated
USING (kiru_private.can_follow_student(student_id));

-- 8. Almacén privado de entregas -----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kiru-entregas', 'kiru-entregas', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

-- Subir: solo el alumno, en su carpeta {alumno}/{tarea}/{archivo}, y solo para una tarea
-- o pregunta suya que no esté archivada. Nadie cambia ni borra (solo el servidor).
CREATE OR REPLACE FUNCTION kiru_private.can_upload_submission(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kiru_subject_items i
    WHERE i.student_id = kiru_private.active_uid()
      AND kiru_private.kiru_role() = 'alumno'
      AND i.kind IN ('tarea', 'pregunta')
      AND i.archived_at IS NULL
      AND split_part(p_name, '/', 1) = i.student_id::text
      AND split_part(p_name, '/', 2) = i.id::text
      AND split_part(p_name, '/', 3) <> ''
      AND split_part(p_name, '/', 4) = ''
  )
$$;
REVOKE ALL ON FUNCTION kiru_private.can_upload_submission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_upload_submission(text) TO authenticated;

CREATE OR REPLACE FUNCTION kiru_private.can_read_submission(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN kiru_private.can_follow_student(split_part(p_name, '/', 1)::uuid) ELSE false END
$$;
REVOKE ALL ON FUNCTION kiru_private.can_read_submission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_read_submission(text) TO authenticated;

DROP POLICY IF EXISTS "Kiru entregas upload" ON storage.objects;
CREATE POLICY "Kiru entregas upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'kiru-entregas' AND kiru_private.can_upload_submission(name));
DROP POLICY IF EXISTS "Kiru entregas read" ON storage.objects;
CREATE POLICY "Kiru entregas read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'kiru-entregas' AND kiru_private.can_read_submission(name));

-- 9. Avisos de la campanita -------------------------------------------------------------------
-- Se rehace la lista de tipos permitidos a partir de la que haya en la base de datos,
-- añadiendo los nuevos: así no se pierde ningún tipo que haya añadido otra mejora.
DO $$
DECLARE
  v_def text;
  v_kinds text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.kiru_notifications'::regclass AND c.conname = 'kiru_notifications_kind_check';
  SELECT coalesce(array_agg(DISTINCT m[1]), '{}') INTO v_kinds
  FROM regexp_matches(coalesce(v_def, ''), '''([a-z0-9_]+)''', 'g') AS m;
  IF cardinality(v_kinds) < 10 THEN
    RAISE EXCEPTION 'No se pudo leer la lista de avisos actual; no se cambia nada.';
  END IF;
  v_kinds := ARRAY(SELECT DISTINCT unnest(v_kinds || ARRAY['tarea_nueva', 'tarea_recordatorio', 'tarea_entregada',
                                                           'tarea_revisada', 'tareas_no_entregadas']) ORDER BY 1);
  EXECUTE 'ALTER TABLE public.kiru_notifications DROP CONSTRAINT IF EXISTS kiru_notifications_kind_check';
  -- Se escribe como lista «IN ('a', 'b', …)», igual que las mejoras anteriores, para que
  -- la próxima vez se pueda volver a leer.
  EXECUTE 'ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check CHECK (kind IN ('
    || (SELECT string_agg(quote_literal(k), ', ' ORDER BY k) FROM unnest(v_kinds) AS k) || '))';
END
$$;

ALTER TABLE public.kiru_notifications ADD COLUMN IF NOT EXISTS subject_item_id uuid REFERENCES public.kiru_subject_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS kiru_notifications_subject_item_idx ON public.kiru_notifications (subject_item_id);

CREATE OR REPLACE FUNCTION kiru_private.subject_notify(p_recipient uuid, p_student uuid, p_item uuid, p_kind text, p_title text, p_body text, p_event text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.kiru_notifications (recipient_id, student_id, subject_item_id, kind, title, body, event_key)
  SELECT p_recipient, p_student, p_item, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 1000), left(p_event, 200)
  WHERE p_recipient IS NOT NULL
  ON CONFLICT (recipient_id, event_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION kiru_private.subject_notify(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;

-- Fecha y hora legibles en la zona del envío: «mar 24/11 a las 20:00».
CREATE OR REPLACE FUNCTION kiru_private.subject_due_label(p_due timestamptz, p_tz text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (ARRAY['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])[extract(isodow FROM p_due AT TIME ZONE p_tz)::int]
         || ' ' || to_char(p_due AT TIME ZONE p_tz, 'DD/MM') || ' a las ' || to_char(p_due AT TIME ZONE p_tz, 'HH24:MI')
$$;
REVOKE ALL ON FUNCTION kiru_private.subject_due_label(timestamptz, text) FROM PUBLIC;

-- 10. Funciones del mentor y de administración ----------------------------------------------------
-- Crear una asignatura propia (mentor) o común (administración con p_common).
CREATE OR REPLACE FUNCTION public.kiru_subject_create(p_name text, p_description text DEFAULT '', p_common boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_role text := kiru_private.kiru_role();
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_owner uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL OR v_role NOT IN ('mentor', 'admin') THEN
    RAISE EXCEPTION 'Solo los mentores y administración pueden crear asignaturas.' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'El nombre debe tener entre 2 y 80 caracteres.' USING ERRCODE = 'P0001';
  END IF;
  v_owner := CASE WHEN v_role = 'admin' AND p_common THEN NULL ELSE v_me END;
  -- Si ya existe (común o tuya) con ese nombre, se reutiliza.
  SELECT s.id INTO v_id FROM public.kiru_subjects s
  WHERE s.archived_at IS NULL AND lower(trim(s.name)) = lower(v_name)
    AND (s.owner_mentor_id IS NULL OR s.owner_mentor_id = v_owner)
  ORDER BY s.owner_mentor_id NULLS FIRST LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.kiru_subjects (name, description, owner_mentor_id, created_by)
  VALUES (v_name, left(trim(coalesce(p_description, '')), 300), v_owner, v_me)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Cambiar el nombre o archivar una asignatura propia (administración: cualquiera).
CREATE OR REPLACE FUNCTION public.kiru_subject_update(p_subject uuid, p_name text DEFAULT NULL, p_archive boolean DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_s public.kiru_subjects;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
BEGIN
  SELECT * INTO v_s FROM public.kiru_subjects WHERE id = p_subject;
  IF v_s.id IS NULL OR NOT (kiru_private.is_admin()
      OR (kiru_private.kiru_role() = 'mentor' AND v_s.owner_mentor_id = v_me)) THEN
    RAISE EXCEPTION 'Solo puedes cambiar tus propias asignaturas.' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NOT NULL THEN
    IF length(v_name) < 2 OR length(v_name) > 80 THEN
      RAISE EXCEPTION 'El nombre debe tener entre 2 y 80 caracteres.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.kiru_subjects SET name = v_name, updated_at = now() WHERE id = p_subject;
  END IF;
  IF p_archive IS NOT NULL THEN
    UPDATE public.kiru_subjects SET archived_at = CASE WHEN p_archive THEN coalesce(archived_at, now()) END, updated_at = now()
    WHERE id = p_subject;
  END IF;
END;
$$;

-- Administración: hacer común para todos una asignatura creada por un mentor.
CREATE OR REPLACE FUNCTION public.kiru_subject_make_common(p_subject uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT kiru_private.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede hacer común una asignatura.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kiru_subjects c, public.kiru_subjects s
             WHERE s.id = p_subject AND c.id <> s.id AND c.owner_mentor_id IS NULL AND c.archived_at IS NULL
               AND lower(trim(c.name)) = lower(trim(s.name))) THEN
    RAISE EXCEPTION 'Ya hay una asignatura común con ese nombre.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.kiru_subjects SET owner_mentor_id = NULL, updated_at = now() WHERE id = p_subject;
END;
$$;

-- Activar o quitar una asignatura a un alumno.
CREATE OR REPLACE FUNCTION public.kiru_student_subject_set(p_student uuid, p_subject uuid, p_visible boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_s public.kiru_subjects;
BEGIN
  IF NOT kiru_private.can_teach_student(p_student) THEN
    RAISE EXCEPTION 'Solo el mentor del alumno puede cambiar sus asignaturas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.kiru_subjects WHERE id = p_subject;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'La asignatura no existe.' USING ERRCODE = 'P0001'; END IF;
  IF p_visible THEN
    IF v_s.archived_at IS NOT NULL THEN RAISE EXCEPTION 'La asignatura está archivada.' USING ERRCODE = 'P0001'; END IF;
    IF v_s.owner_mentor_id IS NOT NULL AND v_s.owner_mentor_id <> v_me AND NOT kiru_private.is_admin() THEN
      RAISE EXCEPTION 'Esa asignatura es de otro mentor.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.kiru_student_subjects (student_id, subject_id, added_by)
    VALUES (p_student, p_subject, v_me) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.kiru_student_subjects WHERE student_id = p_student AND subject_id = p_subject;
  END IF;
END;
$$;

-- Mandar un recurso, pregunta o tarea a uno o varios alumnos. Devuelve los ids creados.
CREATE OR REPLACE FUNCTION public.kiru_subject_item_send(
  p_students uuid[], p_subject uuid, p_kind text, p_title text, p_body text DEFAULT '',
  p_url text DEFAULT NULL, p_due_at timestamptz DEFAULT NULL, p_requires_file boolean DEFAULT false,
  p_time_zone text DEFAULT 'Europe/Madrid')
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_s public.kiru_subjects;
  v_batch uuid := gen_random_uuid();
  v_student uuid;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_url text := nullif(trim(coalesce(p_url, '')), '');
  v_title text := trim(coalesce(p_title, ''));
  v_tz text := coalesce(nullif(trim(p_time_zone), ''), 'Europe/Madrid');
BEGIN
  IF p_students IS NULL OR cardinality(p_students) = 0 OR cardinality(p_students) > 60 THEN
    RAISE EXCEPTION 'Elige entre 1 y 60 alumnos.' USING ERRCODE = 'P0001';
  END IF;
  IF p_kind NOT IN ('recurso', 'pregunta', 'tarea') THEN
    RAISE EXCEPTION 'Tipo no válido.' USING ERRCODE = 'P0001';
  END IF;
  IF length(v_title) = 0 THEN RAISE EXCEPTION 'Escribe un título.' USING ERRCODE = 'P0001'; END IF;
  IF v_url IS NOT NULL AND v_url !~* '^https?://' THEN v_url := 'https://' || v_url; END IF;
  IF p_kind = 'tarea' AND p_due_at IS NULL THEN
    RAISE EXCEPTION 'Pon la fecha y la hora de entrega.' USING ERRCODE = 'P0001';
  END IF;
  IF p_kind = 'tarea' AND p_due_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'La fecha de entrega ya ha pasado.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_tz) THEN v_tz := 'Europe/Madrid'; END IF;
  SELECT * INTO v_s FROM public.kiru_subjects WHERE id = p_subject;
  IF v_s.id IS NULL OR v_s.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'La asignatura no existe o está archivada.' USING ERRCODE = 'P0001';
  END IF;
  FOREACH v_student IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(p_students) x) LOOP
    IF NOT kiru_private.can_teach_student(v_student) THEN
      RAISE EXCEPTION 'Solo puedes mandar tareas a tus alumnos.' USING ERRCODE = '42501';
    END IF;
    IF v_s.owner_mentor_id IS NOT NULL AND v_s.owner_mentor_id <> v_me AND NOT kiru_private.is_admin() THEN
      RAISE EXCEPTION 'Esa asignatura es de otro mentor.' USING ERRCODE = '42501';
    END IF;
    -- Si el alumno aún no tenía la asignatura, se le activa.
    INSERT INTO public.kiru_student_subjects (student_id, subject_id, added_by)
    VALUES (v_student, p_subject, v_me) ON CONFLICT DO NOTHING;
    INSERT INTO public.kiru_subject_items (student_id, subject_id, author_id, kind, title, body, url, due_at, time_zone, requires_file, batch_id)
    VALUES (v_student, p_subject, v_me, p_kind, left(v_title, 200), left(trim(coalesce(p_body, '')), 2000), v_url,
            CASE WHEN p_kind = 'tarea' THEN p_due_at END, v_tz, p_kind = 'tarea' AND coalesce(p_requires_file, false), v_batch)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
    IF p_kind = 'tarea' THEN
      PERFORM kiru_private.subject_notify(v_student, v_student, v_id, 'tarea_nueva',
        'Nueva tarea de ' || v_s.name, left(v_title, 120) || ' · entrega: ' || kiru_private.subject_due_label(p_due_at, v_tz),
        'tarea_nueva:' || v_id);
    ELSIF p_kind = 'pregunta' THEN
      PERFORM kiru_private.subject_notify(v_student, v_student, v_id, 'tarea_nueva',
        'Tu mentor te pregunta (' || v_s.name || ')', left(v_title, 200), 'tarea_nueva:' || v_id);
    END IF;
  END LOOP;
  RETURN v_ids;
END;
$$;

-- Corregir título, texto, enlace o plazo, o archivar (desaparece del panel del alumno).
CREATE OR REPLACE FUNCTION public.kiru_subject_item_update(p_item uuid, p_title text DEFAULT NULL, p_body text DEFAULT NULL,
  p_url text DEFAULT NULL, p_due_at timestamptz DEFAULT NULL, p_archive boolean DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_i public.kiru_subject_items;
  v_url text := nullif(trim(coalesce(p_url, '')), '');
BEGIN
  SELECT * INTO v_i FROM public.kiru_subject_items WHERE id = p_item;
  IF v_i.id IS NULL OR NOT kiru_private.can_teach_student(v_i.student_id) THEN
    RAISE EXCEPTION 'Solo el mentor del alumno puede cambiar esto.' USING ERRCODE = '42501';
  END IF;
  IF v_url IS NOT NULL AND v_url !~* '^https?://' THEN v_url := 'https://' || v_url; END IF;
  UPDATE public.kiru_subject_items SET
    title = CASE WHEN p_title IS NOT NULL AND length(trim(p_title)) > 0 THEN left(trim(p_title), 200) ELSE title END,
    body = CASE WHEN p_body IS NOT NULL THEN left(trim(p_body), 2000) ELSE body END,
    url = CASE WHEN p_url IS NOT NULL THEN v_url ELSE url END,
    due_at = CASE WHEN p_due_at IS NOT NULL AND kind = 'tarea' THEN p_due_at ELSE due_at END,
    archived_at = CASE WHEN p_archive IS NULL THEN archived_at WHEN p_archive THEN coalesce(archived_at, now()) END,
    updated_at = now()
  WHERE id = p_item;
END;
$$;

-- El mentor marca como revisada con un comentario para el alumno.
CREATE OR REPLACE FUNCTION public.kiru_subject_item_review(p_item uuid, p_feedback text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_i public.kiru_subject_items;
  v_subject text;
BEGIN
  SELECT * INTO v_i FROM public.kiru_subject_items WHERE id = p_item;
  IF v_i.id IS NULL OR NOT kiru_private.can_teach_student(v_i.student_id) THEN
    RAISE EXCEPTION 'Solo el mentor del alumno puede revisar esto.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.kiru_subject_items
  SET reviewed_at = now(), reviewed_by = kiru_private.active_uid(), feedback = left(trim(coalesce(p_feedback, '')), 1000), updated_at = now()
  WHERE id = p_item;
  SELECT name INTO v_subject FROM public.kiru_subjects WHERE id = v_i.subject_id;
  PERFORM kiru_private.subject_notify(v_i.student_id, v_i.student_id, v_i.id, 'tarea_revisada',
    'Tu mentor ha revisado: ' || left(v_i.title, 120),
    coalesce(nullif(left(trim(coalesce(p_feedback, '')), 300), ''), v_subject),
    'tarea_revisada:' || v_i.id || ':' || extract(epoch FROM now())::bigint);
END;
$$;

-- 11. Funciones del alumno ------------------------------------------------------------------------
-- Marcar como visto (recursos y la primera vez que abre una tarea).
CREATE OR REPLACE FUNCTION public.kiru_subject_item_seen(p_items uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.kiru_subject_items SET seen_at = now()
  WHERE id = ANY (p_items) AND seen_at IS NULL AND student_id = kiru_private.active_uid()
$$;

-- Entregar una tarea o responder una pregunta. Los archivos se suben antes al almacén
-- (carpeta {alumno}/{tarea}/) y aquí se registran. p_files: [{path, name, mime, size}]
CREATE OR REPLACE FUNCTION public.kiru_subject_submit(p_item uuid, p_answer text DEFAULT NULL, p_comment text DEFAULT '', p_files jsonb DEFAULT '[]'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_i public.kiru_subject_items;
  v_subject text;
  v_student_name text;
  v_sub uuid;
  v_file jsonb;
  v_path text;
  v_count integer := 0;
  v_late boolean;
  v_first boolean;
  v_mentor uuid;
BEGIN
  SELECT * INTO v_i FROM public.kiru_subject_items WHERE id = p_item;
  IF v_i.id IS NULL OR v_i.student_id IS DISTINCT FROM v_me OR kiru_private.kiru_role() IS DISTINCT FROM 'alumno' THEN
    RAISE EXCEPTION 'Solo el alumno puede entregar sus tareas.' USING ERRCODE = '42501';
  END IF;
  IF v_i.archived_at IS NOT NULL OR v_i.kind = 'recurso' THEN
    RAISE EXCEPTION 'Esto no admite entregas.' USING ERRCODE = 'P0001';
  END IF;
  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' THEN p_files := '[]'::jsonb; END IF;
  IF jsonb_array_length(p_files) > 5 THEN
    RAISE EXCEPTION 'Como mucho 5 archivos por entrega.' USING ERRCODE = 'P0001';
  END IF;
  IF v_i.kind = 'pregunta' AND (p_answer IS NULL OR p_answer NOT IN ('si', 'a_medias', 'no')) THEN
    RAISE EXCEPTION 'Elige una respuesta.' USING ERRCODE = 'P0001';
  END IF;
  IF v_i.kind = 'tarea' AND v_i.requires_file AND jsonb_array_length(p_files) = 0 THEN
    RAISE EXCEPTION 'Esta tarea necesita una foto o un archivo.' USING ERRCODE = 'P0001';
  END IF;
  IF v_i.kind = 'tarea' AND jsonb_array_length(p_files) = 0 AND length(trim(coalesce(p_comment, ''))) = 0 THEN
    RAISE EXCEPTION 'Añade una foto, un archivo o un comentario.' USING ERRCODE = 'P0001';
  END IF;
  v_first := NOT EXISTS (SELECT 1 FROM public.kiru_subject_submissions WHERE item_id = p_item);
  v_late := v_i.kind = 'tarea' AND now() > v_i.due_at;
  INSERT INTO public.kiru_subject_submissions (item_id, student_id, answer, comment, due_at_snapshot, late)
  VALUES (p_item, v_me, CASE WHEN v_i.kind = 'pregunta' THEN p_answer END, left(trim(coalesce(p_comment, '')), 1000), v_i.due_at, v_late)
  RETURNING id INTO v_sub;
  FOR v_file IN SELECT * FROM jsonb_array_elements(p_files) LOOP
    v_path := v_file ->> 'path';
    IF v_path IS NULL OR split_part(v_path, '/', 1) <> v_me::text OR split_part(v_path, '/', 2) <> p_item::text
       OR split_part(v_path, '/', 3) = '' OR split_part(v_path, '/', 4) <> '' THEN
      RAISE EXCEPTION 'Ruta de archivo no válida.' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'kiru-entregas' AND o.name = v_path) THEN
      RAISE EXCEPTION 'Un archivo no se ha subido bien. Vuelve a intentarlo.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.kiru_subject_files (submission_id, item_id, student_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (v_sub, p_item, v_me, v_path, left(coalesce(nullif(trim(v_file ->> 'name'), ''), split_part(v_path, '/', 3)), 200),
            left(coalesce(v_file ->> 'mime', 'application/octet-stream'), 120),
            least(greatest(coalesce((v_file ->> 'size')::bigint, 0), 0), 10485760));
    v_count := v_count + 1;
  END LOOP;
  -- Aviso al mentor (una vez por entrega).
  SELECT name INTO v_subject FROM public.kiru_subjects WHERE id = v_i.subject_id;
  SELECT full_name INTO v_student_name FROM public.profiles WHERE id = v_me;
  v_mentor := coalesce(v_i.author_id, (SELECT sm.mentor_id FROM public.student_mentors sm WHERE sm.student_id = v_me LIMIT 1));
  PERFORM kiru_private.subject_notify(v_mentor, v_me, v_i.id, 'tarea_entregada',
    coalesce(v_student_name, 'Tu alumno') || CASE
      WHEN v_i.kind = 'pregunta' THEN ' ha respondido'
      WHEN NOT v_first THEN ' ha añadido algo a una entrega'
      WHEN v_late THEN ' ha entregado tarde'
      ELSE ' ha entregado a tiempo' END,
    v_subject || ' · ' || left(v_i.title, 120) || CASE WHEN v_count > 0 THEN ' · ' || v_count || ' archivo(s)' ELSE '' END,
    'tarea_entregada:' || v_sub);
  RETURN v_sub;
END;
$$;

-- 12. Lo que ven las familias: solo el estado -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_family_subject_tasks(p_student uuid)
RETURNS TABLE (item_id uuid, subject_name text, kind text, title text, due_at timestamptz, time_zone text,
               first_submitted_at timestamptz, status text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (kiru_private.is_guardian_of(p_student) OR kiru_private.can_follow_student(p_student)) THEN
    RAISE EXCEPTION 'No puedes ver las tareas de este alumno.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT i.id, s.name, i.kind, i.title, i.due_at, i.time_zone, f.first_at,
         kiru_private.subject_item_status(i.kind, i.due_at, f.first_at, i.seen_at), i.created_at
  FROM public.kiru_subject_items i
  JOIN public.kiru_subjects s ON s.id = i.subject_id
  LEFT JOIN LATERAL (SELECT min(x.submitted_at) AS first_at FROM public.kiru_subject_submissions x WHERE x.item_id = i.id) f ON true
  WHERE i.student_id = p_student AND i.archived_at IS NULL AND i.kind = 'tarea'
  ORDER BY i.due_at DESC
  LIMIT 100;
END;
$$;

-- Resumen por alumno (coordinación, administración y familias): tareas con plazo vencido
-- de los últimos p_days días y cuántas llegaron a tiempo.
CREATE OR REPLACE FUNCTION public.kiru_subject_task_summary(p_students uuid[], p_days integer DEFAULT 30)
RETURNS TABLE (student_id uuid, total integer, a_tiempo integer, tarde integer, no_entregada integer, pendiente integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH items AS (
    SELECT i.student_id,
           kiru_private.subject_item_status(i.kind, i.due_at,
             (SELECT min(x.submitted_at) FROM public.kiru_subject_submissions x WHERE x.item_id = i.id), i.seen_at) AS status
    FROM public.kiru_subject_items i
    WHERE i.student_id = ANY (p_students) AND i.kind = 'tarea' AND i.archived_at IS NULL
      AND i.due_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 400))
      AND (kiru_private.can_follow_student(i.student_id) OR kiru_private.is_guardian_of(i.student_id))
  )
  SELECT student_id,
         count(*) FILTER (WHERE status <> 'pendiente')::integer,
         count(*) FILTER (WHERE status = 'a_tiempo')::integer,
         count(*) FILTER (WHERE status = 'tarde')::integer,
         count(*) FILTER (WHERE status = 'no_entregada')::integer,
         count(*) FILTER (WHERE status = 'pendiente')::integer
  FROM items GROUP BY student_id
$$;

-- 13. Tarea automática cada hora: recordatorios y resumen diario ---------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_tareas_tarea_horaria()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reminders integer := 0;
  v_summaries integer := 0;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  r record;
BEGIN
  -- Recordatorio al alumno 24 h antes del plazo si no ha entregado nada.
  FOR r IN
    SELECT i.id, i.student_id, i.title, i.due_at, i.time_zone, s.name AS subject
    FROM public.kiru_subject_items i
    JOIN public.kiru_subjects s ON s.id = i.subject_id
    WHERE i.kind = 'tarea' AND i.archived_at IS NULL
      AND i.due_at > now() AND i.due_at <= now() + interval '24 hours'
      AND i.created_at < i.due_at - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.kiru_subject_submissions x WHERE x.item_id = i.id)
  LOOP
    PERFORM kiru_private.subject_notify(r.student_id, r.student_id, r.id, 'tarea_recordatorio',
      'Mañana termina el plazo: ' || left(r.title, 120),
      r.subject || ' · entrega: ' || kiru_private.subject_due_label(r.due_at, r.time_zone),
      'tarea_recordatorio:' || r.id);
    v_reminders := v_reminders + 1;
  END LOOP;

  -- Resumen al mentor, una vez al día (desde las 8:00 de Madrid): tareas cuyo plazo
  -- pasó en las últimas 24 h sin ninguna entrega.
  IF extract(hour FROM now() AT TIME ZONE 'Europe/Madrid') >= 8 THEN
    FOR r IN
      SELECT i.author_id AS mentor_id, count(*) AS n,
             string_agg(coalesce(p.full_name, 'Alumno') || ' (' || s.name || ')', ', ' ORDER BY i.due_at) AS detail
      FROM public.kiru_subject_items i
      JOIN public.kiru_subjects s ON s.id = i.subject_id
      LEFT JOIN public.profiles p ON p.id = i.student_id
      WHERE i.kind = 'tarea' AND i.archived_at IS NULL AND i.author_id IS NOT NULL
        AND i.due_at <= (v_today::timestamp + interval '8 hours') AT TIME ZONE 'Europe/Madrid'
        AND i.due_at > (v_today::timestamp - interval '16 hours') AT TIME ZONE 'Europe/Madrid'
        AND NOT EXISTS (SELECT 1 FROM public.kiru_subject_submissions x WHERE x.item_id = i.id)
      GROUP BY i.author_id
    LOOP
      PERFORM kiru_private.subject_notify(r.mentor_id, NULL, NULL, 'tareas_no_entregadas',
        CASE WHEN r.n = 1 THEN 'Una tarea sin entregar' ELSE r.n || ' tareas sin entregar' END,
        left(r.detail, 1000), 'tareas_no_entregadas:' || v_today);
      v_summaries := v_summaries + 1;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('recordatorios', v_reminders, 'resumenes', v_summaries);
END;
$$;

-- 14. Fin de curso: archivos de entregas -------------------------------------------------------------
-- Supabase no deja borrar archivos del almacén desde SQL: la tarea diaria de Vercel pide
-- la lista, los borra con la API de Storage y después los marca. Idempotente.
CREATE OR REPLACE FUNCTION public.kiru_entregas_caducadas(p_limit integer DEFAULT 500)
RETURNS TABLE (storage_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Todo lo subido antes del 1 de septiembre más reciente (hora de Madrid).
  SELECT f.storage_path FROM public.kiru_subject_files f
  WHERE f.deleted_at IS NULL
    AND f.created_at < (make_date(
          CASE WHEN extract(month FROM now() AT TIME ZONE 'Europe/Madrid') >= 9
               THEN extract(year FROM now() AT TIME ZONE 'Europe/Madrid')::int
               ELSE extract(year FROM now() AT TIME ZONE 'Europe/Madrid')::int - 1 END, 9, 1)::timestamp AT TIME ZONE 'Europe/Madrid')
  ORDER BY f.created_at
  LIMIT least(greatest(coalesce(p_limit, 500), 1), 1000)
$$;

CREATE OR REPLACE FUNCTION public.kiru_entregas_marcar_borradas(p_paths text[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH done AS (
    UPDATE public.kiru_subject_files SET deleted_at = now(), deleted_reason = 'fin de curso'
    WHERE storage_path = ANY (p_paths) AND deleted_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer FROM done
$$;

-- 15. Permisos de las funciones ------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.kiru_subject_create(text, text, boolean), public.kiru_subject_update(uuid, text, boolean),
  public.kiru_subject_make_common(uuid), public.kiru_student_subject_set(uuid, uuid, boolean),
  public.kiru_subject_item_send(uuid[], uuid, text, text, text, text, timestamptz, boolean, text),
  public.kiru_subject_item_update(uuid, text, text, text, timestamptz, boolean),
  public.kiru_subject_item_review(uuid, text), public.kiru_subject_item_seen(uuid[]),
  public.kiru_subject_submit(uuid, text, text, jsonb), public.kiru_family_subject_tasks(uuid),
  public.kiru_subject_task_summary(uuid[], integer),
  public.kiru_tareas_tarea_horaria(), public.kiru_entregas_caducadas(integer), public.kiru_entregas_marcar_borradas(text[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_subject_create(text, text, boolean), public.kiru_subject_update(uuid, text, boolean),
  public.kiru_subject_make_common(uuid), public.kiru_student_subject_set(uuid, uuid, boolean),
  public.kiru_subject_item_send(uuid[], uuid, text, text, text, text, timestamptz, boolean, text),
  public.kiru_subject_item_update(uuid, text, text, text, timestamptz, boolean),
  public.kiru_subject_item_review(uuid, text), public.kiru_subject_item_seen(uuid[]),
  public.kiru_subject_submit(uuid, text, text, jsonb), public.kiru_family_subject_tasks(uuid),
  public.kiru_subject_task_summary(uuid[], integer)
TO authenticated;
REVOKE EXECUTE ON FUNCTION public.kiru_tareas_tarea_horaria(), public.kiru_entregas_caducadas(integer),
  public.kiru_entregas_marcar_borradas(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_tareas_tarea_horaria(), public.kiru_entregas_caducadas(integer),
  public.kiru_entregas_marcar_borradas(text[]) TO service_role;

-- 16. Copiar lo que ya había (sin borrar nada) ------------------------------------------------------------
-- a) Asignaturas marcadas por los mentores (kiru_app_records, kind = subject_config).
INSERT INTO public.kiru_student_subjects (student_id, subject_id, added_by)
SELECT DISTINCT (r.data ->> 'studentId')::uuid, s.id, r.created_by
FROM public.kiru_app_records r
CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.data -> 'subjects') = 'array' THEN r.data -> 'subjects' ELSE '[]'::jsonb END) AS code
JOIN public.kiru_subjects s ON s.code = code
WHERE r.record_type = 'activity' AND r.data ->> 'kind' = 'subject_config'
  AND (r.data ->> 'studentId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (r.data ->> 'studentId')::uuid AND p.role = 'alumno')
ON CONFLICT DO NOTHING;

-- b) Los alumnos que nunca configuró nadie veían las 7: se les dejan las 7 para que su
--    panel no cambie. Solo la primera vez (si ya tienen alguna, no se toca).
INSERT INTO public.kiru_student_subjects (student_id, subject_id)
SELECT p.id, s.id
FROM public.profiles p
CROSS JOIN public.kiru_subjects s
WHERE p.role = 'alumno' AND s.code IS NOT NULL AND s.owner_mentor_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.kiru_student_subjects x WHERE x.student_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.kiru_app_records r
                  WHERE r.record_type = 'activity' AND r.data ->> 'kind' = 'subject_config' AND r.data ->> 'studentId' = p.id::text)
  AND NOT EXISTS (SELECT 1 FROM public.kiru_settings k WHERE k.key = 'asignaturas_copiadas')
ON CONFLICT DO NOTHING;

-- c) Recomendaciones antiguas del mentor → recursos.
INSERT INTO public.kiru_subject_items (student_id, subject_id, author_id, kind, title, body, url, legacy_record_id, created_at, updated_at, seen_at)
SELECT r.owner_id, s.id, r.created_by, 'recurso',
       left(coalesce(nullif(trim(r.data ->> 'text'), ''), 'Recomendación'), 200),
       CASE WHEN length(trim(r.data ->> 'text')) > 200 THEN left(trim(r.data ->> 'text'), 2000) ELSE '' END,
       CASE WHEN coalesce(r.data ->> 'link', '') ~* '^https?://' AND length(r.data ->> 'link') <= 1000 THEN r.data ->> 'link' END,
       r.id, r.created_at, r.updated_at, r.created_at
FROM public.kiru_app_records r
JOIN public.kiru_subjects s ON s.code = r.data ->> 'subjectId'
WHERE r.record_type = 'message' AND jsonb_typeof(r.data -> 'text') = 'string'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.owner_id AND p.role = 'alumno')
ON CONFLICT (legacy_record_id) DO NOTHING;

INSERT INTO public.kiru_student_subjects (student_id, subject_id)
SELECT DISTINCT i.student_id, i.subject_id FROM public.kiru_subject_items i WHERE i.legacy_record_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.kiru_settings (key, value) VALUES ('asignaturas_copiadas', to_jsonb(now()))
ON CONFLICT (key) DO NOTHING;

-- 17. Programar la tarea horaria (si pg_cron está disponible) ----------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('kiru_tareas_horaria') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kiru_tareas_horaria');
      PERFORM cron.schedule('kiru_tareas_horaria', '7 * * * *', 'SELECT public.kiru_tareas_tarea_horaria()');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'pg_cron no disponible (%); los recordatorios se mandarán desde la tarea diaria de Vercel.', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron no está activado; los recordatorios se mandarán desde la tarea diaria de Vercel.';
  END IF;
END
$$;
