import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

const MAX_ROWS = 200;
const MAX_ATTEMPTS = 20;

function guard(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_REGISTROS_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return { error: NextResponse.json({ error: "La copia a la hoja no está configurada." }, { status: 503 }) };
  if (secret !== "ok") return { error: NextResponse.json({ error: "Clave no válida." }, { status: 401 }) };
  return { admin };
}

/**
 * La llama cada hora el Apps Script de «Registro de sesión» (misma clave
 * KIRU_REGISTROS_SECRET). Devuelve las filas pendientes de copiar a «Sin clase»
 * y «Recuperaciones», identificadas por su ID de clase (row_key). El script
 * busca la fila por ese ID en la última columna: si existe la actualiza, si no
 * la añade al final; nunca borra filas. Después confirma con POST.
 */
export async function GET(request: Request) {
  const g = guard(request);
  if (g.error) return g.error;
  const { data: rows, error } = await g.admin.from("kiru_sheet_outbox")
    .select("id")
    .in("status", ["pendiente", "error"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("id")
    .limit(MAX_ROWS);
  if (error) return NextResponse.json({ error: "No se pudo leer la cola." }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ ok: true, filas: [] });

  const now = new Date().toISOString();
  const claimed = [];
  for (const row of rows) {
    // Una a una para sumar el intento sin pisar cambios que lleguen a la vez.
    const { data: current } = await g.admin.from("kiru_sheet_outbox").select("attempts").eq("id", row.id).maybeSingle();
    if (!current) continue;
    const { data } = await g.admin.from("kiru_sheet_outbox")
      .update({ attempts: current.attempts + 1, claimed_at: now })
      .eq("id", row.id).in("status", ["pendiente", "error"])
      .select("id,target,row_key,payload,updated_at").maybeSingle();
    if (data) claimed.push({ id: data.id, version: data.updated_at, hoja: data.target, idClase: data.row_key, datos: data.payload });
  }
  return NextResponse.json({ ok: true, filas: claimed });
}

/**
 * Confirmación del script: { resultados: [{ id, version, ok, error? }] }.
 * Solo se marca como enviada la versión que el script escribió; si mientras
 * tanto la clase cambió, la fila sigue pendiente y saldrá en la siguiente vuelta.
 */
export async function POST(request: Request) {
  const g = guard(request);
  if (g.error) return g.error;
  let body: { resultados?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  if (!Array.isArray(body.resultados) || body.resultados.length > MAX_ROWS) {
    return NextResponse.json({ error: `Envía entre 0 y ${MAX_ROWS} resultados.` }, { status: 400 });
  }
  let sent = 0;
  let failed = 0;
  const now = new Date().toISOString();
  for (const item of body.resultados) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = Number(r.id);
    const version = typeof r.version === "string" ? r.version : "";
    if (!Number.isInteger(id) || !version) continue;
    const update = r.ok === true
      ? { status: "enviado" as const, sent_at: now, last_error: "" }
      : { status: "error" as const, last_error: String(r.error ?? "Error sin detalle").slice(0, 1000) };
    const { data } = await g.admin.from("kiru_sheet_outbox").update(update).eq("id", id).eq("updated_at", version).select("id");
    if (data?.length) { if (r.ok === true) sent += 1; else failed += 1; }
  }
  return NextResponse.json({ ok: true, enviadas: sent, conError: failed });
}
