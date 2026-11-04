-- Horario recurrente fijado para cada relación alumno-mentor.
-- Las fechas concretas de las clases se añadirán cuando exista planificación de sesiones.
CREATE TABLE public.kiru_student_schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  time_zone text NOT NULL DEFAULT 'Europe/Madrid',
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'campus' CHECK (source IN ('campus', 'sheet_import')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, weekday, start_time)
);

CREATE INDEX kiru_student_schedule_slots_student_idx
  ON public.kiru_student_schedule_slots (student_id, weekday) WHERE is_active;
CREATE INDEX kiru_student_schedule_slots_mentor_idx
  ON public.kiru_student_schedule_slots (mentor_id, weekday) WHERE is_active;

ALTER TABLE public.kiru_student_schedule_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiru_student_schedule_slots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kiru_student_schedule_slots TO authenticated;
GRANT ALL ON public.kiru_student_schedule_slots TO service_role;

CREATE POLICY kiru_schedule_read_related ON public.kiru_student_schedule_slots
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
    OR kiru_private.is_guardian_of(student_id)
    OR EXISTS (
      SELECT 1 FROM public.student_mentors sm
      WHERE sm.student_id = kiru_student_schedule_slots.student_id
        AND sm.mentor_id = kiru_student_schedule_slots.mentor_id
        AND sm.mentor_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin' AND p.is_active
    )
  );

COMMENT ON TABLE public.kiru_student_schedule_slots IS
  'Horario semanal acordado de la relación alumno-mentor. No representa reservas fechadas de sesiones.';
