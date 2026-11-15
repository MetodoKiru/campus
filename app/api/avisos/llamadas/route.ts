import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";
import { callWhen } from "@/lib/llamadas";
import { firstName, formLink, loadCallSettings, planTimes, planWhatsapp, runCallsTask, teamFormUrl, whatsappLink, zoomOf } from "@/lib/server/llamadas";

export const runtime = "nodejs";

const PENDING_DAYS = 3;
const MAX_PER_CALL = 40;
const PANEL: Record<string, string> = { mentor: "/mentor", coordinador: "/coordinador?tab=llamadas", admin: "/coordinador?tab=llamadas", padre: "/padre" };

/**
 * Avisos de las llamadas semanales para mandarlos por correo desde metodokiru@gmail.com.
 * La llama cada 5 minutos el Apps Script «Llamadas» (misma clave KIRU_ALTA_SECRET que los
 * demás avisos). Antes de responder pone al día las llamadas (así el aviso de «valora al
 * mentor» sale justo después de la llamada). Cada aviso se entrega una sola vez.
 *
 * Pasos (event_key = llamada:{paso}:…): pedir_form, hora, sin_hueco, valorar, valorar_r, movida.
 */
export async function POST(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "Los avisos por correo no están configurados." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  const task = await runCallsTask(admin).catch(() => null);
  const since = new Date(Date.now() - PENDING_DAYS * 86_400_000).toISOString();
  const { data: pending, error } = await admin.from("kiru_notifications")
    .select("id,recipient_id,student_id,title,body,event_key")
    .eq("email_status", "pendiente").eq("kind", "llamada_familia").gt("created_at", since)
    .order("created_at").limit(MAX_PER_CALL);
  if (error) return NextResponse.json({ error: "No se pudieron leer los avisos." }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ ok: true, task, avisos: [] });

  const { data: claimed, error: claimError } = await admin.from("kiru_notifications")
    .update({ email_status: "enviado", email_sent_at: new Date().toISOString() })
    .in("id", pending.map((n) => n.id)).eq("email_status", "pendiente").select("id");
  if (claimError) return NextResponse.json({ error: "No se pudieron reservar los avisos." }, { status: 500 });
  const claimedIds = new Set((claimed ?? []).map((r) => r.id));

  const settings = await loadCallSettings(admin);
  const ids = [...new Set(pending.flatMap((n) => [n.recipient_id, n.student_id]).filter((x): x is string => !!x))];
  const { data: people } = await admin.from("profiles").select("id,full_name,role,is_active").in("id", ids);
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const origin = new URL(request.url).origin;
  const noEmail: string[] = [];
  const avisos: Record<string, unknown>[] = [];

  for (const n of pending) {
    if (!claimedIds.has(n.id)) continue;
    const to = person.get(n.recipient_id);
    const { data: authUser } = await admin.auth.admin.getUserById(n.recipient_id);
    const email = authUser.user?.email ?? "";
    if (!to?.is_active || !email || email.endsWith(".invalid")) { noEmail.push(n.id); continue; }
    const step = n.event_key.split(":")[1] ?? "";
    const plan = n.student_id ? (await admin.from("kiru_call_plans").select("*").eq("student_id", n.student_id).maybeSingle()).data : null;
    const kid = firstName(person.get(n.student_id ?? "")?.full_name ?? "");
    const aviso: Record<string, unknown> = {
      email, name: firstName(to.full_name), role: to.role, step, studentName: kid, title: n.title, body: n.body,
      panelUrl: `${origin}${PANEL[to.role] ?? "/"}`,
    };
    if (plan) {
      const t = planTimes(plan);
      aviso.fixed = t.fixed;
      aviso.mentorFixed = t.mentorFixed;
      aviso.medium = plan.medium;
      aviso.zoomUrl = plan.medium === "zoom" ? await zoomOf(admin, plan.coordinator_id) : "";
      aviso.coordinatorName = firstName(person.get(plan.coordinator_id ?? "")?.full_name ?? (await admin.from("profiles").select("full_name").eq("id", plan.coordinator_id ?? "").maybeSingle()).data?.full_name ?? "");
      if (step === "pedir_form") aviso.formUrl = formLink(settings.familyForm, settings.codeField, plan.token, { email });
      if (step === "hora" && (to.role === "coordinador" || to.role === "admin")) aviso.whatsappUrl = whatsappLink(await planWhatsapp(admin, plan));
      if (step === "sin_hueco") aviso.teamFormUrl = await teamFormUrl(admin, n.recipient_id, email, to.full_name);
    }
    if (step === "valorar" || step === "valorar_r" || step === "movida") {
      const callId = n.event_key.split(":")[2] ?? "";
      const { data: call } = await admin.from("kiru_family_calls").select("id,scheduled_start,status").eq("id", callId).maybeSingle();
      // Si ya la valoró, no se manda el recordatorio.
      if (!call || (step !== "movida" && call.status !== "programada")) { noEmail.push(n.id); continue; }
      aviso.when = callWhen(call.scheduled_start);
      if (step !== "movida") aviso.rateUrl = `${origin}/coordinador?tab=llamadas&llamada=${call.id}`;
    }
    avisos.push(aviso);
  }

  if (noEmail.length) await admin.from("kiru_notifications").update({ email_status: "sin_correo", email_sent_at: null }).in("id", noEmail);
  return NextResponse.json({ ok: true, task, avisos });
}
