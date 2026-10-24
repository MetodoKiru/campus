create index if not exists kiru_document_acceptances_accepted_by_idx on public.kiru_document_acceptances (accepted_by);
create index if not exists kiru_documents_created_by_idx on public.kiru_documents (created_by);
create index if not exists kiru_flashcard_sets_created_by_idx on public.kiru_flashcard_sets (created_by);
create index if not exists kiru_notices_created_by_idx on public.kiru_notices (created_by);
create index if not exists kiru_payments_created_by_idx on public.kiru_payments (created_by);
create index if not exists kiru_flashcard_sets_status_updated_idx on public.kiru_flashcard_sets (status, updated_at desc);
create index if not exists kiru_flashcards_set_id_idx on public.kiru_flashcards (set_id);
create index if not exists kiru_app_records_owner_type_updated_idx on public.kiru_app_records (owner_id, record_type, updated_at desc);
