-- Menú ☰ del mentor: «Reuniones con tu coordinador» y «Crece con Kiru».
--
-- Se apoya en lo que ya existe: kiru_mentor_steps y kiru_mentor_onboarding
-- (incorporación), kiru_coordinator_mentors (grupo de cada coordinador) y las
-- funciones de permiso de kiru_private. No crea roles nuevos.
--
-- 1. kiru_onboarding_exceptions: autorización expresa de administración para
--    que un mentor acceda sin haber completado la incorporación. NO toca
--    kiru_mentor_steps: los pasos conservan su estado real. Guarda quién,
--    cuándo y por qué (y, si se retira, quién, cuándo y por qué).
-- 2. kiru_mentor_availability: días y franjas preferidos de cada mentor para
--    la reunión mensual de coordinación.
-- 3. kiru_coordination_meetings: la reunión mensual que fija y confirma a mano
--    el coordinador (fecha, hora, Zoom). El campus no programa nada solo ni
--    habla con calendarios. La grabación NO se guarda aquí: va en el registro
--    de Jotform, que solo ve dirección.
-- 4. kiru_opportunities / kiru_opportunity_applications /
--    kiru_opportunity_recommendations: oportunidades internas que publica
--    administración, candidaturas de los mentores y recomendaciones del
--    coordinador.
--
-- Todas las escrituras pasan por rutas del servidor (service role); los
-- usuarios solo leen lo suyo. Las reglas de negocio importantes (plazo,
-- duplicados, grupo del coordinador) se comprueban también aquí con
-- disparadores, para que no dependan solo de la interfaz.

-- Funciones de permiso --------------------------------------------------------

-- Incorporación completa = los tres pasos del menú completados. El certificado
-- cuenta también si el formador ya lo marcó en kiru_mentor_onboarding (igual
-- que en /api/mentor/panel).
CREATE OR REPLACE FUNCTION kiru_private.mentor_onboarding_complete(mentor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (
      EXISTS (SELECT 1 FROM public.kiru_mentor_onboarding o
              WHERE o.profile_id = mentor AND o.archived_at IS NULL AND o.certificate_checked_at IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.kiru_mentor_steps s
                 WHERE s.mentor_id = mentor AND s.step = 'certificado' AND s.status = 'completado')
    )
    AND EXISTS (SELECT 1 FROM public.kiru_mentor_steps s
                WHERE s.mentor_id = mentor AND s.step = 'nuestro_equipo' AND s.status = 'completado')
    AND EXISTS (SELECT 1 FROM public.kiru_mentor_steps s
                WHERE s.mentor_id = mentor AND s.step = 'llamadas' AND s.status = 'completado')
$$;

-- 1. Autorización excepcional -------------------------------------------------
CREATE TABLE public.kiru_onboarding_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 1000),
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason text NOT NULL DEFAULT '' CHECK (length(revoke_reason) <= 1000)
);
-- Como mucho una autorización en vigor por mentor; las retiradas quedan de historial.
CREATE UNIQUE INDEX kiru_onboarding_exceptions_active_uidx
  ON public.kiru_onboarding_exceptions (mentor_id) WHERE revoked_at IS NULL;
CREATE INDEX kiru_onboarding_exceptions_granted_by_idx ON public.kiru_onboarding_exceptions (granted_by);
CREATE INDEX kiru_onboarding_exceptions_revoked_by_idx ON public.kiru_onboarding_exceptions (revoked_by);

COMMENT ON TABLE public.kiru_onboarding_exceptions IS
  'Autorizaciones expresas de administración para acceder sin incorporación completa. No cambian los pasos.';

-- El registro no se reescribe: solo se puede retirar (una vez) y con quién y cuándo.
CREATE OR REPLACE FUNCTION kiru_private.onboarding_exception_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT kiru_private.profile_has_role(NEW.mentor_id, 'mentor') THEN
      RAISE EXCEPTION 'Solo se puede autorizar a un mentor.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.granted_by IS NULL OR NOT kiru_private.profile_has_role(NEW.granted_by, 'admin') THEN
      RAISE EXCEPTION 'Solo administración puede autorizar la excepción.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.revoked_at := NULL; NEW.revoked_by := NULL; NEW.revoke_reason := '';
    RETURN NEW;
  END IF;
  IF NEW.mentor_id IS DISTINCT FROM OLD.mentor_id OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.granted_by IS DISTINCT FROM OLD.granted_by OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Una autorización registrada no se modifica; solo se puede retirar.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL OR NOT kiru_private.profile_has_role(NEW.revoked_by, 'admin') THEN
    RAISE EXCEPTION 'Para retirarla hace falta la fecha y quién la retira.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.onboarding_exception_guard() FROM PUBLIC;

