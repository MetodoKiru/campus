import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

const ACTIONS = ["publicar", "elegir", "sincronizar", "confirmar"] as const;
type Action = (typeof ACTIONS)[number];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const money = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 100000 ? Math.round(value * 100) / 100 : null);

/** Opciones de pago por adelantado de un plan: [{ meses, total, ahorro, pct }]. */
function prepayOptions(value: unknown) {
  return (Array.isArray(value) ? value : []).slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const meses = Number(o.meses);
    const total = money(o.total);
    const ahorro = money(o.ahorro ?? 0) ?? 0;
    const pct = money(o.pct ?? 0) ?? 0;
    return Number.isInteger(meses) && meses >= 2 && meses <= 12 && total !== null ? [{ meses, total, ahorro, pct }] : [];
  });
}

/** Datos de la mensualidad que manda el script (al publicar y en cada sincronización). */
function renewalData(body: Record<string, unknown>, fromSheet: boolean) {
  const prepay = body.adelantado && typeof body.adelantado === "object" ? body.adelantado as Record<string, unknown> : {};
  const data = {
    email: text(body.email, 254),
    alumno: text(body.alumno, 120),
    fin: text(body.fin, 10),
    mentor: text(body.mentor, 120),
    mantener_etiqueta: text(body.mantenerEtiqueta, 120),
    mantener_precio: Number(body.mantenerPrecio),
    subir_etiqueta: text(body.subirEtiqueta, 120),
    subir_precio: body.subirPrecio == null || body.subirPrecio === "" ? "" as const : Number(body.subirPrecio),
    pago: text(body.pago, 800),
    llamada: /^https:\/\//.test(text(body.llamada, 300)) ? text(body.llamada, 300) : "",
    adelantado: { mantener: prepayOptions(prepay.mantener), subir: prepayOptions(prepay.subir) },
    // Lo que ya estuviera apuntado en la hoja para este periodo (solo al publicar).
    plan: fromSheet && ["mantener", "subir", "no_renueva"].includes(text(body.plan, 20)) ? text(body.plan, 20) : "",
    meses: fromSheet && Number.isInteger(Number(body.meses)) ? Number(body.meses) : 1,
    pagado: fromSheet && body.pagado === true,
  };
  const upOk = data.subir_etiqueta === "" || (typeof data.subir_precio === "number" && Number.isFinite(data.subir_precio) && data.subir_precio >= 0);
  if (!data.email || !data.alumno || !DATE.test(data.fin) || !data.mantener_etiqueta || !Number.isFinite(data.mantener_precio) || data.mantener_precio < 0 || !upOk) {
    return null;
  }
  if (!data.subir_etiqueta) { data.subir_precio = ""; data.adelantado.subir = []; }
  return data;
}

/**
 * La llama el Apps Script de renovaciones de la hoja «Contabilidad 26-27»,
 * con la clave KIRU_ALTA_SECRET (la misma que los avisos a familias).
 *
 * · publicar: ha salido el correo de renovación → la familia lo ve en el campus.
 * · elegir: la familia ha pulsado un botón del correo → vale solo si no había
 *   respondido ya (en el correo o en el campus); si ya respondió, se devuelve
 *   lo que eligió para que el correo lo enseñe y no se repita el aviso.
 * · sincronizar: lista de familias de la hoja con su fecha de fin (cierra los
 *   periodos ya pagados) y, con «datos», su mensualidad en curso para que la
 *   tarjeta esté siempre visible → devuelve lo respondido en el campus.
 * · confirmar: el script ya apuntó en la hoja lo que le devolvimos.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  if (!url || !service || secret === "missing") {
    return NextResponse.json({ error: "Las renovaciones no están configuradas." }, { status: 503 });
  }
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }
  const action = body.accion as Action;
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Acción no válida." }, { status: 400 });

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  if (action === "publicar") {
    const data = renewalData(body, true);
    if (!data) return NextResponse.json({ error: "Faltan datos de la renovación." }, { status: 400 });
    const { data: result, error } = await admin.rpc("kiru_renewal_publish", { p_data: data as unknown as Json });
    if (error) return NextResponse.json({ error: "No se pudo guardar la renovación." }, { status: 500 });
    return NextResponse.json({ ok: true, ...(result as Record<string, Json>) });
  }

  if (action === "elegir") {
    const choice = text(body.opcion, 20);
    const fin = text(body.fin, 10);
    const months = body.meses == null || body.meses === "" ? 1 : Number(body.meses);
    if (!["mantener", "subir", "no_renueva", "pagado"].includes(choice) || !DATE.test(fin) || !text(body.email) || !text(body.alumno)
      || !Number.isInteger(months) || months < 1 || months > 12) {
      return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
    }
    const { data: result, error } = await admin.rpc("kiru_renewal_from_email", {
      p_email: text(body.email, 254), p_student: text(body.alumno, 120), p_period_end: fin, p_action: choice, p_months: months,
    });
    if (error) return NextResponse.json({ error: "No se pudo registrar la elección." }, { status: 500 });
    return NextResponse.json({ ok: true, ...(result as Record<string, Json>) });
  }

  if (action === "sincronizar") {
    const families = (Array.isArray(body.familias) ? body.familias : []).slice(0, 500).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const f = item as Record<string, unknown>;
      const fin = text(f.fin, 10);
      if (!text(f.email) || !text(f.alumno) || !DATE.test(fin)) return [];
      // Con «datos», la mensualidad en curso queda siempre visible en el panel (sin campanita).
      const datos = f.datos && typeof f.datos === "object" && !Array.isArray(f.datos) ? renewalData(f.datos as Record<string, unknown>, false) : null;
      return [{ email: text(f.email, 254), alumno: text(f.alumno, 120), fin, ...(datos ? { datos } : {}) }];
    });
    const { data: result, error } = await admin.rpc("kiru_renewal_sync", { p_families: families as unknown as Json });
    if (error) return NextResponse.json({ error: "No se pudo sincronizar." }, { status: 500 });
    return NextResponse.json({ ok: true, ...(result as Record<string, Json>) });
  }

  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 500).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const i = item as Record<string, unknown>;
    const id = text(i.id, 40);
    const seq = Number(i.seq);
    return /^[0-9a-f-]{36}$/i.test(id) && Number.isInteger(seq) && seq > 0 ? [{ id, seq }] : [];
  });
  const { data: count, error } = await admin.rpc("kiru_renewal_ack", { p_items: items as unknown as Json });
  if (error) return NextResponse.json({ error: "No se pudo confirmar." }, { status: 500 });
  return NextResponse.json({ ok: true, confirmadas: count ?? 0 });
}
