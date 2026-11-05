"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { madridHolidayMap } from "@/lib/madrid-holidays";

interface CalendarSession {
  id: string;
  session_date: string | null;
  mentor_name: string;
  topic: string;
}

interface CalendarSlot {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  mentor_name: string;
}

function madridTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateLabel(key: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", ...options });
}

export default function FamilySessionCalendar({
  sessions,
  schedule,
}: {
  sessions: CalendarSession[];
  schedule: CalendarSlot[];
}) {
  const today = madridTodayKey();
  const [month, setMonth] = useState(() => {
    const [year, monthNumber] = today.split("-").map(Number);
    return new Date(Date.UTC(year, monthNumber - 1, 1));
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const monthTitle = month.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const holidayByDate = useMemo(() => madridHolidayMap(year), [year]);

  const sessionsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarSession[]>();
    for (const session of sessions) {
      if (!session.session_date) continue;
      grouped.set(session.session_date, [...(grouped.get(session.session_date) ?? []), session]);
    }
    return grouped;
  }, [sessions]);

  const scheduledByDate = useMemo(() => {
    const grouped = new Map<string, CalendarSlot[]>();
    const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    for (let day = 1; day <= dayCount; day += 1) {
      const date = new Date(Date.UTC(year, monthIndex, day));
      const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
      const key = dateKey(year, monthIndex, day);
      if (key < today || sessionsByDate.has(key)) continue;
      const slots = schedule.filter((slot) => slot.weekday === weekday);
      if (slots.length) grouped.set(key, slots);
    }
    return grouped;
  }, [monthIndex, schedule, sessionsByDate, today, year]);

  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const leadingBlanks = firstDay === 0 ? 6 : firstDay - 1;
  const cells = Array.from({ length: leadingBlanks + daysInMonth }, (_, index) =>
    index < leadingBlanks ? null : index - leadingBlanks + 1
  );
  const selectedSessions = selectedDate ? sessionsByDate.get(selectedDate) ?? [] : [];
  const selectedScheduled = selectedDate ? scheduledByDate.get(selectedDate) ?? [] : [];
  const selectedHoliday = selectedDate ? holidayByDate.get(selectedDate) : undefined;
  const holidayYearAvailable = Boolean(madridHolidayMap(year).size);

  const changeMonth = (amount: number) => {
    setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + amount, 1)));
    setSelectedDate(null);
  };

  return (
    <section className="rounded-2xl border border-[#E7E3DC] bg-[#FDFCFB] p-4 sm:p-5 space-y-4" aria-label="Calendario de sesiones">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="font-serif text-base font-bold capitalize text-[#292825]">Calendario</h4>
          <p className="text-[11px] text-[#77736B]">{monthTitle}</p>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mes anterior" className="rounded-lg border border-[#E7E3DC] bg-white p-2 text-[#6D6962] hover:bg-[#F3F0EA]"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Mes siguiente" className="rounded-lg border border-[#E7E3DC] bg-white p-2 text-[#6D6962] hover:bg-[#F3F0EA]"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#8D887F]">
        {["L", "M", "X", "J", "V", "S", "D"].map((day, index) => <span key={`${day}-${index}`} className="py-1" aria-label={["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][index]}>{day}</span>)}
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} className="min-h-10" />;
          const key = dateKey(year, monthIndex, day);
          const logged = sessionsByDate.get(key) ?? [];
          const planned = scheduledByDate.get(key) ?? [];
          const holiday = holidayByDate.get(key);
          const isSelected = selectedDate === key;
          const isToday = today === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDate(key)}
              aria-pressed={isSelected}
              aria-label={`${dateLabel(key, { weekday: "long", day: "numeric", month: "long" })}${logged.length ? `, ${logged.length} sesión${logged.length === 1 ? "" : "es"} registrada${logged.length === 1 ? "" : "s"}` : ""}${planned.length ? ", próxima según horario" : ""}${holiday ? `, festivo: ${holiday}` : ""}`}
              title={holiday ? `Festivo: ${holiday}` : undefined}
              className={`min-h-10 rounded-xl border p-1 text-xs transition ${isSelected ? "border-[#292825] ring-1 ring-[#292825]" : "border-transparent hover:border-[#DCD6CC]"} ${logged.length ? "bg-[#E7F0E4] text-[#38523A]" : planned.length ? "bg-[#E8F1F6] text-[#38566A]" : "bg-white text-[#45433F]"} ${isToday ? "font-bold" : ""}`}
            >
              <span>{day}</span>
              <span className="mt-0.5 flex h-1.5 justify-center gap-0.5">
                {logged.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[#5D865C]" />}
                {planned.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[#5C87A0]" />}
                {holiday && <span className="h-1.5 w-1.5 rounded-full bg-[#C6933B]" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-[#6D6962]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#5D865C]" />Sesión registrada</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#5C87A0]" />Próxima según horario</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#C6933B]" />Festivo oficial de Madrid</span>
      </div>

      {selectedDate && (
        <div className="min-h-16 border-t border-[#E7E3DC] pt-3 space-y-2">
          <p className="text-xs font-bold capitalize text-[#45433F]">{dateLabel(selectedDate, { weekday: "long", day: "numeric", month: "long" })}</p>
          {selectedHoliday && <p className="text-xs text-[#806C50]">Festivo en Madrid · {selectedHoliday}</p>}
          {selectedSessions.map((session) => (
            <div key={session.id} className="rounded-xl bg-[#E7F0E4] p-3 text-xs text-[#38523A]">
              <p className="font-semibold">Sesión registrada · {session.mentor_name || "Mentor/a no indicado"}</p>
              {session.topic && <p className="mt-1">{session.topic}</p>}
            </div>
          ))}
          {selectedScheduled.map((slot) => (
            <div key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#E8F1F6] p-3 text-xs text-[#38566A]">
              <span className="font-semibold">Próxima según horario · {slot.mentor_name}</span>
              <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</span>
              <button type="button" disabled title="Próximamente" className="rounded-lg border border-[#B8CAD4] px-2.5 py-1 text-[10px] text-[#536E7D] opacity-70 cursor-not-allowed">Solicitar cambio · Próximamente</button>
            </div>
          ))}
          {!selectedHoliday && !selectedSessions.length && !selectedScheduled.length && <p className="text-xs text-[#8D887F]">Sin sesión registrada ni clase prevista en este día.</p>}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-[#8D887F]"><CalendarDays className="mt-0.5 h-3 w-3 shrink-0" />Las sesiones realizadas solo aparecen cuando el mentor las registra. Las próximas se calculan con el horario semanal habitual; todavía no son reservas con cambios gestionados desde el campus.</p>
      {!holidayYearAvailable && <p className="text-[10px] text-[#8D887F]">Los festivos oficiales de Madrid de {year} aún no están cargados.</p>}
    </section>
  );
}
