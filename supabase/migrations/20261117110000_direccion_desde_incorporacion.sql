-- Dirección de clase automática desde el formulario de incorporación (Jotform «Incorporación Método Kiru»).
-- El Apps Script «Kiru filtro candidatos» lee la hoja «Familias Kiru (respuestas)» y manda cada fila
-- (correos de los padres, nombre del alumno y dirección) a /api/familias/direcciones.
-- Se enlaza con el alumno del campus por el correo de su padre/madre y, si esa familia tiene varios
-- hijos en el campus, por el nombre. Solo rellena direcciones VACÍAS: si Coordinación la ha cambiado
-- a mano, no se toca.

CREATE OR REPLACE FUNCTION kiru_private.fold(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(translate(btrim(coalesce(p, '')), 'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñÇç', 'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNnCc'))
$$;
REVOKE ALL ON FUNCTION kiru_private.fold(text) FROM PUBLIC;

-- p_rows: [{"emails": ["padre@x.com", "madre@y.com"], "alumno": "Alondra Castillo", "direccion": "Calle …"}]
CREATE OR REPLACE FUNCTION public.kiru_familias_direcciones(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r jsonb;
  v_addr text;
  v_first text;
  v_students uuid[];
  v_student uuid;
  v_set int := 0;
  v_kept int := 0;
  v_unmatched int := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    v_addr := left(btrim(regexp_replace(coalesce(r ->> 'direccion', ''), '\s+', ' ', 'g')), 200);
    CONTINUE WHEN v_addr = '';
    v_first := split_part(kiru_private.fold(r ->> 'alumno'), ' ', 1);

    SELECT array_agg(DISTINCT sg.student_id) INTO v_students
    FROM auth.users u
    JOIN public.student_guardians sg ON sg.guardian_id = u.id
    WHERE lower(u.email) IN (SELECT lower(btrim(e)) FROM jsonb_array_elements_text(coalesce(r -> 'emails', '[]'::jsonb)) e WHERE btrim(e) <> '');

    v_student := NULL;
    IF coalesce(cardinality(v_students), 0) = 1 THEN
      v_student := v_students[1];
    ELSIF coalesce(cardinality(v_students), 0) > 1 AND v_first <> '' THEN
      SELECT p.id INTO v_student FROM public.profiles p
      WHERE p.id = ANY (v_students) AND split_part(kiru_private.fold(p.full_name), ' ', 1) = v_first
      LIMIT 1;
    END IF;

    IF v_student IS NULL THEN v_unmatched := v_unmatched + 1; CONTINUE; END IF;

    UPDATE public.students SET class_address = v_addr, updated_at = now()
    WHERE profile_id = v_student AND class_address = '';
    IF FOUND THEN v_set := v_set + 1; ELSE v_kept := v_kept + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('rellenadas', v_set, 'ya_tenian', v_kept, 'sin_alumno_en_campus', v_unmatched);
END
$$;
REVOKE ALL ON FUNCTION public.kiru_familias_direcciones(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_familias_direcciones(jsonb) TO service_role;
