import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const ROLES = ["alumno", "mentor", "padre", "formador", "admin"] as const;
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
  const validCredential = role === "formador"
    ? /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/.test(password)
    : /^\d{6}$/.test(password);
  if (!fullName || !/^[a-z0-9._-]{3,40}$/.test(username) || (role !== "alumno" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !validCredential || !ROLES.includes(role)) {
    return NextResponse.json({ error: role === "formador"
      ? "Revisa los campos y usa una contraseña de al menos 12 caracteres con mayúscula, minúscula y número."
      : "Nombre, usuario, email, rol o PIN de 6 cifras no válidos." }, { status: 400 });
  }

  const { data: duplicate, error: duplicateError } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (duplicateError) return NextResponse.json({ error: "No se pudo validar la disponibilidad del usuario." }, { status: 500 });
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
  const { data: targetProfile, error: targetProfileError } = await admin
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", userId)
    .maybeSingle();
  if (targetProfileError) return NextResponse.json({ error: "No se pudo comprobar el usuario que quieres editar." }, { status: 500 });
  if (!targetProfile) return NextResponse.json({ error: "No se encontró el usuario." }, { status: 404 });

  if (typeof body.role === "string" && ROLES.includes(body.role as Role) && body.role !== targetProfile.role) {
    if (userId === authData.user.id) {
      return NextResponse.json({ error: "No puedes cambiar tu propio rol desde esta sesión." }, { status: 409 });
    }
    if (targetProfile.role === "admin" && targetProfile.is_active) {
      const { count, error: adminCountError } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);
      if (adminCountError) return NextResponse.json({ error: "No se pudo comprobar el número de administradores activos." }, { status: 500 });
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "Debe quedar al menos un administrador activo en el Campus." }, { status: 409 });
      }
    }
  }

  if (body.role !== undefined && (typeof body.role !== "string" || !ROLES.includes(body.role as Role))) {
    return NextResponse.json({ error: "Rol no válido." }, { status: 400 });
  }
  const desiredRole = typeof body.role === "string" && ROLES.includes(body.role as Role)
    ? body.role as Role
    : targetProfile.role as Role;

  if (desiredRole === "formador" && targetProfile.role !== "formador" && !(typeof body.password === "string" && body.password.length)) {
    return NextResponse.json({ error: "Para asignar el rol formador, establece una contraseña segura en la misma operación." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.password === "string" && body.password.length) {
    const validCredential = desiredRole === "formador"
      ? /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/.test(body.password)
      : /^\d{6}$/.test(body.password);
    if (!validCredential) {
      return NextResponse.json({ error: desiredRole === "formador"
        ? "La contraseña del formador debe tener al menos 12 caracteres, con mayúscula, minúscula y número."
        : "El PIN debe tener exactamente 6 cifras numéricas." }, { status: 400 });
    }
    updates.password = body.password;
  }
  const profileUpdates: Record<string, unknown> = {};
  if (typeof body.fullName === "string" && body.fullName.trim()) profileUpdates.full_name = body.fullName.trim();
  if (typeof body.username === "string" && /^[a-z0-9._-]{3,40}$/.test(body.username.trim().toLowerCase())) {
    const username = body.username.trim().toLowerCase();
    const { data: duplicate, error: duplicateError } = await admin.from("profiles").select("id").eq("username", username).neq("id", userId).maybeSingle();
    if (duplicateError) return NextResponse.json({ error: "No se pudo validar la disponibilidad del usuario." }, { status: 500 });
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
    if (error) {
      // If role metadata changed but the profile write failed, try to restore the Auth role claim.
      if (updates.app_metadata && targetProfile.role) {
        await admin.auth.admin.updateUserById(userId, { app_metadata: { kiru_role: targetProfile.role } });
      }
      return NextResponse.json({ error: "No se pudieron guardar todos los cambios. Revisa el rol del usuario antes de volver a intentarlo." }, { status: 409 });
    }
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

  const { data: target, error: targetError } = await admin.from("profiles").select("id,username,role,is_active").eq("id", userId).maybeSingle();
  if (targetError || !target) return NextResponse.json({ error: "No se encontró el usuario." }, { status: 404 });
  if (target.role === "admin") return NextResponse.json({ error: "No se puede eliminar otra cuenta administradora desde este panel." }, { status: 403 });

  // Do not destroy financial history. If the user has payment records, require a deliberate
  // archival/anonymisation workflow before allowing account deletion.
  const paymentCheck = await admin
    .from("kiru_payments")
    .select("id")
    .or(`student_id.eq.${userId},created_by.eq.${userId}`)
    .limit(1);
  if (paymentCheck.error) return NextResponse.json({ error: "No se pudo comprobar todas las referencias del historial de pagos; no se ha eliminado la cuenta." }, { status: 409 });
  if (paymentCheck.data?.length) return NextResponse.json({ error: "Esta cuenta aparece en el historial de pagos, como alumno o como autor del registro. Para proteger la trazabilidad económica, archiva o anonimiza esos registros antes de eliminarla." }, { status: 409 });

  // Preflight the two multi-table cleanup paths before any destructive step. This reduces
  // partial cleanup when a lookup itself fails; it does not make the whole workflow transactional.
  const docsPreflight = await admin
    .from("kiru_documents")
    .select("id,storage_path")
    .eq("target_student_id", userId);
  if (docsPreflight.error) {
    return NextResponse.json({ error: "No se pudieron comprobar los documentos del usuario; no se ha iniciado la limpieza." }, { status: 409 });
  }
  const docsToRemove = docsPreflight.data || [];
  const documentIdsToRemove = docsToRemove.map((doc: { id: string }) => doc.id);
  const storagePathsToRemove = [...new Set(
    docsToRemove
      .map((doc: { storage_path: string | null }) => doc.storage_path)
      .filter((value: string | null): value is string => Boolean(value))
  )];

  const flashcardSetsPreflight = await admin
    .from("kiru_flashcard_sets")
    .select("id")
    .eq("student_id", userId);
  if (flashcardSetsPreflight.error) {
    return NextResponse.json({ error: "No se pudieron comprobar las flashcards del usuario; no se ha iniciado la limpieza." }, { status: 409 });
  }
  const flashcardSetIdsToRemove = (flashcardSetsPreflight.data || []).map((set: { id: string }) => set.id);

  // Disable access before multi-step cleanup. If a later step fails, the account stays
  // inactive until an administrator reviews the partial state.
  const { error: deactivateError } = await admin
    .from("profiles")
    .update({ is_active: false })
    .eq("id", userId);
  if (deactivateError) {
    return NextResponse.json({ error: "No se pudo desactivar la cuenta; no se ha iniciado la limpieza." }, { status: 409 });
  }

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
      if (storagePathsToRemove.length) {
        const removed = await admin.storage.from("kiru-documents").remove(storagePathsToRemove);
        if (removed.error) return { error: removed.error };
      }
      if (documentIdsToRemove.length) {
        const accepts = await admin.from("kiru_document_acceptances").delete().in("document_id", documentIdsToRemove);
        if (accepts.error) return { error: accepts.error };
      }
      return await admin.from("kiru_documents").delete().or("created_by.eq." + userId + ",target_student_id.eq." + userId);
    },
    async () => {
      if (flashcardSetIdsToRemove.length) {
        const cards = await admin.from("kiru_flashcards").delete().in("set_id", flashcardSetIdsToRemove);
        if (cards.error) return { error: cards.error };
      }
      return await admin.from("kiru_flashcard_sets").delete().eq("student_id", userId);
    },
    () => admin.from("students").delete().eq("profile_id", userId),
  ];
  const cleanupStepNames = [
    "relaciones_mentor_alumno",
    "relaciones_familia_alumno",
    "aceptaciones_como_alumno",
    "aceptaciones_como_firmante",
    "registros_auditados",
    "registros_propios",
    "avisos_auditados",
    "avisos_dirigidos",
    "documentos_auditados",
    "conjuntos_flashcards_auditados",
    "documentos_y_archivos",
    "flashcards_y_conjuntos",
    "perfil_de_alumno",
  ];
  for (const [index, cleanup] of cleanupSteps.entries()) {
    const { error } = await cleanup();
    if (error) return NextResponse.json({
      error: `La cuenta se ha desactivado para evitar nuevos accesos, pero la limpieza se ha detenido. Paso que falló: ${cleanupStepNames[index] || "limpieza"}. Algunas tareas anteriores podrían haberse completado; revisa el estado antes de reintentar.`,
      failedStep: cleanupStepNames[index] || "limpieza",
      requiresReview: true,
    }, { status: 409 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return NextResponse.json({
    error: "La limpieza de datos terminó, pero no se pudo eliminar el usuario de Auth. La cuenta permanece desactivada; revisa el estado antes de reintentar.",
    accountDeactivated: true,
    requiresReview: true,
  }, { status: 409 });
  return NextResponse.json({ ok: true, deletedUsername: target.username });
}
