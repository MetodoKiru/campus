import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { RESET_LINK_HOURS, issueAccessLink } from "@/lib/server/access-links";
import { RESET_PENDING_HOURS, SELF_RESET_ROLES } from "@/lib/server/pin-reset";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

/**
 * La llama cada pocos minutos el Apps Script de «Solicitud mentores» (clave
 * KIRU_ALTA_SECRET). Por cada «¿Has olvidado tu PIN?» pendiente genera en ese
 * momento un enlace de un solo uso (24 h) y lo devuelve para que el script lo
 * mande por correo. Cada petición se entrega una sola vez.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  if (!url || !service || secret === "missing") {
    return NextResponse.json({ error: "El alta de mentores no está configurada." }, { status: 503 });
  }
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: { deliveredIds?: unknown };
  try { body = await request.json(); } catch { body = {}; }
  if (body.deliveredIds !== undefined) {
    if (!Array.isArray(body.deliveredIds) || body.deliveredIds.length > 50 || body.deliveredIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      return NextResponse.json({ error: "Confirmación no válida." }, { status: 400 });
    }
    if (body.deliveredIds.length === 0) return NextResponse.json({ ok: true, acknowledged: 0 });
    const { data, error: ackError } = await admin
      .from("kiru_pin_requests")
      .update({ sent_at: new Date().toISOString() })
      .in("id", body.deliveredIds as string[])
      .is("sent_at", null)
      .select("id");
    if (ackError) return NextResponse.json({ error: "No se pudieron confirmar los correos." }, { status: 500 });
    return NextResponse.json({ ok: true, acknowledged: data?.length ?? 0 });
  }

  const since = new Date(Date.now() - RESET_PENDING_HOURS * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await admin
    .from("kiru_pin_requests")
    .select("id,profile_id")
    .is("sent_at", null)
    .gt("created_at", since)
    .order("created_at")
    .limit(50);
  if (error) return NextResponse.json({ error: "No se pudieron leer las peticiones." }, { status: 500 });

  const profileIds = [...new Set((pending ?? []).map((p) => p.profile_id))];
  const loginUrl = new URL("/", request.url).toString();
  const resets: { fullName: string; email: string; username: string; accessUrl: string; expiresAt: string; loginUrl: string; requestIds: string[] }[] = [];

  for (const profileId of profileIds) {
    const requestIds = (pending ?? []).filter((p) => p.profile_id === profileId).map((p) => p.id);
    const [{ data: profile }, { data: authUser }] = await Promise.all([
      admin.from("profiles").select("full_name,username,role,is_active").eq("id", profileId).maybeSingle(),
      admin.auth.admin.getUserById(profileId),
    ]);
    const email = authUser.user?.email ?? "";
    if (!profile?.is_active || !profile.username || !(SELF_RESET_ROLES as readonly string[]).includes(profile.role)) continue;
    if (!email || email.endsWith(".invalid")) continue;

    const link = await issueAccessLink(admin, profileId, request.url, RESET_LINK_HOURS * 60 * 60 * 1000);
    if (!link) continue;
    resets.push({ fullName: profile.full_name, email, username: profile.username, ...link, loginUrl, requestIds });
  }

  return NextResponse.json({ ok: true, resets });
}
