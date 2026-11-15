// Llamadas semanales con las familias: lógica del servidor (service role).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CallPlanRow, Database, FamilyCallRow, Json } from "@/lib/database.types";
import {
  addDaysIso, CALENDAR_AHEAD_DAYS, CALL_MINUTES, CLASS_BUFFER_MINUTES, callWhen, findMatches, fromMinutes, isWeekday,
  madridToUtcIso, madridTodayIso, mondayOf, RATE_REMINDER_DAYS, slotLabel, toMinutes, weekNumber, whatsappLink, whatsappMessage,
  whyNoMatch, type Busy, type CallMode, type MatchInput, type MatchOption, type Slot,
} from "@/lib/llamadas";

type Admin = SupabaseClient<Database>;

export type CallSettings = { mode: CallMode; testStudents: string[]; familyForm: string; teamForm: string; codeField: string };
const DEFAULTS: CallSettings = {
  mode: "apagado", testStudents: [],
  familyForm: "https://form.jotform.com/263026244810045",
  teamForm: "https://form.jotform.com/263026449536057",
  codeField: "codigoDe",
};

export async function loadCallSettings(admin: Admin): Promise<CallSettings> {
  const { data } = await admin.from("kiru_settings").select("value").eq("key", "llamadas").maybeSingle();
  const v = (data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value : {}) as Record<string, unknown>;
  const str = (x: unknown, d: string) => (typeof x === "string" && x.startsWith("https://") ? x : d);
  return {
    mode: v.modo === "prueba" || v.modo === "activo" ? v.modo : "apagado",
    testStudents: Array.isArray(v.alumnos_prueba) ? v.alumnos_prueba.filter((x): x is string => typeof x === "string") : [],
    familyForm: str(v.form_familias, DEFAULTS.familyForm),
    teamForm: str(v.form_equipo, DEFAULTS.teamForm),
    codeField: typeof v.campo_codigo === "string" && /^[A-Za-z0-9_]{1,60}$/.test(v.campo_codigo) ? v.campo_codigo : DEFAULTS.codeField,
  };
}

export async function saveCallSettings(admin: Admin, patch: Partial<{ modo: CallMode; alumnos_prueba: string[] }>) {
  const { data } = await admin.from("kiru_settings").select("value").eq("key", "llamadas").maybeSingle();
  const current = (data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value : {}) as Record<string, Json>;
  await admin.from("kiru_settings").upsert({ key: "llamadas", value: { ...current, ...patch } as Json });
}

/** Alumnos activos con los que trabaja el sistema según el modo. */
export async function scopeStudents(admin: Admin, s: CallSettings): Promise<string[]> {
  if (s.mode === "apagado") return [];
  const { data } = await admin.from("students").select("profile_id").eq("service_status", "activo");
  const active = (data ?? []).map((r) => r.profile_id);
  const { data: people } = active.length ? await admin.from("profiles").select("id").in("id", active).eq("is_active", true).eq("role", "alumno") : { data: [] };
  const ids = (people ?? []).map((p) => p.id);
  return s.mode === "activo" ? ids : ids.filter((id) => s.testStudents.includes(id));
}

