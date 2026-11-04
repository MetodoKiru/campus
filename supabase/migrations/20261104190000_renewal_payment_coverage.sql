-- Une los pagos generados desde Renovaciones con su periodo y sesiones cubiertas.
ALTER TABLE public.kiru_payments
  ADD COLUMN IF NOT EXISTS renewal_id uuid REFERENCES public.kiru_renewals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coverage_start date,
  ADD COLUMN IF NOT EXISTS coverage_end date,
  ADD COLUMN IF NOT EXISTS days_per_week smallint,
  ADD COLUMN IF NOT EXISTS sessions_included smallint,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS kiru_payments_renewal_uidx
  ON public.kiru_payments (renewal_id) WHERE renewal_id IS NOT NULL;

ALTER TABLE public.kiru_payments
  ADD CONSTRAINT kiru_payments_days_per_week_check
    CHECK (days_per_week IS NULL OR days_per_week BETWEEN 1 AND 3),
  ADD CONSTRAINT kiru_payments_sessions_included_check
    CHECK (sessions_included IS NULL OR sessions_included BETWEEN 0 AND 400),
  ADD CONSTRAINT kiru_payments_coverage_range_check
    CHECK (coverage_end IS NULL OR coverage_start IS NULL OR coverage_end > coverage_start);

COMMENT ON COLUMN public.kiru_payments.coverage_start IS 'Primer día del periodo cubierto (incluido).';
COMMENT ON COLUMN public.kiru_payments.coverage_end IS 'Límite final del periodo cubierto (excluido); se usa como fecha de renovación.';
COMMENT ON COLUMN public.kiru_payments.days_per_week IS 'Modalidad elegida en la renovación: sesiones semanales.';
COMMENT ON COLUMN public.kiru_payments.sessions_included IS 'Sesiones incluidas por modalidad y número de meses pagados.';
COMMENT ON COLUMN public.kiru_payments.reported_at IS 'Momento en que la familia comunicó el pago; no implica validación bancaria.';

CREATE OR REPLACE FUNCTION kiru_private.system_author()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT id
  FROM public.profiles
  WHERE role = 'admin' AND is_active
  ORDER BY created_at
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION kiru_private.renewal_payment_reported(r public.kiru_renewals, p_source text, p_by uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_months int := CASE WHEN r.plan IN ('mantener', 'subir') THEN r.months ELSE 1 END;
  v_start date := coalesce((r.paid_reported_at AT TIME ZONE 'Europe/Madrid')::date, (now() AT TIME ZONE 'Europe/Madrid')::date);
  v_end date;
  v_label text := CASE r.plan WHEN 'mantener' THEN r.keep_label WHEN 'subir' THEN r.up_label ELSE NULL END;
  v_match text[];
  v_days smallint;
  v_sessions smallint;
  v_total numeric := coalesce(kiru_private.renewal_total(r), r.keep_price);
  v_author uuid := coalesce(p_by, kiru_private.system_author());
  v_concept text;
BEGIN
  IF v_author IS NULL THEN RETURN; END IF;
  v_months := greatest(1, least(v_months, 12));
  v_end := (v_start + make_interval(months => v_months))::date;

  v_match := regexp_match(lower(coalesce(v_label, '')), '([1-3])\s*d[ií]as?');
  IF v_match IS NOT NULL THEN
    v_days := v_match[1]::smallint;
  ELSE
    SELECT nullif(count(*), 0)::smallint INTO v_days
    FROM public.kiru_student_schedule_slots s
    WHERE s.student_id = r.student_id AND s.is_active;
  END IF;
  IF v_days IS NOT NULL THEN
    v_sessions := (v_days * 4 * v_months)::smallint;
  END IF;
  v_concept := 'Mensualidad del ' || kiru_private.fecha_corta(v_start) || ' al ' || kiru_private.fecha_corta(v_end)
    || CASE WHEN v_months > 1 THEN ' (' || v_months || ' meses)' ELSE '' END;

  UPDATE public.kiru_renewals
  SET paid_from = v_start, sessions_planned = v_sessions
  WHERE id = r.id;

  INSERT INTO public.kiru_payments (
    student_id, concept, amount_cents, due_date, status, notes, created_by, renewal_id,
    coverage_start, coverage_end, days_per_week, sessions_included, reported_at
  ) VALUES (
    r.student_id, v_concept, round(v_total * 100)::int, v_start, 'pending',
    'Pago comunicado por la familia desde ' || CASE p_source WHEN 'correo' THEN 'el correo' ELSE 'el campus' END || '; pendiente de confirmar.',
    v_author, r.id, v_start, v_end, v_days, v_sessions, r.paid_reported_at
  )
  ON CONFLICT (renewal_id) WHERE renewal_id IS NOT NULL DO UPDATE
  SET concept = excluded.concept,
      amount_cents = excluded.amount_cents,
      due_date = excluded.due_date,
      coverage_start = excluded.coverage_start,
      coverage_end = excluded.coverage_end,
      days_per_week = excluded.days_per_week,
      sessions_included = excluded.sessions_included,
      reported_at = excluded.reported_at;
END;
$function$;

-- Asegura la misma relación tanto si el pago se comunica desde el campus como desde el correo o la hoja.
CREATE OR REPLACE FUNCTION kiru_private.sync_renewal_payment_coverage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.paid_reported_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.paid_reported_at IS NULL OR NEW.paid_reported_at IS DISTINCT FROM OLD.paid_reported_at) THEN
    PERFORM kiru_private.renewal_payment_reported(
      NEW,
      coalesce(NEW.paid_source, 'campus'),
      NEW.paid_by
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS kiru_renewal_payment_coverage_trigger ON public.kiru_renewals;
CREATE TRIGGER kiru_renewal_payment_coverage_trigger
  AFTER INSERT OR UPDATE OF paid_reported_at ON public.kiru_renewals
  FOR EACH ROW
  EXECUTE FUNCTION kiru_private.sync_renewal_payment_coverage();

-- Completa los pagos comunicados con el nuevo desglose sin cambiar su estado de validación.
DO $$
DECLARE r public.kiru_renewals;
BEGIN
  FOR r IN
    SELECT * FROM public.kiru_renewals
    WHERE paid_reported_at IS NOT NULL AND closed_at IS NULL
  LOOP
    PERFORM kiru_private.renewal_payment_reported(r, coalesce(r.paid_source, 'campus'), r.paid_by);
  END LOOP;
END;
$$;

GRANT SELECT ON public.kiru_payments TO authenticated;
