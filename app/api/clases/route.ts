import { NextResponse } from "next/server";
import type { ClassSessionRow, Json } from "@/lib/database.types";
import {
  NOTICE_HOURS, parseOption, parseOptions,
  type FamilyClassesData, type StaffClass, type StaffClassesData, type StaffRequest,
} from "@/lib/classes";
import { cleanOptions, DAY_RE, optionalIndex, rpcError, text, userClient } from "@/lib/server/classes";
import { requireStaff, UUID_RE } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const OPEN_RECOVERY = ["pendiente", "propuesta", "sin_encaje", "programada"] as const;
const OPEN_REQUEST = ["pendiente", "mas_info", "contrapropuesta"] as const;
const PAST_DAYS = 28;
const AHEAD_DAYS = 35;

const dayOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Clases con fecha y solicitudes para el panel de quien llama.
 * Se lee con la sesión de la persona (RLS): el mentor ve sus clases, el
 * coordinador las de su grupo, administración todas y la familia las de sus
 * hijos sin notas internas (vistas kiru_family_*).
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["mentor", "coordinador", "admin", "padre"]);
  if (!auth.ok) return auth.response;
  const db = userClient(request);
  if (!db) return NextResponse.json({ error: "Servicio no configurado." }, { status: 503 });
  const from = dayOffset(-PAST_DAYS);
  const until = dayOffset(AHEAD_DAYS);

  if (auth.role === "padre") {
    const [links, sessions, requests, periods] = await Promise.all([
      db.from("student_guardians").select("student_id").eq("guardian_id", auth.user.id),
      db.from("kiru_family_classes").select("*").gte("scheduled_start", from).lte("scheduled_start", until).order("scheduled_start").limit(500),
      db.from("kiru_family_class_requests").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("kiru_period_session_summary").select("*").order("coverage_start", { ascending: false }).limit(24),
    ]);
    // Recuperaciones abiertas de clases más antiguas que la ventana.
    const older = await db.from("kiru_family_classes").select("*").lt("scheduled_start", from).in("recovery", [...OPEN_RECOVERY]).limit(100);
    if (links.error || sessions.error || requests.error || periods.error || older.error) {
      return NextResponse.json({ error: "No se pudieron cargar las clases." }, { status: 500 });
    }
    const ids = (links.data ?? []).map((l) => l.student_id);
    const names = ids.length ? await db.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
    const data: FamilyClassesData = {
      role: "padre",
      noticeHours: NOTICE_HOURS,
      students: (names.data ?? []).map((p) => ({ id: p.id, name: p.full_name })),
      sessions: [...(older.data ?? []), ...(sessions.data ?? [])].map((s) => ({
        id: s.id, studentId: s.student_id, kind: s.kind, recoversSessionId: s.recovers_session_id,
        originalStart: s.original_start, scheduledStart: s.scheduled_start, scheduledEnd: s.scheduled_end,
        delivery: s.delivery as FamilyClassesData["sessions"][number]["delivery"], consumption: s.consumption,
        recovery: s.recovery, cancelCause: s.cancel_cause, mentorName: s.mentor_name,
        deliveredByName: s.delivered_by_name, rescheduled: s.rescheduled,
      })),
      requests: (requests.data ?? []).map((r) => ({
        id: r.id, sessionId: r.session_id, studentId: r.student_id,
        kind: r.kind as FamilyClassesData["requests"][number]["kind"], requesterRole: r.requester_role,
        requestedByMe: r.requested_by_me, reason: r.reason, preferences: r.preferences,
        options: parseOptions(r.options), late: r.late, status: r.status, chosenOption: parseOption(r.chosen_option),
        decisionNote: r.decision_note, reply: r.reply, createdAt: r.created_at,
      })),
      periods: (periods.data ?? []).map((p) => ({
        paymentId: p.payment_id, studentId: p.student_id, coverageStart: p.coverage_start, coverageEnd: p.coverage_end,
        sessionsIncluded: p.sessions_included, consumed: Number(p.sessions_consumed), delivered: Number(p.sessions_delivered),
        cancelledConsumed: Number(p.sessions_cancelled_consumed), recoveriesOpen: Number(p.recoveries_open), scheduled: Number(p.sessions_scheduled),
      })),
    };
    return NextResponse.json(data);
  }

  const cols = "id,student_id,mentor_id,kind,recovers_session_id,original_start,scheduled_start,scheduled_end,delivery,consumption,recovery,cancel_cause,cancel_note,recovery_status_since,recovery_exception_note,delivered_by";
  const [windowed, openRecoveries, requests, unlinked, noClass] = await Promise.all([
    db.from("kiru_class_sessions").select(cols).gte("scheduled_start", from).lte("scheduled_start", until).neq("delivery", "anulada").order("scheduled_start").limit(2000),
    db.from("kiru_class_sessions").select(cols).in("recovery", [...OPEN_RECOVERY]).lt("scheduled_start", from).limit(500),
    db.from("kiru_class_requests").select("*").or(`status.in.(${OPEN_REQUEST.join(",")}),created_at.gte.${from}`).order("created_at", { ascending: false }).limit(1000),
    db.from("kiru_unlinked_session_logs").select("*").gte("session_date", from).order("session_date", { ascending: false }).limit(300),
    db.from("kiru_no_class_days").select("day,reason").eq("is_active", true).gte("day", from).order("day"),
  ]);
  if (windowed.error || openRecoveries.error || requests.error || unlinked.error || noClass.error) {
    return NextResponse.json({ error: "No se pudieron cargar las clases." }, { status: 500 });
  }
  const rows = [...(openRecoveries.data ?? []), ...(windowed.data ?? [])] as Pick<ClassSessionRow, keyof ClassSessionRow>[];
  // Las recuperaciones (y sus originales) siempre van juntas.
  const known = new Set(rows.map((r) => r.id));
  const missing = [...new Set(rows.map((r) => r.recovers_session_id).filter((id): id is string => !!id && !known.has(id)))];
  if (missing.length) {
    const extra = await db.from("kiru_class_sessions").select(cols).in("id", missing);
    rows.push(...((extra.data ?? []) as typeof rows));
  }
  const peopleIds = new Set<string>();
  for (const r of rows) [r.student_id, r.mentor_id, r.delivered_by].forEach((id) => id && peopleIds.add(id));
  for (const r of requests.data ?? []) [r.mentor_id, r.student_id, r.requested_by].forEach((id) => id && peopleIds.add(id));
  const people = peopleIds.size ? await db.from("profiles").select("id,full_name").in("id", [...peopleIds]) : { data: [] };
  const name = new Map((people.data ?? []).map((p) => [p.id, p.full_name]));

  const sessions: StaffClass[] = rows.map((s) => ({
    id: s.id, studentId: s.student_id, studentName: name.get(s.student_id) ?? "Alumno", mentorId: s.mentor_id,
    mentorName: name.get(s.mentor_id) ?? "", kind: s.kind, recoversSessionId: s.recovers_session_id,
    originalStart: s.original_start, scheduledStart: s.scheduled_start, scheduledEnd: s.scheduled_end,
    delivery: s.delivery, consumption: s.consumption, recovery: s.recovery, cancelCause: s.cancel_cause,
    cancelNote: s.cancel_note, recoveryStatusSince: s.recovery_status_since, recoveryExceptionNote: s.recovery_exception_note,
    deliveredById: s.delivered_by, deliveredByName: s.delivered_by ? name.get(s.delivered_by) ?? "" : "",
  })).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));

  const data: StaffClassesData = {
    role: auth.role as StaffClassesData["role"],
    viewerId: auth.user.id,
    sessions,
    requests: (requests.data ?? []).map((r): StaffRequest => ({
      id: r.id, sessionId: r.session_id, sessionLogId: r.session_log_id, mentorId: r.mentor_id, studentId: r.student_id,
      kind: r.kind, requesterRole: r.requester_role, requestedByName: name.get(r.requested_by) ?? "",
      reason: r.reason, reasonCode: r.reason_code, details: r.details, preferences: r.preferences,
      options: parseOptions(r.options), hoursNotice: r.hours_notice === null ? null : Number(r.hours_notice), late: r.late,
      status: r.status, chosenOption: parseOption(r.chosen_option), decisionNote: r.decision_note, reply: r.reply,
      incident: r.incident, incidentNote: r.incident_note, createdAt: r.created_at, decidedAt: r.decided_at,
    })),
    unlinkedLogs: (unlinked.data ?? []).map((l) => ({
      id: l.id, sessionDate: l.session_date, studentId: l.student_id, studentName: l.student_name,
      mentorId: l.mentor_id, mentorName: l.mentor_name, probableDuplicate: l.probable_duplicate,
    })),
    noClassDays: (noClass.data ?? []).map((d) => ({ day: d.day, reason: d.reason })),
  };
  return NextResponse.json(data);
}

