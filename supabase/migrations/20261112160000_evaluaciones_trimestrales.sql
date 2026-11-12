-- Evaluaciones trimestrales (decidido por Sofía el 12/11/2026).
--
-- Tres evaluaciones por alumno, cada una con su propio calendario:
-- · familia: formulario de Jotform el primer día de clase del alumno y después
--   cada 3 meses desde ese día. Recordatorios a los 4 y 8 días; a los 10 días
--   sin respuesta se avisa al coordinador.
-- · mentor: formulario de Jotform 4 semanas después de su primera clase con el
--   alumno y después cada 3 meses. Solo se puede rellenar 5 días (de 2 días
--   antes a 2 días después de su fecha).
-- · alumno: evaluación en papel (test fijo + prueba académica de Calcúlalo).
--   La inicial, en las primeras sesiones (escaneo subido en 14 días); las
--   siguientes, la semana anterior al formulario del mentor. La prueba académica
--   la elige el mentor, el coordinador o administración; si la sube el mentor,
--   tiene que aprobarla el coordinador o administración. El mentor (o
--   coordinación, si la pasó un sustituto) sube el escaneo.
--
-- Nada se envía mientras el ajuste «evaluaciones».modo sea «apagado». En modo
-- «prueba» solo se trabaja con los alumnos de «alumnos_prueba».
-- Todo se lee y escribe desde el servidor (service role) con comprobación de rol.

-- 1. Ajustes ----------------------------------------------------------------------
INSERT INTO public.kiru_settings (key, value) VALUES
  ('evaluaciones', jsonb_build_object(
    'modo', 'apagado',
    'alumnos_prueba', '[]'::jsonb,
    'form_familia', 'https://form.jotform.com/262883780066063',
    'form_mentor', 'https://form.jotform.com/262884295985075',
    'test_fijo_path', NULL))
ON CONFLICT (key) DO NOTHING;

-- 2. Ajustes por alumno ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_evaluation_students (
  student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Si se rellena, sustituye a la primera sesión registrada como inicio de la familia.
  family_start_on date,
  -- Alumnos que ya llevaban tiempo cuando empezó el sistema: sin evaluación inicial.
  skip_initial boolean NOT NULL DEFAULT false,
  paused boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Evaluaciones --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Va en el enlace del formulario (/evaluacion/{token}) y vuelve en la respuesta de Jotform.
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('familia', 'mentor', 'alumno')),
  cycle smallint NOT NULL CHECK (cycle BETWEEN 0 AND 400),
  mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  anchor_on date NOT NULL,
  due_on date NOT NULL,
  original_due_on date NOT NULL,
  status text NOT NULL DEFAULT 'programada'
    CHECK (status IN ('programada', 'abierta', 'completada', 'sin_respuesta', 'cancelada')),
  opened_at timestamptz,
  opened_on date,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_via text CHECK (completed_via IS NULL OR completed_via IN ('formulario', 'manual', 'escaneo')),
  submission_id text CHECK (submission_id IS NULL OR length(submission_id) <= 64),
  -- Copia de las respuestas que manda Jotform (además de Jotform y su hoja de Google).
  answers jsonb CHECK (answers IS NULL OR (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) < 200000)),
  late boolean NOT NULL DEFAULT false,
  -- Avisos ya creados para esta evaluación (abre, r1, r2, coord, elegir, imprimir, academica_falta).
  steps text[] NOT NULL DEFAULT '{}',
  -- Papel del alumno.
  academic_path text,
  academic_name text NOT NULL DEFAULT '' CHECK (length(academic_name) <= 200),
  academic_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  academic_status text NOT NULL DEFAULT 'sin_elegir' CHECK (academic_status IN ('sin_elegir', 'por_aprobar', 'aprobada')),
  academic_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  academic_reviewed_at timestamptz,
  scan_paths text[] NOT NULL DEFAULT '{}',
  scan_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  scan_at timestamptz,
  -- Quién pasó la prueba en papel: el mentor habitual o un sustituto (nombre).
  given_by text NOT NULL DEFAULT '' CHECK (length(given_by) <= 120),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  moved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (target <> 'familia' OR mentor_id IS NULL),
  CHECK ((status = 'completada') = (completed_at IS NOT NULL))
);
COMMENT ON TABLE public.kiru_evaluations IS
  'Evaluaciones trimestrales: formulario de la familia, formulario del mentor y evaluación en papel del alumno. Las crea la tarea diaria kiru_evaluaciones_tarea_diaria.';

