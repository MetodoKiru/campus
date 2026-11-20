-- Formulario «Mi disponibilidad para clases», versión 2 (diseño aprobado por Sofía el 15/11/2026).
--
-- Lo que cambia:
-- 1. Paso 1: «¿Puedes seguir con tus clases de siempre?». Si el mentor dice que no, explica
--    qué clase ya no puede dar y desde cuándo, y su coordinador recibe un aviso urgente.
--    (Añadir días es otra pregunta: no cuenta como «no».)
-- 2. Desde dónde sale (entre semana y fines de semana) y cómo se mueve.
-- 3. Zonas a las que puede ir. La lista la edita administración (ajuste «zonas_mentores»).
-- 4. Antes de una renovación: «si la familia de X quisiera un día más, ¿qué otro día podrías?».
--    Lo que marque se suma a sus huecos libres (es lo que se ofrece a la familia). Si dice
--    «ningún día más», a esa familia no se le ofrece subir.
-- 5. Huecos libres sin mañanas entre semana (de lunes a jueves, desde las 16:00) y sin viernes.
-- 6. Cada vez que un mentor envía el formulario (o pulsa «sigue igual»), su coordinador recibe
--    un correo con el resumen (aviso «disponibilidad_enviada»).
-- 7. Dirección de clase del alumno (students.class_address): la ve su mentor y Coordinación,
--    la cambian Coordinación (sus alumnos) y Administración.

-- 0. Avisos nuevos ----------------------------------------------------------------------
ALTER TABLE public.kiru_notifications DROP CONSTRAINT IF EXISTS kiru_notifications_kind_check;
ALTER TABLE public.kiru_notifications ADD CONSTRAINT kiru_notifications_kind_check CHECK (kind IN (
  'objetivo_pendiente', 'objetivo_aprobado', 'objetivo_rechazado', 'canje_solicitado', 'canje_completado',
  'canje_aplazado', 'renovacion', 'informe_progreso', 'clase_solicitud', 'clase_decision', 'clase_mas_info',
  'recuperacion_propuesta', 'recuperacion_confirmada', 'recuperacion_sin_encaje', 'recuperacion_nueva',
  'recuperacion_sin_avanzar', 'recuperacion_recordatorio', 'recuperacion_fin_periodo', 'registro_aviso',
  'clase_incidencia', 'justificacion_solicitada', 'justificacion_respondida', 'justificacion_repregunta',
  'justificacion_cerrada', 'justificacion_recordatorio', 'justificacion_por_valorar', 'aviso_metodologico',
  'aviso_seguimiento', 'periodo_especial', 'evaluacion_trimestral',
  'horario_elegir', 'horario_confirmar', 'horario_confirmado', 'horario_otro', 'disponibilidad_actualizar',
  'disponibilidad_confirmar', 'disponibilidad_urgente', 'disponibilidad_falta',
  'registro_error', 'registro_error_respuesta',
  'disponibilidad_enviada'
));

-- 1. Dirección de clase del alumno -------------------------------------------------------------
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_address text NOT NULL DEFAULT ''
  CHECK (length(class_address) <= 200);
COMMENT ON COLUMN public.students.class_address IS
  'Dirección donde se da la clase (calle y número, barrio o municipio). La ven el alumno, su familia, su mentor y Coordinación.';

CREATE OR REPLACE FUNCTION public.kiru_alumno_direccion(p_student uuid, p_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := kiru_private.active_uid();
  v text := left(btrim(coalesce(p_address, '')), 200);
BEGIN
  IF me IS NULL OR NOT (kiru_private.is_admin() OR kiru_private.coordinates_student(p_student)) THEN
    RAISE EXCEPTION 'Solo Coordinación o Administración pueden cambiar la dirección.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.students SET class_address = v, updated_at = now() WHERE profile_id = p_student;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe ese alumno.' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('ok', true, 'address', v);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_alumno_direccion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_alumno_direccion(uuid, text) TO authenticated;

-- 2. Zonas (las edita administración) ----------------------------------------------------------------
INSERT INTO public.kiru_settings (key, value) VALUES ('zonas_mentores', '[
  "Aravaca", "Pozuelo", "Majadahonda", "Las Rozas", "Boadilla", "Moncloa · Argüelles", "Chamberí",
  "Salamanca · Retiro", "Chamartín", "Arturo Soria · Hortaleza", "Ciudad Lineal", "Centro"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.kiru_zonas_mentores()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT value FROM public.kiru_settings WHERE key = 'zonas_mentores'), '[]'::jsonb)
