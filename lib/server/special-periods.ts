import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, SpecialPeriodRow } from "@/lib/database.types";
import {
  addDays, addMonths, billingPeriodsOverlapping, classDates, classKey, proportionalSuggestion,
  type AmountLine, type Assignment, type ClassDate, type FamilyChoice, type OwnClass, type SpecialPeriod, type SubSlot,
} from "@/lib/special-periods";

type Admin = SupabaseClient<Database>;

export const PERIOD_COLS = "id,name,kind,country,region,starts_on,ends_on,form_opens_on,deadline_on,exceptions_until,closes_on,zones,notes,is_active";

export function mapPeriod(r: Pick<SpecialPeriodRow, "id" | "name" | "kind" | "country" | "region" | "starts_on" | "ends_on" | "form_opens_on" | "deadline_on" | "exceptions_until" | "closes_on" | "zones" | "notes" | "is_active">): SpecialPeriod {
  return {
    id: r.id, name: r.name, kind: r.kind, country: r.country, region: r.region, startsOn: r.starts_on, endsOn: r.ends_on,
    formOpensOn: r.form_opens_on, deadlineOn: r.deadline_on, exceptionsUntil: r.exceptions_until, closesOn: r.closes_on,
    zones: r.zones ?? [], notes: r.notes, isActive: r.is_active,
  };
}

const hhmm = (t: string) => t.slice(0, 5);
const arr = (v: Json | null | undefined): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : [];
const str = (v: unknown) => (typeof v === "string" ? v : "");

export const parseChoices = (v: Json): FamilyChoice[] =>
  arr(v).map((c) => ({ date: str(c.date), start: str(c.start), end: str(c.end), wants: c.wants !== false }));
export const parseOwn = (v: Json): OwnClass[] =>
  arr(v).map((c) => ({ studentId: str(c.student_id), date: str(c.date), start: str(c.start), can: c.can !== false }));
export const parseSlots = (v: Json): SubSlot[] =>
  arr(v).map((c) => ({ date: str(c.date), manana: c.manana === true, tarde: c.tarde === true }));
export const parseAssignments = (v: Json): Assignment[] =>
  arr(v).map((c) => ({
    date: str(c.date), start: str(c.start), end: str(c.end),
    who: (["habitual", "sustituto", "sin_cobertura", "no_quiere"].includes(str(c.who)) ? str(c.who) : "habitual") as Assignment["who"],
    substituteId: str(c.substitute_id) || null,
  }));
export const parseAmounts = (v: Json): AmountLine[] =>
  arr(v).map((c) => ({
    periodStart: str(c.period_start), periodEnd: str(c.period_end), amount: Number(c.amount),
    suggested: c.suggested == null ? null : Number(c.suggested),
  })).filter((a) => Number.isFinite(a.amount));

/** Días sin clase de Kiru entre dos fechas. */
export async function noClassDays(admin: Admin, from: string, to: string): Promise<Set<string>> {
  const { data } = await admin.from("kiru_no_class_days").select("day").eq("is_active", true).gte("day", from).lte("day", to);
  return new Set((data ?? []).map((d) => d.day));
}

export type SlotLite = { studentId: string; weekday: number; start: string; end: string; mentorId: string };

/** Horario semanal activo de unos alumnos (o de los alumnos de un mentor). */
export async function activeSlots(admin: Admin, filter: { students?: string[]; mentor?: string }): Promise<SlotLite[]> {
  let q = admin.from("kiru_student_schedule_slots").select("student_id,mentor_id,weekday,start_time,end_time").eq("is_active", true);
  if (filter.students) {
    if (!filter.students.length) return [];
    q = q.in("student_id", filter.students);
  }
  if (filter.mentor) q = q.eq("mentor_id", filter.mentor);
  const { data } = await q;
  return (data ?? []).map((s) => ({ studentId: s.student_id, weekday: s.weekday, start: hhmm(s.start_time), end: hhmm(s.end_time), mentorId: s.mentor_id }));
}

export function classesFor(slots: SlotLite[], studentId: string, from: string, to: string, closed: Set<string>): ClassDate[] {
  return classDates(slots.filter((s) => s.studentId === studentId), from, to, closed);
}

/**
 * Mensualidades afectadas y sugerencia proporcional, con la última cuota que
 * conoce el campus (renovaciones de la hoja). Si no se conoce, sin sugerencia.
 */
export function billingFor(
  period: SpecialPeriod, slots: SlotLite[], studentId: string, closed: Set<string>,
  renewal: { periodEnd: string; price: number } | null, removed: Set<string>,
) {
  if (!renewal) return [];
  return billingPeriodsOverlapping(renewal.periodEnd, period.startsOn, period.endsOn).map((b) => {
    const monthDates = classesFor(slots, studentId, b.start, addDays(b.end, -1), closed).map((c) => classKey(c.date, c.start));
    const s = proportionalSuggestion(renewal.price, monthDates, removed);
    return { start: b.start, end: b.end, price: renewal.price, expected: s.expected, kept: s.kept, suggested: s.expected ? s.amount : null };
  });
}

/** Última cuota conocida de cada alumno (de las renovaciones que manda la hoja). */
export async function latestRenewals(admin: Admin, students: string[]): Promise<Map<string, { periodEnd: string; price: number }>> {
  const out = new Map<string, { periodEnd: string; price: number }>();
  if (!students.length) return out;
  const { data } = await admin.from("kiru_renewals").select("student_id,period_end,keep_price").in("student_id", students).order("period_end", { ascending: false });
  for (const r of data ?? []) if (!out.has(r.student_id)) out.set(r.student_id, { periodEnd: r.period_end, price: Number(r.keep_price) });
  return out;
}

export async function logEvent(admin: Admin, e: { periodId: string | null; studentId?: string | null; actorId: string | null; action: string; details?: Record<string, unknown> }) {
  await admin.from("kiru_special_period_log").insert({
    period_id: e.periodId, student_id: e.studentId ?? null, actor_id: e.actorId, action: e.action, details: (e.details ?? {}) as Json,
  });
}

/** Campanita + correo (lo manda el script de avisos de siempre). event_key evita duplicados. */
export async function notify(admin: Admin, recipients: string[], title: string, body: string, eventKey: (id: string) => string, studentId: string | null = null) {
  const rows = [...new Set(recipients)].map((id) => ({
    recipient_id: id, student_id: studentId, session_id: null, request_id: null, kind: "periodo_especial" as const, title: title.slice(0, 200), body: body.slice(0, 2000),
    event_key: eventKey(id).slice(0, 200), email_status: "pendiente" as const,
  }));
  if (!rows.length) return 0;
  const { data } = await admin.from("kiru_notifications").upsert(rows, { onConflict: "recipient_id,event_key", ignoreDuplicates: true }).select("id");
  return data?.length ?? 0;
}

export async function activeAdmins(admin: Admin): Promise<string[]> {
  const { data } = await admin.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
  return (data ?? []).map((p) => p.id);
}

export async function guardiansOf(admin: Admin, students: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!students.length) return out;
  const { data } = await admin.from("student_guardians").select("student_id,guardian_id").in("student_id", students);
  for (const g of data ?? []) out.set(g.student_id, [...(out.get(g.student_id) ?? []), g.guardian_id]);
  return out;
}

/** La mensualidad siguiente [fin, fin + 1 mes) se cruza con el periodo. */
export function nextMonthOverlaps(fin: string, p: Pick<SpecialPeriod, "startsOn" | "endsOn">): boolean {
  return fin <= p.endsOn && addMonths(fin, 1) > p.startsOn;
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? "";