CREATE UNIQUE INDEX IF NOT EXISTS kiru_evaluations_once
  ON public.kiru_evaluations (student_id, target, coalesce(mentor_id, '00000000-0000-0000-0000-000000000000'::uuid), cycle);
CREATE INDEX IF NOT EXISTS kiru_evaluations_open_idx ON public.kiru_evaluations (status, due_on);
CREATE INDEX IF NOT EXISTS kiru_evaluations_mentor_idx ON public.kiru_evaluations (mentor_id);

ALTER TABLE public.kiru_evaluation_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiru_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_evaluation_students, public.kiru_evaluations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.kiru_evaluation_students, public.kiru_evaluations TO service_role;

-- 4. Almacén privado de PDF y escaneos (solo el servidor; se descarga con enlaces firmados).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kiru-evaluaciones', 'kiru-evaluaciones', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

-- 5. Avisos -------------------------------------------------------------------------
ALTER TABLE public.kiru_notifications DROP CONSTRAINT IF EXISTS kiru_notifications_kind_check;
ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check
  CHECK (kind IN ('objetivo_pendiente', 'objetivo_aprobado', 'objetivo_rechazado', 'canje_solicitado',
                  'canje_completado', 'canje_aplazado', 'renovacion', 'informe_progreso',
                  'clase_solicitud', 'clase_decision', 'clase_mas_info', 'recuperacion_propuesta',
                  'recuperacion_confirmada', 'recuperacion_sin_encaje', 'recuperacion_nueva',
                  'recuperacion_sin_avanzar', 'recuperacion_recordatorio', 'recuperacion_fin_periodo',
                  'registro_aviso', 'clase_incidencia',
                  'justificacion_solicitada', 'justificacion_respondida', 'justificacion_repregunta',
                  'justificacion_cerrada', 'justificacion_recordatorio', 'justificacion_por_valorar',
                  'aviso_metodologico', 'aviso_seguimiento',
                  'periodo_especial', 'evaluacion_trimestral'));

