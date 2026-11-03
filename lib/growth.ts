// «Reuniones con tu coordinador» y «Crece con Kiru»: textos, estados y tipos
// que comparten el panel del mentor, el del coordinador, administración y las
// rutas del servidor.

export const MEETING_DURATION_MINUTES = 30;
/** Formulario de Jotform «Registro de reunión de coordinación – Método Kiru». */
export const MEETING_REPORT_FORM_URL = "https://form.jotform.com/263053244292049";
/** Plazo para enviar el registro después de la reunión. */
export const MEETING_REPORT_HOURS = 24;

export const WEEK_DAYS = [
  { id: "lunes", label: "Lunes" },
  { id: "martes", label: "Martes" },
  { id: "miercoles", label: "Miércoles" },
  { id: "jueves", label: "Jueves" },
  { id: "viernes", label: "Viernes" },
  { id: "sabado", label: "Sábado" },
  { id: "domingo", label: "Domingo" },
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number]["id"];

export const DAY_SLOTS = [
  { id: "manana", label: "Mañana (9:00–14:00)" },
  { id: "mediodia", label: "Mediodía (14:00–17:00)" },
  { id: "tarde", label: "Tarde (17:00–19:30)" },
  { id: "noche", label: "Noche (19:30–21:30)" },
] as const;
export type DaySlot = (typeof DAY_SLOTS)[number]["id"];

export type Availability = { days: WeekDay[]; slots: DaySlot[]; notes: string; updatedAt: string | null };

export type MeetingStatus = "borrador" | "confirmada" | "realizada" | "cancelada";
export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  borrador: "Sin convocar",
  confirmada: "Convocada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

/** Lo que ve el mentor de una reunión de su grupo. */
export type MentorMeeting = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  coordinatorName: string;
  zoomUrl: string;
  status: Exclude<MeetingStatus, "borrador">;
  agenda: string;
  cancelReason: string;
};

export type MentorMeetingsData = {
  coordinatorName: string | null;
  /** Tiene alumnos activos: la reunión es obligatoria. */
  mandatory: boolean;
  availability: Availability;
  meetings: MentorMeeting[];
};

/** Reunión vista por su coordinador (o por administración). */
export type StaffMeeting = Omit<MentorMeeting, "status"> & {
  status: MeetingStatus;
  coordinatorId: string;
  reportSentAt: string | null;
  heldAt: string | null;
};

export type GroupMentor = {
  id: string;
  name: string;
  hasStudents: boolean;
  availability: Availability | null;
};

export type CoordinatorMeetingsData = {
  coordinators: { id: string; name: string; mentors: GroupMentor[]; emails: string[] }[];
  meetings: StaffMeeting[];
  canEdit: boolean;
};

// Oportunidades ---------------------------------------------------------------

export const OPPORTUNITY_AREAS = [
  { id: "coordinacion", label: "Coordinación" },
  { id: "formacion", label: "Formación de nuevos mentores" },
  { id: "metodologia", label: "Metodología e investigación" },
  { id: "operaciones", label: "Operaciones" },
  { id: "comunicacion", label: "Comunicación" },
  { id: "campus", label: "Desarrollo y gestión del Campus" },
] as const;
export type OpportunityArea = (typeof OPPORTUNITY_AREAS)[number]["id"];
export const AREA_LABEL = Object.fromEntries(OPPORTUNITY_AREAS.map((a) => [a.id, a.label])) as Record<OpportunityArea, string>;

export type OpportunityStatus = "borrador" | "publicada" | "cerrada" | "completada";
export const OPPORTUNITY_STATUS_LABEL: Record<OpportunityStatus, string> = {
  borrador: "Borrador (no se ve)",
  publicada: "Publicada",
  cerrada: "Cerrada",
  completada: "Completada",
};

export type ApplicationStatus = "enviada" | "en_revision" | "entrevista" | "aceptada" | "no_seleccionada";
export const APPLICATION_STATUSES: ApplicationStatus[] = ["enviada", "en_revision", "entrevista", "aceptada", "no_seleccionada"];
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  enviada: "Enviada",
  en_revision: "En revisión",
  entrevista: "Entrevista o conversación",
  aceptada: "Aceptada",
  no_seleccionada: "No seleccionada",
};

export type Opportunity = {
  id: string;
  title: string;
  area: OpportunityArea;
  description: string;
  functions: string;
  requirements: string;
  dedication: string;
  modality: string;
  /** Vacía salvo que administración la haya marcado como autorizada. */
  remuneration: string;
  positionsCount: number | null;
  deadline: string | null;
  status: OpportunityStatus;
  /** Publicada y dentro de plazo: se puede presentar candidatura. */
  open: boolean;
};

export type AdminOpportunity = Opportunity & {
  remunerationAuthorized: boolean;
  publishedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
};

export type MentorApplication = {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  motivation: string;
  status: ApplicationStatus;
  submittedAt: string;
  statusChangedAt: string;
};

export type MentorGrowthData = {
  opportunities: Opportunity[];
  applications: MentorApplication[];
};

/** Fecha de hoy en Madrid (AAAA-MM-DD), para comparar con la fecha límite. */
export function madridToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function isOpportunityOpen(status: OpportunityStatus, deadline: string | null): boolean {
  return status === "publicada" && (!deadline || deadline >= madridToday());
}

export function formatMeetingDate(iso: string): string {
  const text = new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function formatMeetingTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}
export function formatDay(value: string | null): string {
  if (!value) return "";
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
}

/** Texto de la convocatoria para copiar o mandar por correo (lo envía la persona). */
export function meetingInvitationText(meeting: { scheduledAt: string; durationMinutes: number; zoomUrl: string; coordinatorName: string; agenda: string }): string {
  return [
    "Reunión mensual de coordinación · Método Kiru",
    "",
    `Fecha: ${formatMeetingDate(meeting.scheduledAt)}`,
    `Hora: ${formatMeetingTime(meeting.scheduledAt)} (hora de España peninsular)`,
    `Duración: ${meeting.durationMinutes} minutos`,
    `Coordinador/a: ${meeting.coordinatorName}`,
    `Enlace de Zoom: ${meeting.zoomUrl}`,
    ...(meeting.agenda ? ["", `Temas previstos: ${meeting.agenda}`] : []),
    "",
    "La asistencia es obligatoria para los mentores con alumnos activos. Entra con la cámara encendida y trae tus avances, dificultades, buenas prácticas, dudas y propuestas.",
    "También la tienes en el campus: menú ☰ → Reuniones con tu coordinador.",
  ].join("\n");
}

/** ISO → «2026-11-20T17:00» en hora de Madrid, para un <input type="datetime-local">. */
export function isoToMadridLocal(iso: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Fin del plazo para enviar el registro: 24 h después de terminar la reunión. */
export function reportDeadline(meeting: { scheduledAt: string; durationMinutes: number }): Date {
  return new Date(new Date(meeting.scheduledAt).getTime() + (meeting.durationMinutes + MEETING_REPORT_HOURS * 60) * 60000);
}
