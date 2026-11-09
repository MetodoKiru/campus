import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { ACCESS_LINK_DAYS, findAuthUserByEmail, freeUsername, issueAccessLink } from "@/lib/server/access-links";
import { normalizeName, runFamilyIntake, type GuardianIn, type IntakeInput, type IntakeStore } from "@/lib/server/family-intake";
import { EMAIL_RE } from "@/lib/server/require-staff";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";
type Admin = SupabaseClient<Database>;

const LINK_MS = ACCESS_LINK_DAYS * 24 * 60 * 60 * 1000;
const SUBMISSION_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function supabaseStore(admin: Admin, baseUrl: string): IntakeStore {
  return {
    async findAccountIdByEmail(email) {
      return (await findAuthUserByEmail(admin, email))?.id ?? null;
    },
    async getProfile(id) {
      const { data } = await admin.from("profiles").select("id,full_name,username,role,is_active").eq("id", id).maybeSingle();
      return data ? { id: data.id, fullName: data.full_name, username: data.username, role: data.role, isActive: data.is_active } : null;
    },
    async hasSignedIn(id) {
      const { data } = await admin.auth.admin.getUserById(id);
      return !!data.user?.last_sign_in_at;
    },
    async createAccount(role, fullName, email) {
      const username = await freeUsername(admin, fullName, role === "alumno" ? "alumno" : "familia");
      if (!username) return null;
      // El alumno no tiene correo: uno interno que nunca recibe nada, como en administración.
      const { data, error } = await admin.auth.admin.createUser({
        email: email ?? `${username}@alumnos.campus-kiru.invalid`,
        // Contraseña provisional larga que nadie conoce; el PIN se pone con el enlace.
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
    },
    async deleteAccount(id) {
      await admin.auth.admin.deleteUser(id);
    },
    async getIntake(submissionId) {
      const { data, error } = await admin.from("kiru_family_intakes").select("student_id").eq("submission_id", submissionId).maybeSingle();
      if (error) throw error;
      return data?.student_id ?? null;
    },
    async saveIntake(submissionId, studentId) {
      const { error } = await admin.from("kiru_family_intakes").insert({ submission_id: submissionId, student_id: studentId });
      if (!error) return "ok";
      return error.code === "23505" ? "conflict" : "error";
    },
    async findStudentsNamed(fullName) {
      const { data, error } = await admin.from("profiles").select("id,full_name,username,role,is_active").eq("role", "alumno");
      if (error) throw error;
      const wanted = normalizeName(fullName);
      return (data ?? [])
        .filter((p) => normalizeName(p.full_name) === wanted)
        .map((p) => ({ id: p.id, fullName: p.full_name, username: p.username, role: p.role, isActive: p.is_active }));
    },
    async guardianIdsOf(studentId) {
      const { data, error } = await admin.from("student_guardians").select("guardian_id").eq("student_id", studentId);
      if (error) throw error;
      return (data ?? []).map((r) => r.guardian_id);
    },
    async linkGuardian(studentId, guardianId, relationship) {
      const { error } = await admin
        .from("student_guardians")
        .upsert({ student_id: studentId, guardian_id: guardianId, relationship }, { onConflict: "student_id,guardian_id", ignoreDuplicates: true });
      return !error;
    },
    issueLink(profileId) {
      return issueAccessLink(admin, profileId, baseUrl, LINK_MS);
    },
  };
}

/**
 * La llama el Apps Script «AltaFamilias» por cada respuesta del formulario de
 * incorporación de familias (pestaña FAMILIAS de «Familias Kiru (respuestas)»).
 * Crea la cuenta del alumno y una de familia por cada tutor con correo, las
 * enlaza (student_guardians) y devuelve los usuarios y los enlaces «Crea tu
 * PIN» de un solo uso. La lógica está en lib/server/family-intake.ts.
 *
 * - Nunca duplica: el alumno se recuerda por el número de envío
 *   (kiru_family_intakes) y los tutores se buscan por correo.
 * - Nunca reutiliza un alumno por coincidir el nombre: si ya hay uno con el
 *   mismo nombre, responde { review: true } y no crea nada hasta que Sofía
 *   decide (studentId de ese alumno, o newStudent: true).
 * - Solo hay enlace al crear una cuenta o para los correos de resendTo, uno a
 *   uno: reenviar a un tutor no invalida el enlace que ya recibió el otro.
 * - No activa ningún servicio: no asigna mentor, horario, clases ni pagos.
 * - Sin la autorización de la familia no se hace nada.
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

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }

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

  const chosenId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (chosenId && !UUID_RE.test(chosenId)) return NextResponse.json({ error: "El id de alumno no es válido." }, { status: 400 });
  const input: IntakeInput = {
    submissionId,
    studentName,
    guardians,
    studentDecision: chosenId ? { kind: "existing", studentId: chosenId } : body.newStudent === true ? { kind: "new" } : null,
    resendTo: Array.isArray(body.resendTo) ? body.resendTo.filter((e): e is string => typeof e === "string").map((e) => e.trim().toLowerCase()) : [],
    resendStudent: body.resendStudent === true,
  };

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  let result;
  try {
    result = await runFamilyIntake(supabaseStore(admin, request.url), input);
  } catch {
    return NextResponse.json({ error: "No se pudo consultar el campus. Se reintentará." }, { status: 500 });
  }
  if (result.kind === "failed") return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.kind === "review") {
    return NextResponse.json({ ok: true, review: true, reason: result.reason, candidates: result.candidates });
  }
  return NextResponse.json({ ok: true, loginUrl: new URL("/", request.url).toString(), student: result.student, guardians: result.guardians });
}
