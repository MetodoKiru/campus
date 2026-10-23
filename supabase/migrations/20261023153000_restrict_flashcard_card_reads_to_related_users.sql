-- Restrict flashcard contents to the student and their assigned Kiru team.
-- The previous policy only checked that a parent set existed, which could expose
-- cards belonging to unrelated students to any authenticated account.
DROP POLICY IF EXISTS kiru_flashcards_read_related ON public.kiru_flashcards;

CREATE POLICY kiru_flashcards_read_related
ON public.kiru_flashcards
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.kiru_flashcard_sets AS s
    WHERE s.id = kiru_flashcards.set_id
      AND (
        s.student_id = (SELECT auth.uid())
        OR (SELECT (auth.jwt() -> 'app_metadata' ->> 'kiru_role')) = 'admin'
        OR EXISTS (
          SELECT 1
          FROM public.student_mentors AS sm
          WHERE sm.student_id = s.student_id
            AND sm.mentor_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1
          FROM public.student_guardians AS sg
          WHERE sg.student_id = s.student_id
            AND sg.guardian_id = (SELECT auth.uid())
        )
      )
  )
);
