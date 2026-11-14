-- Desempeño de mentores · Fase 2b (plan técnico aprobado por Sofía el 14/11/2026).
--
-- 1. Entregas bimestrales por pareja alumno-mentor: «Descubrirme» (mínimo 3 fotos y una
--    línea de qué trabajó el alumno, sin que salga su cara) y «Misión» (1 foto o una
--    descripción). Los bimestres van de 2 en 2 meses desde el inicio del primer periodo
--    de pago del alumno con ese mentor; el plazo es de 5 días tras el cierre. Solo se
--    crean los bimestres que empiezan desde la fecha en que el sistema empieza a contar
--    (01/01/2027). Con menos de 4 semanas de la pareja en el bimestre, queda exenta sola.
-- 2. Coordinación valida o pide aclaración. Una exención la proponen el mentor o
--    Coordinación y solo la aprueba Administración (también varias a la vez).
-- 3. Escalera de recordatorios: 1.º al vencer, 2.º a los 2 días laborables, 3.º a los 2
--    días laborables más, que abre una revisión para Coordinación. Mientras el sistema
--    esté en modo «oculto» no sale ninguno. Sin duplicados.
-- 4. Cálculo: A1 (Descubrirme), A2 completo (40 % semanas con SkillCoins, 30 %
--    supervisión, 30 % misión) y B4 completo (además de proponer fechas en plazo, la
--    recuperación se hace dentro del periodo pagado).
--
-- No cambia ninguna tabla en uso salvo para añadir tipos de aviso a la campanita.
-- No toca pagos de mentores ni el extra de 10 € (de «Pagos» solo se leen las fechas de
-- los periodos). Todo se escribe con funciones que comprueban el rol.

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
  'registro_error', 'registro_error_respuesta',
  'evidencia_entregada', 'evidencia_aclaracion', 'evidencia_validada', 'evidencia_recordatorio', 'evidencia_revision',
  'exencion_propuesta', 'exencion_resuelta'
));

-- Modo y fecha de inicio del sistema (una sola fila).
CREATE OR REPLACE FUNCTION kiru_private.perf_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT mode FROM public.kiru_perf_settings LIMIT 1), 'oculto')
$$;

CREATE OR REPLACE FUNCTION kiru_private.perf_data_from()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT data_from FROM public.kiru_perf_settings LIMIT 1), date '2027-01-01')
$$;

-- 1. Entregas ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_material_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('descubrirme', 'mision')),
  bimester_start date NOT NULL,
  bimester_end date NOT NULL,                       -- exclusivo
  due_at timestamptz NOT NULL,                       -- 5 días tras el cierre, 23:59 de Madrid
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'entregada', 'validada', 'aclaracion', 'exenta')),
  status_since timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,                          -- primera entrega
  clarification_due_at timestamptz,                  -- plazo para contestar una aclaración
  validated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  validated_at timestamptz,
  exempt_reason text NOT NULL DEFAULT '' CHECK (length(exempt_reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, student_id, kind, bimester_start),
  CHECK (bimester_end > bimester_start),
  CHECK ((status = 'validada') = (validated_at IS NOT NULL)),
  CHECK (status <> 'aclaracion' OR clarification_due_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS kiru_material_evidence_mentor_idx ON public.kiru_material_evidence (mentor_id, due_at);
CREATE INDEX IF NOT EXISTS kiru_material_evidence_status_idx ON public.kiru_material_evidence (status, due_at);
COMMENT ON TABLE public.kiru_material_evidence IS
  'Entregas bimestrales de «Descubrirme» y «Misión» por pareja alumno-mentor. Se crean solas; el estado solo cambia con las funciones kiru_evidence_*.';

CREATE TABLE IF NOT EXISTS public.kiru_material_evidence_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.kiru_material_evidence(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_role text NOT NULL CHECK (author_role IN ('mentor', 'coordinacion', 'admin', 'sistema')),
  kind text NOT NULL CHECK (kind IN ('entrega', 'respuesta', 'aclaracion', 'validacion', 'exencion', 'recordatorio', 'sistema')),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 2000),
  sent_at timestamptz,                               -- entrega del mentor: cuando la envía con sus fotos
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_material_evidence_messages_ev_idx ON public.kiru_material_evidence_messages (evidence_id, created_at);

CREATE TABLE IF NOT EXISTS public.kiru_material_evidence_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.kiru_material_evidence(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.kiru_material_evidence_messages(id) ON DELETE CASCADE,
  -- Ruta en el almacén privado kiru-evidencias: material/{entrega}/{mensaje}/{nombre}
  storage_path text NOT NULL UNIQUE CHECK (length(storage_path) <= 400),
  file_name text NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz                              -- fin de curso: el archivo se borra y la fila queda
);
CREATE INDEX IF NOT EXISTS kiru_material_evidence_files_ev_idx ON public.kiru_material_evidence_files (evidence_id);
CREATE INDEX IF NOT EXISTS kiru_material_evidence_files_msg_idx ON public.kiru_material_evidence_files (message_id);

CREATE TABLE IF NOT EXISTS public.kiru_evidence_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.kiru_material_evidence(id) ON DELETE CASCADE,
  proposed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposed_role text NOT NULL CHECK (proposed_role IN ('mentor', 'coordinacion', 'admin')),
  cause text NOT NULL CHECK (cause IN ('material_no_disponible', 'ausencia_alumno', 'ausencia_mentor', 'otra')),
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'propuesta' CHECK (status IN ('propuesta', 'aprobada', 'rechazada')),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'propuesta') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS kiru_evidence_exemptions_open_idx ON public.kiru_evidence_exemptions (evidence_id) WHERE status = 'propuesta';

CREATE TABLE IF NOT EXISTS public.kiru_obligation_reminders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  obligation_type text NOT NULL CHECK (obligation_type IN ('evidencia', 'aclaracion')),
  obligation_id uuid NOT NULL,
  evidence_id uuid REFERENCES public.kiru_material_evidence(id) ON DELETE CASCADE,
  step smallint NOT NULL CHECK (step BETWEEN 1 AND 3),
  recipients uuid[] NOT NULL DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_type, obligation_id, step)
);
COMMENT ON TABLE public.kiru_obligation_reminders IS
  'Recordatorios enviados (escalera de 3 pasos). Una fila por obligación y paso: nunca sale dos veces.';

