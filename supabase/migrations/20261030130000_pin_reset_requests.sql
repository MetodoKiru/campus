-- «¿Has olvidado tu PIN?» sin que administración tenga que hacer nada.
--
-- Desde la entrada del campus, un mentor o una familia escribe su usuario o su
-- correo. El campus apunta aquí la petición (nunca el enlace). Cada pocos
-- minutos el Apps Script de «Solicitud mentores» recoge las peticiones, el
-- campus genera en ese momento un enlace «Crea tu PIN» de un solo uso y el
-- script lo manda por correo desde la cuenta de Método Kiru.
--
-- Solo la usa el servidor con la service role: RLS activada y sin políticas.

CREATE TABLE public.kiru_pin_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX kiru_pin_requests_profile_id_idx ON public.kiru_pin_requests (profile_id, created_at DESC);
CREATE INDEX kiru_pin_requests_pending_idx ON public.kiru_pin_requests (created_at) WHERE sent_at IS NULL;

COMMENT ON TABLE public.kiru_pin_requests IS
  'Peticiones de PIN olvidado pendientes de enviar por correo. Solo las usa el servidor.';

ALTER TABLE public.kiru_pin_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_pin_requests FROM anon, authenticated;
