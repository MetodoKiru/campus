import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { ACCESS_TOKEN_RE, hashAccessToken, pinProblem } from "@/lib/server/access-links";

export const runtime = "nodejs";

const GONE = "Este enlace ya se ha usado o ha caducado. Si aún no tienes PIN, escribe a metodokiru@gmail.com y te mandamos otro.";

/**
 * Página «Crea tu PIN» (/acceso). Sin PIN, comprueba el enlace y devuelve el
 * nombre y el usuario para enseñarlos. Con PIN, gasta el enlace, guarda el PIN
 * como contraseña y devuelve la sesión, igual que /api/auth/login.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return NextResponse.json({ error: "El acceso aún no está configurado. Contacta con Método Kiru." }, { status: 503 });
  }

  let body: { token?: unknown; pin?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!ACCESS_TOKEN_RE.test(token)) return NextResponse.json({ error: GONE }, { status: 410 });
  const tokenHash = hashAccessToken(token);
  const now = new Date().toISOString();

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  if (body.pin === undefined) {
    const { data: link } = await admin
      .from("kiru_access_links")
      .select("profile_id")
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .gt("expires_at", now)
      .maybeSingle();
    if (!link) return NextResponse.json({ error: GONE }, { status: 410 });
    const { data: profile } = await admin.from("profiles").select("full_name,username,is_active").eq("id", link.profile_id).maybeSingle();
    if (!profile?.is_active || !profile.username) return NextResponse.json({ error: GONE }, { status: 410 });
    return NextResponse.json({ fullName: profile.full_name, username: profile.username });
  }

  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const problem = pinProblem(pin);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // Se gasta en una sola orden: si dos pestañas lo intentan a la vez, solo una gana.
  const { data: used } = await admin
    .from("kiru_access_links")
    .update({ used_at: now })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("id,profile_id");
  const link = used?.[0];
  if (!link) return NextResponse.json({ error: GONE }, { status: 410 });

  const release = () => admin.from("kiru_access_links").update({ used_at: null }).eq("id", link.id);
  const [{ data: profile }, { data: authUser }] = await Promise.all([
    admin.from("profiles").select("username,is_active").eq("id", link.profile_id).maybeSingle(),
    admin.auth.admin.getUserById(link.profile_id),
  ]);
  const email = authUser.user?.email;
  if (!profile?.is_active || !profile.username || !email) {
    await release();
    return NextResponse.json({ error: GONE }, { status: 410 });
  }

  const { error: pinError } = await admin.auth.admin.updateUserById(link.profile_id, { password: pin });
  if (pinError) {
    await release();
    return NextResponse.json({ error: "No se pudo guardar el PIN. Inténtalo de nuevo." }, { status: 500 });
  }

  const authClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password: pin });
  if (error || !data.session || !data.user) {
    // El PIN ya está guardado: puede entrar desde la página de inicio.
    return NextResponse.json({ ok: true, username: profile.username, session: null });
  }
  return NextResponse.json({
    ok: true,
    username: profile.username,
    session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    user: { id: data.user.id },
  });
}