-- Historial: los mensajes solo admiten marcar una vez el envío; los archivos, su borrado
-- de fin de curso; los recordatorios no cambian.
CREATE OR REPLACE FUNCTION kiru_private.material_history_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb;
  v_once text := CASE TG_TABLE_NAME WHEN 'kiru_material_evidence_messages' THEN 'sent_at' ELSE 'deleted_at' END;
  v_person text := CASE TG_TABLE_NAME WHEN 'kiru_material_evidence_messages' THEN 'author_id' ELSE 'uploaded_by' END;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_new := to_jsonb(NEW);
    -- Una sola vez: el envío de la entrega o el borrado del archivo a fin de curso.
    IF v_old ->> v_once IS NULL AND v_new ->> v_once IS NOT NULL AND (v_new - v_once) = (v_old - v_once) THEN
      RETURN NEW;
    END IF;
    -- Borrar un perfil pone a vacío la referencia sin tocar nada más.
    IF v_new ->> v_person IS NULL AND (v_new - v_person) = (v_old - v_person) THEN
      RETURN NEW;
    END IF;
  END IF;
  -- Borrar la entrega entera (por ejemplo, al borrar un alumno) arrastra su historial.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.kiru_material_evidence e WHERE e.id = (v_old ->> 'evidence_id')::uuid) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'El historial de las evidencias no se puede modificar ni borrar.' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION kiru_private.material_history_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS kiru_material_evidence_messages_guard ON public.kiru_material_evidence_messages;
CREATE TRIGGER kiru_material_evidence_messages_guard BEFORE UPDATE OR DELETE ON public.kiru_material_evidence_messages
FOR EACH ROW EXECUTE FUNCTION kiru_private.material_history_guard();
DROP TRIGGER IF EXISTS kiru_material_evidence_files_guard ON public.kiru_material_evidence_files;
CREATE TRIGGER kiru_material_evidence_files_guard BEFORE UPDATE OR DELETE ON public.kiru_material_evidence_files
FOR EACH ROW EXECUTE FUNCTION kiru_private.material_history_guard();

-- 2. Permisos de lectura (nadie escribe directamente) ----------------------------------------
CREATE OR REPLACE FUNCTION kiru_private.can_see_material(p_evidence uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kiru_material_evidence e
    WHERE e.id = p_evidence AND (e.mentor_id = kiru_private.active_uid() OR kiru_private.supervises_mentor(e.mentor_id))
  )
