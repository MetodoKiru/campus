import type { ClassNotificationKind, NotificationRow, ScheduleNotificationKind, SupervisionNotificationKind } from "@/lib/database.types";
import type { serviceClient } from "@/lib/server/classes";

type Admin = NonNullable<ReturnType<typeof serviceClient>>;

/** Avisos que salen por la ruta /api/avisos/clases. */
export const CLASS_NOTIFICATION_KINDS: ClassNotificationKind[] = [
  "clase_solicitud", "clase_decision", "clase_mas_info", "recuperacion_propuesta", "recuperacion_confirmada",
  "recuperacion_sin_encaje", "recuperacion_nueva", "recuperacion_sin_avanzar", "recuperacion_recordatorio",
  "recuperacion_fin_periodo", "registro_aviso", "clase_incidencia",
];

// Supervisión metodológica: solicitudes de justificación y avisos a mentores.
// Las de «cerrada» van solo a la campanita (no llevan correo).
export const SUPERVISION_EMAIL_KINDS: SupervisionNotificationKind[] = [
  "justificacion_solicitada", "justificacion_respondida", "justificacion_repregunta", "justificacion_recordatorio",
  "justificacion_por_valorar", "aviso_metodologico", "aviso_seguimiento",
  // Errores marcados en un registro de sesión (desempeño, fase 2a).
  "registro_error", "registro_error_respuesta",
  // Evidencias bimestrales (desempeño, fase 2b). La entrega, la validación y las exenciones van solo a la campanita.
  "evidencia_aclaracion", "evidencia_recordatorio", "evidencia_revision",
  // Recordatorios a Coordinación: fichas de Cálculalo y evidencias sin revisar.
  "coordinacion_pendiente",
];

// Cambio de intensidad: elegir nuevo horario, confirmarlo y disponibilidad del mentor.
export const SCHEDULE_EMAIL_KINDS: ScheduleNotificationKind[] = [
  "horario_elegir", "horario_confirmar", "horario_confirmado", "horario_otro", "disponibilidad_actualizar",
  "disponibilidad_confirmar", "disponibilidad_urgente", "disponibilidad_falta",
  // Un mentor ha enviado su disponibilidad: resumen a su coordinador.
  "disponibilidad_enviada",
];

/** Lo que manda /api/avisos/clases al momento (todo lo que no es de evaluaciones ni de llamadas). */
export const CLASS_ROUTE_KINDS: NotificationRow["kind"][] = [...CLASS_NOTIFICATION_KINDS, ...SUPERVISION_EMAIL_KINDS, ...SCHEDULE_EMAIL_KINDS, "periodo_especial",
  // Renovación: solo llevan correo los adultos que no son el de la hoja (el de la hoja recibe el borrador).
  "renovacion"];

/** Todo lo que puede ir al resumen diario (incluye evaluaciones y llamadas, que tienen su propia ruta). */
const DIGEST_KINDS: NotificationRow["kind"][] = [...CLASS_ROUTE_KINDS, "evaluacion_trimestral", "llamada_familia"];

// Si la revisión ya avanzó, el correo sobra.
export const STILL_RELEVANT: Partial<Record<SupervisionNotificationKind, string[]>> = {
  justificacion_solicitada: ["pendiente_respuesta"],
  justificacion_repregunta: ["pendiente_respuesta"],
  justificacion_recordatorio: ["pendiente_respuesta"],
  justificacion_respondida: ["respondida", "pendiente_valoracion"],
  justificacion_por_valorar: ["respondida", "pendiente_valoracion"],
};

export const PANEL: Record<string, string> = { mentor: "/mentor", coordinador: "/coordinador", admin: "/admin", padre: "/padre" };

const PENDING_DAYS = 3;
const MAX_DIGEST_NOTICES = 400;

export type DigestSettings = { active: boolean; hour: number; hourByRole: Map<string, number>; roles: Set<string>; immediate: Set<string> };

