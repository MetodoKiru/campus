import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const ROLES = ["alumno", "mentor", "padre", "admin"] as const;
type Role = (typeof ROLES)[number];

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return NextResponse.json({ error: "Servicio no configurado." }, { status: 503 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Inicia sesión como administradora." }, { status: 401 });

  const authClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller, error: callerError } = await admin.from("profiles").select("role,is_active").eq("id", authData.user.id).single();
  if (callerError || caller?.role !== "admin" || !caller.is_active || authData.user.app_metadata?.kiru_role !== "admin") {
    return NextResponse.json({ error: "No tienes permisos para crear usuarios." }, { status: 403 });
  }

  let body: { fullName?: unknown; username?: unknown; email?: unknown; password?: unknown; role?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const suppliedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role as Role;
  // Students can sign in with username only; this internal alias is not used for email delivery.
  const email = role === "alumno" && !suppliedEmail ? `${username}@alumnos.campus-kiru.invalid` : suppliedEmail;
  if (!fullName || !/^[a-z0-9._-]{3,40}$/.test(username) || (role !== "alumno" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || password.length < 12 || !ROLES.includes(role)) {
    return NextResponse.json({ error: "Nombre, usuario, email, rol o contraseña no válidos. La contraseña debe tener al menos 12 caracteres." }, { status: 400 });
  }

  const { data: duplicate } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (duplicate) return NextResponse.json({ error: "Ese nombre de usuario ya existe." }, { status: 409 });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { kiru_role: role },
  });
  if (createError || !created.user) return NextResponse.json({ error: createError?.message || "No se pudo crear la cuenta." }, { status: 400 });

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id, full_name: fullName, username, role, is_active: true,
  }, { onConflict: "id" });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "No se pudo crear el perfil: " + profileError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, user: { id: created.user.id, full_name: fullName, username, role } }, { status: 201 });
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return NextResponse.json({ error: "Servicio no configurado." }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Inicia sesión como administradora." }, { status: 401 });
  const authClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user || authData.user.app_metadata?.kiru_role !== "admin") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller } = await admin.from("profiles").select("role,is_active").eq("id", authData.user.id).single();
  if (caller?.role !== "admin" || !caller.is_active) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { data, error } = await admin.from("profiles").select("id,full_name,username,role,is_active,created_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "No se pudieron cargar los usuarios." }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

export async function PATCH(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return NextResponse.json({ error: "Servicio no configurado." }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  if (!token) return NextResponse.json({ error: "Inicia sesión como administradora." }, { status: 401 });
  const authClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user || authData.user.app_metadata?.kiru_role !== "admin") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller } = await admin.from("profiles").select("role,is_active").eq("id", authData.user.id).single();
  if (caller?.role !== "admin" || !caller.is_active) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  let body: { userId?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const userId = typeof body.userId === "string" ? body.userId : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!userId || password.length < 12) return NextResponse.json({ error: "Indica una contraseña de al menos 12 caracteres." }, { status: 400 });
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
