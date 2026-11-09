"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MentorPayoutHistoryRow, MentorPayoutRow } from "@/lib/database.types";
import { PAYOUT_STATE_LABEL, formatDay, formatEuros, payoutState, periodLabel } from "@/lib/mentor-pay";

type Checks = {
  last_sync: string | null;
  mismatches: { id: string; mentor: string; student: string; start: string; end: string; sheet: number; campus: number }[];
  overlaps: { mentor: string; student: string; a_start: string; a_end: string; b_start: string; b_end: string }[];
  unmatched: { mentor: string; student: string; missing: "mentor" | "alumno" | "ambos" }[];
};

/**
 * Administración · «Pagos de mentores»: la copia de la pestaña «Pagos» que ven
 * los mentores y las comprobaciones (sesiones del campus distintas de las de la
 * hoja, periodos que se pisan y nombres sin cuenta). Para corregir algo se
 * cambia la hoja; el campus lo recoge en la siguiente copia.
 */
export default function AdminMentorPayouts() {
  const [checks, setChecks] = useState<Checks | null>(null);
  const [rows, setRows] = useState<MentorPayoutRow[]>([]);
  const [history, setHistory] = useState<MentorPayoutHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.rpc("kiru_mentor_payout_checks", {}),
      supabase.from("kiru_mentor_payouts").select("*").order("period_start", { ascending: false }),
      supabase.from("kiru_mentor_payout_history").select("*").order("changed_at", { ascending: false }).limit(50),
    ]).then(([c, p, h]) => {
      if (!alive) return;
      if (c.error || p.error) { setError("No se pudieron cargar los pagos de mentores."); return; }
      setChecks(c.data as unknown as Checks);
      setRows(p.data ?? []);
      setHistory(h.data ?? []);
    });
    return () => { alive = false; };
  }, []);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const issues = checks ? checks.mismatches.length + checks.overlaps.length + checks.unmatched.length : 0;

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Pagos de mentores</h2>
        <p className="text-xs text-slate-500">
          Copia de la pestaña «Pagos» (hoja Registro de sesión) que cada mentor ve en «Mis pagos». La hoja manda: para corregir algo, cámbialo allí.
          {checks?.last_sync ? ` Última copia: ${formatDay(checks.last_sync, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : " Todavía no ha llegado ninguna copia."}
        </p>
      </div>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}

      {checks && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Comprobaciones {issues ? `(${issues})` : ""}</h3>
          {issues === 0 && <p className="text-xs text-emerald-700">Todo cuadra: las sesiones del campus coinciden con «Sesiones registradas» y no hay periodos que se pisen.</p>}
          {checks.mismatches.map((m) => (
            <p key={m.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {m.mentor} · {m.student} · {periodLabel({ period_start: m.start, period_end: m.end })}: la hoja cuenta {m.sheet} {m.sheet === 1 ? "sesión" : "sesiones"} y el campus {m.campus} (sin repetidos). El mentor ve la cifra de la hoja con una nota.
            </p>
          ))}
          {checks.overlaps.map((o, i) => (
            <p key={`o-${i}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {o.mentor} · {o.student}: los periodos {periodLabel({ period_start: o.a_start, period_end: o.a_end })} y {periodLabel({ period_start: o.b_start, period_end: o.b_end })} se pisan. Una sesión podría contarse dos veces.
            </p>
          ))}
          {checks.unmatched.map((u, i) => (
            <p key={`u-${i}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              {u.mentor} · {u.student}: {u.missing === "ambos" ? "ni el mentor ni el alumno tienen" : u.missing === "mentor" ? "el mentor no tiene" : "el alumno no tiene"} cuenta en el campus con ese nombre. Esas filas solo las ves tú.
            </p>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500">
              <tr><th className="py-2 pr-3">Mentor</th><th className="pr-3">Alumno</th><th className="pr-3">Periodo</th><th className="pr-3">Hoja</th><th className="pr-3">Lo ve el mentor</th><th className="pr-3 text-right">Sesiones</th><th className="pr-3 text-right">Importe</th><th>Pagado</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.filter((r) => !r.removed_at).map((r) => {
                const state = r.mentor_id ? payoutState(r) : null;
                return (
                  <tr key={r.id} className="text-slate-700">
                    <td className="py-2 pr-3">{r.mentor_name}</td>
                    <td className="pr-3">{r.student_name}</td>
                    <td className="pr-3">{periodLabel(r)}</td>
                    <td className="pr-3">{r.sheet_status || "—"}</td>
                    <td className="pr-3">{state ? PAYOUT_STATE_LABEL[state] : "No"}</td>
                    <td className="pr-3 text-right">{r.sessions_registered}</td>
                    <td className="pr-3 text-right">{formatEuros(r.amount_cents)}</td>
                    <td>{r.paid_on ? formatDay(r.paid_on) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Últimos cambios en la hoja</h3>
          <ul className="space-y-1 text-xs text-slate-600">
            {history.map((h) => {
              const row = byId.get(h.payout_id);
              const prev = h.previous as Record<string, unknown>;
              const curr = h.current as Record<string, unknown>;
              const changed = Object.keys(curr).filter((k) => JSON.stringify(curr[k]) !== JSON.stringify(prev[k]));
              return (
                <li key={h.id}>
                  {formatDay(h.changed_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {row ? `${row.mentor_name} · ${row.student_name} · ${periodLabel(row)}` : "fila"}: {changed.map((k) => `${k} ${String(prev[k] ?? "—")} → ${String(curr[k] ?? "—")}`).join(", ")}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
