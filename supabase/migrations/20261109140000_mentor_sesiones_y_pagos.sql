-- Panel del mentor: «Registro de sesiones» y «Mis pagos».
--
-- No es una contabilidad nueva. Los importes de nómina siguen saliendo de la
-- pestaña «Pagos» de la hoja «Registro de sesión (respuestas)»: el Apps Script
-- de esa hoja copia sus filas aquí (sin la columna «Notas», que es interna) y
-- el campus solo las enseña a cada mentor. Nadie las edita desde el campus.
--
-- 1. kiru_mentor_payouts: copia de solo lectura de «Pagos» (una fila por
--    mentor, alumno y periodo). Si una fila desaparece de la hoja no se borra:
--    queda con removed_at.
-- 2. kiru_mentor_payout_history: cada cambio de una fila (estado, sesiones,
--    importe, fecha de pago…) guarda el valor anterior. Solo se añade.
-- 3. kiru_mentor_payouts_sync: la llama el servidor con la clave del Apps Script.
-- 4. kiru_mentor_sessions: las sesiones registradas de un mentor con su clase,
--    hora, familia, periodo de «Pagos» y si es un registro repetido. La puede
--    pedir el propio mentor, su coordinador o administración.
-- 5. kiru_mentor_payout_checks: comprobaciones para administración (sesiones
--    del campus distintas de las de la hoja, periodos que se solapan, nombres
--    de la hoja sin cuenta en el campus).

-- 1. Copia de «Pagos» ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_mentor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identifica la fila de la hoja: mentor|alumno|desde (nombres normalizados).
  sheet_key text NOT NULL UNIQUE CHECK (length(sheet_key) BETWEEN 3 AND 300),
  sheet_row integer,
  mentor_name text NOT NULL CHECK (length(mentor_name) <= 120),
  student_name text NOT NULL CHECK (length(student_name) <= 120),
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  -- «Hasta (no incluido)»: el día en que termina el periodo y se paga.
  period_end date NOT NULL CHECK (period_end > period_start),
  -- Tal como está en la hoja: Pagado, Pendiente, Sin confirmar…
  sheet_status text NOT NULL DEFAULT '' CHECK (length(sheet_status) <= 60),
  sessions_registered integer NOT NULL DEFAULT 0 CHECK (sessions_registered >= 0),
  extra_cents integer NOT NULL DEFAULT 0,
  amount_cents integer NOT NULL DEFAULT 0,
  paid_on date,
  removed_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_mentor_payouts_mentor_idx ON public.kiru_mentor_payouts (mentor_id, period_start DESC);
CREATE INDEX IF NOT EXISTS kiru_mentor_payouts_student_idx ON public.kiru_mentor_payouts (student_id);
COMMENT ON TABLE public.kiru_mentor_payouts IS
  'Copia de solo lectura de la pestaña «Pagos» (hoja Registro de sesión). La hoja manda; el campus no calcula importes.';

-- 2. Historial de cambios ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_mentor_payout_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payout_id uuid NOT NULL REFERENCES public.kiru_mentor_payouts(id) ON DELETE RESTRICT,
  previous jsonb NOT NULL,
  current jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiru_mentor_payout_history_payout_idx ON public.kiru_mentor_payout_history (payout_id, changed_at);
COMMENT ON TABLE public.kiru_mentor_payout_history IS 'Valores anteriores de cada fila de «Pagos» cuando cambia en la hoja. No se edita ni se borra.';

CREATE OR REPLACE FUNCTION kiru_private.mentor_payout_snapshot(p public.kiru_mentor_payouts)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'mentor_id', p.mentor_id, 'student_id', p.student_id, 'period_start', p.period_start, 'period_end', p.period_end,
    'sheet_status', p.sheet_status, 'sessions_registered', p.sessions_registered, 'extra_cents', p.extra_cents,
    'amount_cents', p.amount_cents, 'paid_on', p.paid_on, 'removed_at', p.removed_at)
$$;

