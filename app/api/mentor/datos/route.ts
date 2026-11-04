import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sharedSecretStatus } from "@/lib/server/shared-secret";
import { requireStaff } from "@/lib/server/require-staff";
import { matchByName, normalizeName } from "@/lib/session-logs";

export const runtime = "nodejs";
type Row = Record<string, unknown>;
const str = (v: unknown) => v == null ? "" : String(v).trim();
const keyOf = (r: Row, prefix: string) => Object.entries(r).find(([k]) => normalizeName(k).startsWith(prefix))?.[1];
const num = (v: unknown): number | null => {
  const s = str(v).replace(/€/g, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:,|$))/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
function dateValue(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso?.[1] ?? null;
}
function activeValue(v: unknown): boolean {
  return !["no", "false", "0", "inactivo", "inactiva"].includes(normalizeName(str(v)));
}

/** Lee únicamente los datos del mentor autenticado. */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const [s, p, r] = await Promise.all([
    auth.admin.from("kiru_mentor_schedules").select("id,mentor_name,student_name,weekday,start_time,end_time,active").eq("mentor_id", auth.user.id).eq("active", true).order("weekday").order("start_time"),
    auth.admin.from("kiru_mentor_payroll").select("id,student_name,period_start,period_end,status,sessions_count,team_extra_eur,agreed_amount_eur,payment_date,notes").eq("mentor_id", auth.user.id).order("period_end", { ascending: false }),
    auth.admin.from("kiru_mentor_rates").select("hourly_rate_eur,pending_sessions,pending_amount_eur,sessions_total").eq("mentor_id", auth.user.id).maybeSingle(),
  ]);
  if (s.error || p.error || r.error) return NextResponse.json({ error: "No se pudieron cargar horarios y remuneración." }, { status: 500 });
  const periods = p.data ?? [];
  const months = new Map<string, typeof periods>();
  for (const row of periods) {
    if (!row.team_extra_eur || row.team_extra_eur <= 0 || !row.period_end) continue;
    const month = row.period_end.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), row]);
  }
  const monthlyExtras = [...months.entries()].map(([month, rows]) => {
    const pending = rows.filter((x) => normalizeName(x.status).includes("pendiente"));
    const due = pending.map((x) => x.period_end).filter(Boolean).sort().at(-1) ?? null;
    const paidDate = rows.map((x) => x.payment_date).filter(Boolean).sort().at(-1) ?? null;
    return { month, amount: Math.max(...rows.map((x) => Number(x.team_extra_eur) || 0)), status: pending.length ? "Pendiente" : "Pagado", estimatedDate: due, paidDate };
  }).sort((a, b) => b.month.localeCompare(a.month));
  const pendingExtras = monthlyExtras.filter((x) => x.status === "Pendiente").reduce((sum, x) => sum + x.amount, 0);
  return NextResponse.json({
    schedules: s.data ?? [],
    rate: r.data ?? null,
    periods: periods.map((x) => ({ ...x, estimated_payment_date: normalizeName(x.status).includes("pendiente") ? x.period_end : null })),
    monthlyExtras,
    pendingTotal: (Number(r.data?.pending_amount_eur) || 0) + pendingExtras,
  }, { headers: { "Cache-Control": "no-store" } });
}