-- Coordinadores del alumno (los de sus mentores); si no tiene, administración.
CREATE OR REPLACE FUNCTION kiru_private.eval_supervisors(p_student uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH c AS (
    SELECT DISTINCT cm.coordinator_id AS id
    FROM public.student_mentors sm
    JOIN public.kiru_coordinator_mentors cm ON cm.mentor_id = sm.mentor_id
    JOIN public.profiles p ON p.id = cm.coordinator_id AND p.is_active
    WHERE sm.student_id = p_student
  )
  SELECT id FROM c
  UNION ALL
  SELECT p.id FROM public.profiles p WHERE p.role = 'admin' AND p.is_active AND NOT EXISTS (SELECT 1 FROM c)
$$;
REVOKE ALL ON FUNCTION kiru_private.eval_supervisors(uuid) FROM PUBLIC;

-- Crea los avisos de un paso (campanita + correo) y apunta el paso como hecho.
-- event_key = eval:{id}:{paso}:{fecha}; el correo lo arma /api/avisos/evaluaciones.
CREATE OR REPLACE FUNCTION kiru_private.eval_notify(p_eval uuid, p_recipients uuid[], p_step text, p_title text, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student uuid;
  v_due date;
BEGIN
  SELECT student_id, due_on INTO v_student, v_due FROM public.kiru_evaluations WHERE id = p_eval;
  -- La clave lleva la fecha: si coordinación mueve la evaluación, los avisos vuelven a salir.
  INSERT INTO public.kiru_notifications (recipient_id, student_id, kind, title, body, event_key, email_status)
  SELECT r, v_student, 'evaluacion_trimestral', left(p_title, 200), left(p_body, 1000),
         'eval:' || p_eval || ':' || p_step || ':' || v_due, 'pendiente'
  FROM unnest(p_recipients) AS r
  WHERE r IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r AND p.is_active)
  ON CONFLICT (recipient_id, event_key) DO NOTHING;
  UPDATE public.kiru_evaluations SET steps = array_append(steps, p_step), updated_at = now()
  WHERE id = p_eval AND NOT (p_step = ANY (steps));
END;
$$;
REVOKE ALL ON FUNCTION kiru_private.eval_notify(uuid, uuid[], text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION kiru_private.eval_date(p date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT to_char(p, 'DD/MM') $$;
REVOKE ALL ON FUNCTION kiru_private.eval_date(date) FROM PUBLIC;

-- 6. Tarea diaria ------------------------------------------------------------------------
-- Repetirla el mismo día no duplica evaluaciones ni avisos.
CREATE OR REPLACE FUNCTION public.kiru_evaluaciones_tarea_diaria(p_today date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := coalesce(p_today, (now() AT TIME ZONE 'Europe/Madrid')::date);
  v_cfg jsonb := coalesce((SELECT value FROM public.kiru_settings WHERE key = 'evaluaciones'), '{}'::jsonb);
  v_mode text := coalesce(v_cfg ->> 'modo', 'apagado');
  v_test uuid[];
  v_scope uuid[];
  s record;
  m record;
  e record;
  v_anchor date;
  v_due date;
  v_first smallint;
  n int;
  v_open date;
  v_kid text;
  v_guardians uuid[];
  v_sup uuid[];
  v_created int := 0;
  v_notices int := 0;
BEGIN
  IF v_mode NOT IN ('prueba', 'activo') THEN
    RETURN jsonb_build_object('modo', v_mode, 'creadas', 0, 'avisos', 0);
  END IF;
  SELECT coalesce(array_agg(x::uuid), '{}') INTO v_test
  FROM jsonb_array_elements_text(coalesce(v_cfg -> 'alumnos_prueba', '[]'::jsonb)) AS x
  WHERE x ~* '^[0-9a-f-]{36}$';

  SELECT coalesce(array_agg(p.id), '{}') INTO v_scope
  FROM public.profiles p
  JOIN public.students st ON st.profile_id = p.id
  LEFT JOIN public.kiru_evaluation_students es ON es.student_id = p.id
  WHERE p.role = 'alumno' AND p.is_active AND st.service_status = 'activo' AND NOT coalesce(es.paused, false)
    AND (v_mode = 'activo' OR p.id = ANY (v_test));

  -- 6.1 Crear las evaluaciones que tocan en las próximas 3 semanas -------------------
  FOR s IN
    SELECT sc.student_id, es.family_start_on, coalesce(es.skip_initial, false) AS skip_initial
    FROM unnest(v_scope) AS sc(student_id) LEFT JOIN public.kiru_evaluation_students es ON es.student_id = sc.student_id
  LOOP
    v_first := CASE WHEN s.skip_initial THEN 1 ELSE 0 END;

    -- Familia: desde el primer día de clase (primera sesión registrada).
    v_anchor := coalesce(s.family_start_on, (
      SELECT min(coalesce(l.session_date, (l.submitted_at AT TIME ZONE 'Europe/Madrid')::date))
      FROM public.kiru_session_logs l
      WHERE l.student_id = s.student_id AND coalesce(l.manual_status, '') <> 'archivado'));
    IF v_anchor IS NOT NULL THEN
      n := v_first;
      LOOP
        v_due := (v_anchor + make_interval(months => 3 * n))::date;
        EXIT WHEN v_due > v_today + 21 OR n > 400;
        IF v_due >= v_today - 10 THEN
          INSERT INTO public.kiru_evaluations (student_id, target, cycle, anchor_on, due_on, original_due_on)
          VALUES (s.student_id, 'familia', n, v_anchor, v_due, v_due)
          ON CONFLICT DO NOTHING;
          IF FOUND THEN v_created := v_created + 1; END IF;
        END IF;
        n := n + 1;
      END LOOP;
    END IF;

    -- Mentor y papel del alumno: desde la primera clase de cada mentor habitual.
    FOR m IN
      SELECT sm.mentor_id, sm.assigned_at,
             (SELECT min(coalesce(l.session_date, (l.submitted_at AT TIME ZONE 'Europe/Madrid')::date))
              FROM public.kiru_session_logs l
              WHERE l.student_id = s.student_id AND l.mentor_id = sm.mentor_id
                AND coalesce(l.manual_status, '') <> 'archivado') AS first_class
      FROM public.student_mentors sm
      JOIN public.profiles mp ON mp.id = sm.mentor_id AND mp.is_active AND mp.role = 'mentor'
      WHERE sm.student_id = s.student_id
    LOOP
      -- Papel inicial: en las primeras sesiones, aunque aún no haya ninguna registrada.
      IF NOT s.skip_initial THEN
        v_anchor := coalesce(m.first_class, (m.assigned_at AT TIME ZONE 'Europe/Madrid')::date);
        v_due := v_anchor + 14;
        IF v_due BETWEEN v_today - 10 AND v_today + 21 THEN
          INSERT INTO public.kiru_evaluations (student_id, target, cycle, mentor_id, anchor_on, due_on, original_due_on)
          VALUES (s.student_id, 'alumno', 0, m.mentor_id, v_anchor, v_due, v_due)
          ON CONFLICT DO NOTHING;
          IF FOUND THEN v_created := v_created + 1; END IF;
        END IF;
      END IF;
      CONTINUE WHEN m.first_class IS NULL;
      n := v_first;
      LOOP
        v_due := (m.first_class + 28 + make_interval(months => 3 * n))::date;
        EXIT WHEN v_due - 5 > v_today + 21 OR n > 400;
        -- Formulario del mentor: solo si su plazo de 5 días aún no ha pasado.
        IF v_due BETWEEN v_today - 2 AND v_today + 21 THEN
          INSERT INTO public.kiru_evaluations (student_id, target, cycle, mentor_id, anchor_on, due_on, original_due_on)
          VALUES (s.student_id, 'mentor', n, m.mentor_id, m.first_class, v_due, v_due)
          ON CONFLICT DO NOTHING;
          IF FOUND THEN v_created := v_created + 1; END IF;
        END IF;
        -- Papel de los trimestres siguientes: la semana anterior al formulario del mentor.
        IF n >= 1 AND v_due - 5 BETWEEN v_today - 10 AND v_today + 21 THEN
          INSERT INTO public.kiru_evaluations (student_id, target, cycle, mentor_id, anchor_on, due_on, original_due_on)
          VALUES (s.student_id, 'alumno', n, m.mentor_id, m.first_class, v_due - 5, v_due - 5)
          ON CONFLICT DO NOTHING;
          IF FOUND THEN v_created := v_created + 1; END IF;
        END IF;
        n := n + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Si el mentor ya no lleva al alumno, sus evaluaciones pendientes se cancelan.
  UPDATE public.kiru_evaluations ke SET status = 'cancelada', updated_at = now()
  WHERE ke.target IN ('mentor', 'alumno') AND ke.status IN ('programada', 'abierta')
    AND ke.student_id = ANY (v_scope)
    AND NOT EXISTS (SELECT 1 FROM public.student_mentors sm WHERE sm.student_id = ke.student_id AND sm.mentor_id = ke.mentor_id);

  -- 6.2 Abrir, recordar y cerrar ----------------------------------------------------------
  FOR e IN
    SELECT ev.* FROM public.kiru_evaluations ev
    WHERE ev.status IN ('programada', 'abierta') AND ev.student_id = ANY (v_scope)
    ORDER BY ev.due_on
  LOOP
    v_kid := kiru_private.first_name(e.student_id);
    v_sup := ARRAY(SELECT kiru_private.eval_supervisors(e.student_id));
    v_open := coalesce(e.opened_on, e.due_on);

    IF e.target = 'familia' THEN
      v_guardians := ARRAY(
        SELECT sg.guardian_id FROM public.student_guardians sg
        JOIN public.profiles g ON g.id = sg.guardian_id AND g.is_active AND g.role = 'padre'
        WHERE sg.student_id = e.student_id);
      IF e.status = 'programada' AND v_today >= e.due_on THEN
        UPDATE public.kiru_evaluations SET status = 'abierta', opened_at = now(), opened_on = v_today, updated_at = now() WHERE id = e.id;
        PERFORM kiru_private.eval_notify(e.id, v_guardians, 'abre',
          CASE WHEN e.cycle = 0 THEN 'Evaluación inicial de ' ELSE 'Evaluación trimestral de ' END || v_kid,
          'Os pedimos 5-10 minutos para contarnos cómo veis a ' || v_kid || ' en casa. Sirve para preparar su informe y los objetivos de los próximos 3 meses.');
        v_notices := v_notices + 1;
      ELSIF e.status = 'abierta' THEN
        IF v_today > e.due_on + 30 THEN
          UPDATE public.kiru_evaluations SET status = 'sin_respuesta', updated_at = now() WHERE id = e.id;
        ELSIF v_today >= v_open + 10 AND NOT ('coord' = ANY (e.steps)) THEN
          PERFORM kiru_private.eval_notify(e.id, v_sup, 'coord',
            'La familia de ' || v_kid || ' no ha rellenado la evaluación',
            'Se abrió el ' || kiru_private.eval_date(e.due_on) || ' y ya se le han mandado dos recordatorios. Quizá convenga escribirles o llamarles.');
          v_notices := v_notices + 1;
        ELSIF v_today >= v_open + 8 AND NOT ('r2' = ANY (e.steps)) THEN
          PERFORM kiru_private.eval_notify(e.id, v_guardians, 'r2',
            'Último recordatorio: evaluación de ' || v_kid,
            'Aún no hemos recibido vuestra evaluación de ' || v_kid || '. Son 5-10 minutos y nos ayuda mucho a preparar su informe.');
          v_notices := v_notices + 1;
        ELSIF v_today >= v_open + 4 AND NOT ('r1' = ANY (e.steps)) THEN
          PERFORM kiru_private.eval_notify(e.id, v_guardians, 'r1',
            'Recordatorio: evaluación de ' || v_kid,
            'Cuando podáis, rellenad la evaluación de ' || v_kid || '. Son 5-10 minutos.');
          v_notices := v_notices + 1;
        END IF;
      END IF;

    ELSIF e.target = 'mentor' THEN
      IF e.status = 'programada' AND v_today >= e.due_on - 2 THEN
        UPDATE public.kiru_evaluations SET status = 'abierta', opened_at = now(), opened_on = v_today, updated_at = now() WHERE id = e.id;
        PERFORM kiru_private.eval_notify(e.id, ARRAY[e.mentor_id], 'abre',
          CASE WHEN e.cycle = 0 THEN 'Tu primera evaluación de ' ELSE 'Tu evaluación trimestral de ' END || v_kid,
          'Rellena tu formulario con lo que has observado en las últimas 4 semanas. Solo está abierto del '
            || kiru_private.eval_date(e.due_on - 2) || ' al ' || kiru_private.eval_date(e.due_on + 2) || '.');
        v_notices := v_notices + 1;
      ELSIF e.status = 'abierta' THEN
        IF v_today > e.due_on + 2 THEN
          UPDATE public.kiru_evaluations SET status = 'sin_respuesta', updated_at = now() WHERE id = e.id;
          PERFORM kiru_private.eval_notify(e.id, v_sup, 'coord',
            coalesce((SELECT split_part(full_name, ' ', 1) FROM public.profiles WHERE id = e.mentor_id), 'El mentor')
              || ' no ha rellenado la evaluación de ' || v_kid,
            'El plazo terminó el ' || kiru_private.eval_date(e.due_on + 2) || '. Si hace falta, puedes abrirle otro plazo moviendo la fecha en «Evaluaciones».');
          v_notices := v_notices + 1;
        ELSIF v_today >= e.due_on + 1 AND NOT ('r1' = ANY (e.steps)) THEN
          PERFORM kiru_private.eval_notify(e.id, ARRAY[e.mentor_id], 'r1',
            'Recordatorio: evaluación de ' || v_kid,
            'Tu formulario de evaluación de ' || v_kid || ' se cierra el ' || kiru_private.eval_date(e.due_on + 2) || '.');
          v_notices := v_notices + 1;
        END IF;
      END IF;

    ELSE -- papel del alumno
      IF e.academic_status <> 'aprobada' AND NOT ('elegir' = ANY (e.steps))
         AND (e.cycle = 0 OR v_today >= e.due_on - 9) THEN
        PERFORM kiru_private.eval_notify(e.id, v_sup || e.mentor_id, 'elegir',
          'Elegir la prueba académica de ' || v_kid,
          'Sube en «Evaluaciones» la prueba de Calcúlalo para ' || v_kid || ' (PDF). Se pasa en clase la semana del '
            || kiru_private.eval_date(e.due_on - 5) || '. Si la sube el mentor, la aprueba coordinación.');
        v_notices := v_notices + 1;
      END IF;
      IF e.status = 'programada' AND (e.cycle = 0 OR v_today >= e.due_on - 5) THEN
        UPDATE public.kiru_evaluations SET status = 'abierta', opened_at = now(), opened_on = v_today, updated_at = now() WHERE id = e.id;
        PERFORM kiru_private.eval_notify(e.id, ARRAY[e.mentor_id], 'imprimir',
          CASE WHEN e.cycle = 0 THEN 'Evaluación inicial en papel de ' ELSE 'Imprime la evaluación de ' END || v_kid,
          CASE WHEN e.cycle = 0
               THEN 'Imprime el test y la prueba académica desde «Evaluaciones» y pásaselos en las primeras sesiones, sin ayudarle. Sube el escaneo antes del '
               ELSE 'Imprime el test y la prueba académica desde «Evaluaciones» y pásaselos en clase esta semana, sin ayudarle. Sube el escaneo antes del ' END
            || kiru_private.eval_date(e.due_on) || '.');
        IF e.academic_status <> 'aprobada' THEN
          PERFORM kiru_private.eval_notify(e.id, v_sup, 'academica_falta',
            'Falta la prueba académica de ' || v_kid,
            'El mentor ya tiene que pasar la evaluación en papel y la prueba académica aún no está ' ||
              CASE WHEN e.academic_status = 'por_aprobar' THEN 'aprobada.' ELSE 'subida.' END);
        END IF;
        v_notices := v_notices + 1;
      ELSIF e.status = 'abierta' THEN
        IF v_today >= e.due_on + 10 AND NOT ('coord' = ANY (e.steps)) THEN
          PERFORM kiru_private.eval_notify(e.id, v_sup, 'coord',
            'Falta el escaneo de la evaluación de ' || v_kid,
            'Tenía que estar subido el ' || kiru_private.eval_date(e.due_on) || '.');
          v_notices := v_notices + 1;
        ELSIF v_today >= e.due_on + 3 AND NOT ('r1' = ANY (e.steps)) THEN
          PERFORM kiru_private.eval_notify(e.id, ARRAY[e.mentor_id], 'r1',
            'Sube el escaneo de la evaluación de ' || v_kid,
            'Cuando se la hayas pasado, sube el escaneo (PDF o fotos) desde «Evaluaciones».');
          v_notices := v_notices + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('modo', v_mode, 'creadas', v_created, 'avisos', v_notices);
END;
$$;
REVOKE ALL ON FUNCTION public.kiru_evaluaciones_tarea_diaria(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_evaluaciones_tarea_diaria(date) TO service_role;

-- 7. Tarea programada (pg_cron, si está disponible): 07:00 UTC (8:00 o 9:00 en Madrid).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiru_evaluaciones_diaria';
      PERFORM cron.schedule('kiru_evaluaciones_diaria', '0 7 * * *', 'SELECT public.kiru_evaluaciones_tarea_diaria()');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'pg_cron no disponible (%); la tarea diaria se ejecutará desde Vercel Cron.', SQLERRM;
    END;
  END IF;
END
$cron$;
