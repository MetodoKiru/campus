-- Endurece y acelera las políticas RLS del campus.
--
-- 1. Una sola fuente de verdad para la identidad y el rol:
--    kiru_private.active_uid() devuelve auth.uid() solo si el perfil está activo.
--    kiru_private.kiru_role() devuelve el rol solo si profiles.role coincide con
--    app_metadata.kiru_role del JWT. Una cuenta desactivada (is_active = false)
--    o con rol desincronizado pierde el acceso en todas las tablas.
-- 2. Las funciones se llaman como (select ...) para que Postgres las evalúe una
--    vez por consulta y no una vez por fila (aviso auth_rls_initplan).
-- 3. Una sola política permisiva por tabla y acción (aviso
--    multiple_permissive_policies).
-- 4. Un alumno solo puede escribir sus propios registros de tipo 'progress'
--    (y nunca las SkillCoins, que asigna su mentor).
-- 5. Se eliminan índices duplicados de kiru_app_records.

CREATE SCHEMA IF NOT EXISTS kiru_private;
REVOKE ALL ON SCHEMA kiru_private FROM PUBLIC;
GRANT USAGE ON SCHEMA kiru_private TO authenticated;

CREATE OR REPLACE FUNCTION kiru_private.active_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.is_active
$$;

CREATE OR REPLACE FUNCTION kiru_private.kiru_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active
    AND p.role = (auth.jwt() -> 'app_metadata' ->> 'kiru_role')
$$;

CREATE OR REPLACE FUNCTION kiru_private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(kiru_private.kiru_role() = 'admin', false)
$$;

REVOKE ALL ON FUNCTION kiru_private.active_uid(), kiru_private.kiru_role(), kiru_private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiru_private.active_uid(), kiru_private.kiru_role(), kiru_private.is_admin() TO authenticated;

-- profiles -------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_read_self_admin_related_students ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_delete ON public.profiles;

CREATE POLICY profiles_read_self_admin_related_students ON public.profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR (
    role = 'alumno' AND (
      EXISTS (SELECT 1 FROM public.student_mentors sm
              WHERE sm.student_id = profiles.id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
      OR EXISTS (SELECT 1 FROM public.student_guardians sg
                 WHERE sg.student_id = profiles.id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
    )
  )
);
CREATE POLICY profiles_admin_insert ON public.profiles
FOR INSERT TO authenticated WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY profiles_admin_update ON public.profiles
FOR UPDATE TO authenticated USING ((SELECT kiru_private.is_admin())) WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY profiles_admin_delete ON public.profiles
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- students -------------------------------------------------------------------
DROP POLICY IF EXISTS students_read_authorized ON public.students;
DROP POLICY IF EXISTS students_admin_insert ON public.students;
DROP POLICY IF EXISTS students_admin_update ON public.students;
DROP POLICY IF EXISTS students_admin_delete ON public.students;

CREATE POLICY students_read_authorized ON public.students
FOR SELECT TO authenticated
USING (
  profile_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR EXISTS (SELECT 1 FROM public.student_mentors sm
             WHERE sm.student_id = students.profile_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = students.profile_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
);
CREATE POLICY students_admin_insert ON public.students
FOR INSERT TO authenticated WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY students_admin_update ON public.students
FOR UPDATE TO authenticated USING ((SELECT kiru_private.is_admin())) WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY students_admin_delete ON public.students
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- student_mentors ------------------------------------------------------------
DROP POLICY IF EXISTS student_mentors_read_involved ON public.student_mentors;
DROP POLICY IF EXISTS student_mentors_admin_insert ON public.student_mentors;
DROP POLICY IF EXISTS student_mentors_admin_update ON public.student_mentors;
DROP POLICY IF EXISTS student_mentors_admin_delete ON public.student_mentors;

CREATE POLICY student_mentors_read_involved ON public.student_mentors
FOR SELECT TO authenticated
USING (
  mentor_id = (SELECT kiru_private.active_uid())
  OR student_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
);
CREATE POLICY student_mentors_admin_insert ON public.student_mentors
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT kiru_private.is_admin())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = mentor_id AND p.role = 'mentor')
);
CREATE POLICY student_mentors_admin_update ON public.student_mentors
FOR UPDATE TO authenticated
USING ((SELECT kiru_private.is_admin()))
WITH CHECK (
  (SELECT kiru_private.is_admin())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = mentor_id AND p.role = 'mentor')
);
CREATE POLICY student_mentors_admin_delete ON public.student_mentors
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- student_guardians ----------------------------------------------------------
DROP POLICY IF EXISTS student_guardians_read_involved ON public.student_guardians;
DROP POLICY IF EXISTS student_guardians_admin_insert ON public.student_guardians;
DROP POLICY IF EXISTS student_guardians_admin_update ON public.student_guardians;
DROP POLICY IF EXISTS student_guardians_admin_delete ON public.student_guardians;

