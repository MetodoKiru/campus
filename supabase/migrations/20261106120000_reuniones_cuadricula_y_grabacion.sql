-- Reuniones de coordinación, segunda parte (especificación de Sofía, 02/11/2026):
--
-- 1. Disponibilidad en una cuadrícula de casillas de 30 minutos (lunes a
--    domingo, de 08:00 a 22:00) para mentores Y coordinadores. Se guarda en la
--    misma tabla kiru_mentor_availability (columna nueva «cells»); las columnas
--    antiguas de días y franjas se conservan pero el campus ya no las usa.
-- 2. Seguimiento del compromiso, sin puntuaciones: cuándo guardó por primera
--    vez, y peticiones del coordinador para actualizarla con fecha límite
--    (kiru_availability_requests) con la fecha en que respondió cada mentor
--    (kiru_availability_responses).
-- 3. El coordinador lee su propia cuadrícula. La grabación sigue en la tabla
--    existente kiru_coordination_meeting_private (solo admin y su coordinador).
--
-- Como el resto del módulo, todo se escribe desde el servidor (service_role);
-- authenticated solo lee lo que permiten las políticas.

-- 1. Cuadrícula de 30 minutos ---------------------------------------------------
-- Cada casilla es «día-HH:MM» (inicio del intervalo), p. ej. 'jueves-18:30'.
CREATE OR REPLACE FUNCTION kiru_private.valid_availability_cells(cells text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(bool_and(c ~ '^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)-(0[89]|1[0-9]|2[01]):(00|30)$'), true)
  FROM unnest(cells) AS c
$$;
REVOKE ALL ON FUNCTION kiru_private.valid_availability_cells(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.valid_availability_cells(text[]) TO authenticated, service_role;

ALTER TABLE public.kiru_mentor_availability
  ADD COLUMN cells text[] NOT NULL DEFAULT '{}',
  ADD COLUMN first_saved_at timestamptz;
ALTER TABLE public.kiru_mentor_availability
  ADD CONSTRAINT kiru_mentor_availability_cells_check
  CHECK (cardinality(cells) <= 196 AND kiru_private.valid_availability_cells(cells));

COMMENT ON TABLE public.kiru_mentor_availability IS
  'Disponibilidad para la reunión mensual de coordinación (mentores y coordinadores). La del mentor la ve su coordinador.';
COMMENT ON COLUMN public.kiru_mentor_availability.cells IS
  'Casillas de 30 minutos marcadas, «día-HH:MM» en hora de Madrid. Sustituye a days/slots.';
COMMENT ON COLUMN public.kiru_mentor_availability.first_saved_at IS
  'Primera vez que guardó la cuadrícula.';

-- 2. Peticiones de actualización y respuestas ----------------------------------
CREATE TABLE public.kiru_availability_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 500),
  deadline date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kiru_availability_requests_coordinator_idx ON public.kiru_availability_requests (coordinator_id, created_at DESC);
COMMENT ON TABLE public.kiru_availability_requests IS
  'El coordinador pide a su grupo que revise su disponibilidad antes de una fecha.';

CREATE OR REPLACE FUNCTION kiru_private.availability_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT kiru_private.profile_has_role(NEW.coordinator_id, 'coordinador') THEN
    RAISE EXCEPTION 'La petición tiene que ser de un coordinador.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.coordinator_id IS DISTINCT FROM OLD.coordinator_id THEN
    RAISE EXCEPTION 'No se puede pasar una petición a otro coordinador.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.availability_request_guard() FROM PUBLIC;
CREATE TRIGGER kiru_availability_requests_guard
BEFORE INSERT OR UPDATE ON public.kiru_availability_requests
FOR EACH ROW EXECUTE FUNCTION kiru_private.availability_request_guard();

CREATE TABLE public.kiru_availability_responses (
  request_id uuid NOT NULL REFERENCES public.kiru_availability_requests(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  responded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, mentor_id)
);
CREATE INDEX kiru_availability_responses_mentor_idx ON public.kiru_availability_responses (mentor_id);
COMMENT ON TABLE public.kiru_availability_responses IS
  'Primera vez que el mentor guardó su disponibilidad después de la petición.';

CREATE OR REPLACE FUNCTION kiru_private.availability_response_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.kiru_availability_requests r
    JOIN public.kiru_coordinator_mentors cm ON cm.coordinator_id = r.coordinator_id
    WHERE r.id = NEW.request_id AND cm.mentor_id = NEW.mentor_id
  ) THEN
    RAISE EXCEPTION 'El mentor no es del grupo de ese coordinador.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'La respuesta no se puede cambiar.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.availability_response_guard() FROM PUBLIC;
CREATE TRIGGER kiru_availability_responses_guard
BEFORE INSERT OR UPDATE ON public.kiru_availability_responses
FOR EACH ROW EXECUTE FUNCTION kiru_private.availability_response_guard();

ALTER TABLE public.kiru_availability_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_availability_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY kiru_availability_requests_read ON public.kiru_availability_requests
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR (coordinator_id = (SELECT kiru_private.active_uid()) AND (SELECT kiru_private.kiru_role()) = 'coordinador')
  OR ((SELECT kiru_private.kiru_role()) = 'mentor' AND kiru_private.in_coordinator_group(coordinator_id))
);

CREATE POLICY kiru_availability_responses_read ON public.kiru_availability_responses
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR mentor_id = (SELECT kiru_private.active_uid())
  OR EXISTS (
    SELECT 1 FROM public.kiru_availability_requests r
    WHERE r.id = request_id
      AND r.coordinator_id = (SELECT kiru_private.active_uid())
      AND (SELECT kiru_private.kiru_role()) = 'coordinador'
  )
);

-- 3. Lectura de la propia cuadrícula ------------------------------------------
-- El coordinador también tiene fila (su propia disponibilidad) y puede leerla.
DROP POLICY IF EXISTS kiru_mentor_availability_read ON public.kiru_mentor_availability;
CREATE POLICY kiru_mentor_availability_read ON public.kiru_mentor_availability
FOR SELECT TO authenticated USING (
  (mentor_id = (SELECT kiru_private.active_uid())
    AND (SELECT kiru_private.kiru_role()) = 'mentor'
    AND (SELECT kiru_private.mentor_can_grow(kiru_private.active_uid())))
  OR (mentor_id = (SELECT kiru_private.active_uid()) AND (SELECT kiru_private.kiru_role()) = 'coordinador')
  OR (SELECT kiru_private.is_admin())
  OR (SELECT kiru_private.coordinates_mentor(mentor_id))
);

-- La grabación se registra en la tabla ya existente kiru_coordination_meeting_private
-- (recording_url, jotform_completed_at), que solo leen administración y el
-- coordinador de la reunión. Aquí solo se añade cuándo se registró.
ALTER TABLE public.kiru_coordination_meeting_private
  ADD COLUMN IF NOT EXISTS recording_registered_at timestamptz;

-- Permisos -------------------------------------------------------------------
REVOKE ALL ON public.kiru_availability_requests, public.kiru_availability_responses FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_availability_requests, public.kiru_availability_responses FROM authenticated;
GRANT SELECT ON public.kiru_availability_requests, public.kiru_availability_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiru_availability_requests, public.kiru_availability_responses TO service_role;
