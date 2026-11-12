-- Evidencias de justificaciones: las fotos y documentos se conservan hasta el 31 de
-- agosto de cada curso y después se eliminan solos (decisión de Sofía, 09/11/2026).
-- El texto de la justificación y la fila del adjunto se quedan: solo se marca la
-- fecha en que se eliminó el archivo, para que el historial diga «archivo eliminado».
--
-- Supabase no deja borrar archivos del almacén desde SQL, así que la tarea diaria de
-- Vercel pide la lista (kiru_evidence_expired), borra los archivos con la API de
-- Storage y luego los marca (kiru_evidence_mark_deleted). Idempotente.

ALTER TABLE public.kiru_skillcoin_review_files
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text CHECK (deleted_reason IS NULL OR length(deleted_reason) <= 60);
COMMENT ON COLUMN public.kiru_skillcoin_review_files.deleted_at IS
  'Cuándo se eliminó el archivo del almacén (fin de curso). La fila se conserva para el historial.';

-- Los adjuntos siguen sin poder borrarse ni editarse; el único cambio permitido es
-- marcar una vez que el archivo se eliminó.
CREATE OR REPLACE FUNCTION kiru_private.review_files_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
     AND (to_jsonb(NEW) - 'deleted_at' - 'deleted_reason') = (to_jsonb(OLD) - 'deleted_at' - 'deleted_reason') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El historial de supervisión no se puede modificar ni borrar.' USING ERRCODE = '42501';
END
$$;
REVOKE ALL ON FUNCTION kiru_private.review_files_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS kiru_skillcoin_review_files_append_only ON public.kiru_skillcoin_review_files;
CREATE TRIGGER kiru_skillcoin_review_files_append_only BEFORE UPDATE OR DELETE ON public.kiru_skillcoin_review_files
FOR EACH ROW EXECUTE FUNCTION kiru_private.review_files_guard();

-- Inicio del curso en curso: el 1 de septiembre más reciente (hora de Madrid).
CREATE OR REPLACE FUNCTION kiru_private.course_start(p_day date DEFAULT NULL)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT make_date(
    extract(year FROM d)::int - CASE WHEN extract(month FROM d) < 9 THEN 1 ELSE 0 END, 9, 1)
  FROM (SELECT coalesce(p_day, (now() AT TIME ZONE 'Europe/Madrid')::date) AS d) x
$$;
REVOKE ALL ON FUNCTION kiru_private.course_start(date) FROM PUBLIC;

-- Archivos de cursos anteriores que ya se pueden eliminar. Si la revisión sigue
-- abierta, se espera a que se cierre (se eliminan al día siguiente de cerrarla).
CREATE OR REPLACE FUNCTION public.kiru_evidence_expired(p_limit integer DEFAULT 500)
RETURNS TABLE (id uuid, storage_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.id, f.storage_path
  FROM public.kiru_skillcoin_review_files f
  JOIN public.kiru_skillcoin_reviews r ON r.id = f.review_id
  WHERE f.deleted_at IS NULL
    AND (f.created_at AT TIME ZONE 'Europe/Madrid')::date < kiru_private.course_start()
    AND r.status = 'cerrada'
  ORDER BY f.created_at
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000))
$$;

-- Marca como eliminados los archivos que la tarea ya borró del almacén y lo deja en
-- el historial de cada revisión. Repetirlo no cambia nada.
CREATE OR REPLACE FUNCTION public.kiru_evidence_mark_deleted(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    WITH marked AS (
      UPDATE public.kiru_skillcoin_review_files f
      SET deleted_at = now(), deleted_reason = 'fin_de_curso'
      WHERE f.id = ANY (coalesce(p_ids, '{}')) AND f.deleted_at IS NULL
        AND (f.created_at AT TIME ZONE 'Europe/Madrid')::date < kiru_private.course_start()
        AND EXISTS (SELECT 1 FROM public.kiru_skillcoin_reviews x WHERE x.id = f.review_id AND x.status = 'cerrada')
      RETURNING f.review_id
    )
    SELECT m.review_id, rv.mentor_id, count(*)::int AS n
    FROM marked m JOIN public.kiru_skillcoin_reviews rv ON rv.id = m.review_id
    GROUP BY m.review_id, rv.mentor_id
  LOOP
    INSERT INTO public.kiru_supervision_events (review_id, mentor_id, actor_id, action, detail)
    VALUES (r.review_id, r.mentor_id, NULL, 'evidencias_eliminadas',
      jsonb_build_object('archivos', r.n, 'motivo', 'fin_de_curso'));
    v_count := v_count + r.n;
  END LOOP;
  RETURN v_count;
END
$$;

REVOKE EXECUTE ON FUNCTION public.kiru_evidence_expired(integer), public.kiru_evidence_mark_deleted(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiru_evidence_expired(integer), public.kiru_evidence_mark_deleted(uuid[])
  TO service_role;
