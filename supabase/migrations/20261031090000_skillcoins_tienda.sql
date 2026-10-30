-- Tienda de recompensas SkillCoins y saldo real.
--
-- Saldo = SkillCoins ganadas − SkillCoins canjeadas.
--
-- · Ganadas: se calculan aquí, en la base de datos, a partir de la hoja
--   «Registro de sesión» (kiru_session_logs, que solo escribe el servidor):
--   cada semana suma las cuatro notas 0-10 (estudios, compromiso, organización,
--   bienestar) del último registro completo de esa semana. Si el mentor corrige
--   la semana actual (o administración cualquier semana), la corrección queda
--   registrada en kiru_skillcoin_corrections y sustituye a esa semana. El
--   registro skillcoins_<id> de kiru_app_records pasa a ser solo una copia para
--   mostrar: el saldo nunca se lee de ahí, así que nadie puede inflarlo
--   editándolo.
-- · Canjeadas: kiru_skillcoin_movements, un movimiento por canje confirmado.
--
-- Tablas nuevas (no se modifica ninguna existente):
-- 1. kiru_rewards: el catálogo oficial («Catálogo SkillCoins A5»), que antes
--    estaba escrito dentro de la página del alumno. Preparado para que un
--    editor de administración lo cambie más adelante.
-- 2. kiru_skillcoin_corrections: historial de correcciones semanales.
-- 3. kiru_reward_goals: la recompensa objetivo del alumno y su recorrido:
--    pendiente → aprobado (o rechazado) → canje_solicitado → completado.
--    «Objetivo conseguido» no se guarda: es aprobado + saldo ≥ coste. Un único
--    objetivo activo por alumno; puede pedir cambiarlo aunque esté aprobado y
--    el cambio vuelve a pasar por la familia (mientras, sigue el aprobado).
-- 4. kiru_skillcoin_movements: lo gastado en canjes.
-- 5. kiru_notifications: avisos dentro del campus. Los de las familias que
--    llevan correo quedan en email_status = 'pendiente' hasta que el Apps
--    Script los manda.
--
-- Nadie escribe directamente en estas tablas: cada paso es una función que
-- comprueba quién la llama y bloquea la fila mientras cambia, para que dos
-- pulsaciones a la vez no dupliquen nada ni descuenten dos veces.

-- 1. Catálogo -----------------------------------------------------------------
CREATE TABLE public.kiru_rewards (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,80}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 80),
  category_order integer NOT NULL DEFAULT 0,
  cost integer NOT NULL CHECK (cost > 0 AND cost <= 100000),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kiru_rewards IS
  'Catálogo de recompensas SkillCoins. Lectura para cualquier usuario activo; solo administración lo cambia.';

CREATE TRIGGER kiru_rewards_touch
BEFORE UPDATE ON public.kiru_rewards
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

ALTER TABLE public.kiru_rewards ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_rewards FROM anon, authenticated;

CREATE POLICY kiru_rewards_read ON public.kiru_rewards
FOR SELECT TO authenticated
USING ((SELECT kiru_private.active_uid()) IS NOT NULL);