CREATE OR REPLACE FUNCTION kiru_private.mentor_payout_track()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF kiru_private.mentor_payout_snapshot(OLD) IS DISTINCT FROM kiru_private.mentor_payout_snapshot(NEW) THEN
    INSERT INTO public.kiru_mentor_payout_history (payout_id, previous, current)
    VALUES (OLD.id, kiru_private.mentor_payout_snapshot(OLD), kiru_private.mentor_payout_snapshot(NEW));
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kiru_mentor_payouts_track ON public.kiru_mentor_payouts;
CREATE TRIGGER kiru_mentor_payouts_track
BEFORE UPDATE ON public.kiru_mentor_payouts
FOR EACH ROW EXECUTE FUNCTION kiru_private.mentor_payout_track();

CREATE OR REPLACE FUNCTION kiru_private.mentor_payout_history_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'El historial de pagos no se modifica ni se borra.' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS kiru_mentor_payout_history_append_only ON public.kiru_mentor_payout_history;
CREATE TRIGGER kiru_mentor_payout_history_append_only
BEFORE UPDATE OR DELETE ON public.kiru_mentor_payout_history
FOR EACH ROW EXECUTE FUNCTION kiru_private.mentor_payout_history_append_only();

-- Permisos: solo lectura. El mentor ve sus filas vigentes; administración, todo.
-- Coordinación no ve pagos.
ALTER TABLE public.kiru_mentor_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_mentor_payout_history ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kiru_mentor_payouts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kiru_mentor_payout_history FROM anon, authenticated;
REVOKE ALL ON public.kiru_mentor_payouts, public.kiru_mentor_payout_history FROM anon;

DROP POLICY IF EXISTS kiru_mentor_payouts_read ON public.kiru_mentor_payouts;
CREATE POLICY kiru_mentor_payouts_read ON public.kiru_mentor_payouts
FOR SELECT TO authenticated
USING ((SELECT kiru_private.is_admin()) OR (mentor_id = (SELECT kiru_private.active_uid()) AND removed_at IS NULL));

DROP POLICY IF EXISTS kiru_mentor_payout_history_read ON public.kiru_mentor_payout_history;
CREATE POLICY kiru_mentor_payout_history_read ON public.kiru_mentor_payout_history
FOR SELECT TO authenticated
USING ((SELECT kiru_private.is_admin()));

