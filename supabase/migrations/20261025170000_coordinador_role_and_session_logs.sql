-- Rol de coordinador, enlace coordinador → mentores y registros de sesión.
--
-- 1. profiles admite el rol 'coordinador'.
-- 2. kiru_coordinator_mentors: cada mentor tiene como mucho un coordinador y
--    cada coordinador como mucho 5 mentores (Sprint 3). Solo administración
--    crea o cambia estos enlaces. Los alumnos llegan al coordinador a través de
--    su mentor: si un alumno cambia de mentor, cambia de coordinador solo.
-- 3. El coordinador puede LEER sus mentores, los alumnos de esos mentores, las
--    familias de esos alumnos, las asignaciones y los registros del campus de
--    esos alumnos. No puede escribir en ninguna de esas tablas ni ver pagos.
-- 4. kiru_session_logs guarda las respuestas del formulario «Registro de
--    sesión» que envía el Apps Script de la hoja. Las ven administración, el
--    mentor que la envió y el coordinador de ese mentor.
-- 5. kiru_incident_reviews: el coordinador marca una incidencia como revisada
--    y deja una nota. Separado del registro para que nadie pueda tocar lo que
--    escribió el mentor.

-- Rol ------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'mentor', 'padre', 'alumno', 'formador', 'coordinador'));

CREATE OR REPLACE FUNCTION public.handle_new_kiru_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text;
  v_role text;
BEGIN
  v_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Usuario Kiru'
  );

  -- Only app_metadata is trusted for privileged roles; user_metadata is user-editable.
  v_role := CASE
    WHEN NEW.raw_app_meta_data ->> 'kiru_role' IN ('admin', 'mentor', 'padre', 'alumno', 'formador', 'coordinador')
      THEN NEW.raw_app_meta_data ->> 'kiru_role'
    ELSE 'alumno'
  END;

  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES (NEW.id, v_name, v_role, true)
  ON CONFLICT (id) DO NOTHING;

  IF v_role = 'alumno' THEN
    INSERT INTO public.students (profile_id)
    VALUES (NEW.id)
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Enlace coordinador → mentores ---------------------------------------------
CREATE TABLE public.kiru_coordinator_mentors (
  mentor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  coordinator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mentor_id <> coordinator_id)
);
CREATE INDEX kiru_coordinator_mentors_coordinator_idx ON public.kiru_coordinator_mentors (coordinator_id);

COMMENT ON TABLE public.kiru_coordinator_mentors IS
  'Qué coordinador lleva a cada mentor. Un coordinador, como mucho 5 mentores.';

