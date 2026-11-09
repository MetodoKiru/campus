-- Días y horas en que la familia no puede recuperar clases (mini formulario del
-- panel de padres). El mentor no puede proponer fechas que caigan en esas franjas
-- (cambios y recuperaciones); coordinación las ve como aviso, sin bloqueo.
-- Nunca se borra nada: al cambiar las franjas, las anteriores quedan con removed_at.

CREATE TABLE IF NOT EXISTS public.kiru_family_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT kiru_family_unavailability_range CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS kiru_family_unavailability_active
  ON public.kiru_family_unavailability (student_id) WHERE removed_at IS NULL;

ALTER TABLE public.kiru_family_unavailability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_family_unavailability FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_family_unavailability TO authenticated;
GRANT ALL ON public.kiru_family_unavailability TO service_role;

-- La familia de ese alumno, administración, el mentor que tiene sus clases y el
-- coordinador de ese mentor (un sustituto puntual no las ve).
CREATE POLICY kiru_family_unavailability_read ON public.kiru_family_unavailability
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = kiru_family_unavailability.student_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
  OR EXISTS (SELECT 1 FROM public.kiru_class_sessions cs
             WHERE cs.student_id = kiru_family_unavailability.student_id
               AND (cs.mentor_id = (SELECT kiru_private.active_uid()) OR kiru_private.coordinates_mentor(cs.mentor_id)))
);

-- ¿Alguna fecha cae en una franja en la que la familia no puede?
CREATE OR REPLACE FUNCTION kiru_private.class_check_family_unavailable(p_student uuid, p_options jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_start timestamp;
  v_end timestamp;
  u public.kiru_family_unavailability;
BEGIN
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) LOOP
    v_start := (v_item ->> 'start')::timestamptz AT TIME ZONE 'Europe/Madrid';
    v_end := (v_item ->> 'end')::timestamptz AT TIME ZONE 'Europe/Madrid';
    SELECT * INTO u FROM public.kiru_family_unavailability f
    WHERE f.student_id = p_student AND f.removed_at IS NULL
      AND f.weekday = extract(isodow FROM v_start)
      AND f.start_time < CASE WHEN v_end::date = v_start::date THEN v_end::time ELSE time '23:59:59' END
      AND f.end_time > v_start::time
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'La familia ha indicado que no puede los % de % a % (%).',
        (ARRAY['lunes','martes','miércoles','jueves','viernes','sábados','domingos'])[u.weekday],
        to_char(u.start_time, 'HH24:MI'), to_char(u.end_time, 'HH24:MI'), to_char(v_start, 'DD/MM HH24:MI')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
END
$$;
REVOKE ALL ON FUNCTION kiru_private.class_check_family_unavailable(uuid, jsonb) FROM PUBLIC;

-- La familia guarda sus franjas (sustituye las anteriores sin borrarlas).
-- p_slots: [{"weekday": 1-7, "start": "HH:MI", "end": "HH:MI"}], como mucho 14.
CREATE OR REPLACE FUNCTION public.kiru_familia_no_disponible_guardar(p_actor uuid, p_student uuid, p_slots jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_item jsonb;
  v_day int;
  v_start time;
  v_end time;
  v_new jsonb := '[]'::jsonb;
BEGIN
  v_role := kiru_private.class_actor_role(p_actor, NULL, p_student);
  IF v_role NOT IN ('padre', 'admin') THEN
    RAISE EXCEPTION 'Solo la familia del alumno puede indicar cuándo no puede.' USING ERRCODE = '42501';
  END IF;
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) > 14 THEN
    RAISE EXCEPTION 'Datos no válidos.' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_slots) LOOP
    BEGIN
      v_day := (v_item ->> 'weekday')::int;
      v_start := (v_item ->> 'start')::time;
      v_end := (v_item ->> 'end')::time;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Hay una franja que no es válida.' USING ERRCODE = 'check_violation';
    END;
    IF v_day IS NULL OR v_day NOT BETWEEN 1 AND 7 OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start THEN
      RAISE EXCEPTION 'Hay una franja que no es válida: la hora de fin tiene que ser posterior a la de inicio.' USING ERRCODE = 'check_violation';
    END IF;
    v_new := v_new || jsonb_build_array(jsonb_build_object('weekday', v_day, 'start', v_start, 'end', v_end));
  END LOOP;

  -- Las franjas que ya no están se marcan como retiradas; las nuevas se añaden.
  UPDATE public.kiru_family_unavailability f SET removed_at = now(), removed_by = p_actor
  WHERE f.student_id = p_student AND f.removed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_new) n
                    WHERE (n.value ->> 'weekday')::int = f.weekday
                      AND (n.value ->> 'start')::time = f.start_time AND (n.value ->> 'end')::time = f.end_time);
  INSERT INTO public.kiru_family_unavailability (student_id, weekday, start_time, end_time, created_by)
  SELECT DISTINCT p_student, (n.value ->> 'weekday')::int, (n.value ->> 'start')::time, (n.value ->> 'end')::time, p_actor
  FROM jsonb_array_elements(v_new) n
  WHERE NOT EXISTS (SELECT 1 FROM public.kiru_family_unavailability f
                    WHERE f.student_id = p_student AND f.removed_at IS NULL
                      AND f.weekday = (n.value ->> 'weekday')::int
                      AND f.start_time = (n.value ->> 'start')::time AND f.end_time = (n.value ->> 'end')::time);
  RETURN jsonb_build_object('franjas', (SELECT count(*) FROM public.kiru_family_unavailability
                                        WHERE student_id = p_student AND removed_at IS NULL));
