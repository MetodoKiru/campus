-- Compromiso del coordinador (20/11/2026, pedido por Sofía).
--
-- Al entrar por primera vez en su panel, cada coordinador ve la guía de su función y
-- pulsa «He leído la guía y me comprometo a cumplir esta función». Se guarda quién, qué
-- versión de la guía y cuándo. Si la guía cambia de versión, se vuelve a pedir.
-- Administración ve quién la ha aceptado. No se edita ni se borra.

CREATE TABLE IF NOT EXISTS public.kiru_role_commitments (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document text NOT NULL CHECK (document IN ('guia_coordinador')),
  version integer NOT NULL CHECK (version >= 1),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document, version)
);
COMMENT ON TABLE public.kiru_role_commitments IS
  'Compromisos aceptados por el equipo (por ahora, la guía del coordinador): quién, qué versión y cuándo. No se editan ni se borran.';

ALTER TABLE public.kiru_role_commitments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kiru_role_commitments_read ON public.kiru_role_commitments;
CREATE POLICY kiru_role_commitments_read ON public.kiru_role_commitments FOR SELECT TO authenticated
  USING (user_id = kiru_private.active_uid() OR kiru_private.is_admin());
REVOKE ALL ON public.kiru_role_commitments FROM anon, authenticated;
GRANT SELECT ON public.kiru_role_commitments TO authenticated;

-- Aceptar: solo el propio coordinador, para sí mismo.
CREATE OR REPLACE FUNCTION public.kiru_commitment_accept(p_document text, p_version integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := kiru_private.active_uid();
  v_at timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'coordinador' AND is_active) THEN
    RAISE EXCEPTION 'Solo un coordinador puede aceptar su guía.' USING ERRCODE = '42501';
  END IF;
  IF p_document IS DISTINCT FROM 'guia_coordinador' OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'Documento no válido.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.kiru_role_commitments (user_id, document, version)
  VALUES (v_uid, p_document, p_version)
  ON CONFLICT (user_id, document, version) DO NOTHING;
  SELECT accepted_at INTO v_at FROM public.kiru_role_commitments
   WHERE user_id = v_uid AND document = p_document AND version = p_version;
  RETURN v_at;
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_commitment_accept(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_commitment_accept(text, integer) TO authenticated;