/** Ajuste «avisos_resumen» de kiru_settings. Si falta o está mal, todo sale al momento (como antes). */
export async function loadDigestSettings(admin: Admin): Promise<DigestSettings> {
  const off: DigestSettings = { active: false, hour: 19, hourByRole: new Map(), roles: new Set(), immediate: new Set() };
  const { data } = await admin.from("kiru_settings").select("value").eq("key", "avisos_resumen").maybeSingle();
  const v = data?.value as { activo?: unknown; hora?: unknown; hora_por_rol?: unknown; roles?: unknown; inmediatos?: unknown } | null | undefined;
  if (!v || v.activo !== true) return off;
  const validHour = (x: unknown): x is number => typeof x === "number" && x >= 0 && x <= 23;
  const hour = validHour(v.hora) ? Math.floor(v.hora) : 19;
  // Hora distinta para un rol (p. ej. {"admin": 8}: el resumen de administración sale por la mañana).
  const byRole = new Map<string, number>();
  if (v.hora_por_rol && typeof v.hora_por_rol === "object") {
    for (const [role, h] of Object.entries(v.hora_por_rol as Record<string, unknown>)) if (validHour(h)) byRole.set(role, Math.floor(h));
  }
  const list = (x: unknown) => new Set(Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return { active: true, hour, hourByRole: byRole, roles: list(v.roles), immediate: list(v.inmediatos) };
}

/** ¿Este aviso espera al resumen del día en vez de salir al momento? */
export function waitsForDigest(cfg: DigestSettings, role: string | undefined, kind: string): boolean {
  return cfg.active && !!role && cfg.roles.has(role) && !cfg.immediate.has(kind);
}

/** Roles de los destinatarios, para decidir qué espera al resumen. */
export async function rolesOf(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await admin.from("profiles").select("id,role").in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((p) => [p.id, p.role]));
}

/** Quita de la lista los avisos que esperan al resumen (se quedan «pendiente» en la base). */
export async function withoutDigestNotices<T extends { recipient_id: string; kind?: string }>(
  admin: Admin, cfg: DigestSettings, notices: T[], kind?: string,
): Promise<T[]> {
  if (!cfg.active || !notices.length) return notices;
  const roles = await rolesOf(admin, notices.map((n) => n.recipient_id));
  return notices.filter((n) => !waitsForDigest(cfg, roles.get(n.recipient_id), n.kind ?? kind ?? ""));
}

/** Hora de Madrid ahora y el instante (UTC) de hoy a la hora del resumen. */
export function digestClock(cfg: DigestSettings, now = new Date(), role?: string): { due: boolean; since: Date } {
  const hour = role !== undefined && cfg.hourByRole.has(role) ? cfg.hourByRole.get(role)! : cfg.hour;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const h = Number(parts.hour), m = Number(parts.minute), s = Number(parts.second);
  const since = new Date(now.getTime() - ((h - hour) * 3600 + m * 60 + s) * 1000 - now.getMilliseconds());
  return { due: h >= hour, since };
}

export type DigestItem = { kind: string; title: string; body: string; url: string };
export type DigestEmail = { email: string; name: string; role: string; kind: "resumen"; title: string; body: string; url: string; items: DigestItem[] };

/**
 * Resumen diario: a partir de la hora del ajuste, junta en un solo correo por persona
 * los avisos que esperaban (mentores y coordinadores). Cada persona recibe como mucho
 * un resumen al día; lo que llegue después espera al de mañana. Cada aviso se marca
 * como enviado al meterlo en el resumen: nunca sale dos veces.
 */
