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
  holder_name: string;
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

export type RewardRow = {
  id: string;
  name: string;
  category: string;
  category_order: number;
  cost: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RewardGoalStatus = "pendiente" | "aprobado" | "rechazado" | "canje_solicitado" | "completado" | "cancelado" | "sustituido";

export type RewardGoalRow = {
  id: string;
  student_id: string;
  reward_id: string;
  reward_name: string;
  reward_category: string;
  cost: number;
  status: RewardGoalStatus;
  replaces_goal_id: string | null;
  family_note: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  redeem_round: number;
  redeem_requested_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SkillcoinMovementRow = {
  id: string;
  student_id: string;
  amount: number;
  reason: string;
  goal_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type SkillcoinCorrectionRow = {
  id: string;
  student_id: string;
  week: string;
  estudios: number;
  compromiso: number;
  organizacion: number;
  bienestar: number;
  previous: Json | null;
  reason: string;
  corrected_by: string | null;
  corrected_role: "mentor" | "admin";
  created_at: string;
};

export type NotificationRow = {
  id: string;
  recipient_id: string;
  student_id: string | null;
  goal_id: string | null;
  kind: "objetivo_pendiente" | "objetivo_aprobado" | "objetivo_rechazado" | "canje_solicitado" | "canje_completado" | "canje_aplazado" | "renovacion";
  title: string;
  body: string;
  event_key: string;
  read_at: string | null;
  email_status: "no_aplica" | "pendiente" | "enviado" | "sin_correo";
  email_sent_at: string | null;
  created_at: string;
};

export type RenewalRow = {
  id: string;
  student_id: string;
  period_end: string;
  sheet_student: string;
  guardian_email: string;
  mentor_name: string;
  keep_label: string;
  keep_price: number;
  up_label: string | null;
  up_price: number | null;
  payment_info: string;
  call_url: string;
  plan: "mantener" | "subir" | "no_renueva" | null;
  plan_source: "correo" | "campus" | null;
  plan_at: string | null;
  plan_by: string | null;
  paid_reported_at: string | null;
  paid_source: "correo" | "campus" | null;
  paid_by: string | null;
  closed_at: string | null;
  campus_seq: number;
  sheet_seq: number;
  created_at: string;
  updated_at: string;
};

type Timestamps = "created_at" | "updated_at";

/** Una semana terminada en la que un alumno tuvo clase con un mentor y no tiene SkillCoins. */
export type MissingScWeekRow = {
  week: string; student_id: string; student_name: string; mentor_id: string | null; mentor_name: string;
  sessions: number; session_dates: string[]; respondent_email: string | null;
};

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
      kiru_mentor_steps: Table<MentorStepRow, "document_path" | "holder_name" | "submitted_at" | "reviewed_at" | "reviewed_by" | "review_note" | "updated_at">;
      kiru_rewards: Table<RewardRow, Timestamps | "category_order" | "sort_order" | "is_active">;
      kiru_reward_goals: Table<RewardGoalRow, Timestamps | "id" | "status" | "replaces_goal_id" | "family_note" | "requested_at" | "decided_at" | "decided_by" | "redeem_round" | "redeem_requested_at" | "completed_at" | "completed_by" | "closed_at">;
      kiru_skillcoin_movements: Table<SkillcoinMovementRow, "id" | "goal_id" | "created_by" | "created_at">;
      kiru_skillcoin_corrections: Table<SkillcoinCorrectionRow, "id" | "previous" | "reason" | "corrected_by" | "created_at">;
      kiru_notifications: Table<NotificationRow, "id" | "student_id" | "goal_id" | "body" | "read_at" | "email_status" | "email_sent_at" | "created_at">;
      kiru_renewals: Table<RenewalRow, Timestamps | "id" | "mentor_name" | "up_label" | "up_price" | "payment_info" | "call_url" | "plan" | "plan_source" | "plan_at" | "plan_by" | "paid_reported_at" | "paid_source" | "paid_by" | "closed_at" | "campus_seq" | "sheet_seq">;
      kiru_assignment_offers: Table<AssignmentOfferRow, Timestamps | "id" | "mentor_id" | "course" | "student_profile" | "zone" | "intensity" | "slots" | "sent_at" | "response_links" | "response" | "response_detail" | "responded_at" | "response_source" | "forwarded_at" | "forward_error">;
    };
    Views: { [_ in never]: never };
    Functions: {
      kiru_skillcoin_summary: { Args: { p_student: string }; Returns: Json };
      kiru_skillcoin_correct_week: {
        Args: { p_student: string; p_week: string; p_estudios: number; p_compromiso: number; p_organizacion: number; p_bienestar: number; p_reason?: string };
        Returns: Json;
      };
      kiru_skillcoin_refresh: { Args: { p_student: string }; Returns: undefined };
      kiru_reward_choose: { Args: { p_reward_id: string }; Returns: string };
      kiru_reward_cancel: { Args: { p_goal: string }; Returns: undefined };
      kiru_reward_request_redeem: { Args: { p_goal: string }; Returns: undefined };
      kiru_reward_decide: { Args: { p_goal: string; p_approve: boolean; p_note?: string }; Returns: undefined };
      kiru_reward_resolve_redeem: { Args: { p_goal: string; p_confirm: boolean; p_note?: string }; Returns: undefined };
      kiru_notifications_mark_read: { Args: { p_ids?: string[] }; Returns: undefined };
      kiru_renewal_choose: { Args: { p_id: string; p_plan: string }; Returns: Json };
      kiru_renewal_report_paid: { Args: { p_id: string }; Returns: Json };
      kiru_renewal_publish: { Args: { p_data: Json }; Returns: Json };
      kiru_renewal_from_email: { Args: { p_email: string; p_student: string; p_period_end: string; p_action: string }; Returns: Json };
      kiru_renewal_sync: { Args: { p_families: Json }; Returns: Json };
      kiru_renewal_ack: { Args: { p_items: Json }; Returns: number };
      kiru_missing_sc_weeks: {
        Args: { p_weeks?: number };
        Returns: MissingScWeekRow[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
