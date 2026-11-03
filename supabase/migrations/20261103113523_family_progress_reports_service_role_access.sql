-- El servidor del Campus lee, guarda y publica informes mediante service_role.
-- Supabase requiere permisos explícitos para tablas nuevas del esquema public.
GRANT SELECT, INSERT, UPDATE ON public.kiru_family_progress_reports TO service_role;