CREATE TRIGGER kiru_onboarding_exceptions_guard
BEFORE INSERT OR UPDATE ON public.kiru_onboarding_exceptions
FOR EACH ROW EXECUTE FUNCTION kiru_private.onboarding_exception_guard();

ALTER TABLE public.kiru_onboarding_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_onboarding_exceptions FROM anon, authenticated;
CREATE POLICY kiru_onboarding_exceptions_read ON public.kiru_onboarding_exceptions
FOR SELECT TO authenticated
USING ((SELECT kiru_private.is_admin()));

-- ¿Puede este mentor ver «Reuniones» y «Crece con Kiru»?
CREATE OR REPLACE FUNCTION kiru_private.mentor_can_grow(mentor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.profile_has_role(mentor, 'mentor') AND (
    kiru_private.mentor_onboarding_complete(mentor)
    OR EXISTS (SELECT 1 FROM public.kiru_onboarding_exceptions e WHERE e.mentor_id = mentor AND e.revoked_at IS NULL)
  )
$$;

REVOKE ALL ON FUNCTION kiru_private.mentor_onboarding_complete(uuid), kiru_private.mentor_can_grow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.mentor_onboarding_complete(uuid), kiru_private.mentor_can_grow(uuid) TO authenticated;

-- Para el servidor: una sola fuente de verdad sobre el acceso del mentor.
CREATE OR REPLACE FUNCTION public.kiru_mentor_growth_access(p_mentor uuid)
RETURNS TABLE (onboarding_complete boolean, exception_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.mentor_onboarding_complete(p_mentor),
         EXISTS (SELECT 1 FROM public.kiru_onboarding_exceptions e WHERE e.mentor_id = p_mentor AND e.revoked_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.kiru_mentor_growth_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_mentor_growth_access(uuid) TO service_role;

-- 2. Disponibilidad del mentor --------------------------------------------------
CREATE TABLE public.kiru_mentor_availability (
  mentor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  days text[] NOT NULL DEFAULT '{}'
    CHECK (days <@ ARRAY['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']),
  slots text[] NOT NULL DEFAULT '{}'
    CHECK (slots <@ ARRAY['manana', 'mediodia', 'tarde', 'noche']),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.kiru_mentor_availability IS
  'Preferencias del mentor para la reunión mensual de coordinación. Las ve su coordinador.';

CREATE TRIGGER kiru_mentor_availability_touch
BEFORE UPDATE ON public.kiru_mentor_availability
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

ALTER TABLE public.kiru_mentor_availability ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_mentor_availability FROM anon, authenticated;
CREATE POLICY kiru_mentor_availability_read ON public.kiru_mentor_availability
FOR SELECT TO authenticated
USING (
  mentor_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR (SELECT kiru_private.coordinates_mentor(mentor_id))
);

-- 3. Reuniones de coordinación ------------------------------------------------
CREATE TABLE public.kiru_coordination_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 15 AND 120),
  zoom_url text NOT NULL DEFAULT '' CHECK (zoom_url = '' OR (zoom_url ~ '^https://[^[:space:]]+$' AND length(zoom_url) <= 500)),
  -- borrador: solo la ve el coordinador. confirmada: convocada, la ven sus mentores.
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'confirmada', 'realizada', 'cancelada')),
  agenda text NOT NULL DEFAULT '' CHECK (length(agenda) <= 1000),
  confirmed_at timestamptz,
  held_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text NOT NULL DEFAULT '' CHECK (length(cancel_reason) <= 500),
  -- El coordinador marca que ha enviado el registro de Jotform (plazo: 24 h).
  report_sent_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'borrador' OR status = 'cancelada' OR zoom_url <> ''),
  CHECK (status <> 'confirmada' OR confirmed_at IS NOT NULL)
);
-- Una reunión al mes por coordinador (las canceladas no cuentan).
CREATE UNIQUE INDEX kiru_coordination_meetings_month_uidx
  ON public.kiru_coordination_meetings (coordinator_id, (date_trunc('month', scheduled_at AT TIME ZONE 'Europe/Madrid')))
  WHERE status <> 'cancelada';
CREATE INDEX kiru_coordination_meetings_coordinator_idx ON public.kiru_coordination_meetings (coordinator_id, scheduled_at DESC);
CREATE INDEX kiru_coordination_meetings_created_by_idx ON public.kiru_coordination_meetings (created_by);

COMMENT ON TABLE public.kiru_coordination_meetings IS
  'Reunión mensual de coordinación que fija a mano el coordinador. Sin grabación: va en el registro de Jotform.';

CREATE OR REPLACE FUNCTION kiru_private.coordination_meeting_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT kiru_private.profile_has_role(NEW.coordinator_id, 'coordinador') THEN
    RAISE EXCEPTION 'La reunión tiene que ser de un coordinador.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.coordinator_id IS DISTINCT FROM OLD.coordinator_id THEN
    RAISE EXCEPTION 'No se puede pasar una reunión a otro coordinador.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.coordination_meeting_guard() FROM PUBLIC;

