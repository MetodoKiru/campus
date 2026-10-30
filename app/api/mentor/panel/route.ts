import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";
import { linkOffersToMentor } from "@/lib/server/assignment-offers";
import type { MentorPanelData, MentorOffer, StepStatus } from "@/lib/mentor-steps";

export const runtime = "nodejs";

/** Formulario «Nuestro Equipo» (Google Forms) que ya alimenta la página Equipo de la web. */
const TEAM_FORM_URL = "https://docs.google.com/forms/d/1_J5QUAv-RgDhbOL3DTpqrwh2gY_ghm8ARFMIdG67cos/viewform";
/** Punto de integración del futuro formulario de llamadas en Jotform (fase 2). */
const CALLS_FORM_URL = process.env.NEXT_PUBLIC_KIRU_LLAMADAS_FORM_URL ?? "";

/**
 * Estado real de los cuatro pasos del menú del mentor y sus propuestas de
 * alumno. Solo devuelve lo del mentor que llama; nunca los enlaces firmados
 * del correo ni datos de otros mentores.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  // Propuestas que llegaron antes de que el correo del mentor tuviera cuenta.
  if (user.email) await linkOffersToMentor(admin, user.id, user.email);

  const [stepsResult, onboardingResult, offersResult] = await Promise.all([
    admin.from("kiru_mentor_steps").select("step,status,submitted_at,reviewed_at,review_note").eq("mentor_id", user.id),
    admin.from("kiru_mentor_onboarding").select("certificate_checked_at").eq("profile_id", user.id).is("archived_at", null).maybeSingle(),
    admin.from("kiru_assignment_offers")
      .select("id,course,student_profile,zone,intensity,slots,sent_at,response,response_detail,responded_at")
      .eq("mentor_id", user.id)
      .order("sent_at", { ascending: false })
      .limit(50),
  ]);
  if (stepsResult.error || onboardingResult.error || offersResult.error) {
    return NextResponse.json({ error: "No se pudo cargar tu progreso." }, { status: 500 });
  }

  const rows = new Map((stepsResult.data ?? []).map((row) => [row.step, row]));
  const fromRow = (step: "certificado" | "nuestro_equipo" | "llamadas") => {
    const row = rows.get(step);
    if (!row) return { status: "pendiente" as StepStatus, date: null, note: "" };
    return { status: row.status as StepStatus, date: row.reviewed_at ?? row.submitted_at, note: row.review_note };
  };

  // El certificado se da por bueno con la casilla que ya marca el formador.
  const checkedAt = onboardingResult.data?.certificate_checked_at ?? null;
  const certificado = checkedAt ? { status: "completado" as StepStatus, date: checkedAt, note: "" } : fromRow("certificado");

  const offers: MentorOffer[] = (offersResult.data ?? []).map((o) => ({
    id: o.id,
    course: o.course,
    studentProfile: o.student_profile,
    zone: o.zone,
    intensity: o.intensity,
    slots: o.slots,
    sentAt: o.sent_at,
    response: o.response,
    responseDetail: o.response_detail,
    respondedAt: o.responded_at,
  }));
  const waiting = offers.filter((o) => !o.response);
  const asignacion = waiting.length
    ? { status: "pendiente" as StepStatus, date: waiting[0].sentAt, note: waiting.length === 1 ? "Tienes una propuesta nueva" : `Tienes ${waiting.length} propuestas nuevas` }
    : offers.length
      ? { status: "enviado" as StepStatus, date: offers[0].respondedAt, note: "Has respondido a todas tus propuestas" }
      : { status: "pendiente" as StepStatus, date: null, note: "Aún no tienes propuestas" };

  const data: MentorPanelData = {
    steps: { certificado, nuestro_equipo: fromRow("nuestro_equipo"), llamadas: fromRow("llamadas"), asignacion },
    offers,
    teamFormUrl: TEAM_FORM_URL,
    callsFormUrl: CALLS_FORM_URL,
  };
  return NextResponse.json(data);
}

/**
 * El mentor confirma un paso que no lleva archivo: «Ya he enviado Nuestro
 * Equipo» (queda enviado hasta que administración lo revise y lo publique) o «He leído
 * cómo son las llamadas». Nunca puede marcarse él mismo como revisado.
 */
export async function POST(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: { step?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const step = body.step;
  if (step !== "nuestro_equipo" && step !== "llamadas") return NextResponse.json({ error: "Paso no válido." }, { status: 400 });

  const { data: current } = await admin.from("kiru_mentor_steps").select("status").eq("mentor_id", user.id).eq("step", step).maybeSingle();
  if (current?.status === "completado") return NextResponse.json({ ok: true });

  const status = step === "llamadas" ? "completado" : "enviado";
  const { error } = await admin.from("kiru_mentor_steps").upsert({
    mentor_id: user.id,
    step,
    status,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    review_note: "",
  });
  if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
