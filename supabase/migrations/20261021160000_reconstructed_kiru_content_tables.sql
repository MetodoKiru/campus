-- RECONSTRUIDA el 2026-10-24 a partir del catálogo de producción.
-- Estas tablas y políticas se crearon desde el SQL Editor de Supabase, fuera del
-- historial de migraciones. Este archivo existe para poder reconstruir la base
-- desde cero (por ejemplo, en local o en una restauración). En producción ya
-- está aplicado: márcalo con
--   supabase migration repair --status applied 20261021160000
-- en lugar de ejecutarlo.

CREATE TABLE IF NOT EXISTS public.kiru_notices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  target_student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  link_url text,
  link_title text,
  attachment_path text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_notices_target_idx ON public.kiru_notices (target_student_id, published_at DESC);

CREATE TABLE IF NOT EXISTS public.kiru_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  document_type text NOT NULL DEFAULT 'general',
  target_student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  requires_acceptance boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_documents_target_idx ON public.kiru_documents (target_student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.kiru_document_acceptances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.kiru_documents(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  accepted_by uuid NOT NULL REFERENCES public.profiles(id),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiru_document_acceptances_document_id_student_id_key UNIQUE (document_id, student_id)
);
CREATE INDEX IF NOT EXISTS kiru_acceptances_student_idx ON public.kiru_document_acceptances (student_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS public.kiru_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  concept text NOT NULL,
  amount_cents integer NOT NULL CONSTRAINT kiru_payments_amount_cents_check CHECK (amount_cents >= 0),
  due_date date,
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT kiru_payments_status_check CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  payment_url text,
  paid_at timestamptz,
  external_reference text,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_payments_student_due_idx ON public.kiru_payments (student_id, due_date DESC);

ALTER TABLE public.kiru_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_document_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY kiru_notices_admin_all ON public.kiru_notices FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active));
CREATE POLICY kiru_notices_related_read ON public.kiru_notices FOR SELECT TO authenticated
USING (
  target_student_id IS NULL
  OR target_student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.student_guardians sg WHERE sg.student_id = kiru_notices.target_student_id AND sg.guardian_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.student_mentors sm WHERE sm.student_id = kiru_notices.target_student_id AND sm.mentor_id = auth.uid())
);

CREATE POLICY kiru_documents_admin_all ON public.kiru_documents FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active));
CREATE POLICY kiru_documents_related_read ON public.kiru_documents FOR SELECT TO authenticated
USING (
  target_student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.student_guardians sg WHERE sg.student_id = kiru_documents.target_student_id AND sg.guardian_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.student_mentors sm WHERE sm.student_id = kiru_documents.target_student_id AND sm.mentor_id = auth.uid())
);

CREATE POLICY kiru_acceptances_admin_all ON public.kiru_document_acceptances FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active));
CREATE POLICY kiru_acceptances_related_read ON public.kiru_document_acceptances FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.student_guardians sg WHERE sg.student_id = kiru_document_acceptances.student_id AND sg.guardian_id = auth.uid())
);

CREATE POLICY kiru_payments_admin_all ON public.kiru_payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active));
CREATE POLICY kiru_payments_related_read ON public.kiru_payments FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.student_guardians sg WHERE sg.student_id = kiru_payments.student_id AND sg.guardian_id = auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiru_notices, public.kiru_documents, public.kiru_document_acceptances, public.kiru_payments TO authenticated;
