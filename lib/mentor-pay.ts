// «Registro de sesiones» y «Mis pagos» del mentor: lectura y presentación.
// Los importes salen tal cual de la pestaña «Pagos» (copiada en
// kiru_mentor_payouts); aquí no se calcula ninguna nómina, solo se suman las
// cifras de administración para el resumen.

import { supabase } from "@/lib/supabase";
import type { Json, MentorPayoutRow, MentorSessionRow, SkillcoinReviewRow } from "@/lib/database.types";
import { findAnswer, normalizeName, parseAnswers, type SessionAnswer } from "@/lib/session-logs";

export type PayoutState = "pagado" | "en_proceso" | "pendiente";

export const PAYOUT_STATE_LABEL: Record<PayoutState, string> = {
  pagado: "Pagado",
  en_proceso: "En proceso",
  pendiente: "Pendiente",
};

/** Hora límite del pago el día en que termina el periodo. */
export const PAYMENT_HOUR = "20:00";

/** Momento en que se debe pagar un periodo: el día «Hasta» a las 20:00 (Madrid). */
export function paymentDeadline(periodEnd: string): Date {
  // 20:00 en Madrid es 19:00 UTC en invierno y 18:00 UTC en verano.
  const probe = new Date(`${periodEnd}T12:00:00Z`);
  const madridHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(probe));
  const offset = madridHour - 12;
  return new Date(`${periodEnd}T${String(20 - offset).padStart(2, "0")}:00:00Z`);
}

/**
 * Cómo ve el mentor una fila de «Pagos». Pagado = pagado; Pendiente = se va
 * acumulando hasta el día de pago; pasado ese momento sin marcar como pagado =
 * en proceso. Las filas «Sin confirmar», o pendientes sin ninguna sesión
 * todavía, no se enseñan.
 */
export function payoutState(row: MentorPayoutRow, now = Date.now()): PayoutState | null {
  const status = normalizeName(row.sheet_status);
  if (status === "pagado") return "pagado";
  if (status !== "pendiente") return null;
  if (row.sessions_registered <= 0 && row.amount_cents <= 0) return null;
  return paymentDeadline(row.period_end).getTime() <= now ? "en_proceso" : "pendiente";
}

export function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export function formatDay(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!value) return "";
  return new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("es-ES", opts);
}

/** «19 oct – 18 nov 2026»: el último día del periodo es el anterior a «Hasta». */
export function periodLabel(row: Pick<MentorPayoutRow, "period_start" | "period_end">): string {
  const last = new Date(`${row.period_end}T12:00:00`);
  last.setDate(last.getDate() - 1);
  const lastIso = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  const sameYear = row.period_start.slice(0, 4) === lastIso.slice(0, 4);
  const from = formatDay(row.period_start, sameYear ? { day: "numeric", month: "short" } : undefined);
  return row.period_start === lastIso ? formatDay(row.period_start) : `${from} – ${formatDay(lastIso)}`;
}

// Sesiones ------------------------------------------------------------------------------

export type SessionKind = "impartida" | "recuperacion" | "sustitucion" | "fuera_horario";

export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  impartida: "Impartida",
  recuperacion: "Recuperación",
  sustitucion: "Sustitución",
  fuera_horario: "Fuera del horario habitual",
};

export type SkillcoinScores = { estudios: number | null; compromiso: number | null; organizacion: number | null; bienestar: number | null };

export type MentorSession = MentorSessionRow & {
  kind: SessionKind;
  time: string;
  topic: string;
  objective: string;
  answersList: SessionAnswer[];
  sc: SkillcoinScores | null;
  isScWeek: boolean;
  /** Otros registros del mismo alumno y día (no cuentan dos veces). */
  repeats: MentorSessionRow[];
};

const SC_KEYS: (keyof SkillcoinScores)[] = ["estudios", "compromiso", "organizacion", "bienestar"];

