-- Privacidad y acceso se añaden sobre las tablas ya creadas en Preview.
-- El enlace de grabación nunca se almacena en la convocatoria que leen mentores.
CREATE TABLE public.kiru_coordination_meeting_private (
  meeting_id uuid PRIMARY KEY REFERENCES public.kiru_coordination_meetings(id) ON DELETE RESTRICT,
  recording_url text NOT NULL DEFAULT '' CHECK (recording_url = '' OR (recording_url ~ '^https://[^[:space:]]+$' AND length(recording_url) <= 2000)),
  jotform_completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kiru_coordination_meeting_private ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiru_coordination_meeting_private_read ON public.kiru_coordination_meeting_private
FOR SELECT TO authenticated USING (
  (SELECT kiru_private.is_admin())
  OR EXISTS (SELECT 1 FROM public.kiru_coordination_meetings m
    WHERE m.id = meeting_id AND m.coordinator_id = (SELECT kiru_private.active_uid())
      AND (SELECT kiru_private.kiru_role()) = 'coordinador')
);
REVOKE ALL ON public.kiru_coordination_meeting_private FROM anon, authenticated;
GRANT SELECT ON public.kiru_coordination_meeting_private TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.kiru_coordination_meeting_private TO service_role;

DROP POLICY IF EXISTS kiru_mentor_availability_read ON public.kiru_mentor_availability;
CREATE POLICY kiru_mentor_availability_read ON public.kiru_mentor_availability
FOR SELECT TO authenticated USING (
  (mentor_id = (SELECT kiru_private.active_uid())
    AND (SELECT kiru_private.kiru_role()) = 'mentor'
    AND (SELECT kiru_private.mentor_can_grow(kiru_private.active_uid())))
  OR (SELECT kiru_private.is_admin())
  OR (SELECT kiru_private.coordinates_mentor(mentor_id))
);

-- Refuerza RLS si se accede directamente al Data API y no desde las rutas del Campus.
DROP POLICY IF EXISTS kiru_opportunity_applications_read ON public.kiru_opportunity_applications;
CREATE POLICY kiru_opportunity_applications_read ON public.kiru_opportunity_applications
FOR SELECT TO authenticated USING (
  (SELECT kiru_private.is_admin())
  OR (mentor_id = (SELECT kiru_private.active_uid())
    AND (SELECT kiru_private.mentor_can_grow(kiru_private.active_uid())))
);
DROP POLICY IF EXISTS kiru_opportunities_read ON public.kiru_opportunities;
CREATE POLICY kiru_opportunities_read ON public.kiru_opportunities
FOR SELECT TO authenticated USING (
  (SELECT kiru_private.is_admin())
  OR ((SELECT kiru_private.kiru_role()) = 'coordinador' AND status <> 'borrador')
  OR ((SELECT kiru_private.kiru_role()) = 'mentor'
    AND (SELECT kiru_private.mentor_can_grow(kiru_private.active_uid()))
    AND ((status = 'publicada' AND (deadline IS NULL OR deadline >= (now() AT TIME ZONE 'Europe/Madrid')::date))
      OR (status <> 'borrador' AND EXISTS (SELECT 1 FROM public.kiru_opportunity_applications a
        WHERE a.opportunity_id = kiru_opportunities.id AND a.mentor_id = (SELECT kiru_private.active_uid())))))
);
