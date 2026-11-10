"use client";

import { dateLabel, eachDay, type SubSlot } from "@/lib/special-periods";

/** Días del periodo con mañana / tarde para marcar disponibilidad de sustitución. */
export default function SlotGrid({ from, to, value, onChange }: { from: string; to: string; value: SubSlot[]; onChange: (v: SubSlot[]) => void }) {
  const byDate = new Map(value.map((s) => [s.date, s]));
  const set = (date: string, part: "manana" | "tarde", on: boolean) => {
    const cur = byDate.get(date) ?? { date, manana: false, tarde: false };
    const next = { ...cur, [part]: on };
    const rest = value.filter((s) => s.date !== date);
    onChange(next.manana || next.tarde ? [...rest, next].sort((a, b) => a.date.localeCompare(b.date)) : rest);
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[#77736B]"><th className="py-1 pr-2">Día</th><th className="py-1 pr-2">Mañana</th><th className="py-1">Tarde</th></tr></thead>
        <tbody>
          {eachDay(from, to).map((d) => (
            <tr key={d} className="border-t border-[#F0ECE5]">
              <td className="py-1 pr-2 capitalize">{dateLabel(d)}</td>
              <td className="py-1 pr-2"><input type="checkbox" aria-label={`${d} mañana`} checked={!!byDate.get(d)?.manana} onChange={(e) => set(d, "manana", e.target.checked)} /></td>
              <td className="py-1"><input type="checkbox" aria-label={`${d} tarde`} checked={!!byDate.get(d)?.tarde} onChange={(e) => set(d, "tarde", e.target.checked)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ZonePicker({ zones, value, onChange }: { zones: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {zones.map((z) => {
        const on = value.includes(z);
        return (
          <button key={z} type="button" onClick={() => onChange(on ? value.filter((x) => x !== z) : [...value, z])}
            className={`rounded-full px-2.5 py-1 text-[11px] ${on ? "bg-[#242321] text-white" : "border border-[#E7E3DC] text-[#45433F]"}`}>{z}</button>
        );
      })}
    </div>
  );
}
