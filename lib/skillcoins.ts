// SkillCoins: saldo, catálogo de recompensas, objetivos y avisos.
// Toda la lógica que decide (saldo, permisos, estados) vive en la base de datos
// (migración 20261031090000_skillcoins_tienda.sql); aquí solo se llama y se pinta.

import { supabase } from "@/lib/supabase";
import type { NotificationRow, RewardGoalRow, RewardGoalStatus, RewardRow, SkillcoinMovementRow } from "@/lib/database.types";

export type Reward = RewardRow;
export type RewardGoal = RewardGoalRow;
export type SkillcoinMovement = SkillcoinMovementRow;
export type KiruNotification = NotificationRow;

export type SkillcoinScores = { estudios: number; compromiso: number; organizacion: number; bienestar: number };
export type SkillcoinWeek = SkillcoinScores & { week: string; total: number; corrected: boolean };
export type SkillcoinSummary = { earned: number; spent: number; balance: number; currentWeek: string; weeks: SkillcoinWeek[] };

export const EMPTY_SUMMARY: SkillcoinSummary = { earned: 0, spent: 0, balance: 0, currentWeek: "", weeks: [] };

/** Los estados que siguen «vivos»: el objetivo activo y una posible petición de cambio. */
export const OPEN_STATUSES: RewardGoalStatus[] = ["pendiente", "aprobado", "canje_solicitado"];

export const STATUS_LABEL: Record<RewardGoalStatus, string> = {
  pendiente: "Pendiente de aprobación",
  aprobado: "Objetivo aprobado",
  rechazado: "Rechazado",
  canje_solicitado: "Canje solicitado",
  completado: "Canje completado",
  cancelado: "Retirado",
  sustituido: "Cambiado por otro",
};

/** Etiqueta que ve la gente: un objetivo aprobado con saldo suficiente es «objetivo conseguido». */
export function goalLabel(goal: Pick<RewardGoal, "status" | "cost">, balance: number): string {
  if (goal.status === "aprobado" && balance >= goal.cost) return "¡Objetivo conseguido!";
  return STATUS_LABEL[goal.status];
}

export function progressOf(cost: number, balance: number) {
  const have = Math.max(0, Math.min(balance, cost));
  return { have, missing: Math.max(0, cost - balance), percent: cost > 0 ? Math.min(100, Math.round((have / cost) * 100)) : 0, reached: balance >= cost };
}

/** Frase de ánimo según lo cerca que está. */
export function motivation(cost: number, balance: number): string {
  const { percent, missing, reached } = progressOf(cost, balance);
  if (reached) return "¡Lo has conseguido! Ya puedes pedírselo a tu familia.";
  if (percent >= 90) return `¡Casi lo tienes! Solo te faltan ${missing} SC.`;
  if (percent >= 75) return "Estás en la recta final. Sigue así.";
  if (percent >= 50) return "Ya llevas más de la mitad. Cada semana cuenta.";
  if (percent >= 25) return "Vas por buen camino. Tu esfuerzo se está notando.";
  return "Todo gran objetivo empieza con un primer paso. ¡A por ello!";
}

/** Mensaje de error de Supabase en español (las funciones ya lo devuelven así). */
export function errorText(error: unknown, fallback = "No se pudo completar la acción. Inténtalo de nuevo."): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) {
    if (/failed to fetch|network/i.test(error.message)) return "No hay conexión. Comprueba internet e inténtalo de nuevo.";
    return error.message;
  }
  return fallback;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchSummary(studentId: string): Promise<SkillcoinSummary> {
  const { data, error } = await supabase.rpc("kiru_skillcoin_summary", { p_student: studentId });
  if (error) throw error;
  const value = (data ?? {}) as Record<string, unknown>;
  const weeks = Array.isArray(value.weeks) ? value.weeks : [];
  return {
    earned: toNumber(value.earned),
    spent: toNumber(value.spent),
    balance: toNumber(value.balance),
    currentWeek: typeof value.currentWeek === "string" ? value.currentWeek : "",
    weeks: weeks.map((item) => {
      const w = (item ?? {}) as Record<string, unknown>;
      return {
        week: String(w.week ?? ""),
        estudios: toNumber(w.estudios),
        compromiso: toNumber(w.compromiso),
        organizacion: toNumber(w.organizacion),
        bienestar: toNumber(w.bienestar),
        total: toNumber(w.total),
        corrected: w.corrected === true,
      };
    }),
  };
}