export function formLink(base: string, codeField: string, token: string, extra: Record<string, string> = {}): string {
  const url = new URL(base);
  url.searchParams.set(codeField, token);
  for (const [k, v] of Object.entries(extra)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? "";
const minutesOf = (t: string | null) => (t ? toMinutes(t) : null);
const timeOf = (min: number) => `${fromMinutes(min)}:00`;

// --- Quién participa ----------------------------------------------------------------------------

/** Mentor habitual: el primero asignado que sigue activo. */
export async function primaryMentor(admin: Admin, studentId: string): Promise<string | null> {
  const { data } = await admin.from("student_mentors").select("mentor_id,assigned_at").eq("student_id", studentId).order("assigned_at");
  const ids = (data ?? []).map((r) => r.mentor_id);
  if (!ids.length) return null;
  const { data: active } = await admin.from("profiles").select("id").in("id", ids).eq("is_active", true).eq("role", "mentor");
  const ok = new Set((active ?? []).map((p) => p.id));
  return ids.find((id) => ok.has(id)) ?? null;
}

/** Coordinador del mentor; si no tiene, administración. */
export async function coordinatorOf(admin: Admin, mentorId: string | null): Promise<string | null> {
  if (mentorId) {
    const { data } = await admin.from("kiru_coordinator_mentors").select("coordinator_id").eq("mentor_id", mentorId);
    const ids = (data ?? []).map((r) => r.coordinator_id);
    if (ids.length) {
      const { data: active } = await admin.from("profiles").select("id").in("id", ids).eq("is_active", true);
      if (active?.length) return active[0].id;
    }
  }
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").eq("is_active", true).order("created_at").limit(1);
  return admins?.[0]?.id ?? null;
}

/** Lunes de la semana de la primera clase (programada o registrada). */
export async function anchorMonday(admin: Admin, studentId: string, override: string | null): Promise<string | null> {
  if (override) return mondayOf(override);
  const [{ data: cls }, { data: logs }] = await Promise.all([
    admin.from("kiru_class_sessions").select("scheduled_start").eq("student_id", studentId).neq("delivery", "anulada").order("scheduled_start").limit(1),
    admin.from("kiru_session_logs").select("session_date,submitted_at").eq("student_id", studentId).order("session_date", { ascending: true, nullsFirst: false }).limit(1),
  ]);
  const dates: string[] = [];
  if (cls?.[0]?.scheduled_start) dates.push(madridTodayIso(new Date(cls[0].scheduled_start)));
  const log = logs?.[0] as { session_date?: string | null; submitted_at?: string | null } | undefined;
  if (log?.session_date) dates.push(log.session_date);
  else if (log?.submitted_at) dates.push(madridTodayIso(new Date(log.submitted_at)));
  if (!dates.length) return null;
  return mondayOf(dates.sort()[0]);
}

// --- Disponibilidad -----------------------------------------------------------------------------

export function slotsFrom(json: Json): Slot[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return [];
    const o = x as Record<string, unknown>;
    return isWeekday(o.d) && typeof o.from === "number" && typeof o.to === "number" && o.to > o.from ? [{ d: o.d, from: o.from, to: o.to }] : [];
  });
}

