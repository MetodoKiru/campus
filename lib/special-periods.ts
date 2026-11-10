// Periodos especiales (Navidad, Semana Santa…): tipos y cálculos puros que usan
// el servidor y los paneles. Las fechas van siempre como "AAAA-MM-DD" (hora de Madrid).

export type SpecialPeriodKind = "navidad" | "semana_santa" | "verano" | "otro";

export type SpecialPeriod = {
  id: string;
  name: string;
  kind: SpecialPeriodKind;
  country: string;
  region: string;
  startsOn: string;
  endsOn: string;
  formOpensOn: string;
  deadlineOn: string;
  exceptionsUntil: string;
  closesOn: string;
  zones: string[];
  notes: string;
  isActive: boolean;
};

export type ClassDate = { date: string; start: string; end: string; mentorId: string };
export type FamilyChoice = { date: string; start: string; end: string; wants: boolean };
export type OwnClass = { studentId: string; date: string; start: string; can: boolean };
export type SubSlot = { date: string; manana: boolean; tarde: boolean };
export type Who = "habitual" | "sustituto" | "sin_cobertura" | "no_quiere";
export type Assignment = { date: string; start: string; end: string; who: Who; substituteId: string | null };
export type AmountLine = { periodStart: string; periodEnd: string; amount: number; suggested: number | null };
export type PlanStatus = "borrador" | "propuesto" | "aprobado";

export const KIND_LABEL: Record<SpecialPeriodKind, string> = {
  navidad: "Navidad", semana_santa: "Semana Santa", verano: "Verano", otro: "Otro",
};
export const WHO_LABEL: Record<Who, string> = {
  habitual: "Con su mentor", sustituto: "Con sustituto", sin_cobertura: "Sin cobertura (se recupera)", no_quiere: "No quieren clase",
};
export const DEFAULT_ZONES = [
  "Pozuelo", "Somosaguas", "Aravaca", "Valdemarín", "Las Rozas", "Majadahonda", "Boadilla",
  "Madrid centro", "Chamberí/Moncloa", "Nuevos Ministerios/Chamartín", "Retiro",
];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^\d{2}:\d{2}$/;

const toUtc = (iso: string) => new Date(`${iso}T12:00:00Z`);
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** 1 = lunes … 7 = domingo. */
export function isoWeekday(iso: string): number {
  const d = toUtc(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Suma meses a una fecha; si el día no existe en ese mes, el último día (regla de las mensualidades). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export const partOfDay = (start: string): "manana" | "tarde" => (start < "14:00" ? "manana" : "tarde");

export function dateLabel(iso: string, withYear = false): string {
  return toUtc(iso).toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
  });
}

