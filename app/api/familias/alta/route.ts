import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { ACCESS_LINK_DAYS, findAuthUserByEmail, freeUsername, issueAccessLink } from "@/lib/server/access-links";
import { EMAIL_RE } from "@/lib/server/require-staff";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";
type Admin = SupabaseClient<Database>;

const LINK_MS = ACCESS_LINK_DAYS * 24 * 60 * 60 * 1000;
const SUBMISSION_RE = /^[A-Za-z0-9._:-]{1,80}$/;

type GuardianIn = { fullName: string; email: string; relationship: string | null };
type Link = { accessUrl: string; expiresAt: string } | null;

/**
 * Estado de cada cuenta en la respuesta:
 * - created: cuenta nueva + enlace «Crea tu PIN».
 * - linked: la cuenta ya existía (un hermano, un alta a mano) y se acaba de
 *   enlazar con el alumno. No se manda acceso nuevo: entra con su usuario y PIN
 *   (o con «¿Has olvidado tu PIN?»). hasSignedIn dice si ha entrado alguna vez.
 * - already: ya estaba hecho en una llamada anterior → nada que enviar.
 * - resent: solo con resend: true (reenvío pedido a mano) → enlace nuevo; el anterior deja de valer.
 * - error: no se pudo (por ejemplo, el correo es de una cuenta de mentor); el texto va en error.
 *
 * Así nunca sale un acceso repetido: solo hay enlace al crear la cuenta o
 * cuando administración pide expresamente reenviarlo.
 */
type Status = "created" | "linked" | "already" | "resent" | "error";

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function sameName(a: string, b: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return n(a) !== "" && n(a) === n(b);
}

async function neverSignedIn(admin: Admin, id: string): Promise<boolean> {
  const { data } = await admin.auth.admin.getUserById(id);
  return !data.user?.last_sign_in_at;
}

/** Crea una cuenta con contraseña provisional larga que nadie conoce; el PIN se pone con el enlace. */
async function createAccount(
  admin: Admin,
  email: string,
  fullName: string,
  username: string,
  role: "padre" | "alumno",
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { kiru_role: role },
  });
  if (error || !data.user) return null;
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: data.user.id, full_name: fullName, username, role, is_active: true }, { onConflict: "id" });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return null;
  }
  return data.user.id;
}

