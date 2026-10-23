-- Candidate tracking data for the dedicated formador workflow.
-- Apply in a development/staging database first; do not import production Sheets data during tests.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS calendly_url text;

CREATE TABLE IF NOT EXISTS public.kiru_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  source_row integer,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 180),
  sheet_status text,
  phase smallint NOT NULL DEFAULT 1 CHECK (phase BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'Pendiente'
    CHECK (status IN ('Pendiente', 'En revisión', 'Apto', 'No seleccionado', 'Activo')),
  notes text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  next_step text NOT NULL DEFAULT '',
  calendly_url text,
  history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(history) = 'array'),
  last_synced_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kiru_candidates_updated_at_idx
  ON public.kiru_candidates (updated_at DESC);

CREATE OR REPLACE FUNCTION public.kiru_is_active_candidate_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.is_active IS TRUE
      AND p.role IN ('admin', 'formador')
  );
$$;

REVOKE ALL ON FUNCTION public.kiru_is_active_candidate_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kiru_is_active_candidate_staff() TO authenticated;

ALTER TABLE public.kiru_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kiru_candidates_staff_all ON public.kiru_candidates;
CREATE POLICY kiru_candidates_staff_all
  ON public.kiru_candidates
  FOR ALL
  TO authenticated
  USING (public.kiru_is_active_candidate_staff())
  WITH CHECK (public.kiru_is_active_candidate_staff());

COMMENT ON COLUMN public.profiles.calendly_url IS
  'Optional Calendly booking URL for an active formador; edited only through the protected formador API.';

COMMENT ON TABLE public.kiru_candidates IS
  'Candidate pipeline used by the formador role. Google Sheets credentials and source tokens are never stored here.';
