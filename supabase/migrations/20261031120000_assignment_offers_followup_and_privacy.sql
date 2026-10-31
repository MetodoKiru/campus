-- Entrega 1 del Flujo Maestro: circuito de matching.
-- Cambios solo sobre kiru_assignment_offers (la tabla que ya existe), más un
-- historial de cambios. No toca el matching del Apps Script.
--
-- 1. Privacidad: el mentor deja de leer la tabla directamente. Su panel ya la
--    lee por /api/mentor/panel, que solo devuelve curso, perfil, zona,
--    intensidad y franjas. Así nunca ve offer_code, los enlaces firmados ni el
--    nombre del alumno que conoce administración.
--    Además, el código de oferta tiene que ser opaco («OF-» + 20 hex), sin
--    nombre ni dato del alumno. Hoy la tabla está vacía en producción, así que
--    la restricción no rechaza ninguna fila existente.
-- 2. Seguimiento de administración/coordinación: recordatorio, llamada de
--    10 minutos, decisión (seleccionado / sustituto / no seleccionado para este
--    alumno, que nunca es excluir al mentor del equipo) y cierre.
--    «Sin respuesta» no se guarda: sale de sent_at + 72 h sin respuesta.
-- 3. kiru_assignment_offer_events: quién cambió qué y cuándo.
--
-- Todas las escrituras siguen pasando por rutas del servidor.

-- 1. Privacidad ----------------------------------------------------------------
DROP POLICY IF EXISTS kiru_assignment_offers_read ON public.kiru_assignment_offers;
CREATE POLICY kiru_assignment_offers_read ON public.kiru_assignment_offers
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR (SELECT kiru_private.coordinates_mentor(mentor_id))
);

ALTER TABLE public.kiru_assignment_offers
  ADD CONSTRAINT kiru_assignment_offers_opaque_code CHECK (offer_code ~ '^OF-[0-9a-f]{20}$');

-- 2. Seguimiento ---------------------------------------------------------------
ALTER TABLE public.kiru_assignment_offers
  -- Solo para administración y coordinación (el mentor no lee la tabla).
  ADD COLUMN student_label text NOT NULL DEFAULT '' CHECK (length(student_label) <= 200),
  ADD COLUMN mentor_name text NOT NULL DEFAULT '' CHECK (length(mentor_name) <= 200),
  ADD COLUMN mentor_phone text NOT NULL DEFAULT '' CHECK (length(mentor_phone) <= 30),
  ADD COLUMN reminder_sent_at timestamptz,
  ADD COLUMN call_requested_at timestamptz,
  ADD COLUMN call_done_at timestamptz,
  ADD COLUMN call_notes text NOT NULL DEFAULT '' CHECK (length(call_notes) <= 2000),
  ADD COLUMN decision text CHECK (decision IN ('seleccionado', 'sustituto', 'no_seleccionado')),
  ADD COLUMN decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 1000),
  ADD COLUMN decided_at timestamptz,
  ADD COLUMN decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN closed_at timestamptz,
  ADD CONSTRAINT kiru_assignment_offers_decision_dates CHECK ((decision IS NULL) = (decided_at IS NULL));

CREATE INDEX kiru_assignment_offers_code_idx ON public.kiru_assignment_offers (offer_code);
CREATE INDEX kiru_assignment_offers_decided_by_idx ON public.kiru_assignment_offers (decided_by);

-- Un solo mentor seleccionado por alumno (por código de oferta).
CREATE UNIQUE INDEX kiru_assignment_offers_one_selected
  ON public.kiru_assignment_offers (offer_code) WHERE decision = 'seleccionado';

-- 3. Historial -----------------------------------------------------------------
CREATE TABLE public.kiru_assignment_offer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.kiru_assignment_offers(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'recibida', 'respuesta', 'recordatorio', 'llamada_solicitada', 'llamada_hecha',
    'seleccionado', 'sustituto', 'no_seleccionado', 'decision_quitada', 'cerrada', 'reabierta'
  )),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 2000),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kiru_assignment_offer_events_offer_idx ON public.kiru_assignment_offer_events (offer_id, created_at DESC);
CREATE INDEX kiru_assignment_offer_events_actor_idx ON public.kiru_assignment_offer_events (actor_id);

COMMENT ON TABLE public.kiru_assignment_offer_events IS
  'Historial de cada propuesta de alumno: respuestas y acciones de administración/coordinación. Solo escribe el servidor.';

ALTER TABLE public.kiru_assignment_offer_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_assignment_offer_events FROM anon, authenticated;

CREATE POLICY kiru_assignment_offer_events_read ON public.kiru_assignment_offer_events
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR EXISTS (
    SELECT 1 FROM public.kiru_assignment_offers o
    WHERE o.id = kiru_assignment_offer_events.offer_id
      AND (SELECT kiru_private.coordinates_mentor(o.mentor_id))
  )
);
