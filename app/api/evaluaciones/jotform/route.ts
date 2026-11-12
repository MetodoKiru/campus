import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import type { Json } from "@/lib/database.types";
import { madridTodayIso, mentorWindow } from "@/lib/evaluations";

export const runtime = "nodejs";

const TOKEN_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/** Solo las respuestas (q1_…, q2_…), recortadas: el resto de rawRequest es técnico. */
function cleanAnswers(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw).slice(0, 300)) {
    if (!/^q\d+_/.test(key)) continue;
    if (typeof value === "string") { out[key] = value.slice(0, 4000); continue; }
    const json = JSON.stringify(value ?? null);
    out[key] = json.length <= 4000 ? value ?? null : json.slice(0, 4000);
  }
  return out;
}

/** Busca el código de la evaluación en el campo oculto «kiru_eval» de la respuesta. */
function findToken(raw: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(raw)) {
    if (/kiru_?eval/i.test(key) && typeof value === "string") {
      const m = value.match(TOKEN_RE);
      if (m) return m[0].toLowerCase();
    }
  }
  return null;
}

/**
 * Webhook de Jotform (Ajustes → Integraciones → Webhooks) de los dos formularios
 * trimestrales. Al llegar una respuesta, marca la evaluación como hecha: el aviso
 * desaparece del campus y no salen más recordatorios. Sin código válido no hace
 * nada (el código es secreto: solo va en el enlace de cada persona).
 */
export async function POST(request: Request) {
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "No está configurado." }, { status: 503 });
  let raw: Record<string, unknown> = {};
  let submissionId = "";
  try {
    const form = await request.formData();
    submissionId = String(form.get("submissionID") ?? "").slice(0, 64);
    const rawRequest = form.get("rawRequest");
    if (typeof rawRequest === "string") raw = JSON.parse(rawRequest);
    // Por si el campo llega suelto y no dentro de rawRequest.
    for (const [k, v] of form.entries()) if (/kiru_?eval/i.test(k) && typeof v === "string") raw[k] = v;
  } catch {
    return NextResponse.json({ ok: false, error: "Respuesta no válida." }, { status: 400 });
  }
  const token = findToken(raw);
  if (!token) return NextResponse.json({ ok: true, ignored: "sin código de evaluación" });

  const { data: e } = await admin.from("kiru_evaluations").select("id,target,due_on,status").eq("token", token).maybeSingle();
  if (!e || e.target === "alumno") return NextResponse.json({ ok: true, ignored: "código desconocido" });
  if (e.status === "completada") return NextResponse.json({ ok: true, already: true });

  const today = madridTodayIso();
  const w = mentorWindow(e.due_on);
  // Fuera de plazo no debería pasar (el enlace del campus no abre el formulario), pero si llega se guarda marcado.
  const late = e.target === "mentor" && (today < w.opensOn || today > w.closesOn);
  const now = new Date().toISOString();
  const { error } = await admin.from("kiru_evaluations").update({
    status: "completada", completed_at: now, completed_via: "formulario", submission_id: submissionId || null, late,
    answers: cleanAnswers(raw) as Json,
    updated_at: now,
  }).eq("id", e.id);
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
