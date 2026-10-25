import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

export type StaffRole = "admin" | "formador" | "coordinador";

type StaffSuccess = { ok: true; admin: SupabaseClient<Database>; user: User; role: StaffRole };
type StaffFailure = { ok: false; response: NextResponse };

/**
 * Comprueba en el servidor que quien llama tiene sesión válida, perfil activo y
 * uno de los roles permitidos, tanto en profiles como en app_metadata del JWT.
 * Solo después devuelve el cliente con service role, que nunca sale del servidor.
 */
export async function requireStaff(request: Request, allowed: readonly StaffRole[]): Promise<StaffSuccess | StaffFailure> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return { ok: false, response: NextResponse.json({ error: "Servicio no configurado." }, { status: 503 }) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, response: NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 }) };

  const authClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ error: "La sesión no es válida o ha caducado." }, { status: 401 }) };
  }

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await admin.from("profiles").select("role,is_active").eq("id", data.user.id).maybeSingle();
  const role = profile?.role as StaffRole | undefined;
  if (profileError || !profile?.is_active || !role || !allowed.includes(role) || data.user.app_metadata?.kiru_role !== role) {
    return { ok: false, response: NextResponse.json({ error: "No tienes permisos para esta sección." }, { status: 403 }) };
  }

  return { ok: true, admin, user: data.user, role };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
