// Supervisión metodológica de SkillCoins: lado de coordinación y administración.
// Los textos comunes con el panel del mentor están en lib/supervision.ts.
// Las reglas que deciden permisos, estados y niveles de aviso viven en la base de
// datos (migración 20261109110000_supervision_metodologica.sql). Aquí solo se leen
// los datos y se calculan los indicadores «para revisar», que no cambian nada.

import { supabase } from "@/lib/supabase";
import type {
  MethodologyWarningRow, SkillcoinCompetencia, SkillcoinReviewFileRow, SkillcoinReviewMessageRow,
  SkillcoinReviewResolution, SkillcoinReviewRow, SkillcoinReviewStatus, SupervisionEventRow,
} from "@/lib/database.types";
import { COMPETENCIA_LABEL, EVIDENCE_BUCKET, RESOLUTION_LABEL as SHARED_RESOLUTION_LABEL, WARNING_LEVEL_LABEL, WARNING_STATUS_LABEL, WARNING_VALIDITY_MONTHS } from "@/lib/supervision";

export { COMPETENCIA_LABEL, WARNING_LEVEL_LABEL, WARNING_STATUS_LABEL };

export type Competencia = SkillcoinCompetencia;
export const COMPETENCIAS: Competencia[] = ["estudios", "compromiso", "organizacion", "bienestar"];
/** Cómo ve coordinación cada estado. */
export const STATUS_LABEL: Record<SkillcoinReviewStatus, string> = {
  pendiente_respuesta: "Pendiente de respuesta",
  respondida: "Respondida",
  pendiente_valoracion: "Pendiente de valoración",
  cerrada: "Cerrada",
};

const RESOLUTION_CODE: Record<SkillcoinReviewResolution, string> = { adecuada: "A · ", insuficiente: "B · ", necesita_formacion: "C · ", retirada: "" };
export const RESOLUTION_LABEL = Object.fromEntries(
  (Object.keys(SHARED_RESOLUTION_LABEL) as SkillcoinReviewResolution[]).map((k) => [k, RESOLUTION_CODE[k] + SHARED_RESOLUTION_LABEL[k]]),
) as Record<SkillcoinReviewResolution, string>;


export const MANUAL_REFERENCE: Record<Competencia | "general", string> = {
  estudios: "Manual Método Kiru v2 · Sistema SkillCoins · «Conozco mis estudios»",
  compromiso: "Manual Método Kiru v2 · Sistema SkillCoins · «Conozco mi compromiso»",
  organizacion: "Manual Método Kiru v2 · Sistema SkillCoins · «Conozco mi organización»",
  bienestar: "Manual Método Kiru v2 · Sistema SkillCoins · «Busco mi bienestar»",
  general: "Manual Método Kiru v2 · Sistema SkillCoins",
};

export type Scores = Record<Competencia, number>;
export type Observation = { q: string; a: string };
export type Evaluation = {
  studentId: string;
  studentName: string;
  mentorId: string;
  mentorName: string;
  logId: string;
  week: string;
  sessionDate: string | null;
  scores: Scores;
  current: (Scores & { at: string; reason: string }) | null;
  observations: Observation[];
};

export type FlagCode = "maximo_repetido" | "sin_variacion" | "posible_contradiccion" | "maximo_sin_evolucion";
export type Flag = { code: FlagCode; competencia: Competencia; text: string };

export const FLAG_LABEL: Record<FlagCode, string> = {
  maximo_repetido: "Máximo repetido",
  sin_variacion: "Sin variación",
  posible_contradiccion: "Posible contradicción",
  maximo_sin_evolucion: "Máximo sin evolución",
};

// Umbrales de los indicadores (ajustables).
const MAX_RUN = 3;
const SAME_RUN = 4;
const HIGH = 8;

// Preguntas del registro que hablan de dificultades y palabras que apuntan a cada competencia.
const DIFFICULTY_QUESTION = /costado|dificil|seguiremos trabajando|mejorar|observaciones adicionales|preocupa/;
const KEYWORDS: Record<Competencia, RegExp> = {
  organizacion: /organiz|agenda|planific|material|mochila|olvid|desorden|apunt|horario|rutina/,
  estudios: /concentr|comprens|entender|entiende|estudi|memoriz|concepto|deberes|ejercicio|lectura|leer|calcul/,
  compromiso: /compromiso|motiva|desgana|no quiere|puntual|responsab|esfuerzo|actitud|pereza|se niega/,
  bienestar: /ansie|nervio|frustr|triste|bajit|animo|cansad|estres|llor|agobi|miedo|insegur|bloque/,
};

export const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function toScores(value: unknown): Scores {
  const v = (value ?? {}) as Record<string, unknown>;
  return { estudios: num(v.estudios), compromiso: num(v.compromiso), organizacion: num(v.organizacion), bienestar: num(v.bienestar) };
}

export async function fetchEvaluations(since?: string): Promise<Evaluation[]> {
  const { data, error } = await supabase.rpc("kiru_supervision_evaluations", since ? { p_since: since } : {});
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((item) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const current = r.current && typeof r.current === "object" ? r.current as Record<string, unknown> : null;
    return {
      studentId: String(r.studentId ?? ""),
      studentName: String(r.studentName ?? "Alumno"),
      mentorId: String(r.mentorId ?? ""),
      mentorName: String(r.mentorName ?? "Mentor"),
      logId: String(r.logId ?? ""),
      week: String(r.week ?? ""),
      sessionDate: typeof r.sessionDate === "string" ? r.sessionDate : null,
      scores: toScores(r.scores),
      current: current ? { ...toScores(current), at: String(current.at ?? ""), reason: String(current.reason ?? "") } : null,
      observations: Array.isArray(r.observations)
        ? r.observations.map((o) => ({ q: String((o as Observation)?.q ?? ""), a: String((o as Observation)?.a ?? "") }))
        : [],
    };
  });
}

