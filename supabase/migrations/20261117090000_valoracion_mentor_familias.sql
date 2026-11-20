-- Valoración del mentor por las familias (decidido por Sofía el 15/11/2026, opción A).
--
-- Cada 3 meses, junto con la evaluación trimestral de la familia (ciclos 1, 2, 3…; en la
-- inicial todavía no conocen al mentor), la familia valora de 1 a 5 a cada mentor que ha
-- dado clase a su hijo/a en los últimos 3 meses:
--   puntualidad · comunicación con la familia · efectividad (se notan avances) ·
--   trato con el alumno · profesionalidad, más un comentario opcional.
-- Se rellena en el campus, en la misma página que abre el enlace de la evaluación
-- (/evaluacion/{token}) antes de pasar al formulario de Jotform. Se puede marcar
-- «No lo sé» en cualquier pregunta.
--
-- Las respuestas son confidenciales: el mentor no las ve una a una. Solo las lee el
-- servidor; Coordinación y Administración ven la media en «Evaluaciones» y en «Desempeño».
--
-- Alimenta el indicador D2 (Valoración de las familias): media de las valoraciones de los
-- últimos 6 meses pasada a 0-100. Con menos de 3 familias distintas queda pendiente
-- (no entra en la nota), como dice la ficha del indicador.

-- 1. Valoraciones ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiru_mentor_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.kiru_evaluations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 1 a 5; vacío = «No lo sé».
  puntualidad smallint CHECK (puntualidad BETWEEN 1 AND 5),
  comunicacion smallint CHECK (comunicacion BETWEEN 1 AND 5),
  efectividad smallint CHECK (efectividad BETWEEN 1 AND 5),
  trato smallint CHECK (trato BETWEEN 1 AND 5),
  profesionalidad smallint CHECK (profesionalidad BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 1500),
  -- Media de las preguntas contestadas (vacía si todo es «No lo sé»).
  average numeric(3, 2) GENERATED ALWAYS AS (
    CASE WHEN num_nonnulls(puntualidad, comunicacion, efectividad, trato, profesionalidad) = 0 THEN NULL
         ELSE round((coalesce(puntualidad, 0) + coalesce(comunicacion, 0) + coalesce(efectividad, 0)
                     + coalesce(trato, 0) + coalesce(profesionalidad, 0))::numeric
                    / num_nonnulls(puntualidad, comunicacion, efectividad, trato, profesionalidad), 2)
    END) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, mentor_id)
);
CREATE INDEX IF NOT EXISTS kiru_mentor_ratings_mentor_idx ON public.kiru_mentor_ratings (mentor_id, created_at);
COMMENT ON TABLE public.kiru_mentor_ratings IS
  'Valoración trimestral del mentor por la familia (1-5 por pregunta, vacío = no lo sé). Confidencial: solo el servidor; el mentor no la ve una a una. Alimenta el indicador D2.';

ALTER TABLE public.kiru_mentor_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_mentor_ratings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.kiru_mentor_ratings TO service_role;

-- 2. Indicador D2 ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kiru_private.perf_indicator_values_d2(p_mentor uuid, p_from timestamptz, p_to timestamptz, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_data_from timestamptz := coalesce(
    ((SELECT data_from FROM public.kiru_perf_settings LIMIT 1)::timestamp AT TIME ZONE 'Europe/Madrid'), p_from);
  v_since timestamptz;
  v_min int := coalesce((p_rules #>> '{min_sample,D2}')::int, 3);
  b record;
BEGIN
  -- Ventana: los 6 meses anteriores al final del periodo, sin datos anteriores a la entrada en vigor.
  v_since := greatest(p_to - interval '6 months', v_data_from);
  SELECT count(*) AS answers, count(DISTINCT r.student_id) AS families, round(avg(r.average), 2) AS avg5,
         round(avg(r.puntualidad), 2) AS puntualidad, round(avg(r.comunicacion), 2) AS comunicacion,
         round(avg(r.efectividad), 2) AS efectividad, round(avg(r.trato), 2) AS trato,
         round(avg(r.profesionalidad), 2) AS profesionalidad
  INTO b
  FROM public.kiru_mentor_ratings r
  WHERE r.mentor_id = p_mentor AND r.average IS NOT NULL
    AND r.created_at >= v_since AND r.created_at < p_to;
  RETURN jsonb_build_object('D2', jsonb_build_object(
    'status', CASE WHEN b.families >= v_min THEN 'calculado' ELSE 'pendiente' END,
    'value', CASE WHEN b.families >= v_min THEN round((b.avg5 - 1) * 25, 1) END,
    'ok', b.families, 'total', b.answers,
    'detail', jsonb_build_object('familias', b.families, 'valoraciones', b.answers, 'media_sobre_5', b.avg5,
      'puntualidad', b.puntualidad, 'comunicacion', b.comunicacion, 'efectividad', b.efectividad,
      'trato', b.trato, 'profesionalidad', b.profesionalidad, 'minimo_familias', v_min, 'meses', 6)));
END;
$$;

-- El cálculo de cada mentor junta Fase 1, Fase 2a y la valoración de las familias.
CREATE OR REPLACE FUNCTION kiru_private.perf_compute(p_from timestamptz, p_to timestamptz, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m record;
  v_values jsonb;
  v_out jsonb := '[]'::jsonb;
BEGIN
  FOR m IN SELECT p.id, p.full_name FROM public.profiles p WHERE p.role = 'mentor' ORDER BY p.full_name LOOP
    v_values := kiru_private.perf_indicator_values(m.id, p_from, p_to, p_rules)
             || kiru_private.perf_indicator_values_2a(m.id, p_from, p_to, p_rules)
             || kiru_private.perf_indicator_values_d2(m.id, p_from, p_to, p_rules);
    -- Las incidencias llegan en la fase 5: de momento ninguna.
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'mentor_id', m.id, 'mentor_name', m.full_name, 'values', v_values,
      'score', kiru_private.perf_assemble(v_values, p_rules, '{"leve":0,"grave":0,"muy_grave":0}'::jsonb,
                 coalesce((v_values #>> '{B1,total}')::int, 0))));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.perf_indicator_values_d2(uuid, timestamptz, timestamptz, jsonb),
  kiru_private.perf_compute(timestamptz, timestamptz, jsonb) FROM PUBLIC;

-- 3. Ficha del indicador -------------------------------------------------------------------------
UPDATE public.kiru_perf_indicators SET
  description = 'Cada 3 meses, con su evaluación trimestral, la familia valora de 1 a 5 la puntualidad, la comunicación, la efectividad, el trato con el alumno y la profesionalidad del mentor. Se usa la media de los últimos 6 meses (1 = 0, 5 = 100).',
  source = 'Valoración del mentor en el campus, en el enlace de la evaluación trimestral de la familia.',
  missing_data = 'Menos de 3 familias distintas en 6 meses: no entra en la nota. Si una familia no responde o contesta «No lo sé», no cuenta.'
WHERE code = 'D2';
