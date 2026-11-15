// Llamadas semanales con las familias: tipos, textos y cálculos compartidos (sin base de datos).
//
// Reglas (Sofía, 15/11/2026): 20 minutos cada semana; Zoom salvo que la familia prefiera
// teléfono; mejor con los dos padres; misma hora cada semana. Ciclo de 4 semanas desde la
// semana de la primera clase: semanas 1 y 4 con mentor, 2 y 3 solo familia + coordinador.

export const CALL_MINUTES = 20;
/** Las horas posibles van de media en media hora (así queda margen entre llamadas). */
export const STEP_MINUTES = 30;
/** Margen alrededor de una clase del mentor (desplazamiento a casa del alumno). */
export const CLASS_BUFFER_MINUTES = 30;
/** Días que se recuerda al coordinador que valore al mentor si no lo ha hecho. */
export const RATE_REMINDER_DAYS = 3;
/** Días que se crean por adelantado en el calendario de llamadas. */
export const CALENDAR_AHEAD_DAYS = 21;

export type CallMode = "apagado" | "prueba" | "activo";
export type CallMedium = "zoom" | "telefono";
export type PlanStatus = "sin_datos" | "sin_hueco" | "confirmada" | "pausada";
export type CallStatus = "programada" | "hecha" | "no_hecha" | "cancelada";
export type MentorPresence = "estuvo" | "ausente" | "causa_ajena";

export const MODE_LABEL: Record<CallMode, string> = {
  apagado: "Apagado (no se crea ni se envía nada)",
  prueba: "Prueba (solo los alumnos elegidos)",
  activo: "Activo (todos los alumnos)",
};
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  sin_datos: "Faltan horarios",
  sin_hueco: "Sin hora común",
  confirmada: "Hora fija",
  pausada: "En pausa",
};
export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  programada: "Programada",
  hecha: "Hecha",
  no_hecha: "No se hizo",
  cancelada: "Cancelada",
};
export const PRESENCE_LABEL: Record<MentorPresence, string> = {
  estuvo: "Sí, estuvo",
  ausente: "No estuvo (sin avisar)",
  causa_ajena: "No estuvo por causa ajena",
};

export const DAY_NAMES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;
export const DAY_SHORT = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** Las cinco preguntas de la valoración del mentor (indicador D1). */
export const MENTOR_CALL_CRITERIA = [
  { key: "preparacion", label: "Preparación", hint: "Llega a la llamada sabiendo cómo va el alumno y con ejemplos concretos." },
  { key: "participacion", label: "Participación", hint: "Interviene, aporta y no deja toda la conversación al coordinador." },
  { key: "comunicacion", label: "Comunicación con la familia", hint: "Se explica con claridad y escucha a los padres." },
  { key: "seguimiento", label: "Seguimiento del alumno", hint: "Propone próximos pasos y recuerda lo que se acordó." },
  { key: "actitud", label: "Actitud", hint: "Puntual, profesional, en un sitio tranquilo y con buena disposición." },
] as const;
export type MentorCallKey = (typeof MENTOR_CALL_CRITERIA)[number]["key"];

/** Franja de disponibilidad semanal. d: 1 = lunes … 7 = domingo; minutos desde las 00:00. */
export type Slot = { d: number; from: number; to: number };
/** Rato ocupado que se repite cada semana. */
export type Busy = { d: number; start: number; end: number };

export const isWeekday = (d: unknown): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7;

export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2})[:.h](\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}
export function fromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
/** «martes 20:00». */
export const slotLabel = (d: number, min: number) => `${DAY_NAMES[d] ?? ""} ${fromMinutes(min)}`;

// --- Lectura de las respuestas de Jotform -------------------------------------------------------

const DAY_WORDS: [number, RegExp][] = [
  [1, /^lunes$/i], [2, /^martes$/i], [3, /^mi[ée]rcoles$/i], [4, /^jueves$/i],
  [5, /^viernes$/i], [6, /^s[áa]bado$/i], [7, /^domingo$/i],
];
const dayOf = (word: string) => DAY_WORDS.find(([, re]) => re.test(word.trim()))?.[0] ?? null;