INSERT INTO public.kiru_rewards (id, name, category, category_order, cost, sort_order) VALUES
  ('pegatinas', 'Pegatinas', 'Pequeños detalles', 1, 30, 1),
  ('boligrafo-especial', 'Bolígrafo especial', 'Pequeños detalles', 1, 40, 2),
  ('lapiz-especial', 'Lápiz especial', 'Pequeños detalles', 1, 40, 3),
  ('goma-divertida', 'Goma divertida', 'Pequeños detalles', 1, 40, 4),
  ('libreta-pequena', 'Libreta pequeña', 'Pequeños detalles', 1, 60, 5),
  ('llavero', 'Llavero', 'Pequeños detalles', 1, 70, 6),
  ('peluche-pequeno', 'Peluche pequeño', 'Pequeños detalles', 1, 80, 7),
  ('balon-de-espuma', 'Balón de espuma', 'Pequeños detalles', 1, 80, 8),
  ('comic', 'Cómic', 'Pequeños detalles', 1, 100, 9),
  ('acuarelas', 'Acuarelas', 'Arte y creatividad', 2, 120, 10),
  ('set-de-pinceles', 'Set de pinceles', 'Arte y creatividad', 2, 120, 11),
  ('rotuladores', 'Rotuladores', 'Arte y creatividad', 2, 150, 12),
  ('cuaderno-de-dibujo', 'Cuaderno de dibujo', 'Arte y creatividad', 2, 150, 13),
  ('material-manualidades', 'Material manualidades', 'Arte y creatividad', 2, 200, 14),
  ('kit-de-pintura', 'Kit de pintura', 'Arte y creatividad', 2, 300, 15),
  ('kit-de-arcilla', 'Kit de arcilla', 'Arte y creatividad', 2, 350, 16),
  ('kit-de-ciencia', 'Kit de ciencia', 'Arte y creatividad', 2, 500, 17),
  ('juego-de-cartas', 'Juego de cartas', 'Juegos y construcción', 3, 180, 18),
  ('libro', 'Libro', 'Juegos y construcción', 3, 250, 19),
  ('juego-de-mesa', 'Juego de mesa', 'Juegos y construcción', 3, 450, 20),
  ('lego', 'LEGO', 'Juegos y construcción', 3, 600, 21),
  ('juego-de-estrategia', 'Juego de estrategia', 'Juegos y construcción', 3, 500, 22),
  ('set-de-magia', 'Set de magia', 'Juegos y construcción', 3, 500, 23),
  ('kit-de-modelismo', 'Kit de modelismo', 'Juegos y construcción', 3, 600, 24),
  ('frisbee', 'Frisbee', 'Deporte', 4, 120, 25),
  ('comba', 'Comba', 'Deporte', 4, 120, 26),
  ('raquetas-de-playa', 'Raquetas de playa', 'Deporte', 4, 180, 27),
  ('balon-de-voleibol', 'Balón de voleibol', 'Deporte', 4, 250, 28),
  ('balon-de-futbol', 'Balón de fútbol', 'Deporte', 4, 300, 29),
  ('balon-de-baloncesto', 'Balón de baloncesto', 'Deporte', 4, 300, 30),
  ('material-deportivo', 'Material deportivo', 'Deporte', 4, 350, 31),
  ('material-para-practicar-un-deporte', 'Material para practicar un deporte', 'Deporte', 4, 500, 32),
  ('cocinar-una-receta-especial', 'Cocinar una receta especial', 'Experiencias', 5, 250, 33),
  ('tarde-especial', 'Tarde especial', 'Experiencias', 5, 300, 34),
  ('invitar-amigo-a-casa', 'Invitar amigo a casa', 'Experiencias', 5, 350, 35),
  ('ir-al-cine', 'Ir al cine', 'Experiencias', 5, 400, 36),
  ('ir-a-los-bolos', 'Ir a los bolos', 'Experiencias', 5, 500, 37),
  ('ir-al-minigolf', 'Ir al minigolf', 'Experiencias', 5, 500, 38),
  ('probar-un-deporte-nuevo', 'Probar un deporte nuevo', 'Experiencias', 5, 500, 39),
  ('escape-room', 'Escape Room', 'Experiencias', 5, 700, 40),
  ('dia-de-escalada', 'Día de escalada', 'Experiencias', 5, 700, 41),
  ('parque-de-aventuras-o-tirolinas', 'Parque de aventuras o tirolinas', 'Experiencias', 5, 800, 42),
  ('parque-acuatico', 'Parque acuático', 'Experiencias', 5, 900, 43),
  ('parque-tematico', 'Parque temático', 'Experiencias', 5, 1000, 44),
  ('mochila-especial', 'Mochila especial', 'Grandes recompensas', 6, 900, 45),
  ('material-deportivo-especial', 'Material deportivo especial', 'Grandes recompensas', 6, 1000, 46),
  ('experiencia-especial', 'Experiencia especial', 'Grandes recompensas', 6, 1000, 47),
  ('excursion-de-un-dia', 'Excursión de un día', 'Grandes recompensas', 6, 1000, 48),
  ('dia-completo-de-aventura', 'Día completo de aventura', 'Grandes recompensas', 6, 1000, 49),
  ('escapada-familiar', 'Escapada familiar', 'Grandes recompensas', 6, 1000, 50);

