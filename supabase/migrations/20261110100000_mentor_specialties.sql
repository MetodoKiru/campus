-- Especialidades acreditadas de los mentores (Tipo A).
-- La decisión se toma en la hoja «Solicitud mentores» → «Acreditaciones Tipo A»;
-- el Apps Script envía aquí solo las VALIDADAS, por correo del mentor, para que el
-- panel del formador las muestre. Sin políticas: solo el servidor (service role) lee y escribe.
CREATE TABLE IF NOT EXISTS public.kiru_mentor_specialties (
  email text PRIMARY KEY CHECK (email = lower(email)),
  specialties text[] NOT NULL DEFAULT '{}',
  hours numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kiru_mentor_specialties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_mentor_specialties FROM anon, authenticated;