export const shortDate = (iso: string) => toUtc(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** Clases del horario semanal entre dos fechas (incluidas), sin los días sin clase de Kiru. Los festivos cuentan. */
export function classDates(
  slots: { weekday: number; start: string; end: string; mentorId: string }[],
  from: string, to: string, noClassDays: Set<string>,
): ClassDate[] {
  const out: ClassDate[] = [];
  for (const date of eachDay(from, to)) {
    if (noClassDays.has(date)) continue;
    const dow = isoWeekday(date);
    for (const s of slots) if (s.weekday === dow) out.push({ date, start: s.start, end: s.end, mentorId: s.mentorId });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

/**
 * Mensualidades (de fecha a fecha) que se cruzan con el periodo especial, a partir
 * de una fecha de fin de mensualidad conocida. Devuelve [inicio, fin) de cada una.
 */
export function billingPeriodsOverlapping(knownEnd: string, periodStart: string, periodEnd: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (let k = -3; k <= 6; k++) {
    const start = addMonths(knownEnd, k - 1);
    const end = addMonths(knownEnd, k);
    if (start <= periodEnd && end > periodStart) out.push({ start, end });
  }
  return out;
}

/**
 * Sugerencia proporcional (pendiente de que administración confirme las reglas):
 * cuota × sesiones que se mantienen ÷ sesiones previstas de esa mensualidad.
 * Solo cuentan como quitadas las que la familia no quiere (acuerdo previo); las
 * que Kiru no puede cubrir se conservan para recuperar y no restan.
 */
export function proportionalSuggestion(price: number, monthDates: string[], removed: Set<string>): { expected: number; kept: number; amount: number } {
  const expected = monthDates.length;
  const kept = monthDates.filter((k) => !removed.has(k)).length;
  const amount = expected ? Math.round((price * kept / expected) * 100) / 100 : price;
  return { expected, kept, amount };
}

export const classKey = (date: string, start: string) => `${date}|${start}`;

/** Domingo de Pascua (calendario gregoriano, algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Propuesta del mismo periodo para otro año, copiando la forma del que ya existe
 * (misma duración, mismos plazos antes del inicio). Semana Santa se recalcula a
 * partir de la Pascua de ese año. Administración la revisa antes de guardarla.
 */
export function proposeForYear(base: SpecialPeriod, year: number): Omit<SpecialPeriod, "id"> {
  const baseYear = Number(base.startsOn.slice(0, 4));
  let startsOn: string;
  if (base.kind === "semana_santa") {
    const offset = Math.round((toUtc(base.startsOn).getTime() - toUtc(easterSunday(baseYear)).getTime()) / 86_400_000);
    startsOn = addDays(easterSunday(year), offset);
  } else {
    startsOn = addMonths(base.startsOn, (year - baseYear) * 12);
  }
  const shift = (iso: string) => addDays(startsOn, Math.round((toUtc(iso).getTime() - toUtc(base.startsOn).getTime()) / 86_400_000));
  const kindName = KIND_LABEL[base.kind];
  return {
    name: base.kind === "otro" ? `${base.name.replace(/\s*\d{4}$/, "")} ${year}` : `${kindName} ${year}`,
    kind: base.kind, country: base.country, region: base.region,
    startsOn, endsOn: shift(base.endsOn), formOpensOn: shift(base.formOpensOn), deadlineOn: shift(base.deadlineOn),
    exceptionsUntil: shift(base.exceptionsUntil), closesOn: shift(base.closesOn), zones: base.zones, notes: "", isActive: true,
  };
}

/** Normaliza para comparar zonas y municipios sin tildes ni mayúsculas. */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function zoneMatches(zones: string[], municipality: string): boolean | null {
  if (!municipality.trim()) return null;
  const m = norm(municipality);
  return zones.some((z) => norm(z).split("/").some((part) => part && (m.includes(part.trim()) || part.trim().includes(m))));
}

/** Estado del plazo del periodo en una fecha. */
export function periodPhase(p: Pick<SpecialPeriod, "formOpensOn" | "deadlineOn" | "exceptionsUntil" | "closesOn" | "endsOn">, today: string):
  "antes" | "abierto" | "excepciones" | "planificacion" | "en_curso" | "terminado" {
  if (today < p.formOpensOn) return "antes";
  if (today <= p.deadlineOn) return "abierto";
  if (today <= p.exceptionsUntil) return "excepciones";
  if (today <= p.closesOn) return "planificacion";
  if (today <= p.endsOn) return "en_curso";
  return "terminado";
}

export const PHASE_LABEL = {
  antes: "Aún no se ha abierto el formulario", abierto: "Formulario abierto", excepciones: "Plazo cerrado: solo excepciones",
  planificacion: "Planificación", en_curso: "En curso", terminado: "Terminado",
} as const;

export function madridToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

// --- Datos que devuelve /api/periodos-especiales -----------------------------

export type FamilyPeriodView = {
  period: SpecialPeriod;
  phase: keyof typeof PHASE_LABEL;
  students: {
    id: string;
    name: string;
    classes: ClassDate[];
    answer: { choices: FamilyChoice[]; acceptsSubstitute: boolean; extraSessions: number; comments: string; late: boolean; answeredAt: string } | null;
    /** Solo cuando administración lo ha aprobado. */
    plan: {
      assignments: (Assignment & { substitute: { firstName: string; specialties: string[]; inKiruSince: string | null } | null })[];
      amounts: AmountLine[];
      approvedAt: string | null;
    } | null;
  }[];
};

export type MentorPeriodView = {
  period: SpecialPeriod;
  phase: keyof typeof PHASE_LABEL;
  classes: (ClassDate & { studentId: string; studentName: string })[];
  answer: { ownClasses: OwnClass[]; wantsToSubstitute: boolean; slots: SubSlot[]; zones: string[]; maxSessions: number; comments: string; answeredAt: string } | null;
};

export type StaffMentorAnswer = {
  id: string;
  mentorId: string | null;
  name: string;
  email: string;
  external: boolean;
  ownClasses: OwnClass[];
  wantsToSubstitute: boolean;
  slots: SubSlot[];
  zones: string[];
  maxSessions: number;
  comments: string;
  answeredAt: string;
  specialties: string[];
};

export type StaffStudent = {
  id: string;
  name: string;
  municipality: string;
  mentorId: string | null;
  mentorName: string;
  classes: ClassDate[];
  answer: FamilyPeriodView["students"][number]["answer"];
  plan: { assignments: Assignment[]; amounts: AmountLine[]; status: PlanStatus; notes: string; revision: number; approvedAt: string | null; approvedByName: string | null } | null;
  /** Mensualidades afectadas con la sugerencia proporcional (si se conoce la cuota). */
  billing: { start: string; end: string; price: number | null; expected: number; kept: number; suggested: number | null }[];
  renewalPrice: number | null;
};

export type StaffPeriodView = {
  role: "admin" | "coordinador";
  periods: SpecialPeriod[];
  selected: {
    period: SpecialPeriod;
    phase: keyof typeof PHASE_LABEL;
    students: StaffStudent[];
    mentors: StaffMentorAnswer[];
    pendingMentors: { id: string; name: string }[];
    log: { at: string; actor: string; action: string; student: string; details: string }[];
  } | null;
};
