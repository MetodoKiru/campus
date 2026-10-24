drop policy if exists "Kiru related users read PDFs" on storage.objects;
create policy "Kiru related users read PDFs" on storage.objects for select to authenticated using (
  bucket_id = 'kiru-documents' and (
    (select (auth.jwt() -> 'app_metadata' ->> 'kiru_role')) = 'admin'
    or exists (
      select 1 from public.students s
      where s.profile_id::text = (storage.foldername(name))[1]
        and (
          s.profile_id = (select auth.uid())
          or exists (select 1 from public.student_guardians sg where sg.student_id = s.profile_id and sg.guardian_id = (select auth.uid()))
          or exists (select 1 from public.student_mentors sm where sm.student_id = s.profile_id and sm.mentor_id = (select auth.uid()))
        )
    )
  )
);
