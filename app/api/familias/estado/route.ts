import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

const MAX_ROWS = 1000;

/**
 * Estado del servicio y municipio de cada alumno desde la pestaña «Familias»
 * de Contabilidad (fuente única). La llama el Apps Script «Kiru renovaciones
 * familias» con la clave KIRU_ALTA_SECRET:
 * { filas: [{ campus_id, estado: "Activa" | "Pausa · pendiente de continuidad" | "Baja", municipio }] }.
 * Si cambia algo, se regeneran las clases (en pausa o baja no hay clases nuevas,
 * y las futuras se anulan sin borrar el historial).
 */
export async function POST(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "No está configurado." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });
  let body: { filas?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  if (!Array.isArray(body.filas) || body.filas.length > MAX_ROWS) {
    return NextResponse.json({ error: `Envía entre 0 y ${MAX_ROWS} filas.` }, { status: 400 });
  }
  const rows = body.filas.flatMap((f) => {
    if (!f || typeof f !== "object") return [];
    const r = f as Record<string, unknown>;
    const id = String(r.campus_id ?? "").trim();
    // Las filas sin ID campus todavía no se pueden enlazar: se ignoran sin error.
    return id ? [{ campus_id: id, estado: String(r.estado ?? "").slice(0, 60), municipio: String(r.municipio ?? "").slice(0, 120) }] : [];
  });
  const { data, error } = await admin.rpc("kiru_familias_estado", { p_rows: rows });
  if (error) {
    console.error("Familias → campus:", error.code, error.message);
    return NextResponse.json({ error: "No se pudo actualizar el estado." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