/** Importación idempotente unidireccional: Sheets → Preview/Campus. */
export async function POST(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_REGISTROS_SECRET);
  if (secret === "missing") return NextResponse.json({ error: "La importación no está configurada." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });
  let body: { schedules?: unknown; payments?: unknown; rates?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const schedules = Array.isArray(body.schedules) ? body.schedules as Row[] : [];
  const payments = Array.isArray(body.payments) ? body.payments as Row[] : [];
  const rates = Array.isArray(body.rates) ? body.rates as Row[] : [];
  if (schedules.length > 2000 || payments.length > 2000 || rates.length > 500) return NextResponse.json({ error: "Demasiadas filas." }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return NextResponse.json({ error: "Servicio no configurado." }, { status: 503 });
  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: mentors, error } = await admin.from("profiles").select("id,full_name,role").eq("role", "mentor");
  if (error) return NextResponse.json({ error: "No se pudieron cargar los mentores." }, { status: 500 });
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emails = new Map((users?.users ?? []).map((u) => [u.id, (u.email ?? "").toLowerCase()]));
  const mentorId = (name: string, email = "") => {
    const byEmail = email ? (mentors ?? []).filter((m) => emails.get(m.id) === email.toLowerCase()) : [];
    if (byEmail.length === 1) return byEmail[0].id;
    const found = matchByName(name, (mentors ?? []).map((m) => ({ ...m, full_name: m.full_name ?? "" })));
    return found.length === 1 ? found[0].id : null;
  };
  const payloads = await Promise.all([
    Promise.all(schedules.map(async (row) => {
      const name = str(keyOf(row, "mentor")), email = str(keyOf(row, "correo del mentor"));
      const student = str(keyOf(row, "alumno"));
      const weekday = str(keyOf(row, "dia"));
      const start = str(keyOf(row, "inicio")), end = str(keyOf(row, "fin"));
      return { source_key: [normalizeName(name), normalizeName(student), normalizeName(weekday)].join("|").slice(0, 500), mentor_id: mentorId(name, email), mentor_name: name, student_name: student, weekday, start_time: start, end_time: end, active: activeValue(keyOf(row, "activo")) };
    })),
    Promise.all(payments.map(async (row) => {
      const name = str(keyOf(row, "mentor")), student = str(keyOf(row, "alumno"));
      const start = dateValue(keyOf(row, "desde")), end = dateValue(keyOf(row, "hasta"));
      const status = str(keyOf(row, "estado"));
      return { source_key: [normalizeName(name), normalizeName(student), start ?? "", end ?? ""].join("|").slice(0, 500), mentor_id: mentorId(name), mentor_name: name, student_name: student, period_start: start, period_end: end, status, sessions_count: num(keyOf(row, "sesiones registradas")), team_extra_eur: num(keyOf(row, "extra equipo")), agreed_amount_eur: num(keyOf(row, "importe acordado")), payment_date: dateValue(keyOf(row, "fecha de pago")), notes: str(keyOf(row, "notas")).slice(0, 1000) };
    })),
    Promise.all(rates.map(async (row) => {
      const name = str(keyOf(row, "mentor"));
      return { mentor_id: mentorId(name), hourly_rate_eur: num(keyOf(row, "remuneracion")), pending_sessions: num(keyOf(row, "sesiones por pagar")), pending_amount_eur: num(keyOf(row, "total a pagar")), sessions_total: num(keyOf(row, "sesiones realizadas")) };
    })),
  ]);
  const unmatched = [...payloads[0], ...payloads[1]].filter((x) => !x.mentor_id).map((x) => x.mentor_name);
  const validSchedules = payloads[0].filter((x) => x.mentor_id);
  const validPayments = payloads[1].filter((x) => x.mentor_id);
  const validRates = payloads[2].filter((x): x is typeof x & { mentor_id: string } => Boolean(x.mentor_id));
  for (let i = 0; i < validSchedules.length; i += 500) {
    const { error: saveError } = await admin.from("kiru_mentor_schedules").upsert(validSchedules.slice(i, i + 500), { onConflict: "source_key" });
    if (saveError) return NextResponse.json({ error: "No se pudieron guardar los horarios importados." }, { status: 500 });
  }
  for (let i = 0; i < validPayments.length; i += 500) {
    const { error: saveError } = await admin.from("kiru_mentor_payroll").upsert(validPayments.slice(i, i + 500), { onConflict: "source_key" });
    if (saveError) return NextResponse.json({ error: "No se pudieron guardar los periodos importados." }, { status: 500 });
  }
  for (const row of validRates) {
    const { error: saveError } = await admin.from("kiru_mentor_rates").upsert(row, { onConflict: "mentor_id" });
    if (saveError) return NextResponse.json({ error: "No se pudieron guardar las tarifas importadas." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, schedules: validSchedules.length, payments: validPayments.length, rates: validRates.length, unmatched: [...new Set(unmatched)] });
}
