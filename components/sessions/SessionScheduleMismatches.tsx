"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { SessionScheduleMismatchRow } from "@/lib/database.types";

export function useSessionScheduleMismatches(enabled = true) {
  const [rows, setRows] = useState<SessionScheduleMismatchRow[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void supabase.rpc("kiru_session_schedule_mismatches", { p_days: 90 }).then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        console.error("No se pudieron cargar los avisos de horario.", error);
        return;
      }
      setRows((data ?? []) as SessionScheduleMismatchRow[]);
    });
    return () => { alive = false; };
  }, [enabled]);
  return rows;
}

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const weekdayName = (day: number) => WEEKDAYS[day - 1] ?? "día no indicado";
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("es-ES", {
  timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long",
});

function MismatchList({ rows, coordinator }: { rows: SessionScheduleMismatchRow[]; coordinator: boolean }) {
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border border-orange-300 bg-orange-50 p-4 sm:p-5 space-y-3" aria-label="Registros fuera del horario habitual">
      <h3 className="flex items-center gap-2 text-sm font-bold text-orange-950">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {rows.length === 1 ? "Un registro no coincide con el horario" : `${rows.length} registros no coinciden con el horario`}
      </h3>
      <ul className="space-y-2 text-xs text-orange-950">
        {rows.map((row) => (
          <li key={`${row.student_id}-${row.mentor_id}-${row.session_date}`} className="rounded-xl border border-orange-200 bg-white/70 p-3">
            <strong>{row.student_name}</strong> · {row.mentor_name} · {dateLabel(row.session_date)}
            <span className="mt-1 block text-orange-900">Registrada en {weekdayName(row.session_weekday)}; horario habitual: {row.scheduled_weekdays.map(weekdayName).join(" y ")}.</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed text-orange-900">
        {coordinator
          ? "Revisa si fue un cambio acordado y, si corresponde, actualiza el horario. El aviso no cambia ni duplica la sesión."
          : "Si la clase se cambió y ya estaba acordada, avisa a tu coordinadora para que revise el horario. No registres otra sesión para corregir este aviso."}
      </p>
    </section>
  );
}

export function MentorSessionScheduleMismatches({ rows }: { rows: SessionScheduleMismatchRow[] }) {
  return <MismatchList rows={rows} coordinator={false} />;
}

export function CoordinatorSessionScheduleMismatches({ rows }: { rows: SessionScheduleMismatchRow[] }) {
  return <MismatchList rows={rows} coordinator />;
}
