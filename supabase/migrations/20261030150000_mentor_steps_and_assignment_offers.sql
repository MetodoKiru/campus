-- Menú del mentor: sus cuatro pasos y las propuestas de alumnos.
--
-- 1. kiru_mentor_steps: lo que el mentor ha entregado o confirmado en cada paso
--    (certificado, «Nuestro Equipo», llamadas con las familias) y la revisión
--    de administración o del formador. Sin fila = pendiente. El certificado
--    sigue dándose por comprobado con kiru_mentor_onboarding.certificate_checked_at
--    (la casilla del formador); esta tabla no la sustituye.
-- 2. Bucket privado kiru-mentor-docs para el PDF del certificado. Solo el
--    servidor sube archivos (service role); leen administración y formador. El
--    mentor nunca lee el archivo de otro: no hay política para él.
-- 3. kiru_assignment_offers: copia en el campus de cada correo «Posible alumno
--    para ti» que manda el Apps Script de «Familias Kiru», con los mismos datos
--    del correo, y la respuesta del mentor (desde el correo o desde el panel).
--    La hoja OFERTAS y el aviso por correo siguen siendo los del Apps Script.
--
-- Todas las escrituras pasan por rutas del servidor; los usuarios solo leen.

-- 1. Pasos del mentor ---------------------------------------------------------
CREATE TABLE public.kiru_mentor_steps (
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('certificado', 'nuestro_equipo', 'llamadas')),
  status text NOT NULL CHECK (status IN ('enviado', 'en_revision', 'completado', 'requiere_correccion')),
  document_path text CHECK (document_path IS NULL OR length(document_path) <= 300),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note text NOT NULL DEFAULT '' CHECK (length(review_note) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mentor_id, step)
);
CREATE INDEX kiru_mentor_steps_reviewed_by_idx ON public.kiru_mentor_steps (reviewed_by);
CREATE INDEX kiru_mentor_steps_status_idx ON public.kiru_mentor_steps (step, status);

COMMENT ON TABLE public.kiru_mentor_steps IS
  'Estado de los pasos del menú del mentor. Sin fila = pendiente. Solo escribe el servidor.';

CREATE TRIGGER kiru_mentor_steps_touch
BEFORE UPDATE ON public.kiru_mentor_steps
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

ALTER TABLE public.kiru_mentor_steps ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_mentor_steps FROM anon, authenticated;

CREATE POLICY kiru_mentor_steps_read ON public.kiru_mentor_steps
FOR SELECT TO authenticated
USING (
  mentor_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR (SELECT kiru_private.is_formador())
  OR (SELECT kiru_private.coordinates_mentor(mentor_id))
);

-- 2. Almacén privado del certificado ------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kiru-mentor-docs', 'kiru-mentor-docs', false, 10485760, array['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

-- Solo lectura para administración y formador (para revisar). Subir, cambiar y
-- borrar lo hace el servidor con la service role, que no pasa por RLS.
CREATE POLICY "Kiru staff read mentor docs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'kiru-mentor-docs'
  AND ((SELECT kiru_private.is_admin()) OR (SELECT kiru_private.is_formador()))
);

-- 3. Propuestas de alumnos ----------------------------------------------------
CREATE TABLE public.kiru_assignment_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Código de la oferta tal como va en el enlace del correo (campo «f»).
  offer_code text NOT NULL CHECK (length(trim(offer_code)) BETWEEN 1 AND 120),
  mentor_email text NOT NULL CHECK (mentor_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND mentor_email = lower(mentor_email)),
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Los mismos datos que lleva el correo, ni uno más.
  course text NOT NULL DEFAULT '' CHECK (length(course) <= 200),
  student_profile text NOT NULL DEFAULT '' CHECK (length(student_profile) <= 300),
  zone text NOT NULL DEFAULT '' CHECK (length(zone) <= 300),
  intensity text NOT NULL DEFAULT '' CHECK (length(intensity) <= 200),
  slots text NOT NULL DEFAULT '' CHECK (length(slots) <= 1000),
  sent_at timestamptz NOT NULL DEFAULT now(),
  -- Enlaces firmados de los botones del correo, para que la respuesta dada en
  -- el panel siga el mismo camino que si se pulsara el botón.
  response_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  response text CHECK (response IN ('si', 'ajustar', 'no')),
  response_detail text NOT NULL DEFAULT '' CHECK (length(response_detail) <= 1000),
  responded_at timestamptz,
  response_source text CHECK (response_source IN ('correo', 'campus')),
  -- Cuándo llegó la respuesta del panel al Apps Script (aviso + hoja OFERTAS).
  forwarded_at timestamptz,
  forward_error text NOT NULL DEFAULT '' CHECK (length(forward_error) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((response IS NULL) = (responded_at IS NULL))
);

-- Un mismo correo de oferta a un mismo mentor no se duplica aunque el script lo
-- mande dos veces (el correo se guarda siempre en minúsculas).
ALTER TABLE public.kiru_assignment_offers
  ADD CONSTRAINT kiru_assignment_offers_code_mentor_key UNIQUE (offer_code, mentor_email);
CREATE INDEX kiru_assignment_offers_mentor_idx ON public.kiru_assignment_offers (mentor_id, sent_at DESC);
CREATE INDEX kiru_assignment_offers_email_idx ON public.kiru_assignment_offers (mentor_email);

COMMENT ON TABLE public.kiru_assignment_offers IS
  'Copia de las propuestas de alumno que el Apps Script manda por correo y respuesta del mentor. Solo escribe el servidor.';

CREATE TRIGGER kiru_assignment_offers_touch
BEFORE UPDATE ON public.kiru_assignment_offers
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

ALTER TABLE public.kiru_assignment_offers ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_assignment_offers FROM anon, authenticated;

CREATE POLICY kiru_assignment_offers_read ON public.kiru_assignment_offers
FOR SELECT TO authenticated
USING (
  mentor_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR (SELECT kiru_private.coordinates_mentor(mentor_id))
);
