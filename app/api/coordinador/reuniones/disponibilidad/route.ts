import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";
import { cleanCells, saveAvailability, text } from "@/lib/server/growth";

export const runtime = "nodejs";

/** El coordinador guarda su propia cuadrícula de 30 minutos. */
export async function PUT(request: Request) {
  const auth = await requireStaff(request, ["coordinador"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: { cells?: unknown; notes?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const cells = cleanCells(body.cells);
  if (!cells.length) return NextResponse.json({ error: "Marca al menos una casilla en la que puedas celebrar la reunión." }, { status: 400 });

  const saved = await saveAvailability(admin, user.id, cells, text(body.notes, 500), null);
  if (!saved.ok) return NextResponse.json({ error: "No se pudo guardar tu disponibilidad." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
