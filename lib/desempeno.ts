import { supabase } from "@/lib/supabase";
import type { EvidenceExemptionCause, LogErrorKind, MaterialEvidenceKind, MaterialEvidenceRow, MaterialEvidenceStatus } from "@/lib/database.types";

/** Tipos de error que Coordinación puede marcar en un registro de sesión (E3). */
export const LOG_ERROR_KIND_LABEL: Record<LogErrorKind, string> = {
  alumno_fecha: "Alumno o fecha equivocados",
  skillcoins: "SkillCoins mal puestas",
  campos_vacios: "Campos obligatorios vacíos",
  contenido: "El contenido no corresponde a la clase",
  otro: "Otro",
};

export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message || fallback;
  }
  return fallback;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Hoy en Madrid, como AAAA-MM-DD. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** El mes actual y los anteriores, como primer día del mes. */
export function monthOptions(count: number): { value: string; label: string }[] {
  const [y, m] = todayIso().split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
    return { value: isoOf(d), label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

/**
 * Lunes de las semanas que cuentan en la ficha de un mes. Cada semana va en el
 * mes en el que cae su lunes, para que ninguna se cuente dos veces.
 */
export function mondaysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const out: string[] = [];
  while (d.getUTCMonth() === m - 1) {
    out.push(isoOf(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

export function fmtDay(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
}

// Fase 2b: entregas bimestrales ---------------------------------------------------------------
export const EVIDENCE_KIND_LABEL: Record<MaterialEvidenceKind, string> = { descubrirme: "Descubrirme", mision: "Misión" };
export const EVIDENCE_KIND_HINT: Record<MaterialEvidenceKind, string> = {
  descubrirme: "Al menos 3 fotos de actividades hechas (sin que salga la cara del alumno) y una línea de qué ha trabajado.",
  mision: "Una foto o una descripción corta de la misión.",
};
export const EVIDENCE_STATUS_LABEL: Record<MaterialEvidenceStatus, string> = {
  pendiente: "Pendiente", entregada: "Enviada, por revisar", validada: "Validada", aclaracion: "Necesita aclaración", exenta: "Exenta",
};
export const EXEMPTION_CAUSE_LABEL: Record<EvidenceExemptionCause, string> = {
  material_no_disponible: "Material no disponible",
  ausencia_alumno: "Ausencia larga del alumno",
  ausencia_mentor: "Ausencia del mentor",
  otra: "Otra causa",
};
export const EVIDENCE_PHOTO_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,image/jpeg,image/png,image/webp,image/heic";
export const EVIDENCE_PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** «19 nov – 18 ene» (el fin del bimestre se guarda exclusivo). */
export function bimesterLabel(e: Pick<MaterialEvidenceRow, "bimester_start" | "bimester_end">): string {
  const end = new Date(`${e.bimester_end}T12:00:00`);
  end.setDate(end.getDate() - 1);
  const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${fmt(new Date(`${e.bimester_start}T12:00:00`))} – ${fmt(end)}`;
}

/** Enlaces temporales (10 min) a las fotos de una entrega. */
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from("kiru-evidencias").createSignedUrls(paths, 600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
