import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";

export const runtime = "nodejs";
const STAFF = ["formador", "admin"] as const;
const REVIEW_STATUSES = ["en_revision", "completado", "requiere_correccion"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Pasos del menú del mentor que esperan revisión o corrección. */
export async function GET(request: Request) {
  const auth = await requireStaff(request, STAFF);
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const { data: rows, error } = await admin
    .from("kiru_mentor_steps")
    .select("mentor_id,step,status,submitted_at,review_note,document_path,holder_name")
    .in("step", ["certificado", "nuestro_equipo"])
    .in("status", ["enviado", "en_revision", "requiere_correccion"])
    .order("submitted_at", { ascending: true });
  if (error) return NextResponse.json({ error: "No se pudieron cargar los pasos pendientes." }, { status: 500 });

  const ids = Array.from(new Set((rows ?? []).map((r) => r.mentor_id)));
  const { data: profiles, error: profilesError } = ids.length
    ? await admin.from("profiles").select("id,full_name,username").in("id", ids)
    : { data: [], error: null };
  if (profilesError) return NextResponse.json({ error: "No se pudieron cargar los mentores." }, { status: 500 });
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const items = (rows ?? []).map((r) => ({
    mentorId: r.mentor_id,
    mentorName: byId.get(r.mentor_id)?.full_name ?? "Mentor",
    username: byId.get(r.mentor_id)?.username ?? null,
    step: r.step,
    status: r.status,
    submittedAt: r.submitted_at,
    note: r.review_note,
    hasDocument: Boolean(r.document_path),
    holderName: r.holder_name,
  }));
  return NextResponse.json({ items });
}

/**
 * Revisión de administración o del formador: en revisión, completado o
 * requiere corrección (con motivo, que ve el mentor). Si se completa el
 * certificado de un mentor con ficha de incorporación, se marca también allí,
 * que es lo que desbloquea asignarle alumnos.
 */
export async function POST(request: Request) {
  const auth = await requireStaff(request, STAFF);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: { mentorId?: unknown; step?: unknown; status?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const mentorId = typeof body.mentorId === "string" && UUID_RE.test(body.mentorId) ? body.mentorId : null;
  const step = body.step === "certificado" || body.step === "nuestro_equipo" ? body.step : null;
  const status = REVIEW_STATUSES.includes(body.status as ReviewStatus) ? (body.status as ReviewStatus) : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (!mentorId || !step || !status) return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });
  if (status === "requiere_correccion" && !note) return NextResponse.json({ error: "Escribe el motivo para que el mentor sepa qué corregir." }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("kiru_mentor_steps")
    .update({ status, review_note: status === "requiere_correccion" ? note : "", reviewed_at: now, reviewed_by: user.id })
    .eq("mentor_id", mentorId)
    .eq("step", step)
    .select("mentor_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo guardar la revisión." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Ese mentor no ha entregado este paso." }, { status: 404 });

  if (step === "certificado" && status === "completado") {
    const { error: onboardingError } = await admin
      .from("kiru_mentor_onboarding")
      .update({ certificate_checked_at: now, certificate_checked_by: user.id })
      .eq("profile_id", mentorId)
      .is("certificate_checked_at", null);
    if (onboardingError) return NextResponse.json({ error: "Revisión guardada, pero no se pudo marcar en la ficha de incorporación." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
