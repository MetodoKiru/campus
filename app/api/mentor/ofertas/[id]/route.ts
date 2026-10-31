import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";
import { OFFER_ANSWERS, forwardAnswerToScript, logOfferEvent, validScriptLink, type OfferAnswer } from "@/lib/server/assignment-offers";

export const runtime = "nodejs";

/**
 * El mentor responde a una propuesta de alumno desde su panel con las mismas
 * tres opciones del correo. Se guarda una sola respuesta por propuesta (como el
 * correo, la primera vale) y se lleva al Apps Script para que avise a quien la
 * propuso y la apunte en OFERTAS.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Propuesta no válida." }, { status: 400 });

  let body: { response?: unknown; detail?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const answer = OFFER_ANSWERS.includes(body.response as OfferAnswer) ? (body.response as OfferAnswer) : null;
  const detail = answer === "ajustar" && typeof body.detail === "string" ? body.detail.trim().slice(0, 1000) : "";
  if (!answer) return NextResponse.json({ error: "Respuesta no válida." }, { status: 400 });
  if (answer === "ajustar" && !detail) return NextResponse.json({ error: "No has indicado qué días y horas podrías." }, { status: 400 });

  const { data: offer, error } = await admin
    .from("kiru_assignment_offers")
    .select("id,mentor_id,response,response_links,closed_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo cargar la propuesta." }, { status: 500 });
  if (!offer || offer.mentor_id !== user.id) return NextResponse.json({ error: "No se encontró la propuesta." }, { status: 404 });
  if (offer.response) return NextResponse.json({ error: "No se puede cambiar: ya respondiste a esta propuesta." }, { status: 409 });
  if (offer.closed_at) return NextResponse.json({ error: "Esta propuesta ya está cerrada." }, { status: 409 });

  const now = new Date().toISOString();
  // La condición «response is null» evita dos respuestas si pulsa dos veces o responde a la vez desde el correo.
  const { data: saved, error: saveError } = await admin
    .from("kiru_assignment_offers")
    .update({ response: answer, response_detail: detail, responded_at: now, response_source: "campus" })
    .eq("id", id)
    .is("response", null)
    .is("closed_at", null)
    .select("id")
    .maybeSingle();
  if (saveError) return NextResponse.json({ error: "No se pudo guardar tu respuesta." }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "No se puede cambiar: ya respondiste a esta propuesta." }, { status: 409 });

  await logOfferEvent(admin, id, "respuesta", `${answer} (campus)${detail ? `: ${detail}` : ""}`, user.id);

  const links = (offer.response_links ?? {}) as Record<string, unknown>;
  const link = validScriptLink(links[answer]);
  const forward = link ? await forwardAnswerToScript(link, detail) : { ok: false, error: "La propuesta no tiene enlace del script." };
  await admin
    .from("kiru_assignment_offers")
    .update(forward.ok ? { forwarded_at: new Date().toISOString(), forward_error: "" } : { forward_error: forward.error })
    .eq("id", id);

  return NextResponse.json({ ok: true, forwarded: forward.ok });
}
