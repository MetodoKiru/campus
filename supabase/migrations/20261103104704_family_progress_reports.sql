-- Informes de progreso individuales para cada periodo de renovación familiar.
CREATE TABLE public.kiru_family_progress_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'publicado')),
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  published_by uuid REFERENCES public.profiles(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_start < period_end),
  CHECK (due_date = period_end - 4),
  CHECK ((status = 'publicado') = (published_at IS NOT NULL)),
  UNIQUE (student_id, period_start, period_end)
);

CREATE INDEX kiru_family_progress_reports_student_period_idx
  ON public.kiru_family_progress_reports (student_id, period_end DESC);

ALTER TABLE public.kiru_family_progress_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_family_progress_reports FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.kiru_family_progress_reports TO authenticated;

CREATE POLICY kiru_family_progress_reports_read ON public.kiru_family_progress_reports
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR kiru_private.coordinates_student(student_id)
  OR (status = 'publicado' AND (
    kiru_private.is_guardian_of(student_id)
    OR EXISTS (SELECT 1 FROM public.student_mentors sm
               WHERE sm.student_id = kiru_family_progress_reports.student_id
                 AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  ))
);

CREATE POLICY kiru_family_progress_reports_insert ON public.kiru_family_progress_reports
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT kiru_private.is_admin()) OR kiru_private.coordinates_student(student_id)
);

CREATE POLICY kiru_family_progress_reports_update ON public.kiru_family_progress_reports
FOR UPDATE TO authenticated
USING ((SELECT kiru_private.is_admin()) OR kiru_private.coordinates_student(student_id))
WITH CHECK ((SELECT kiru_private.is_admin()) OR kiru_private.coordinates_student(student_id));

CREATE OR REPLACE FUNCTION kiru_private.notify_family_progress_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'publicado' AND (TG_OP = 'INSERT' OR OLD.status <> 'publicado') THEN
    INSERT INTO public.kiru_notifications (recipient_id, student_id, kind, title, body, event_key, email_status)
    SELECT sg.guardian_id, NEW.student_id, 'informe_progreso',
           'Informe de progreso disponible',
           'Ya puedes consultar el informe en la pestaña «Informes» de tu panel familiar.',
           'informe_progreso:' || NEW.id::text,
           'pendiente'
    FROM public.student_guardians sg
    JOIN public.profiles guardian ON guardian.id = sg.guardian_id AND guardian.is_active AND guardian.role = 'padre'
    WHERE sg.student_id = NEW.student_id
    ON CONFLICT (recipient_id, event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.notify_family_progress_report() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER kiru_family_progress_report_notify
AFTER INSERT OR UPDATE OF status ON public.kiru_family_progress_reports
FOR EACH ROW EXECUTE FUNCTION kiru_private.notify_family_progress_report();

ALTER TABLE public.kiru_notifications DROP CONSTRAINT IF EXISTS kiru_notifications_kind_check;
ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check
  CHECK (kind IN ('objetivo_pendiente', 'objetivo_aprobado', 'objetivo_rechazado', 'canje_solicitado', 'canje_completado', 'canje_aplazado', 'renovacion', 'informe_progreso'));
