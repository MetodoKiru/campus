import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Propuestas que el Apps Script mandó a un correo que aún no tenía cuenta en el
 * campus (o con otras mayúsculas): se enlazan al mentor en cuanto entra.
 */
export async function linkOffersToMentor(admin: SupabaseClient<Database>, mentorId: string, email: string): Promise<void> {
  await admin
    .from("kiru_assignment_offers")
    .update({ mentor_id: mentorId })
    .is("mentor_id", null)
    .eq("mentor_email", email.toLowerCase());
}

export type OfferAnswer = "si" | "ajustar" | "no";
export const OFFER_ANSWERS: readonly OfferAnswer[] = ["si", "ajustar", "no"];

/** Solo se siguen enlaces del Apps Script de Método Kiru, nunca otra web. */
const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\?/;

export function validScriptLink(value: unknown): string | null {
  return typeof value === "string" && value.length <= 2000 && SCRIPT_URL_RE.test(value) ? value : null;
}

/**
 * Lleva la respuesta dada en el panel al Apps Script por el mismo enlace firmado
 * del botón del correo: así el script la apunta en OFERTAS y avisa a quien
 * propuso el alumno igual que si el mentor hubiera pulsado el botón.
 */
export async function forwardAnswerToScript(link: string, detail: string): Promise<{ ok: boolean; error: string }> {
  const url = new URL(link);
  if (detail) url.searchParams.set("detalle", detail);
  url.searchParams.set("origen", "campus");
  try {
    const response = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(15000) });
    return response.ok ? { ok: true, error: "" } : { ok: false, error: `El script respondió ${response.status}.` };
  } catch {
    return { ok: false, error: "No se pudo contactar con el script." };
  }
}
