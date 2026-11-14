import { NextResponse } from "next/server";
import type { ClassNotificationKind, ScheduleNotificationKind, SupervisionNotificationKind } from "@/lib/database.types";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

const PENDING_DAYS = 3;
const MAX_PER_CALL = 50;

export const CLASS_NOTIFICATION_KINDS: ClassNotificationKind[] = [
  "clase_solicitud", "clase_decision", "clase_mas_info", "recuperacion_propuesta", "recuperacion_confirmada",
  "recuperacion_sin_encaje", "recuperacion_nueva", "recuperacion_sin_avanzar", "recuperacion_recordatorio",
  "recuperacion_fin_periodo", "registro_aviso", "clase_incidencia",
];

// Supervisión metodológica: solicitudes de justificación y avisos a mentores.
// Las de «cerrada» van solo a la campanita (no llevan correo).
export const SUPERVISION_EMAIL_KINDS: SupervisionNotificationKind[] = [
  "justificacion_solicitada", "justificacion_respondida", "justificacion_repregunta", "justificacion_recordatorio",
  "justificacion_por_valorar", "aviso_metodologico", "aviso_seguimiento",
  // Errores marcados en un registro de sesión (desempeño, fase 2a).
  "registro_error", "registro_error_respuesta",
  // Evidencias bimestrales (desempeño, fase 2b). La entrega, la validación y las exenciones van solo a la campanita.
  "evidencia_aclaracion", "evidencia_recordatorio", "evidencia_revision",
];
// Cambio de intensidad: elegir nuevo horario, confirmarlo y disponibilidad del mentor.
const SCHEDULE_EMAIL_KINDS: ScheduleNotificationKind[] = [
  "horario_elegir", "horario_confirmar", "horario_confirmado", "horario_otro", "disponibilidad_actualizar",
  "disponibilidad_confirmar", "disponibilidad_urgente", "disponibilidad_falta",
];

// Si la revisión ya avanzó, el correo sobra.
const STILL_RELEVANT: Partial<Record<SupervisionNotificationKind, string[]>> = {
  justificacion_solicitada: ["pendiente_respuesta"],
  justificacion_repregunta: ["pendiente_respuesta"],
  justificacion_recordatorio: ["pendiente_respuesta"],
  justificacion_respondida: ["respondida", "pendiente_valoracion"],
  justificacion_por_valorar: ["respondida", "pendiente_valoracion"],
};

const PANEL: Record<string, string> = { mentor: "/mentor", coordinador: "/coordinador", admin: "/admin", padre: "/padre" };

/**
 * Avisos de clases (cambios, cancelaciones, recuperaciones, avisos de registro)
 * y de supervisión metodológica (justificaciones de SkillCoins y avisos a
 * mentores) para mandarlos por correo. La llama cada 5 minutos el Apps Script de avisos
 * (función kiruEnviarAvisosClases, misma clave KIRU_ALTA_SECRET). Cada aviso se
 * entrega una sola vez: se marca como enviado antes de devolverlo.
 */
export async function POST(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "Los avisos por correo no están configurados." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  const since = new Date(Date.now() - PENDING_DAYS * 86_400_000).toISOString();
  const { data: pending, error } = await admin.from("kiru_notifications")
    .select("id,recipient_id,kind,title,body,review_id,warning_id")
    .eq("email_status", "pendiente")
    .in("kind", [...CLASS_NOTIFICATION_KINDS, ...SUPERVISION_EMAIL_KINDS, ...SCHEDULE_EMAIL_KINDS, "periodo_especial"])
    .gt("created_at", since)
    .order("created_at")
    .limit(MAX_PER_CALL);
  if (error) return NextResponse.json({ error: "No se pudieron leer los avisos." }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ ok: true, avisos: [] });

  const { data: claimed, error: claimError } = await admin.from("kiru_notifications")
    .update({ email_status: "enviado", email_sent_at: new Date().toISOString() })
    .in("id", pending.map((n) => n.id)).eq("email_status", "pendiente").select("id");
  if (claimError) return NextResponse.json({ error: "No se pudieron reservar los avisos." }, { status: 500 });
  const claimedIds = new Set((claimed ?? []).map((r) => r.id));

  const recipients = [...new Set(pending.map((n) => n.recipient_id))];
  const { data: people } = await admin.from("profiles").select("id,full_name,role,is_active").in("id", recipients);
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const emails = new Map<string, string>();
  await Promise.all(recipients.map(async (id) => {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user?.email) emails.set(id, data.user.email);
  }));

  const reviewIds = [...new Set(pending.map((n) => n.review_id).filter((id): id is string => !!id))];
  const { data: reviewRows } = reviewIds.length
    ? await admin.from("kiru_skillcoin_reviews").select("id,status").in("id", reviewIds)
    : { data: [] as { id: string; status: string }[] };
  const reviewStatus = new Map((reviewRows ?? []).map((r) => [r.id, r.status]));

  const avisos: { email: string; name: string; role: string; kind: string; title: string; body: string; url: string }[] = [];
  const noEmail: string[] = [];
  for (const n of pending) {
    if (!claimedIds.has(n.id)) continue;
    const p = person.get(n.recipient_id);
    const email = emails.get(n.recipient_id) ?? "";
    if (!p?.is_active || !email || email.endsWith(".invalid") || !PANEL[p.role]) { noEmail.push(n.id); continue; }
    const relevant = STILL_RELEVANT[n.kind as SupervisionNotificationKind];
    if (relevant && n.review_id && !relevant.includes(reviewStatus.get(n.review_id) ?? "")) { noEmail.push(n.id); continue; }
    avisos.push({ email, name: p.full_name, role: p.role, kind: n.kind, title: n.title, body: n.body, url: panelUrl(p.role, n, request.url) });
  }
  if (noEmail.length) await admin.from("kiru_notifications").update({ email_status: "sin_correo", email_sent_at: null }).in("id", noEmail);
  return NextResponse.json({ ok: true, avisos });
}

/** Enlace del botón del correo: a la revisión o al aviso concreto cuando lo hay. */
function panelUrl(role: string, n: { kind: string; review_id: string | null; warning_id: string | null }, base: string): string {
  const supervision = (SUPERVISION_EMAIL_KINDS as string[]).includes(n.kind);
  // Administración supervisa desde el panel de coordinación.
  const url = new URL(supervision && role === "admin" ? "/coordinador" : PANEL[role], base);
  if (n.kind === "periodo_especial") url.searchParams.set(role === "mentor" ? "seccion" : "tab", "vacaciones");
  if (n.kind.startsWith("disponibilidad_") && role === "mentor") url.searchParams.set("seccion", "disponibilidad");
  if (n.kind === "disponibilidad_falta" && role === "admin") url.searchParams.set("seccion", "horarios");
  const evidence = n.kind.startsWith("evidencia_");
  if (supervision && evidence) {
    url.searchParams.set(role === "mentor" ? "seccion" : "tab", role === "mentor" ? "evidencias" : "seguimiento");
  } else if (supervision) {
    if (role === "mentor") {
      url.searchParams.set("seccion", "justificaciones");
      if (n.review_id) url.searchParams.set("revision", n.review_id);
      else if (n.warning_id) url.searchParams.set("aviso", n.warning_id);
    } else if (n.kind.startsWith("registro_error")) {
      url.searchParams.set("tab", "seguimiento");
    } else {
      url.searchParams.set("tab", "supervision");
      if (n.review_id) url.searchParams.set("revision", n.review_id);
    }
  }
  return url.toString();
}
