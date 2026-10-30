-- Enlaces de acceso para mentores nuevos («Crea tu PIN»).
--
-- Cuando el Apps Script de «Solicitud mentores» envía el correo de bienvenida,
-- pide al campus la cuenta del mentor y un enlace de un solo uso. El mentor lo
-- abre, elige su PIN y entra. Aquí solo se guarda la huella (SHA-256) del
-- enlace, nunca el enlace, así que ni una copia de la base sirve para entrar.
--
-- Solo la usa el servidor con la service role: RLS activada y sin políticas,
-- de modo que ningún usuario (ni administración desde el navegador) la lee.

CREATE TABLE public.kiru_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kiru_access_links_profile_id_idx ON public.kiru_access_links (profile_id);

COMMENT ON TABLE public.kiru_access_links IS
  'Enlaces «Crea tu PIN» de un solo uso. Solo la huella del enlace; solo los usa el servidor.';

ALTER TABLE public.kiru_access_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_access_links FROM anon, authenticated;
