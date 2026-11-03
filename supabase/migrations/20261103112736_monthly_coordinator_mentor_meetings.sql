-- Extiende las reuniones existentes de coordinación: no crea tablas duplicadas.
-- Las invitaciones siguen siendo manuales y el zoom se gestiona en el Campus.
CREATE OR REPLACE FUNCTION kiru_private.mentor_onboarding_complete(mentor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (NOT EXISTS (SELECT 1 FROM public.kiru_mentor_onboarding o WHERE o.profile_id = mentor AND o.archived_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.kiru_mentor_onboarding o WHERE o.profile_id = mentor AND o.archived_at IS NULL AND o.confidentiality_signed_at IS NOT NULL))
    AND (EXISTS (SELECT 1 FROM public.kiru_mentor_onboarding o WHERE o.profile_id = mentor AND o.archived_at IS NULL AND o.certificate_checked_at IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.kiru_mentor_steps s WHERE s.mentor_id = mentor AND s.step = 'certificado' AND s.status = 'completado'))
    AND EXISTS (SELECT 1 FROM public.kiru_mentor_steps s WHERE s.mentor_id = mentor AND s.step = 'nuestro_equipo' AND s.status = 'completado')
    AND EXISTS (SELECT 1 FROM public.kiru_mentor_steps s WHERE s.mentor_id = mentor AND s.step = 'llamadas' AND s.status = 'completado')
$$;
REVOKE ALL ON FUNCTION kiru_private.mentor_onboarding_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.mentor_onboarding_complete(uuid) TO authenticated, service_role;

-- Reuniones de 30 minutos, comienzo en bloque de media hora y enlace Zoom.
ALTER TABLE public.kiru_coordination_meetings
  ALTER COLUMN duration_minutes SET DEFAULT 30;
ALTER TABLE public.kiru_coordination_meetings
  ADD CONSTRAINT kiru_coordination_meetings_duration_exact CHECK (duration_minutes = 30),
  ADD CONSTRAINT kiru_coordination_meetings_half_hour CHECK (
    date_part('minute', scheduled_at AT TIME ZONE 'Europe/Madrid') IN (0,30)
    AND date_part('second', scheduled_at AT TIME ZONE 'Europe/Madrid') = 0
  ),
  ADD CONSTRAINT kiru_coordination_meetings_zoom_domain CHECK (
    zoom_url = '' OR zoom_url ~* '^https://([a-z0-9-]+[.])*zoom[.]us/'
  );