-- Quién puede ver los datos de un alumno: él mismo, su familia, su mentor, su
-- coordinador y administración.
CREATE OR REPLACE FUNCTION kiru_private.can_view_student(student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT student = kiru_private.active_uid()
    OR kiru_private.is_admin()
    OR EXISTS (SELECT 1 FROM public.student_guardians sg
               WHERE sg.student_id = student AND sg.guardian_id = kiru_private.active_uid())
    OR EXISTS (SELECT 1 FROM public.student_mentors sm
               WHERE sm.student_id = student AND sm.mentor_id = kiru_private.active_uid())
    OR kiru_private.coordinates_student(student)
$$;

-- Solo una familia (rol padre) vinculada a ese alumno.
CREATE OR REPLACE FUNCTION kiru_private.is_guardian_of(student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(kiru_private.kiru_role() = 'padre', false) AND EXISTS (
    SELECT 1 FROM public.student_guardians sg
    WHERE sg.student_id = student AND sg.guardian_id = kiru_private.active_uid()
  )
$$;

REVOKE ALL ON FUNCTION kiru_private.can_view_student(uuid), kiru_private.is_guardian_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.can_view_student(uuid), kiru_private.is_guardian_of(uuid) TO authenticated;

-- 2. Correcciones semanales -----------------------------------------------------
CREATE TABLE public.kiru_skillcoin_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Lunes de la semana corregida.
  week date NOT NULL CHECK (extract(isodow FROM week) = 1),
  estudios smallint NOT NULL CHECK (estudios BETWEEN 0 AND 10),
  compromiso smallint NOT NULL CHECK (compromiso BETWEEN 0 AND 10),
  organizacion smallint NOT NULL CHECK (organizacion BETWEEN 0 AND 10),
  bienestar smallint NOT NULL CHECK (bienestar BETWEEN 0 AND 10),
  -- Lo que había antes de la corrección (de la hoja o de otra corrección).
  previous jsonb,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  corrected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  corrected_role text NOT NULL CHECK (corrected_role IN ('mentor', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kiru_skillcoin_corrections_week_idx ON public.kiru_skillcoin_corrections (student_id, week, created_at DESC);
CREATE INDEX kiru_skillcoin_corrections_by_idx ON public.kiru_skillcoin_corrections (corrected_by);

COMMENT ON TABLE public.kiru_skillcoin_corrections IS
  'Correcciones de SkillCoins semanales. Vale la última de cada semana. Solo se escribe con kiru_skillcoin_correct_week.';

ALTER TABLE public.kiru_skillcoin_corrections ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_skillcoin_corrections FROM anon, authenticated;

CREATE POLICY kiru_skillcoin_corrections_read ON public.kiru_skillcoin_corrections
FOR SELECT TO authenticated
USING ((SELECT kiru_private.can_view_student(student_id)));

-- 3. Objetivos ----------------------------------------------------------------
CREATE TABLE public.kiru_reward_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id text NOT NULL REFERENCES public.kiru_rewards(id),
  reward_name text NOT NULL,
  reward_category text NOT NULL,
  cost integer NOT NULL CHECK (cost > 0),
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'aprobado', 'rechazado', 'canje_solicitado', 'completado', 'cancelado', 'sustituido')),
  -- Si es una petición de cambio, el objetivo aprobado al que sustituiría.
  replaces_goal_id uuid REFERENCES public.kiru_reward_goals(id) ON DELETE SET NULL,
  family_note text NOT NULL DEFAULT '' CHECK (length(family_note) <= 500),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Cuántas veces se ha pedido el canje (si la familia lo deja para más tarde, se puede volver a pedir).
  redeem_round integer NOT NULL DEFAULT 0,
  redeem_requested_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un único objetivo activo (aprobado o en canje) y, como mucho, una petición pendiente.
CREATE UNIQUE INDEX kiru_reward_goals_one_active_idx ON public.kiru_reward_goals (student_id)
  WHERE status IN ('aprobado', 'canje_solicitado');
CREATE UNIQUE INDEX kiru_reward_goals_one_pending_idx ON public.kiru_reward_goals (student_id)
  WHERE status = 'pendiente';
CREATE INDEX kiru_reward_goals_student_idx ON public.kiru_reward_goals (student_id, created_at DESC);
CREATE INDEX kiru_reward_goals_reward_idx ON public.kiru_reward_goals (reward_id);
CREATE INDEX kiru_reward_goals_replaces_idx ON public.kiru_reward_goals (replaces_goal_id);
CREATE INDEX kiru_reward_goals_decided_by_idx ON public.kiru_reward_goals (decided_by);
CREATE INDEX kiru_reward_goals_completed_by_idx ON public.kiru_reward_goals (completed_by);

COMMENT ON TABLE public.kiru_reward_goals IS
  'Recompensa objetivo de cada alumno y su estado. Solo cambia mediante las funciones kiru_reward_*.';

CREATE TRIGGER kiru_reward_goals_touch
BEFORE UPDATE ON public.kiru_reward_goals
FOR EACH ROW EXECUTE FUNCTION kiru_private.touch_updated_at();

ALTER TABLE public.kiru_reward_goals ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_reward_goals FROM anon, authenticated;

CREATE POLICY kiru_reward_goals_read ON public.kiru_reward_goals
FOR SELECT TO authenticated
USING ((SELECT kiru_private.can_view_student(student_id)));

-- 4. Movimientos (canjes) -----------------------------------------------------
CREATE TABLE public.kiru_skillcoin_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount <> 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 200),
  -- Cada canje se descuenta una sola vez.
  goal_id uuid UNIQUE REFERENCES public.kiru_reward_goals(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kiru_skillcoin_movements_student_idx ON public.kiru_skillcoin_movements (student_id, created_at DESC);
CREATE INDEX kiru_skillcoin_movements_created_by_idx ON public.kiru_skillcoin_movements (created_by);

COMMENT ON TABLE public.kiru_skillcoin_movements IS
  'SkillCoins gastadas en canjes confirmados por la familia.';

ALTER TABLE public.kiru_skillcoin_movements ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_skillcoin_movements FROM anon, authenticated;

CREATE POLICY kiru_skillcoin_movements_read ON public.kiru_skillcoin_movements
FOR SELECT TO authenticated
USING ((SELECT kiru_private.can_view_student(student_id)));

-- 5. Notificaciones -----------------------------------------------------------
CREATE TABLE public.kiru_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES public.kiru_reward_goals(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('objetivo_pendiente', 'objetivo_aprobado', 'objetivo_rechazado', 'canje_solicitado', 'canje_completado', 'canje_aplazado')),
  title text NOT NULL CHECK (length(title) <= 200),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 1000),
  -- Identifica el suceso: el mismo aviso nunca se crea dos veces para la misma persona.
  event_key text NOT NULL CHECK (length(event_key) <= 200),
  read_at timestamptz,
  email_status text NOT NULL DEFAULT 'no_aplica' CHECK (email_status IN ('no_aplica', 'pendiente', 'enviado', 'sin_correo')),
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, event_key)
);
CREATE INDEX kiru_notifications_recipient_idx ON public.kiru_notifications (recipient_id, created_at DESC);
CREATE INDEX kiru_notifications_email_idx ON public.kiru_notifications (created_at) WHERE email_status = 'pendiente';
CREATE INDEX kiru_notifications_student_idx ON public.kiru_notifications (student_id);
CREATE INDEX kiru_notifications_goal_idx ON public.kiru_notifications (goal_id);

