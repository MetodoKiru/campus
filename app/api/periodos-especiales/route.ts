import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { requireStaff, EMAIL_RE, UUID_RE } from "@/lib/server/require-staff";
import {
  DATE_RE, TIME_RE, classKey, madridToday, periodPhase, shortDate,
  type AmountLine, type Assignment, type FamilyPeriodView, type MentorPeriodView, type SpecialPeriod, type StaffPeriodView,
} from "@/lib/special-periods";
import {
  PERIOD_COLS, activeAdmins, activeSlots, billingFor, classesFor, firstName, guardiansOf, latestRenewals, logEvent, mapPeriod,
  noClassDays, notify, parseAmounts, parseAssignments, parseChoices, parseOwn, parseSlots,
} from "@/lib/server/special-periods";

export const runtime = "nodejs";

const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown, fallback = false) => (typeof v === "boolean" ? v : fallback);
const list = (v: unknown, max = 400): Record<string, unknown>[] =>
  (Array.isArray(v) ? v : []).slice(0, max).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** El formulario de un periodo se ve en los paneles desde que se abre hasta que termina. */
const visibleToPanels = (p: SpecialPeriod, today: string) => p.isActive && today >= p.formOpensOn && today <= p.endsOn;
/** Familias y mentores pueden responder o cambiar su respuesta hasta el cierre operativo. */
const canAnswer = (p: SpecialPeriod, today: string) => p.isActive && today >= p.formOpensOn && today <= p.closesOn;

async function loadPeriods(admin: Parameters<typeof noClassDays>[0]) {
  const { data, error } = await admin.from("kiru_special_periods").select(PERIOD_COLS).order("starts_on");
  if (error) throw new Error("No se pudieron cargar los periodos especiales.");
  return (data ?? []).map(mapPeriod);
}

