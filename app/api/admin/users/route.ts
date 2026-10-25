import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const ROLES = ["alumno", "mentor", "padre", "formador", "coordinador", "admin"] as const;
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
  if (!fullName || !/^[a-z0-9._-]{3,40}$/.test(username) || (role !== "alumno" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !new RegExp("^[0-9]{6}$").test(password) || !ROLES.includes(role)) {
    return NextResponse.json({ error: "Nombre, usuario, email, rol o PIN de 6 cifras no válidos." }, { status: 400 });
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
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return NextResponse.json({ error: "Identificador de usuario no válido." }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (typeof body.password === "string" && body.password.length) {
    const isSixDigitPin = new RegExp("^[0-9]{6}$").test(body.password);
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


export async function DELETE(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return NextResponse.json({ error: "Servicio no configurado." }, { status: 503 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Inicia sesión como administradora." }, { status: 401 });

  const authClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user || authData.user.app_metadata?.kiru_role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller, error: callerError } = await admin.from("profiles").select("role,is_active").eq("id", authData.user.id).single();
  if (callerError || caller?.role !== "admin" || !caller.is_active) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  let body: { userId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return NextResponse.json({ error: "Identificador de usuario no válido." }, { status: 400 });
  if (userId === authData.user.id) return NextResponse.json({ error: "No puedes eliminar tu propia cuenta administradora." }, { status: 400 });

  const { data: target, error: targetError } = await admin.from("profiles").select("id,username,role").eq("id", userId).maybeSingle();
  if (targetError || !target) return NextResponse.json({ error: "No se encontró el usuario." }, { status: 404 });
  if (target.role === "admin") return NextResponse.json({ error: "No se puede eliminar otra cuenta administradora desde este panel." }, { status: 403 });

  // Do not destroy financial history. If the user has payment records, require a deliberate
  // archival/anonymisation workflow before allowing account deletion.
  const paymentCheck = await admin.from("kiru_payments").select("id").eq("student_id", userId).limit(1);
  if (paymentCheck.error) return NextResponse.json({ error: "No se pudo comprobar el historial de pagos; no se ha eliminado la cuenta." }, { status: 409 });
  if (paymentCheck.data?.length) return NextResponse.json({ error: "Esta cuenta tiene historial de pagos. Para proteger la trazabilidad económica, archiva o anonimiza esos registros antes de eliminarla." }, { status: 409 });

  // Preserve authored records belonging to other people by reassigning their audit owner
  // to the authenticated administrator. Delete only user-owned records and user-targeted content.
  const cleanupSteps = [
    () => admin.from("student_mentors").delete().or(`student_id.eq.${userId},mentor_id.eq.${userId}`),
    () => admin.from("student_guardians").delete().or(`student_id.eq.${userId},guardian_id.eq.${userId}`),
    () => admin.from("kiru_document_acceptances").delete().eq("student_id", userId),
    () => admin.from("kiru_document_acceptances").delete().eq("accepted_by", userId),
    () => admin.from("kiru_app_records").update({ created_by: authData.user.id }).eq("created_by", userId),
    () => admin.from("kiru_app_records").delete().eq("owner_id", userId),
    () => admin.from("kiru_notices").update({ created_by: authData.user.id }).eq("created_by", userId),
    () => admin.from("kiru_notices").delete().eq("target_student_id", userId),
    () => admin.from("kiru_documents").update({ created_by: authData.user.id }).eq("created_by", userId).or("target_student_id.is.null,target_student_id.neq." + userId),
    () => admin.from("kiru_flashcard_sets").update({ created_by: authData.user.id }).eq("created_by", userId).or("student_id.is.null,student_id.neq." + userId),
    async () => {
      const docs = await admin.from("kiru_documents").select("id,storage_path").eq("target_student_id", userId);
      if (docs.error) return { error: docs.error };
      const docIds = (docs.data || []).map((doc: { id: string }) => doc.id);
      const storagePaths = [...new Set((docs.data || []).map((doc: { storage_path: string | null }) => doc.storage_path).filter((value: string | null): value is string => Boolean(value)))];
      if (storagePaths.length) {
        const removed = await admin.storage.from("kiru-documents").remove(storagePaths);
        if (removed.error) return { error: removed.error };
      }
      if (docIds.length) {
        const accepts = await admin.from("kiru_document_acceptances").delete().in("document_id", docIds);
        if (accepts.error) return { error: accepts.error };
      }
      return await admin.from("kiru_documents").delete().or("created_by.eq." + userId + ",target_student_id.eq." + userId);
    },
    async () => {
      const lookup = await admin.from("kiru_flashcard_sets").select("id").eq("student_id", userId);
      if (lookup.error) return { error: lookup.error };
      const setIds = (lookup.data || []).map((set: { id: string }) => set.id);
      if (setIds.length) {
        const cards = await admin.from("kiru_flashcards").delete().in("set_id", setIds);
        if (cards.error) return { error: cards.error };
      }
      return await admin.from("kiru_flashcard_sets").delete().eq("student_id", userId);
    },
    () => admin.from("students").delete().eq("profile_id", userId),
  ];
  for (const cleanup of cleanupSteps) {
    const { error } = await cleanup();
    if (error) return NextResponse.json({ error: "No se pudo completar la limpieza de relaciones. No se ha eliminado la cuenta; revisa los datos relacionados antes de volver a intentarlo." }, { status: 409 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return NextResponse.json({ error: "No se pudo eliminar la cuenta: " + deleteError.message }, { status: 409 });
  return NextResponse.json({ ok: true, deletedUsername: target.username });
}
