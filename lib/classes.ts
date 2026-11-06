import type {
  ClassCancelCause, ClassConsumption, ClassDelivery, ClassOption, ClassRecovery, ClassRequestRow,
} from "@/lib/database.types";

/** Clase tal como la ven mentor, coordinación y administración. */
export type StaffClass = {
  id: string;
  studentId: string;
  studentName: string;
  mentorId: string;
  mentorName: string;
  kind: "regular" | "recuperacion";
  recoversSessionId: string | null;
  originalStart: string;
  scheduledStart: string;
  scheduledEnd: string;
  delivery: ClassDelivery;
  consumption: ClassConsumption;
  recovery: ClassRecovery;
  cancelCause: ClassCancelCause | null;
  cancelNote: string;
  recoveryStatusSince: string;
  recoveryExceptionNote: string;
  deliveredById: string | null;
  deliveredByName: string;
};

export type StaffRequest = {
  id: string;
  sessionId: string | null;
  sessionLogId: string | null;
  mentorId: string;
  studentId: string | null;
  kind: ClassRequestRow["kind"];
  requesterRole: ClassRequestRow["requester_role"];
  requestedByName: string;
  reason: string;
  reasonCode: ClassRequestRow["reason_code"];
  details: string;
  preferences: string;
  options: ClassOption[];
  hoursNotice: number | null;
  late: boolean;
  status: ClassRequestRow["status"];
  chosenOption: ClassOption | null;
  decisionNote: string;
  reply: string;
  incident: ClassRequestRow["incident"];
  incidentNote: string;
  createdAt: string;
  decidedAt: string | null;
};

export type UnlinkedLog = {
  id: string;
  sessionDate: string;
  studentId: string;
  studentName: string;
  mentorId: string | null;
  mentorName: string;
  probableDuplicate: boolean;
};

export type StaffClassesData = {
  role: "mentor" | "coordinador" | "admin";
  viewerId: string;
  sessions: StaffClass[];
  requests: StaffRequest[];
  unlinkedLogs: UnlinkedLog[];
  noClassDays: { day: string; reason: string }[];
};

export type FamilyClass = {
  id: string;
  studentId: string;
  kind: "regular" | "recuperacion";
  recoversSessionId: string | null;
  originalStart: string;
  scheduledStart: string;
  scheduledEnd: string;
  delivery: Exclude<ClassDelivery, "anulada">;
  consumption: ClassConsumption;
  recovery: ClassRecovery;
  cancelCause: ClassCancelCause | null;
  mentorName: string;
  deliveredByName: string;
  rescheduled: boolean;
};

export type FamilyRequest = {
  id: string;
  sessionId: string | null;
  studentId: string | null;
  kind: "cambio" | "cancelacion" | "propuesta_recuperacion";
  requesterRole: ClassRequestRow["requester_role"];
  requestedByMe: boolean;
  reason: string;
  preferences: string;
  options: ClassOption[];
  late: boolean;
  status: ClassRequestRow["status"];
  chosenOption: ClassOption | null;
  decisionNote: string;
  reply: string;
  createdAt: string;
};

export type FamilyPeriod = {
  paymentId: string;
  studentId: string;
  coverageStart: string;
  coverageEnd: string;
  sessionsIncluded: number | null;
  consumed: number;
  delivered: number;
  cancelledConsumed: number;
  recoveriesOpen: number;
  scheduled: number;
};

export type FamilyClassesData = {
  role: "padre";
  students: { id: string; name: string }[];
  sessions: FamilyClass[];
  requests: FamilyRequest[];
  periods: FamilyPeriod[];
  noticeHours: number;
};

export const NOTICE_HOURS = 48;

export const CAUSE_LABEL: Record<ClassCancelCause, string> = {
  familia_menos_48h: "La familia canceló con menos de 48 h",
  familia_con_aviso: "La familia canceló con aviso",
  no_presentado: "No se presentó",
  mentor: "Canceló el mentor",
  excepcion: "Excepción aprobada",
  dia_sin_clase_kiru: "Día sin clase de Kiru",
  pausa_servicio: "Servicio en pausa",
  cambio_horario: "Cambio de horario",
  historico_sin_clasificar: "Histórico (sin clasificar)",
};

/** Los cinco puntos del seguimiento de recuperaciones del coordinador. */
export const RECOVERY_STAGE: Partial<Record<ClassRecovery, string>> = {
  pendiente: "Pendiente de organizar",
  propuesta: "Propuestas esperando a la familia",
  sin_encaje: "Ninguna fecha encaja",
  programada: "Confirmada, pendiente de hacer",
  realizada: "Realizada",
};

export const REQUEST_STATUS_LABEL: Record<ClassRequestRow["status"], string> = {
  pendiente: "Pendiente de coordinación",
  mas_info: "Coordinación pide más información",
  contrapropuesta: "Coordinación propone otra fecha",
  aprobada: "Aprobada",
  rechazada: "No aprobada",
  retirada: "Retirada",
  elegida: "Fecha elegida",
  sin_encaje: "Ninguna fecha encaja",
  gestionado: "Gestionado",
  sustituida: "Sustituida por otra propuesta",
};

export const REASON_CODE_LABEL: Record<NonNullable<ClassRequestRow["reason_code"]>, string> = {
  cambio_acordado: "Cambio acordado con la familia",
  recuperacion: "Era una recuperación",
  sustitucion: "Fue una sustitución",
  error_registro: "Error en el registro",
  otro: "Otro motivo",
};

export function classDateLabel(iso: string, withTime = true): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" });
  if (!withTime) return day;
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  return `${day}, ${time}`;
}

export function hoursUntil(iso: string, now = Date.now()): number {
  return (new Date(iso).getTime() - now) / 3_600_000;
}

/** Días completos desde una fecha (para «lleva N días»). */
export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

export function parseOptions(value: unknown): ClassOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((o) => (o && typeof o === "object" && typeof (o as ClassOption).start === "string" && typeof (o as ClassOption).end === "string"
    ? [{ start: (o as ClassOption).start, end: (o as ClassOption).end }] : []));
}

export function parseOption(value: unknown): ClassOption | null {
  return parseOptions([value])[0] ?? null;
}

/** Fecha y hora de Madrid (de un <input type="date"> y uno type="time") a ISO. */
export function madridToIso(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  // Se prueba con +01:00 y +02:00 y se queda la que, vista en Madrid, da esa hora.
  for (const offset of ["+01:00", "+02:00"]) {
    const d = new Date(`${day}T${time}:00${offset}`);
    const local = d.toLocaleString("sv-SE", { timeZone: "Europe/Madrid" }).slice(0, 16).replace(" ", "T");
    if (local === `${day}T${time}`) return d.toISOString();
  }
  return null;
}