CREATE TRIGGER kiru_coordination_meetings_guard
BEFORE INSERT OR UPDATE ON public.kiru_coordination_meetings
FOR EACH ROW EXECUTE FUNCTION kiru_private.coordination_meeting_guard();
CREATE TRIGGER kiru_coordination_meetings_touch
BEFORE UPDATE ON public.kiru_coordination_meetings
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

-- ¿Es este mentor del grupo de ese coordinador?
CREATE OR REPLACE FUNCTION kiru_private.in_coordinator_group(coordinator uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kiru_coordinator_mentors cm
    WHERE cm.coordinator_id = coordinator AND cm.mentor_id = kiru_private.active_uid()
  )
$$;
REVOKE ALL ON FUNCTION kiru_private.in_coordinator_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.in_coordinator_group(uuid) TO authenticated;

ALTER TABLE public.kiru_coordination_meetings ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_coordination_meetings FROM anon, authenticated;
CREATE POLICY kiru_coordination_meetings_read ON public.kiru_coordination_meetings
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR (coordinator_id = (SELECT kiru_private.active_uid()) AND (SELECT kiru_private.kiru_role()) = 'coordinador')
  OR (
    status <> 'borrador'
    AND (SELECT kiru_private.kiru_role()) = 'mentor'
    AND kiru_private.in_coordinator_group(coordinator_id)
    AND (SELECT kiru_private.mentor_can_grow(kiru_private.active_uid()))
  )
);

-- 4. Oportunidades internas -----------------------------------------------------
CREATE TABLE public.kiru_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  area text NOT NULL CHECK (area IN ('coordinacion', 'formacion', 'metodologia', 'operaciones', 'comunicacion', 'campus')),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  functions text NOT NULL DEFAULT '' CHECK (length(functions) <= 4000),
  requirements text NOT NULL DEFAULT '' CHECK (length(requirements) <= 4000),
  dedication text NOT NULL DEFAULT '' CHECK (length(dedication) <= 200),
  modality text NOT NULL DEFAULT '' CHECK (length(modality) <= 200),
  -- Solo se enseña si administración la marca como autorizada y la rellena.
  remuneration text NOT NULL DEFAULT '' CHECK (length(remuneration) <= 300),
  remuneration_authorized boolean NOT NULL DEFAULT false,
  deadline date,
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'publicada', 'cerrada')),
  published_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'borrador' OR published_at IS NOT NULL),
  CHECK (NOT remuneration_authorized OR length(trim(remuneration)) > 0)
);
CREATE INDEX kiru_opportunities_status_idx ON public.kiru_opportunities (status, deadline);
CREATE INDEX kiru_opportunities_created_by_idx ON public.kiru_opportunities (created_by);
CREATE INDEX kiru_opportunities_updated_by_idx ON public.kiru_opportunities (updated_by);

COMMENT ON TABLE public.kiru_opportunities IS
  'Oportunidades internas reales que publica administración. Sin ejemplos ni puestos ficticios.';

CREATE TRIGGER kiru_opportunities_touch
BEFORE UPDATE ON public.kiru_opportunities
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

-- Abierta = publicada y dentro de plazo (fecha límite incluida, hora de Madrid).
CREATE OR REPLACE FUNCTION kiru_private.opportunity_is_open(opportunity uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kiru_opportunities o
    WHERE o.id = opportunity AND o.status = 'publicada'
      AND (o.deadline IS NULL OR o.deadline >= (now() AT TIME ZONE 'Europe/Madrid')::date)
  )
$$;
REVOKE ALL ON FUNCTION kiru_private.opportunity_is_open(uuid) FROM PUBLIC;

CREATE TABLE public.kiru_opportunity_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.kiru_opportunities(id) ON DELETE RESTRICT,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  motivation text NOT NULL DEFAULT '' CHECK (length(motivation) <= 2000),
  status text NOT NULL DEFAULT 'enviada' CHECK (status IN ('enviada', 'en_revision', 'entrevista', 'aceptada', 'no_seleccionada')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  status_changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Una candidatura por mentor y oportunidad.
  UNIQUE (opportunity_id, mentor_id)
);
CREATE INDEX kiru_opportunity_applications_mentor_idx ON public.kiru_opportunity_applications (mentor_id);
CREATE INDEX kiru_opportunity_applications_changed_by_idx ON public.kiru_opportunity_applications (status_changed_by);

