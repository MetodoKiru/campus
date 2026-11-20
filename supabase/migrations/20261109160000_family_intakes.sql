-- Alta automática de familias desde el formulario de incorporación.
--
-- El Apps Script lee cada respuesta nueva de «Familias Kiru (respuestas)» y
-- pide al campus las cuentas del alumno y de sus tutores. Esta tabla solo
-- recuerda qué número de envío del formulario ya tiene alumno en el campus,
-- para que repetir la llamada (o volver a pasar por la fila cuando llega el
-- correo que faltaba) nunca cree un segundo alumno. No guarda ningún dato del
-- formulario: ni nombres, ni correos, ni datos de salud.
--
-- Solo la usa el servidor con la service role: RLS activada y sin políticas.
-- Idempotente: se puede pegar en el SQL Editor más de una vez.

CREATE TABLE IF NOT EXISTS public.kiru_family_intakes (
  submission_id text PRIMARY KEY CHECK (submission_id ~ '^[A-Za-z0-9._:-]{1,80}$'),
  student_id uuid NOT NULL REFERENCES public.students(profile_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kiru_family_intakes_student_id_idx ON public.kiru_family_intakes (student_id);

COMMENT ON TABLE public.kiru_family_intakes IS
  'Respuesta del formulario de familias → alumno creado. Solo el nº de envío; solo la usa el servidor.';

ALTER TABLE public.kiru_family_intakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_family_intakes FROM anon, authenticated;
