import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { ACCESS_LINK_DAYS, issueAccessLink, usernameBase } from "@/lib/server/access-links";
import { EMAIL_RE } from "@/lib/server/require-staff";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";
type Admin = SupabaseClient<Database>;

async function findAuthUserByEmail(admin: Admin, email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Primer usuario libre: maria.lopez, maria.lopez2, maria.lopez3… */
async function freeUsername(admin: Admin, fullName: string): Promise<string | null> {
  const base = usernameBase(fullName);
  const { data, error } = await admin.from("profiles").select("username").like("username", `${base}%`);
  if (error) return null;
  const taken = new Set((data ?? []).map((p) => p.username));
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

/**
 * La llama el Apps Script de «Solicitud mentores» al enviar el correo de
 * bienvenida. Crea (si hace falta) la ficha de incorporación y la cuenta de
 * mentor, y devuelve el usuario y un enlace «Crea tu PIN» de un solo uso para
 * meterlo en el correo. Se puede llamar las veces que haga falta con el mismo
 * correo: nunca duplica la cuenta.
 *
 * - status "created": cuenta nueva + enlace.
 * - status "link": la cuenta ya existía pero el mentor aún no ha entrado → enlace nuevo
 *   (el anterior deja de valer).
 * - status "active": el mentor ya ha entrado alguna vez → sin enlace, salvo que se
 *   pida con newLink: true (por ejemplo, si ha olvidado el PIN).
 *
 * La cuenta nace sin alumnos. Mientras el certificado de delitos no esté
 * comprobado en su ficha, la base de datos no deja asignarle ninguno.
 * La protege la clave compartida KIRU_ALTA_SECRET (Vercel + Apps Script).
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  if (!url || !service || secret === "missing") {
    return NextResponse.json({ error: "El alta de mentores no está configurada." }, { status: 503 });
  }
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: { email?: unknown; fullName?: unknown; phone?: unknown; newLink?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.replace(/\s+/g, " ").trim() : "";
  const phoneText = typeof body.phone === "string" || typeof body.phone === "number" ? String(body.phone).trim() : "";
  const phone = phoneText ? phoneText.slice(0, 30) : null;
  if (!EMAIL_RE.test(email) || email.length > 320 || !fullName || fullName.length > 160) {
    return NextResponse.json({ error: "Faltan el nombre o un correo válido." }, { status: 400 });
  }

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Ficha de incorporación abierta con ese correo, si la hay.
  const fichaResult = await admin.from("kiru_mentor_onboarding").select("id,profile_id").eq("email", email).is("archived_at", null).maybeSingle();
  if (fichaResult.error) return NextResponse.json({ error: "No se pudo consultar la incorporación." }, { status: 500 });
  let ficha = fichaResult.data;
  let profileId = ficha?.profile_id ?? null;
  let created = false;

  // 2. Si la ficha aún no tiene cuenta, se busca una con ese correo o se crea.
  if (!profileId) {
    let existing: User | null;
    try { existing = await findAuthUserByEmail(admin, email); } catch {
      return NextResponse.json({ error: "No se pudieron comprobar las cuentas existentes." }, { status: 500 });
    }

    if (!existing) {
      if (!ficha) {
        const inserted = await admin
          .from("kiru_mentor_onboarding")
          .insert({ full_name: fullName, email, phone, notes: "Alta automática desde el correo de bienvenida." })
          .select("id,profile_id")
          .single();
        if (inserted.error && inserted.error.code !== "23505") {
          return NextResponse.json({ error: "No se pudo crear la ficha de incorporación." }, { status: 500 });
        }
        // 23505: otra llamada la acaba de crear; se usa esa.
        ficha = inserted.data ?? (await admin.from("kiru_mentor_onboarding").select("id,profile_id").eq("email", email).is("archived_at", null).maybeSingle()).data;
        if (!ficha) return NextResponse.json({ error: "No se pudo crear la ficha de incorporación." }, { status: 500 });
      }

      const username = await freeUsername(admin, fullName);
      if (!username) return NextResponse.json({ error: "No se pudo elegir un nombre de usuario." }, { status: 500 });
      // Contraseña provisional larga que nadie conoce: el mentor pone su PIN con el enlace.
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password: randomBytes(24).toString("base64url"),
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { kiru_role: "mentor" },
      });
      if (createError || !createdUser.user) {
        // Puede que otra llamada simultánea la haya creado: se reutiliza.
        existing = await findAuthUserByEmail(admin, email).catch(() => null);
        if (!existing) return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
      } else {
        const userId = createdUser.user.id;
        const { error: profileError } = await admin
          .from("profiles")
          .upsert({ id: userId, full_name: fullName, username, role: "mentor", is_active: true }, { onConflict: "id" });
        if (profileError) {
          await admin.auth.admin.deleteUser(userId);
          return NextResponse.json({ error: "No se pudo completar el alta. Inténtalo de nuevo." }, { status: 500 });
        }
        profileId = userId;
        created = true;
      }
    }
    if (existing) profileId = existing.id;
  }
  if (!profileId) return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });

  // 3. La cuenta tiene que ser de mentor y estar activa.
  const { data: profile } = await admin.from("profiles").select("id,role,username,is_active").eq("id", profileId).maybeSingle();
  if (!profile || profile.role !== "mentor") {
    return NextResponse.json({ error: "Ese correo ya tiene una cuenta del campus que no es de mentor. Revísalo en el panel de administración." }, { status: 409 });
  }
  if (!profile.is_active) {
    return NextResponse.json({ error: "La cuenta de ese mentor está desactivada. Actívala en el panel de administración." }, { status: 409 });
  }
  // Se enlaza la ficha (si la hay). Un mentor antiguo sin ficha sigue sin ella.
  if (ficha && !ficha.profile_id) {
    await admin.from("kiru_mentor_onboarding").update({ profile_id: profileId }).eq("id", ficha.id).is("profile_id", null);
  }
  let username = profile.username;
  if (!username) {
    username = await freeUsername(admin, fullName);
    if (!username || (await admin.from("profiles").update({ username }).eq("id", profileId)).error) {
      return NextResponse.json({ error: "No se pudo poner nombre de usuario a la cuenta." }, { status: 500 });
    }
  }

  const loginUrl = new URL("/", request.url).toString();
  const { data: authUser } = await admin.auth.admin.getUserById(profileId);
  if (authUser.user?.last_sign_in_at && body.newLink !== true) {
    return NextResponse.json({ ok: true, status: "active", username, loginUrl });
  }

  // 4. Enlace nuevo de un solo uso; los anteriores sin usar dejan de valer.
  const link = await issueAccessLink(admin, profileId, request.url, ACCESS_LINK_DAYS * 24 * 60 * 60 * 1000);
  if (!link) return NextResponse.json({ error: "No se pudo generar el enlace de acceso." }, { status: 500 });

  return NextResponse.json(
    { ok: true, status: created ? "created" : "link", username, ...link, loginUrl },
    { status: created ? 201 : 200 },
  );
}