type Role = "mentor" | "coordinador" | "admin" | "padre";
const STAFF: Role[] = ["coordinador", "admin"];

/** Qué roles pueden pedir cada acción (la base de datos vuelve a comprobar el permiso exacto). */
const ACTIONS: Record<string, Role[]> = {
  solicitar: ["mentor", "padre"],
  responder: ["mentor", "padre"],
  decidir: STAFF,
  proponer_recuperacion: ["mentor", ...STAFF],
  elegir_recuperacion: ["padre", ...STAFF],
  gestionar_recuperacion: STAFF,
  registrar_cancelacion: STAFF,
  avisar_registro: ["mentor"],
  responder_aviso: ["mentor"],
  gestionar_aviso: STAFF,
  revisar_incidencia: STAFF,
  dia_sin_clase: ["admin"],
};

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

/**
 * Acciones sobre clases. Cada una llama a su función de base de datos con
 * p_actor = quien tiene la sesión: allí se comprueba el permiso sobre esa clase
 * concreta (mentor asignado, coordinador de ese mentor, familia de ese alumno).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("Solicitud no válida."); }
  const action = text(body.action, 40);
  const roles = ACTIONS[action];
  if (!roles) return bad("Acción no válida.");
  const auth = await requireStaff(request, roles);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const id = (key: string) => (typeof body[key] === "string" && UUID_RE.test(body[key] as string) ? body[key] as string : null);
  const note = text(body.note);

  let call;
  switch (action) {
    case "solicitar": {
      const session = id("sessionId");
      const kind = text(body.kind, 20);
      const options = cleanOptions(body.options);
      if (!session || !["cambio", "cancelacion"].includes(kind) || options === null) return bad("Faltan datos de la solicitud.");
      call = admin.rpc("kiru_clases_solicitar", {
        p_actor: user.id, p_session: session, p_kind: kind, p_reason: text(body.reason), p_options: options,
        p_details: text(body.details), p_preferences: text(body.preferences, 1000),
      });
      break;
    }
    case "responder": {
      const req = id("requestId");
      const what = text(body.response, 20);
      const option = optionalIndex(body.option);
      if (!req || !["aceptar", "informar", "retirar"].includes(what)) return bad("Faltan datos.");
      call = admin.rpc("kiru_clases_responder", { p_actor: user.id, p_request: req, p_action: what, p_reply: note, p_option: option ?? undefined });
      break;
    }
    case "decidir": {
      const req = id("requestId");
      const decision = text(body.decision, 30);
      const options = cleanOptions(body.options);
      const option = optionalIndex(body.option);
      if (!req || !["aprobar", "rechazar", "contrapropuesta", "mas_info", "aprobar_cancelacion", "aprobar_excepcion"].includes(decision) || options === null) {
        return bad("Faltan datos de la decisión.");
      }
      call = admin.rpc("kiru_clases_decidir", { p_actor: user.id, p_request: req, p_decision: decision, p_note: note, p_option: option ?? undefined, p_options: options });
      break;
    }
    case "proponer_recuperacion": {
      const session = id("sessionId");
      const options = cleanOptions(body.options);
      if (!session || !options || !(options as Json[]).length) return bad("Propón al menos una fecha.");
      call = admin.rpc("kiru_recuperaciones_proponer", { p_actor: user.id, p_session: session, p_options: options, p_note: note });
      break;
    }
    case "elegir_recuperacion": {
      const req = id("requestId");
      const option = optionalIndex(body.option);
      if (!req || option === undefined) return bad("Elige una fecha o indica que ninguna encaja.");
      call = admin.rpc("kiru_recuperaciones_elegir", { p_actor: user.id, p_request: req, p_option: option, p_note: note });
      break;
    }
    case "gestionar_recuperacion": {
      const session = id("sessionId");
      const what = text(body.manage, 30);
      if (!session || !["recordar_mentor", "recordar_familia", "excepcion_plazo"].includes(what)) return bad("Faltan datos.");
      call = admin.rpc("kiru_recuperaciones_gestionar", { p_actor: user.id, p_session: session, p_action: what, p_note: note });
      break;
    }
    case "registrar_cancelacion": {
      const session = id("sessionId");
      const cause = text(body.cause, 30);
      if (!session || !["familia_menos_48h", "familia_con_aviso", "no_presentado", "mentor", "excepcion"].includes(cause)) return bad("Faltan datos.");
      call = admin.rpc("kiru_clases_registrar_cancelacion", { p_actor: user.id, p_session: session, p_cause: cause, p_note: note });
      break;
    }
    case "avisar_registro": {
      const log = id("logId");
      const code = text(body.reasonCode, 30);
      if (!log || !code) return bad("Elige un motivo.");
      call = admin.rpc("kiru_registros_avisar", { p_actor: user.id, p_log: log, p_reason_code: code, p_reason: note });
      break;
    }
    case "responder_aviso": {
      const req = id("requestId");
      if (!req) return bad("Faltan datos.");
      call = admin.rpc("kiru_registros_responder_aviso", { p_actor: user.id, p_request: req, p_reply: note });
      break;
    }
    case "gestionar_aviso": {
      const req = id("requestId");
      const what = text(body.manage, 20);
      if (!req || !["gestionado", "mas_info", "incidencia"].includes(what)) return bad("Faltan datos.");
      call = admin.rpc("kiru_registros_gestionar_aviso", { p_actor: user.id, p_request: req, p_action: what, p_note: note, p_session: id("sessionId") ?? undefined });
      break;
    }
    case "revisar_incidencia": {
      const req = id("requestId");
      const verdict = text(body.verdict, 20);
      if (!req || !["justificada", "no_justificada", "mas_info"].includes(verdict)) return bad("Faltan datos.");
      call = admin.rpc("kiru_incidencias_revisar", { p_actor: user.id, p_request: req, p_verdict: verdict, p_note: note });
      break;
    }
    case "dia_sin_clase": {
      const day = text(body.day, 10);
      if (!DAY_RE.test(day)) return bad("Indica el día.");
      call = admin.rpc("kiru_dias_sin_clase_guardar", { p_actor: user.id, p_day: day, p_reason: text(body.reason, 200), p_active: body.active !== false });
      break;
    }
    default:
      return bad("Acción no válida.");
  }
  const { data, error } = await call;
  if (error) return rpcError(error);
  return NextResponse.json({ ok: true, result: data });
}