/**
 * La llama el Apps Script «AltaFamilias» por cada respuesta nueva del
 * formulario de incorporación de familias (pestaña FAMILIAS de «Familias Kiru
 * (respuestas)»). Crea la cuenta del alumno y una de familia por cada tutor con
 * correo, las enlaza (student_guardians) y devuelve los usuarios y los enlaces
 * «Crea tu PIN» de un solo uso para meterlos en los correos.
 *
 * Crear cuentas no activa ningún servicio: no asigna mentor, ni horario, ni
 * clases, ni pagos. Eso sigue saliendo de la pestaña «Familias» de Contabilidad
 * y del panel de administración.
 *
 * Se puede llamar las veces que haga falta con el mismo submissionId: el
 * alumno se crea una sola vez (kiru_family_intakes) y los tutores se buscan
 * por correo, así que nunca se duplica nada. Cuando la familia manda después
 * el correo que faltaba, se vuelve a llamar con él y solo se crea ese tutor.
 *
 * Datos del menor: la cuenta del alumno solo lleva su nombre y un usuario; su
 * correo es interno (@alumnos.campus-kiru.invalid) y nunca recibe correos.
 * Sin la autorización de la familia para crear la cuenta no se hace nada.
 * La protege la clave compartida KIRU_ALTA_SECRET (Vercel + Apps Script).
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  if (!url || !service || secret === "missing") {
    return NextResponse.json({ error: "El alta de familias no está configurada." }, { status: 503 });
  }
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: { submissionId?: unknown; authorized?: unknown; student?: unknown; guardians?: unknown; resend?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }

  const resend = body.resend === true;
  const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
  if (!SUBMISSION_RE.test(submissionId)) return NextResponse.json({ error: "Falta el número de envío del formulario." }, { status: 400 });
  if (body.authorized !== true) {
    return NextResponse.json({ error: "La familia no ha autorizado crear la cuenta en la Plataforma Kiru." }, { status: 400 });
  }
  const studentName = cleanName((body.student as { fullName?: unknown } | null)?.fullName);
  if (!studentName || studentName.length > 160) return NextResponse.json({ error: "Falta el nombre del alumno." }, { status: 400 });

  const rawGuardians = Array.isArray(body.guardians) ? body.guardians : [];
  if (rawGuardians.length > 2) return NextResponse.json({ error: "Como mucho dos tutores." }, { status: 400 });
  const guardians: GuardianIn[] = [];
  for (const raw of rawGuardians) {
    const g = (raw ?? {}) as Record<string, unknown>;
    const fullName = cleanName(g.fullName);
    const email = typeof g.email === "string" ? g.email.trim().toLowerCase() : "";
    const relationship = cleanName(g.relationship).slice(0, 40) || null;
    if (!fullName || fullName.length > 160 || !EMAIL_RE.test(email) || email.length > 320) {
      return NextResponse.json({ error: "Cada tutor necesita nombre y un correo válido." }, { status: 400 });
    }
    if (!guardians.some((x) => x.email === email)) guardians.push({ fullName, email, relationship });
  }

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Cuentas que ya existen para esos correos (un hermano, o un alta hecha a mano).
  const found = new Map<string, User | null>();
  try {
    for (const g of guardians) found.set(g.email, await findAuthUserByEmail(admin, g.email));
  } catch {
    return NextResponse.json({ error: "No se pudieron comprobar las cuentas existentes." }, { status: 500 });
  }

  // 2. El alumno: el de esta respuesta si ya se creó; si no, el que ya tenga un
  //    tutor de esta familia con el mismo nombre (alta a mano); si no, uno nuevo.
  let studentId: string | null = null;
  let studentStatus: Status = "already";
  const intake = await admin.from("kiru_family_intakes").select("student_id").eq("submission_id", submissionId).maybeSingle();
  if (intake.error) return NextResponse.json({ error: "No se pudo consultar el alta." }, { status: 500 });
  studentId = intake.data?.student_id ?? null;

  if (!studentId) {
    const existingIds = [...found.values()].filter((u): u is User => !!u).map((u) => u.id);
    if (existingIds.length) {
      const { data: links } = await admin.from("student_guardians").select("student_id").in("guardian_id", existingIds);
      const ids = [...new Set((links ?? []).map((l) => l.student_id))];
      if (ids.length) {
        const { data: kids } = await admin.from("profiles").select("id,full_name").in("id", ids).eq("role", "alumno");
        studentId = (kids ?? []).find((k) => sameName(k.full_name, studentName))?.id ?? null;
      }
    }
    let createdNow = false;
    if (!studentId) {
      const username = await freeUsername(admin, studentName, "alumno");
      if (!username) return NextResponse.json({ error: "No se pudo elegir un usuario para el alumno." }, { status: 500 });
      studentId = await createAccount(admin, `${username}@alumnos.campus-kiru.invalid`, studentName, username, "alumno");
      if (!studentId) return NextResponse.json({ error: "No se pudo crear la cuenta del alumno." }, { status: 500 });
      createdNow = true;
    }
    const saved = await admin.from("kiru_family_intakes").insert({ submission_id: submissionId, student_id: studentId });
    if (saved.error) {
      // 23505: otra llamada simultánea ya ha creado el alumno de esta respuesta; se usa ese.
      if (createdNow) await admin.auth.admin.deleteUser(studentId);
      const again = await admin.from("kiru_family_intakes").select("student_id").eq("submission_id", submissionId).maybeSingle();
      if (!again.data) return NextResponse.json({ error: "No se pudo guardar el alta del alumno." }, { status: 500 });
      studentId = again.data.student_id;
    } else {
      studentStatus = createdNow ? "created" : "already";
    }
  }

  const { data: student } = await admin.from("profiles").select("id,full_name,username,role,is_active").eq("id", studentId).maybeSingle();
  if (!student || student.role !== "alumno" || !student.username) {
    return NextResponse.json({ error: "La cuenta del alumno no está bien. Revísala en el panel de administración." }, { status: 409 });
  }
  let studentLink: Link = null;
  if (studentStatus === "created" || (resend && (await neverSignedIn(admin, student.id)))) {
    studentLink = await issueAccessLink(admin, student.id, request.url, LINK_MS);
    if (!studentLink) return NextResponse.json({ error: "No se pudo generar el enlace del alumno." }, { status: 500 });
    if (studentStatus !== "created") studentStatus = "resent";
  }

  // 3. Tutores: se buscan por correo o se crean, y se enlazan con el alumno.
  const { data: linkedRows } = await admin.from("student_guardians").select("guardian_id").eq("student_id", student.id);
  const alreadyLinked = new Set((linkedRows ?? []).map((r) => r.guardian_id));
  const results = [];
  for (const g of guardians) {
    const out: {
      email: string; fullName: string; status: Status; username?: string; hasSignedIn?: boolean;
      error?: string; accessUrl?: string; expiresAt?: string;
    } = { email: g.email, fullName: g.fullName, status: "error" };
    results.push(out);

    let id = found.get(g.email)?.id ?? null;
    let created = false;
    if (!id) {
      const username = await freeUsername(admin, g.fullName, "familia");
      id = username ? await createAccount(admin, g.email, g.fullName, username, "padre") : null;
      if (!id) {
        // Puede que otra llamada simultánea la haya creado: se reutiliza.
        id = (await findAuthUserByEmail(admin, g.email).catch(() => null))?.id ?? null;
        if (!id) { out.error = "No se pudo crear la cuenta."; continue; }
      } else {
        created = true;
      }
    }

    const { data: profile } = await admin.from("profiles").select("role,username,is_active").eq("id", id).maybeSingle();
    if (!profile || profile.role !== "padre") {
      out.error = `Ese correo ya es de una cuenta de ${profile?.role ?? "otro tipo"} del campus. No se ha tocado.`;
      continue;
    }
    if (!profile.is_active) { out.error = "La cuenta de familia está desactivada. Actívala en el panel de administración."; continue; }
    if (!profile.username) { out.error = "La cuenta de familia no tiene usuario. Revísala en el panel de administración."; continue; }
    out.username = profile.username;

    const fresh = created ? true : await neverSignedIn(admin, id);
    out.hasSignedIn = !fresh;

    if (!alreadyLinked.has(id)) {
      const { error: linkError } = await admin
        .from("student_guardians")
        .upsert({ student_id: student.id, guardian_id: id, relationship: g.relationship }, { onConflict: "student_id,guardian_id", ignoreDuplicates: true });
      if (linkError) { out.error = "No se pudo enlazar con el alumno."; continue; }
    }

    let status: Status = created ? "created" : alreadyLinked.has(id) ? "already" : "linked";
    if (created || (resend && fresh)) {
      const link = await issueAccessLink(admin, id, request.url, LINK_MS);
      if (!link) { out.error = "Cuenta enlazada, pero no se pudo generar el enlace de acceso."; continue; }
      if (!created) status = "resent";
      out.accessUrl = link.accessUrl;
      out.expiresAt = link.expiresAt;
    }
    out.status = status;
  }

  return NextResponse.json({
    ok: true,
    loginUrl: new URL("/", request.url).toString(),
    student: { id: student.id, fullName: student.full_name, username: student.username, status: studentStatus, ...(studentLink ?? {}) },
    guardians: results,
  });
}