CREATE OR REPLACE FUNCTION kiru_private.opportunity_application_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT kiru_private.mentor_can_grow(NEW.mentor_id) THEN
      RAISE EXCEPTION 'Este mentor todavía no tiene acceso a las oportunidades.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT kiru_private.opportunity_is_open(NEW.opportunity_id) THEN
      RAISE EXCEPTION 'Esta oportunidad está cerrada o fuera de plazo.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.status := 'enviada';
    NEW.submitted_at := now();
    NEW.status_changed_at := now();
    NEW.status_changed_by := NULL;
    RETURN NEW;
  END IF;
  IF NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id OR NEW.mentor_id IS DISTINCT FROM OLD.mentor_id
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.motivation IS DISTINCT FROM OLD.motivation THEN
    RAISE EXCEPTION 'De una candidatura solo cambia el estado.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.status_changed_at := now(); END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.opportunity_application_guard() FROM PUBLIC;

CREATE TRIGGER kiru_opportunity_applications_guard
BEFORE INSERT OR UPDATE ON public.kiru_opportunity_applications
FOR EACH ROW EXECUTE FUNCTION kiru_private.opportunity_application_guard();

CREATE TABLE public.kiru_opportunity_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.kiru_opportunities(id) ON DELETE RESTRICT,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coordinator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 3 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, mentor_id, coordinator_id)
);
CREATE INDEX kiru_opportunity_recommendations_mentor_idx ON public.kiru_opportunity_recommendations (mentor_id);
CREATE INDEX kiru_opportunity_recommendations_coordinator_idx ON public.kiru_opportunity_recommendations (coordinator_id);

CREATE OR REPLACE FUNCTION kiru_private.opportunity_recommendation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.kiru_coordinator_mentors cm
    WHERE cm.mentor_id = NEW.mentor_id AND cm.coordinator_id = NEW.coordinator_id
  ) OR NOT kiru_private.profile_has_role(NEW.coordinator_id, 'coordinador') THEN
    RAISE EXCEPTION 'Solo se puede recomendar a mentores del propio grupo.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kiru_opportunities o WHERE o.id = NEW.opportunity_id AND o.status = 'publicada') THEN
    RAISE EXCEPTION 'Solo se puede recomendar para oportunidades publicadas.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.opportunity_recommendation_guard() FROM PUBLIC;

CREATE TRIGGER kiru_opportunity_recommendations_guard
BEFORE INSERT OR UPDATE ON public.kiru_opportunity_recommendations
FOR EACH ROW EXECUTE FUNCTION kiru_private.opportunity_recommendation_guard();

ALTER TABLE public.kiru_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_opportunity_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_opportunity_recommendations ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_opportunities, public.kiru_opportunity_applications, public.kiru_opportunity_recommendations FROM anon, authenticated;

-- Mentor: las publicadas y las cerradas a las que se presentó. Coordinador:
-- publicadas y cerradas (para recomendar). Borradores: solo administración.
CREATE POLICY kiru_opportunities_read ON public.kiru_opportunities
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR (status <> 'borrador' AND (SELECT kiru_private.kiru_role()) = 'coordinador')
  OR (
    (SELECT kiru_private.kiru_role()) = 'mentor'
    AND (SELECT kiru_private.mentor_can_grow(kiru_private.active_uid()))
    AND (
      status = 'publicada'
      OR (status = 'cerrada' AND EXISTS (
        SELECT 1 FROM public.kiru_opportunity_applications a
        WHERE a.opportunity_id = kiru_opportunities.id AND a.mentor_id = (SELECT kiru_private.active_uid())
      ))
    )
  )
);

CREATE POLICY kiru_opportunity_applications_read ON public.kiru_opportunity_applications
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR mentor_id = (SELECT kiru_private.active_uid())
);

CREATE POLICY kiru_opportunity_recommendations_read ON public.kiru_opportunity_recommendations
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR (coordinator_id = (SELECT kiru_private.active_uid()) AND (SELECT kiru_private.kiru_role()) = 'coordinador')
);

-- Nada de esto es público.
REVOKE ALL ON public.kiru_onboarding_exceptions, public.kiru_mentor_availability, public.kiru_coordination_meetings,
  public.kiru_opportunities, public.kiru_opportunity_applications, public.kiru_opportunity_recommendations FROM anon;

-- Supabase 2026: las tablas nuevas no reciben permisos de Data API por defecto.
-- Las rutas del servidor usan service_role; authenticated solo tiene lectura,
-- siempre filtrada por las políticas RLS definidas arriba.
GRANT SELECT ON public.kiru_onboarding_exceptions,
  public.kiru_mentor_availability,
  public.kiru_coordination_meetings,
  public.kiru_opportunities,
  public.kiru_opportunity_applications,
  public.kiru_opportunity_recommendations
TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiru_onboarding_exceptions,
  public.kiru_mentor_availability,
  public.kiru_coordination_meetings,
  public.kiru_opportunities,
  public.kiru_opportunity_applications,
  public.kiru_opportunity_recommendations
TO service_role;
