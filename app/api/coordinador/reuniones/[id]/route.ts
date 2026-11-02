import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";
import { madridLocalToIso, text, validZoomUrl } from "@/lib/server/growth";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";

type Update = Database["public"]["Tables"]["kiru_coordination_meetings"]["Update"];

/**
 * Cambios de una reunión por SU coordinador: editar, convocar, cancelar,
 * marcar como realizada y anotar que el registro de Jotform está enviado.
 * Un coordinador nunca toca reuniones de otro (se comprueba aquí y la base
 * no deja escribir a nadie más que al servidor).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ["coordinador"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Reunión no válida." }, { status: 400 });

  const { data: meeting } = await admin.from("kiru_coordination_meetings")
    .select("id,coordinator_id,status,scheduled_at,zoom_url,report_sent_at")
    .eq("id", id).maybeSingle();
  if (!meeting || meeting.coordinator_id !== user.id) return NextResponse.json({ error: "Esta reunión no es de tu grupo." }, { status: 404 });

  let body: { action?: unknown; scheduledAt?: unknown; zoomUrl?: unknown; agenda?: unknown; reason?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const now = new Date().toISOString();
  const started = new Date(meeting.scheduled_at).getTime() <= Date.now();
  let update: Update;

  switch (body.action) {
    case "editar": {
      if (meeting.status !== "borrador" && meeting.status !== "confirmada") return NextResponse.json({ error: "Esta reunión ya no se puede cambiar." }, { status: 409 });
      const scheduledAt = typeof body.scheduledAt === "string" ? madridLocalToIso(body.scheduledAt) : null;
      if (!scheduledAt) return NextResponse.json({ error: "Elige la fecha y la hora." }, { status: 400 });
      if (new Date(scheduledAt).getTime() < Date.now()) return NextResponse.json({ error: "La fecha ya ha pasado." }, { status: 400 });
      const zoomUrl = validZoomUrl(body.zoomUrl);
      if (zoomUrl === null) return NextResponse.json({ error: "El enlace de Zoom no es válido (tiene que empezar por https:// y ser de zoom.us)." }, { status: 400 });
      if (meeting.status === "confirmada" && !zoomUrl) return NextResponse.json({ error: "Una reunión convocada necesita el enlace de Zoom." }, { status: 400 });
      update = { scheduled_at: scheduledAt, zoom_url: zoomUrl, agenda: text(body.agenda, 1000) };
      break;
    }
    case "confirmar":
      if (meeting.status !== "borrador") return NextResponse.json({ error: "Esta reunión ya estaba convocada." }, { status: 409 });
      if (!meeting.zoom_url) return NextResponse.json({ error: "Añade el enlace de Zoom antes de convocarla." }, { status: 400 });
      if (started) return NextResponse.json({ error: "La fecha ya ha pasado: cámbiala antes de convocar." }, { status: 400 });
      update = { status: "confirmada", confirmed_at: now };
      break;
    case "cancelar":
      if (meeting.status !== "borrador" && meeting.status !== "confirmada") return NextResponse.json({ error: "Esta reunión ya no se puede cancelar." }, { status: 409 });
      update = { status: "cancelada", cancelled_at: now, cancel_reason: text(body.reason, 500) };
      break;
    case "realizada":
      if (meeting.status !== "confirmada") return NextResponse.json({ error: "Solo una reunión convocada se puede marcar como realizada." }, { status: 409 });
      if (!started) return NextResponse.json({ error: "La reunión todavía no ha empezado." }, { status: 409 });
      update = { status: "realizada", held_at: now };
      break;
    case "registro":
      if (meeting.status !== "realizada") return NextResponse.json({ error: "Marca antes la reunión como realizada." }, { status: 409 });
      update = { report_sent_at: meeting.report_sent_at ?? now };
      break;
    default:
      return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }

  const { error } = await admin.from("kiru_coordination_meetings").update(update).eq("id", id).eq("coordinator_id", user.id);
  if (error?.code === "23505") return NextResponse.json({ error: "Ya tienes otra reunión ese mes." }, { status: 409 });
  if (error) return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