export async function latestFamilyAvailability(admin: Admin, studentId: string) {
  const { data } = await admin.from("kiru_call_availability").select("*").eq("kind", "familia").eq("student_id", studentId)
    .is("archived_at", null).order("received_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}
export async function latestStaffAvailability(admin: Admin, profileId: string) {
  const { data } = await admin.from("kiru_call_availability").select("*").eq("kind", "equipo").eq("profile_id", profileId)
    .is("archived_at", null).order("received_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

/** Horas ocupadas cada semana por las otras llamadas fijas de esa persona. */
async function planBusy(admin: Admin, who: "coordinator_id" | "mentor_id", profileId: string, exceptStudent: string): Promise<Busy[]> {
  const { data } = await admin.from("kiru_call_plans").select("student_id,weekday,start_time,mentor_weekday,mentor_start_time")
    .eq(who, profileId).eq("status", "confirmada").neq("student_id", exceptStudent);
  const out: Busy[] = [];
  for (const p of data ?? []) {
    const base = minutesOf(p.start_time);
    const m = minutesOf(p.mentor_start_time);
    // El coordinador está en todas; el mentor solo en las semanas 1 y 4.
    if (who === "coordinator_id" && p.weekday && base !== null) out.push({ d: p.weekday, start: base, end: base + CALL_MINUTES });
    if (p.mentor_weekday && m !== null) out.push({ d: p.mentor_weekday, start: m, end: m + CALL_MINUTES });
    else if (who === "mentor_id" && p.weekday && base !== null) out.push({ d: p.weekday, start: base, end: base + CALL_MINUTES });
  }
  return out;
}

/** Clases semanales del mentor (con margen para el desplazamiento). */
async function classBusy(admin: Admin, mentorId: string): Promise<Busy[]> {
  const { data } = await admin.from("kiru_student_schedule_slots").select("weekday,start_time,end_time").eq("mentor_id", mentorId).eq("is_active", true);
  return (data ?? []).flatMap((s) => {
    const a = minutesOf(s.start_time);
    const b = minutesOf(s.end_time);
    return a !== null && b !== null ? [{ d: s.weekday, start: a - CLASS_BUFFER_MINUTES, end: b + CLASS_BUFFER_MINUTES }] : [];
  });
}

export async function matchInput(admin: Admin, studentId: string, mentorId: string | null, coordinatorId: string | null) {
  const missing: string[] = [];
  const fam = await latestFamilyAvailability(admin, studentId);
  if (!fam) missing.push("familia");
  const coord = coordinatorId ? await latestStaffAvailability(admin, coordinatorId) : null;
  if (!coordinatorId) missing.push("sin_coordinador");
  else if (!coord) missing.push("coordinador");
  const mentor = mentorId ? await latestStaffAvailability(admin, mentorId) : null;
  if (mentorId && !mentor) missing.push("mentor");
  if (missing.length) return { missing, input: null, fam };
  const input: MatchInput = {
    family: slotsFrom(fam!.slots),
    bothParentsDays: fam!.both_parents_days ?? [],
    coordinator: slotsFrom(coord!.slots),
    mentor: mentorId ? slotsFrom(mentor!.slots) : null,
    coordinatorBusy: await planBusy(admin, "coordinator_id", coordinatorId!, studentId),
    mentorBusy: mentorId ? [...await planBusy(admin, "mentor_id", mentorId, studentId), ...await classBusy(admin, mentorId)] : [],
  };
  return { missing, input, fam };
}

// --- Avisos -------------------------------------------------------------------------------------

export async function notifyCall(admin: Admin, recipients: (string | null)[], studentId: string | null, title: string, body: string, eventKey: string) {
  const ids = [...new Set(recipients.filter((x): x is string => !!x))];
  if (!ids.length) return;
  const { data: active } = await admin.from("profiles").select("id").in("id", ids).eq("is_active", true);
  const rows = (active ?? []).map((p) => ({
    recipient_id: p.id, student_id: studentId, session_id: null, request_id: null, kind: "llamada_familia" as const, title: title.slice(0, 200), body: body.slice(0, 1000),
    event_key: eventKey.slice(0, 200), email_status: "pendiente" as const,
  }));
  if (rows.length) await admin.from("kiru_notifications").upsert(rows, { onConflict: "recipient_id,event_key", ignoreDuplicates: true });
}

async function guardiansOf(admin: Admin, studentId: string): Promise<string[]> {
  const { data } = await admin.from("student_guardians").select("guardian_id").eq("student_id", studentId);
  return (data ?? []).map((g) => g.guardian_id);
}

async function nameOf(admin: Admin, id: string | null): Promise<string> {
  if (!id) return "";
  const { data } = await admin.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name ?? "";
}

export async function zoomOf(admin: Admin, coordinatorId: string | null): Promise<string> {
  if (!coordinatorId) return "";
  const { data } = await admin.from("kiru_call_staff").select("zoom_url").eq("profile_id", coordinatorId).maybeSingle();
  return data?.zoom_url ?? "";
}

export function planTimes(p: Pick<CallPlanRow, "weekday" | "start_time" | "mentor_weekday" | "mentor_start_time">) {
  const base = minutesOf(p.start_time);
  const m = minutesOf(p.mentor_start_time);
  return {
    fixed: p.weekday && base !== null ? slotLabel(p.weekday, base) : null,
    mentorFixed: p.mentor_weekday && m !== null ? slotLabel(p.mentor_weekday, m) : null,
  };
}

/** Texto de WhatsApp para el grupo de la familia. */
export async function planWhatsapp(admin: Admin, plan: CallPlanRow): Promise<string> {
  const [kid, mentorName, zoom] = await Promise.all([nameOf(admin, plan.student_id), nameOf(admin, plan.mentor_id), zoomOf(admin, plan.coordinator_id)]);
  const t = planTimes(plan);
  const { data: next } = await admin.from("kiru_family_calls").select("scheduled_start").eq("student_id", plan.student_id)
    .eq("status", "programada").gte("scheduled_start", new Date().toISOString()).order("scheduled_start").limit(1);
  return whatsappMessage({
    kid: firstName(kid), when: t.fixed ? `cada ${t.fixed}` : "", mentorWhen: t.mentorFixed ? `el ${t.mentorFixed}` : null,
    mentorName: firstName(mentorName), medium: plan.medium, zoomUrl: zoom, firstCall: next?.[0] ? callWhen(next[0].scheduled_start) : null,
  });
}

// --- Plan y «match» -----------------------------------------------------------------------------

export async function ensurePlan(admin: Admin, studentId: string): Promise<CallPlanRow> {
  const mentorId = await primaryMentor(admin, studentId);
  const coordinatorId = await coordinatorOf(admin, mentorId);
  const { data: existing } = await admin.from("kiru_call_plans").select("*").eq("student_id", studentId).maybeSingle();
  if (!existing) {
    const { data } = await admin.from("kiru_call_plans").insert({ student_id: studentId, mentor_id: mentorId, coordinator_id: coordinatorId })
      .select("*").single();
    return data!;
  }
  if (existing.mentor_id !== mentorId || existing.coordinator_id !== coordinatorId) {
    const { data } = await admin.from("kiru_call_plans").update({ mentor_id: mentorId, coordinator_id: coordinatorId, updated_at: new Date().toISOString() })
      .eq("student_id", studentId).select("*").single();
    return data!;
  }
  return existing;
}

function stillFits(plan: CallPlanRow, input: MatchInput): boolean {
  const base = minutesOf(plan.start_time);
  if (!plan.weekday || base === null) return false;
  const ok = (slots: Slot[], d: number, t: number) => slots.some((s) => s.d === d && s.from <= t && t + CALL_MINUTES <= s.to);
  const free = (busy: Busy[], d: number, t: number) => !busy.some((b) => b.d === d && t < b.end && b.start < t + CALL_MINUTES);
  if (!ok(input.family, plan.weekday, base) || !ok(input.coordinator, plan.weekday, base) || !free(input.coordinatorBusy, plan.weekday, base)) return false;
  if (!input.mentor) return true;
  const md = plan.mentor_weekday ?? plan.weekday;
  const mt = minutesOf(plan.mentor_start_time) ?? base;
  return ok(input.family, md, mt) && ok(input.coordinator, md, mt) && ok(input.mentor, md, mt)
    && free(input.mentorBusy, md, mt) && free(input.coordinatorBusy, md, mt);
}

/**
 * Busca la hora y, si la hay, la confirma sola y avisa a todos.
 * · Si ya había una hora fija y sigue valiendo para todos, no se toca (la llamada se repite igual).
 * · force: vuelve a buscar aunque la hora actual valga (botón «Buscar otra hora»).
 */
export async function matchPlan(admin: Admin, studentId: string, opts: { force?: boolean; notify?: boolean } = {}) {
  const plan = await ensurePlan(admin, studentId);
  if (plan.status === "pausada") return plan;
  const { missing, input } = await matchInput(admin, studentId, plan.mentor_id, plan.coordinator_id);
  const now = new Date().toISOString();
  if (!input) {
    const { data } = await admin.from("kiru_call_plans").update({
      status: plan.status === "confirmada" ? "confirmada" : "sin_datos", missing, options: [] as Json, updated_at: now,
    }).eq("student_id", studentId).select("*").single();
    return data!;
  }
  if (plan.status === "confirmada" && !opts.force && stillFits(plan, input)) {
    const options = findMatches(input);
    await admin.from("kiru_call_plans").update({ missing: [], options: options as unknown as Json, updated_at: now }).eq("student_id", studentId);
    return plan;
  }
  const options = findMatches(input);
  if (!options.length) {
    const reason = whyNoMatch(input);
    const { data } = await admin.from("kiru_call_plans").update({
      status: "sin_hueco", missing: [reason], options: [] as Json, weekday: null, start_time: null, mentor_weekday: null, mentor_start_time: null,
      confirmed_at: null, confirmed_via: null, updated_at: now,
    }).eq("student_id", studentId).select("*").single();
    if (opts.notify !== false) {
      const kid = firstName(await nameOf(admin, studentId));
      await notifyCall(admin, [plan.coordinator_id], studentId, `No hay hora común para la llamada con la familia de ${kid}`,
        `${reason} Puedes pedir a quien falte que actualice su disponibilidad o fijar una hora a mano en «Llamadas con familias».`,
        `llamada:sin_hueco:${studentId}:${madridTodayIso()}`);
    }
    return data!;
  }
  return confirmPlan(admin, studentId, options[0], { via: "auto", by: null, options, notify: opts.notify !== false });
}

/** Fija la hora (sola o a mano), rehace las llamadas futuras y avisa a familia, mentor y coordinador. */
export async function confirmPlan(admin: Admin, studentId: string, o: Pick<MatchOption, "weekday" | "start" | "mentorWeekday" | "mentorStart" | "bothParents">,
  meta: { via: "auto" | "manual"; by: string | null; options?: MatchOption[]; notify?: boolean }) {
  const fam = await latestFamilyAvailability(admin, studentId);
  const now = new Date().toISOString();
  const { data: plan } = await admin.from("kiru_call_plans").update({
    status: "confirmada", weekday: o.weekday, start_time: timeOf(o.start),
    mentor_weekday: o.mentorWeekday, mentor_start_time: o.mentorStart === null ? null : timeOf(o.mentorStart),
    both_parents: o.bothParents, medium: fam?.medium ?? "zoom", confirmed_at: now, confirmed_via: meta.via, confirmed_by: meta.by,
    missing: [], ...(meta.options ? { options: meta.options as unknown as Json } : {}), updated_at: now,
  }).eq("student_id", studentId).select("*").single();
  if (!plan) throw new Error("No se pudo guardar la hora.");
  // Las llamadas futuras que no se han movido a mano se rehacen con la hora nueva.
  await admin.from("kiru_family_calls").delete().eq("student_id", studentId).eq("status", "programada").eq("moved", false).gt("scheduled_start", now);
  await generateCalls(admin, plan);
  if (meta.notify !== false) await notifyConfirmed(admin, plan);
  return plan;
}

async function notifyConfirmed(admin: Admin, plan: CallPlanRow) {
  const kid = firstName(await nameOf(admin, plan.student_id));
  const t = planTimes(plan);
  const key = `llamada:hora:${plan.student_id}:${plan.weekday}-${plan.start_time}-${plan.mentor_weekday ?? ""}-${plan.mentor_start_time ?? ""}`;
  const body = t.mentorFixed
    ? `Cada ${t.fixed} (20 minutos). Las semanas 1 y 4, con el mentor: ${t.mentorFixed}.`
    : `Cada ${t.fixed} (20 minutos). Las semanas 1 y 4 se une el mentor.`;
  await notifyCall(admin, await guardiansOf(admin, plan.student_id), plan.student_id, `Ya tenéis hora para la llamada semanal de ${kid}`, body, `${key}:familia`);
  await notifyCall(admin, [plan.mentor_id], plan.student_id, `Llamadas con la familia de ${kid}`,
    t.mentorFixed ? `Te unes las semanas 1 y 4: ${t.mentorFixed}.` : `Te unes las semanas 1 y 4: ${t.fixed}.`, `${key}:mentor`);
  await notifyCall(admin, [plan.coordinator_id], plan.student_id, `Hora fijada: llamada con la familia de ${kid}`,
    `${body} Avisa en el grupo de WhatsApp de la familia con el botón del correo o de «Llamadas con familias».`, `${key}:coordinador`);
}

/** Crea las llamadas de las próximas semanas (no duplica). */
export async function generateCalls(admin: Admin, plan: CallPlanRow) {
  if (plan.status !== "confirmada" || !plan.weekday || !plan.start_time) return 0;
  const anchor = await anchorMonday(admin, plan.student_id, plan.start_override);
  if (!anchor) return 0;
  const today = madridTodayIso();
  const nowMs = Date.now();
  const rows: Database["public"]["Tables"]["kiru_family_calls"]["Insert"][] = [];
  for (let week = mondayOf(today); week <= addDaysIso(today, CALENDAR_AHEAD_DAYS); week = addDaysIso(week, 7)) {
    if (week < anchor) continue;
    const weekNo = weekNumber(anchor, week);
    const withMentor = weekNo === 1 || weekNo === 4;
    const useMentorTime = withMentor && plan.mentor_weekday && plan.mentor_start_time;
    const d = useMentorTime ? plan.mentor_weekday! : plan.weekday;
    const t = minutesOf(useMentorTime ? plan.mentor_start_time : plan.start_time)!;
    const start = madridToUtcIso(addDaysIso(week, d - 1), t);
    if (Date.parse(start) <= nowMs) continue;
    rows.push({
      student_id: plan.student_id, week_start: week, week_no: weekNo, with_mentor: withMentor,
      mentor_id: withMentor ? plan.mentor_id : null, coordinator_id: plan.coordinator_id, scheduled_start: start, medium: plan.medium,
    });
  }
  if (!rows.length) return 0;
  const { data } = await admin.from("kiru_family_calls").upsert(rows, { onConflict: "student_id,week_start", ignoreDuplicates: true }).select("id");
  return data?.length ?? 0;
}

// --- Mover una semana -------------------------------------------------------------------------

/** Horas libres esa misma semana para mover una llamada (familia ∩ coordinador ∩ mentor si toca). */
export async function moveOptions(admin: Admin, call: FamilyCallRow, limit = 6): Promise<string[]> {
  const fam = await latestFamilyAvailability(admin, call.student_id);
  const coord = call.coordinator_id ? await latestStaffAvailability(admin, call.coordinator_id) : null;
  if (!fam || !coord) return [];
  const mentor = call.with_mentor && call.mentor_id ? await latestStaffAvailability(admin, call.mentor_id) : null;
  if (call.with_mentor && call.mentor_id && !mentor) return [];
  // Otras llamadas de esa semana del coordinador (y del mentor).
  const weekEnd = addDaysIso(call.week_start, 7);
  const from = madridToUtcIso(call.week_start, 0);
  const to = madridToUtcIso(weekEnd, 0);
  const { data: others } = await admin.from("kiru_family_calls").select("scheduled_start,coordinator_id,mentor_id")
    .neq("id", call.id).neq("status", "cancelada").gte("scheduled_start", from).lt("scheduled_start", to)
    .or(`coordinator_id.eq.${call.coordinator_id}${call.mentor_id ? `,mentor_id.eq.${call.mentor_id}` : ""}`);
  const toBusy = (iso: string): Busy => {
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso));
    const g = (t: string) => local.find((x) => x.type === t)?.value ?? "0";
    const date = `${g("year")}-${g("month")}-${g("day")}`;
    const d = (new Date(`${date}T12:00:00Z`).getUTCDay() || 7);
    const m = Number(g("hour")) * 60 + Number(g("minute"));
    return { d, start: m, end: m + CALL_MINUTES };
  };
  const busyC = (others ?? []).filter((o) => o.coordinator_id === call.coordinator_id).map((o) => toBusy(o.scheduled_start));
  const busyM = (others ?? []).filter((o) => call.mentor_id && o.mentor_id === call.mentor_id).map((o) => toBusy(o.scheduled_start));
  const classes = call.with_mentor && call.mentor_id ? await classBusy(admin, call.mentor_id) : [];
  const opts = findMatches({
    family: slotsFrom(fam.slots), bothParentsDays: fam.both_parents_days ?? [], coordinator: slotsFrom(coord.slots),
    mentor: mentor ? slotsFrom(mentor.slots) : null, coordinatorBusy: busyC, mentorBusy: [...busyM, ...classes],
  }, 50);
  const nowMs = Date.now() + 3 * 3_600_000; // con al menos 3 horas de margen
  return opts
    .filter((o) => o.mentorWeekday === null)
    .map((o) => madridToUtcIso(addDaysIso(call.week_start, o.weekday - 1), o.start))
    .filter((iso) => Date.parse(iso) > nowMs && iso !== call.scheduled_start)
    .sort()
    .slice(0, limit);
}

export async function moveCall(admin: Admin, call: FamilyCallRow, startIso: string, by: string, byFamily: boolean) {
  await admin.from("kiru_family_calls").update({ scheduled_start: startIso, moved: true, moved_by: by, updated_at: new Date().toISOString() }).eq("id", call.id);
  const kid = firstName(await nameOf(admin, call.student_id));
  const who = byFamily ? "La familia" : "Coordinación";
  const recipients = byFamily ? [call.coordinator_id, call.with_mentor ? call.mentor_id : null] : [...await guardiansOf(admin, call.student_id), call.with_mentor ? call.mentor_id : null];
  await notifyCall(admin, recipients, call.student_id, `Llamada de ${kid} movida esta semana`,
    `${who} ha movido la llamada de esta semana al ${callWhen(startIso)}. La hora fija de las demás semanas no cambia.`,
    `llamada:movida:${call.id}:${startIso}`);
}

// --- Tarea periódica --------------------------------------------------------------------------

/**
 * Se ejecuta cada vez que el Apps Script pide los correos (cada 5 minutos) y al abrir el panel.
 * Repetirla no duplica nada.
 * · Crea las llamadas de las próximas 3 semanas de los planes con hora fija.
 * · Pide a la familia que rellene el formulario si aún no lo ha hecho (una vez).
 * · Tras cada llamada de las semanas 1 y 4, pide al coordinador que valore al mentor (y lo recuerda a los 3 días).
 */
export async function runCallsTask(admin: Admin): Promise<{ students: number; calls: number; notices: number }> {
  const settings = await loadCallSettings(admin);
  const scope = await scopeStudents(admin, settings);
  let calls = 0;
  let notices = 0;
  for (const studentId of scope) {
    const plan = await ensurePlan(admin, studentId);
    if (plan.status === "confirmada") calls += await generateCalls(admin, plan);
    else if (plan.status === "sin_datos" && plan.missing.length === 0) await matchPlan(admin, studentId);
    if (!plan.form_requested_at && !(await latestFamilyAvailability(admin, studentId))) {
      const kid = firstName(await nameOf(admin, studentId));
      await notifyCall(admin, await guardiansOf(admin, studentId), studentId, `¿Cuándo os viene bien la llamada semanal de ${kid}?`,
        "Cada semana hablamos 20 minutos con vosotros para ver cómo va. Marcad en el formulario los ratos que os vienen bien y buscamos la hora.",
        `llamada:pedir_form:${studentId}`);
      await admin.from("kiru_call_plans").update({ form_requested_at: new Date().toISOString() }).eq("student_id", studentId);
      notices++;
    }
  }
  if (!scope.length) return { students: 0, calls, notices };

  // Valorar al mentor tras las llamadas de las semanas 1 y 4.
  const ended = new Date(Date.now() - CALL_MINUTES * 60_000).toISOString();
  const { data: toRate } = await admin.from("kiru_family_calls").select("*")
    .in("student_id", scope).eq("with_mentor", true).eq("status", "programada").lt("scheduled_start", ended)
    .gt("scheduled_start", new Date(Date.now() - 30 * 86_400_000).toISOString());
  for (const c of toRate ?? []) {
    const kid = firstName(await nameOf(admin, c.student_id));
    const mentor = firstName(await nameOf(admin, c.mentor_id));
    if (!c.steps.includes("valorar")) {
      await notifyCall(admin, [c.coordinator_id], c.student_id, `Valora a ${mentor || "el mentor"} en la llamada de ${kid}`,
        `¿Cómo estuvo ${mentor || "el mentor"} en la llamada del ${callWhen(c.scheduled_start)}? Son 5 preguntas del 1 al 5 (1 minuto).`,
        `llamada:valorar:${c.id}`);
      await admin.from("kiru_family_calls").update({ steps: [...c.steps, "valorar"] }).eq("id", c.id);
      notices++;
    } else if (!c.steps.includes("valorar_r") && Date.parse(c.scheduled_start) < Date.now() - RATE_REMINDER_DAYS * 86_400_000) {
      await notifyCall(admin, [c.coordinator_id], c.student_id, `Recordatorio: valora a ${mentor || "el mentor"} (llamada de ${kid})`,
        `Falta tu valoración de la llamada del ${callWhen(c.scheduled_start)}.`, `llamada:valorar_r:${c.id}`);
      await admin.from("kiru_family_calls").update({ steps: [...c.steps, "valorar_r"] }).eq("id", c.id);
      notices++;
    }
  }
  return { students: scope.length, calls, notices };
}

export async function staffRow(admin: Admin, profileId: string) {
  const { data } = await admin.from("kiru_call_staff").select("*").eq("profile_id", profileId).maybeSingle();
  if (data) return data;
  const { data: created } = await admin.from("kiru_call_staff").upsert({ profile_id: profileId }, { onConflict: "profile_id" }).select("*").single();
  return created!;
}

/** Enlace personal al formulario del equipo (con su código y su correo/nombre ya puestos). */
export async function teamFormUrl(admin: Admin, profileId: string, email: string, name: string): Promise<string> {
  const s = await loadCallSettings(admin);
  const row = await staffRow(admin, profileId);
  return formLink(s.teamForm, s.codeField, row.token, { email: email ?? "", nombre: name });
}

export { whatsappLink };
