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
  /** Fuente única: pestaña «Familias» de Contabilidad. */
  service_status: "activo" | "en_pausa" | "baja";
  municipality: string;
  service_status_source: "inicial" | "familias";
  service_status_synced_at: string | null;
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
  renewal_id: string | null;
  coverage_start: string | null;
  coverage_end: string | null;
  days_per_week: number | null;
  sessions_included: number | null;
  reported_at: string | null;
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
  manual_status: "asignado" | "archivado" | null;
  manual_by: string | null;
  manual_at: string | null;
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
  student_label: string;
  mentor_name: string;
  mentor_phone: string;
  reminder_sent_at: string | null;
  call_requested_at: string | null;
  call_done_at: string | null;
  call_notes: string;
  decision: "seleccionado" | "sustituto" | "no_seleccionado" | null;
  decision_note: string;
  decided_at: string | null;
  decided_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AssignmentOfferEventRow = {
  id: string;
  offer_id: string;
  action:
    | "recibida" | "respuesta" | "recordatorio" | "llamada_solicitada" | "llamada_hecha"
    | "seleccionado" | "sustituto" | "no_seleccionado" | "decision_quitada" | "cerrada" | "reabierta";
  detail: string;
  actor_id: string | null;
  created_at: string;
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
  review_id?: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  recipient_id: string;
  student_id: string | null;
  goal_id: string | null;
  session_id: string | null;
  request_id: string | null;
  review_id: string | null;
  warning_id: string | null;
  kind: "objetivo_pendiente" | "objetivo_aprobado" | "objetivo_rechazado" | "canje_solicitado" | "canje_completado" | "canje_aplazado" | "renovacion" | "informe_progreso" | ClassNotificationKind | SupervisionNotificationKind;
  title: string;
  body: string;
  event_key: string;
  read_at: string | null;
  email_status: "no_aplica" | "pendiente" | "enviado" | "sin_correo";
  email_sent_at: string | null;
  created_at: string;
};

export type SupervisionNotificationKind =
  | "justificacion_solicitada" | "justificacion_respondida" | "justificacion_repregunta" | "justificacion_cerrada"
  | "justificacion_recordatorio" | "justificacion_por_valorar" | "aviso_metodologico" | "aviso_seguimiento";

// Supervisión metodológica (migración 20261109110000): solicitudes de justificación
// de una nota de SkillCoins, sus mensajes y evidencias, y avisos metodológicos.
export type SkillcoinCompetencia = "estudios" | "compromiso" | "organizacion" | "bienestar";
export type SkillcoinReviewStatus = "pendiente_respuesta" | "respondida" | "pendiente_valoracion" | "cerrada";
export type SkillcoinReviewResolution = "adecuada" | "insuficiente" | "necesita_formacion" | "retirada";

