-- Entrega del certificado desde el panel del mentor: nombre y apellidos tal como
-- aparecen en el certificado, para que quien lo revise compruebe que coinciden.
-- Solo añade una columna con valor por defecto; no toca datos existentes.
ALTER TABLE public.kiru_mentor_steps
  ADD COLUMN holder_name text NOT NULL DEFAULT '' CHECK (length(holder_name) <= 200);

COMMENT ON COLUMN public.kiru_mentor_steps.holder_name IS
  'Nombre y apellidos que el mentor indica al entregar el certificado. Vacío en los demás pasos.';