$$;
REVOKE ALL ON FUNCTION public.kiru_zonas_mentores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_zonas_mentores() TO authenticated;

CREATE OR REPLACE FUNCTION public.kiru_zonas_mentores_guardar(p_zones text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT kiru_private.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede cambiar las zonas.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(z ORDER BY ord), '[]'::jsonb) INTO v FROM (
    SELECT DISTINCT ON (lower(btrim(z))) left(btrim(z), 60) AS z, ord
    FROM unnest(coalesce(p_zones, '{}')) WITH ORDINALITY AS t(z, ord)
    WHERE btrim(z) <> ''
    ORDER BY lower(btrim(z)), ord
  ) x;
  IF jsonb_array_length(v) > 60 THEN RAISE EXCEPTION 'Como mucho 60 zonas.' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.kiru_settings (key, value, updated_at) VALUES ('zonas_mentores', v, now())
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'zonas', v);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_zonas_mentores_guardar(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_zonas_mentores_guardar(text[]) TO authenticated;

-- 3. Datos nuevos de la disponibilidad ----------------------------------------------------------------
ALTER TABLE public.kiru_mentor_class_availability
  ADD COLUMN IF NOT EXISTS keeps_classes boolean,
  ADD COLUMN IF NOT EXISTS keeps_note text NOT NULL DEFAULT '' CHECK (length(keeps_note) <= 500),
  ADD COLUMN IF NOT EXISTS from_place text NOT NULL DEFAULT '' CHECK (length(from_place) <= 150),
  ADD COLUMN IF NOT EXISTS from_place_weekend text NOT NULL DEFAULT '' CHECK (length(from_place_weekend) <= 150),
  ADD COLUMN IF NOT EXISTS transport text[] NOT NULL DEFAULT '{}' CHECK (transport <@ ARRAY['coche', 'transporte_publico', 'moto', 'bici_andando']),
  ADD COLUMN IF NOT EXISTS zones text[] NOT NULL DEFAULT '{}' CHECK (cardinality(zones) <= 60),
  -- [{"student_id": "…", "weekday": 2 | null, "start": "18:00", "end": "19:00", "arrive": "si" | "justo" | "no"}]
  -- weekday null = «ningún día más».
  ADD COLUMN IF NOT EXISTS extra_days jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(extra_days) = 'array'),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Solo tardes de lunes a jueves (desde las 16:00), nada los viernes; sábado y domingo, todo el día.
CREATE OR REPLACE FUNCTION kiru_private.availability_afternoons(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('weekday', d, 'start', to_char(s, 'HH24:MI'), 'end', x ->> 'end')
                            ORDER BY d, s), '[]'::jsonb)
  FROM (
    SELECT x, (x ->> 'weekday')::int AS d,
           CASE WHEN (x ->> 'weekday')::int BETWEEN 1 AND 4 THEN greatest((x ->> 'start')::time, time '16:00')
                ELSE (x ->> 'start')::time END AS s
    FROM jsonb_array_elements(coalesce(p, '[]'::jsonb)) x
    WHERE (x ->> 'weekday')::int <> 5
  ) y
  WHERE s < (x ->> 'end')::time OR x ->> 'end' = '24:00'
$$;
REVOKE ALL ON FUNCTION kiru_private.availability_afternoons(jsonb) FROM PUBLIC;

-- Junta franjas que se tocan o se solapan (por medias horas) para que no choquen al guardar.
CREATE OR REPLACE FUNCTION kiru_private.availability_union(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH cells AS (
    SELECT DISTINCT (x ->> 'weekday')::int AS d, g::time AS t
    FROM jsonb_array_elements(coalesce(p, '[]'::jsonb)) x,
         generate_series(date '2000-01-01' + (x ->> 'start')::time, date '2000-01-01' + (x ->> 'end')::time - interval '30 minutes',
                         interval '30 minutes') g
    WHERE (x ->> 'start') ~ '^\d{2}:(00|30)$' AND (x ->> 'end') ~ '^\d{2}:(00|30)$' AND (x ->> 'start')::time < (x ->> 'end')::time
  ), grp AS (
    SELECT d, t, t - (row_number() OVER (PARTITION BY d ORDER BY t) * interval '30 minutes') AS k FROM cells
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('weekday', d, 'start', to_char(s, 'HH24:MI'), 'end', to_char(e, 'HH24:MI')) ORDER BY d, s), '[]'::jsonb)
  FROM (SELECT d, min(t) AS s, max(t) + interval '30 minutes' AS e FROM grp GROUP BY d, k) r