COMMENT ON TABLE public.kiru_notifications IS
  'Avisos dentro del campus. Los de familias con correo los manda el Apps Script (email_status).';

ALTER TABLE public.kiru_notifications ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.kiru_notifications FROM anon, authenticated;

CREATE POLICY kiru_notifications_read ON public.kiru_notifications
FOR SELECT TO authenticated
USING (recipient_id = (SELECT kiru_private.active_uid()) OR (SELECT kiru_private.is_admin()));

-- SkillCoins ganadas por semana ---------------------------------------------------
-- Misma lectura que hacía la importación: preguntas cuyo texto (sin tildes)
-- nombra la categoría y cuya respuesta es un número de 0 a 10.
CREATE OR REPLACE FUNCTION kiru_private.skillcoin_weeks(student uuid)
RETURNS TABLE (week date, estudios integer, compromiso integer, organizacion integer, bienestar integer, corrected boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH scores AS (
    SELECT l.id, l.submitted_at,
           date_trunc('week', coalesce(l.session_date::timestamp, l.submitted_at AT TIME ZONE 'Europe/Madrid'))::date AS week,
           s.category, s.value, s.ord
    FROM public.kiru_session_logs l
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN x.q ~ 'estudios|aprendizaje|tecnicas de estudio' THEN 'estudios'
               WHEN x.q ~ 'compromiso|puntualidad|responsabilidad' THEN 'compromiso'
               WHEN x.q ~ 'organizacion|planificacion|agenda' THEN 'organizacion'
               WHEN x.q ~ 'bienestar|confianza|calma|estado de animo|emocional' THEN 'bienestar'
             END AS category,
             x.m[1]::integer AS value,
             x.ord
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.answers) = 'array' THEN l.answers ELSE '[]'::jsonb END)
           WITH ORDINALITY AS e(item, ord)
      CROSS JOIN LATERAL (
        SELECT lower(translate(coalesce(e.item ->> 'q', ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) AS q,
               regexp_match(replace(trim(coalesce(e.item ->> 'a', '')), ',', '.'), '^\s*(10|[0-9])\s*(?:/\s*10|sc)?\s*$', 'i') AS m,
               e.ord
      ) x
      WHERE x.m IS NOT NULL
    ) s
    WHERE l.student_id = student AND s.category IS NOT NULL
  ),
  per_log AS (
    -- Si una categoría aparece dos veces en el mismo registro, vale la última respuesta.
    SELECT id, submitted_at, week,
           (array_agg(value ORDER BY ord DESC) FILTER (WHERE category = 'estudios'))[1] AS estudios,
           (array_agg(value ORDER BY ord DESC) FILTER (WHERE category = 'compromiso'))[1] AS compromiso,
           (array_agg(value ORDER BY ord DESC) FILTER (WHERE category = 'organizacion'))[1] AS organizacion,
           (array_agg(value ORDER BY ord DESC) FILTER (WHERE category = 'bienestar'))[1] AS bienestar
    FROM scores
    GROUP BY id, submitted_at, week
  ),
  from_sheet AS (
    -- Por semana, el registro completo más reciente.
    SELECT DISTINCT ON (week) week, estudios, compromiso, organizacion, bienestar
    FROM per_log
    WHERE estudios IS NOT NULL AND compromiso IS NOT NULL AND organizacion IS NOT NULL AND bienestar IS NOT NULL
    ORDER BY week, submitted_at DESC
  ),
  corrections AS (
    SELECT DISTINCT ON (c.week) c.week, c.estudios::integer, c.compromiso::integer, c.organizacion::integer, c.bienestar::integer
    FROM public.kiru_skillcoin_corrections c
    WHERE c.student_id = student
    ORDER BY c.week, c.created_at DESC
  )
  SELECT coalesce(k.week, f.week),
         coalesce(k.estudios, f.estudios), coalesce(k.compromiso, f.compromiso),
         coalesce(k.organizacion, f.organizacion), coalesce(k.bienestar, f.bienestar),
         k.week IS NOT NULL
  FROM from_sheet f
  FULL JOIN corrections k ON k.week = f.week
  ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION kiru_private.skillcoins_earned(student uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(w.estudios + w.compromiso + w.organizacion + w.bienestar), 0)::integer
  FROM kiru_private.skillcoin_weeks(student) w
$$;

