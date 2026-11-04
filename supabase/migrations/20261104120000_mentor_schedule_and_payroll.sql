-- Datos de horarios y remuneración importados en una sola dirección desde Google Sheets.
CREATE TABLE public.kiru_mentor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE CHECK (length(source_key) BETWEEN 1 AND 500),
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentor_name text NOT NULL DEFAULT '',
  student_name text NOT NULL DEFAULT '',
  weekday text NOT NULL DEFAULT '',
  start_time text NOT NULL DEFAULT '',
  end_time text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kiru_mentor_schedules_mentor_idx ON public.kiru_mentor_schedules (mentor_id, active);
ALTER TABLE public.kiru_mentor_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiru_mentor_schedules_read ON public.kiru_mentor_schedules FOR SELECT TO authenticated
USING (mentor_id = (SELECT kiru_private.active_uid()) OR (SELECT kiru_private.is_admin()));
GRANT SELECT ON public.kiru_mentor_schedules TO authenticated;

CREATE TABLE public.kiru_mentor_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE CHECK (length(source_key) BETWEEN 1 AND 500),
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentor_name text NOT NULL DEFAULT '',
  student_name text NOT NULL DEFAULT '',
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT '',
  sessions_count numeric,
  team_extra_eur numeric,
  agreed_amount_eur numeric,
  payment_date date,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kiru_mentor_payroll_mentor_idx ON public.kiru_mentor_payroll (mentor_id, period_end);
ALTER TABLE public.kiru_mentor_payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiru_mentor_payroll_read ON public.kiru_mentor_payroll FOR SELECT TO authenticated
USING (mentor_id = (SELECT kiru_private.active_uid()) OR (SELECT kiru_private.is_admin()));
GRANT SELECT ON public.kiru_mentor_payroll TO authenticated;

CREATE TABLE public.kiru_mentor_rates (
  mentor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  hourly_rate_eur numeric,
  pending_sessions numeric,
  pending_amount_eur numeric,
  sessions_total numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kiru_mentor_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiru_mentor_rates_read ON public.kiru_mentor_rates FOR SELECT TO authenticated
USING (mentor_id = (SELECT kiru_private.active_uid()) OR (SELECT kiru_private.is_admin()));
GRANT SELECT ON public.kiru_mentor_rates TO authenticated;