$$;
REVOKE ALL ON FUNCTION kiru_private.availability_union(jsonb) FROM PUBLIC;

-- Aviso al coordinador (o, si el mentor no tiene, a administración).
CREATE OR REPLACE FUNCTION kiru_private.availability_notify_coordinator(p_mentor uuid, p_title text, p_body text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH c AS (
    SELECT cm.coordinator_id AS id FROM public.kiru_coordinator_mentors cm
    JOIN public.profiles p ON p.id = cm.coordinator_id AND p.is_active
    WHERE cm.mentor_id = p_mentor
  ), r AS (
    SELECT id FROM c
    UNION
    SELECT p.id FROM public.profiles p WHERE p.role = 'admin' AND p.is_active AND NOT EXISTS (SELECT 1 FROM c)
  )
  INSERT INTO public.kiru_notifications (recipient_id, kind, title, body, event_key, email_status)
  SELECT r.id, 'disponibilidad_enviada', left(p_title, 200), left(p_body, 1000),
         'disponibilidad_enviada:' || p_mentor || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'), 'pendiente'
  FROM r
  ON CONFLICT (recipient_id, event_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION kiru_private.availability_notify_coordinator(uuid, text, text) FROM PUBLIC;

-- Resumen en texto para el correo del coordinador.
CREATE OR REPLACE FUNCTION kiru_private.availability_summary(a public.kiru_mentor_class_availability)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT concat_ws(E'\n',
    CASE WHEN a.keeps_classes IS FALSE THEN '⚠️ YA NO PUEDE DAR ALGUNA CLASE: ' || coalesce(nullif(a.keeps_note, ''), '(sin explicar)')
         ELSE '✔ Sigue con sus clases de siempre.' END,
    (SELECT string_agg(
       coalesce(kiru_private.first_name((e ->> 'student_id')::uuid), 'Alumno') || ', si quisiera un día más: ' ||
       CASE WHEN e ->> 'weekday' IS NULL THEN 'no podría añadir ningún día'
            ELSE 'podría el ' || lower((ARRAY['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[(e ->> 'weekday')::int])
                 || ' ' || (e ->> 'start') || '–' || (e ->> 'end')
                 || CASE e ->> 'arrive' WHEN 'justo' THEN ' (llega justo)' WHEN 'no' THEN ' (no llega a tiempo a esa hora)' ELSE '' END END,
       E'\n') FROM jsonb_array_elements(a.extra_days) e),
    'Sale desde: ' || coalesce(nullif(a.from_place, ''), '(sin indicar)')
      || CASE WHEN a.from_place_weekend <> '' THEN ' · fines de semana: ' || a.from_place_weekend ELSE '' END
      || CASE WHEN cardinality(a.transport) > 0 THEN ' · se mueve en ' || array_to_string(ARRAY(
           SELECT CASE t WHEN 'coche' THEN 'coche' WHEN 'transporte_publico' THEN 'metro/bus/tren' WHEN 'moto' THEN 'moto' ELSE 'bici o andando' END
           FROM unnest(a.transport) t), ', ') ELSE '' END,
    'Zonas: ' || coalesce(nullif(array_to_string(a.zones, ', '), ''), '(ninguna)'),
    'Huecos libres: ' || coalesce((SELECT string_agg(
       lower((ARRAY['lun','mar','mié','jue','vie','sáb','dom'])[(s ->> 'weekday')::int]) || ' ' || (s ->> 'start') || '–' || (s ->> 'end'), ' · ')
       FROM jsonb_array_elements(a.slots) s), 'ninguno'),
    CASE WHEN a.notes <> '' THEN 'Comentario: «' || a.notes || '»' END)
$$;
REVOKE ALL ON FUNCTION kiru_private.availability_summary(public.kiru_mentor_class_availability) FROM PUBLIC;

-- 4. Enviar el formulario ------------------------------------------------------------------------------
-- p: {"keeps": true|false, "keeps_note": "", "from": "", "from_weekend": "", "transport": [], "zones": [],
--     "extra": [{"student_id", "weekday"|null, "start", "end", "arrive"}], "slots": [...], "notes": ""}
CREATE OR REPLACE FUNCTION public.kiru_disponibilidad_enviar(p jsonb, p_mentor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := kiru_private.active_uid();
  v_mentor uuid := coalesce(p_mentor, me);
  v_by_mentor boolean;
  v_keeps boolean;
  v_extra jsonb := '[]'::jsonb;
  v_slots jsonb;
  e jsonb;
  v_day int;
  v_start time;
  v_end time;
  v_row public.kiru_mentor_class_availability;
  v_name text;
BEGIN
  IF me IS NULL OR NOT ((v_mentor = me AND kiru_private.kiru_role() = 'mentor') OR kiru_private.is_admin()) THEN
    RAISE EXCEPTION 'No puedes cambiar esta disponibilidad.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_mentor AND role = 'mentor') THEN
    RAISE EXCEPTION 'No existe ese mentor.' USING ERRCODE = '22023';
  END IF;
  v_by_mentor := v_mentor = me;
  IF coalesce(jsonb_typeof(p -> 'keeps'), '') <> 'boolean' THEN
    RAISE EXCEPTION 'Contesta primero si puedes seguir con tus clases de siempre.' USING ERRCODE = '22023';
  END IF;
  v_keeps := (p ->> 'keeps')::boolean;
  IF NOT v_keeps AND btrim(coalesce(p ->> 'keeps_note', '')) = '' THEN
    RAISE EXCEPTION 'Cuéntanos qué clase ya no puedes dar y desde cuándo.' USING ERRCODE = '22023';
  END IF;

  -- Días extra, solo de sus propios alumnos.
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p -> 'extra', '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.student_mentors sm
                   WHERE sm.mentor_id = v_mentor AND sm.student_id::text = e ->> 'student_id') THEN
      CONTINUE;
    END IF;
    IF e ->> 'weekday' IS NULL THEN
      v_extra := v_extra || jsonb_build_array(jsonb_build_object('student_id', e ->> 'student_id', 'weekday', NULL));
      CONTINUE;
    END IF;
    v_day := (e ->> 'weekday')::int;
    v_start := (e ->> 'start')::time;
    v_end := v_start + interval '1 hour';
    IF v_day NOT IN (1, 2, 3, 4, 6, 7) OR (v_day <= 4 AND v_start < time '16:00') OR v_end > time '20:30'
       OR extract(minute FROM v_start) NOT IN (0, 30) THEN
      RAISE EXCEPTION 'Ese día u hora no es válido para una clase.' USING ERRCODE = '22023';
    END IF;
    v_extra := v_extra || jsonb_build_array(jsonb_build_object('student_id', e ->> 'student_id', 'weekday', v_day,
      'start', to_char(v_start, 'HH24:MI'), 'end', to_char(v_end, 'HH24:MI'),
      'arrive', CASE WHEN e ->> 'arrive' IN ('si', 'justo', 'no') THEN e ->> 'arrive' ELSE 'si' END));
  END LOOP;

  -- Huecos: los marcados + los días extra que ofrece (es lo que verá la familia).
  v_slots := kiru_private.availability_union(
    coalesce(p -> 'slots', '[]'::jsonb)
    || coalesce((SELECT jsonb_agg(jsonb_build_object('weekday', x -> 'weekday', 'start', x ->> 'start', 'end', x ->> 'end'))
                 FROM jsonb_array_elements(v_extra) x WHERE x ->> 'weekday' IS NOT NULL), '[]'::jsonb));
  v_slots := kiru_private.availability_clean(kiru_private.availability_afternoons(v_slots));

  INSERT INTO public.kiru_mentor_class_availability AS a (mentor_id, slots, notes, updated_at, keeps_classes, keeps_note,
    from_place, from_place_weekend, transport, zones, extra_days, submitted_at)
  VALUES (v_mentor, v_slots, left(coalesce(p ->> 'notes', ''), 500), now(), v_keeps,
    CASE WHEN v_keeps THEN '' ELSE left(btrim(p ->> 'keeps_note'), 500) END,
    left(btrim(coalesce(p ->> 'from', '')), 150), left(btrim(coalesce(p ->> 'from_weekend', '')), 150),
    ARRAY(SELECT DISTINCT t FROM jsonb_array_elements_text(coalesce(p -> 'transport', '[]'::jsonb)) t
          WHERE t IN ('coche', 'transporte_publico', 'moto', 'bici_andando')),
    ARRAY(SELECT DISTINCT left(btrim(z), 60) FROM jsonb_array_elements_text(coalesce(p -> 'zones', '[]'::jsonb)) z
          WHERE btrim(z) <> '' LIMIT 60),
    v_extra, now())
  ON CONFLICT (mentor_id) DO UPDATE SET slots = excluded.slots, notes = excluded.notes, updated_at = now(),
    keeps_classes = excluded.keeps_classes, keeps_note = excluded.keeps_note, from_place = excluded.from_place,
    from_place_weekend = excluded.from_place_weekend, transport = excluded.transport, zones = excluded.zones,
    extra_days = excluded.extra_days, submitted_at = now()
  RETURNING * INTO v_row;

  PERFORM kiru_private.availability_confirmed(v_mentor);
  UPDATE public.kiru_notifications SET read_at = coalesce(read_at, now())
  WHERE recipient_id = v_mentor AND kind = 'disponibilidad_actualizar' AND read_at IS NULL;

  IF v_by_mentor THEN
    v_name := kiru_private.first_name(v_mentor);
    PERFORM kiru_private.availability_notify_coordinator(v_mentor,
      CASE WHEN v_keeps THEN v_name || ' ha actualizado su disponibilidad'
           ELSE '⚠️ ' || v_name || ' ya no puede dar alguna de sus clases' END,
      kiru_private.availability_summary(v_row));
  END IF;
  RETURN jsonb_build_object('ok', true, 'slots', v_slots);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_disponibilidad_enviar(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_disponibilidad_enviar(jsonb, uuid) TO authenticated;

-- «Mi disponibilidad sigue igual»: también avisa al coordinador.
CREATE OR REPLACE FUNCTION public.kiru_disponibilidad_sigue_igual()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := kiru_private.active_uid();
  v_row public.kiru_mentor_class_availability;
BEGIN
  IF me IS NULL OR kiru_private.kiru_role() <> 'mentor' THEN
    RAISE EXCEPTION 'Solo el mentor puede confirmar su disponibilidad.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.kiru_mentor_class_availability SET updated_at = now(), keeps_classes = true, keeps_note = ''
  WHERE mentor_id = me AND jsonb_array_length(slots) > 0
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Todavía no has marcado tu disponibilidad: márcala primero.' USING ERRCODE = '22023';
  END IF;
  PERFORM kiru_private.availability_confirmed(me);
  PERFORM kiru_private.availability_notify_coordinator(me,
    kiru_private.first_name(me) || ' confirma que su disponibilidad sigue igual',
    kiru_private.availability_summary(v_row));
  RETURN jsonb_build_object('ok', true);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_disponibilidad_sigue_igual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiru_disponibilidad_sigue_igual() TO authenticated;

-- 5. «Ningún día más» para un alumno: a esa familia no se le ofrece subir. -----------------------------
CREATE OR REPLACE FUNCTION kiru_private.can_raise(p_mentor uuid, p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
      SELECT 1 FROM public.kiru_mentor_class_availability a, jsonb_array_elements(a.extra_days) x
      WHERE a.mentor_id = p_mentor AND x ->> 'student_id' = p_student::text AND x ->> 'weekday' IS NULL)
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(kiru_private.free_slots(p_mentor, p_student, NULL)) f
      WHERE NOT EXISTS (SELECT 1 FROM public.kiru_student_schedule_slots s
                        WHERE s.student_id = p_student AND s.is_active AND s.weekday = (f ->> 'weekday')::int)
    )
$$;
REVOKE ALL ON FUNCTION kiru_private.can_raise(uuid, uuid) FROM PUBLIC;
