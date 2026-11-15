import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

const MAX_ROWS = 1000;

/**
 * Dirección de clase desde el formulario de incorporación (Jotform). La llama el Apps Script
 * «Kiru filtro candidatos» con la clave KIRU_ALTA_SECRET:
 * { filas: [{ emails: ["padre@…", "madre@…"], alumno: "Nombre Apellidos", direccion: "Calle …" }] }.
 * Se enlaza por el correo de los padres (y el nombre si hay varios hijos) y solo se rellenan
 * las direcciones vacías: lo que Coordinación cambie a mano no se pisa.
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
    const emails = (Array.isArray(r.emails) ? r.emails : []).map((e) => String(e ?? "").trim().slice(0, 200)).filter((e) => e.includes("@")).slice(0, 4);
    const direccion = String(r.direccion ?? "").trim().slice(0, 300);
    return emails.length && direccion ? [{ emails, alumno: String(r.alumno ?? "").slice(0, 120), direccion }] : [];
  });
  const { data, error } = await admin.rpc("kiru_familias_direcciones", { p_rows: rows });
  if (error) {
    console.error("Direcciones → campus:", error.code, error.message);
    return NextResponse.json({ error: "No se pudieron guardar las direcciones." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
