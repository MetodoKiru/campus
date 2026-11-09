// Supervisión metodológica: textos y utilidades que comparten el panel del
// mentor y el del coordinador. Las reglas (quién ve, quién responde, estados)
// viven en la base de datos (migración 20261109110000_supervision_metodologica.sql).

import type {
  MethodologyWarningRow, SkillcoinCompetencia, SkillcoinReviewResolution, SkillcoinReviewStatus,
} from "@/lib/database.types";

export const EVIDENCE_BUCKET = "kiru-evidencias";
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 10;

/** Tipos admitidos por el almacén (mismos que la migración). */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export const EVIDENCE_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.pdf,.docx,image/jpeg,image/png,image/webp,image/heic,application/pdf";

export const COMPETENCIA_LABEL: Record<SkillcoinCompetencia | "general", string> = {
  estudios: "Estudios",
  compromiso: "Compromiso",
  organizacion: "Organización",
  bienestar: "Bienestar",
  general: "General",
};

/** Cómo ve el mentor cada estado de la solicitud. */
export const MENTOR_STATUS_LABEL: Record<SkillcoinReviewStatus, string> = {
  pendiente_respuesta: "Pendiente de tu respuesta",
  respondida: "Respondida",
  pendiente_valoracion: "En valoración por coordinación",
  cerrada: "Cerrada",
};

export const RESOLUTION_LABEL: Record<SkillcoinReviewResolution, string> = {
  adecuada: "Justificación adecuada",
  insuficiente: "Evidencias insuficientes o poco claras",
  necesita_formacion: "Conviene reforzar el criterio",
  retirada: "Retirada por coordinación",
};

export const WARNING_LEVEL_LABEL: Record<MethodologyWarningRow["level"], string> = {
  1: "Primer aviso · recordatorio metodológico",
  2: "Segundo aviso · revisión con coordinación",
  3: "Tercer aviso · revisión metodológica",
};

export const WARNING_STATUS_LABEL: Record<MethodologyWarningRow["status"], string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  resuelto: "Resuelto",
};

/** Meses durante los que un aviso cuenta para el nivel del siguiente. */
export const WARNING_VALIDITY_MONTHS = 6;

/** Fecha hasta la que un aviso cuenta para el nivel (después sigue en el historial). */
export function warningCountsUntil(createdAt: string): Date {
  const date = new Date(createdAt);
  date.setMonth(date.getMonth() + WARNING_VALIDITY_MONTHS);
  return date;
}

/** El tipo que se guarda: el del navegador o, si no lo sabe (p. ej. HEIC), el de la extensión. */
export function evidenceMime(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExtension = MIME_BY_EXTENSION[extension];
  if (file.type && Object.values(MIME_BY_EXTENSION).includes(file.type)) return file.type;
  return byExtension ?? null;
}

/** Nombre seguro para la ruta del almacén: sin tildes, espacios ni barras. */
export function safeFileName(name: string, index: number): string {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(-120);
  return `${String(index + 1).padStart(2, "0")}-${clean || "archivo"}`;
}

/** «semana del 3 nov» a partir del lunes (AAAA-MM-DD). */
export function weekLabel(week: string): string {
  const date = new Date(`${week}T12:00:00`);
  return `semana del ${date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