export async function buildDigests(admin: Admin, cfg: DigestSettings, requestUrl: string, now = new Date()): Promise<DigestEmail[]> {
  if (!cfg.active || !cfg.roles.size) return [];
  const createdSince = new Date(now.getTime() - PENDING_DAYS * 86_400_000).toISOString();
  const { data: pending } = await admin.from("kiru_notifications")
    .select("id,recipient_id,student_id,kind,title,body,event_key,review_id,warning_id,created_at")
    .eq("email_status", "pendiente").in("kind", DIGEST_KINDS).gt("created_at", createdSince)
    .order("created_at").limit(MAX_DIGEST_NOTICES);
  if (!pending?.length) return [];

  const roles = await rolesOf(admin, pending.map((n) => n.recipient_id));
  const clocks = new Map([...new Set(roles.values())].map((r) => [r, digestClock(cfg, now, r)]));
  // Solo los de los roles a los que ya les toca su resumen hoy.
  let held = pending.filter((n) => waitsForDigest(cfg, roles.get(n.recipient_id), n.kind)
    && clocks.get(roles.get(n.recipient_id) ?? "")?.due);
  if (!held.length) return [];

  // Quien ya recibió hoy su resumen espera a mañana.
  const recipients = [...new Set(held.map((n) => n.recipient_id))];
  const { data: sentToday } = await admin.from("kiru_notifications")
    .select("recipient_id,kind,email_sent_at").in("recipient_id", recipients).eq("email_status", "enviado")
    .gte("email_sent_at", new Date(Math.min(...[...clocks.values()].map((c) => c.since.getTime()))).toISOString());
  const alreadyDone = new Set((sentToday ?? [])
    .filter((n) => waitsForDigest(cfg, roles.get(n.recipient_id), n.kind)
      && n.email_sent_at && new Date(n.email_sent_at) >= (clocks.get(roles.get(n.recipient_id) ?? "")?.since ?? now))
    .map((n) => n.recipient_id));
  held = held.filter((n) => !alreadyDone.has(n.recipient_id));
  if (!held.length) return [];

  const { data: claimed } = await admin.from("kiru_notifications")
    .update({ email_status: "enviado", email_sent_at: now.toISOString() })
    .in("id", held.map((n) => n.id)).eq("email_status", "pendiente").select("id");
  const claimedIds = new Set((claimed ?? []).map((r) => r.id));
  held = held.filter((n) => claimedIds.has(n.id));

  // ¿Sigue haciendo falta? (justificación ya respondida, evaluación hecha, llamada ya valorada…)
  const reviewIds = [...new Set(held.map((n) => n.review_id).filter((x): x is string => !!x))];
  const { data: reviews } = reviewIds.length ? await admin.from("kiru_skillcoin_reviews").select("id,status").in("id", reviewIds) : { data: [] };
  const reviewStatus = new Map((reviews ?? []).map((r) => [r.id, r.status]));
  const evalIds = [...new Set(held.filter((n) => n.kind === "evaluacion_trimestral").map((n) => n.event_key.split(":")[1] ?? "").filter(Boolean))];
  const { data: evals } = evalIds.length ? await admin.from("kiru_evaluations").select("id,status").in("id", evalIds) : { data: [] };
  const evalStatus = new Map((evals ?? []).map((e) => [e.id, e.status]));
  const callIds = [...new Set(held.filter((n) => n.kind === "llamada_familia" && /^llamada:(valorar|valorar_r):/.test(n.event_key))
    .map((n) => n.event_key.split(":")[2] ?? "").filter(Boolean))];
  const { data: calls } = callIds.length ? await admin.from("kiru_family_calls").select("id,status").in("id", callIds) : { data: [] };
  const callStatus = new Map((calls ?? []).map((c) => [c.id, c.status]));

  const stale = (n: (typeof held)[number]): boolean => {
    const relevant = STILL_RELEVANT[n.kind as SupervisionNotificationKind];
    if (relevant && n.review_id && !relevant.includes(reviewStatus.get(n.review_id) ?? "")) return true;
    if (n.kind === "evaluacion_trimestral") {
      const [, id = "", step = ""] = n.event_key.split(":");
      const st = evalStatus.get(id);
      if (!st || st === "cancelada" || ((step === "r1" || step === "r2" || step === "coord") && st === "completada")) return true;
    }
    if (n.kind === "llamada_familia" && /^llamada:(valorar|valorar_r):/.test(n.event_key)) {
      if (callStatus.get(n.event_key.split(":")[2] ?? "") !== "programada") return true;
    }
    return false;
  };

  const { data: people } = await admin.from("profiles").select("id,full_name,role,is_active").in("id", [...new Set(held.map((n) => n.recipient_id))]);
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const byPerson = new Map<string, typeof held>();
  const noEmail: string[] = [];
  for (const n of held) {
    if (stale(n)) { noEmail.push(n.id); continue; }
    const list = byPerson.get(n.recipient_id) ?? [];
    list.push(n);
    byPerson.set(n.recipient_id, list);
  }

  const digests: DigestEmail[] = [];
  for (const [id, list] of byPerson) {
    const p = person.get(id);
    const { data: authUser } = await admin.auth.admin.getUserById(id);
    const email = authUser.user?.email ?? "";
    if (!p?.is_active || !email || email.endsWith(".invalid") || !PANEL[p.role]) { noEmail.push(...list.map((n) => n.id)); continue; }
    const items = list.map((n) => ({ kind: n.kind, title: n.title, body: n.body ?? "", url: panelUrl(p.role, n, requestUrl) }));
    digests.push({
      email, name: p.full_name, role: p.role, kind: "resumen",
      title: items.length === 1 ? "Tu resumen de hoy: 1 aviso" : `Tu resumen de hoy: ${items.length} avisos`,
      // Para el Apps Script antiguo (sin «items»): una línea por aviso.
      body: items.map((i) => `• ${i.title}`).join("  "),
      url: new URL(PANEL[p.role], requestUrl).toString(),
      items,
    });
  }
  if (noEmail.length) await admin.from("kiru_notifications").update({ email_status: "sin_correo", email_sent_at: null }).in("id", noEmail);
  return digests;
}