CREATE POLICY student_guardians_read_involved ON public.student_guardians
FOR SELECT TO authenticated
USING (
  guardian_id = (SELECT kiru_private.active_uid())
  OR student_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
);
CREATE POLICY student_guardians_admin_insert ON public.student_guardians
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT kiru_private.is_admin())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = guardian_id AND p.role = 'padre')
);
CREATE POLICY student_guardians_admin_update ON public.student_guardians
FOR UPDATE TO authenticated
USING ((SELECT kiru_private.is_admin()))
WITH CHECK (
  (SELECT kiru_private.is_admin())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = guardian_id AND p.role = 'padre')
);
CREATE POLICY student_guardians_admin_delete ON public.student_guardians
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- kiru_app_records -----------------------------------------------------------
DROP POLICY IF EXISTS kiru_records_read_authorized ON public.kiru_app_records;
DROP POLICY IF EXISTS kiru_records_insert_authorized ON public.kiru_app_records;
DROP POLICY IF EXISTS kiru_records_update_authorized ON public.kiru_app_records;
DROP POLICY IF EXISTS kiru_records_delete_authorized ON public.kiru_app_records;

CREATE POLICY kiru_records_read_authorized ON public.kiru_app_records
FOR SELECT TO authenticated
USING (
  owner_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR EXISTS (SELECT 1 FROM public.student_mentors sm
             WHERE sm.student_id = kiru_app_records.owner_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = kiru_app_records.owner_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
);

-- Own records: students may only write their own practice progress.
CREATE POLICY kiru_records_insert_authorized ON public.kiru_app_records
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT kiru_private.is_admin())
  OR (
    owner_id = (SELECT kiru_private.active_uid())
    AND created_by = (SELECT kiru_private.active_uid())
    AND (
      (SELECT kiru_private.kiru_role()) IN ('mentor', 'padre')
      OR (record_type = 'progress' AND record_key NOT LIKE 'skillcoins\_%')
    )
  )
  OR (
    record_type IN ('activity', 'task', 'progress', 'message')
    AND created_by = (SELECT kiru_private.active_uid())
    AND EXISTS (SELECT 1 FROM public.student_mentors sm
                WHERE sm.student_id = kiru_app_records.owner_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  )
);

