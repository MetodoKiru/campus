-- Add the dedicated formador role without granting it access to student/mentor data.
-- This migration is staged in a feature branch and must be applied only after review.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'mentor'::text, 'padre'::text, 'alumno'::text, 'formador'::text]));