-- Funciones de permiso. SECURITY DEFINER para no aplicar RLS dentro (evita la
-- recursión entre profiles, student_mentors y esta tabla).
CREATE OR REPLACE FUNCTION kiru_private.coordinates_mentor(mentor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.kiru_role() = 'coordinador' AND EXISTS (
    SELECT 1 FROM public.kiru_coordinator_mentors cm
    WHERE cm.mentor_id = mentor AND cm.coordinator_id = kiru_private.active_uid()
  )
$$;

CREATE OR REPLACE FUNCTION kiru_private.coordinates_student(student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.kiru_role() = 'coordinador' AND EXISTS (
    SELECT 1
    FROM public.student_mentors sm
    JOIN public.kiru_coordinator_mentors cm ON cm.mentor_id = sm.mentor_id
    WHERE sm.student_id = student AND cm.coordinator_id = kiru_private.active_uid()
  )
$$;

CREATE OR REPLACE FUNCTION kiru_private.coordinates_guardian(guardian uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.kiru_role() = 'coordinador' AND EXISTS (
    SELECT 1
    FROM public.student_guardians sg
    JOIN public.student_mentors sm ON sm.student_id = sg.student_id
    JOIN public.kiru_coordinator_mentors cm ON cm.mentor_id = sm.mentor_id
    WHERE sg.guardian_id = guardian AND cm.coordinator_id = kiru_private.active_uid()
  )
$$;

REVOKE ALL ON FUNCTION kiru_private.coordinates_mentor(uuid), kiru_private.coordinates_student(uuid), kiru_private.coordinates_guardian(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.coordinates_mentor(uuid), kiru_private.coordinates_student(uuid), kiru_private.coordinates_guardian(uuid) TO authenticated;

ALTER TABLE public.kiru_coordinator_mentors ENABLE ROW LEVEL SECURITY;

CREATE POLICY kiru_coordinator_mentors_read ON public.kiru_coordinator_mentors
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR coordinator_id = (SELECT kiru_private.active_uid())
);
CREATE POLICY kiru_coordinator_mentors_admin_insert ON public.kiru_coordinator_mentors
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT kiru_private.is_admin())
  AND kiru_private.profile_has_role(mentor_id, 'mentor')
  AND kiru_private.profile_has_role(coordinator_id, 'coordinador')
);
CREATE POLICY kiru_coordinator_mentors_admin_update ON public.kiru_coordinator_mentors
FOR UPDATE TO authenticated
USING ((SELECT kiru_private.is_admin()))
WITH CHECK (
  (SELECT kiru_private.is_admin())
  AND kiru_private.profile_has_role(mentor_id, 'mentor')
  AND kiru_private.profile_has_role(coordinator_id, 'coordinador')
);
CREATE POLICY kiru_coordinator_mentors_admin_delete ON public.kiru_coordinator_mentors
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- Máximo 5 mentores por coordinador.
CREATE OR REPLACE FUNCTION kiru_private.limit_mentors_per_coordinator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('kiru_coordinator_' || NEW.coordinator_id::text));
  IF (
    SELECT count(*) FROM public.kiru_coordinator_mentors cm
    WHERE cm.coordinator_id = NEW.coordinator_id AND cm.mentor_id <> NEW.mentor_id
  ) >= 5 THEN
    RAISE EXCEPTION 'Este coordinador ya tiene 5 mentores, que es el máximo.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.limit_mentors_per_coordinator() FROM PUBLIC;

CREATE TRIGGER kiru_coordinator_mentors_limit
BEFORE INSERT OR UPDATE OF coordinator_id ON public.kiru_coordinator_mentors
FOR EACH ROW EXECUTE FUNCTION kiru_private.limit_mentors_per_coordinator();

