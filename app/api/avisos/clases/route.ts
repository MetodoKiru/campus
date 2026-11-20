import { NextResponse } from "next/server";
import type { SupervisionNotificationKind } from "@/lib/database.types";
import { buildDigests, CLASS_ROUTE_KINDS, loadDigestSettings, loadFamilyCap, PANEL, panelUrl, STILL_RELEVANT, withinFamilyCap, withoutDigestNotices } from "@/lib/server/avisos-resumen";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

const PENDING_DAYS = 3;
const MAX_PER_CALL = 50;

/**
 * Avisos de clases (cambios, cancelaciones, recuperaciones, avisos de registro)
 * y de supervisión metodológica (justificaciones de SkillCoins y avisos a
 * mentores) para mandarlos por correo. La llama cada 5 minutos el Apps Script de avisos
 * (función kiruEnviarAvisosClases, misma clave KIRU_ALTA_SECRET). Cada aviso se
 * entrega una sola vez: se marca como enviado antes de devolverlo.
 *
 * Resumen diario (ajuste «avisos_resumen»): para mentores y coordinadores, lo que no
 * es urgente no sale al momento; a partir de las 19:00 se junta en un solo correo
 * por persona (también los avisos de evaluaciones y llamadas). Ese correo llega con
 * kind «resumen» y la lista en «items».
 */
export async function POST(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "Los avisos por correo no están configurados." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  const since = new Date(Date.now() - PENDING_DAYS * 86_400_000).toISOString();
  const digest = await loadDigestSettings(admin);
  const { data: found, error } = await admin.from("kiru_notifications")
    .select("id,recipient_id,kind,title,body,review_id,warning_id")
    .eq("email_status", "pendiente")
    .in("kind", CLASS_ROUTE_KINDS)
    .gt("created_at", since)
    .order("created_at")
    .limit(MAX_PER_CALL * 4);
  if (error) return NextResponse.json({ error: "No se pudieron leer los avisos." }, { status: 500 });
  // Los que esperan al resumen se quedan «pendiente» hasta su hora.
  const waiting = await withoutDigestNotices(admin, digest, found ?? []);
  // Familias: como mucho N correos al día y M a la semana por adulto (ajuste «avisos_tope_familias»).
  const pending = (await withinFamilyCap(admin, await loadFamilyCap(admin), waiting)).slice(0, MAX_PER_CALL);
  const resumenes = await buildDigests(admin, digest, request.url).catch((e) => {
    console.error("Resumen diario de avisos", e);
    return [];
  });
  if (!pending.length) return NextResponse.json({ ok: true, avisos: resumenes });

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

  const avisos: { email: string; name: string; role: string; kind: string; title: string; body: string; url: string }[] = [...resumenes];
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