CREATE POLICY kiru_records_update_authorized ON public.kiru_app_records
FOR UPDATE TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR (
    owner_id = (SELECT kiru_private.active_uid())
    AND created_by = (SELECT kiru_private.active_uid())
  )
  OR (
    record_type IN ('activity', 'task', 'progress', 'message')
    AND EXISTS (SELECT 1 FROM public.student_mentors sm
                WHERE sm.student_id = kiru_app_records.owner_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  )
)
WITH CHECK (
  (SELECT kiru_private.is_admin())
  OR (
    owner_id = (SELECT kiru_private.active_uid())
    AND created_by = (SELECT kiru_private.active_uid())
    AND (
      (SELECT kiru_private.kiru_role()) IN ('mentor', 'padre')
      OR (record_type = 'progress' AND record_key NOT LIKE 'skillcoins\_%')
    )
  )
  OR (
    record_type IN ('activity', 'task', 'progress', 'message')
    AND created_by = (SELECT kiru_private.active_uid())
    AND EXISTS (SELECT 1 FROM public.student_mentors sm
                WHERE sm.student_id = kiru_app_records.owner_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  )
);

CREATE POLICY kiru_records_delete_authorized ON public.kiru_app_records
FOR DELETE TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR (
    owner_id = (SELECT kiru_private.active_uid())
    AND created_by = (SELECT kiru_private.active_uid())
  )
  OR (
    record_type IN ('activity', 'task', 'progress', 'message')
    AND EXISTS (SELECT 1 FROM public.student_mentors sm
                WHERE sm.student_id = kiru_app_records.owner_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  )
);

-- The UNIQUE constraint already indexes (owner_id, record_type, record_key).
DROP INDEX IF EXISTS public.kiru_app_records_owner_type_key_uidx;
DROP INDEX IF EXISTS public.kiru_app_records_owner_type_idx;

-- kiru_notices ---------------------------------------------------------------
DROP POLICY IF EXISTS kiru_notices_admin_all ON public.kiru_notices;
DROP POLICY IF EXISTS kiru_notices_related_read ON public.kiru_notices;

CREATE POLICY kiru_notices_read ON public.kiru_notices
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR ((SELECT kiru_private.active_uid()) IS NOT NULL AND target_student_id IS NULL)
  OR target_student_id = (SELECT kiru_private.active_uid())
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = kiru_notices.target_student_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
  OR EXISTS (SELECT 1 FROM public.student_mentors sm
             WHERE sm.student_id = kiru_notices.target_student_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
);
CREATE POLICY kiru_notices_admin_insert ON public.kiru_notices
FOR INSERT TO authenticated WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY kiru_notices_admin_update ON public.kiru_notices
FOR UPDATE TO authenticated USING ((SELECT kiru_private.is_admin())) WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY kiru_notices_admin_delete ON public.kiru_notices
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- kiru_documents -------------------------------------------------------------
DROP POLICY IF EXISTS kiru_documents_admin_all ON public.kiru_documents;
DROP POLICY IF EXISTS kiru_documents_related_read ON public.kiru_documents;

CREATE POLICY kiru_documents_read ON public.kiru_documents
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR target_student_id = (SELECT kiru_private.active_uid())
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = kiru_documents.target_student_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
  OR EXISTS (SELECT 1 FROM public.student_mentors sm
             WHERE sm.student_id = kiru_documents.target_student_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
);
CREATE POLICY kiru_documents_admin_insert ON public.kiru_documents
FOR INSERT TO authenticated WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY kiru_documents_admin_update ON public.kiru_documents
FOR UPDATE TO authenticated USING ((SELECT kiru_private.is_admin())) WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY kiru_documents_admin_delete ON public.kiru_documents
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- kiru_document_acceptances --------------------------------------------------
DROP POLICY IF EXISTS kiru_acceptances_admin_all ON public.kiru_document_acceptances;
DROP POLICY IF EXISTS kiru_acceptances_related_read ON public.kiru_document_acceptances;
DROP POLICY IF EXISTS kiru_acceptances_guardian_insert ON public.kiru_document_acceptances;

CREATE POLICY kiru_acceptances_read ON public.kiru_document_acceptances
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR student_id = (SELECT kiru_private.active_uid())
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = kiru_document_acceptances.student_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
);
CREATE POLICY kiru_acceptances_insert ON public.kiru_document_acceptances
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT kiru_private.is_admin())
  OR (
    accepted_by = (SELECT kiru_private.active_uid())
    AND EXISTS (SELECT 1 FROM public.student_guardians sg
                WHERE sg.student_id = kiru_document_acceptances.student_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
    AND EXISTS (SELECT 1 FROM public.kiru_documents d
                WHERE d.id = kiru_document_acceptances.document_id
                  AND d.requires_acceptance = true
                  AND (d.target_student_id = kiru_document_acceptances.student_id OR d.target_student_id IS NULL))
  )
);
CREATE POLICY kiru_acceptances_admin_update ON public.kiru_document_acceptances
FOR UPDATE TO authenticated USING ((SELECT kiru_private.is_admin())) WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY kiru_acceptances_admin_delete ON public.kiru_document_acceptances
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- kiru_payments --------------------------------------------------------------
DROP POLICY IF EXISTS kiru_payments_admin_all ON public.kiru_payments;
DROP POLICY IF EXISTS kiru_payments_related_read ON public.kiru_payments;

