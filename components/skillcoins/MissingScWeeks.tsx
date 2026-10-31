"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { weekLabel } from "@/lib/skillcoins";
import type { MissingScWeekRow } from "@/lib/database.types";

/**
 * Semanas ya terminadas en las que un alumno tuvo clase y no tiene SkillCoins.
 * La base de datos decide qué ve cada uno: el mentor las suyas, el coordinador
 * las de sus mentores y administración todas.
 */
export function useMissingScWeeks(enabled = true) {
  const [rows, setRows] = useState<MissingScWeekRow[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void supabase.rpc("kiru_missing_sc_weeks", { p_weeks: 8 }).then(({ data }) => {
      if (alive) setRows((data ?? []) as MissingScWeekRow[]);
    });
    return () => { alive = false; };
  }, [enabled]);
  return rows;
}

function dates(row: MissingScWeekRow) {
  return row.session_dates
    .map((d) => new Date(d + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }))
    .join(", ");
}

/** Aviso para el mentor, encima de su panel. No se pinta si no hay nada. */
export function MentorMissingSc({ rows }: { rows: MissingScWeekRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 space-y-2">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Falta el registro SC de {rows.length === 1 ? "una semana" : `${rows.length} semanas`}
      </p>
      <ul className="text-xs text-amber-900 space-y-1">
        {rows.map((r) => (
          <li key={r.week + r.student_id}>
            <strong>{r.student_name}</strong> · {weekLabel(r.week).toLowerCase()} · {r.sessions} clase{r.sessions === 1 ? "" : "s"} ({dates(r)})
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-amber-800">
        Cada semana hay que puntuar las SkillCoins (estudios, compromiso, organización y bienestar) en una de las sesiones. Sin ese registro el alumno y su familia no ven su semana. Tu coordinador/a también recibe este aviso.
      </p>
    </div>
  );
}

/** Lista para coordinación y administración. */
export function CoordinatorMissingSc({ rows }: { rows: MissingScWeekRow[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-slate-800">Semanas sin SkillCoins</h3>
      <p className="text-xs text-slate-500">Semanas terminadas en las que el alumno tuvo clase y no hay registro SC. Es una posible incidencia de metodología del mentor: el mentor ve el mismo aviso en su panel y le llega por correo el lunes.</p>
      {rows.length === 0 && <p className="text-sm text-slate-500">Todas las semanas con clase tienen su registro SC.</p>}
      {rows.map((r) => (
        <div key={r.week + r.student_id + (r.mentor_id ?? r.mentor_name)} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>{r.mentor_name}</strong> con <strong>{r.student_name}</strong> · {weekLabel(r.week).toLowerCase()} · {r.sessions} clase{r.sessions === 1 ? "" : "s"} ({dates(r)})
        </div>
      ))}
    </div>
  );
}
