import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";
import { text } from "@/lib/server/growth";

export const runtime = "nodejs";

/**
 * Autorizaciones excepcionales de incorporación (solo administración).
 * Lista cada mentor con el estado REAL de sus pasos y el historial de
 * autorizaciones. Autorizar o retirar nunca cambia los pasos.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const [mentors, steps, onboarding, exceptions] = await Promise.all([
    admin.from("profiles").select("id,full_name,username").eq("role", "mentor").eq("is_active", true).order("full_name"),
    admin.from("kiru_mentor_steps").select("mentor_id,step,status"),
    admin.from("kiru_mentor_onboarding").select("profile_id,certificate_checked_at").is("archived_at", null),
    admin.from("kiru_onboarding_exceptions").select("id,mentor_id,reason,granted_by,granted_at,revoked_at,revoked_by,revoke_reason").order("granted_at", { ascending: false }),
  ]);
  if (mentors.error || steps.error || onboarding.error || exceptions.error) return NextResponse.json({ error: "No se pudieron cargar los mentores." }, { status: 500 });

  const adminIds = [...new Set((exceptions.data ?? []).flatMap((e) => [e.granted_by, e.revoked_by]).filter((v): v is string => Boolean(v)))];
  const { data: admins } = adminIds.length ? await admin.from("profiles").select("id,full_name").in("id", adminIds) : { data: [] as { id: string; full_name: string }[] };
  const name = new Map((admins ?? []).map((a) => [a.id, a.full_name]));
  const certified = new Set((onboarding.data ?? []).filter((o) => o.certificate_checked_at).map((o) => o.profile_id));
  const stepStatus = new Map((steps.data ?? []).map((s) => [`${s.mentor_id}:${s.step}`, s.status]));

  return NextResponse.json({
    mentors: (mentors.data ?? []).map((m) => {
      const status = (step: string) => stepStatus.get(`${m.id}:${step}`) ?? "pendiente";
      const pasos = {
        certificado: certified.has(m.id) ? "completado" : status("certificado"),
        nuestro_equipo: status("nuestro_equipo"),
        llamadas: status("llamadas"),
      };
      return {
        id: m.id,
        name: m.full_name,
        username: m.username,
        steps: pasos,
        onboardingComplete: Object.values(pasos).every((s) => s === "completado"),
      };
    }),
    exceptions: (exceptions.data ?? []).map((e) => ({
      id: e.id, mentorId: e.mentor_id, reason: e.reason, grantedBy: e.granted_by ? name.get(e.granted_by) ?? "" : "", grantedAt: e.granted_at,
      revokedAt: e.revoked_at, revokedBy: e.revoked_by ? name.get(e.revoked_by) ?? "" : "", revokeReason: e.revoke_reason,
    })),
  });
}

/** Autorizar a un mentor a continuar sin completar la incorporación. Motivo obligatorio. */
export async function POST(request: Request) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: { mentorId?: unknown; reason?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const mentorId = typeof body.mentorId === "string" && UUID_RE.test(body.mentorId) ? body.mentorId : null;
  const reason = text(body.reason, 1000);
  if (!mentorId) return NextResponse.json({ error: "Elige el mentor." }, { status: 400 });
  if (reason.length < 5) return NextResponse.json({ error: "Escribe el motivo de la autorización." }, { status: 400 });

  const { error } = await admin.from("kiru_onboarding_exceptions").insert({ mentor_id: mentorId, reason, granted_by: user.id });
  if (error?.code === "23505") return NextResponse.json({ error: "Este mentor ya tiene una autorización en vigor." }, { status: 409 });
  if (error?.code === "23514") return NextResponse.json({ error: "Solo se puede autorizar a un mentor." }, { status: 400 });
  if (error) return NextResponse.json({ error: "No se pudo guardar la autorización." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Retirar una autorización en vigor. Queda en el historial quién y cuándo. */
export async function PATCH(request: Request) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: { id?: unknown; reason?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ error: "Autorización no válida." }, { status: 400 });

  const { data, error } = await admin.from("kiru_onboarding_exceptions")
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id, revoke_reason: text(body.reason, 1000) })
    .eq("id", id).is("revoked_at", null).select("id");
  if (error) return NextResponse.json({ error: "No se pudo retirar la autorización." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Esa autorización ya estaba retirada." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
