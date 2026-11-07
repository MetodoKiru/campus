import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";

/**
 * Cliente con la sesión de quien llama (clave pública + su token). Lee con sus
 * permisos de base de datos (RLS): cada uno ve solo lo suyo, aunque el código
 * de la ruta se equivoque de filtro.
 */
export function userClient(request: Request): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!url || !anon || !token) return null;
  return createClient<Database>(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Cliente con service role para las rutas que llaman los Apps Script (nunca sale del servidor). */
export function serviceClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Traduce los errores de las funciones de clases. Los mensajes que escriben
 * las funciones (permiso, hueco ocupado, motivo…) están pensados para la
 * persona y se devuelven tal cual; cualquier otro error se oculta.
 */
export function rpcError(error: PostgrestError): NextResponse {
  const status: Record<string, number> = { "42501": 403, "23514": 400, "23505": 409, "23P01": 409, P0002: 404 };
  const code = error.code ?? "";
  if (status[code]) {
    const message = code === "23P01" ? "Ese hueco ya está ocupado." : error.message;
    return NextResponse.json({ error: message }, { status: status[code] });
  }
  console.error("Error en clases:", error.code, error.message);
  return NextResponse.json({ error: "No se pudo guardar. Inténtalo de nuevo." }, { status: 500 });
}

export const text = (value: unknown, max = 2000) => (typeof value === "string" ? value.trim().slice(0, max) : "");
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Opciones de fecha [{ start, end }] en ISO; el servidor de base de datos vuelve a validarlas. */
export function cleanOptions(value: unknown): Json | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) return null;
  const out: { start: string; end: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { start, end } = item as Record<string, unknown>;
    if (typeof start !== "string" || typeof end !== "string") return null;
    const a = new Date(start);
    const b = new Date(end);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return null;
    out.push({ start: a.toISOString(), end: b.toISOString() });
  }
  return out;
}

export const optionalIndex = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < 10 ? (value as number) : undefined;
};