CREATE POLICY kiru_payments_read ON public.kiru_payments
FOR SELECT TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR student_id = (SELECT kiru_private.active_uid())
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = kiru_payments.student_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
);
CREATE POLICY kiru_payments_admin_insert ON public.kiru_payments
FOR INSERT TO authenticated WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY kiru_payments_admin_update ON public.kiru_payments
FOR UPDATE TO authenticated USING ((SELECT kiru_private.is_admin())) WITH CHECK ((SELECT kiru_private.is_admin()));
CREATE POLICY kiru_payments_admin_delete ON public.kiru_payments
FOR DELETE TO authenticated USING ((SELECT kiru_private.is_admin()));

-- kiru_flashcard_sets --------------------------------------------------------
DROP POLICY IF EXISTS kiru_flashcard_sets_read_related ON public.kiru_flashcard_sets;
DROP POLICY IF EXISTS kiru_flashcard_sets_insert_mentor_admin ON public.kiru_flashcard_sets;
DROP POLICY IF EXISTS kiru_flashcard_sets_update_mentor_admin ON public.kiru_flashcard_sets;
DROP POLICY IF EXISTS kiru_flashcard_sets_delete_mentor_admin ON public.kiru_flashcard_sets;

CREATE POLICY kiru_flashcard_sets_read_related ON public.kiru_flashcard_sets
FOR SELECT TO authenticated
USING (
  student_id = (SELECT kiru_private.active_uid())
  OR (SELECT kiru_private.is_admin())
  OR EXISTS (SELECT 1 FROM public.student_mentors sm
             WHERE sm.student_id = kiru_flashcard_sets.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  OR EXISTS (SELECT 1 FROM public.student_guardians sg
             WHERE sg.student_id = kiru_flashcard_sets.student_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
);
CREATE POLICY kiru_flashcard_sets_insert_mentor_admin ON public.kiru_flashcard_sets
FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT kiru_private.active_uid())
  AND (
    (SELECT kiru_private.is_admin())
    OR EXISTS (SELECT 1 FROM public.student_mentors sm
               WHERE sm.student_id = kiru_flashcard_sets.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
  )
);
CREATE POLICY kiru_flashcard_sets_update_mentor_admin ON public.kiru_flashcard_sets
FOR UPDATE TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR (created_by = (SELECT kiru_private.active_uid())
      AND EXISTS (SELECT 1 FROM public.student_mentors sm
                  WHERE sm.student_id = kiru_flashcard_sets.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid())))
)
WITH CHECK (
  (SELECT kiru_private.is_admin())
  OR (created_by = (SELECT kiru_private.active_uid())
      AND EXISTS (SELECT 1 FROM public.student_mentors sm
                  WHERE sm.student_id = kiru_flashcard_sets.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid())))
);
CREATE POLICY kiru_flashcard_sets_delete_mentor_admin ON public.kiru_flashcard_sets
FOR DELETE TO authenticated
USING (
  (SELECT kiru_private.is_admin())
  OR (created_by = (SELECT kiru_private.active_uid())
      AND EXISTS (SELECT 1 FROM public.student_mentors sm
                  WHERE sm.student_id = kiru_flashcard_sets.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid())))
);

-- kiru_flashcards ------------------------------------------------------------
DROP POLICY IF EXISTS kiru_flashcards_read_related ON public.kiru_flashcards;
DROP POLICY IF EXISTS kiru_flashcards_insert_mentor_admin ON public.kiru_flashcards;
DROP POLICY IF EXISTS kiru_flashcards_update_mentor_admin ON public.kiru_flashcards;
DROP POLICY IF EXISTS kiru_flashcards_delete_mentor_admin ON public.kiru_flashcards;

