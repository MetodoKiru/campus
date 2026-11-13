import type { ScheduleChangeStatus, WeeklySlot } from "@/lib/database.types";

/** weekday 1 = lunes … 7 = domingo (como en el horario semanal). */
export const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const WEEKDAYS_SHORT = ["L", "M", "X", "J", "V", "S", "D"];

export function dayName(weekday: number): string {
  return WEEKDAYS[weekday - 1] ?? "";
}

/** «HH:MM» → minutos desde las 00:00. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMinutes(min: number): string {
  if (min >= 24 * 60) return "24:00";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** «martes 17:45 y sábado 11:00» */
export function slotsText(slots: Pick<WeeklySlot, "weekday" | "start">[]): string {
  const parts = [...slots]
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
    .map((s) => `${dayName(s.weekday).toLowerCase()} ${s.start}`);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/** Cuadrícula de la disponibilidad: celdas de media hora de START a END (la última clase es de 19:30 a 20:30). */
export const GRID_START = 8 * 60;
export const GRID_END = 20 * 60 + 30;
export const GRID_STEP = 30;
/** Días que se pueden marcar: los viernes no hay clase. */
export const CLASS_WEEKDAYS = [1, 2, 3, 4, 6, 7];

export function cellKey(weekday: number, min: number): string {
  return `${weekday}-${min}`;
}

/** Franjas guardadas → celdas marcadas. */
export function slotsToCells(slots: WeeklySlot[]): Set<string> {
  const cells = new Set<string>();
  for (const s of slots) {
    if (!CLASS_WEEKDAYS.includes(s.weekday)) continue;
    const from = Math.max(toMinutes(s.start), GRID_START);
    const to = Math.min(toMinutes(s.end === "23:59" ? "24:00" : s.end), GRID_END);
    for (let m = from; m < to; m += GRID_STEP) cells.add(cellKey(s.weekday, m));
  }
  return cells;
}

/** Celdas marcadas → franjas seguidas por día (lo que se guarda). */
export function cellsToSlots(cells: Set<string>): WeeklySlot[] {
  const out: WeeklySlot[] = [];
  for (let d = 1; d <= 7; d++) {
    let start: number | null = null;
    for (let m = 0; m <= 24 * 60; m += GRID_STEP) {
      const on = m < 24 * 60 && cells.has(cellKey(d, m));
      if (on && start === null) start = m;
      if (!on && start !== null) { out.push({ weekday: d, start: fromMinutes(start), end: fromMinutes(m) }); start = null; }
    }
  }
  return out;
}

export const CHANGE_STATUS_LABEL: Record<ScheduleChangeStatus, string> = {
  elegir_familia: "Esperando a que la familia elija",
  confirmar_mentor: "Esperando la confirmación del mentor",
  confirmado: "Confirmado (se aplica al empezar la mensualidad)",
  aplicado: "Aplicado",
  cancelado: "Cancelado",
};

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d}/${m}` : iso;
}

export function longDate(iso: string): string {
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} de ${months[m - 1]}` : iso;
}