END
$$;
REVOKE ALL ON FUNCTION public.kiru_familia_no_disponible_guardar(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_familia_no_disponible_guardar(uuid, uuid, jsonb) TO service_role;

-- Cambios y recuperaciones del mentor: además, fuera de esas franjas.
CREATE OR REPLACE FUNCTION public.kiru_clases_solicitar(
  p_actor uuid, p_session uuid, p_kind text, p_reason text,
  p_options jsonb DEFAULT '[]'::jsonb, p_details text DEFAULT '', p_preferences text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.kiru_class_sessions;
  v_role text;
  v_hours numeric;
  v_late boolean;
  v_options jsonb;
  v_req uuid;
  v_sup uuid;
  v_g uuid;
  v_mentor_name text;
  v_student_name text;
  v_limit int := kiru_private.setting_int('clases_horas_aviso', 48);
BEGIN
  IF p_kind NOT IN ('cambio', 'cancelacion') THEN
    RAISE EXCEPTION 'Tipo de solicitud no válido.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa clase.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, s.mentor_id, s.student_id);
  IF v_role NOT IN ('mentor', 'padre') THEN
    RAISE EXCEPTION 'Las solicitudes las hacen el mentor o la familia.' USING ERRCODE = '42501';
  END IF;
  IF s.delivery <> 'programada' OR s.scheduled_start <= now() THEN
    RAISE EXCEPTION 'Solo se pueden gestionar clases que aún no han empezado.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Explica el motivo.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kiru_class_requests q
             WHERE q.session_id = s.id AND q.kind IN ('cambio', 'cancelacion')
               AND q.status IN ('pendiente', 'mas_info', 'contrapropuesta')) THEN
    RAISE EXCEPTION 'Esta clase ya tiene una solicitud en curso.' USING ERRCODE = 'unique_violation';
  END IF;

  v_hours := round((extract(epoch FROM (s.scheduled_start - now())) / 3600.0)::numeric, 1);
  v_late := v_hours < v_limit;
  v_options := CASE WHEN p_kind = 'cambio'
                    THEN kiru_private.class_clean_options(p_options, s.mentor_id, s.student_id, s.id)
                    ELSE '[]'::jsonb END;
  IF p_kind = 'cambio' AND v_role = 'mentor' THEN
    PERFORM kiru_private.class_check_mentor_options(v_options);
    PERFORM kiru_private.class_check_family_unavailable(s.student_id, v_options);
  END IF;

  INSERT INTO public.kiru_class_requests (session_id, mentor_id, student_id, kind, requested_by, requester_role,
    reason, details, preferences, options, hours_notice, late, incident)
  VALUES (s.id, s.mentor_id, s.student_id, p_kind, p_actor, v_role,
    btrim(p_reason), btrim(coalesce(p_details, '')), btrim(coalesce(p_preferences, '')), v_options, v_hours, v_late,
    CASE WHEN v_role = 'mentor' AND v_late THEN 'potencial' ELSE 'ninguna' END)
  RETURNING id INTO v_req;

  PERFORM kiru_private.class_event(s.id, v_req, p_actor, 'solicitud_' || p_kind,
    jsonb_build_object('rol', v_role, 'horas_antelacion', v_hours, 'tardia', v_late));

  SELECT full_name INTO v_mentor_name FROM public.profiles WHERE id = s.mentor_id;
  SELECT full_name INTO v_student_name FROM public.profiles WHERE id = s.student_id;
  FOR v_sup IN SELECT kiru_private.class_supervisors(s.mentor_id) LOOP
    PERFORM kiru_private.class_notify(v_sup, s.student_id, s.id, v_req, 'clase_solicitud',
      CASE p_kind WHEN 'cambio' THEN 'Solicitud de cambio de clase' ELSE 'Solicitud de cancelación' END,
      coalesce(v_student_name, '') || ' con ' || coalesce(v_mentor_name, '') || ', clase del '
        || kiru_private.class_label(s.scheduled_start) || '. Pide: '
        || CASE v_role WHEN 'mentor' THEN 'el mentor' ELSE 'la familia' END
        || CASE WHEN v_late THEN ' (con menos de ' || v_limit || ' h).' ELSE '.' END,
      'clase_solicitud:' || v_req);
  END LOOP;
  -- La otra parte se entera: si pide la familia, el mentor; si pide el mentor,
  -- la familia solo cuando coordinación decida (no se le alarma antes).
  IF v_role = 'padre' THEN
    PERFORM kiru_private.class_notify(s.mentor_id, s.student_id, s.id, v_req, 'clase_solicitud',
      CASE p_kind WHEN 'cambio' THEN 'La familia pide cambiar una clase' ELSE 'La familia pide cancelar una clase' END,
      coalesce(v_student_name, '') || ', clase del ' || kiru_private.class_label(s.scheduled_start) || '. Coordinación lo revisará.',
      'clase_solicitud:' || v_req);
  END IF;

  RETURN jsonb_build_object('id', v_req, 'horas_antelacion', v_hours, 'tardia', v_late,
                            'incidencia', v_role = 'mentor' AND v_late);
END
$$;

CREATE OR REPLACE FUNCTION public.kiru_recuperaciones_proponer(
  p_actor uuid, p_session uuid, p_options jsonb, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.kiru_class_sessions;
  v_role text;
  v_options jsonb;
  v_req uuid;
  v_g uuid;
  v_mentor text;
BEGIN
  SELECT * INTO s FROM public.kiru_class_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR s.kind <> 'regular' THEN RAISE EXCEPTION 'No existe esa clase.' USING ERRCODE = 'no_data_found'; END IF;
  v_role := kiru_private.class_actor_role(p_actor, s.mentor_id, s.student_id);
  IF v_role NOT IN ('mentor', 'coordinador', 'admin') THEN
    RAISE EXCEPTION 'Las fechas de recuperación las propone el mentor o coordinación.' USING ERRCODE = '42501';
  END IF;
  IF s.delivery <> 'no_impartida'
     OR NOT (s.recovery IN ('pendiente', 'propuesta', 'sin_encaje', 'rechazada')
             OR (s.recovery = 'ninguna' AND s.cancel_cause IN ('familia_menos_48h', 'no_presentado'))) THEN
    RAISE EXCEPTION 'Esta clase no tiene una recuperación por organizar.' USING ERRCODE = 'check_violation';
  END IF;
  v_options := kiru_private.class_clean_options(p_options, s.mentor_id, s.student_id, NULL);
  IF jsonb_array_length(v_options) = 0 THEN RAISE EXCEPTION 'Propón al menos una fecha.' USING ERRCODE = 'check_violation'; END IF;
  IF v_role = 'mentor' THEN
    PERFORM kiru_private.class_check_mentor_options(v_options);
    PERFORM kiru_private.class_check_family_unavailable(s.student_id, v_options);
  END IF;

  -- Una propuesta nueva sustituye a la anterior que siga abierta.
  UPDATE public.kiru_class_requests SET status = 'sustituida'
  WHERE session_id = s.id AND kind = 'propuesta_recuperacion' AND status IN ('pendiente', 'mas_info', 'contrapropuesta');

  INSERT INTO public.kiru_class_requests (session_id, mentor_id, student_id, kind, requested_by, requester_role, reason, options)
  VALUES (s.id, s.mentor_id, s.student_id, 'propuesta_recuperacion', p_actor, v_role, btrim(coalesce(p_note, '')), v_options)
  RETURNING id INTO v_req;

  UPDATE public.kiru_class_sessions SET recovery = 'propuesta' WHERE id = s.id;
  PERFORM kiru_private.class_event(s.id, v_req, p_actor, 'recuperacion_propuesta', jsonb_build_object('opciones', jsonb_array_length(v_options)));

  SELECT full_name INTO v_mentor FROM public.profiles WHERE id = s.mentor_id;
  FOR v_g IN SELECT kiru_private.class_guardians(s.student_id) LOOP
    PERFORM kiru_private.class_notify(v_g, s.student_id, s.id, v_req, 'recuperacion_propuesta',
      'Elige la fecha de recuperación',
      coalesce(v_mentor, 'El mentor') || ' propone ' || jsonb_array_length(v_options) || ' opciones para recuperar la clase del '
        || kiru_private.class_label(s.original_start) || '. Entra en el campus para elegir.',
      'recuperacion_propuesta:' || v_req);
  END LOOP;
  RETURN jsonb_build_object('id', v_req);
END
$$;
