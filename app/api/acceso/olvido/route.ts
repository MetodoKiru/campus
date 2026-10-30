import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { EMAIL_RE } from "@/lib/server/require-staff";
import { RESET_COOLDOWN_MINUTES, RESET_MAX_PER_DAY, SELF_RESET_ROLES } from "@/lib/server/pin-reset";

export const runtime = "nodejs";

// Siempre la misma respuesta, exista o no la cuenta, para no revelar quién está dado de alta.
const DONE = {
  ok: true,
  message: "Si ese usuario o correo tiene cuenta, en unos minutos te llegará un correo de Método Kiru con un botón para crear un PIN nuevo. Mira también en «Spam».",
};

/**
 * «¿Has olvidado tu PIN?» en la entrada del campus. Apunta la petición en
 * kiru_pin_requests; el Apps Script la recoge y manda el correo con el enlace.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return NextResponse.json({ error: "El servicio no está configurado." }, { status: 503 });

  let body: { usuario?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const usuario = typeof body.usuario === "string" ? body.usuario.trim().toLowerCase() : "";
  if (!usuario || usuario.length > 320) return NextResponse.json({ error: "Escribe tu usuario o tu correo." }, { status: 400 });

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  let profileId: string | null = null;
  if (EMAIL_RE.test(usuario)) {
    for (let page = 1; page <= 20 && !profileId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return NextResponse.json(DONE);
      profileId = data.users.find((u) => (u.email ?? "").toLowerCase() === usuario)?.id ?? null;
      if (data.users.length < 1000) break;
    }
  } else {
    const { data } = await admin.from("profiles").select("id").eq("username", usuario).maybeSingle();
    profileId = data?.id ?? null;
  }
  if (!profileId) return NextResponse.json(DONE);

  const { data: profile } = await admin.from("profiles").select("role,is_active").eq("id", profileId).maybeSingle();
  if (!profile?.is_active || !(SELF_RESET_ROLES as readonly string[]).includes(profile.role)) return NextResponse.json(DONE);

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("kiru_pin_requests")
    .select("created_at")
    .eq("profile_id", profileId)
    .gt("created_at", dayAgo)
    .order("created_at", { ascending: false });
  const last = recent?.[0] ? new Date(recent[0].created_at).getTime() : 0;
  if ((recent?.length ?? 0) >= RESET_MAX_PER_DAY || Date.now() - last < RESET_COOLDOWN_MINUTES * 60 * 1000) {
    return NextResponse.json(DONE);
  }

  await admin.from("kiru_pin_requests").insert({ profile_id: profileId });
  return NextResponse.json(DONE);
}
