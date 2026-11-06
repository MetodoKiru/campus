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

/**
 * Cuadrícula de disponibilidad: casillas de 30 minutos, de lunes a domingo,
 * de 08:00 a 22:00 (hora de España peninsular). Cada casilla es «día-HH:MM»
 * (la hora de inicio), p. ej. «jueves-18:30».
 */
export const GRID_TIMES: string[] = Array.from({ length: 28 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 ? "30" : "00"}`;
});
export const cellId = (day: WeekDay, time: string) => `${day}-${time}`;
export const ALL_CELLS = new Set(WEEK_DAYS.flatMap((d) => GRID_TIMES.map((t) => cellId(d.id, t))));
export function parseCell(cell: string): { day: WeekDay; time: string } {
  const [day, time] = cell.split("-");
  return { day: day as WeekDay, time };
}
export function cellLabel(cell: string): string {
  const { day, time } = parseCell(cell);
  const label = WEEK_DAYS.find((d) => d.id === day)?.label ?? day;
  const [h, m] = time.split(":").map(Number);
  const end = h * 60 + m + 30;
  return `${label} ${time}–${String(Math.floor(end / 60)).padStart(2, "0")}:${end % 60 ? "30" : "00"}`;
}
/** Horas de disponibilidad que suman las casillas marcadas («3 h 30 min»). */
export function cellsDuration(count: number): string {
  const hours = Math.floor(count / 2);
  if (!count) return "0 h";
  return count % 2 ? (hours ? `${hours} h 30 min` : "30 min") : `${hours} h`;
}

export type Availability = {
  /** Casillas de 30 minutos marcadas. */
  cells: string[];
  notes: string;
  updatedAt: string | null;
  firstSavedAt: string | null;
  /** Preferencias antiguas (días y franjas amplias), solo como referencia. */
  days: WeekDay[];
  slots: DaySlot[];
};

/** Petición del coordinador a su grupo para revisar la disponibilidad. */
export type AvailabilityRequest = { id: string; message: string; deadline: string; createdAt: string };

/** Hoy en Madrid ≤ fecha límite (AAAA-MM-DD). */
export function deadlineOpen(deadline: string): boolean {
  return deadline >= madridToday();
}

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
  /** Última petición de su coordinador para revisar la disponibilidad. */
  request: (AvailabilityRequest & { respondedAt: string | null }) | null;
  meetings: MentorMeeting[];
};

/** Reunión vista por su coordinador (o por administración). */
export type StaffMeeting = Omit<MentorMeeting, "status"> & {
  status: MeetingStatus;
  coordinatorId: string;
  reportSentAt: string | null;
  heldAt: string | null;
  /** Enlace de Drive de la grabación: solo lo ven su coordinador y administración. */
  recordingUrl: string;
  recordingRegisteredAt: string | null;
};

export type GroupMentor = {
  id: string;
  name: string;
  hasStudents: boolean;
  availability: Availability | null;
  /** Cuándo respondió a cada petición del coordinador (id → fecha). */
  responses: Record<string, string>;
};

export type CoordinatorMeetingsData = {
  coordinators: {
    id: string;
    name: string;
    mentors: GroupMentor[];
    emails: string[];
    /** La cuadrícula del propio coordinador. */
    availability: Availability | null;
    requests: AvailabilityRequest[];
  }[];
  meetings: StaffMeeting[];
  canEdit: boolean;
};

export type SlotMatch = {
  cell: string;
  available: GroupMentor[];
  missing: GroupMentor[];
  /** Mentores con alumnos activos que pueden (asistencia obligatoria). */
  mandatoryAvailable: number;
  percent: number;
};

/**
 * Cruza la cuadrícula del coordinador con la de su grupo. Si el coordinador
 * no ha marcado nada, se cruzan solo las de los mentores. Ordena de más a
 * menos mentores disponibles (y, a igualdad, por obligatorios y por orden de
 * la semana). No elige nada: decide el coordinador.
 */
export function rankSlots(mentors: GroupMentor[], coordinatorCells: string[]): SlotMatch[] {
  const base = coordinatorCells.length ? coordinatorCells : [...ALL_CELLS];
  const order = new Map([...ALL_CELLS].map((c, i) => [c, i]));
  const sets = mentors.map((m) => ({ mentor: m, cells: new Set(m.availability?.cells ?? []) }));
  return base
    .filter((cell) => ALL_CELLS.has(cell))
    .map((cell) => {
      const available = sets.filter((s) => s.cells.has(cell)).map((s) => s.mentor);
      return {
        cell,
        available,
        missing: sets.filter((s) => !s.cells.has(cell)).map((s) => s.mentor),
        mandatoryAvailable: available.filter((m) => m.hasStudents).length,
        percent: mentors.length ? Math.round((available.length / mentors.length) * 100) : 0,
      };
    })
    .filter((match) => match.available.length > 0)
    .sort((a, b) => b.available.length - a.available.length || b.mandatoryAvailable - a.mandatoryAvailable || (order.get(a.cell)! - order.get(b.cell)!));
}

/** Próxima fecha (a partir de mañana) de una casilla, como «AAAA-MM-DDTHH:mm» de Madrid. */
export function nextDateForCell(cell: string): string {
  const { day, time } = parseCell(cell);
  const target = WEEK_DAYS.findIndex((d) => d.id === day); // 0 = lunes
  const today = madridToday();
  const base = new Date(`${today}T12:00:00Z`);
  const todayIndex = (base.getUTCDay() + 6) % 7;
  let add = (target - todayIndex + 7) % 7;
  if (add === 0) add = 7;
  const date = new Date(base.getTime() + add * 86400000).toISOString().slice(0, 10);
  return `${date}T${time}`;
}

/** Aviso que pidió dirección, tal cual. */
export const ZOOM_RECORDING_WARNING = "IMPORTANTE: realiza la reunión desde la aplicación de escritorio de Zoom y activa la grabación. Al finalizar, comprueba que se ha guardado correctamente y compártela con Método Kiru.";
/** Carpeta de Google Drive de Método Kiru para las grabaciones (acceso restringido). */
export const RECORDINGS_FOLDER_URL = "https://drive.google.com/drive/folders/1ptN981IWOYSTOIP3ZMOX7FplMewQZGZG";

/** «AAAAMMDDTHHMMSSZ» para los enlaces de Google Calendar. */
function calendarStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Enlace gratuito de Google Calendar con el evento ya rellenado y los mentores
 * como invitados: al guardarlo, Google les manda la invitación por correo y
 * se les añade a su calendario. No necesita ninguna API.
 */
export function googleCalendarUrl(meeting: { scheduledAt: string; durationMinutes: number; zoomUrl: string; coordinatorName: string; agenda: string }, guests: string[]): string {
  const start = new Date(meeting.scheduledAt);
  const end = new Date(start.getTime() + meeting.durationMinutes * 60000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "Reunión mensual de coordinación · Método Kiru",
    dates: `${calendarStamp(start)}/${calendarStamp(end)}`,
    details: meetingInvitationText(meeting),
    location: meeting.zoomUrl,
    ctz: "Europe/Madrid",
  });
  if (guests.length) params.set("add", guests.join(","));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

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