$$;
REVOKE ALL ON FUNCTION kiru_private.can_see_material(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_see_material(uuid) TO authenticated;

ALTER TABLE public.kiru_material_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_material_evidence_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_material_evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_evidence_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_obligation_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kiru_material_evidence_read ON public.kiru_material_evidence;
CREATE POLICY kiru_material_evidence_read ON public.kiru_material_evidence FOR SELECT TO authenticated
  USING (mentor_id = (SELECT kiru_private.active_uid()) OR (SELECT kiru_private.supervises_mentor(mentor_id)));
DROP POLICY IF EXISTS kiru_material_evidence_messages_read ON public.kiru_material_evidence_messages;
CREATE POLICY kiru_material_evidence_messages_read ON public.kiru_material_evidence_messages FOR SELECT TO authenticated
  USING ((SELECT kiru_private.can_see_material(evidence_id)));
DROP POLICY IF EXISTS kiru_material_evidence_files_read ON public.kiru_material_evidence_files;
CREATE POLICY kiru_material_evidence_files_read ON public.kiru_material_evidence_files FOR SELECT TO authenticated
  USING ((SELECT kiru_private.can_see_material(evidence_id)));
DROP POLICY IF EXISTS kiru_evidence_exemptions_read ON public.kiru_evidence_exemptions;
CREATE POLICY kiru_evidence_exemptions_read ON public.kiru_evidence_exemptions FOR SELECT TO authenticated
  USING ((SELECT kiru_private.can_see_material(evidence_id)));
DROP POLICY IF EXISTS kiru_obligation_reminders_read ON public.kiru_obligation_reminders;
CREATE POLICY kiru_obligation_reminders_read ON public.kiru_obligation_reminders FOR SELECT TO authenticated
  USING (evidence_id IS NOT NULL AND (SELECT kiru_private.can_see_material(evidence_id)));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kiru_material_evidence, public.kiru_material_evidence_messages,
  public.kiru_material_evidence_files, public.kiru_evidence_exemptions, public.kiru_obligation_reminders FROM anon, authenticated;
GRANT SELECT ON public.kiru_material_evidence, public.kiru_material_evidence_messages, public.kiru_material_evidence_files,
  public.kiru_evidence_exemptions, public.kiru_obligation_reminders TO authenticated;

-- 3. Almacén: material/{entrega}/{mensaje}/{archivo} -----------------------------------------
-- Subir: solo el mentor de la entrega, en la carpeta de su entrega aún sin enviar (24 h).
CREATE OR REPLACE FUNCTION kiru_private.can_upload_material(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT split_part(p_name, '/', 1) = 'material'
    AND split_part(p_name, '/', 4) <> '' AND split_part(p_name, '/', 5) = ''
    AND EXISTS (
      SELECT 1 FROM public.kiru_material_evidence_messages m
      JOIN public.kiru_material_evidence e ON e.id = m.evidence_id
      WHERE m.id::text = split_part(p_name, '/', 3) AND e.id::text = split_part(p_name, '/', 2)
        AND m.author_id = kiru_private.active_uid() AND e.mentor_id = m.author_id
        AND m.sent_at IS NULL AND m.created_at > now() - interval '1 day'
        AND e.status IN ('pendiente', 'aclaracion'))
$$;
REVOKE ALL ON FUNCTION kiru_private.can_upload_material(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_upload_material(text) TO authenticated;

CREATE OR REPLACE FUNCTION kiru_private.can_read_material(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN split_part(p_name, '/', 1) = 'material'
                AND split_part(p_name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN kiru_private.can_see_material(split_part(p_name, '/', 2)::uuid) ELSE false END
$$;
REVOKE ALL ON FUNCTION kiru_private.can_read_material(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_read_material(text) TO authenticated;

DROP POLICY IF EXISTS "Kiru material upload" ON storage.objects;
CREATE POLICY "Kiru material upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'kiru-evidencias' AND kiru_private.can_upload_material(name));
DROP POLICY IF EXISTS "Kiru material read" ON storage.objects;
CREATE POLICY "Kiru material read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'kiru-evidencias' AND kiru_private.can_read_material(name));

-- Periodos de pago de cada pareja alumno-mentor (pestaña «Pagos»): solo las fechas. Ni
-- importes ni el extra de 10 € salen de aquí.
CREATE OR REPLACE FUNCTION kiru_private.paid_periods()
RETURNS TABLE (mentor_id uuid, student_id uuid, period_start date, period_end date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT x.mentor_id, x.student_id, x.period_start, x.period_end
  FROM public.kiru_mentor_payouts x
  WHERE x.removed_at IS NULL AND x.student_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION kiru_private.paid_periods() FROM PUBLIC;

-- ¿Ve ya el mentor «Mis evidencias»? Solo fuera del modo «oculto» (desde enero, «aprendizaje»).
CREATE OR REPLACE FUNCTION public.kiru_evidence_visible()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.active_uid() IS NOT NULL AND kiru_private.perf_mode() <> 'oculto'
$$;
REVOKE ALL ON FUNCTION public.kiru_evidence_visible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_evidence_visible() TO authenticated;

-- 4. Crear las entregas de cada bimestre -----------------------------------------------------
-- Bimestres de cada pareja alumno-mentor: de 2 en 2 meses desde el inicio de su primer
-- periodo de pago juntos (pestaña «Pagos»). Se crean al empezar el bimestre si la pareja
-- tiene un periodo de pago que lo toque. Al cerrar el bimestre, si la pareja estuvo menos
-- de 4 semanas, la entrega queda exenta sola.
CREATE OR REPLACE FUNCTION kiru_private.evidence_generate()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_from date := kiru_private.perf_data_from();
  p record;
  k integer;
  v_start date;
  v_end date;
  v_kind text;
  v_new integer := 0;
  v_count integer;
  e record;
BEGIN
  FOR p IN
    SELECT x.mentor_id, x.student_id, min(x.period_start) AS first_start
    FROM kiru_private.paid_periods() x
    JOIN public.profiles pm ON pm.id = x.mentor_id AND pm.role = 'mentor'
    GROUP BY x.mentor_id, x.student_id
  LOOP
    k := 0;
    LOOP
      v_start := (p.first_start + make_interval(months => 2 * k))::date;
      EXIT WHEN v_start > v_today OR k > 120;
      v_end := (p.first_start + make_interval(months => 2 * (k + 1)))::date;
      k := k + 1;
      CONTINUE WHEN v_start < v_from;
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM kiru_private.paid_periods() x
        WHERE x.mentor_id = p.mentor_id AND x.student_id = p.student_id
          AND x.period_start < v_end AND x.period_end > v_start);
      FOREACH v_kind IN ARRAY ARRAY['descubrirme', 'mision'] LOOP
        INSERT INTO public.kiru_material_evidence (mentor_id, student_id, kind, bimester_start, bimester_end, due_at)
        VALUES (p.mentor_id, p.student_id, v_kind, v_start, v_end,
                ((v_end + 4)::timestamp + time '23:59:59') AT TIME ZONE 'Europe/Madrid')
        ON CONFLICT (mentor_id, student_id, kind, bimester_start) DO NOTHING;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_new := v_new + v_count;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Bimestres cerrados en los que la pareja estuvo menos de 4 semanas: exentos solos.
  FOR e IN
    SELECT ev.id, ev.mentor_id, ev.student_id, ev.bimester_start, ev.bimester_end
    FROM public.kiru_material_evidence ev
    WHERE ev.status = 'pendiente' AND ev.bimester_end <= v_today
      AND (SELECT coalesce(sum(least(x.period_end, ev.bimester_end) - greatest(x.period_start, ev.bimester_start)), 0)
           FROM kiru_private.paid_periods() x
           WHERE x.mentor_id = ev.mentor_id AND x.student_id = ev.student_id
             AND x.period_start < ev.bimester_end AND x.period_end > ev.bimester_start) < 28
  LOOP
    UPDATE public.kiru_material_evidence
    SET status = 'exenta', status_since = now(), exempt_reason = 'Menos de 4 semanas con este alumno en el bimestre.'
    WHERE id = e.id;
    INSERT INTO public.kiru_material_evidence_messages (evidence_id, author_role, kind, body)
    VALUES (e.id, 'sistema', 'sistema', 'Exenta automáticamente: menos de 4 semanas con este alumno en el bimestre.');
  END LOOP;
  RETURN v_new;
END;
$$;

-- 5. Funciones de escritura ----------------------------------------------------------------
-- Rol de quien actúa sobre una entrega ajena (coordinación o administración).
CREATE OR REPLACE FUNCTION kiru_private.staff_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN kiru_private.is_admin() THEN 'admin' ELSE 'coordinacion' END
$$;

-- El mentor empieza una entrega (o la respuesta a una aclaración): crea el mensaje al que
-- luego adjunta las fotos. La entrega no cambia hasta que la envía.
CREATE OR REPLACE FUNCTION public.kiru_evidence_start(p_evidence uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_e public.kiru_material_evidence;
  v_id uuid;
BEGIN
  SELECT * INTO v_e FROM public.kiru_material_evidence WHERE id = p_evidence;
  IF v_e.id IS NULL OR v_e.mentor_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Solo el mentor de la entrega puede enviarla.' USING ERRCODE = '42501';
  END IF;
  IF v_e.status NOT IN ('pendiente', 'aclaracion') THEN
    RAISE EXCEPTION 'Esta entrega ya no admite cambios.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.kiru_material_evidence_messages (evidence_id, author_id, author_role, kind, body)
  VALUES (p_evidence, v_me, 'mentor', CASE WHEN v_e.status = 'aclaracion' THEN 'respuesta' ELSE 'entrega' END,
          left(trim(coalesce(p_body, '')), 2000))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.kiru_evidence_add_file(p_message uuid, p_path text, p_name text, p_mime text, p_size integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_m public.kiru_material_evidence_messages;
  v_id uuid;
BEGIN
  SELECT * INTO v_m FROM public.kiru_material_evidence_messages WHERE id = p_message;
  IF v_m.id IS NULL OR v_m.author_id IS DISTINCT FROM v_me OR v_m.author_role <> 'mentor' THEN
    RAISE EXCEPTION 'Solo quien prepara la entrega puede adjuntar fotos.' USING ERRCODE = '42501';
  END IF;
  IF v_m.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta entrega ya se envió.' USING ERRCODE = 'P0001';
  END IF;
  IF p_path IS NULL OR split_part(p_path, '/', 1) <> 'material' OR split_part(p_path, '/', 2) <> v_m.evidence_id::text
     OR split_part(p_path, '/', 3) <> v_m.id::text OR split_part(p_path, '/', 4) = '' OR split_part(p_path, '/', 5) <> '' THEN
    RAISE EXCEPTION 'Ruta de archivo no válida.' USING ERRCODE = 'P0001';
  END IF;
  IF p_mime IS NULL OR p_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic') THEN
    RAISE EXCEPTION 'Solo se admiten fotos (JPG, PNG, WEBP o HEIC).' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'kiru-evidencias' AND o.name = p_path) THEN
    RAISE EXCEPTION 'La foto no se ha subido.' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.kiru_material_evidence_files WHERE message_id = p_message) >= 10 THEN
    RAISE EXCEPTION 'Como mucho 10 fotos por envío.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.kiru_material_evidence_files (evidence_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (v_m.evidence_id, p_message, p_path, left(trim(p_name), 200), p_mime, p_size, v_me)
  ON CONFLICT (storage_path) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Enviar: «Descubrirme» necesita al menos 3 fotos (contando las ya enviadas) y una línea de
-- lo que trabajó el alumno; «Misión», al menos 1 foto o una descripción.
CREATE OR REPLACE FUNCTION public.kiru_evidence_send(p_message uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_m public.kiru_material_evidence_messages;
  v_e public.kiru_material_evidence;
  v_photos integer;
  v_has_text boolean;
  v_sup uuid;
BEGIN
  SELECT * INTO v_m FROM public.kiru_material_evidence_messages WHERE id = p_message;
  IF v_m.id IS NULL OR v_m.author_id IS DISTINCT FROM v_me OR v_m.author_role <> 'mentor' THEN
    RAISE EXCEPTION 'Solo el mentor de la entrega puede enviarla.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_e FROM public.kiru_material_evidence WHERE id = v_m.evidence_id FOR UPDATE;
  IF v_m.sent_at IS NOT NULL THEN RETURN; END IF;
  IF v_e.status NOT IN ('pendiente', 'aclaracion') THEN
    RAISE EXCEPTION 'Esta entrega ya no admite cambios.' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_photos FROM public.kiru_material_evidence_files f
  JOIN public.kiru_material_evidence_messages m ON m.id = f.message_id
  WHERE f.evidence_id = v_e.id AND (m.sent_at IS NOT NULL OR m.id = p_message);
  v_has_text := EXISTS (SELECT 1 FROM public.kiru_material_evidence_messages m
                        WHERE m.evidence_id = v_e.id AND m.author_role = 'mentor' AND length(trim(m.body)) >= 10
                          AND (m.sent_at IS NOT NULL OR m.id = p_message));
  IF v_e.kind = 'descubrirme' AND (v_photos < 3 OR NOT v_has_text) THEN
    RAISE EXCEPTION '«Descubrirme» necesita al menos 3 fotos de actividades (sin que salga la cara del alumno) y una línea de qué trabajó.' USING ERRCODE = 'P0001';
  END IF;
  IF v_e.kind = 'mision' AND v_photos < 1 AND NOT v_has_text THEN
    RAISE EXCEPTION 'La misión necesita 1 foto o una descripción corta.' USING ERRCODE = 'P0001';
  END IF;
  IF v_e.status = 'aclaracion' AND length(trim(v_m.body)) = 0 AND NOT EXISTS (SELECT 1 FROM public.kiru_material_evidence_files WHERE message_id = p_message) THEN
    RAISE EXCEPTION 'Contesta a Coordinación o añade alguna foto.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.kiru_material_evidence_messages SET sent_at = now() WHERE id = p_message;
  UPDATE public.kiru_material_evidence
  SET status = 'entregada', status_since = now(), submitted_at = coalesce(submitted_at, now())
  WHERE id = v_e.id;
  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (v_me, 'evidencia_entregada', jsonb_build_object('entrega', v_e.id, 'tipo', v_e.kind, 'fotos', v_photos,
    'tarde', now() > v_e.due_at, 'tras_aclaracion', v_e.status = 'aclaracion'));
  FOR v_sup IN SELECT kiru_private.class_supervisors(v_e.mentor_id) LOOP
    PERFORM kiru_private.supervision_notify(v_sup, v_e.student_id, NULL, NULL, 'evidencia_entregada',
      'Evidencia por revisar',
      coalesce((SELECT full_name FROM public.profiles WHERE id = v_e.mentor_id), 'Un mentor') || ' ha enviado '
        || CASE v_e.kind WHEN 'descubrirme' THEN '«Descubrirme»' ELSE 'la misión' END || ' de '
        || kiru_private.first_name(v_e.student_id) || '. Revísala en el panel de coordinación, pestaña «Seguimiento».',
      'evidencia_entregada:' || p_message, false);
  END LOOP;
END;
$$;

-- Coordinación (o Administración) valida o pide aclaración.
CREATE OR REPLACE FUNCTION public.kiru_evidence_review(p_evidence uuid, p_action text, p_comment text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_e public.kiru_material_evidence;
  v_due timestamptz;
  v_msg uuid;
BEGIN
  SELECT * INTO v_e FROM public.kiru_material_evidence WHERE id = p_evidence FOR UPDATE;
  IF v_e.id IS NULL OR v_me IS NULL OR NOT kiru_private.supervises_mentor(v_e.mentor_id) THEN
    RAISE EXCEPTION 'Solo Coordinación de ese mentor o Administración pueden revisarla.' USING ERRCODE = '42501';
  END IF;
  IF v_e.status <> 'entregada' THEN
    RAISE EXCEPTION 'Solo se revisan entregas enviadas.' USING ERRCODE = 'P0001';
  END IF;
  IF p_action = 'validar' THEN
    UPDATE public.kiru_material_evidence
    SET status = 'validada', status_since = now(), validated_by = v_me, validated_at = now()
    WHERE id = p_evidence;
    INSERT INTO public.kiru_material_evidence_messages (evidence_id, author_id, author_role, kind, body)
    VALUES (p_evidence, v_me, kiru_private.staff_role(), 'validacion', left(trim(coalesce(p_comment, '')), 2000));
    PERFORM kiru_private.supervision_notify(v_e.mentor_id, v_e.student_id, NULL, NULL, 'evidencia_validada',
      'Evidencia validada',
      CASE v_e.kind WHEN 'descubrirme' THEN '«Descubrirme»' ELSE 'La misión' END || ' de ' || kiru_private.first_name(v_e.student_id)
        || ' está validada.' || CASE WHEN length(trim(coalesce(p_comment, ''))) > 0 THEN ' ' || left(trim(p_comment), 400) ELSE '' END,
      'evidencia_validada:' || p_evidence, false);
  ELSIF p_action = 'aclaracion' THEN
    IF length(trim(coalesce(p_comment, ''))) = 0 THEN
      RAISE EXCEPTION 'Explica al mentor qué falta o qué hay que aclarar.' USING ERRCODE = 'P0001';
    END IF;
    v_due := kiru_private.add_working_days(now(), 2);
    UPDATE public.kiru_material_evidence
    SET status = 'aclaracion', status_since = now(), clarification_due_at = v_due
    WHERE id = p_evidence;
    INSERT INTO public.kiru_material_evidence_messages (evidence_id, author_id, author_role, kind, body)
    VALUES (p_evidence, v_me, kiru_private.staff_role(), 'aclaracion', left(trim(p_comment), 2000))
    RETURNING id INTO v_msg;
    PERFORM kiru_private.supervision_notify(v_e.mentor_id, v_e.student_id, NULL, NULL, 'evidencia_aclaracion',
      'Coordinación necesita una aclaración',
      'Sobre ' || CASE v_e.kind WHEN 'descubrirme' THEN '«Descubrirme»' ELSE 'la misión' END || ' de '
        || kiru_private.first_name(v_e.student_id) || ': ' || left(trim(p_comment), 600)
        || ' Tienes hasta el ' || to_char(v_due AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY') || ' para contestar desde «Mis evidencias».',
      'evidencia_aclaracion:' || v_msg, true);
  ELSE
    RAISE EXCEPTION 'Acción no válida.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (v_me, 'evidencia_' || p_action, jsonb_build_object('entrega', p_evidence, 'mentor', v_e.mentor_id, 'tipo', v_e.kind));
END;
$$;

-- Proponer una exención: el mentor (de sus entregas) o Coordinación. Solo la aprueba Administración.
CREATE OR REPLACE FUNCTION public.kiru_evidence_exemption_propose(p_evidence uuid, p_cause text, p_note text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_e public.kiru_material_evidence;
  v_role text;
  v_id uuid;
  v_admin uuid;
BEGIN
  SELECT * INTO v_e FROM public.kiru_material_evidence WHERE id = p_evidence FOR UPDATE;
  IF v_e.id IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'No puedes proponer una exención para esta entrega.' USING ERRCODE = '42501';
  END IF;
  IF v_e.mentor_id = v_me THEN v_role := 'mentor';
  ELSIF kiru_private.supervises_mentor(v_e.mentor_id) THEN v_role := kiru_private.staff_role();
  ELSE RAISE EXCEPTION 'No puedes proponer una exención para esta entrega.' USING ERRCODE = '42501';
  END IF;
  IF v_e.status IN ('validada', 'exenta') THEN
    RAISE EXCEPTION 'Esta entrega ya está cerrada.' USING ERRCODE = 'P0001';
  END IF;
  IF p_cause IS NULL OR p_cause NOT IN ('material_no_disponible', 'ausencia_alumno', 'ausencia_mentor', 'otra') THEN
    RAISE EXCEPTION 'Elige la causa.' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(coalesce(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Explica brevemente la causa.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kiru_evidence_exemptions WHERE evidence_id = p_evidence AND status = 'propuesta') THEN
    RAISE EXCEPTION 'Ya hay una exención propuesta para esta entrega.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.kiru_evidence_exemptions (evidence_id, proposed_by, proposed_role, cause, note)
  VALUES (p_evidence, v_me, v_role, p_cause, left(trim(p_note), 1000))
  RETURNING id INTO v_id;
  INSERT INTO public.kiru_material_evidence_messages (evidence_id, author_id, author_role, kind, body)
  VALUES (p_evidence, v_me, v_role, 'exencion', 'Exención propuesta: ' || left(trim(p_note), 1500));
  INSERT INTO public.kiru_perf_events (actor_id, action, detail)
  VALUES (v_me, 'exencion_propuesta', jsonb_build_object('exencion', v_id, 'entrega', p_evidence, 'causa', p_cause));
  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND is_active LOOP
    PERFORM kiru_private.supervision_notify(v_admin, v_e.student_id, NULL, NULL, 'exencion_propuesta',
      'Exención por aprobar',
      coalesce((SELECT full_name FROM public.profiles WHERE id = v_me), 'Alguien') || ' propone eximir '
        || CASE v_e.kind WHEN 'descubrirme' THEN '«Descubrirme»' ELSE 'la misión' END || ' de ' || kiru_private.first_name(v_e.student_id)
        || '. Apruébala o recházala en «Desempeño de mentores».',
      'exencion_propuesta:' || v_id, false);
  END LOOP;
  RETURN v_id;
END;
$$;

-- Administración aprueba o rechaza una o varias exenciones a la vez.
CREATE OR REPLACE FUNCTION public.kiru_evidence_exemption_decide(p_ids uuid[], p_approve boolean, p_note text DEFAULT '')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  x record;
  v_count integer := 0;
BEGIN
  IF v_me IS NULL OR NOT kiru_private.is_admin() THEN
    RAISE EXCEPTION 'Solo Administración aprueba exenciones.' USING ERRCODE = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Indica si apruebas o rechazas.' USING ERRCODE = 'P0001';
  END IF;
  FOR x IN
    SELECT ex.id, ex.evidence_id, ex.proposed_by, e.mentor_id, e.student_id, e.kind, e.status AS ev_status
    FROM public.kiru_evidence_exemptions ex
    JOIN public.kiru_material_evidence e ON e.id = ex.evidence_id
    WHERE ex.id = ANY (coalesce(p_ids, '{}')) AND ex.status = 'propuesta'
    FOR UPDATE OF ex
  LOOP
    UPDATE public.kiru_evidence_exemptions
    SET status = CASE WHEN p_approve THEN 'aprobada' ELSE 'rechazada' END, decided_by = v_me, decided_at = now(),
        decision_note = left(trim(coalesce(p_note, '')), 1000)
    WHERE id = x.id;
    IF p_approve AND x.ev_status NOT IN ('validada', 'exenta') THEN
      UPDATE public.kiru_material_evidence
      SET status = 'exenta', status_since = now(),
          exempt_reason = left('Exención aprobada por Administración. ' || (SELECT note FROM public.kiru_evidence_exemptions WHERE id = x.id), 500)
      WHERE id = x.evidence_id;
    END IF;
    INSERT INTO public.kiru_material_evidence_messages (evidence_id, author_id, author_role, kind, body)
    VALUES (x.evidence_id, v_me, 'admin', 'exencion',
      CASE WHEN p_approve THEN 'Exención aprobada.' ELSE 'Exención rechazada.' END
        || CASE WHEN length(trim(coalesce(p_note, ''))) > 0 THEN ' ' || left(trim(p_note), 1500) ELSE '' END);
    INSERT INTO public.kiru_perf_events (actor_id, action, detail)
    VALUES (v_me, CASE WHEN p_approve THEN 'exencion_aprobada' ELSE 'exencion_rechazada' END,
      jsonb_build_object('exencion', x.id, 'entrega', x.evidence_id));
    PERFORM kiru_private.supervision_notify(r, x.student_id, NULL, NULL, 'exencion_resuelta',
      CASE WHEN p_approve THEN 'Exención aprobada' ELSE 'Exención rechazada' END,
      CASE x.kind WHEN 'descubrirme' THEN '«Descubrirme»' ELSE 'La misión' END || ' de ' || kiru_private.first_name(x.student_id)
        || CASE WHEN p_approve THEN ': no hace falta entregarla.' ELSE ': sigue siendo obligatoria.' END,
      'exencion_resuelta:' || x.id || ':' || r, false)
    FROM (SELECT DISTINCT u AS r FROM unnest(ARRAY[x.mentor_id, x.proposed_by]) u WHERE u IS NOT NULL AND u <> v_me) rr;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 6. Escalera de recordatorios -------------------------------------------------------------
-- 1.º al vencer el plazo, 2.º a los 2 días laborables, 3.º a los 2 días laborables más:
-- abre una revisión para Coordinación. Nunca crea una incidencia. En modo «oculto» no
-- sale nada.
CREATE OR REPLACE FUNCTION kiru_private.evidence_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e record;
  v_step integer;
  v_base timestamptz;
  v_type text;
  v_obligation uuid;
  v_sent integer := 0;
  v_rows integer;
  v_recipients uuid[];
  v_what text;
  r uuid;
BEGIN
  IF kiru_private.perf_mode() = 'oculto' THEN RETURN 0; END IF;
  FOR e IN
    SELECT ev.*, (SELECT m.id FROM public.kiru_material_evidence_messages m
                  WHERE m.evidence_id = ev.id AND m.kind = 'aclaracion' ORDER BY m.created_at DESC LIMIT 1) AS clar_msg
    FROM public.kiru_material_evidence ev
    WHERE (ev.status = 'pendiente' AND ev.due_at <= now())
       OR (ev.status = 'aclaracion' AND ev.clarification_due_at <= now())
  LOOP
    IF e.status = 'pendiente' THEN
      v_type := 'evidencia'; v_obligation := e.id; v_base := e.due_at;
    ELSE
      v_type := 'aclaracion'; v_obligation := coalesce(e.clar_msg, e.id); v_base := e.clarification_due_at;
    END IF;
    v_what := CASE e.kind WHEN 'descubrirme' THEN '«Descubrirme»' ELSE 'la misión' END || ' de ' || kiru_private.first_name(e.student_id)
      || ' (bimestre del ' || to_char(e.bimester_start, 'DD/MM') || ' al ' || to_char(e.bimester_end - 1, 'DD/MM') || ')';
    FOR v_step IN 1..3 LOOP
      CONTINUE WHEN now() < CASE v_step WHEN 1 THEN v_base ELSE kiru_private.add_working_days(v_base, 2 * (v_step - 1)) END;
      v_recipients := CASE WHEN v_step < 3 THEN ARRAY[e.mentor_id]
                           ELSE ARRAY(SELECT kiru_private.class_supervisors(e.mentor_id)) END;
      INSERT INTO public.kiru_obligation_reminders (obligation_type, obligation_id, evidence_id, step, recipients)
      VALUES (v_type, v_obligation, e.id, v_step, v_recipients)
      ON CONFLICT (obligation_type, obligation_id, step) DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      CONTINUE WHEN v_rows = 0;
      v_sent := v_sent + 1;
      IF v_step < 3 THEN
        PERFORM kiru_private.supervision_notify(e.mentor_id, e.student_id, NULL, NULL, 'evidencia_recordatorio',
          CASE v_step WHEN 1 THEN 'Evidencia pendiente' ELSE 'Segundo recordatorio: evidencia pendiente' END,
          CASE v_type WHEN 'evidencia' THEN 'Aún no has enviado ' || v_what || '. Súbela desde tu menú, en «Mis evidencias».'
                      ELSE 'Coordinación espera tu aclaración sobre ' || v_what || '. Contesta desde «Mis evidencias».' END,
          'evidencia_recordatorio:' || v_type || ':' || v_obligation || ':' || v_step, true);
      ELSE
        INSERT INTO public.kiru_material_evidence_messages (evidence_id, author_role, kind, body)
        VALUES (e.id, 'sistema', 'recordatorio', 'Tercer recordatorio sin respuesta: se abre una revisión para Coordinación.');
        FOREACH r IN ARRAY v_recipients LOOP
          PERFORM kiru_private.supervision_notify(r, e.student_id, NULL, NULL, 'evidencia_revision',
            'Revisión: evidencia sin entregar tras 3 recordatorios',
            coalesce((SELECT full_name FROM public.profiles WHERE id = e.mentor_id), 'Un mentor')
              || CASE v_type WHEN 'evidencia' THEN ' no ha enviado ' ELSE ' no ha contestado la aclaración de ' END || v_what
              || '. Posible falta de responsabilidad o proactividad: decide si propones una incidencia (la aprueba Administración).',
            'evidencia_revision:' || v_type || ':' || v_obligation || ':' || r, true);
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_sent;
END;
$$;

-- Tarea diaria: crea las entregas, exime las cortas y manda los recordatorios.
CREATE OR REPLACE FUNCTION public.kiru_evidencias_tarea_diaria()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new integer;
  v_sent integer;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' AND kiru_private.active_uid() IS NOT NULL AND NOT kiru_private.is_admin() THEN
    RAISE EXCEPTION 'Solo Administración.' USING ERRCODE = '42501';
  END IF;
  v_new := kiru_private.evidence_generate();
  v_sent := kiru_private.evidence_reminders();
  RETURN jsonb_build_object('entregas_nuevas', v_new, 'recordatorios', v_sent);
END;
$$;

REVOKE ALL ON FUNCTION public.kiru_evidence_start(uuid, text), public.kiru_evidence_add_file(uuid, text, text, text, integer),
  public.kiru_evidence_send(uuid), public.kiru_evidence_review(uuid, text, text),
  public.kiru_evidence_exemption_propose(uuid, text, text), public.kiru_evidence_exemption_decide(uuid[], boolean, text),
  public.kiru_evidencias_tarea_diaria() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_evidence_start(uuid, text), public.kiru_evidence_add_file(uuid, text, text, text, integer),
  public.kiru_evidence_send(uuid), public.kiru_evidence_review(uuid, text, text),
  public.kiru_evidence_exemption_propose(uuid, text, text), public.kiru_evidence_exemption_decide(uuid[], boolean, text),
  public.kiru_evidencias_tarea_diaria() TO authenticated;
REVOKE ALL ON FUNCTION kiru_private.perf_mode(), kiru_private.perf_data_from(), kiru_private.evidence_generate(),
  kiru_private.evidence_reminders(), kiru_private.staff_role() FROM PUBLIC;

-- Cada día a las 8:00 UTC (9:00 en Madrid en invierno), después del cálculo de la noche.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      PERFORM cron.schedule('kiru_evidencias_diaria', '0 8 * * *', 'SELECT public.kiru_evidencias_tarea_diaria()');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'pg_cron no disponible (%); la tarea se puede lanzar desde el panel.', SQLERRM;
    END;
  END IF;
END
$do$;

-- 7. Cálculo de A1, A2 y B4 completo ------------------------------------------------------
-- Estado de una entrega para el cálculo: validada = cumple; sin enviar (o sin contestar la
-- aclaración) cuando ya ha pasado el 3.er recordatorio = incumple; el resto no cuenta.
CREATE OR REPLACE FUNCTION kiru_private.evidence_state(p_status text, p_due timestamptz, p_clar_due timestamptz, p_now timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_status = 'validada' THEN 'ok'
    WHEN p_status = 'pendiente' AND p_now > kiru_private.add_working_days(p_due, 4) THEN 'mal'
    WHEN p_status = 'aclaracion' AND p_now > kiru_private.add_working_days(p_clar_due, 4) THEN 'mal'
    ELSE 'no_cuenta' END
$$;

CREATE OR REPLACE FUNCTION kiru_private.perf_indicator_values_2b(p_mentor uuid, p_from timestamptz, p_to timestamptz, p_rules jsonb)
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
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_rec_days int := kiru_private.setting_int('recuperaciones_dias_sin_avanzar', 3);
  v_warning_points numeric := coalesce((p_rules ->> 'a2_warning_points')::numeric, 10);
  b record;
  v_min int;
  v_sc numeric; v_sup numeric; v_mis numeric;
  v_sum numeric; v_w numeric;
  v_detail jsonb;
BEGIN
  -- A1 · «Descubrirme» y misión: entregas que vencen en el periodo -----------------------
  SELECT
    count(*) FILTER (WHERE x.kind = 'descubrirme' AND x.st = 'ok') AS d_ok,
    count(*) FILTER (WHERE x.kind = 'descubrirme' AND x.st = 'mal') AS d_bad,
    count(*) FILTER (WHERE x.kind = 'descubrirme' AND x.st = 'no_cuenta' AND x.status <> 'exenta') AS d_wait,
    count(*) FILTER (WHERE x.kind = 'descubrirme' AND x.status = 'exenta') AS d_exempt,
    count(*) FILTER (WHERE x.kind = 'mision' AND x.st = 'ok') AS m_ok,
    count(*) FILTER (WHERE x.kind = 'mision' AND x.st = 'mal') AS m_bad,
    count(*) FILTER (WHERE x.kind = 'mision' AND x.st = 'no_cuenta' AND x.status <> 'exenta') AS m_wait,
    count(*) FILTER (WHERE x.kind = 'mision' AND x.status = 'exenta') AS m_exempt
  INTO b
  FROM (
    SELECT e.kind, e.status, kiru_private.evidence_state(e.status, e.due_at, e.clarification_due_at, v_now) AS st
    FROM public.kiru_material_evidence e
    WHERE e.mentor_id = p_mentor AND e.due_at >= p_from AND e.due_at < p_to
  ) x;
  v_min := coalesce((p_rules #>> '{min_sample,A1}')::int, 1);
  v_out := v_out || jsonb_build_object('A1', jsonb_build_object(
    'status', CASE WHEN b.d_ok + b.d_bad >= v_min AND b.d_ok + b.d_bad > 0 THEN 'calculado'
                   WHEN b.d_ok + b.d_bad + b.d_wait = 0 THEN 'no_aplica' ELSE 'pendiente' END,
    'value', CASE WHEN b.d_ok + b.d_bad >= v_min AND b.d_ok + b.d_bad > 0 THEN round(100.0 * b.d_ok / (b.d_ok + b.d_bad), 1) END,
    'ok', b.d_ok, 'total', b.d_ok + b.d_bad,
    'detail', jsonb_build_object('validadas', b.d_ok, 'sin_entregar_tras_recordatorios', b.d_bad,
      'pendientes_o_en_revision', b.d_wait, 'exentas', b.d_exempt, 'minimo', v_min)));
  v_mis := CASE WHEN b.m_ok + b.m_bad > 0 THEN 100.0 * b.m_ok / (b.m_ok + b.m_bad) END;
  v_detail := jsonb_build_object('misiones_validadas', b.m_ok, 'misiones_sin_entregar', b.m_bad,
    'misiones_pendientes', b.m_wait, 'misiones_exentas', b.m_exempt);

  -- A2 · SkillCoins: semanas terminadas con clase de este mentor y con SkillCoins registradas.
  SELECT count(*) AS total,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM kiru_private.skillcoin_weeks(w.student_id) s WHERE s.week = w.wk)) AS ok
  INTO b
  FROM (
    SELECT DISTINCT l.student_id, date_trunc('week', l.session_date)::date AS wk
    FROM public.kiru_session_logs l
    WHERE l.mentor_id = p_mentor AND l.student_id IS NOT NULL AND l.session_date IS NOT NULL
      AND coalesce(l.manual_status, '') <> 'archivado'
      AND l.session_date >= v_from AND l.session_date < v_to
      AND date_trunc('week', l.session_date)::date + 7 <= v_today
  ) w;
  v_sc := CASE WHEN b.total > 0 THEN 100.0 * b.ok / b.total END;
  v_detail := v_detail || jsonb_build_object('semanas_con_clase', b.total, 'semanas_con_skillcoins', b.ok);

  -- A2 · Supervisión: justificaciones cerradas sin error real del mentor; los avisos
  -- metodológicos restan según su nivel.
  SELECT count(*) FILTER (WHERE r.resolution IN ('adecuada', 'retirada')) AS ok, count(*) AS total,
         (SELECT coalesce(sum(w.level), 0) FROM public.kiru_methodology_warnings w
          WHERE w.mentor_id = p_mentor AND w.created_at >= p_from AND w.created_at < p_to) AS levels
  INTO b
  FROM public.kiru_skillcoin_reviews r
  WHERE r.mentor_id = p_mentor AND r.status = 'cerrada' AND r.resolved_at >= p_from AND r.resolved_at < p_to;
  v_sup := CASE WHEN b.total > 0 THEN 100.0 * b.ok / b.total WHEN b.levels > 0 THEN 100 END;
  IF v_sup IS NOT NULL THEN v_sup := greatest(0, v_sup - v_warning_points * b.levels); END IF;
  v_detail := v_detail || jsonb_build_object('justificaciones_cerradas', b.total, 'justificaciones_sin_error', b.ok,
    'niveles_de_avisos', b.levels, 'puntos_por_nivel_de_aviso', v_warning_points);

  -- 40 / 30 / 30 sobre las partes que tienen datos.
  v_sum := coalesce(0.4 * v_sc, 0) + coalesce(0.3 * v_sup, 0) + coalesce(0.3 * v_mis, 0);
  v_w := CASE WHEN v_sc IS NOT NULL THEN 0.4 ELSE 0 END + CASE WHEN v_sup IS NOT NULL THEN 0.3 ELSE 0 END
       + CASE WHEN v_mis IS NOT NULL THEN 0.3 ELSE 0 END;
  v_out := v_out || jsonb_build_object('A2', jsonb_build_object(
    'status', CASE WHEN v_w > 0 THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN v_w > 0 THEN round(v_sum / v_w, 1) END,
    'ok', NULL, 'total', NULL,
    'detail', v_detail || jsonb_build_object('parte_skillcoins', round(v_sc, 1), 'parte_supervision', round(v_sup, 1),
      'parte_mision', round(v_mis, 1))));

  -- B4 completo · Recuperaciones: fechas propuestas en plazo y recuperación hecha dentro del
  -- periodo pagado (con excepción aprobada o si la familia renuncia, cumple). Sustituye al B4
  -- de la Fase 1. Una recuperación todavía posible dentro del periodo aún no cuenta.
  SELECT count(*) FILTER (WHERE x.st = 'ok') AS ok, count(*) FILTER (WHERE x.st = 'mal') AS bad,
         count(*) FILTER (WHERE x.st = 'espera') AS waiting,
         coalesce(jsonb_agg(x.id) FILTER (WHERE x.st = 'mal' AND NOT x.on_time), '[]'::jsonb) AS late_ids,
         coalesce(jsonb_agg(x.id) FILTER (WHERE x.st = 'mal' AND x.on_time), '[]'::jsonb) AS outside_ids
  INTO b
  FROM (
    SELECT y.id, y.on_time,
      CASE
        WHEN y.excused THEN 'ok'
        WHEN NOT y.on_time THEN 'mal'
        WHEN y.period_end IS NULL THEN 'ok'
        WHEN y.done_on IS NOT NULL THEN CASE WHEN y.done_on < y.period_end THEN 'ok' ELSE 'mal' END
        WHEN v_today >= y.period_end THEN 'mal'
        ELSE 'espera' END AS st
    FROM (
      SELECT s.id,
        (s.recovery_exception_at IS NOT NULL OR s.recovery = 'rechazada') AS excused,
        (s.recovery_exception_at IS NOT NULL OR s.recovery = 'rechazada' OR EXISTS (
           SELECT 1 FROM public.kiru_class_requests r
           WHERE r.session_id = s.id AND r.kind = 'propuesta_recuperacion'
             AND r.created_at <= s.cancelled_at + make_interval(days => v_rec_days))
         OR EXISTS (
           SELECT 1 FROM public.kiru_class_sessions x
           WHERE x.recovers_session_id = s.id
             AND x.created_at <= s.cancelled_at + make_interval(days => v_rec_days))) AS on_time,
        (SELECT min(p.period_end) FROM kiru_private.paid_periods() p
         WHERE p.student_id = s.student_id
           AND p.period_start <= (s.original_start AT TIME ZONE 'Europe/Madrid')::date
           AND p.period_end > (s.original_start AT TIME ZONE 'Europe/Madrid')::date) AS period_end,
        (SELECT (x.scheduled_start AT TIME ZONE 'Europe/Madrid')::date FROM public.kiru_class_sessions x
         WHERE x.recovers_session_id = s.id AND x.delivery = 'impartida' LIMIT 1) AS done_on
      FROM public.kiru_class_sessions s
      WHERE s.mentor_id = p_mentor AND s.kind = 'regular' AND s.delivery = 'no_impartida'
        AND s.source <> 'historico' AND coalesce(s.cancel_cause, '') <> 'historico_sin_clasificar'
        AND s.recovery <> 'ninguna'
        AND s.cancelled_at >= p_from AND s.cancelled_at < p_to
        AND s.cancelled_at + make_interval(days => v_rec_days) < v_now
    ) y
  ) x;
  v_min := coalesce((p_rules #>> '{min_sample,B4}')::int, 1);
  v_out := v_out || jsonb_build_object('B4', jsonb_build_object(
    'status', CASE WHEN b.ok + b.bad + b.waiting = 0 THEN 'no_aplica' WHEN b.ok + b.bad >= v_min AND b.ok + b.bad > 0 THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN b.ok + b.bad >= v_min AND b.ok + b.bad > 0 THEN round(100.0 * b.ok / (b.ok + b.bad), 1) END,
    'ok', b.ok, 'total', b.ok + b.bad,
    'detail', jsonb_build_object('plazo_dias', v_rec_days, 'fuera_de_plazo', b.late_ids,
      'recuperacion_fuera_del_periodo_pagado', b.outside_ids, 'aun_dentro_del_periodo', b.waiting, 'minimo', v_min)));

  RETURN v_out;
END;
$$;

-- El cálculo de cada mentor junta las fases 1, 2a y 2b (el B4 de 2b sustituye al de la fase 1).
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
             || kiru_private.perf_indicator_values_2b(m.id, p_from, p_to, p_rules);
    -- Las incidencias llegan en la fase 5: de momento ninguna.
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'mentor_id', m.id, 'mentor_name', m.full_name, 'values', v_values,
      'score', kiru_private.perf_assemble(v_values, p_rules, '{"leve":0,"grave":0,"muy_grave":0}'::jsonb,
                 coalesce((v_values #>> '{B1,total}')::int, 0))));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.evidence_state(text, timestamptz, timestamptz, timestamptz),
  kiru_private.perf_indicator_values_2b(uuid, timestamptz, timestamptz, jsonb),
  kiru_private.perf_compute(timestamptz, timestamptz, jsonb) FROM PUBLIC;

-- 8. Catálogo: cómo se mide ahora A1, A2 y B4 ------------------------------------------------
UPDATE public.kiru_perf_indicators SET
  description = 'Entrega bimestral de «Descubrirme» por alumno: al menos 3 fotos de actividades (sin la cara del alumno) y una línea de qué trabajó. Validada = cumple; sin enviar tras los 3 recordatorios = incumple.',
  source = 'Entregas bimestrales por pareja alumno-mentor (2 meses desde su primer periodo de pago juntos, 5 días de plazo), validadas por Coordinación.',
  missing_data = 'Pendiente de enviar o de revisar, o exenta: no cuenta. Con menos de 4 semanas en el bimestre, exenta sola.'
WHERE code = 'A1';
UPDATE public.kiru_perf_indicators SET
  description = '40 %: semanas con clase y SkillCoins registradas; 30 %: justificaciones cerradas sin error real del mentor, restando 10 puntos por nivel de aviso metodológico; 30 %: evidencia bimestral de misión.',
  source = 'Registro de sesión (SkillCoins), supervisión metodológica y entregas de «Misión».',
  missing_data = 'Cada parte sin datos se deja fuera y el resto se reparte. Sin ninguna, queda pendiente.'
WHERE code = 'A2';
UPDATE public.kiru_perf_indicators SET
  description = 'Recuperaciones con fechas propuestas en 3 días (o programadas por Coordinación en ese plazo) y hechas dentro del periodo pagado. También cumplen con excepción aprobada o si la familia renuncia a recuperar.',
  missing_data = 'Sin recuperaciones que organizar: no aplica. Mientras aún se pueda recuperar dentro del periodo, no cuenta.'
WHERE code = 'B4';
