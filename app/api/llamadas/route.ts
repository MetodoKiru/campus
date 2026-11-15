import { NextResponse } from "next/server";
import type { CallPlanRow, FamilyCallRow, Json } from "@/lib/database.types";
import { requireStaff, UUID_RE } from "@/lib/server/require-staff";
import {
  CALL_MINUTES, fromMinutes, isWeekday, madridToUtcIso, MENTOR_CALL_CRITERIA, toMinutes,
  type CallMode, type CallView, type FamilyCallsPayload, type MatchOption, type MentorCallKey, type MentorCallsPayload,
  type MentorPresence, type PlanView, type StaffCallsPayload,
} from "@/lib/llamadas";
import {
  anchorMonday, confirmPlan, ensurePlan, firstName, formLink, latestFamilyAvailability, latestStaffAvailability, loadCallSettings,
  generateCalls, matchPlan, moveCall, moveOptions, planTimes, planWhatsapp, runCallsTask, saveCallSettings, scopeStudents, staffRow, teamFormUrl, zoomOf,
} from "@/lib/server/llamadas";

export const runtime = "nodejs";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max = 1500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

type Auth = Extract<Awaited<ReturnType<typeof requireStaff>>, { ok: true }>;
type Admin = Auth["admin"];

async function names(admin: Admin, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const { data } = unique.length ? await admin.from("profiles").select("id,full_name").in("id", unique) : { data: [] };
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

const ratingsOf = (c: FamilyCallRow) =>
  Object.fromEntries(MENTOR_CALL_CRITERIA.map((k) => [k.key, c[k.key] ?? null])) as Record<MentorCallKey, number | null>;

function callView(c: FamilyCallRow, who: Map<string, string>, zoom: Map<string, string>, phone: string): CallView {
  return {
    id: c.id, studentId: c.student_id, studentName: who.get(c.student_id) ?? "", weekStart: c.week_start, weekNo: c.week_no,
    withMentor: c.with_mentor, mentorName: who.get(c.mentor_id ?? "") ?? "", coordinatorName: who.get(c.coordinator_id ?? "") ?? "",
    scheduledStart: c.scheduled_start, medium: c.medium, moved: c.moved, status: c.status, mentorPresence: c.mentor_presence,
    ratings: ratingsOf(c), comment: c.comment, parentsTopics: c.parents_topics,
    needsRating: c.with_mentor && c.status === "programada" && Date.parse(c.scheduled_start) + CALL_MINUTES * 60_000 < Date.now(),
    ended: Date.parse(c.scheduled_start) + CALL_MINUTES * 60_000 < Date.now(),
    zoomUrl: zoom.get(c.coordinator_id ?? "") ?? "", phone,
  };
}

/**
 * Llamadas semanales con las familias.
 * · Familia: enlace a su formulario, hora fija y próximas llamadas (con «Mover esta semana»).
 * · Mentor: su enlace al formulario del equipo y sus llamadas (semanas 1 y 4).
 * · Coordinación (sus alumnos) y administración (todos): planes, calendario, valoraciones y ajustes.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["padre", "mentor", "coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;
  const settings = await loadCallSettings(admin);
  const now = new Date();
  const since = new Date(now.getTime() - 35 * 86_400_000).toISOString();

  if (role === "padre") {
    const { data: links } = await admin.from("student_guardians").select("student_id").eq("guardian_id", user.id);
    const scope = new Set(await scopeStudents(admin, settings));
    const kidsIds = (links ?? []).map((l) => l.student_id).filter((id) => scope.has(id));
    const payload: FamilyCallsPayload = { kids: [] };
    for (const studentId of kidsIds) {
      const plan = await ensurePlan(admin, studentId);
      const who = await names(admin, [studentId, plan.mentor_id, plan.coordinator_id]);
      const fam = await latestFamilyAvailability(admin, studentId);
      const { data: calls } = await admin.from("kiru_family_calls").select("*").eq("student_id", studentId)
        .neq("status", "cancelada").gte("scheduled_start", new Date(now.getTime() - 86_400_000).toISOString()).order("scheduled_start").limit(4);
      const t = planTimes(plan);
      payload.kids.push({
        studentId, studentName: firstName(who.get(studentId) ?? ""),
        formUrl: formLink(settings.familyForm, settings.codeField, plan.token, { email: user.email ?? "" }),
        answeredAt: fam?.received_at ?? null, status: plan.status, fixed: t.fixed, mentorFixed: t.mentorFixed, medium: plan.medium,
        zoomUrl: plan.medium === "zoom" ? await zoomOf(admin, plan.coordinator_id) : "",
        coordinatorName: firstName(who.get(plan.coordinator_id ?? "") ?? ""), mentorName: firstName(who.get(plan.mentor_id ?? "") ?? ""),
        calls: await Promise.all((calls ?? []).map(async (c) => ({
          id: c.id, scheduledStart: c.scheduled_start, withMentor: c.with_mentor, status: c.status, moved: c.moved, weekNo: c.week_no,
          moveOptions: c.status === "programada" && Date.parse(c.scheduled_start) > now.getTime() ? await moveOptions(admin, c, 5) : [],
        }))),
      });
    }
    return NextResponse.json(payload);
  }

  if (role === "mentor") {
    const fam = await latestStaffAvailability(admin, user.id);
    const { data: me } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const { data: calls } = await admin.from("kiru_family_calls").select("*").eq("mentor_id", user.id).eq("with_mentor", true)
      .neq("status", "cancelada").gte("scheduled_start", new Date(now.getTime() - 86_400_000).toISOString()).order("scheduled_start").limit(10);
    const who = await names(admin, (calls ?? []).flatMap((c) => [c.student_id, c.coordinator_id]));
    const zooms = new Map<string, string>();
    for (const c of calls ?? []) if (c.coordinator_id && !zooms.has(c.coordinator_id)) zooms.set(c.coordinator_id, await zoomOf(admin, c.coordinator_id));
    const payload: MentorCallsPayload = {
      formUrl: await teamFormUrl(admin, user.id, user.email ?? "", me?.full_name ?? ""), answeredAt: fam?.received_at ?? null,
      calls: (calls ?? []).map((c) => ({
        id: c.id, studentName: who.get(c.student_id) ?? "", scheduledStart: c.scheduled_start, medium: c.medium,
        zoomUrl: c.medium === "zoom" ? zooms.get(c.coordinator_id ?? "") ?? "" : "", coordinatorName: firstName(who.get(c.coordinator_id ?? "") ?? ""),
        weekNo: c.week_no, status: c.status,
      })),
    };
    return NextResponse.json(payload);
  }

  if (role !== "coordinador" && role !== "admin") return fail("No tienes permisos para esta sección.", 403);
  // Al abrir el panel se ponen al día las llamadas y los avisos.
  await runCallsTask(admin).catch(() => null);
  const scope = await scopeStudents(admin, settings);
  const { data: allPlans } = scope.length ? await admin.from("kiru_call_plans").select("*").in("student_id", scope) : { data: [] as CallPlanRow[] };
  const plans = (allPlans ?? []).filter((p) => role === "admin" || p.coordinator_id === user.id);
  const studentIds = plans.map((p) => p.student_id);
  const { data: calls } = studentIds.length
    ? await admin.from("kiru_family_calls").select("*").in("student_id", studentIds).neq("status", "cancelada")
      .gte("scheduled_start", since).lte("scheduled_start", new Date(now.getTime() + 22 * 86_400_000).toISOString()).order("scheduled_start")
    : { data: [] as FamilyCallRow[] };
  const who = await names(admin, plans.flatMap((p) => [p.student_id, p.mentor_id, p.coordinator_id]));
  const zooms = new Map<string, string>();
  for (const p of plans) if (p.coordinator_id && !zooms.has(p.coordinator_id)) zooms.set(p.coordinator_id, await zoomOf(admin, p.coordinator_id));

  const planViews: PlanView[] = [];
  const phones = new Map<string, string>();
  for (const p of plans) {
    const fam = await latestFamilyAvailability(admin, p.student_id);
    phones.set(p.student_id, fam?.phone ?? "");
    const missingLabel: Record<string, string> = {
      familia: "La familia aún no ha rellenado su formulario.",
      coordinador: "Falta tu disponibilidad (formulario del equipo).",
      mentor: `Falta la disponibilidad de ${firstName(who.get(p.mentor_id ?? "") ?? "") || "el mentor"}.`,
      sin_coordinador: "El mentor no tiene coordinador asignado.",
    };
    planViews.push({
      studentId: p.student_id, studentName: who.get(p.student_id) ?? "", mentorId: p.mentor_id, mentorName: who.get(p.mentor_id ?? "") ?? "",
      coordinatorId: p.coordinator_id, coordinatorName: who.get(p.coordinator_id ?? "") ?? "", status: p.status,
      weekday: p.weekday, start: p.start_time?.slice(0, 5) ?? null, mentorWeekday: p.mentor_weekday, mentorStart: p.mentor_start_time?.slice(0, 5) ?? null,
      medium: p.medium, bothParents: p.both_parents, missing: p.missing.map((m) => missingLabel[m] ?? m),
      options: (Array.isArray(p.options) ? p.options : []) as unknown as MatchOption[],
      anchorMonday: await anchorMonday(admin, p.student_id, p.start_override), startOverride: p.start_override, confirmedVia: p.confirmed_via,
      familyFormUrl: formLink(settings.familyForm, settings.codeField, p.token), familyAnswered: fam?.received_at ?? null,
      commitments: fam?.commitments ?? "", phone: fam?.phone ?? "",
      whatsappText: p.status === "confirmada" ? await planWhatsapp(admin, p) : "", inScope: true,
    });
  }
  planViews.sort((a, b) => a.studentName.localeCompare(b.studentName, "es"));

  const me = await staffRow(admin, user.id);
  const myAvail = await latestStaffAvailability(admin, user.id);
  const { data: myProfile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const { data: unlinked } = await admin.from("kiru_call_availability").select("id,kind,name,email,answers,received_at")
    .is("student_id", null).is("profile_id", null).is("archived_at", null).order("received_at", { ascending: false }).limit(30);

  let staff: StaffCallsPayload["staff"] = [];
  let allStudents: StaffCallsPayload["allStudents"] = [];
  if (role === "admin") {
    const { data: people } = await admin.from("profiles").select("id,full_name,role").in("role", ["mentor", "coordinador", "admin"]).eq("is_active", true).order("full_name");
    const { data: avail } = await admin.from("kiru_call_availability").select("profile_id,received_at").eq("kind", "equipo").not("profile_id", "is", null).is("archived_at", null);
    const { data: zoomRows } = await admin.from("kiru_call_staff").select("profile_id,zoom_url");
    const last = new Map<string, string>();
    for (const a of avail ?? []) if (a.profile_id && (!last.has(a.profile_id) || last.get(a.profile_id)! < a.received_at)) last.set(a.profile_id, a.received_at);
    const zoomSet = new Set((zoomRows ?? []).filter((z) => z.zoom_url).map((z) => z.profile_id));
    staff = (people ?? []).map((p) => ({ id: p.id, name: p.full_name, role: p.role, answeredAt: last.get(p.id) ?? null, zoom: zoomSet.has(p.id) }));
    const { data: kids } = await admin.from("profiles").select("id,full_name").eq("role", "alumno").eq("is_active", true).order("full_name");
    allStudents = (kids ?? []).map((k) => ({ id: k.id, name: k.full_name }));
  }

  const payload: StaffCallsPayload = {
    role,
    me: {
      zoomUrl: me.zoom_url, rulesAck: Boolean(me.rules_ack_at),
      teamFormUrl: await teamFormUrl(admin, user.id, user.email ?? "", myProfile?.full_name ?? ""), answeredAt: myAvail?.received_at ?? null,
    },
    plans: planViews,
    calls: (calls ?? []).map((c) => callView(c, who, zooms, phones.get(c.student_id) ?? "")),
    unlinked: (unlinked ?? []).map((u) => ({
      id: u.id, kind: u.kind, name: u.name, email: u.email, receivedAt: u.received_at,
      studentName: typeof (u.answers as Record<string, Json> | null)?._alumno === "string" ? String((u.answers as Record<string, Json>)._alumno) : "",
    })),
    settings: role === "admin" ? { mode: settings.mode, testStudents: settings.testStudents } : null,
    allStudents, staff,
  };
  return NextResponse.json(payload);
}

async function canManage(auth: Auth, studentId: string): Promise<CallPlanRow | null> {
  const { data } = await auth.admin.from("kiru_call_plans").select("*").eq("student_id", studentId).maybeSingle();
  if (!data) return null;
  if (auth.role === "admin" || data.coordinator_id === auth.user.id) return data;
  return null;
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, ["padre", "coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("Petición no válida."); }
  const action = String(body.action ?? "");

  // --- Familia: mover la llamada de esta semana -----------------------------------------------
  if (role === "padre") {
    if (action !== "mover") return fail("Acción no válida.");
    const callId = String(body.callId ?? "");
    const start = String(body.start ?? "");
    if (!UUID_RE.test(callId)) return fail("Llamada no válida.");
    const { data: call } = await admin.from("kiru_family_calls").select("*").eq("id", callId).maybeSingle();
    const { data: link } = call ? await admin.from("student_guardians").select("student_id").eq("guardian_id", user.id).eq("student_id", call.student_id).maybeSingle() : { data: null };
    if (!call || !link) return fail("No encontramos esa llamada.", 404);
    if (call.status !== "programada") return fail("Esa llamada ya no se puede mover.");
    const options = await moveOptions(admin, call, 50);
    if (!options.includes(start)) return fail("Esa hora ya no está libre. Elige otra.");
    await moveCall(admin, call, start, user.id, true);
    return NextResponse.json({ ok: true });
  }

  // --- Coordinación y administración -------------------------------------------------------------
  if (action === "zoom") {
    const zoomUrl = text(body.zoomUrl, 300);
    if (zoomUrl && !/^https:\/\/([a-z0-9-]+\.)*zoom\.us\//i.test(zoomUrl)) return fail("Pega el enlace de tu sala personal de Zoom (empieza por https://…zoom.us/).");
    await staffRow(admin, user.id);
    await admin.from("kiru_call_staff").update({
      zoom_url: zoomUrl, ...(body.rulesAck === true ? { rules_ack_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString(),
    }).eq("profile_id", user.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "ajustes") {
    if (role !== "admin") return fail("Solo administración puede cambiar esto.", 403);
    const mode = body.mode as CallMode;
    if (!["apagado", "prueba", "activo"].includes(mode)) return fail("Modo no válido.");
    const tests = Array.isArray(body.testStudents) ? body.testStudents.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, 50) : [];
    await saveCallSettings(admin, { modo: mode, alumnos_prueba: tests });
    await runCallsTask(admin);
    return NextResponse.json({ ok: true });
  }

  if (action === "enlazar") {
    const id = String(body.availabilityId ?? "");
    const target = String(body.targetId ?? "");
    if (!UUID_RE.test(id)) return fail("Respuesta no válida.");
    const { data: a } = await admin.from("kiru_call_availability").select("*").eq("id", id).maybeSingle();
    if (!a) return fail("No encontramos esa respuesta.", 404);
    if (body.archive === true) {
      await admin.from("kiru_call_availability").update({ archived_at: new Date().toISOString(), linked_by: user.id }).eq("id", id);
      return NextResponse.json({ ok: true });
    }
    if (!UUID_RE.test(target)) return fail("Elige a quién pertenece.");
    if (a.kind === "familia") {
      const plan = await ensurePlan(admin, target);
      if (role !== "admin" && plan.coordinator_id !== user.id) return fail("Ese alumno no es de tu grupo.", 403);
      await admin.from("kiru_call_availability").update({ student_id: target, linked_by: user.id }).eq("id", id);
      await matchPlan(admin, target);
    } else {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", target).maybeSingle();
      if (!prof || !["mentor", "coordinador", "admin"].includes(prof.role)) return fail("Elige una persona del equipo.");
      await admin.from("kiru_call_availability").update({ profile_id: target, linked_by: user.id }).eq("id", id);
      const { data: plans } = await admin.from("kiru_call_plans").select("student_id").or(`mentor_id.eq.${target},coordinator_id.eq.${target}`);
      for (const p of plans ?? []) await matchPlan(admin, p.student_id);
    }
    return NextResponse.json({ ok: true });
  }

  const studentId = String(body.studentId ?? "");
  const callId = String(body.callId ?? "");

  if (action === "valorar" || action === "cerrar" || action === "mover_staff") {
    if (!UUID_RE.test(callId)) return fail("Llamada no válida.");
    const { data: call } = await admin.from("kiru_family_calls").select("*").eq("id", callId).maybeSingle();
    if (!call) return fail("No encontramos esa llamada.", 404);
    if (role !== "admin" && call.coordinator_id !== user.id) return fail("Esa llamada no es tuya.", 403);
    if (action === "mover_staff") {
      const date = String(body.date ?? "");
      const minutes = toMinutes(String(body.time ?? ""));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || minutes === null) return fail("Pon día y hora.");
      if (call.status !== "programada") return fail("Esa llamada ya está cerrada.");
      await moveCall(admin, call, madridToUtcIso(date, minutes), user.id, false);
      return NextResponse.json({ ok: true });
    }
    const status = body.status === "no_hecha" ? "no_hecha" : body.status === "cancelada" ? "cancelada" : "hecha";
    const update: Partial<FamilyCallRow> = {
      status, parents_topics: text(body.parentsTopics), comment: text(body.comment), closed_at: new Date().toISOString(), closed_by: user.id,
      updated_at: new Date().toISOString(),
    };
    if (call.with_mentor && status === "hecha") {
      const presence = body.mentorPresence as MentorPresence;
      if (!["estuvo", "ausente", "causa_ajena"].includes(presence)) return fail("Indica si estuvo el mentor.");
      update.mentor_presence = presence;
      const r = (body.ratings ?? {}) as Record<string, unknown>;
      for (const k of MENTOR_CALL_CRITERIA) {
        const v = Number(r[k.key]);
        if (presence === "estuvo") {
          if (!Number.isInteger(v) || v < 1 || v > 5) return fail(`Puntúa «${k.label}» del 1 al 5.`);
          update[k.key] = v;
        } else update[k.key] = null;
      }
    }
    await admin.from("kiru_family_calls").update(update).eq("id", callId);
    return NextResponse.json({ ok: true });
  }

  if (!UUID_RE.test(studentId)) return fail("Alumno no válido.");
  const plan = await canManage(auth, studentId);
  if (!plan) return fail("Ese alumno no es de tu grupo.", 403);

  if (action === "buscar") {
    const p = await matchPlan(admin, studentId, { force: body.force === true });
    return NextResponse.json({ ok: true, status: p.status });
  }
  if (action === "fijar") {
    // A mano: una de las opciones propuestas o una hora escrita.
    const wd = Number(body.weekday);
    const start = toMinutes(String(body.start ?? ""));
    const mwd = body.mentorWeekday === null || body.mentorWeekday === undefined || body.mentorWeekday === "" ? null : Number(body.mentorWeekday);
    const mstart = mwd === null ? null : toMinutes(String(body.mentorStart ?? ""));
    if (!isWeekday(wd) || start === null) return fail("Elige día y hora.");
    if (mwd !== null && (!isWeekday(mwd) || mstart === null)) return fail("Elige día y hora de las semanas con mentor.");
    const fam = await latestFamilyAvailability(admin, studentId);
    await confirmPlan(admin, studentId, {
      weekday: wd, start, mentorWeekday: mwd, mentorStart: mstart, bothParents: (fam?.both_parents_days ?? []).includes(wd),
    }, { via: "manual", by: user.id });
    return NextResponse.json({ ok: true, fixed: `${wd} ${fromMinutes(start)}` });
  }
  if (action === "inicio") {
    const date = String(body.date ?? "");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Fecha no válida.");
    await admin.from("kiru_call_plans").update({ start_override: date || null, updated_at: new Date().toISOString() }).eq("student_id", studentId);
    // Las semanas cambian: se rehacen las llamadas futuras.
    const fresh = await ensurePlan(admin, studentId);
    if (fresh.status === "confirmada") {
      await admin.from("kiru_family_calls").delete().eq("student_id", studentId).eq("status", "programada").eq("moved", false).gt("scheduled_start", new Date().toISOString());
      await generateCalls(admin, fresh);
    }
    return NextResponse.json({ ok: true });
  }
  if (action === "pausar") {
    const paused = body.paused === true;
    await admin.from("kiru_call_plans").update({ status: paused ? "pausada" : "sin_datos", missing: [], updated_at: new Date().toISOString() }).eq("student_id", studentId);
    if (paused) await admin.from("kiru_family_calls").update({ status: "cancelada", updated_at: new Date().toISOString() })
      .eq("student_id", studentId).eq("status", "programada").gt("scheduled_start", new Date().toISOString());
    else await matchPlan(admin, studentId, { force: true });
    return NextResponse.json({ ok: true });
  }
  return fail("Acción no válida.");
}