/**
 * Periodos especiales (Navidad, Semana Santa…): lo que ve cada panel.
 * · Familia: el formulario de cada hijo/a y, cuando está aprobado, su plan.
 * · Mentor: sus clases del periodo y su disponibilidad para sustituir.
 * · Coordinación (su grupo) y administración: respuestas, cruce y planes.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["padre", "mentor", "coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;
  const today = madridToday();
  let periods: SpecialPeriod[];
  try { periods = await loadPeriods(admin); } catch (e) { return fail((e as Error).message, 500); }

  if (role === "padre") {
    const open = periods.filter((p) => visibleToPanels(p, today));
    if (!open.length) return NextResponse.json({ periods: [] satisfies FamilyPeriodView[] });
    const { data: links } = await admin.from("student_guardians").select("student_id").eq("guardian_id", user.id);
    const ids = (links ?? []).map((l) => l.student_id);
    const [{ data: names }, { data: active }, slots] = await Promise.all([
      ids.length ? admin.from("profiles").select("id,full_name").in("id", ids) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ids.length ? admin.from("students").select("profile_id").in("profile_id", ids).neq("service_status", "baja") : Promise.resolve({ data: [] as { profile_id: string }[] }),
      activeSlots(admin, { students: ids }),
    ]);
    const kids = (names ?? []).filter((n) => (active ?? []).some((a) => a.profile_id === n.id));
    const out: FamilyPeriodView[] = [];
    for (const p of open) {
      const closed = await noClassDays(admin, p.startsOn, p.endsOn);
      const kidIds = kids.map((k) => k.id);
      const [{ data: answers }, { data: plans }] = await Promise.all([
        admin.from("kiru_special_period_family").select("*").eq("period_id", p.id).in("student_id", kidIds.length ? kidIds : ["00000000-0000-0000-0000-000000000000"]),
        admin.from("kiru_special_period_plans").select("*").eq("period_id", p.id).eq("status", "aprobado").in("student_id", kidIds.length ? kidIds : ["00000000-0000-0000-0000-000000000000"]),
      ]);
      // Del sustituto, la familia solo ve nombre de pila, especialidades acreditadas y desde cuándo está en Kiru.
      const subIds = [...new Set((plans ?? []).flatMap((pl) => parseAssignments(pl.assignments).map((a) => a.substituteId).filter((x): x is string => !!x)))];
      const subs = new Map<string, { firstName: string; specialties: string[]; inKiruSince: string | null }>();
      if (subIds.length) {
        const { data: subRows } = await admin.from("kiru_special_period_mentors").select("id,mentor_id,external_name").in("id", subIds);
        const mentorIds = (subRows ?? []).map((s) => s.mentor_id).filter((x): x is string => !!x);
        const { data: profiles } = mentorIds.length ? await admin.from("profiles").select("id,full_name,created_at").in("id", mentorIds) : { data: [] };
        const specialties = await specialtiesById(admin, mentorIds);
        for (const s of subRows ?? []) {
          const prof = (profiles ?? []).find((x) => x.id === s.mentor_id);
          subs.set(s.id, {
            firstName: firstName(prof?.full_name ?? s.external_name),
            specialties: s.mentor_id ? specialties.get(s.mentor_id) ?? [] : [],
            inKiruSince: prof?.created_at ?? null,
          });
        }
      }
      out.push({
        period: p,
        phase: periodPhase(p, today),
        students: kids.map((k) => {
          const a = (answers ?? []).find((x) => x.student_id === k.id);
          const pl = (plans ?? []).find((x) => x.student_id === k.id);
          return {
            id: k.id, name: k.full_name,
            classes: classesFor(slots, k.id, p.startsOn, p.endsOn, closed),
            answer: a ? { choices: parseChoices(a.choices), acceptsSubstitute: a.accepts_substitute, extraSessions: a.extra_sessions, comments: a.comments, late: a.late, answeredAt: a.answered_at } : null,
            plan: pl ? {
              assignments: parseAssignments(pl.assignments).map((x) => ({ ...x, substitute: x.who === "sustituto" && x.substituteId ? subs.get(x.substituteId) ?? null : null })),
              amounts: parseAmounts(pl.amounts), approvedAt: pl.approved_at,
            } : null,
          };
        }),
      });
    }
    return NextResponse.json({ periods: out });
  }

  if (role === "mentor") {
    const open = periods.filter((p) => visibleToPanels(p, today));
    const slots = await activeSlots(admin, { mentor: user.id });
    const studentIds = [...new Set(slots.map((s) => s.studentId))];
    const { data: names } = studentIds.length ? await admin.from("profiles").select("id,full_name").in("id", studentIds) : { data: [] };
    const out: MentorPeriodView[] = [];
    for (const p of open) {
      const closed = await noClassDays(admin, p.startsOn, p.endsOn);
      const { data: a } = await admin.from("kiru_special_period_mentors").select("*").eq("period_id", p.id).eq("mentor_id", user.id).maybeSingle();
      out.push({
        period: p, phase: periodPhase(p, today),
        classes: studentIds.flatMap((sid) => classesFor(slots, sid, p.startsOn, p.endsOn, closed)
          .map((c) => ({ ...c, studentId: sid, studentName: (names ?? []).find((n) => n.id === sid)?.full_name ?? "" })))
          .sort((x, y) => x.date.localeCompare(y.date) || x.start.localeCompare(y.start)),
        answer: a ? { ownClasses: parseOwn(a.own_classes), wantsToSubstitute: a.wants_to_substitute, slots: parseSlots(a.slots), zones: a.zones, maxSessions: a.max_sessions, comments: a.comments, answeredAt: a.answered_at } : null,
      });
    }
    return NextResponse.json({ periods: out });
  }

  // Coordinación y administración.
  const wanted = new URL(request.url).searchParams.get("periodo");
  const selected = periods.find((p) => p.id === wanted)
    ?? periods.find((p) => p.isActive && p.endsOn >= today) ?? periods[periods.length - 1] ?? null;
  const view: StaffPeriodView = { role: role as "admin" | "coordinador", periods, selected: null };
  if (!selected) return NextResponse.json(view);

  // Alumnos activos con horario; el coordinador, solo los de su grupo.
  let mentorScope: string[] | null = null;
  if (role === "coordinador") {
    const { data } = await admin.from("kiru_coordinator_mentors").select("mentor_id").eq("coordinator_id", user.id);
    mentorScope = (data ?? []).map((m) => m.mentor_id);
  }
  const allSlots = await activeSlots(admin, {});
  const slots = mentorScope ? allSlots.filter((s) => mentorScope!.includes(s.mentorId)) : allSlots;
  const studentIds = [...new Set(slots.map((s) => s.studentId))];
  const [{ data: studentRows }, { data: profileRows }, { data: answers }, { data: plans }, { data: mentorAnswers }, { data: logRows }, renewals, closed] = await Promise.all([
    studentIds.length ? admin.from("students").select("profile_id,municipality,service_status").in("profile_id", studentIds) : Promise.resolve({ data: [] as { profile_id: string; municipality: string; service_status: string }[] }),
    admin.from("profiles").select("id,full_name,role,is_active").in("role", ["mentor", "coordinador", "admin", "formador", "alumno"]),
    admin.from("kiru_special_period_family").select("*").eq("period_id", selected.id),
    admin.from("kiru_special_period_plans").select("*").eq("period_id", selected.id),
    admin.from("kiru_special_period_mentors").select("*").eq("period_id", selected.id).order("answered_at"),
    admin.from("kiru_special_period_log").select("*").eq("period_id", selected.id).order("created_at", { ascending: false }).limit(200),
    latestRenewals(admin, studentIds),
    noClassDays(admin, selected.startsOn, selected.endsOn),
  ]);
  const name = new Map((profileRows ?? []).map((p) => [p.id, p.full_name]));
  const activeStudents = (studentRows ?? []).filter((s) => s.service_status !== "baja");
  const emails = new Map<string, string>();
  if (role === "admin") {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) emails.set(u.id, (u.email ?? "").toLowerCase());
  }
  const mentorIdsAnswered = (mentorAnswers ?? []).map((m) => m.mentor_id).filter((x): x is string => !!x);
  const specialties = await specialtiesById(admin, mentorIdsAnswered);

  view.selected = {
    period: selected,
    phase: periodPhase(selected, today),
    students: activeStudents.map((s) => {
      const sid = s.profile_id;
      const mine = slots.filter((x) => x.studentId === sid);
      const a = (answers ?? []).find((x) => x.student_id === sid);
      const pl = (plans ?? []).find((x) => x.student_id === sid);
      const choices = a ? parseChoices(a.choices) : [];
      const removed = new Set(choices.filter((c) => !c.wants).map((c) => classKey(c.date, c.start)));
      const renewal = renewals.get(sid) ?? null;
      return {
        id: sid, name: name.get(sid) ?? "", municipality: s.municipality,
        mentorId: mine[0]?.mentorId ?? null, mentorName: name.get(mine[0]?.mentorId ?? "") ?? "",
        classes: classesFor(slots, sid, selected.startsOn, selected.endsOn, closed),
        answer: a ? { choices, acceptsSubstitute: a.accepts_substitute, extraSessions: a.extra_sessions, comments: a.comments, late: a.late, answeredAt: a.answered_at } : null,
        plan: pl ? {
          assignments: parseAssignments(pl.assignments), amounts: parseAmounts(pl.amounts), status: pl.status, notes: pl.notes,
          revision: pl.revision, approvedAt: pl.approved_at, approvedByName: pl.approved_by ? name.get(pl.approved_by) ?? null : null,
        } : null,
        billing: billingFor(selected, slots, sid, closed, renewal, removed),
        renewalPrice: renewal?.price ?? null,
      };
    }).sort((x, y) => x.name.localeCompare(y.name, "es")),
    mentors: (mentorAnswers ?? []).map((m) => ({
      id: m.id, mentorId: m.mentor_id, name: m.mentor_id ? name.get(m.mentor_id) ?? "" : m.external_name,
      email: m.mentor_id ? emails.get(m.mentor_id) ?? "" : (role === "admin" ? m.external_email : ""),
      external: !m.mentor_id, ownClasses: parseOwn(m.own_classes), wantsToSubstitute: m.wants_to_substitute, slots: parseSlots(m.slots),
      zones: m.zones, maxSessions: m.max_sessions, comments: m.comments, answeredAt: m.answered_at,
      specialties: m.mentor_id ? specialties.get(m.mentor_id) ?? [] : [],
    })),
    pendingMentors: [...new Set(slots.map((s) => s.mentorId))]
      .filter((id) => !mentorIdsAnswered.includes(id))
      .map((id) => ({ id, name: name.get(id) ?? "" })),
    log: (logRows ?? []).map((l) => ({
      at: l.created_at, actor: l.actor_id ? name.get(l.actor_id) ?? "" : "Sistema", action: l.action,
      student: l.student_id ? name.get(l.student_id) ?? "" : "",
      details: typeof l.details === "object" && l.details && !Array.isArray(l.details) && typeof (l.details as Record<string, Json>).resumen === "string" ? String((l.details as Record<string, Json>).resumen) : "",
    })),
  };
  return NextResponse.json(view);
}

async function specialtiesById(admin: Parameters<typeof noClassDays>[0], ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!ids.length) return out;
  const [{ data: specs }, users] = await Promise.all([
    admin.from("kiru_mentor_specialties").select("email,specialties"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const byEmail = new Map((specs ?? []).map((s) => [s.email.toLowerCase(), s.specialties]));
  for (const u of users.data?.users ?? []) if (ids.includes(u.id)) out.set(u.id, byEmail.get((u.email ?? "").toLowerCase()) ?? []);
  return out;
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, ["padre", "mentor", "coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { return fail("Petición no válida."); }
  const action = text(body.accion, 40);
  const today = madridToday();

  // --- Administración: crear o cambiar un periodo ----------------------------
  if (action === "periodo_guardar") {
    if (role !== "admin") return fail("Solo administración puede cambiar los periodos.", 403);
    const f = {
      name: text(body.name, 80), kind: text(body.kind, 20), country: text(body.country, 40) || "ES", region: text(body.region, 80),
      starts_on: text(body.startsOn, 10), ends_on: text(body.endsOn, 10), form_opens_on: text(body.formOpensOn, 10),
      deadline_on: text(body.deadlineOn, 10), exceptions_until: text(body.exceptionsUntil, 10), closes_on: text(body.closesOn, 10),
      zones: (Array.isArray(body.zones) ? body.zones : []).map((z) => text(z, 60)).filter(Boolean).slice(0, 60),
      notes: text(body.notes, 2000), is_active: bool(body.isActive, true),
    };
    const dates = [f.form_opens_on, f.deadline_on, f.exceptions_until, f.closes_on, f.starts_on, f.ends_on];
    if (f.name.length < 2 || !["navidad", "semana_santa", "verano", "otro"].includes(f.kind) || !dates.every((d) => DATE_RE.test(d))) {
      return fail("Revisa el nombre, el tipo y las fechas.");
    }
    if (!(f.form_opens_on <= f.deadline_on && f.deadline_on <= f.exceptions_until && f.exceptions_until <= f.closes_on && f.closes_on <= f.ends_on && f.starts_on <= f.ends_on)) {
      return fail("Las fechas tienen que ir en orden: apertura del formulario ≤ fecha límite ≤ excepciones ≤ cierre ≤ fin del periodo, y el inicio antes del fin.");
    }
    const id = text(body.id, 40);
    const payload = { ...f, kind: f.kind as SpecialPeriod["kind"], updated_at: new Date().toISOString() };
    const res = id && UUID_RE.test(id)
      ? await admin.from("kiru_special_periods").update(payload).eq("id", id).select("id").maybeSingle()
      : await admin.from("kiru_special_periods").insert({ ...payload, created_by: user.id }).select("id").maybeSingle();
    if (res.error || !res.data) return fail("No se pudo guardar el periodo.", 500);
    await logEvent(admin, { periodId: res.data.id, actorId: user.id, action: id ? "periodo_cambiado" : "periodo_creado",
      details: { resumen: `${f.name}: ${shortDate(f.starts_on)}–${shortDate(f.ends_on)} · ${f.country}${f.region ? ` (${f.region})` : ""}${f.is_active ? "" : " · desactivado"}` } });
    return NextResponse.json({ ok: true, id: res.data.id });
  }

  const periodId = text(body.periodId, 40);
  if (!UUID_RE.test(periodId)) return fail("Falta el periodo.");
  const { data: prow } = await admin.from("kiru_special_periods").select(PERIOD_COLS).eq("id", periodId).maybeSingle();
  if (!prow) return fail("Ese periodo no existe.", 404);
  const period = mapPeriod(prow);

  // --- Familia: responde el formulario de un hijo/a ---------------------------
  if (action === "familia_responder") {
    if (role !== "padre" && role !== "admin") return fail("Solo la familia puede responder este formulario.", 403);
    const studentId = text(body.studentId, 40);
    if (!UUID_RE.test(studentId)) return fail("Falta el alumno.");
    if (role === "padre") {
      const { data: link } = await admin.from("student_guardians").select("student_id").eq("guardian_id", user.id).eq("student_id", studentId).maybeSingle();
      if (!link) return fail("No puedes responder por este alumno.", 403);
      if (!canAnswer(period, today)) return fail("El formulario de este periodo está cerrado. Escribe a Método Kiru si necesitas cambiar algo.", 409);
    }
    const closed = await noClassDays(admin, period.startsOn, period.endsOn);
    const classes = classesFor(await activeSlots(admin, { students: [studentId] }), studentId, period.startsOn, period.endsOn, closed);
    const given = new Map(list(body.choices).map((c) => [classKey(text(c.date, 10), text(c.start, 5)), c.wants !== false]));
    const choices = classes.map((c) => ({ date: c.date, start: c.start, end: c.end, wants: given.get(classKey(c.date, c.start)) ?? true }));
    const extra = Math.max(0, Math.min(20, Math.trunc(Number(body.extraSessions) || 0)));
    const late = today > period.deadlineOn;
    const { error } = await admin.from("kiru_special_period_family").upsert({
      period_id: period.id, student_id: studentId, choices: choices as unknown as Json, accepts_substitute: bool(body.acceptsSubstitute, true),
      extra_sessions: extra, comments: text(body.comments), late, answered_by: user.id, answered_at: new Date().toISOString(),
    }, { onConflict: "period_id,student_id" });
    if (error) return fail("No se pudo guardar la respuesta.", 500);
    // Un plan ya aprobado no cambia solo: vuelve a revisión (con historial).
    const { data: plan } = await admin.from("kiru_special_period_plans").select("id,status,revision").eq("period_id", period.id).eq("student_id", studentId).maybeSingle();
    if (plan?.status === "aprobado") {
      await admin.from("kiru_special_period_plans").update({ status: "borrador", revision: plan.revision + 1, updated_at: new Date().toISOString() }).eq("id", plan.id);
    }
    const { data: student } = await admin.from("profiles").select("full_name").eq("id", studentId).maybeSingle();
    const kept = choices.filter((c) => c.wants).length;
    const resumen = `${kept} de ${choices.length} clases${extra ? `, ${extra} extra` : ""}${bool(body.acceptsSubstitute, true) ? ", acepta sustituto" : ", sin sustituto"}${late ? " · fuera de plazo" : ""}${plan?.status === "aprobado" ? " · el plan aprobado vuelve a revisión" : ""}`;
    await logEvent(admin, { periodId: period.id, studentId, actorId: user.id, action: "familia_respondio", details: { resumen } });
    await notify(admin, await activeAdmins(admin), `${period.name}: ha respondido la familia de ${student?.full_name ?? "un alumno"}`,
      `${resumen}. Revísalo en la pestaña «Periodos especiales».`, () => `pe:${period.id}:fam:${studentId}:${today}`, studentId);
    return NextResponse.json({ ok: true, late });
  }

  // --- Mentor: sus clases y su disponibilidad para sustituir ------------------
  if (action === "mentor_responder") {
    if (role !== "mentor") return fail("Este formulario es para mentores.", 403);
    if (!canAnswer(period, today)) return fail("El formulario de este periodo está cerrado. Escribe a coordinación si necesitas cambiar algo.", 409);
    const closed = await noClassDays(admin, period.startsOn, period.endsOn);
    const slots = await activeSlots(admin, { mentor: user.id });
    const mine = [...new Set(slots.map((s) => s.studentId))].flatMap((sid) => classesFor(slots, sid, period.startsOn, period.endsOn, closed).map((c) => ({ ...c, sid })));
    const given = new Map(list(body.ownClasses).map((c) => [`${text(c.studentId, 40)}|${classKey(text(c.date, 10), text(c.start, 5))}`, c.can !== false]));
    const own = mine.map((c) => ({ student_id: c.sid, date: c.date, start: c.start, can: given.get(`${c.sid}|${classKey(c.date, c.start)}`) ?? true }));
    const sub = bool(body.wantsToSubstitute);
    const subSlots = sub ? cleanSubSlots(body.slots, period) : [];
    const zones = sub ? (Array.isArray(body.zones) ? body.zones : []).map((z) => text(z, 60)).filter((z) => period.zones.includes(z)) : [];
    const max = sub ? Math.max(0, Math.min(60, Math.trunc(Number(body.maxSessions) || 0))) : 0;
    const { error } = await admin.from("kiru_special_period_mentors").upsert({
      period_id: period.id, mentor_id: user.id, own_classes: own as unknown as Json, wants_to_substitute: sub, slots: subSlots as unknown as Json,
      zones, max_sessions: max, comments: text(body.comments), answered_by: user.id, answered_at: new Date().toISOString(),
    }, { onConflict: "period_id,mentor_id" });
    if (error) return fail("No se pudo guardar tu respuesta.", 500);
    const cannot = own.filter((o) => !o.can).length;
    await logEvent(admin, { periodId: period.id, actorId: user.id, action: "mentor_respondio",
      details: { resumen: `${own.length - cannot} de ${own.length} clases propias${sub ? ` · sustituye ${subSlots.length} días, hasta ${max} sesiones` : ""}` } });
    if (cannot) {
      await notify(admin, await activeAdmins(admin), `${period.name}: un mentor no puede ${cannot === 1 ? "una clase" : `${cannot} clases`}`,
        "Hay clases que buscar con sustituto. Revísalo en la pestaña «Periodos especiales».", () => `pe:${period.id}:mentor:${user.id}:${today}`);
    }
    return NextResponse.json({ ok: true });
  }

  if (role !== "admin" && role !== "coordinador") return fail("No tienes permisos para esta acción.", 403);

  // --- Administración: sustituto sin cuenta en el campus ----------------------
  if (action === "externo_guardar") {
    if (role !== "admin") return fail("Solo administración puede añadir sustitutos sin cuenta.", 403);
    const name = text(body.name, 120);
    const email = text(body.email, 254).toLowerCase();
    if (name.length < 2 || (email && !EMAIL_RE.test(email))) return fail("Revisa el nombre y el correo.");
    const row = {
      period_id: period.id, mentor_id: null, external_name: name, external_email: email, own_classes: [] as unknown as Json,
      wants_to_substitute: bool(body.wantsToSubstitute, true), slots: cleanSubSlots(body.slots, period) as unknown as Json,
      zones: (Array.isArray(body.zones) ? body.zones : []).map((z) => text(z, 60)).filter((z) => period.zones.includes(z)),
      max_sessions: Math.max(0, Math.min(60, Math.trunc(Number(body.maxSessions) || 0))), comments: text(body.comments),
      answered_by: user.id, answered_at: new Date().toISOString(),
    };
    const id = text(body.id, 40);
    const res = id && UUID_RE.test(id)
      ? await admin.from("kiru_special_period_mentors").update(row).eq("id", id).is("mentor_id", null).select("id").maybeSingle()
      : await admin.from("kiru_special_period_mentors").insert(row).select("id").maybeSingle();
    if (res.error || !res.data) return fail(res.error?.code === "23505" ? "Ya hay un sustituto con ese correo en este periodo." : "No se pudo guardar el sustituto.", 500);
    await logEvent(admin, { periodId: period.id, actorId: user.id, action: "sustituto_sin_cuenta", details: { resumen: `${name}: ${row.wants_to_substitute ? `${(row.slots as unknown as unknown[]).length} días` : "ya no sustituye"}` } });
    return NextResponse.json({ ok: true, id: res.data.id });
  }

  // --- Avisar a quien no ha respondido (campanita + correo) -------------------
  if (action === "avisar") {
    const to = text(body.to, 20);
    if (!["familias", "mentores"].includes(to)) return fail("¿A quién hay que avisar?");
    const allSlots = await activeSlots(admin, {});
    let scope = allSlots;
    if (role === "coordinador") {
      const { data } = await admin.from("kiru_coordinator_mentors").select("mentor_id").eq("coordinator_id", user.id);
      const mine = (data ?? []).map((m) => m.mentor_id);
      scope = allSlots.filter((s) => mine.includes(s.mentorId));
    }
    const closed = await noClassDays(admin, period.startsOn, period.endsOn);
    const deadline = shortDate(period.deadlineOn);
    let sent = 0;
    if (to === "familias") {
      const ids = [...new Set(scope.map((s) => s.studentId))];
      const [{ data: answered }, { data: stu }] = await Promise.all([
        admin.from("kiru_special_period_family").select("student_id").eq("period_id", period.id),
        ids.length ? admin.from("students").select("profile_id").in("profile_id", ids).eq("service_status", "activo") : Promise.resolve({ data: [] as { profile_id: string }[] }),
      ]);
      const pending = (stu ?? []).map((s) => s.profile_id)
        .filter((id) => !(answered ?? []).some((a) => a.student_id === id))
        .filter((id) => classesFor(scope, id, period.startsOn, period.endsOn, closed).length > 0);
      const guardians = await guardiansOf(admin, pending);
      for (const sid of pending) {
        sent += await notify(admin, guardians.get(sid) ?? [], `${period.name}: ¿qué clases queréis?`,
          `Del ${shortDate(period.startsOn)} al ${shortDate(period.endsOn)} hay clases que caen en ${period.name}. Indicadnos en el campus cuáles queréis mantener y si aceptáis un mentor sustituto si el vuestro no puede. Tenéis hasta el ${deadline}.`,
          (gid) => `pe:${period.id}:aviso-fam:${sid}:${gid}:${today}`, sid);
      }
    } else {
      const ids = [...new Set(scope.map((s) => s.mentorId))];
      const { data: answered } = await admin.from("kiru_special_period_mentors").select("mentor_id").eq("period_id", period.id);
      const pending = ids.filter((id) => !(answered ?? []).some((a) => a.mentor_id === id));
      sent = await notify(admin, pending, `${period.name}: ¿puedes dar tus clases?`,
        `Indícanos en el campus qué clases de tus alumnos puedes dar del ${shortDate(period.startsOn)} al ${shortDate(period.endsOn)} y si te gustaría hacer sustituciones. Tienes hasta el ${deadline}.`,
        (mid) => `pe:${period.id}:aviso-mentor:${mid}:${today}`);
    }
    await logEvent(admin, { periodId: period.id, actorId: user.id, action: "aviso_enviado", details: { resumen: `Aviso a ${to}: ${sent}` } });
    return NextResponse.json({ ok: true, sent });
  }

  // --- Plan de un alumno ------------------------------------------------------
  const studentId = text(body.studentId, 40);
  if (!UUID_RE.test(studentId)) return fail("Falta el alumno.");
  if (role === "coordinador") {
    const [{ data: group }, { data: sm }] = await Promise.all([
      admin.from("kiru_coordinator_mentors").select("mentor_id").eq("coordinator_id", user.id),
      admin.from("kiru_student_schedule_slots").select("mentor_id").eq("student_id", studentId).eq("is_active", true),
    ]);
    const mine = (group ?? []).map((g) => g.mentor_id);
    if (!(sm ?? []).some((s) => mine.includes(s.mentor_id))) return fail("Este alumno no es de tu grupo.", 403);
  }
  const { data: existing } = await admin.from("kiru_special_period_plans").select("*").eq("period_id", period.id).eq("student_id", studentId).maybeSingle();
  const { data: student } = await admin.from("profiles").select("full_name").eq("id", studentId).maybeSingle();

  if (action === "plan_guardar") {
    const closed = await noClassDays(admin, period.startsOn, period.endsOn);
    const classes = classesFor(await activeSlots(admin, { students: [studentId] }), studentId, period.startsOn, period.endsOn, closed);
    const given = new Map(list(body.assignments).map((a) => [classKey(text(a.date, 10), text(a.start, 5)), a]));
    const { data: subs } = await admin.from("kiru_special_period_mentors").select("id").eq("period_id", period.id);
    const subIds = new Set((subs ?? []).map((s) => s.id));
    const assignments: Assignment[] = classes.map((c) => {
      const g = given.get(classKey(c.date, c.start));
      const who = (["habitual", "sustituto", "sin_cobertura", "no_quiere"].includes(text(g?.who, 20)) ? text(g?.who, 20) : "habitual") as Assignment["who"];
      const subId = text(g?.substituteId, 40);
      return who === "sustituto" && subIds.has(subId)
        ? { date: c.date, start: c.start, end: c.end, who, substituteId: subId }
        : { date: c.date, start: c.start, end: c.end, who: who === "sustituto" ? "sin_cobertura" : who, substituteId: null };
    });
    // Clases extra que añade coordinación (fecha y hora concretas dentro del periodo).
    for (const x of list(body.extra, 20)) {
      const date = text(x.date, 10), start = text(x.start, 5), end = text(x.end, 5);
      if (!DATE_RE.test(date) || !TIME_RE.test(start) || !TIME_RE.test(end) || end <= start || date < period.startsOn || date > period.endsOn) continue;
      if (assignments.some((a) => a.date === date && a.start === start)) continue;
      const subId = text(x.substituteId, 40);
      assignments.push({ date, start, end, who: subIds.has(subId) ? "sustituto" : "habitual", substituteId: subIds.has(subId) ? subId : null });
    }
    assignments.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    const propose = bool(body.proponer);
    const wasApproved = existing?.status === "aprobado";
    const row = {
      period_id: period.id, student_id: studentId, assignments: assignments.map((a) => ({ date: a.date, start: a.start, end: a.end, who: a.who, substitute_id: a.substituteId })) as unknown as Json,
      notes: text(body.notes), status: (propose ? "propuesto" : "borrador") as "propuesto" | "borrador",
      revision: (existing?.revision ?? 0) + (wasApproved || !existing ? 1 : 0),
      proposed_by: propose ? user.id : existing?.proposed_by ?? null, proposed_at: propose ? new Date().toISOString() : existing?.proposed_at ?? null,
      approved_by: null, approved_at: null, updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("kiru_special_period_plans").upsert(row, { onConflict: "period_id,student_id" });
    if (error) return fail("No se pudo guardar el plan.", 500);
    const count = (w: Assignment["who"]) => assignments.filter((a) => a.who === w).length;
    await logEvent(admin, { periodId: period.id, studentId, actorId: user.id, action: propose ? "plan_propuesto" : "plan_guardado",
      details: { resumen: `${count("habitual")} con su mentor, ${count("sustituto")} con sustituto, ${count("sin_cobertura")} sin cobertura, ${count("no_quiere")} no quieren${wasApproved ? " · revisión de un plan aprobado" : ""}` } });
    if (propose && role === "coordinador") {
      await notify(admin, await activeAdmins(admin), `${period.name}: plan de ${student?.full_name ?? "un alumno"} para aprobar`,
        "Coordinación ha propuesto el plan. Apruébalo con su importe en «Periodos especiales».", () => `pe:${period.id}:plan:${studentId}:${row.revision}`, studentId);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "plan_aprobar") {
    if (role !== "admin") return fail("Solo administración aprueba el plan y el importe.", 403);
    if (!existing) return fail("Primero guarda el plan del alumno.", 409);
    const amounts: AmountLine[] = [];
    for (const a of list(body.amounts, 6)) {
      const periodStart = text(a.periodStart, 10), periodEnd = text(a.periodEnd, 10), amount = Number(a.amount);
      const suggested = a.suggested == null || a.suggested === "" ? null : Number(a.suggested);
      if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd) || periodEnd <= periodStart || !Number.isFinite(amount) || amount < 0 || amount > 10000) {
        return fail("Revisa los importes: cada mensualidad necesita fechas e importe válidos.");
      }
      amounts.push({ periodStart, periodEnd, amount: Math.round(amount * 100) / 100, suggested: suggested != null && Number.isFinite(suggested) ? suggested : null });
    }
    const { error } = await admin.from("kiru_special_period_plans").update({
      amounts: amounts.map((a) => ({ period_start: a.periodStart, period_end: a.periodEnd, amount: a.amount, suggested: a.suggested })) as unknown as Json,
      status: "aprobado", approved_by: user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    if (error) return fail("No se pudo aprobar el plan.", 500);
    const resumen = amounts.length
      ? amounts.map((a) => `${shortDate(a.periodStart)}–${shortDate(a.periodEnd)}: ${a.amount.toFixed(2).replace(".", ",")} €`).join(" · ")
      : "El importe no cambia";
    await logEvent(admin, { periodId: period.id, studentId, actorId: user.id, action: "plan_aprobado", details: { resumen: `Revisión ${existing.revision}. ${resumen}` } });
    const guardians = (await guardiansOf(admin, [studentId])).get(studentId) ?? [];
    await notify(admin, guardians, `${period.name}: ya tenéis el plan de ${firstNameOf(student?.full_name)}`,
      "Hemos revisado vuestras respuestas. En el campus veréis qué clases hay y con quién. Si la mensualidad cambia, os llegará con la renovación.",
      (gid) => `pe:${period.id}:aprobado:${studentId}:${existing.revision}:${gid}`, studentId);
    return NextResponse.json({ ok: true });
  }

  return fail("Acción no válida.");
}

const firstNameOf = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] || "vuestro hijo/a";

function cleanSubSlots(v: unknown, period: SpecialPeriod) {
  const seen = new Set<string>();
  return list(v, 120).flatMap((s) => {
    const date = text(s.date, 10);
    if (!DATE_RE.test(date) || date < period.startsOn || date > period.endsOn || seen.has(date)) return [];
    const manana = s.manana === true, tarde = s.tarde === true;
    if (!manana && !tarde) return [];
    seen.add(date);
    return [{ date, manana, tarde }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

