import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

const ACTIONS = ["publicar", "elegir", "sincronizar", "confirmar", "estados", "horarios", "horarios_ok", "preparar"] as const;
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
    bajar_etiqueta: text(body.bajarEtiqueta, 120),
    bajar_precio: body.bajarPrecio == null || body.bajarPrecio === "" ? "" as const : Number(body.bajarPrecio),
    pago: text(body.pago, 800),
    llamada: /^https:\/\//.test(text(body.llamada, 300)) ? text(body.llamada, 300) : "",
    adelantado: { mantener: prepayOptions(prepay.mantener), subir: prepayOptions(prepay.subir), bajar: prepayOptions(prepay.bajar) },
    // Lo que ya estuviera apuntado en la hoja para este periodo (solo al publicar).
    plan: fromSheet && ["mantener", "subir", "bajar", "no_renueva"].includes(text(body.plan, 20)) ? text(body.plan, 20) : "",
    meses: fromSheet && Number.isInteger(Number(body.meses)) ? Number(body.meses) : 1,
    pagado: fromSheet && body.pagado === true,
  };
  const upOk = data.subir_etiqueta === "" || (typeof data.subir_precio === "number" && Number.isFinite(data.subir_precio) && data.subir_precio >= 0);
  // «Bajar» es opcional: si llega sin precio válido, simplemente no se ofrece.
  if (data.bajar_etiqueta === "" || typeof data.bajar_precio !== "number" || !Number.isFinite(data.bajar_precio) || data.bajar_precio < 0) {
    data.bajar_etiqueta = ""; data.bajar_precio = ""; data.adelantado.bajar = [];
  }
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
 * · horarios: cambios de horario ya aplicados (tras subir o bajar la intensidad)
 *   que la hoja aún no ha apuntado → días por semana y precio nuevos.
 * · horarios_ok: la hoja ya los apuntó ({ ids }).
 * · preparar: antes del correo de renovación ({ email, alumno, fin, enviar }): el
 *   mentor tiene que haber confirmado su disponibilidad. Devuelve { listo, subir }:
 *   si no está listo, la hoja aplaza el correo; si subir es false, no lo ofrece.
 * · estados: para cada familia de la hoja ({ email, alumno }), si el alumno está
 *   activo, en pausa o de baja en el campus (lo cambia administración en «Mis alumnos»).
 *   La hoja no manda renovaciones ni recordatorios a quien está en pausa o de baja.
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
    if (!["mantener", "subir", "bajar", "no_renueva", "pagado"].includes(choice) || !DATE.test(fin) || !text(body.email) || !text(body.alumno)
      || !Number.isInteger(months) || months < 1 || months > 12) {
      return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
    }
    const { data: result, error } = await admin.rpc("kiru_renewal_from_email_months", {
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

  if (action === "horarios") {
    const { data: result, error } = await admin.rpc("kiru_horarios_para_hoja", {});
    if (error) return NextResponse.json({ error: "No se pudieron leer los cambios de horario." }, { status: 500 });
    return NextResponse.json({ ok: true, cambios: result ?? [] });
  }

  if (action === "horarios_ok") {
    const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, 200).map((id) => text(id, 40)).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const { data: count, error } = await admin.rpc("kiru_horarios_hoja_ok", { p_ids: ids });
    if (error) return NextResponse.json({ error: "No se pudo confirmar." }, { status: 500 });
    return NextResponse.json({ ok: true, confirmados: count ?? 0 });
  }

  if (action === "preparar") {
    const fin = text(body.fin, 10);
    if (!DATE.test(fin) || !text(body.email) || !text(body.alumno)) return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
    const { data: result, error } = await admin.rpc("kiru_renovacion_preparar", {
      p_email: text(body.email, 254), p_student: text(body.alumno, 120), p_period_end: fin, p_enviar: body.enviar === true,
    });
    // Si el campus falla, la renovación sale como siempre (no se queda ninguna familia sin correo).
    if (error) return NextResponse.json({ ok: false, listo: true, subir: true, error: "No se pudo comprobar la disponibilidad." }, { status: 500 });
    return NextResponse.json({ ok: true, ...(result as Record<string, Json>) });
  }

  if (action === "estados") {
    const families = (Array.isArray(body.familias) ? body.familias : []).slice(0, 500).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const f = item as Record<string, unknown>;
      return text(f.email) && text(f.alumno) ? [{ email: text(f.email, 254), alumno: text(f.alumno, 120) }] : [];
    });
    return NextResponse.json({ ok: true, estados: await studentStatuses(admin, families) });
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

/** Igual que kiru_private.norm_name: minúsculas, sin tildes y sin espacios dobles. */
const normName = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");

/**
 * Estado de cada alumno de la hoja, reconociéndolo igual que las renovaciones
 * (kiru_private.renewal_student): correo de la familia + nombre del alumno, o el
 * único hijo de esa familia si el nombre no coincide.
 */
async function studentStatuses(
  admin: ReturnType<typeof createClient<Database>>,
  families: { email: string; alumno: string }[],
) {
  if (!families.length) return [];
  const [profiles, links, students] = await Promise.all([
    admin.from("profiles").select("id,full_name,role,is_active"),
    admin.from("student_guardians").select("student_id,guardian_id"),
    admin.from("students").select("profile_id,service_status"),
  ]);
  const emailToIds = new Map<string, string[]>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) {
      const e = (u.email ?? "").toLowerCase();
      if (e) emailToIds.set(e, [...(emailToIds.get(e) ?? []), u.id]);
    }
    if (data.users.length < 1000) break;
  }
  const people = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const status = new Map((students.data ?? []).map((s) => [s.profile_id, s.service_status]));
  return families.map(({ email, alumno }) => {
    const guardians = (emailToIds.get(email.toLowerCase()) ?? []).filter((id) => people.get(id)?.role === "padre" && people.get(id)?.is_active);
    const kids = [...new Set((links.data ?? []).filter((l) => guardians.includes(l.guardian_id)).map((l) => l.student_id))]
      .map((id) => people.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.is_active));
    const wanted = normName(alumno);
    const named = kids.filter((k) => normName(k.full_name) === wanted || normName(k.full_name).startsWith(`${wanted} `));
    const kid = named.length === 1 ? named[0] : named.length === 0 && kids.length === 1 ? kids[0] : null;
    return { email, alumno, estado: kid ? status.get(kid.id) ?? "activo" : null };
  });
}
