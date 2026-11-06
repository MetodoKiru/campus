"use client";

import { GRID_TIMES, WEEK_DAYS, cellId, cellLabel } from "@/lib/growth";

const SHORT: Record<string, string> = { lunes: "L", martes: "M", miercoles: "X", jueves: "J", viernes: "V", sabado: "S", domingo: "D" };

/**
 * Cuadrícula de casillas de 30 minutos (lunes a domingo, 08:00–22:00). Se
 * marca y desmarca cada casilla tocándola; el nombre del día marca o desmarca
 * el día entero y la hora, toda la fila. Cabe en el móvil sin desplazarse en
 * horizontal. La comparten mentores y coordinadores.
 */
export default function AvailabilityGrid({ value, onChange, disabled, accent = "warm" }: {
  value: string[];
  onChange: (cells: string[]) => void;
  disabled?: boolean;
  accent?: "warm" | "slate";
}) {
  const selected = new Set(value);
  const on = accent === "warm" ? "border-[#B99E77] bg-[#D9C8AE]" : "border-emerald-400 bg-emerald-300";
  const off = accent === "warm" ? "border-[#E7E3DC] bg-white hover:bg-[#F3EEE5]" : "border-slate-200 bg-white hover:bg-emerald-50";

  const setMany = (cells: string[], mark: boolean) => {
    const next = new Set(selected);
    for (const c of cells) { if (mark) next.add(c); else next.delete(c); }
    onChange([...next]);
  };
  const toggleGroup = (cells: string[]) => setMany(cells, !cells.every((c) => selected.has(c)));

  return (
    <div className="select-none" role="group" aria-label="Cuadrícula de disponibilidad de 30 minutos">
      <div className="grid grid-cols-[2.6rem_repeat(7,minmax(0,1fr))] gap-[3px] sm:grid-cols-[3.2rem_repeat(7,minmax(0,1fr))] sm:gap-1">
        <span />
        {WEEK_DAYS.map((day) => {
          const cells = GRID_TIMES.map((t) => cellId(day.id, t));
          const all = cells.every((c) => selected.has(c));
          return (
            <button
              key={day.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleGroup(cells)}
              aria-label={`${all ? "Desmarcar" : "Marcar"} todo el ${day.label.toLowerCase()}`}
              title={`${all ? "Desmarcar" : "Marcar"} todo el día`}
              className="flex flex-col items-center rounded-lg py-1 text-[11px] font-bold text-[#45433F] hover:bg-[#F3F0EA] disabled:opacity-60"
            >
              <span className="sm:hidden">{SHORT[day.id]}</span>
              <span className="hidden sm:inline">{day.label.slice(0, 3)}</span>
              <span className="text-[9px] font-semibold text-[#77736B]">{all ? "quitar" : "todo"}</span>
            </button>
          );
        })}
        {GRID_TIMES.map((time) => {
          const row = WEEK_DAYS.map((d) => cellId(d.id, time));
          return (
            <Row key={time} time={time} row={row} selected={selected} disabled={disabled} on={on} off={off}
              onToggleRow={() => toggleGroup(row)} onToggle={(c) => setMany([c], !selected.has(c))} />
          );
        })}
      </div>
    </div>
  );
}

function Row({ time, row, selected, disabled, on, off, onToggleRow, onToggle }: {
  time: string; row: string[]; selected: Set<string>; disabled?: boolean; on: string; off: string;
  onToggleRow: () => void; onToggle: (cell: string) => void;
}) {
  return (
    <>
      <button type="button" disabled={disabled} onClick={onToggleRow} title="Marcar o desmarcar esta hora todos los días"
        className={`rounded-md pr-1 text-right text-[10px] font-semibold tabular-nums text-[#77736B] hover:bg-[#F3F0EA] disabled:opacity-60 ${time.endsWith(":00") ? "" : "text-[#A8A39A]"}`}>
        {time}
      </button>
      {row.map((cell) => {
        const isOn = selected.has(cell);
        return (
          <button
            key={cell}
            type="button"
            disabled={disabled}
            aria-pressed={isOn}
            aria-label={cellLabel(cell)}
            title={cellLabel(cell)}
            onClick={() => onToggle(cell)}
            className={`h-7 rounded-md border transition sm:h-6 ${isOn ? on : off} disabled:cursor-default`}
          />
        );
      })}
    </>
  );
}