/** Enlace del botón del correo: a la revisión o al aviso concreto cuando lo hay. */
export function panelUrl(role: string, n: { kind: string; review_id: string | null; warning_id: string | null }, base: string): string {
  const supervision = (SUPERVISION_EMAIL_KINDS as string[]).includes(n.kind);
  // Administración supervisa desde el panel de coordinación.
  const url = new URL(supervision && role === "admin" ? "/coordinador" : PANEL[role], base);
  if (n.kind === "periodo_especial") url.searchParams.set(role === "mentor" ? "seccion" : "tab", "vacaciones");
  if (n.kind.startsWith("disponibilidad_") && role === "mentor") url.searchParams.set("seccion", "disponibilidad");
  if ((n.kind === "disponibilidad_falta" || n.kind === "disponibilidad_enviada") && role === "admin") url.searchParams.set("seccion", "horarios");
  if (n.kind === "disponibilidad_enviada" && role === "coordinador") url.searchParams.set("tab", "disponibilidad");
  if (n.kind === "evaluacion_trimestral" && role === "coordinador") url.searchParams.set("tab", "evaluaciones");
  if (n.kind === "llamada_familia" && role === "coordinador") url.searchParams.set("tab", "llamadas");
  const evidence = n.kind.startsWith("evidencia_") || n.kind === "coordinacion_pendiente";
  if (supervision && evidence) {
    url.searchParams.set(role === "mentor" ? "seccion" : "tab", role === "mentor" ? "evidencias" : "seguimiento");
  } else if (supervision) {
    if (role === "mentor") {
      url.searchParams.set("seccion", "justificaciones");
      if (n.review_id) url.searchParams.set("revision", n.review_id);
      else if (n.warning_id) url.searchParams.set("aviso", n.warning_id);
    } else if (n.kind.startsWith("registro_error")) {
      url.searchParams.set("tab", "seguimiento");
    } else {
      url.searchParams.set("tab", "supervision");
      if (n.review_id) url.searchParams.set("revision", n.review_id);
    }
  }
  return url.toString();
}

// --- Tope de correos a las familias -------------------------------------------------------------

export type FamilyCap = { active: boolean; perDay: number; perWeek: number; exempt: Set<string> };

/** Ajuste «avisos_tope_familias». Sin él (o con "activo": false) no hay tope, como antes. */
export async function loadFamilyCap(admin: Admin): Promise<FamilyCap> {
  const { data } = await admin.from("kiru_settings").select("value").eq("key", "avisos_tope_familias").maybeSingle();
  const v = data?.value as { activo?: unknown; dia?: unknown; semana?: unknown; exentos?: unknown } | null | undefined;
  const num = (x: unknown, d: number) => (typeof x === "number" && x >= 1 ? Math.floor(x) : d);
  return {
    active: v?.activo === true,
    perDay: num(v?.dia, 3),
    perWeek: num(v?.semana, 5),
    exempt: new Set(Array.isArray(v?.exentos) ? v.exentos.filter((s): s is string => typeof s === "string") : []),
  };
}

/** Inicio del día de hoy en Madrid (instante UTC). */
function madridMidnight(now: Date): Date {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return new Date(now.getTime() - (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 - now.getMilliseconds());
}

/**
 * Deja fuera los correos a familias que pasarían del tope (por adulto: N al día y M en
 * los últimos 7 días). Los exentos (evaluación, cambios de clase…) salen siempre y sí
 * cuentan. Lo que se queda fuera sigue «pendiente»: sale cuando haya hueco (hasta 3 días)
 * y, si no, solo se ve en la campanita.
 */
export async function withinFamilyCap<T extends { recipient_id: string; kind?: string }>(
  admin: Admin, cap: FamilyCap, notices: T[], kind?: string, now = new Date(),
): Promise<T[]> {
  if (!cap.active || !notices.length) return notices;
  const roles = await rolesOf(admin, notices.map((n) => n.recipient_id));
  const parents = [...new Set(notices.map((n) => n.recipient_id).filter((id) => roles.get(id) === "padre"))];
  if (!parents.length) return notices;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const today = madridMidnight(now);
  const { data: sent } = await admin.from("kiru_notifications").select("recipient_id,email_sent_at")
    .in("recipient_id", parents).eq("email_status", "enviado").gte("email_sent_at", weekAgo.toISOString());
  const day = new Map<string, number>();
  const week = new Map<string, number>();
  for (const s of sent ?? []) {
    week.set(s.recipient_id, (week.get(s.recipient_id) ?? 0) + 1);
    if (s.email_sent_at && new Date(s.email_sent_at) >= today) day.set(s.recipient_id, (day.get(s.recipient_id) ?? 0) + 1);
  }
  return notices.filter((n) => {
    if (roles.get(n.recipient_id) !== "padre") return true;
    const k = n.kind ?? kind ?? "";
    const d = day.get(n.recipient_id) ?? 0;
    const w = week.get(n.recipient_id) ?? 0;
    if (!cap.exempt.has(k) && (d >= cap.perDay || w >= cap.perWeek)) return false;
    day.set(n.recipient_id, d + 1);
    week.set(n.recipient_id, w + 1);
    return true;
  });
}
