import type { WeeklySlot } from "@/lib/database.types";

/** Formulario «Mi disponibilidad para clases» (v2). Sin mañanas entre semana ni viernes. */

export type Transport = "coche" | "transporte_publico" | "moto" | "bici_andando";
export const TRANSPORT_LABEL: Record<Transport, string> = {
  coche: "Coche",
  transporte_publico: "Metro / bus / tren",
  moto: "Moto",
  bici_andando: "Bici o andando",
};

export type Arrive = "si" | "justo" | "no";
export const ARRIVE_LABEL: Record<Arrive, string> = {
  si: "Sí, sin problema",
  justo: "Justo, pero sí",
  no: "No, necesitaría empezar más tarde",
};

export type ExtraDay = { student_id: string; weekday: number | null; start?: string; end?: string; arrive?: Arrive };

/** Días en los que se puede dar clase: lunes a jueves (tarde), sábado y domingo. */
export const EXTRA_DAYS = [1, 2, 3, 4, 6, 7];

const pad = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };

const WEEKDAY_STARTS = Array.from({ length: 8 }, (_, i) => pad(16 * 60 + i * 30)); // 16:00 … 19:30
const WEEKEND_STARTS = ["10:00", "11:00", "12:00", "13:00", "16:00", "17:00", "18:00", "19:00", "19:30"];

/** Horas a las que puede empezar una clase (de 1 hora) ese día. */
export function DAY_STARTS(weekday: number): string[] {
  if (weekday === 5) return [];
  return weekday >= 6 ? WEEKEND_STARTS : WEEKDAY_STARTS;
}

/** Botones «d-HH:MM» (inicio de clase de 1 h) → franjas semanales unidas. */
export function chipsToSlots(chips: Iterable<string>): WeeklySlot[] {
  const cells = new Map<number, Set<number>>();
  for (const c of chips) {
    const [d, s] = c.split("-");
    const day = Number(d);
    const start = toMin(s);
    if (!cells.has(day)) cells.set(day, new Set());
    cells.get(day)!.add(start);
    cells.get(day)!.add(start + 30);
  }
  const out: WeeklySlot[] = [];
  for (const day of [...cells.keys()].sort((a, b) => a - b)) {
    const list = [...cells.get(day)!].sort((a, b) => a - b);
    let from = list[0];
    let prev = list[0];
    for (const m of list.slice(1).concat([Infinity])) {
      if (m !== prev + 30) {
        out.push({ weekday: day, start: pad(from), end: pad(prev + 30) });
        from = m;
      }
      prev = m;
    }
  }
  return out;
}

/** Franjas guardadas → botones marcados (si la hora entera cabe en una franja). */
export function slotsToChips(slots: WeeklySlot[]): Set<string> {
  const chips = new Set<string>();
  for (const d of EXTRA_DAYS) {
    const daySlots = slots.filter((s) => s.weekday === d);
    for (const s of DAY_STARTS(d)) {
      const a = toMin(s);
      if (daySlots.some((x) => toMin(x.start) <= a && toMin(x.end) >= a + 60)) chips.add(`${d}-${s}`);
    }
  }
  return chips;
}