/** Las cuatro notas de SkillCoins del registro (mismas preguntas que lee la base de datos). */
export function skillcoinScores(answers: SessionAnswer[]): SkillcoinScores | null {
  const scores: SkillcoinScores = { estudios: null, compromiso: null, organizacion: null, bienestar: null };
  for (const { q, a } of answers) {
    const question = normalizeName(q);
    const match = a.replace(",", ".").trim().match(/^(10|[0-9])\s*(?:\/\s*10|sc)?$/i);
    if (!match || !question.includes("skillcoin")) continue;
    const key = SC_KEYS.find((k) => question.includes(k === "organizacion" ? "organizacion" : k));
    if (key) scores[key] = Number(match[1]);
  }
  return SC_KEYS.some((k) => scores[k] !== null) ? scores : null;
}

function madridTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

function sessionKind(row: MentorSessionRow, me: string): SessionKind {
  if (row.class_kind === "recuperacion") return "recuperacion";
  if (row.class_id && row.class_mentor_id && row.class_mentor_id !== me) return "sustitucion";
  if (row.class_id) return "impartida";
  // Antes de que el campus tuviera clases con fecha no hay con qué comparar.
  if (!row.first_class_date || row.session_date < row.first_class_date) return "impartida";
  return "fuera_horario";
}

/** Une los registros repetidos con el que cuenta y añade lo que se enseña. */
export function buildSessions(rows: MentorSessionRow[], me: string): MentorSession[] {
  const repeats = new Map<string, MentorSessionRow[]>();
  for (const row of rows) if (row.duplicate_of) repeats.set(row.duplicate_of, [...(repeats.get(row.duplicate_of) ?? []), row]);
  return rows.filter((row) => !row.duplicate_of).map((row) => {
    const answersList = parseAnswers(row.answers as Json);
    return {
      ...row,
      kind: sessionKind(row, me),
      time: row.class_start ? madridTime(row.class_start) : row.slot_time ? row.slot_time.slice(0, 5) : "",
      topic: findAnswer(answersList, "¿Qué se ha trabajado hoy"),
      objective: findAnswer(answersList, "¿Cuál era el objetivo"),
      answersList,
      sc: skillcoinScores(answersList),
      isScWeek: normalizeName(findAnswer(answersList, "¿Es la sesión SC")).startsWith("si"),
      repeats: repeats.get(row.log_id) ?? [],
    };
  });
}

// Carga ------------------------------------------------------------------------------------

export type MentorPayData = {
  me: string;
  sessions: MentorSession[];
  payouts: MentorPayoutRow[];
  /** Revisiones de SkillCoins por registro de sesión. */
  reviews: Pick<SkillcoinReviewRow, "id" | "session_log_id" | "competencia" | "score_snapshot" | "status" | "resolution" | "due_date">[];
};

export async function loadMentorPayData(): Promise<MentorPayData> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
  const [sessions, payouts, reviews] = await Promise.all([
    supabase.rpc("kiru_mentor_sessions", {}),
    supabase.from("kiru_mentor_payouts").select("*").eq("mentor_id", user.id).is("removed_at", null).order("period_start", { ascending: false }),
    supabase.from("kiru_skillcoin_reviews").select("id,session_log_id,competencia,score_snapshot,status,resolution,due_date").eq("mentor_id", user.id),
  ]);
  if (sessions.error) throw new Error("No se pudieron cargar tus sesiones.");
  if (payouts.error) throw new Error("No se pudieron cargar tus pagos.");
  return {
    me: user.id,
    sessions: buildSessions(sessions.data ?? [], user.id),
    payouts: payouts.data ?? [],
    reviews: reviews.data ?? [],
  };
}

/** Resumen de «Mis pagos» con las cifras de administración. */
export function paySummary(payouts: MentorPayoutRow[], now = Date.now()) {
  let paid = 0, pending = 0, pendingExtra = 0, pendingSessions = 0;
  let next: MentorPayoutRow | null = null;
  for (const row of payouts) {
    const state = payoutState(row, now);
    if (state === "pagado") paid += row.amount_cents;
    if (state === "pendiente" || state === "en_proceso") {
      pending += row.amount_cents;
      pendingExtra += row.extra_cents;
      pendingSessions += row.sessions_registered;
      if (!next || row.period_end < next.period_end) next = row;
    }
  }
  return { paid, pending, pendingExtra, pendingSessions, next };
}