/**
 * Indicadores «para revisar» por alumno y semana. Nunca dicen que una nota esté
 * mal: solo señalan patrones que conviene mirar con las observaciones delante.
 * Devuelve un mapa logId → indicadores.
 */
export function computeFlags(evaluations: Evaluation[]): Map<string, Flag[]> {
  const result = new Map<string, Flag[]>();
  const byStudent = new Map<string, Evaluation[]>();
  for (const e of evaluations) byStudent.set(e.studentId, [...(byStudent.get(e.studentId) ?? []), e]);

  for (const weeks of byStudent.values()) {
    const sorted = [...weeks].sort((a, b) => a.week.localeCompare(b.week));
    sorted.forEach((e, index) => {
      const flags: Flag[] = [];
      for (const c of COMPETENCIAS) {
        // Máximo repetido: 10 varias semanas seguidas (contando esta).
        if (e.scores[c] === 10) {
          let run = 1;
          for (let i = index - 1; i >= 0 && sorted[i].scores[c] === 10; i--) run++;
          if (run >= MAX_RUN) flags.push({ code: "maximo_repetido", competencia: c, text: `10 en ${COMPETENCIA_LABEL[c].toLowerCase()} ${run} semanas seguidas.` });
        }
        // Máximo sin evolución: empieza en 9-10 y no se mueve de ahí.
        if (index >= MAX_RUN - 1 && sorted.slice(0, index + 1).every((w) => w.scores[c] >= 9)) {
          flags.push({ code: "maximo_sin_evolucion", competencia: c, text: `${COMPETENCIA_LABEL[c]} en 9-10 desde el primer registro, sin recorrido.` });
        }
        // Posible contradicción con lo que el mentor escribió esa semana.
        if (e.scores[c] >= HIGH) {
          const hit = e.observations.find((o) => DIFFICULTY_QUESTION.test(normalize(o.q)) && KEYWORDS[c].test(normalize(o.a)));
          if (hit) flags.push({ code: "posible_contradiccion", competencia: c, text: `${e.scores[c]}/10 y en «${hit.q.split("?")[0].replace(/^¿/, "")}» pone: «${hit.a.slice(0, 140)}».` });
        }
      }
      // Sin variación: las 4 notas idénticas varias semanas seguidas.
      let same = 1;
      for (let i = index - 1; i >= 0 && COMPETENCIAS.every((c) => sorted[i].scores[c] === e.scores[c]); i--) same++;
      if (same >= SAME_RUN) {
        for (const c of COMPETENCIAS) flags.push({ code: "sin_variacion", competencia: c, text: `Las 4 notas iguales ${same} semanas seguidas.` });
      }
      if (flags.length) result.set(e.logId, flags);
    });
  }
  return result;
}

export type ReviewBundle = {
  reviews: SkillcoinReviewRow[];
  messages: SkillcoinReviewMessageRow[];
  files: SkillcoinReviewFileRow[];
  warnings: MethodologyWarningRow[];
  events: SupervisionEventRow[];
};

export async function fetchSupervision(): Promise<ReviewBundle> {
  const [reviews, messages, files, warnings, events] = await Promise.all([
    supabase.from("kiru_skillcoin_reviews").select("*").order("created_at", { ascending: false }),
    supabase.from("kiru_skillcoin_review_messages").select("*").order("created_at"),
    supabase.from("kiru_skillcoin_review_files").select("*").order("created_at"),
    supabase.from("kiru_methodology_warnings").select("*").order("created_at", { ascending: false }),
    supabase.from("kiru_supervision_events").select("*").order("created_at"),
  ]);
  const failed = [reviews, messages, files, warnings, events].find((r) => r.error);
  if (failed?.error) throw failed.error;
  return {
    reviews: (reviews.data ?? []) as SkillcoinReviewRow[],
    messages: (messages.data ?? []) as SkillcoinReviewMessageRow[],
    files: (files.data ?? []) as SkillcoinReviewFileRow[],
    warnings: (warnings.data ?? []) as MethodologyWarningRow[],
    events: (events.data ?? []) as SupervisionEventRow[],
  };
}

/** Enlace temporal (5 minutos) para ver una evidencia: el almacén es privado. */
export async function evidenceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error ?? new Error("No se pudo abrir el archivo.");
  return data.signedUrl;
}

/** Avisos que cuentan para el nivel: los de los últimos 6 meses (los demás siguen en el historial). */
export function countsForLevel(warning: Pick<MethodologyWarningRow, "created_at">, now = new Date()): boolean {
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - WARNING_VALIDITY_MONTHS);
  return new Date(warning.created_at) > limit;
}

export function errorText(error: unknown, fallback = "No se pudo completar la acción."): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) {
    if (/failed to fetch|network/i.test(error.message)) return "No hay conexión. Comprueba internet e inténtalo de nuevo.";
    return error.message;
  }
  return fallback;
}

export const fmtDay = (value: string | null | undefined) =>
  value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
