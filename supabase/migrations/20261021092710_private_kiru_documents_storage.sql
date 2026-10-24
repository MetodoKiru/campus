insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('kiru-documents', 'kiru-documents', false, 10485760, array['application/pdf']) on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

create policy "Kiru admins upload PDFs" on storage.objects for insert to authenticated with check (bucket_id = 'kiru-documents' and (select (auth.jwt() -> 'app_metadata' ->> 'kiru_role')) = 'admin');

create policy "Kiru admins update PDFs" on storage.objects for update to authenticated using (bucket_id = 'kiru-documents' and (select (auth.jwt() -> 'app_metadata' ->> 'kiru_role')) = 'admin') with check (bucket_id = 'kiru-documents' and (select (auth.jwt() -> 'app_metadata' ->> 'kiru_role')) = 'admin');

create policy "Kiru admins delete PDFs" on storage.objects for delete to authenticated using (bucket_id = 'kiru-documents' and (select (auth.jwt() -> 'app_metadata' ->> 'kiru_role')) = 'admin');

create policy "Kiru related users read PDFs" on storage.objects for select to authenticated using (bucket_id = 'kiru-documents' and (select (auth.jwt() -> 'app_metadata' ->> 'kiru_role')) = 'admin');
