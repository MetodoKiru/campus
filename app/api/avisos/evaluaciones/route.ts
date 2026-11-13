import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";
import { mentorWindow } from "@/lib/evaluations";
import { evaluationLink, firstNameOf, holidaysFor } from "@/lib/server/evaluations";

export const runtime = "nodejs";

const PENDING_DAYS = 3;
const MAX_PER_CALL = 40;
/** Pasos que llevan al formulario de Jotform; el resto, al panel del campus. */
const FORM_STEPS = new Set(["abre", "r1", "r2"]);
const PANEL: Record<string, string> = { mentor: "/mentor", coordinador: "/coordinador", admin: "/coordinador", padre: "/padre" };

/**
 * Avisos de las evaluaciones trimestrales para mandarlos por correo desde
 * metodokiru@gmail.com. La llama cada 5 minutos el Apps Script «Evaluaciones»
 * (misma clave KIRU_ALTA_SECRET que los demás avisos). Devuelve lo necesario para
 * escribir el correo: a quién, de qué alumno, qué paso, el enlace, la firma (su
 * coordinador) y si la fecha cae en Navidad o Semana Santa. Cada aviso se
 * entrega una sola vez; los recordatorios de algo ya hecho no se mandan.
 */
export async function POST(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "Los avisos por correo no están configurados." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  const since = new Date(Date.now() - PENDING_DAYS * 86_400_000).toISOString();
  const { data: pending, error } = await admin.from("kiru_notifications")
    .select("id,recipient_id,student_id,title,body,event_key")
    .eq("email_status", "pendiente").eq("kind", "evaluacion_trimestral").gt("created_at", since)
    .order("created_at").limit(MAX_PER_CALL);
  if (error) return NextResponse.json({ error: "No se pudieron leer los avisos." }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ ok: true, avisos: [] });

  const { data: claimed, error: claimError } = await admin.from("kiru_notifications")
    .update({ email_status: "enviado", email_sent_at: new Date().toISOString() })
    .in("id", pending.map((n) => n.id)).eq("email_status", "pendiente").select("id");
  if (claimError) return NextResponse.json({ error: "No se pudieron reservar los avisos." }, { status: 500 });
  const claimedIds = new Set((claimed ?? []).map((r) => r.id));

  // eval:{id}:{paso}:{fecha}
  const parsed = pending.map((n) => {
    const [, evalId = "", step = ""] = n.event_key.split(":");
    return { n, evalId, step };
  });
  const evalIds = [...new Set(parsed.map((p) => p.evalId).filter(Boolean))];
  const { data: evals } = evalIds.length ? await admin.from("kiru_evaluations").select("*").in("id", evalIds) : { data: [] };
  const evalById = new Map((evals ?? []).map((e) => [e.id, e]));

  const recipients = [...new Set(pending.map((n) => n.recipient_id))];
  const studentIds = [...new Set((evals ?? []).map((e) => e.student_id))];
  const { data: people } = await admin.from("profiles").select("id,full_name,role,is_active").in("id", [...recipients, ...studentIds]);
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const emails = new Map<string, string>();
  await Promise.all(recipients.map(async (id) => {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user?.email) emails.set(id, data.user.email);
  }));

  // Firma: el coordinador actual del alumno (el de su mentor).
  const signature = new Map<string, string>();
  if (studentIds.length) {
    const { data: links } = await admin.from("student_mentors").select("student_id,mentor_id").in("student_id", studentIds);
    const mentorIds = [...new Set((links ?? []).map((l) => l.mentor_id))];
    const { data: coords } = mentorIds.length ? await admin.from("kiru_coordinator_mentors").select("mentor_id,coordinator_id").in("mentor_id", mentorIds) : { data: [] };
    const coordIds = [...new Set((coords ?? []).map((c) => c.coordinator_id))];
    const { data: coordPeople } = coordIds.length ? await admin.from("profiles").select("id,full_name,is_active").in("id", coordIds) : { data: [] };
    for (const sid of studentIds) {
      const mentors = (links ?? []).filter((l) => l.student_id === sid).map((l) => l.mentor_id);
      const coord = (coords ?? []).map((c) => mentors.includes(c.mentor_id) ? (coordPeople ?? []).find((p) => p.id === c.coordinator_id && p.is_active) : undefined).find(Boolean);
      if (coord) signature.set(sid, coord.full_name);
    }
  }
  const holidays = await holidaysFor(admin, (evals ?? []).map((e) => e.due_on));

  const avisos: Record<string, unknown>[] = [];
  const noEmail: string[] = [];
  for (const { n, evalId, step } of parsed) {
    if (!claimedIds.has(n.id)) continue;
    const e = evalById.get(evalId);
    const p = person.get(n.recipient_id);
    const email = emails.get(n.recipient_id) ?? "";
    const isReminder = step === "r1" || step === "r2" || step === "coord";
    if (!e || !p?.is_active || !email || email.endsWith(".invalid") || !PANEL[p.role]
        || e.status === "cancelada" || (isReminder && e.status === "completada")) {
      noEmail.push(n.id);
      continue;
    }
    const w = e.target === "mentor" ? mentorWindow(e.due_on) : null;
    const toForm = FORM_STEPS.has(step) && (p.role === "padre" || p.role === "mentor") && e.target !== "alumno";
    const panel = new URL(PANEL[p.role], request.url);
    if (p.role === "coordinador" || p.role === "admin") panel.searchParams.set("tab", "evaluaciones");
    avisos.push({
      email, name: p.full_name, role: p.role, step, target: e.target, cycle: e.cycle,
      studentName: firstNameOf(person.get(e.student_id)?.full_name ?? ""),
      dueOn: e.due_on, opensOn: w?.opensOn ?? null, closesOn: w?.closesOn ?? null,
      title: n.title, body: n.body,
      url: toForm ? evaluationLink(request.url, e.token) : panel.toString(),
      buttonLabel: toForm ? (p.role === "padre" ? "Rellenar la evaluación" : "Rellenar mi evaluación") : (p.role === "padre" ? "Ver en el campus" : "Abrir mi panel"),
      signature: signature.get(e.student_id) ?? "Equipo Método Kiru",
      holiday: e.target === "familia" ? holidays.get(e.due_on) ?? null : null,
    });
  }
  if (noEmail.length) await admin.from("kiru_notifications").update({ email_status: "sin_correo", email_sent_at: null }).in("id", noEmail);
  return NextResponse.json({ ok: true, avisos });
}