export type SkillcoinReviewRow = {
  id: string;
  student_id: string;
  mentor_id: string;
  session_log_id: string | null;
  week: string;
  competencia: SkillcoinCompetencia;
  score_snapshot: number;
  week_scores: Json;
  requested_by: string | null;
  requested_role: "coordinador" | "admin";
  reason_code: "maximo_repetido" | "sin_variacion" | "posible_contradiccion" | "maximo_sin_evolucion" | "otro";
  reason: string;
  question: string;
  due_date: string | null;
  status: SkillcoinReviewStatus;
  status_since: string;
  round: number;
  answered_at: string | null;
  assessment_started_at: string | null;
  assessment_started_by: string | null;
  resolution: SkillcoinReviewResolution | null;
  resolution_note: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SkillcoinReviewMessageRow = {
  id: string;
  review_id: string;
  round: number;
  author_id: string | null;
  author_role: "mentor" | "coordinador" | "admin";
  kind: "respuesta" | "repregunta";
  body: string;
  criteria: string;
  created_at: string;
};

export type SkillcoinReviewFileRow = {
  id: string;
  review_id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

export type MethodologyWarningRow = {
  id: string;
  mentor_id: string;
  review_id: string | null;
  competencia: SkillcoinCompetencia | "general";
  origin: "insuficiente" | "necesita_formacion" | "manual";
  level: 1 | 2 | 3;
  counted_warning_ids: string[];
  criterion: string;
  expected_improvements: string;
  manual_reference: string;
  recommended_action: string;
  status: "pendiente" | "en_revision" | "resuelto";
  meeting_at: string | null;
  meeting_done_at: string | null;
  meeting_note: string;
  assessment_kind: "prueba_conocimientos" | "evaluacion_practica" | null;
  assessment_requested_at: string | null;
  assessment_result: string;
  reinforcement_measures: string;
  assessment_recorded_at: string | null;
  improvement_at: string | null;
  improvement_note: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Historial de supervisión (solo coordinación y administración lo leen). */
export type SupervisionEventRow = {
  id: string;
  review_id: string | null;
  warning_id: string | null;
  mentor_id: string;
  actor_id: string | null;
  action: string;
  detail: Json;
  created_at: string;
};

/** Solo se escriben con funciones (RLS sin INSERT/UPDATE/DELETE): estos tipos son de lectura. */
type ReadOnlyTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };

export type ClassNotificationKind =
  | "clase_solicitud" | "clase_decision" | "clase_mas_info" | "recuperacion_propuesta" | "recuperacion_confirmada"
  | "recuperacion_sin_encaje" | "recuperacion_nueva" | "recuperacion_sin_avanzar" | "recuperacion_recordatorio"
  | "recuperacion_fin_periodo" | "registro_aviso" | "clase_incidencia";

export type ClassDelivery = "programada" | "impartida" | "no_impartida" | "anulada";
export type ClassConsumption = "pendiente" | "consumida" | "conservada" | "no_aplica";
export type ClassRecovery = "ninguna" | "pendiente" | "propuesta" | "sin_encaje" | "programada" | "realizada" | "rechazada";
export type ClassCancelCause =
  | "familia_menos_48h" | "familia_con_aviso" | "no_presentado" | "mentor" | "excepcion"
  | "dia_sin_clase_kiru" | "pausa_servicio" | "cambio_horario" | "historico_sin_clasificar";

export type ClassSessionRow = {
  id: string;
  student_id: string;
  mentor_id: string;
  slot_id: string | null;
  kind: "regular" | "recuperacion";
  recovers_session_id: string | null;
  original_start: string;
  scheduled_start: string;
  scheduled_end: string;
  delivery: ClassDelivery;
  consumption: ClassConsumption;
  recovery: ClassRecovery;
  cancel_cause: ClassCancelCause | null;
  cancel_note: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  recovery_exception_note: string;
  recovery_exception_by: string | null;
  recovery_exception_at: string | null;
  recovery_status_since: string;
  session_log_id: string | null;
  delivered_by: string | null;
  source: "horario" | "recuperacion" | "historico" | "coordinacion";
  created_at: string;
  updated_at: string;
};

export type ClassOption = { start: string; end: string };

export type ClassRequestRow = {
  id: string;
  session_id: string | null;
  session_log_id: string | null;
  mentor_id: string;
  student_id: string | null;
  kind: "cambio" | "cancelacion" | "propuesta_recuperacion" | "aviso_registro";
  requested_by: string;
  requester_role: "mentor" | "padre" | "coordinador" | "admin";
  reason: string;
  reason_code: "cambio_acordado" | "recuperacion" | "sustitucion" | "error_registro" | "otro" | null;
  details: string;
  preferences: string;
  options: Json;
  hours_notice: number | null;
  late: boolean;
  status: "pendiente" | "mas_info" | "contrapropuesta" | "aprobada" | "rechazada" | "retirada" | "elegida" | "sin_encaje" | "gestionado" | "sustituida";
  chosen_option: Json | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string;
  reply: string;
  incident: "ninguna" | "potencial" | "abierta" | "justificada" | "no_justificada" | "mas_info";
  incident_note: string;
  incident_reviewed_by: string | null;
  incident_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassEventRow = {
  id: number;
  session_id: string | null;
  request_id: string | null;
  actor_id: string | null;
  action: string;
  detail: Json;
  created_at: string;
};

export type NoClassDayRow = {
  id: string;
  day: string;
  reason: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
  updated_at: string;
};

export type SheetOutboxRow = {
  id: number;
  target: "sin_clase" | "recuperaciones";
  row_key: string;
  payload: Json;
  status: "pendiente" | "enviado" | "error";
  attempts: number;
  last_error: string;
  claimed_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PeriodSessionSummaryRow = {
  payment_id: string;
  student_id: string;
  coverage_start: string;
  coverage_end: string;
  payment_status: string;
  sessions_included: number | null;
  sessions_consumed: number;
  sessions_delivered: number;
  sessions_cancelled_consumed: number;
  recoveries_open: number;
  sessions_scheduled: number;
};

export type FamilyClassRow = Pick<ClassSessionRow, "id" | "student_id" | "kind" | "recovers_session_id" | "original_start" | "scheduled_start" | "scheduled_end" | "delivery" | "consumption" | "recovery" | "cancel_cause" | "recovery_status_since"> & {
  mentor_name: string;
  delivered_by_name: string;
  rescheduled: boolean;
};

export type FamilyClassRequestRow = Pick<ClassRequestRow, "id" | "session_id" | "student_id" | "kind" | "requester_role" | "reason" | "preferences" | "options" | "hours_notice" | "late" | "status" | "chosen_option" | "decision_note" | "reply" | "decided_at" | "created_at"> & {
  requested_by_me: boolean;
};

export type UnlinkedSessionLogRow = {
  id: string;
  session_date: string;
  student_id: string;
  mentor_id: string | null;
  mentor_name: string;
  student_name: string;
  submitted_at: string;
  probable_duplicate: boolean;
};

/** Opción de pago por adelantado (precio total de varios meses con descuento). */
export type PrepayOption = { meses: number; total: number; ahorro: number; pct: number };

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
  months: number;
  prepay: { mantener?: PrepayOption[]; subir?: PrepayOption[] };
  paid_reported_at: string | null;
  paid_source: "correo" | "campus" | null;
  paid_by: string | null;
  closed_at: string | null;
  campus_seq: number;
  sheet_seq: number;
  created_at: string;
  updated_at: string;
};

/** Autorización expresa de administración para acceder sin incorporación completa. */
export type OnboardingExceptionRow = {
  id: string; mentor_id: string; reason: string; granted_by: string | null; granted_at: string;
  revoked_at: string | null; revoked_by: string | null; revoke_reason: string;
};
export type MentorAvailabilityRow = { mentor_id: string; days: string[]; slots: string[]; notes: string; updated_at: string };
export type CoordinationMeetingRow = {
  id: string; coordinator_id: string; scheduled_at: string; duration_minutes: number; zoom_url: string;
  status: "borrador" | "confirmada" | "realizada" | "cancelada"; agenda: string;
  confirmed_at: string | null; held_at: string | null; cancelled_at: string | null; cancel_reason: string;
  report_sent_at: string | null; created_by: string | null; created_at: string; updated_at: string;
};
export type OpportunityRow = {
  id: string; title: string; area: string; description: string; functions: string; requirements: string;
  dedication: string; modality: string; remuneration: string; remuneration_authorized: boolean; positions_count: number | null; deadline: string | null;
  status: "borrador" | "publicada" | "cerrada" | "completada"; published_at: string | null; closed_at: string | null;
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
};
export type OpportunityApplicationRow = {
  id: string; opportunity_id: string; mentor_id: string; motivation: string;
  status: "enviada" | "en_revision" | "entrevista" | "aceptada" | "no_seleccionada";
  submitted_at: string; status_changed_at: string; status_changed_by: string | null;
};
export type OpportunityRecommendationRow = { id: string; opportunity_id: string; mentor_id: string; coordinator_id: string; note: string; created_at: string };

export type FamilyProgressReportRow = {
  id: string; student_id: string; period_start: string; period_end: string; due_date: string;
  status: "borrador" | "publicado"; content: Json; created_by: string; updated_by: string;
  published_by: string | null; published_at: string | null; created_at: string; updated_at: string;
};

type Timestamps = "created_at" | "updated_at";

/** Una semana terminada en la que un alumno tuvo clase con un mentor y no tiene SkillCoins. */
export type MissingScWeekRow = {
  week: string; student_id: string; student_name: string; mentor_id: string | null; mentor_name: string;
  sessions: number; session_dates: string[]; respondent_email: string | null;
};

export type SessionScheduleMismatchRow = {
  session_date: string;
  student_id: string;
  student_name: string;
  mentor_id: string;
  mentor_name: string;
  session_weekday: number;
  scheduled_weekdays: number[];
};

export type FamilySessionHistoryRow = {
  id: string;
  student_id: string;
  session_date: string | null;
  mentor_name: string;
  topic: string;
};

export type ScheduleSlotRow = {
  id: string;
  student_id: string;
  mentor_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  time_zone: string;
  is_active: boolean;
  source: "campus" | "sheet_import";
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Timestamps | "role" | "is_active" | "username">;
      students: Table<StudentRow, Timestamps | "level" | "skill_coins" | "service_status" | "municipality" | "service_status_source" | "service_status_synced_at">;
      student_mentors: Table<StudentMentorRow, "assigned_at">;
      student_guardians: Table<StudentGuardianRow, "assigned_at" | "relationship">;
      kiru_app_records: Table<AppRecordRow, Timestamps | "id" | "data" | "created_by">;
      kiru_notices: Table<NoticeRow, Timestamps | "id" | "published_at" | "target_student_id" | "link_url" | "link_title" | "attachment_path">;
      kiru_documents: Table<DocumentRow, Timestamps | "id" | "document_type" | "target_student_id" | "file_size" | "requires_acceptance">;
      kiru_document_acceptances: Table<DocumentAcceptanceRow, "id" | "accepted_at">;
      kiru_payments: Table<PaymentRow, Timestamps | "id" | "due_date" | "status" | "payment_url" | "paid_at" | "external_reference" | "notes" | "renewal_id" | "coverage_start" | "coverage_end" | "days_per_week" | "sessions_included" | "reported_at">;
      kiru_flashcard_sets: Table<FlashcardSetRow, Timestamps | "id" | "subject" | "source_file_name" | "source_storage_path" | "source_mime_type" | "source_size_bytes" | "generation_method" | "status">;
      kiru_flashcards: Table<FlashcardRow, Timestamps | "id" | "position">;
      kiru_coordinator_mentors: Table<CoordinatorMentorRow, "assigned_at">;
      kiru_student_schedule_slots: Table<ScheduleSlotRow, "id" | "time_zone" | "is_active" | "source" | "created_at" | "updated_at">;
      kiru_session_logs: Table<SessionLogRow, Timestamps | "id" | "session_date" | "mentor_name" | "student_name" | "respondent_email" | "mentor_id" | "student_id" | "incident" | "answers" | "manual_status" | "manual_by" | "manual_at">;
      kiru_incident_reviews: Table<IncidentReviewRow, "note" | "reviewed_by" | "reviewed_at">;
      kiru_mentor_onboarding: Table<MentorOnboardingRow, Timestamps | "id" | "phone" | "confidentiality_signed_at" | "confidentiality_checked_by" | "certificate_checked_at" | "certificate_checked_by" | "profile_id" | "notes" | "archived_at" | "created_by">;
      kiru_access_links: Table<AccessLinkRow, "id" | "used_at" | "created_at">;
      kiru_pin_requests: Table<PinRequestRow, "id" | "created_at" | "sent_at">;
      kiru_mentor_steps: Table<MentorStepRow, "document_path" | "holder_name" | "submitted_at" | "reviewed_at" | "reviewed_by" | "review_note" | "updated_at">;
      kiru_rewards: Table<RewardRow, Timestamps | "category_order" | "sort_order" | "is_active">;
      kiru_reward_goals: Table<RewardGoalRow, Timestamps | "id" | "status" | "replaces_goal_id" | "family_note" | "requested_at" | "decided_at" | "decided_by" | "redeem_round" | "redeem_requested_at" | "completed_at" | "completed_by" | "closed_at">;
      kiru_skillcoin_movements: Table<SkillcoinMovementRow, "id" | "goal_id" | "created_by" | "created_at">;
      kiru_skillcoin_corrections: Table<SkillcoinCorrectionRow, "id" | "previous" | "reason" | "corrected_by" | "created_at">;
      kiru_notifications: Table<NotificationRow, "id" | "student_id" | "goal_id" | "review_id" | "warning_id" | "body" | "read_at" | "email_status" | "email_sent_at" | "created_at">;
      kiru_family_progress_reports: Table<FamilyProgressReportRow, "id" | "status" | "content" | "published_by" | "published_at" | "created_at" | "updated_at">;
      kiru_renewals: Table<RenewalRow, Timestamps | "id" | "mentor_name" | "up_label" | "up_price" | "payment_info" | "call_url" | "plan" | "plan_source" | "plan_at" | "plan_by" | "months" | "prepay" | "paid_reported_at" | "paid_source" | "paid_by" | "closed_at" | "campus_seq" | "sheet_seq">;
      kiru_assignment_offers: Table<AssignmentOfferRow, Timestamps | "id" | "mentor_id" | "course" | "student_profile" | "zone" | "intensity" | "slots" | "sent_at" | "response_links" | "response" | "response_detail" | "responded_at" | "response_source" | "forwarded_at" | "forward_error" | "student_label" | "mentor_name" | "mentor_phone" | "reminder_sent_at" | "call_requested_at" | "call_done_at" | "call_notes" | "decision" | "decision_note" | "decided_at" | "decided_by" | "closed_at">;
      kiru_assignment_offer_events: Table<AssignmentOfferEventRow, "id" | "detail" | "actor_id" | "created_at">;
      kiru_onboarding_exceptions: Table<OnboardingExceptionRow, "id" | "granted_by" | "granted_at" | "revoked_at" | "revoked_by" | "revoke_reason">;
      kiru_mentor_availability: Table<MentorAvailabilityRow, "days" | "slots" | "notes" | "updated_at">;
      kiru_coordination_meetings: Table<CoordinationMeetingRow, Timestamps | "id" | "duration_minutes" | "zoom_url" | "status" | "agenda" | "confirmed_at" | "held_at" | "cancelled_at" | "cancel_reason" | "report_sent_at" | "created_by">;
      kiru_opportunities: Table<OpportunityRow, Timestamps | "id" | "description" | "functions" | "requirements" | "dedication" | "modality" | "remuneration" | "remuneration_authorized" | "positions_count" | "deadline" | "status" | "published_at" | "closed_at" | "created_by" | "updated_by">;
      kiru_opportunity_applications: Table<OpportunityApplicationRow, "id" | "motivation" | "status" | "submitted_at" | "status_changed_at" | "status_changed_by">;
      kiru_opportunity_recommendations: Table<OpportunityRecommendationRow, "id" | "created_at">;
      kiru_class_sessions: Table<ClassSessionRow, Timestamps | "id" | "slot_id" | "kind" | "recovers_session_id" | "delivery" | "consumption" | "recovery" | "cancel_cause" | "cancel_note" | "cancelled_at" | "cancelled_by" | "recovery_exception_note" | "recovery_exception_by" | "recovery_exception_at" | "recovery_status_since" | "session_log_id" | "delivered_by" | "source">;
      kiru_class_requests: Table<ClassRequestRow, Timestamps | "id" | "session_id" | "session_log_id" | "student_id" | "reason" | "reason_code" | "details" | "preferences" | "options" | "hours_notice" | "late" | "status" | "chosen_option" | "decided_by" | "decided_at" | "decision_note" | "reply" | "incident" | "incident_note" | "incident_reviewed_by" | "incident_reviewed_at">;
      kiru_class_events: Table<ClassEventRow, "id" | "session_id" | "request_id" | "actor_id" | "detail" | "created_at">;
      kiru_no_class_days: Table<NoClassDayRow, Timestamps | "id" | "is_active" | "created_by" | "cancelled_by" | "cancelled_at">;
      kiru_skillcoin_reviews: ReadOnlyTable<SkillcoinReviewRow>;
      kiru_skillcoin_review_messages: ReadOnlyTable<SkillcoinReviewMessageRow>;
      kiru_skillcoin_review_files: ReadOnlyTable<SkillcoinReviewFileRow>;
      kiru_methodology_warnings: ReadOnlyTable<MethodologyWarningRow>;
      kiru_supervision_events: ReadOnlyTable<SupervisionEventRow>;
      kiru_sheet_outbox: Table<SheetOutboxRow, Timestamps | "id" | "status" | "attempts" | "last_error" | "claimed_at" | "sent_at">;
    };
    Views: {
      kiru_family_session_history: { Row: FamilySessionHistoryRow; Relationships: [] };
      kiru_period_session_summary: { Row: PeriodSessionSummaryRow; Relationships: [] };
      kiru_family_classes: { Row: FamilyClassRow; Relationships: [] };
      kiru_family_class_requests: { Row: FamilyClassRequestRow; Relationships: [] };
      kiru_unlinked_session_logs: { Row: UnlinkedSessionLogRow; Relationships: [] };
    };
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
      kiru_renewal_choose_months: { Args: { p_id: string; p_plan: string; p_months: number }; Returns: Json };
      kiru_renewal_report_paid: { Args: { p_id: string }; Returns: Json };
      kiru_renewal_publish: { Args: { p_data: Json }; Returns: Json };
      kiru_renewal_from_email: { Args: { p_email: string; p_student: string; p_period_end: string; p_action: string }; Returns: Json };
      kiru_renewal_from_email_months: { Args: { p_email: string; p_student: string; p_period_end: string; p_action: string; p_months: number }; Returns: Json };
      kiru_renewal_sync: { Args: { p_families: Json }; Returns: Json };
      kiru_renewal_ack: { Args: { p_items: Json }; Returns: number };
      kiru_mentor_growth_access: { Args: { p_mentor: string }; Returns: { onboarding_complete: boolean; exception_active: boolean }[] };
      kiru_missing_sc_weeks: {
        Args: { p_weeks?: number };
        Returns: MissingScWeekRow[];
      };
      kiru_session_schedule_mismatches: {
        Args: { p_days?: number };
        Returns: SessionScheduleMismatchRow[];
      };
    } & ClassFunctions & SupervisionFunctions;
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Funciones de clases con fecha (todas reciben p_actor: quien actúa, comprobado en el servidor). */
type ClassFunctions = {
  kiru_clases_generar: { Args: { p_from?: string; p_until?: string }; Returns: Json };
  kiru_clases_solicitar: { Args: { p_actor: string; p_session: string; p_kind: string; p_reason: string; p_options?: Json; p_details?: string; p_preferences?: string }; Returns: Json };
  kiru_clases_decidir: { Args: { p_actor: string; p_request: string; p_decision: string; p_note?: string; p_option?: number; p_options?: Json }; Returns: Json };
  kiru_clases_responder: { Args: { p_actor: string; p_request: string; p_action: string; p_reply?: string; p_option?: number }; Returns: Json };
  kiru_recuperaciones_proponer: { Args: { p_actor: string; p_session: string; p_options: Json; p_note?: string }; Returns: Json };
  kiru_recuperaciones_elegir: { Args: { p_actor: string; p_request: string; p_option: number | null; p_note?: string }; Returns: Json };
  kiru_recuperaciones_gestionar: { Args: { p_actor: string; p_session: string; p_action: string; p_note?: string }; Returns: Json };
  kiru_clases_registrar_cancelacion: { Args: { p_actor: string; p_session: string; p_cause: string; p_note: string }; Returns: Json };
  kiru_registros_avisar: { Args: { p_actor: string; p_log: string; p_reason_code: string; p_reason?: string }; Returns: Json };
  kiru_registros_gestionar_aviso: { Args: { p_actor: string; p_request: string; p_action: string; p_note?: string; p_session?: string }; Returns: Json };
  kiru_registros_responder_aviso: { Args: { p_actor: string; p_request: string; p_reply: string }; Returns: Json };
  kiru_incidencias_revisar: { Args: { p_actor: string; p_request: string; p_verdict: string; p_note?: string }; Returns: Json };
  kiru_dias_sin_clase_guardar: { Args: { p_actor: string; p_day: string; p_reason: string; p_active?: boolean }; Returns: Json };
  kiru_familias_estado: { Args: { p_rows: Json }; Returns: Json };
  kiru_clases_tarea_diaria: { Args: Record<string, never>; Returns: Json };
  kiru_sesiones_previstas: { Args: { p_student: string; p_from: string; p_until: string }; Returns: Json };
};

/** Funciones de supervisión metodológica (comprueban en la base quién llama). */
type SupervisionFunctions = {
  kiru_supervision_evaluations: { Args: { p_since?: string }; Returns: Json };
  kiru_request_sc_review: { Args: { p_log: string; p_competencia: string; p_reason_code: string; p_reason: string; p_question: string; p_due_date?: string | null }; Returns: string };
  kiru_answer_sc_review: { Args: { p_review: string; p_body: string; p_criteria?: string }; Returns: string };
  kiru_sc_review_add_file: { Args: { p_message: string; p_path: string; p_name: string; p_mime: string; p_size: number }; Returns: string };
  kiru_sc_review_start_assessment: { Args: { p_review: string }; Returns: undefined };
  kiru_sc_review_ask_more: { Args: { p_review: string; p_body: string }; Returns: string };
  kiru_resolve_sc_review: {
    Args: { p_review: string; p_resolution: string; p_note?: string; p_criterion?: string; p_improvements?: string; p_manual_reference?: string; p_recommended?: string };
    Returns: Json;
  };
  kiru_methodology_warning_next_level: { Args: { p_mentor: string; p_competencia: string }; Returns: Json };
  kiru_methodology_warning_create: {
    Args: { p_mentor: string; p_competencia: string; p_criterion: string; p_improvements?: string; p_manual_reference?: string; p_recommended?: string };
    Returns: string;
  };
  kiru_methodology_warning_update: { Args: { p_warning: string; p_action: string; p_payload?: Json }; Returns: undefined };
  kiru_sc_review_correct: { Args: { p_review: string; p_new_score: number; p_reason: string }; Returns: undefined };
  kiru_supervision_tarea_diaria: { Args: Record<string, never>; Returns: Json };
};