CREATE OR REPLACE FUNCTION kiru_private.skillcoins_spent(student uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(-sum(m.amount), 0)::integer FROM public.kiru_skillcoin_movements m WHERE m.student_id = student
$$;

CREATE OR REPLACE FUNCTION kiru_private.skillcoins_balance(student uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.skillcoins_earned(student) - kiru_private.skillcoins_spent(student)
$$;

-- Copia para mostrar en kiru_app_records (la que ya leían los paneles). El
-- saldo no sale de aquí.
CREATE OR REPLACE FUNCTION kiru_private.refresh_skillcoins_record(student uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  history jsonb;
  latest jsonb;
  total integer;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'week', w.week::text,
           'scores', jsonb_build_object('estudios', w.estudios, 'compromiso', w.compromiso, 'organizacion', w.organizacion, 'bienestar', w.bienestar),
           'total', w.estudios + w.compromiso + w.organizacion + w.bienestar,
           'corrected', w.corrected) ORDER BY w.week), '[]'::jsonb),
         coalesce(sum(w.estudios + w.compromiso + w.organizacion + w.bienestar), 0)
  INTO history, total
  FROM kiru_private.skillcoin_weeks(student) w;
  IF jsonb_array_length(history) = 0 THEN RETURN; END IF;
  latest := history -> (jsonb_array_length(history) - 1);
  INSERT INTO public.kiru_app_records (owner_id, record_type, record_key, data, created_by)
  VALUES (student, 'progress', 'skillcoins_' || student::text, jsonb_build_object(
    'module', 'skillcoins', 'studentId', student, 'scores', latest -> 'scores', 'weeklyHistory', history,
    'totalAccumulated', total, 'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'source', 'google_sheets_session_log'), NULL)
  ON CONFLICT (owner_id, record_type, record_key)
  DO UPDATE SET data = excluded.data, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION
  kiru_private.skillcoin_weeks(uuid), kiru_private.skillcoins_earned(uuid), kiru_private.skillcoins_spent(uuid),
  kiru_private.skillcoins_balance(uuid), kiru_private.refresh_skillcoins_record(uuid)
FROM PUBLIC;

-- Lo que ven los paneles: semanas y saldo de un alumno que se puede ver.
CREATE OR REPLACE FUNCTION public.kiru_skillcoin_summary(p_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  earned integer;
  spent integer;
BEGIN
  -- El servidor (service role) también la usa para los correos a las familias.
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' AND NOT kiru_private.can_view_student(p_student) THEN
    RAISE EXCEPTION 'No puedes ver las SkillCoins de este alumno.' USING ERRCODE = '42501';
  END IF;
  earned := kiru_private.skillcoins_earned(p_student);
  spent := kiru_private.skillcoins_spent(p_student);
  RETURN jsonb_build_object(
    'earned', earned,
    'spent', spent,
    'balance', greatest(earned - spent, 0),
    'currentWeek', date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date,
    'weeks', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'week', w.week, 'estudios', w.estudios, 'compromiso', w.compromiso, 'organizacion', w.organizacion,
        'bienestar', w.bienestar, 'total', w.estudios + w.compromiso + w.organizacion + w.bienestar,
        'corrected', w.corrected) ORDER BY w.week), '[]'::jsonb)
      FROM kiru_private.skillcoin_weeks(p_student) w)
  );
END;
$$;