/** Etiquetas de las preguntas de los dos formularios. Si Sofía cambia un texto, se sigue leyendo
 * mientras empiece igual (lo importante: los días se llaman Lunes…Domingo y las franjas son «H:MM-H:MM»). */
const LABELS: { key: string; re: RegExp }[] = [
  { key: "alumno", re: /Nombre del alumno[^:]*/ },
  { key: "tutor", re: /Nombre de la madre[^:]*/ },
  { key: "nombre", re: /Nombre y apellidos/ },
  { key: "email", re: /Correo electr[oó]nico/ },
  { key: "soy", re: /Soy/ },
  { key: "medio", re: /¿C[oó]mo prefer[ií]s la llamada\?/ },
  { key: "telefono", re: /Tel[eé]fono para la llamada[^:]*/ },
  { key: "dos_padres", re: /¿Qu[eé] d[ií]as pod[eé]is estar los dos padres[^:]*/ },
  { key: "compromisos", re: /¿Ten(?:[eé]is|es) alg[uú]n compromiso[^:]*/ },
  { key: "codigo", re: /C[oó]digo de llamada[^:]*/ },
  { key: "d1", re: /Lunes/ }, { key: "d2", re: /Martes/ }, { key: "d3", re: /Mi[eé]rcoles/ },
  { key: "d4", re: /Jueves/ }, { key: "d5", re: /Viernes/ }, { key: "d6", re: /S[aá]bado/ }, { key: "d7", re: /Domingo/ },
];

/** Parte el texto «pretty» de Jotform («Pregunta:respuesta, Pregunta:respuesta…») por las preguntas conocidas. */
export function splitPretty(pretty: string): Record<string, string> {
  const marks: { key: string; start: number; valueStart: number }[] = [];
  for (const { key, re } of LABELS) {
    const g = new RegExp(`(?:^|, |\\n)(${re.source}):`, "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(pretty))) {
      const start = m.index + (m[0].length - m[1].length - 1);
      if (!marks.some((x) => x.start === start)) marks.push({ key, start, valueStart: m.index + m[0].length });
    }
  }
  marks.sort((a, b) => a.start - b.start);
  // Si dos etiquetas empiezan en el mismo sitio, gana la más larga (p. ej. «Lunes» dentro de otra pregunta no pasa: van tras «, »).
  const out: Record<string, string> = {};
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : pretty.length;
    const value = pretty.slice(m.valueStart, end).replace(/,\s*$/, "").trim();
    if (!(m.key in out)) out[m.key] = value;
  });
  return out;
}

const RANGE_RE = /(\d{1,2}[:.]\d{2})\s*[-–a]\s*(\d{1,2}[:.]\d{2})/g;
export function rangesIn(text: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const m of text.matchAll(RANGE_RE)) {
    const from = toMinutes(m[1].replace(".", ":"));
    const to = toMinutes(m[2].replace(".", ":"));
    if (from !== null && to !== null && to > from) out.push({ from, to });
  }
  return out;
}

export type ParsedAvailability = {
  studentName: string; name: string; email: string; role: "" | "mentor" | "coordinador" | "admin";
  slots: Slot[]; bothParentsDays: number[]; medium: CallMedium; phone: string; commitments: string; code: string | null;
};

const UUID_IN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/** Valores sueltos de rawRequest (los formularios con nombres de campo propios: q7_lunes[]…). */
function rawValue(raw: Record<string, unknown>, re: RegExp): unknown {
  const key = Object.keys(raw).find((k) => re.test(k));
  return key ? raw[key] : undefined;
}
function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(", ");
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).filter((x) => typeof x === "string").join(" ");
  return "";
}