-- Reading a card requires being able to read its set (the set's SELECT policy applies inside EXISTS).
CREATE POLICY kiru_flashcards_read_related ON public.kiru_flashcards
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kiru_flashcard_sets s
    WHERE s.id = kiru_flashcards.set_id
      AND (
        s.student_id = (SELECT kiru_private.active_uid())
        OR (SELECT kiru_private.is_admin())
        OR EXISTS (SELECT 1 FROM public.student_mentors sm
                   WHERE sm.student_id = s.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
        OR EXISTS (SELECT 1 FROM public.student_guardians sg
                   WHERE sg.student_id = s.student_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
      )
  )
);
CREATE POLICY kiru_flashcards_insert_mentor_admin ON public.kiru_flashcards
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kiru_flashcard_sets s
    WHERE s.id = kiru_flashcards.set_id
      AND (
        (SELECT kiru_private.is_admin())
        OR (s.created_by = (SELECT kiru_private.active_uid())
            AND EXISTS (SELECT 1 FROM public.student_mentors sm
                        WHERE sm.student_id = s.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid())))
      )
  )
);
CREATE POLICY kiru_flashcards_update_mentor_admin ON public.kiru_flashcards
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kiru_flashcard_sets s
    WHERE s.id = kiru_flashcards.set_id
      AND (
        (SELECT kiru_private.is_admin())
        OR (s.created_by = (SELECT kiru_private.active_uid())
            AND EXISTS (SELECT 1 FROM public.student_mentors sm
                        WHERE sm.student_id = s.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid())))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kiru_flashcard_sets s
    WHERE s.id = kiru_flashcards.set_id
      AND (
        (SELECT kiru_private.is_admin())
        OR (s.created_by = (SELECT kiru_private.active_uid())
            AND EXISTS (SELECT 1 FROM public.student_mentors sm
                        WHERE sm.student_id = s.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid())))
      )
  )
);
CREATE POLICY kiru_flashcards_delete_mentor_admin ON public.kiru_flashcards
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kiru_flashcard_sets s
    WHERE s.id = kiru_flashcards.set_id
      AND (
        (SELECT kiru_private.is_admin())
        OR (s.created_by = (SELECT kiru_private.active_uid())
            AND EXISTS (SELECT 1 FROM public.student_mentors sm
                        WHERE sm.student_id = s.student_id AND sm.mentor_id = (SELECT kiru_private.active_uid())))
      )
  )
);

-- storage.objects (bucket kiru-documents) ------------------------------------
DROP POLICY IF EXISTS "Kiru admins upload PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Kiru admins update PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Kiru admins delete PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Kiru related users read PDFs" ON storage.objects;

CREATE POLICY "Kiru admins upload PDFs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'kiru-documents' AND (SELECT kiru_private.is_admin()));
CREATE POLICY "Kiru admins update PDFs" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'kiru-documents' AND (SELECT kiru_private.is_admin()))
WITH CHECK (bucket_id = 'kiru-documents' AND (SELECT kiru_private.is_admin()));
CREATE POLICY "Kiru admins delete PDFs" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'kiru-documents' AND (SELECT kiru_private.is_admin()));
CREATE POLICY "Kiru related users read PDFs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'kiru-documents' AND (
    (SELECT kiru_private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.profile_id::text = (storage.foldername(name))[1]
        AND (
          s.profile_id = (SELECT kiru_private.active_uid())
          OR EXISTS (SELECT 1 FROM public.student_guardians sg
                     WHERE sg.student_id = s.profile_id AND sg.guardian_id = (SELECT kiru_private.active_uid()))
          OR EXISTS (SELECT 1 FROM public.student_mentors sm
                     WHERE sm.student_id = s.profile_id AND sm.mentor_id = (SELECT kiru_private.active_uid()))
        )
    )
  )
);
