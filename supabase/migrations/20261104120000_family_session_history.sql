-- Historial mínimo de sesiones para padres. La vista solo expone los
-- campos necesarios y valida el vínculo con el alumno para cada consulta.
-- kiru_session_logs conserva su RLS actual: el padre no puede consultar las
-- respuestas completas ni las incidencias directamente.

CREATE OR REPLACE VIEW public.kiru_family_session_history
WITH (security_invoker = false)
AS
SELECT
  l.id,
  l.student_id,
  l.session_date,
  l.mentor_name,
  COALESCE((
    SELECT NULLIF(btrim(answer.value ->> 'a'), '')
    FROM jsonb_array_elements(l.answers) AS answer(value)
    WHERE replace(lower(answer.value ->> 'q'), 'é', 'e') LIKE '%que se ha trabajado hoy%'
    LIMIT 1
  ), '') AS topic
FROM public.kiru_session_logs AS l
WHERE l.student_id IS NOT NULL
  AND kiru_private.is_guardian_of(l.student_id);

COMMENT ON VIEW public.kiru_family_session_history IS
  'Historial de sesiones con fecha, mentor y tema para el padre vinculado; excluye respuestas e incidencias completas.';

REVOKE ALL ON public.kiru_family_session_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_family_session_history TO authenticated;
