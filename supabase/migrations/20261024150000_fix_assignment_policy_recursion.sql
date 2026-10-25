-- Arregla "infinite recursion detected in policy" al asignar mentor o familia
-- desde el panel de administración.
--
-- Las políticas de escritura de student_mentors y student_guardians comprobaban
-- el rol con un EXISTS sobre profiles, y la política de lectura de profiles
-- vuelve a consultar student_mentors y student_guardians. Postgres detecta el
-- ciclo y rechaza la operación aunque quien la haga sea administradora.
-- La comprobación del rol pasa a una función SECURITY DEFINER, que no aplica RLS.

CREATE OR REPLACE FUNCTION kiru_private.profile_has_role(target uuid, wanted text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = target AND p.role = wanted)
$$;

REVOKE ALL ON FUNCTION kiru_private.profile_has_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.profile_has_role(uuid, text) TO authenticated;

DROP POLICY IF EXISTS student_mentors_admin_insert ON public.student_mentors;
DROP POLICY IF EXISTS student_mentors_admin_update ON public.student_mentors;
DROP POLICY IF EXISTS student_guardians_admin_insert ON public.student_guardians;
DROP POLICY IF EXISTS student_guardians_admin_update ON public.student_guardians;

CREATE POLICY student_mentors_admin_insert ON public.student_mentors
FOR INSERT TO authenticated
WITH CHECK ((SELECT kiru_private.is_admin()) AND kiru_private.profile_has_role(mentor_id, 'mentor'));
CREATE POLICY student_mentors_admin_update ON public.student_mentors
FOR UPDATE TO authenticated
USING ((SELECT kiru_private.is_admin()))
WITH CHECK ((SELECT kiru_private.is_admin()) AND kiru_private.profile_has_role(mentor_id, 'mentor'));

CREATE POLICY student_guardians_admin_insert ON public.student_guardians
FOR INSERT TO authenticated
WITH CHECK ((SELECT kiru_private.is_admin()) AND kiru_private.profile_has_role(guardian_id, 'padre'));
CREATE POLICY student_guardians_admin_update ON public.student_guardians
FOR UPDATE TO authenticated
USING ((SELECT kiru_private.is_admin()))
WITH CHECK ((SELECT kiru_private.is_admin()) AND kiru_private.profile_has_role(guardian_id, 'padre'));
