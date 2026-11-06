import { NextResponse } from "next/server";
import type { ClassNotificationKind } from "@/lib/database.types";
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

const PANEL: Record<string, string> = { mentor: "/mentor", coordinador: "/coordinador", admin: "/admin", padre: "/padre" };

/**
 * Avisos de clases (cambios, cancelaciones, recuperaciones, avisos de registro)
 * para mandarlos por correo. La llama cada 5 minutos el Apps Script de avisos
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
    .select("id,recipient_id,kind,title,body")
    .eq("email_status", "pendiente")
    .in("kind", CLASS_NOTIFICATION_KINDS)
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

  const avisos: { email: string; name: string; role: string; kind: string; title: string; body: string; url: string }[] = [];
  const noEmail: string[] = [];
  for (const n of pending) {
    if (!claimedIds.has(n.id)) continue;
    const p = person.get(n.recipient_id);
    const email = emails.get(n.recipient_id) ?? "";
    if (!p?.is_active || !email || email.endsWith(".invalid") || !PANEL[p.role]) { noEmail.push(n.id); continue; }
    avisos.push({ email, name: p.full_name, role: p.role, kind: n.kind, title: n.title, body: n.body, url: new URL(PANEL[p.role], request.url).toString() });
  }
  if (noEmail.length) await admin.from("kiru_notifications").update({ email_status: "sin_correo", email_sent_at: null }).in("id", noEmail);
  return NextResponse.json({ ok: true, avisos });
}
