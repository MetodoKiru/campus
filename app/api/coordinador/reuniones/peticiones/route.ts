import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";
import { text } from "@/lib/server/growth";
import { madridToday } from "@/lib/growth";

export const runtime = "nodejs";

/**
 * El coordinador pide a su grupo que revise su disponibilidad antes de una
 * fecha. Los mentores lo ven en su apartado; el campus anota quién responde y
 * cuándo (para el seguimiento cualitativo, sin puntuaciones).
 */
export async function POST(request: Request) {
  const auth = await requireStaff(request, ["coordinador"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: { deadline?: unknown; message?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const deadline = typeof body.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.deadline) ? body.deadline : "";
  if (!deadline) return NextResponse.json({ error: "Elige la fecha límite." }, { status: 400 });
  if (deadline < madridToday()) return NextResponse.json({ error: "La fecha límite ya ha pasado." }, { status: 400 });

  const { error } = await admin.from("kiru_availability_requests").insert({ coordinator_id: user.id, deadline, message: text(body.message, 500) });
  if (error) return NextResponse.json({ error: "No se pudo guardar la petición." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
