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
  if (!fullName || !/^[a-z0-9._-]{3,40}$/.test(username) || (role !== "alumno" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (role === "alumno" ? !/^\d{6}$/.test(password) : password.length < 12) || !ROLES.includes(role)) {
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
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Inicia sesión como administradora." }, { status: 401 });
  const authClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user || authData.user.app_metadata?.kiru_role !== "admin") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller } = await admin.from("profiles").select("role,is_active").eq("id", authData.user.id).single();
  if (caller?.role !== "admin" || !caller.is_active) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  let body: { userId?: unknown; password?: unknown; fullName?: unknown; username?: unknown; role?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "Falta el usuario." }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (typeof body.password === "string" && body.password.length) {
    const { data: targetProfile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    const isSixDigitPin = /^\d{6}$/.test(body.password);
    if (!isSixDigitPin) return NextResponse.json({ error: "El PIN debe tener exactamente 6 cifras numéricas." }, { status: 400 });
    updates.password = body.password;
  }
  const profileUpdates: Record<string, unknown> = {};
  if (typeof body.fullName === "string" && body.fullName.trim()) profileUpdates.full_name = body.fullName.trim();
  if (typeof body.username === "string" && /^[a-z0-9._-]{3,40}$/.test(body.username.trim().toLowerCase())) {
    const username = body.username.trim().toLowerCase();
    const { data: duplicate } = await admin.from("profiles").select("id").eq("username", username).neq("id", userId).maybeSingle();
    if (duplicate) return NextResponse.json({ error: "Ese nombre de usuario ya existe." }, { status: 409 });
    profileUpdates.username = username;
  } else if (body.username !== undefined) return NextResponse.json({ error: "Nombre de usuario no válido." }, { status: 400 });
  if (typeof body.role === "string" && ROLES.includes(body.role as Role)) {
    profileUpdates.role = body.role;
    updates.app_metadata = { kiru_role: body.role };
  }
  if (!Object.keys(updates).length && !Object.keys(profileUpdates).length) return NextResponse.json({ error: "No hay cambios para guardar." }, { status: 400 });
  if (Object.keys(updates).length) {
    const { error } = await admin.auth.admin.updateUserById(userId, updates);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (Object.keys(profileUpdates).length) {
    const { error } = await admin.from("profiles").update(profileUpdates).eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
