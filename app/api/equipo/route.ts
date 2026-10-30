import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { EMAIL_RE } from "@/lib/server/require-staff";
import { sharedSecretStatus } from "@/lib/server/shared-secret";
import { matchByName } from "@/lib/session-logs";

export const runtime = "nodejs";

const MAX_ROWS = 1000;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Lo llama el Apps Script de la hoja «Nuestro Equipo (respuestas)» con la misma
 * clave del panel del mentor (KIRU_OFERTAS_SECRET). Cada respuesta del
 * formulario se enlaza con su mentor (por el correo, si el formulario lo pide,
 * o por el nombre) y su paso «Nuestro Equipo» pasa a «Enviado» sin que tenga
 * que pulsar nada. Se puede repetir sin duplicar: una respuesta ya contada no
 * cambia el paso, salvo que se hubiera pedido corrección y la respuesta sea
 * posterior a esa petición.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_OFERTAS_SECRET);
  if (!url || !service || secret === "missing") {
    return NextResponse.json({ error: "La conexión de «Nuestro Equipo» no está configurada." }, { status: 503 });
  }
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: { respuestas?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  if (!Array.isArray(body.respuestas) || body.respuestas.length > MAX_ROWS) {
    return NextResponse.json({ error: `Envía entre 0 y ${MAX_ROWS} respuestas.` }, { status: 400 });
  }

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const [mentorsResult, usersResult, stepsResult] = await Promise.all([
    admin.from("profiles").select("id,full_name").eq("role", "mentor"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("kiru_mentor_steps").select("mentor_id,status,submitted_at,reviewed_at").eq("step", "nuestro_equipo"),
  ]);
  if (mentorsResult.error || usersResult.error || stepsResult.error) {
    return NextResponse.json({ error: "No se pudieron cargar los mentores." }, { status: 500 });
  }
  const mentors = mentorsResult.data ?? [];
  const mentorIds = new Set(mentors.map((m) => m.id));
  const mentorByEmail = new Map<string, string>();
  for (const u of usersResult.data.users) if (u.email && mentorIds.has(u.id)) mentorByEmail.set(u.email.toLowerCase(), u.id);
  const steps = new Map((stepsResult.data ?? []).map((s) => [s.mentor_id, s]));

  // La respuesta más reciente de cada mentor es la que cuenta.
  const latest = new Map<string, string>();
  const unmatched: string[] = [];
  for (const raw of body.respuestas) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const name = text(item.nombre, 200);
    const email = text(item.correo, 254).toLowerCase();
    const date = new Date(text(item.fecha, 40));
    if (Number.isNaN(date.getTime())) continue;
    let mentorId = EMAIL_RE.test(email) ? mentorByEmail.get(email) : undefined;
    if (!mentorId) {
      const found = matchByName(name, mentors);
      if (found.length === 1) mentorId = found[0].id;
    }
    if (!mentorId) { if (name) unmatched.push(name); continue; }
    const iso = date.toISOString();
    if (!latest.has(mentorId) || latest.get(mentorId)! < iso) latest.set(mentorId, iso);
  }

  let marked = 0;
  for (const [mentorId, submittedAt] of latest) {
    const current = steps.get(mentorId);
    const resubmitted = current?.status === "requiere_correccion" && (!current.reviewed_at || new Date(submittedAt) > new Date(current.reviewed_at));
    if (current && !resubmitted) continue;
    const { error } = await admin.from("kiru_mentor_steps").upsert({
      mentor_id: mentorId,
      step: "nuestro_equipo",
      status: "enviado",
      submitted_at: submittedAt,
      reviewed_at: null,
      reviewed_by: null,
      review_note: "",
    });
    if (!error) marked += 1;
  }

  return NextResponse.json({ matched: latest.size, marked, unmatched });
}
