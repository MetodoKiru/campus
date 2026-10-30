// Tipos de la base de datos de Supabase (esquema public).
// Condensado a mano a partir de `generate_typescript_types` el 2026-10-24.
// Si cambia el esquema, regenéralo (supabase gen types typescript) o actualiza esta tabla.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Insert type: every column, with the ones that have a database default made optional. */
type Insertable<Row, WithDefault extends keyof Row> = Omit<Row, WithDefault> & Partial<Pick<Row, WithDefault>>;

type Table<Row, WithDefault extends keyof Row> = {
  Row: Row;
  Insert: Insertable<Row, WithDefault>;
  Update: Partial<Row>;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  full_name: string;
  username: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentRow = {
  profile_id: string;
  level: string;
  skill_coins: number;
  created_at: string;
  updated_at: string;
};

export type StudentMentorRow = { student_id: string; mentor_id: string; assigned_at: string };

export type StudentGuardianRow = {
  student_id: string;
  guardian_id: string;
  relationship: string | null;
  assigned_at: string;
};

export type AppRecordRow = {
  id: string;
  owner_id: string;
  record_type: string;
  record_key: string;
  data: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NoticeRow = {
  id: string;
  title: string;
  content: string;
  target_student_id: string | null;
  link_url: string | null;
  link_title: string | null;
  attachment_path: string | null;
  created_by: string;
  published_at: string;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  title: string;
  document_type: string;
  target_student_id: string | null;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  requires_acceptance: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type DocumentAcceptanceRow = {
  id: string;
  document_id: string;
  student_id: string;
  accepted_by: string;
  accepted_at: string;
};

export type PaymentRow = {
  id: string;
  student_id: string;
  concept: string;
  amount_cents: number;
  due_date: string | null;
  status: string;
  payment_url: string | null;
  paid_at: string | null;
  external_reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type FlashcardSetRow = {
  id: string;
  student_id: string;
  created_by: string;
  title: string;
  subject: string;
  source_file_name: string | null;
  source_storage_path: string | null;
  source_mime_type: string | null;
  source_size_bytes: number | null;
  generation_method: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FlashcardRow = {
  id: string;
  set_id: string;
  term: string;
  definition: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type MentorOnboardingRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  confidentiality_signed_at: string | null;
  confidentiality_checked_by: string | null;
  certificate_checked_at: string | null;
  certificate_checked_by: string | null;
  profile_id: string | null;
  notes: string;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CoordinatorMentorRow = { mentor_id: string; coordinator_id: string; assigned_at: string };

export type SessionLogRow = {
  id: string;
  source_key: string;
  submitted_at: string;
  session_date: string | null;
  mentor_name: string;
  student_name: string;
  respondent_email: string | null;
  mentor_id: string | null;
  student_id: string | null;
  incident: string;
  answers: Json;
  created_at: string;
  updated_at: string;
};

export type AccessLinkRow = { id: string; profile_id: string; token_hash: string; expires_at: string; used_at: string | null; created_at: string };

export type PinRequestRow = { id: string; profile_id: string; created_at: string; sent_at: string | null };

export type IncidentReviewRow = { log_id: string; note: string; reviewed_by: string | null; reviewed_at: string };

export type MentorStepRow = {
  mentor_id: string;
  step: "certificado" | "nuestro_equipo" | "llamadas";
  status: "enviado" | "en_revision" | "completado" | "requiere_correccion";
  document_path: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string;
  updated_at: string;
};

export type AssignmentOfferRow = {
  id: string;
  offer_code: string;
  mentor_email: string;
  mentor_id: string | null;
  course: string;
  student_profile: string;
  zone: string;
  intensity: string;
  slots: string;
  sent_at: string;
  response_links: Json;
  response: "si" | "ajustar" | "no" | null;
  response_detail: string;
  responded_at: string | null;
  response_source: "correo" | "campus" | null;
  forwarded_at: string | null;
  forward_error: string;
  created_at: string;
  updated_at: string;
};

type Timestamps = "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Timestamps | "role" | "is_active" | "username">;
      students: Table<StudentRow, Timestamps | "level" | "skill_coins">;
      student_mentors: Table<StudentMentorRow, "assigned_at">;
      student_guardians: Table<StudentGuardianRow, "assigned_at" | "relationship">;
      kiru_app_records: Table<AppRecordRow, Timestamps | "id" | "data" | "created_by">;
      kiru_notices: Table<NoticeRow, Timestamps | "id" | "published_at" | "target_student_id" | "link_url" | "link_title" | "attachment_path">;
      kiru_documents: Table<DocumentRow, Timestamps | "id" | "document_type" | "target_student_id" | "file_size" | "requires_acceptance">;
      kiru_document_acceptances: Table<DocumentAcceptanceRow, "id" | "accepted_at">;
      kiru_payments: Table<PaymentRow, Timestamps | "id" | "due_date" | "status" | "payment_url" | "paid_at" | "external_reference" | "notes">;
      kiru_flashcard_sets: Table<FlashcardSetRow, Timestamps | "id" | "subject" | "source_file_name" | "source_storage_path" | "source_mime_type" | "source_size_bytes" | "generation_method" | "status">;
      kiru_flashcards: Table<FlashcardRow, Timestamps | "id" | "position">;
      kiru_coordinator_mentors: Table<CoordinatorMentorRow, "assigned_at">;
      kiru_session_logs: Table<SessionLogRow, Timestamps | "id" | "session_date" | "mentor_name" | "student_name" | "respondent_email" | "mentor_id" | "student_id" | "incident" | "answers">;
      kiru_incident_reviews: Table<IncidentReviewRow, "note" | "reviewed_by" | "reviewed_at">;
      kiru_mentor_onboarding: Table<MentorOnboardingRow, Timestamps | "id" | "phone" | "confidentiality_signed_at" | "confidentiality_checked_by" | "certificate_checked_at" | "certificate_checked_by" | "profile_id" | "notes" | "archived_at" | "created_by">;
      kiru_access_links: Table<AccessLinkRow, "id" | "used_at" | "created_at">;
      kiru_pin_requests: Table<PinRequestRow, "id" | "created_at" | "sent_at">;
      kiru_mentor_steps: Table<MentorStepRow, "document_path" | "submitted_at" | "reviewed_at" | "reviewed_by" | "review_note" | "updated_at">;
      kiru_assignment_offers: Table<AssignmentOfferRow, Timestamps | "id" | "mentor_id" | "course" | "student_profile" | "zone" | "intensity" | "slots" | "sent_at" | "response_links" | "response" | "response_detail" | "responded_at" | "response_source" | "forwarded_at" | "forward_error">;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
