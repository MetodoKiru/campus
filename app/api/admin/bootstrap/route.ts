import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bootstrapSecret = process.env.KIRU_BOOTSTRAP_SECRET;
  if (!url || !serviceKey || !bootstrapSecret) {
    return NextResponse.json({ error: "Falta configurar el acceso inicial en el servidor." }, { status: 503 });
  }

  const suppliedSecret = request.headers.get("x-kiru-bootstrap-secret") || "";
  if (suppliedSecret.length < 24 || suppliedSecret !== bootstrapSecret) {
    return NextResponse.json({ error: "Código de configuración no válido." }, { status: 401 });
  }

  const { data: existingAdmins, error: lookupError } = await createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).from("profiles").select("id").eq("role", "admin").limit(1);
  if (lookupError) return NextResponse.json({ error: "No se pudo comprobar el estado inicial." }, { status: 500 });
  if (existingAdmins?.length) return NextResponse.json({ error: "La configuración inicial ya se ha completado. Desactiva KIRU_BOOTSTRAP_SECRET en Vercel." }, { status: 409 });

  let body: { fullName?: unknown; username?: unknown; email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!fullName || !/^[a-z0-9._-]{3,40}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    return NextResponse.json({ error: "Revisa los campos: usuario válido, email y contraseña de al menos 12 caracteres." }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
    app_metadata: { kiru_role: "admin" },
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || "No se pudo crear la cuenta." }, { status: 400 });
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id, full_name: fullName, username, role: "admin", is_active: true,
  }, { onConflict: "id" });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "No se pudo crear el perfil: " + profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Administrador creado. Ya puedes entrar al Campus." });
}
