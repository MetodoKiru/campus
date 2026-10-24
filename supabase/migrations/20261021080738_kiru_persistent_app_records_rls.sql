CREATE TABLE IF NOT EXISTS public.kiru_app_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN ('settings','activity','task','notice','document','payment','progress','message')),
  record_key text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, record_type, record_key)
);

CREATE INDEX IF NOT EXISTS kiru_app_records_owner_type_idx
  ON public.kiru_app_records (owner_id, record_type);

CREATE INDEX IF NOT EXISTS kiru_app_records_created_by_idx
  ON public.kiru_app_records (created_by);

ALTER TABLE public.kiru_app_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kiru_records_read_authorized ON public.kiru_app_records;
CREATE POLICY kiru_records_read_authorized
ON public.kiru_app_records FOR SELECT TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR ((SELECT auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
  OR (
    EXISTS (
      SELECT 1 FROM public.student_mentors sm
      WHERE sm.student_id = kiru_app_records.owner_id
        AND sm.mentor_id = (SELECT auth.uid())
    )
  )
  OR (
    EXISTS (
      SELECT 1 FROM public.student_guardians sg
      WHERE sg.student_id = kiru_app_records.owner_id
        AND sg.guardian_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS kiru_records_insert_owner_admin ON public.kiru_app_records;
CREATE POLICY kiru_records_insert_owner_admin
ON public.kiru_app_records FOR INSERT TO authenticated
WITH CHECK (
  ((SELECT auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
  OR (
    owner_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS kiru_records_update_owner_admin ON public.kiru_app_records;
CREATE POLICY kiru_records_update_owner_admin
ON public.kiru_app_records FOR UPDATE TO authenticated
USING (
  ((SELECT auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
  OR (
    owner_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
  )
)
WITH CHECK (
  ((SELECT auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
  OR (
    owner_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS kiru_records_delete_owner_admin ON public.kiru_app_records;
CREATE POLICY kiru_records_delete_owner_admin
ON public.kiru_app_records FOR DELETE TO authenticated
USING (
  ((SELECT auth.jwt() -> 'app_metadata' ->> 'kiru_role') = 'admin')
  OR (
    owner_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.set_kiru_app_record_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_kiru_app_records_updated_at ON public.kiru_app_records;
CREATE TRIGGER set_kiru_app_records_updated_at
BEFORE UPDATE ON public.kiru_app_records
FOR EACH ROW EXECUTE FUNCTION public.set_kiru_app_record_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiru_app_records TO authenticated;