-- 3. Sincronización desde la hoja -----------------------------------------------------------
-- p_rows: [{key, row, mentor_name, student_name, mentor_id, student_id, start, end,
--           status, sessions, extra_cents, amount_cents, paid_on}]
-- Las filas que ya no vienen se marcan como retiradas (no se borran).
CREATE OR REPLACE FUNCTION public.kiru_mentor_payouts_sync(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_keys text[] := '{}';
  v_saved integer := 0;
  v_removed integer;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Se esperaba una lista de filas.' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF coalesce(v_row ->> 'key', '') = '' OR (v_row ->> 'start') IS NULL OR (v_row ->> 'end') IS NULL
       OR (v_row ->> 'end')::date <= (v_row ->> 'start')::date THEN
      CONTINUE;
    END IF;
    IF (v_row ->> 'key') = ANY (v_keys) THEN CONTINUE; END IF; -- la misma fila dos veces en la hoja: vale la primera
    v_keys := v_keys || (v_row ->> 'key');
    INSERT INTO public.kiru_mentor_payouts AS p (
      sheet_key, sheet_row, mentor_name, student_name, mentor_id, student_id, period_start, period_end,
      sheet_status, sessions_registered, extra_cents, amount_cents, paid_on, removed_at, synced_at)
    VALUES (
      v_row ->> 'key', nullif(v_row ->> 'row', '')::integer, left(v_row ->> 'mentor_name', 120), left(v_row ->> 'student_name', 120),
      nullif(v_row ->> 'mentor_id', '')::uuid, nullif(v_row ->> 'student_id', '')::uuid,
      (v_row ->> 'start')::date, (v_row ->> 'end')::date, left(coalesce(v_row ->> 'status', ''), 60),
      greatest(coalesce(nullif(v_row ->> 'sessions', '')::integer, 0), 0),
      coalesce(nullif(v_row ->> 'extra_cents', '')::integer, 0), coalesce(nullif(v_row ->> 'amount_cents', '')::integer, 0),
      nullif(v_row ->> 'paid_on', '')::date, NULL, now())
    ON CONFLICT (sheet_key) DO UPDATE SET
      sheet_row = excluded.sheet_row, mentor_name = excluded.mentor_name, student_name = excluded.student_name,
      mentor_id = excluded.mentor_id, student_id = excluded.student_id, period_start = excluded.period_start,
      period_end = excluded.period_end, sheet_status = excluded.sheet_status,
      sessions_registered = excluded.sessions_registered, extra_cents = excluded.extra_cents,
      amount_cents = excluded.amount_cents, paid_on = excluded.paid_on, removed_at = NULL, synced_at = now();
    v_saved := v_saved + 1;
  END LOOP;
  -- Si la hoja llega vacía (fallo al leerla) no se retira nada.
  IF v_saved > 0 THEN
    UPDATE public.kiru_mentor_payouts SET removed_at = now(), synced_at = now()
    WHERE removed_at IS NULL AND NOT (sheet_key = ANY (v_keys));
    GET DIAGNOSTICS v_removed = ROW_COUNT;
  ELSE
    v_removed := 0;
  END IF;
  RETURN jsonb_build_object('saved', v_saved, 'removed', v_removed);
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_mentor_payouts_sync(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_mentor_payouts_sync(jsonb) TO service_role;

-- 4. Sesiones registradas de un mentor -------------------------------------------------------
-- Una fila por registro de sesión no archivado. Si hay dos registros del mismo
-- mentor, alumno y día, el primero enviado es la sesión y los demás llevan
-- duplicate_of (no cuentan dos veces, igual que en la hoja).
CREATE OR REPLACE FUNCTION public.kiru_mentor_sessions(p_mentor uuid DEFAULT NULL)
RETURNS TABLE (
  log_id uuid,
  session_date date,
  submitted_at timestamptz,
  student_id uuid,
  student_name text,
  family text,
  incident text,
  answers jsonb,
  duplicate_of uuid,
  class_id uuid,
  class_kind text,
  class_start timestamptz,
  class_mentor_id uuid,
  recovers_date timestamptz,
  slot_time time,
  payout_id uuid,
  first_class_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := kiru_private.active_uid();
  v_mentor uuid := coalesce(p_mentor, v_me);
BEGIN
  IF v_me IS NULL OR v_mentor IS NULL
     OR (v_mentor <> v_me AND NOT kiru_private.is_admin() AND NOT kiru_private.coordinates_mentor(v_mentor)) THEN
    RAISE EXCEPTION 'No puedes ver las sesiones de este mentor.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH logs AS (
    SELECT l.*,
           first_value(l.id) OVER (PARTITION BY l.student_id, l.session_date ORDER BY l.submitted_at, l.id) AS primary_id
    FROM public.kiru_session_logs l
    WHERE l.mentor_id = v_mentor AND l.manual_status IS DISTINCT FROM 'archivado' AND l.session_date IS NOT NULL
  )
  SELECT
    l.id,
    l.session_date,
    l.submitted_at,
    l.student_id,
    sp.full_name,
    (SELECT string_agg(g.full_name, ' y ' ORDER BY g.full_name)
       FROM public.student_guardians sg JOIN public.profiles g ON g.id = sg.guardian_id
      WHERE sg.student_id = l.student_id),
    l.incident,
    l.answers,
    CASE WHEN l.primary_id <> l.id THEN l.primary_id END,
    c.id,
    c.kind,
    c.scheduled_start,
    c.mentor_id,
    rc.original_start,
    (SELECT s.start_time FROM public.kiru_student_schedule_slots s
      WHERE s.student_id = l.student_id AND s.weekday = extract(isodow FROM l.session_date)
      ORDER BY (s.mentor_id = l.mentor_id) DESC, s.is_active DESC, s.start_time LIMIT 1),
    (SELECT p.id FROM public.kiru_mentor_payouts p
      WHERE p.mentor_id = l.mentor_id AND p.student_id = l.student_id AND p.removed_at IS NULL
        AND l.session_date >= p.period_start AND l.session_date < p.period_end
      ORDER BY p.period_start DESC LIMIT 1),
    (SELECT min((cs.scheduled_start AT TIME ZONE 'Europe/Madrid')::date) FROM public.kiru_class_sessions cs WHERE cs.student_id = l.student_id)
  FROM logs l
  LEFT JOIN public.profiles sp ON sp.id = l.student_id
  -- Clase de ese registro: la unida al registro o, si no, la del mismo alumno y día.
  LEFT JOIN LATERAL (
    SELECT cs.* FROM public.kiru_class_sessions cs
    WHERE cs.session_log_id = l.id
       OR (cs.student_id = l.student_id AND (cs.scheduled_start AT TIME ZONE 'Europe/Madrid')::date = l.session_date
           AND cs.delivery <> 'anulada'
           AND NOT EXISTS (SELECT 1 FROM public.kiru_class_sessions x WHERE x.session_log_id = l.id))
    ORDER BY (cs.session_log_id = l.id) DESC NULLS LAST, cs.scheduled_start
    LIMIT 1
  ) c ON true
  LEFT JOIN public.kiru_class_sessions rc ON rc.id = c.recovers_session_id
  ORDER BY l.session_date DESC, l.submitted_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_mentor_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_mentor_sessions(uuid) TO authenticated;

-- 5. Comprobaciones para administración ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_mentor_payout_checks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT kiru_private.is_admin() THEN
    RAISE EXCEPTION 'Solo administración.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'last_sync', (SELECT max(synced_at) FROM public.kiru_mentor_payouts),
    -- Sesiones que cuenta el campus (sin repetidos) distintas de «Sesiones registradas» de la hoja.
    'mismatches', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'mentor', p.mentor_name, 'student', p.student_name,
               'start', p.period_start, 'end', p.period_end, 'sheet', p.sessions_registered, 'campus', x.n) ORDER BY p.period_start)
      FROM public.kiru_mentor_payouts p
      CROSS JOIN LATERAL (
        SELECT count(DISTINCT l.session_date)::integer AS n FROM public.kiru_session_logs l
        WHERE l.mentor_id = p.mentor_id AND l.student_id = p.student_id AND l.manual_status IS DISTINCT FROM 'archivado'
          AND l.session_date >= p.period_start AND l.session_date < p.period_end
      ) x
      WHERE p.removed_at IS NULL AND p.mentor_id IS NOT NULL AND p.student_id IS NOT NULL
        AND p.period_start <= current_date AND x.n <> p.sessions_registered), '[]'::jsonb),
    -- Dos filas del mismo mentor y alumno con fechas que se pisan: una sesión podría contarse dos veces.
    'overlaps', coalesce((
      SELECT jsonb_agg(jsonb_build_object('mentor', a.mentor_name, 'student', a.student_name,
               'a_start', a.period_start, 'a_end', a.period_end, 'b_start', b.period_start, 'b_end', b.period_end))
      FROM public.kiru_mentor_payouts a
      JOIN public.kiru_mentor_payouts b ON b.mentor_name = a.mentor_name AND b.student_name = a.student_name AND a.id < b.id
        AND a.period_start < b.period_end AND b.period_start < a.period_end
      WHERE a.removed_at IS NULL AND b.removed_at IS NULL), '[]'::jsonb),
    -- Nombres de la hoja sin cuenta en el campus (esas filas no las ve nadie más que administración).
    'unmatched', coalesce((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('mentor', p.mentor_name, 'student', p.student_name,
               'missing', CASE WHEN p.mentor_id IS NULL AND p.student_id IS NULL THEN 'ambos' WHEN p.mentor_id IS NULL THEN 'mentor' ELSE 'alumno' END))
      FROM public.kiru_mentor_payouts p
      WHERE p.removed_at IS NULL AND (p.mentor_id IS NULL OR p.student_id IS NULL)
        AND (p.sessions_registered > 0 OR p.sheet_status = 'Pagado')), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_mentor_payout_checks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_mentor_payout_checks() TO authenticated;