export function parseAvailability(pretty: string, raw: Record<string, unknown>, codeField = "codigoDe"): ParsedAvailability {
  const p = splitPretty(pretty);
  const slots: Slot[] = [];
  for (let d = 1; d <= 7; d++) {
    let text = p[`d${d}`] ?? "";
    if (!text) text = asText(rawValue(raw, new RegExp(`^q\\d+_${["", "lunes", "martes", "mi[eé]rcoles", "jueves", "viernes", "s[aá]bado", "domingo"][d]}`, "i")));
    for (const r of rangesIn(text)) slots.push({ d, ...r });
  }
  const bothText = p.dos_padres ?? asText(rawValue(raw, /^q\d+_queDias/i));
  const bothParentsDays = /solo puede uno/i.test(bothText) ? [] : [...new Set(
    bothText.split(/[,\n]/).map((w) => dayOf(w)).filter((d): d is number => d !== null))].sort();
  const soy = (p.soy ?? "").toLowerCase();
  const role = /coordin/.test(soy) ? "coordinador" : /admin/.test(soy) ? "admin" : /mentor/.test(soy) ? "mentor" : "";
  const codeRaw = asText(rawValue(raw, new RegExp(`^q\\d+_${codeField}$`, "i"))) || asText(rawValue(raw, /^q\d+_codigo/i))
    || asText(rawValue(raw, /kiru_?llamada/i)) || (p.codigo ?? "");
  const code = UUID_IN.exec(codeRaw)?.[0]?.toLowerCase() ?? null;
  const email = (p.email || asText(rawValue(raw, /^q\d+_correo/i))).trim().toLowerCase().slice(0, 200);
  const phoneText = p.telefono || asText(rawValue(raw, /^q\d+_telefono/i));
  return {
    studentName: (p.alumno ?? asText(rawValue(raw, /^q\d+_nombreDel$/i))).trim().slice(0, 200),
    name: (p.nombre || p.tutor || "").trim().slice(0, 200),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    role,
    slots,
    bothParentsDays,
    medium: /tel[eé]fono/i.test(p.medio ?? asText(rawValue(raw, /^q\d+_comoPreferis/i))) ? "telefono" : "zoom",
    phone: phoneText.replace(/[^\d+ ]/g, "").trim().slice(0, 40),
    commitments: (p.compromisos ?? "").trim().replace(/^ninguno\.?$/i, "").slice(0, 1500),
    code,
  };
}

// --- Fechas -------------------------------------------------------------------------------------

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** 1 = lunes … 7 = domingo. */
export function isoWeekday(date: string): number {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  return wd === 0 ? 7 : wd;
}
export const mondayOf = (date: string) => addDaysIso(date, 1 - isoWeekday(date));

/** Semana del ciclo (1-4) de la semana que empieza en weekStart, contando desde la semana 1 (anchorMonday). */
export function weekNumber(anchorMonday: string, weekStart: string): number {
  const diff = Math.round((Date.parse(`${weekStart}T12:00:00Z`) - Date.parse(`${anchorMonday}T12:00:00Z`)) / (7 * 86_400_000));
  return ((diff % 4) + 4) % 4 + 1;
}

export function madridTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Hora local de Madrid → instante UTC (ISO). */
export function madridToUtcIso(date: string, minutes: number): string {
  const guess = Date.parse(`${date}T${fromMinutes(minutes)}:00Z`);
  const offsetAt = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((x) => x.type === type)?.value);
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return local - t;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first)).toISOString();
}

/** «martes 17/11, 20:00» en hora de Madrid. */
export function callWhen(iso: string): string {
  const f = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = f.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")}/${get("month")}, ${get("hour")}:${get("minute")}`;
}

// --- «Match» ------------------------------------------------------------------------------------

export type MatchInput = {
  family: Slot[];
  bothParentsDays: number[];
  coordinator: Slot[];
  /** Vacío si el alumno no tiene mentor (entonces todas las semanas son con el coordinador). */
  mentor: Slot[] | null;
  coordinatorBusy: Busy[];
  mentorBusy: Busy[];
};
export type MatchOption = {
  /** Hora de las semanas 2 y 3 (y de todas si no hay mentorWeekday). */
  weekday: number; start: number;
  /** Hora distinta para las semanas 1 y 4, solo si no hay una común a los tres. */
  mentorWeekday: number | null; mentorStart: number | null;
  bothParents: boolean; score: number; reasons: string[];
};

const fits = (slots: Slot[], d: number, start: number) => slots.some((s) => s.d === d && s.from <= start && start + CALL_MINUTES <= s.to);
const clashes = (busy: Busy[], d: number, start: number) => busy.some((b) => b.d === d && start < b.end && b.start < start + CALL_MINUTES);
const touches = (busy: Busy[], d: number, start: number) => busy.some((b) => b.d === d && (b.end === start || b.start === start + STEP_MINUTES || Math.abs(b.start - start) === STEP_MINUTES));