-- Lectura para el coordinador en las tablas que ya existían ------------------
-- Se rehacen las políticas SELECT de 20261024140000 añadiendo solo la rama del
-- coordinador. Las de escritura no cambian: el coordinador no escribe aquí.
DROP POLICY IF EXISTS profiles_read_self_admin_related_students ON public.profiles;
CREATE POLICY profiles_read_self_admin_related_students ON public.profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR (
    role = 'alumno' AND (
      EXISTS (SELECT 1 FROM public.student_mentors sm
              WHERE sm.student_id = profiles.id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
      OR EXISTS (SELECT 1 FROM public.student_guardians sg
                 WHERE sg.student_id = profiles.id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
      OR kiru_private.coordinates_student(profiles.id)
    )
  )
  OR (role = 'mentor' AND kiru_private.coordinates_mentor(profiles.id))
  OR (role = 'padre' AND kiru_private.coordinates_guardian(profiles.id))
);

DROP POLICY IF EXISTS students_read_authorized ON public.students;
CREATE POLICY students_read_authorized ON public.students
FOR SELECT TO authenticated
USING (
  profile_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR EXISTS (SELECT 1 FROM public.student_mentors sm
             WHERE sm.student_id = students.profile_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = students.profile_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
  OR kiru_private.coordinates_student(students.profile_id)
);

DROP POLICY IF EXISTS student_mentors_read_involved ON public.student_mentors;
CREATE POLICY student_mentors_read_involved ON public.student_mentors
FOR SELECT TO authenticated
USING (
  mentor_id = (SELECT kiru_private.active_uid())
  OR student_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR kiru_private.coordinates_mentor(mentor_id)
);

DROP POLICY IF EXISTS student_guardians_read_involved ON public.student_guardians;
CREATE POLICY student_guardians_read_involved ON public.student_guardians
FOR SELECT TO authenticated
USING (
  guardian_id = (SELECT kiru_private.active_uid())
  OR student_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR kiru_private.coordinates_student(student_id)
);

DROP POLICY IF EXISTS kiru_records_read_authorized ON public.kiru_app_records;
CREATE POLICY kiru_records_read_authorized ON public.kiru_app_records
FOR SELECT TO authenticated
USING (
  owner_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR EXISTS (SELECT 1 FROM public.student_mentors sm
             WHERE sm.student_id = kiru_app_records.owner_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = kiru_app_records.owner_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
  OR kiru_private.coordinates_student(kiru_app_records.owner_id)
);

-- Registros de sesión (formulario de Google) --------------------------------
CREATE TABLE public.kiru_session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Marca temporal + mentor + alumno tal como vienen de la hoja: reimportar no duplica.
  source_key text NOT NULL UNIQUE CHECK (length(source_key) BETWEEN 1 AND 400),
  submitted_at timestamptz NOT NULL,
  session_date date,
  mentor_name text NOT NULL DEFAULT '' CHECK (length(mentor_name) <= 160),
  student_name text NOT NULL DEFAULT '' CHECK (length(student_name) <= 160),
  respondent_email text CHECK (respondent_email IS NULL OR length(respondent_email) <= 320),
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  incident text NOT NULL DEFAULT '' CHECK (length(incident) <= 4000),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kiru_session_logs_mentor_idx ON public.kiru_session_logs (mentor_id, session_date DESC);
CREATE INDEX kiru_session_logs_student_idx ON public.kiru_session_logs (student_id);

COMMENT ON TABLE public.kiru_session_logs IS
  'Respuestas del formulario «Registro de sesión». Las escribe solo el servidor (importación desde la hoja).';

CREATE TRIGGER kiru_session_logs_touch
BEFORE UPDATE ON public.kiru_session_logs
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

ALTER TABLE public.kiru_session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY kiru_session_logs_read ON public.kiru_session_logs
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR mentor_id = (SELECT kiru_private.active_uid())
  OR kiru_private.coordinates_mentor(mentor_id)
);
CREATE POLICY kiru_session_logs_admin_insert ON public.kiru_session_logs
FOR INSERT TO authenticated WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY kiru_session_logs_admin_update ON public.kiru_session_logs
FOR UPDATE TO authenticated USING ((SELECT kiru_private.is_admin())) WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY kiru_session_logs_admin_delete ON public.kiru_session_logs
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- Revisión de incidencias -----------------------------------------------------
CREATE OR REPLACE FUNCTION kiru_private.coordinates_log(log uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kiru_session_logs l
    WHERE l.id = log AND kiru_private.coordinates_mentor(l.mentor_id)
  )
$$;
REVOKE ALL ON FUNCTION kiru_private.coordinates_log(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.coordinates_log(uuid) TO authenticated;

CREATE TABLE public.kiru_incident_reviews (
  log_id uuid PRIMARY KEY REFERENCES public.kiru_session_logs(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kiru_incident_reviews_reviewed_by_idx ON public.kiru_incident_reviews (reviewed_by);

ALTER TABLE public.kiru_incident_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY kiru_incident_reviews_read ON public.kiru_incident_reviews
FOR SELECT TO authenticated
USING ((SELECT kiru_private.is_admin()) OR kiru_private.coordinates_log(log_id));
CREATE POLICY kiru_incident_reviews_insert ON public.kiru_incident_reviews
FOR INSERT TO authenticated
WITH CHECK (
  reviewed_by = (SELECT kiru_private.active_uid())
  AND ((SELECT kiru_private.is_admin()) OR kiru_private.coordinates_log(log_id))
);
CREATE POLICY kiru_incident_reviews_update ON public.kiru_incident_reviews
FOR UPDATE TO authenticated
USING ((SELECT kiru_private.is_admin()) OR kiru_private.coordinates_log(log_id))
WITH CHECK (
  reviewed_by = (SELECT kiru_private.active_uid())
  AND ((SELECT kiru_private.is_admin()) OR kiru_private.coordinates_log(log_id))
);
CREATE POLICY kiru_incident_reviews_delete ON public.kiru_incident_reviews
FOR DELETE TO authenticated
USING ((SELECT kiru_private.is_admin()) OR kiru_private.coordinates_log(log_id));