export async function fetchRewards(): Promise<Reward[]> {
  const { data, error } = await supabase.from("kiru_rewards").select("*").eq("is_active", true)
    .order("category_order").order("sort_order");
  if (error) throw error;
  return data ?? [];
}

/** Categorías en el orden del catálogo. */
export function groupByCategory(rewards: Reward[]): { category: string; rewards: Reward[] }[] {
  const groups = new Map<string, Reward[]>();
  for (const reward of rewards) groups.set(reward.category, [...(groups.get(reward.category) ?? []), reward]);
  return [...groups.entries()].map(([category, items]) => ({ category, rewards: items }));
}

/** Objetivos de los alumnos que el usuario puede ver (RLS decide cuáles). */
export async function fetchGoals(studentIds?: string[]): Promise<RewardGoal[]> {
  let query = supabase.from("kiru_reward_goals").select("*").order("created_at", { ascending: false });
  if (studentIds) query = query.in("student_id", studentIds.length ? studentIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchMovements(studentIds?: string[]): Promise<SkillcoinMovement[]> {
  let query = supabase.from("kiru_skillcoin_movements").select("*").order("created_at", { ascending: false });
  if (studentIds) query = query.in("student_id", studentIds.length ? studentIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** El objetivo activo (aprobado o en canje) y la petición pendiente, si las hay. */
export function openGoals(goals: RewardGoal[], studentId: string) {
  const mine = goals.filter((g) => g.student_id === studentId);
  return {
    active: mine.find((g) => g.status === "aprobado" || g.status === "canje_solicitado") ?? null,
    pending: mine.find((g) => g.status === "pendiente") ?? null,
    last: mine[0] ?? null,
  };
}

async function call<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

export const chooseReward = (rewardId: string) => call(supabase.rpc("kiru_reward_choose", { p_reward_id: rewardId }));
export const cancelGoal = (goalId: string) => call(supabase.rpc("kiru_reward_cancel", { p_goal: goalId }));
export const requestRedeem = (goalId: string) => call(supabase.rpc("kiru_reward_request_redeem", { p_goal: goalId }));
export const decideGoal = (goalId: string, approve: boolean, note = "") => call(supabase.rpc("kiru_reward_decide", { p_goal: goalId, p_approve: approve, p_note: note }));
export const resolveRedeem = (goalId: string, confirm: boolean, note = "") => call(supabase.rpc("kiru_reward_resolve_redeem", { p_goal: goalId, p_confirm: confirm, p_note: note }));

export async function correctWeek(studentId: string, week: string, scores: SkillcoinScores, reason = ""): Promise<void> {
  await call(supabase.rpc("kiru_skillcoin_correct_week", {
    p_student: studentId, p_week: week,
    p_estudios: scores.estudios, p_compromiso: scores.compromiso, p_organizacion: scores.organizacion, p_bienestar: scores.bienestar,
    p_reason: reason,
  }));
}

export async function fetchNotifications(limit = 30): Promise<KiruNotification[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("kiru_notifications").select("*")
    .eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export const markNotificationsRead = (ids?: string[]) => call(supabase.rpc("kiru_notifications_mark_read", ids ? { p_ids: ids } : {}));

export function weekLabel(week: string): string {
  if (!week) return "";
  return "Semana del " + new Date(week + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

/** Lunes anterior a una semana (AAAA-MM-DD). */
function previousMonday(week: string): string {
  const d = new Date(week + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Qué semana enseñar y cómo llamarla. Si esta semana ya tiene registro SC, se
 * enseña «Esta semana»; si no, la última que haya, avisando de que la de esta
 * semana aún no ha llegado.
 */
export function latestWeekInfo(summary: Pick<SkillcoinSummary, "weeks" | "currentWeek">): {
  week: SkillcoinWeek | undefined; title: string; note: string;
} {
  const week = summary.weeks[summary.weeks.length - 1];
  const current = summary.currentWeek;
  if (!week) return { week, title: "Sin semanas registradas", note: "" };
  if (week.week === current) return { week, title: "Esta semana", note: weekLabel(week.week) };
  const pending = current ? "Aún falta el registro SC de esta semana" : "";
  if (current && week.week === previousMonday(current)) return { week, title: "Semana pasada", note: [weekLabel(week.week), pending].filter(Boolean).join(" · ") };
  return { week, title: "Última semana registrada", note: [weekLabel(week.week), pending].filter(Boolean).join(" · ") };
}
