-- Rol de formador e incorporación de mentores nuevos (paso 9 del flujo de un candidato).
--
-- 1. profiles admite el rol 'formador'. El formador no ve alumnos, familias,
--    pagos ni registros: las políticas existentes solo le dejan ver su perfil.
-- 2. kiru_mentor_onboarding guarda, por cada mentor nuevo, lo que le falta antes
--    de empezar: acuerdo de confidencialidad firmado, certificado de delitos de
--    naturaleza sexual comprobado y cuenta del campus. Solo se guarda la fecha y
--    quién lo comprobó, nunca el documento.
-- 3. Un mentor con ficha de incorporación no puede recibir alumno sin el
--    certificado comprobado. Los mentores que ya existían (sin ficha) no cambian.
-- La selección de candidatos sigue en el Apps Script de Drive.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'mentor', 'padre', 'alumno', 'formador'));

-- Las cuentas nuevas con kiru_role = 'formador' deben nacer como formador, no
-- como alumno (y sin fila en students).
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
    WHEN NEW.raw_app_meta_data ->> 'kiru_role' IN ('admin', 'mentor', 'padre', 'alumno', 'formador')
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

CREATE OR REPLACE FUNCTION kiru_private.is_formador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(kiru_private.kiru_role() = 'formador', false)
$$;

REVOKE ALL ON FUNCTION kiru_private.is_formador() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.is_formador() TO authenticated;

CREATE TABLE public.kiru_mentor_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 160),
  email text NOT NULL CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  phone text CHECK (phone IS NULL OR length(phone) <= 30),
  confidentiality_signed_at timestamptz,
  confidentiality_checked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  certificate_checked_at timestamptz,
  certificate_checked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  archived_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX kiru_mentor_onboarding_email_active_uidx
  ON public.kiru_mentor_onboarding (lower(email)) WHERE archived_at IS NULL;
CREATE INDEX kiru_mentor_onboarding_created_by_idx ON public.kiru_mentor_onboarding (created_by);
CREATE INDEX kiru_mentor_onboarding_confidentiality_checked_by_idx ON public.kiru_mentor_onboarding (confidentiality_checked_by);
CREATE INDEX kiru_mentor_onboarding_certificate_checked_by_idx ON public.kiru_mentor_onboarding (certificate_checked_by);

COMMENT ON TABLE public.kiru_mentor_onboarding IS
  'Incorporación de mentores nuevos. Solo fechas y quién comprobó; nunca se guarda el certificado.';

CREATE OR REPLACE FUNCTION kiru_private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER kiru_mentor_onboarding_touch
BEFORE UPDATE ON public.kiru_mentor_onboarding
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

ALTER TABLE public.kiru_mentor_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY kiru_mentor_onboarding_staff_read ON public.kiru_mentor_onboarding
FOR SELECT TO authenticated
USING ((SELECT kiru_private.is_admin()) OR (SELECT kiru_private.is_formador()));
CREATE POLICY kiru_mentor_onboarding_staff_insert ON public.kiru_mentor_onboarding
FOR INSERT TO authenticated
WITH CHECK ((SELECT kiru_private.is_admin()) OR (SELECT kiru_private.is_formador()));
CREATE POLICY kiru_mentor_onboarding_staff_update ON public.kiru_mentor_onboarding
FOR UPDATE TO authenticated
USING ((SELECT kiru_private.is_admin()) OR (SELECT kiru_private.is_formador()))
WITH CHECK ((SELECT kiru_private.is_admin()) OR (SELECT kiru_private.is_formador()));
-- Sin política DELETE para el formador: las fichas se archivan, no se borran.
CREATE POLICY kiru_mentor_onboarding_admin_delete ON public.kiru_mentor_onboarding
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- Bloqueo de asignación sin certificado ----------------------------------------
CREATE OR REPLACE FUNCTION kiru_private.require_mentor_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.kiru_mentor_onboarding o
    WHERE o.profile_id = NEW.mentor_id AND o.certificate_checked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Este mentor aún no tiene comprobado el certificado de delitos de naturaleza sexual.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION kiru_private.require_mentor_certificate() FROM PUBLIC;

CREATE TRIGGER student_mentors_require_certificate
BEFORE INSERT OR UPDATE OF mentor_id ON public.student_mentors
FOR EACH ROW EXECUTE FUNCTION kiru_private.require_mentor_certificate();
