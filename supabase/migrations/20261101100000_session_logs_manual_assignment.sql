-- Registros de sesión: administración puede adjudicar a mano el mentor y el
-- alumno de un registro que no se reconoció (o archivarlo si el mentor ya no
-- tiene cuenta), desde «Seguimiento de mentores» → «Sin asignar».
--
-- manual_status:
--   NULL        → lo decide la importación (por correo o por nombre), como hasta ahora.
--   'asignado'  → administración eligió mentor y alumno; la importación ya no los cambia.
--   'archivado' → no se enlaza con nadie (p. ej. un mentor que ya no está) y deja de
--                 salir en «Sin asignar». La importación tampoco lo toca.
-- Solo escribe el servidor (/api/registros/asignar, con la service role); las
-- políticas de la tabla no cambian.

ALTER TABLE public.kiru_session_logs
  ADD COLUMN manual_status text CHECK (manual_status IS NULL OR manual_status IN ('asignado', 'archivado')),
  ADD COLUMN manual_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN manual_at timestamptz;

CREATE INDEX kiru_session_logs_manual_by_idx ON public.kiru_session_logs (manual_by);

COMMENT ON COLUMN public.kiru_session_logs.manual_status IS
  'NULL = enlazado por la importación; asignado/archivado = decidido a mano por administración (la importación lo respeta).';
