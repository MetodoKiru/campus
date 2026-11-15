import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import type { Json } from "@/lib/database.types";
import { parseAvailability } from "@/lib/llamadas";
import { loadCallSettings, matchPlan, scopeStudents } from "@/lib/server/llamadas";

export const runtime = "nodejs";

/** Solo las respuestas (q1_…), recortadas: el resto de rawRequest es técnico. */
function cleanAnswers(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw).slice(0, 300)) {
    if (!/^q\d+_/.test(key)) continue;
    const json = JSON.stringify(value ?? null);
    out[key] = json.length <= 2000 ? value ?? null : json.slice(0, 2000);
  }
  return out;
}

/**
 * Webhook de Jotform de los dos formularios «Disponibilidad para llamadas» (familias y equipo).
 * Guarda la respuesta (cuenta la última) y vuelve a buscar la hora de las llamadas afectadas.
 * La persona se reconoce por el código oculto del enlace del campus; si no lo trae (alguien abrió
 * el formulario sin el enlace), por el correo; si tampoco, queda para enlazarla a mano.
 */
export async function POST(request: Request) {
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "No está configurado." }, { status: 503 });
  let raw: Record<string, unknown> = {};
  let submissionId = "";
  let pretty = "";
  let formId = "";
  try {
    const form = await request.formData();
    submissionId = String(form.get("submissionID") ?? "").slice(0, 64);
    formId = String(form.get("formID") ?? "").slice(0, 32);
    pretty = String(form.get("pretty") ?? "").slice(0, 20000);
    const rawRequest = form.get("rawRequest");
    if (typeof rawRequest === "string") raw = JSON.parse(rawRequest);
  } catch {
    return NextResponse.json({ ok: false, error: "Respuesta no válida." }, { status: 400 });
  }
  const settings = await loadCallSettings(admin);
  const familyId = settings.familyForm.match(/\d{10,}/)?.[0] ?? "";
  const teamId = settings.teamForm.match(/\d{10,}/)?.[0] ?? "";
  const p = parseAvailability(pretty, raw, settings.codeField);
  const kind = formId && formId === teamId ? "equipo" : formId && formId === familyId ? "familia" : p.role ? "equipo" : "familia";

  let studentId: string | null = null;
  let profileId: string | null = null;
  if (kind === "familia") {
    if (p.code) {
      const { data } = await admin.from("kiru_call_plans").select("student_id").eq("token", p.code).maybeSingle();
      studentId = data?.student_id ?? null;
    }
  } else {
    if (p.code) {
      const { data } = await admin.from("kiru_call_staff").select("profile_id").eq("token", p.code).maybeSingle();
      profileId = data?.profile_id ?? null;
    }
    if (!profileId && p.email) {
      // Por correo de la cuenta del campus.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = list?.users.find((x) => x.email?.toLowerCase() === p.email);
      if (u) {
        const { data: prof } = await admin.from("profiles").select("id,role").eq("id", u.id).maybeSingle();
        if (prof && ["mentor", "coordinador", "admin"].includes(prof.role)) profileId = prof.id;
      }
    }
  }

  const { error } = await admin.from("kiru_call_availability").insert({
    kind, student_id: studentId, profile_id: profileId, role_label: p.role, name: (p.name || p.studentName).slice(0, 200),
    email: p.email, slots: p.slots as unknown as Json, both_parents_days: p.bothParentsDays, medium: p.medium, phone: p.phone,
    commitments: p.commitments, submission_id: submissionId || null,
    answers: { ...cleanAnswers(raw), ...(pretty ? { _resumen: pretty } : {}), ...(p.studentName ? { _alumno: p.studentName } : {}) } as Json,
  });
  if (error && !/duplicate/i.test(error.message)) return NextResponse.json({ ok: false }, { status: 500 });

  // Volver a buscar la hora de los alumnos afectados (solo los que están dentro del sistema).
  const scope = new Set(await scopeStudents(admin, settings));
  const affected = new Set<string>();
  if (studentId) affected.add(studentId);
  if (profileId) {
    const { data } = await admin.from("kiru_call_plans").select("student_id").or(`mentor_id.eq.${profileId},coordinator_id.eq.${profileId}`);
    for (const r of data ?? []) affected.add(r.student_id);
  }
  for (const id of affected) if (scope.has(id)) await matchPlan(admin, id);
  return NextResponse.json({ ok: true, linked: Boolean(studentId || profileId), replanned: [...affected].filter((id) => scope.has(id)).length });
}
