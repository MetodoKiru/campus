-- Gestión de vacantes reales: añade puestos buscados y estado de cobertura
-- a kiru_opportunities, que ya es la tabla compartida con Preview.
ALTER TABLE public.kiru_opportunities
  ADD COLUMN positions_count integer,
  DROP CONSTRAINT kiru_opportunities_status_check,
  ADD CONSTRAINT kiru_opportunities_positions_count_check
    CHECK (positions_count IS NULL OR positions_count BETWEEN 1 AND 100),
  ADD CONSTRAINT kiru_opportunities_status_complete_check
    CHECK (status IN ('borrador','publicada','cerrada','completada'));

-- El servidor conserva la creación/edición/cierre bajo comprobación de rol.
-- Las relaciones existentes usan RESTRICT para conservar el historial de candidaturas.
ALTER TABLE public.kiru_onboarding_exceptions
  DROP CONSTRAINT kiru_onboarding_exceptions_mentor_id_fkey,
  ADD CONSTRAINT kiru_onboarding_exceptions_mentor_id_fkey
    FOREIGN KEY (mentor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  DROP CONSTRAINT kiru_onboarding_exceptions_granted_by_fkey,
  ADD CONSTRAINT kiru_onboarding_exceptions_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  DROP CONSTRAINT kiru_onboarding_exceptions_revoked_by_fkey,
  ADD CONSTRAINT kiru_onboarding_exceptions_revoked_by_fkey
    FOREIGN KEY (revoked_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;