/** Todas las horas (cada media hora) en las que caben 20 minutos dentro de las franjas de la familia. */
function familyStarts(family: Slot[]): { d: number; start: number }[] {
  const out: { d: number; start: number }[] = [];
  const seen = new Set<string>();
  for (const s of family) {
    const first = Math.ceil(s.from / STEP_MINUTES) * STEP_MINUTES;
    for (let t = first; t + CALL_MINUTES <= s.to; t += STEP_MINUTES) {
      const k = `${s.d}-${t}`;
      if (!seen.has(k)) { seen.add(k); out.push({ d: s.d, start: t }); }
    }
  }
  return out.sort((a, b) => a.d - b.d || a.start - b.start);
}

/**
 * Busca la mejor hora fija. Preferencias, por este orden:
 * 1. Una sola hora en la que estén libres los tres (el mentor solo se une las semanas 1 y 4).
 * 2. Que puedan los dos padres ese día.
 * 3. Entre semana mejor que fin de semana; pegada a otra llamada del coordinador (agrupa su tarde).
 * Si no hay una hora común a los tres, propone una hora con el coordinador y otra para las semanas con mentor.
 * Devuelve como mucho `limit` opciones, la mejor primero.
 */
export function findMatches(input: MatchInput, limit = 3): MatchOption[] {
  const both = new Set(input.bothParentsDays);
  const base = familyStarts(input.family).filter(({ d, start }) => fits(input.coordinator, d, start) && !clashes(input.coordinatorBusy, d, start));
  const withMentor = input.mentor
    ? base.filter(({ d, start }) => fits(input.mentor!, d, start) && !clashes(input.mentorBusy, d, start))
    : [];
  const bonus = (d: number, start: number) =>
    (both.has(d) ? 20 : 0) + (d <= 5 ? 5 : 0) + (touches(input.coordinatorBusy, d, start) ? 3 : 0);
  const reasonsFor = (d: number, start: number) => {
    const r: string[] = [];
    if (both.has(d)) r.push("Pueden los dos padres");
    if (touches(input.coordinatorBusy, d, start)) r.push("Pegada a otra llamada del coordinador");
    return r;
  };

  const options: MatchOption[] = [];
  if (!input.mentor) {
    for (const { d, start } of base) {
      options.push({ weekday: d, start, mentorWeekday: null, mentorStart: null, bothParents: both.has(d),
        score: 100 + bonus(d, start), reasons: ["Familia y coordinador libres", ...reasonsFor(d, start)] });
    }
  } else {
    for (const { d, start } of withMentor) {
      options.push({ weekday: d, start, mentorWeekday: null, mentorStart: null, bothParents: both.has(d),
        score: 100 + bonus(d, start), reasons: ["Los tres libres: misma hora las 4 semanas", ...reasonsFor(d, start)] });
    }
    if (!options.length) {
      // Dos horas: la mejor con el coordinador y la mejor con el mentor.
      const rank = (list: { d: number; start: number }[]) => [...list].sort((a, b) => bonus(b.d, b.start) - bonus(a.d, a.start) || a.d - b.d || a.start - b.start);
      const m = rank(withMentor)[0];
      if (m) {
        for (const c of rank(base).slice(0, limit)) {
          if (c.d === m.d && c.start === m.start) continue;
          options.push({ weekday: c.d, start: c.start, mentorWeekday: m.d, mentorStart: m.start, bothParents: both.has(c.d) && both.has(m.d),
            score: 50 + (bonus(c.d, c.start) + bonus(m.d, m.start)) / 2,
            reasons: ["Dos horas distintas: el mentor no está libre a la hora de las semanas 2 y 3", ...reasonsFor(c.d, c.start)] });
        }
      }
    }
  }
  return options
    .sort((a, b) => b.score - a.score || a.weekday - b.weekday || a.start - b.start)
    .slice(0, limit);
}

