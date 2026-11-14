// Desempeño de mentores: tipos y textos compartidos (fase 1, solo administración).

export type PerfMode = "oculto" | "aprendizaje" | "piloto" | "oficial";
export type ValueStatus = "calculado" | "pendiente" | "no_aplica";
export type DimensionKey = "A" | "B" | "C" | "D" | "E";

export type IndicatorValue = {
  status: ValueStatus;
  value: number | null;
  ok: number;
  total: number;
  detail: Record<string, unknown>;
};

export type Score = {
  dimensions: Record<DimensionKey, { value: number | null; coverage: number; weight: number }>;
  performance: number | null;
  coverage: number;
  publishable: boolean;
  reasons: string[];
  final: number | null;
  deductions: number | null;
  cap: number | null;
  category: string | null;
  continuity_review: boolean;
};

export type MentorResult = {
  mentor_id: string;
  mentor_name: string;
  values: Record<string, IndicatorValue>;
  score: Score;
};

export type Indicator = {
  code: string;
  dimension: DimensionKey;
  position: number;
  name: string;
  description: string;
  kind: "auto" | "semi" | "humano" | "familias";
  source: string;
  missing_data: string;
  phase: number;
};

export type Rules = {
  dimensions: Record<DimensionKey, number>;
  indicators: Record<string, number>;
  coverage: { dimension_min: number; total_min: number; min_dimensions: number; required: string[]; min_sessions: number };
  incidents: { leve: number; leve_max: number; grave: number; grave_cap: number; muy_grave: number; muy_grave_cap: number };
};

export type RuleVersion = { version: number; status: string; rules: Rules; note: string; approved_at: string | null };

export type Overview = {
  settings: { mode: PerfMode; data_from: string; official_from: string; updated_at: string };
  rules: RuleVersion[];
  indicators: Indicator[];
  period: { id: string; label: string; starts_on: string; ends_on: string; status: string } | null;
  mentors: (MentorResult & { computed_at: string })[];
  events: { id: number; action: string; detail: Record<string, unknown>; created_at: string }[];
};

export const DIMENSION_LABEL: Record<DimensionKey, string> = {
  A: "Calidad metodológica",
  B: "Cumplimiento y continuidad de sesiones",
  C: "Compromiso, proactividad y profesionalidad",
  D: "Comunicación con familias y equipo",
  E: "Gestión administrativa",
};

export const MODE_LABEL: Record<PerfMode, string> = {
  oculto: "Oculto (solo lo ve administración)",
  aprendizaje: "Aprendizaje (los mentores lo ven, sin consecuencias)",
  piloto: "Piloto interno (sin consecuencias económicas ni automáticas)",
  oficial: "Oficial",
};

export const KIND_LABEL: Record<Indicator["kind"], string> = {
  auto: "Automático",
  semi: "Lo confirma Coordinación",
  humano: "Valoración de Coordinación",
  familias: "Opinión de las familias",
};

export const CATEGORY_LABEL: Record<string, string> = {
  excelente: "Excelente",
  bueno: "Bueno",
  mejorable: "Mejorable",
  deficiente: "Deficiente",
  muy_deficiente: "Muy deficiente",
};

/** Lo que significa cada clave del desglose, en palabras. */
export const DETAIL_LABEL: Record<string, string> = {
  dadas: "dadas",
  perdidas_por_el_mentor: "perdidas por el mentor sin recuperar",
  recuperacion_en_curso: "con recuperación en curso (aún no cuentan)",
  sin_registro_todavia: "sin registro (solo cuentan en E1)",
  dadas_por_sustituto: "dadas por un sustituto (no cuentan)",
  causa_ajena: "canceladas por causas ajenas (no cuentan)",
  familia_rechazo_recuperar: "la familia no quiso recuperar (no cuentan)",
  no_justificados: "no justificados",
  pendientes_de_revisar: "pendientes de revisar (no restan)",
  justificados: "justificados",
  con_menos_de_48h: "con menos de 48 h",
  sin_registro: "clases sin registro pasadas 24 h",
  tarde: "registros fuera de plazo",
  registros_sin_clase: "registros sin clase en el campus",
  formularios: "formularios trimestrales",
  justificaciones: "justificaciones con fecha límite",
  // Fase 2a
  fichas: "fichas de Cálculalo",
  semanas_con_4_dias: "semanas con 4 días o más",
  con_error_marcado: "registros con error marcado",
  sin_contestar_a_tiempo: "sin contestar a tiempo",
  en_plazo_de_respuesta: "en plazo de respuesta (aún no cuentan)",
  // Fase 2b
  validadas: "validadas",
  sin_entregar_tras_recordatorios: "sin entregar tras 3 recordatorios",
  pendientes_o_en_revision: "pendientes o en revisión (no cuentan)",
  exentas: "exentas",
  misiones_validadas: "misiones validadas",
  misiones_sin_entregar: "misiones sin entregar",
  semanas_con_clase: "semanas con clase",
  semanas_con_skillcoins: "con SkillCoins",
  justificaciones_cerradas: "justificaciones cerradas",
  niveles_de_avisos: "niveles de aviso metodológico",
  aun_dentro_del_periodo: "aún recuperables dentro del periodo (no cuentan)",
};

export function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function isoDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function statusText(v: IndicatorValue | undefined, phase: number): string {
  if (!v) return phase > 1 ? `Llega en la fase ${phase}` : "Pendiente";
  if (v.status === "calculado") return `${fmtNumber(v.value)} / 100`;
  if (v.status === "no_aplica") return "No aplica";
  return "Pendiente de datos";
}

export function errorText(error: unknown, fallback = "No se pudo completar la acción."): string {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}