-- El mentor corrige la semana actual de un alumno suyo; administración, cualquier semana pasada o actual.
CREATE OR REPLACE FUNCTION public.kiru_skillcoin_correct_week(
  p_student uuid, p_week date, p_estudios integer, p_compromiso integer, p_organizacion integer, p_bienestar integer, p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := kiru_private.active_uid();
  my_role text := kiru_private.kiru_role();
  current_week date := date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date;
  wanted_week date := date_trunc('week', p_week)::date;
  prior_scores jsonb;
BEGIN
  IF p_week IS NULL OR wanted_week > current_week THEN
    RAISE EXCEPTION 'Esa semana no se puede corregir.' USING ERRCODE = 'P0001';
  END IF;
  IF my_role = 'mentor' THEN
    IF NOT EXISTS (SELECT 1 FROM public.student_mentors sm WHERE sm.student_id = p_student AND sm.mentor_id = me) THEN
      RAISE EXCEPTION 'Solo puedes corregir a tus alumnos.' USING ERRCODE = '42501';
    END IF;
    IF wanted_week <> current_week THEN
      RAISE EXCEPTION 'Las semanas anteriores solo las corrige administración.' USING ERRCODE = '42501';
    END IF;
  ELSIF my_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'No tienes permiso para corregir SkillCoins.' USING ERRCODE = '42501';
  END IF;
  IF p_estudios NOT BETWEEN 0 AND 10 OR p_compromiso NOT BETWEEN 0 AND 10
     OR p_organizacion NOT BETWEEN 0 AND 10 OR p_bienestar NOT BETWEEN 0 AND 10
     OR p_estudios IS NULL OR p_compromiso IS NULL OR p_organizacion IS NULL OR p_bienestar IS NULL THEN
    RAISE EXCEPTION 'Cada categoría va de 0 a 10.' USING ERRCODE = 'P0001';
  END IF;
  SELECT jsonb_build_object('estudios', w.estudios, 'compromiso', w.compromiso, 'organizacion', w.organizacion, 'bienestar', w.bienestar)
  INTO prior_scores FROM kiru_private.skillcoin_weeks(p_student) w WHERE w.week = wanted_week;
  INSERT INTO public.kiru_skillcoin_corrections
    (student_id, week, estudios, compromiso, organizacion, bienestar, previous, reason, corrected_by, corrected_role)
  VALUES (p_student, wanted_week, p_estudios, p_compromiso, p_organizacion, p_bienestar, prior_scores,
          left(coalesce(trim(p_reason), ''), 500), me, my_role);
  PERFORM kiru_private.refresh_skillcoins_record(p_student);
  RETURN public.kiru_skillcoin_summary(p_student);
END;
$$;

-- Para la importación desde la hoja (solo el servidor).
CREATE OR REPLACE FUNCTION public.kiru_skillcoin_refresh(p_student uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kiru_private.refresh_skillcoins_record(p_student)
$$;

-- Avisos ----------------------------------------------------------------------
-- Crea el aviso para el alumno y para cada familia vinculada. Las familias
-- reciben también correo cuando with_email es true.
CREATE OR REPLACE FUNCTION kiru_private.notify_goal(goal public.kiru_reward_goals, kind text, to_student text, to_family text, with_email boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  event text := goal.id::text || ':' || kind || ':' || goal.redeem_round::text;
  student_name text;
BEGIN
  SELECT p.full_name INTO student_name FROM public.profiles p WHERE p.id = goal.student_id;
  IF to_student IS NOT NULL THEN
    INSERT INTO public.kiru_notifications (recipient_id, student_id, goal_id, kind, title, body, event_key)
    VALUES (goal.student_id, goal.student_id, goal.id, kind, to_student, goal.reward_name || ' · ' || goal.cost || ' SC', event)
    ON CONFLICT (recipient_id, event_key) DO NOTHING;
  END IF;
  IF to_family IS NOT NULL THEN
    INSERT INTO public.kiru_notifications (recipient_id, student_id, goal_id, kind, title, body, event_key, email_status)
    SELECT sg.guardian_id, goal.student_id, goal.id, kind,
           replace(to_family, '{alumno}', coalesce(student_name, 'Tu hijo/a')),
           goal.reward_name || ' · ' || goal.cost || ' SC', event,
           CASE WHEN with_email THEN 'pendiente' ELSE 'no_aplica' END
    FROM public.student_guardians sg
    JOIN public.profiles p ON p.id = sg.guardian_id AND p.is_active AND p.role = 'padre'
    WHERE sg.student_id = goal.student_id
    ON CONFLICT (recipient_id, event_key) DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION kiru_private.notify_goal(public.kiru_reward_goals, text, text, text, boolean) FROM PUBLIC;

-- Pasos del alumno ------------------------------------------------------------
-- Elegir objetivo. Si ya tiene uno aprobado, es una petición de cambio: el
-- aprobado sigue vigente hasta que la familia acepte el nuevo.
CREATE OR REPLACE FUNCTION public.kiru_reward_choose(p_reward_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := kiru_private.active_uid();
  reward public.kiru_rewards;
  active public.kiru_reward_goals;
  goal public.kiru_reward_goals;
BEGIN
  IF me IS NULL OR kiru_private.kiru_role() IS DISTINCT FROM 'alumno' THEN
    RAISE EXCEPTION 'Solo el alumno puede elegir su recompensa objetivo.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO reward FROM public.kiru_rewards r WHERE r.id = p_reward_id AND r.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa recompensa no está en el catálogo.' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_guardians sg WHERE sg.student_id = me) THEN
    RAISE EXCEPTION 'Tu cuenta todavía no está vinculada con tu familia. Avisa a tu mentor.' USING ERRCODE = 'P0001';
  END IF;
  -- Bloquea los objetivos abiertos del alumno para que dos pulsaciones no creen dos peticiones.
  PERFORM 1 FROM public.kiru_reward_goals g WHERE g.student_id = me AND g.status IN ('pendiente', 'aprobado', 'canje_solicitado') FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.kiru_reward_goals g WHERE g.student_id = me AND g.status = 'pendiente') THEN
    RAISE EXCEPTION 'Ya tienes una elección esperando a tu familia. Si prefieres otra, retira esa primero.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO active FROM public.kiru_reward_goals g WHERE g.student_id = me AND g.status IN ('aprobado', 'canje_solicitado');
  IF FOUND AND active.status = 'canje_solicitado' THEN
    RAISE EXCEPTION 'Ya has pedido el canje de tu objetivo. Espera a que tu familia responda.' USING ERRCODE = 'P0001';
  END IF;
  IF FOUND AND active.reward_id = reward.id THEN
    RAISE EXCEPTION 'Esa ya es tu recompensa objetivo.' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    INSERT INTO public.kiru_reward_goals (student_id, reward_id, reward_name, reward_category, cost, replaces_goal_id)
    VALUES (me, reward.id, reward.name, reward.category, reward.cost, active.id)
    RETURNING * INTO goal;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya tienes una elección esperando a tu familia.' USING ERRCODE = 'P0001';
  END;
  IF active.id IS NULL THEN
    PERFORM kiru_private.notify_goal(goal, 'objetivo_pendiente', NULL,
      '{alumno} ha elegido una recompensa objetivo y espera vuestra aprobación', true);
  ELSE
    PERFORM kiru_private.notify_goal(goal, 'objetivo_pendiente', NULL,
      '{alumno} quiere cambiar su recompensa objetivo («' || active.reward_name || '») y espera vuestra aprobación', true);
  END IF;
  RETURN goal.id;
END;
$$;

-- El alumno retira una elección pendiente o deja su objetivo aprobado.
CREATE OR REPLACE FUNCTION public.kiru_reward_cancel(p_goal uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  goal public.kiru_reward_goals;
BEGIN
  SELECT * INTO goal FROM public.kiru_reward_goals g WHERE g.id = p_goal FOR UPDATE;
  IF NOT FOUND OR goal.student_id IS DISTINCT FROM kiru_private.active_uid() OR kiru_private.kiru_role() IS DISTINCT FROM 'alumno' THEN
    RAISE EXCEPTION 'No se encontró tu objetivo.' USING ERRCODE = 'P0002';
  END IF;
  IF goal.status NOT IN ('pendiente', 'aprobado') THEN
    RAISE EXCEPTION 'Este objetivo ya no se puede quitar.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.kiru_reward_goals SET status = 'cancelado', closed_at = now() WHERE id = goal.id;
  -- Las familias ya no tienen nada que responder sobre esta elección.
  UPDATE public.kiru_notifications SET read_at = coalesce(read_at, now()),
         email_status = CASE WHEN email_status = 'pendiente' THEN 'no_aplica' ELSE email_status END
  WHERE goal_id = goal.id AND kind = 'objetivo_pendiente';
END;
$$;

CREATE OR REPLACE FUNCTION public.kiru_reward_request_redeem(p_goal uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  goal public.kiru_reward_goals;
  balance integer;
BEGIN
  SELECT * INTO goal FROM public.kiru_reward_goals g WHERE g.id = p_goal FOR UPDATE;
  IF NOT FOUND OR goal.student_id IS DISTINCT FROM kiru_private.active_uid() OR kiru_private.kiru_role() IS DISTINCT FROM 'alumno' THEN
    RAISE EXCEPTION 'No se encontró tu objetivo.' USING ERRCODE = 'P0002';
  END IF;
  IF goal.status = 'canje_solicitado' THEN
    RAISE EXCEPTION 'Ya se lo has pedido a tu familia. Te avisaremos cuando respondan.' USING ERRCODE = 'P0001';
  END IF;
  IF goal.status <> 'aprobado' THEN
    RAISE EXCEPTION 'Tu familia tiene que aprobar este objetivo antes de pedir el canje.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kiru_reward_goals g WHERE g.student_id = goal.student_id AND g.status = 'pendiente') THEN
    RAISE EXCEPTION 'Tienes un cambio de objetivo esperando a tu familia. Retíralo si quieres canjear este.' USING ERRCODE = 'P0001';
  END IF;
  balance := kiru_private.skillcoins_balance(goal.student_id);
  IF balance < goal.cost THEN
    RAISE EXCEPTION 'Todavía te faltan % SC para esta recompensa.', goal.cost - balance USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.kiru_reward_goals
  SET status = 'canje_solicitado', redeem_round = redeem_round + 1, redeem_requested_at = now()
  WHERE id = goal.id
  RETURNING * INTO goal;
  PERFORM kiru_private.notify_goal(goal, 'canje_solicitado', NULL,
    '{alumno} ha conseguido las SkillCoins de su recompensa y os pide el canje', true);
END;
$$;

-- Pasos de la familia ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiru_reward_decide(p_goal uuid, p_approve boolean, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  goal public.kiru_reward_goals;
  previous public.kiru_reward_goals;
BEGIN
  SELECT * INTO goal FROM public.kiru_reward_goals g WHERE g.id = p_goal FOR UPDATE;
  IF NOT FOUND OR NOT kiru_private.is_guardian_of(goal.student_id) THEN
    RAISE EXCEPTION 'Solo la familia del alumno puede responder a esta solicitud.' USING ERRCODE = '42501';
  END IF;
  IF goal.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Esta solicitud ya se respondió.' USING ERRCODE = 'P0001';
  END IF;
  IF p_approve THEN
    -- Un cambio aprobado sustituye al objetivo anterior, salvo que ya esté en canje.
    SELECT * INTO previous FROM public.kiru_reward_goals g
    WHERE g.student_id = goal.student_id AND g.status IN ('aprobado', 'canje_solicitado') FOR UPDATE;
    IF FOUND AND previous.status = 'canje_solicitado' THEN
      RAISE EXCEPTION 'Hay un canje pendiente del objetivo actual. Gestionadlo antes de aprobar el cambio.' USING ERRCODE = 'P0001';
    END IF;
    IF FOUND THEN
      UPDATE public.kiru_reward_goals SET status = 'sustituido', closed_at = now() WHERE id = previous.id;
    END IF;
  END IF;
  UPDATE public.kiru_reward_goals
  SET status = CASE WHEN p_approve THEN 'aprobado' ELSE 'rechazado' END,
      family_note = left(coalesce(trim(p_note), ''), 500),
      decided_at = now(), decided_by = kiru_private.active_uid(),
      closed_at = CASE WHEN p_approve THEN NULL ELSE now() END
  WHERE id = goal.id
  RETURNING * INTO goal;
  -- Las demás familias del alumno ya no tienen que responder.
  UPDATE public.kiru_notifications SET read_at = coalesce(read_at, now())
  WHERE goal_id = goal.id AND kind = 'objetivo_pendiente';
  IF p_approve THEN
    PERFORM kiru_private.notify_goal(goal, 'objetivo_aprobado', '¡Tu familia ha aprobado tu objetivo!', NULL, false);
  ELSIF goal.replaces_goal_id IS NOT NULL THEN
    PERFORM kiru_private.notify_goal(goal, 'objetivo_rechazado', 'Tu familia prefiere que sigas con tu objetivo actual.', NULL, false);
  ELSE
    PERFORM kiru_private.notify_goal(goal, 'objetivo_rechazado', 'Tu familia prefiere otra recompensa. Puedes elegir otra en la tienda.', NULL, false);
  END IF;
END;
$$;

-- La familia confirma la entrega (y solo entonces se descuentan las SC) o la deja para más tarde.
CREATE OR REPLACE FUNCTION public.kiru_reward_resolve_redeem(p_goal uuid, p_confirm boolean, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  goal public.kiru_reward_goals;
  balance integer;
BEGIN
  SELECT * INTO goal FROM public.kiru_reward_goals g WHERE g.id = p_goal FOR UPDATE;
  IF NOT FOUND OR NOT kiru_private.is_guardian_of(goal.student_id) THEN
    RAISE EXCEPTION 'Solo la familia del alumno puede gestionar este canje.' USING ERRCODE = '42501';
  END IF;
  IF goal.status <> 'canje_solicitado' THEN
    RAISE EXCEPTION 'Este canje ya se gestionó.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.kiru_notifications SET read_at = coalesce(read_at, now())
  WHERE goal_id = goal.id AND kind = 'canje_solicitado';
  IF NOT p_confirm THEN
    UPDATE public.kiru_reward_goals SET status = 'aprobado', family_note = left(coalesce(trim(p_note), ''), 500)
    WHERE id = goal.id RETURNING * INTO goal;
    PERFORM kiru_private.notify_goal(goal, 'canje_aplazado', 'Tu familia ha visto tu petición y lo hablará contigo. Tu objetivo sigue aprobado.', NULL, false);
    RETURN;
  END IF;
  -- Bloquea al alumno frente a otro canje simultáneo y vuelve a comprobar el saldo.
  PERFORM 1 FROM public.profiles p WHERE p.id = goal.student_id FOR UPDATE;
  balance := kiru_private.skillcoins_balance(goal.student_id);
  IF balance < goal.cost THEN
    RAISE EXCEPTION 'El saldo actual (% SC) no llega al coste (% SC). No se ha descontado nada.', balance, goal.cost USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.kiru_skillcoin_movements (student_id, amount, reason, goal_id, created_by)
  VALUES (goal.student_id, -goal.cost, 'Canje: ' || goal.reward_name, goal.id, kiru_private.active_uid());
  UPDATE public.kiru_reward_goals
  SET status = 'completado', completed_at = now(), completed_by = kiru_private.active_uid(), closed_at = now(),
      family_note = left(coalesce(trim(p_note), ''), 500)
  WHERE id = goal.id
  RETURNING * INTO goal;
  PERFORM kiru_private.notify_goal(goal, 'canje_completado', '¡Has conseguido tu recompensa!', NULL, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiru_notifications_mark_read(p_ids uuid[] DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.kiru_notifications SET read_at = now()
  WHERE recipient_id = kiru_private.active_uid() AND read_at IS NULL AND (p_ids IS NULL OR id = ANY (p_ids))
$$;

REVOKE ALL ON FUNCTION
  public.kiru_skillcoin_summary(uuid),
  public.kiru_skillcoin_correct_week(uuid, date, integer, integer, integer, integer, text),
  public.kiru_skillcoin_refresh(uuid),
  public.kiru_reward_choose(text),
  public.kiru_reward_cancel(uuid),
  public.kiru_reward_request_redeem(uuid),
  public.kiru_reward_decide(uuid, boolean, text),
  public.kiru_reward_resolve_redeem(uuid, boolean, text),
  public.kiru_notifications_mark_read(uuid[])
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.kiru_skillcoin_summary(uuid),
  public.kiru_skillcoin_correct_week(uuid, date, integer, integer, integer, integer, text),
  public.kiru_reward_choose(text),
  public.kiru_reward_cancel(uuid),
  public.kiru_reward_request_redeem(uuid),
  public.kiru_reward_decide(uuid, boolean, text),
  public.kiru_reward_resolve_redeem(uuid, boolean, text),
  public.kiru_notifications_mark_read(uuid[])
TO authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_skillcoin_refresh(uuid), public.kiru_skillcoin_summary(uuid) TO service_role;
