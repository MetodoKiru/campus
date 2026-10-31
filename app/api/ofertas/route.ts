import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { EMAIL_RE } from "@/lib/server/require-staff";
import { sharedSecretStatus } from "@/lib/server/shared-secret";
import { OFFER_ANSWERS, logOfferEvent, validScriptLink, type OfferAnswer } from "@/lib/server/assignment-offers";
import { OFFER_CODE_RE } from "@/lib/assignment-offers";

export const runtime = "nodejs";

const MAX_ITEMS = 500;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function date(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Lo llama el Apps Script de «Familias Kiru» (clave KIRU_OFERTAS_SECRET):
 * - ofertas: cada correo «Posible alumno para ti» que acaba de mandar, con los
 *   mismos datos del correo y los enlaces de sus tres botones.
 * - respuestas: cada botón que un mentor pulsa en el correo.
 * Se puede repetir sin duplicar: una oferta se identifica por código + correo.
 * El código es opaco («OF-» + 20 hex): un código con el nombre del alumno se
 * rechaza. «alumno» (nombre para administración), «nombre» y «telefono» del
 * mentor solo los leen administración y coordinación; el mentor no lee la tabla.
 * El correo, la hoja OFERTAS y el aviso los sigue haciendo el script.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_OFERTAS_SECRET);
  if (!url || !service || secret === "missing") {
    return NextResponse.json({ error: "La conexión de propuestas no está configurada." }, { status: 503 });
  }
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: { ofertas?: unknown; respuestas?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const offers = Array.isArray(body.ofertas) ? body.ofertas : [];
  const answers = Array.isArray(body.respuestas) ? body.respuestas : [];
  if (offers.length + answers.length > MAX_ITEMS) return NextResponse.json({ error: `Como mucho ${MAX_ITEMS} elementos por envío.` }, { status: 400 });

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  // Correo → cuenta de mentor, para que la propuesta salga en su panel.
  const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const { data: mentors, error: mentorsError } = await admin.from("profiles").select("id").eq("role", "mentor");
  if (usersError || mentorsError) return NextResponse.json({ error: "No se pudieron cargar los mentores." }, { status: 500 });
  const mentorIds = new Set((mentors ?? []).map((m) => m.id));
  const mentorByEmail = new Map<string, string>();
  for (const u of usersPage.users) if (u.email && mentorIds.has(u.id)) mentorByEmail.set(u.email.toLowerCase(), u.id);

  let saved = 0;
  let unmatched = 0;
  const rejected: number[] = [];
  for (const [index, raw] of offers.entries()) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const code = text(item.codigo, 120);
    const email = text(item.correo, 254).toLowerCase();
    if (!OFFER_CODE_RE.test(code) || !EMAIL_RE.test(email)) { rejected.push(index); continue; }
    const links = (item.enlaces ?? {}) as Record<string, unknown>;
    const responseLinks: Record<string, string> = {};
    for (const answer of OFFER_ANSWERS) {
      const link = validScriptLink(links[answer]);
      if (link) responseLinks[answer] = link;
    }
    const mentorId = mentorByEmail.get(email) ?? null;
    if (!mentorId) unmatched += 1;
    const { data: before } = await admin.from("kiru_assignment_offers").select("id").eq("offer_code", code).eq("mentor_email", email).maybeSingle();
    const { data: row, error } = await admin.from("kiru_assignment_offers").upsert({
      offer_code: code,
      mentor_email: email,
      ...(mentorId ? { mentor_id: mentorId } : {}),
      course: text(item.curso, 200),
      student_profile: text(item.perfil, 300),
      zone: text(item.zona, 300),
      intensity: text(item.intensidad, 200),
      slots: text(item.franjas, 1000),
      sent_at: date(item.enviada) ?? new Date().toISOString(),
      response_links: responseLinks,
      student_label: text(item.alumno, 200),
      mentor_name: text(item.nombre, 200),
      mentor_phone: text(item.telefono, 30),
    }, { onConflict: "offer_code,mentor_email", ignoreDuplicates: false }).select("id").single();
    if (error || !row) { rejected.push(index); continue; }
    saved += 1;
    if (!before) await logOfferEvent(admin, row.id, "recibida", "Correo de propuesta enviado por el Apps Script");
  }

  let answered = 0;
  for (const raw of answers) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const code = text(item.codigo, 120);
    const email = text(item.correo, 254).toLowerCase();
    const answer = OFFER_ANSWERS.includes(item.respuesta as OfferAnswer) ? (item.respuesta as OfferAnswer) : null;
    if (!code || !email || !answer) continue;
    // Solo la primera respuesta cuenta; si ya respondió desde el panel, no se pisa.
    const { data } = await admin
      .from("kiru_assignment_offers")
      .update({
        response: answer,
        response_detail: answer === "ajustar" ? text(item.detalle, 1000) : "",
        responded_at: date(item.fecha) ?? new Date().toISOString(),
        response_source: "correo",
      })
      .eq("offer_code", code)
      .eq("mentor_email", email)
      .is("response", null)
      .select("id");
    for (const r of data ?? []) await logOfferEvent(admin, r.id, "respuesta", `${answer} (correo)${answer === "ajustar" && text(item.detalle, 1000) ? `: ${text(item.detalle, 1000)}` : ""}`);
    answered += data?.length ?? 0;
  }

  return NextResponse.json({ saved, unmatched, rejected, answered });
}