/** Por qué no hay hora común (para el panel del coordinador). */
export function whyNoMatch(input: MatchInput): string {
  const base = familyStarts(input.family).filter(({ d, start }) => fits(input.coordinator, d, start));
  if (!base.length) return "La familia y el coordinador no coinciden en ninguna franja.";
  if (!base.some(({ d, start }) => !clashes(input.coordinatorBusy, d, start))) return "El coordinador ya tiene otras llamadas en las horas que coinciden con la familia.";
  if (input.mentor) return "El mentor no coincide con la familia y el coordinador en ninguna franja (o tiene clase a esas horas).";
  return "No hay ninguna hora libre común.";
}

// --- Vistas para los paneles ------------------------------------------------------------------

export type CallView = {
  id: string; studentId: string; studentName: string; weekStart: string; weekNo: number; withMentor: boolean;
  mentorName: string; coordinatorName: string; scheduledStart: string; medium: CallMedium; moved: boolean; status: CallStatus;
  mentorPresence: MentorPresence | null; ratings: Record<MentorCallKey, number | null>; comment: string; parentsTopics: string;
  needsRating: boolean; zoomUrl: string; phone: string;
};

export type PlanView = {
  studentId: string; studentName: string; mentorId: string | null; mentorName: string; coordinatorId: string | null; coordinatorName: string;
  status: PlanStatus; weekday: number | null; start: string | null; mentorWeekday: number | null; mentorStart: string | null;
  medium: CallMedium; bothParents: boolean; missing: string[]; options: MatchOption[]; anchorMonday: string | null; startOverride: string | null;
  confirmedVia: "auto" | "manual" | null; familyFormUrl: string; familyAnswered: string | null; commitments: string; phone: string;
  whatsappText: string; inScope: boolean;
};

export type StaffCallsPayload = {
  role: "admin" | "coordinador";
  me: { zoomUrl: string; rulesAck: boolean; teamFormUrl: string; answeredAt: string | null };
  plans: PlanView[];
  calls: CallView[];
  unlinked: { id: string; kind: "familia" | "equipo"; name: string; email: string; studentName: string; receivedAt: string }[];
  settings: { mode: CallMode; testStudents: string[] } | null;
  allStudents: { id: string; name: string }[];
  staff: { id: string; name: string; role: string; answeredAt: string | null; zoom: boolean }[];
};

export type FamilyCallsPayload = {
  kids: {
    studentId: string; studentName: string; formUrl: string; answeredAt: string | null; status: PlanStatus;
    fixed: string | null; mentorFixed: string | null; medium: CallMedium; zoomUrl: string; coordinatorName: string; mentorName: string;
    calls: { id: string; scheduledStart: string; withMentor: boolean; status: CallStatus; moved: boolean; weekNo: number;
      moveOptions: string[] }[];
  }[];
};

export type MentorCallsPayload = {
  formUrl: string; answeredAt: string | null;
  calls: { id: string; studentName: string; scheduledStart: string; medium: CallMedium; zoomUrl: string; coordinatorName: string; weekNo: number; status: CallStatus }[];
};

/** Texto para que el coordinador avise en el grupo de WhatsApp de la familia (con el mentor). */
export function whatsappMessage(p: {
  kid: string; when: string; mentorWhen: string | null; mentorName: string; medium: CallMedium; zoomUrl: string; firstCall: string | null;
}): string {
  const lines = [
    `¡Hola! Ya tenemos hora para la llamada semanal de seguimiento de ${p.kid} (20 minutos): ${p.when}.`,
    p.mentorWhen
      ? `Las semanas en las que se une ${p.mentorName || "el mentor"} (la 1.ª y la 4.ª de cada ciclo) será ${p.mentorWhen}.`
      : `La 1.ª y la 4.ª semana de cada ciclo se une también ${p.mentorName || "el mentor"}.`,
    p.firstCall ? `La primera será el ${p.firstCall}.` : "",
    p.medium === "telefono" ? "Os llamaremos por teléfono." : p.zoomUrl ? `Será por Zoom, siempre con este enlace: ${p.zoomUrl}` : "Será por Zoom; os pasamos el enlace.",
    "Si os viene bien que estéis los dos, mejor. Si alguna semana no podéis, podéis moverla desde el campus. ¡Gracias!",
  ];
  return lines.filter(Boolean).join("\n");
}
export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
