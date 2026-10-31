import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";
import { logOfferEvent } from "@/lib/server/assignment-offers";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";

type OfferUpdate = Database["public"]["Tables"]["kiru_assignment_offers"]["Update"];

const ACTIONS = [
  "recordatorio", "llamada_solicitada", "llamada_hecha",
  "seleccionado", "sustituto", "no_seleccionado", "decision_quitada",
  "cerrada", "reabierta",
] as const;
type Action = (typeof ACTIONS)[number];

/**
 * Acciones de administración o coordinación sobre una propuesta. Cada una
 * queda en el historial con quién y cuándo. Ninguna cambia el perfil del
 * mentor: «no seleccionado» es solo para este alumno.
 * Los mensajes de WhatsApp los abre el navegador (wa.me) y los envía la
 * persona a mano; aquí solo se apunta que se ha hecho.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ["admin", "coordinador"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Propuesta no válida." }, { status: 400 });

  let body: { action?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const action = ACTIONS.includes(body.action as Action) ? (body.action as Action) : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (!action) return NextResponse.json({ error: "Acción no válida." }, { status: 400 });

  const { data: offer, error } = await admin
    .from("kiru_assignment_offers")
    .select("id,offer_code,mentor_id,response,decision,closed_at,call_requested_at,call_notes")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo cargar la propuesta." }, { status: 500 });
  if (!offer) return NextResponse.json({ error: "No se encontró la propuesta." }, { status: 404 });

  // El coordinador solo actúa sobre propuestas de sus mentores.
  if (role === "coordinador") {
    const { data: link } = offer.mentor_id
      ? await admin.from("kiru_coordinator_mentors").select("mentor_id").eq("mentor_id", offer.mentor_id).eq("coordinator_id", user.id).maybeSingle()
      : { data: null };
    if (!link) return NextResponse.json({ error: "Esta propuesta no es de uno de tus mentores." }, { status: 403 });
  }

  if (offer.closed_at && action !== "reabierta") {
    return NextResponse.json({ error: "La propuesta está cerrada. Ábrela de nuevo para cambiarla." }, { status: 409 });
  }

  const now = new Date().toISOString();
  let update: OfferUpdate;
  switch (action) {
    case "recordatorio":
      if (offer.response) return NextResponse.json({ error: "El mentor ya ha respondido." }, { status: 409 });
      update = { reminder_sent_at: now };
      break;
    case "llamada_solicitada":
      update = { call_requested_at: now };
      break;
    case "llamada_hecha":
      update = { call_done_at: now, call_requested_at: offer.call_requested_at ?? now, call_notes: note };
      break;
    case "seleccionado":
    case "sustituto":
    case "no_seleccionado":
      if (action !== "no_seleccionado" && offer.response === "no") {
        return NextResponse.json({ error: "El mentor dijo que no puede con este alumno." }, { status: 409 });
      }
      update = { decision: action, decision_note: note, decided_at: now, decided_by: user.id };
      break;
    case "decision_quitada":
      update = { decision: null, decision_note: "", decided_at: null, decided_by: null };
      break;
    case "cerrada":
      update = { closed_at: now };
      break;
    case "reabierta":
      update = { closed_at: null };
      break;
  }

  const { error: saveError } = await admin.from("kiru_assignment_offers").update(update).eq("id", id);
  if (saveError) {
    if (saveError.code === "23505") {
      return NextResponse.json({ error: "Ya hay un mentor seleccionado para este alumno. Quita esa selección primero." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 500 });
  }
  await logOfferEvent(admin, id, action, note, user.id);

  return NextResponse.json({ ok: true });
}
