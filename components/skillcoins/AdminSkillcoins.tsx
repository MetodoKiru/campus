"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SkillcoinCorrectionRow } from "@/lib/database.types";
import { STATUS_LABEL, correctWeek, errorText, fetchGoals, fetchMovements, fetchSummary, goalLabel, weekLabel, type RewardGoal, type SkillcoinMovement, type SkillcoinSummary } from "@/lib/skillcoins";

type Student = { id: string; name: string };
const FILTERS = [
  { id: "todos", label: "Todos" },
  { id: "pendiente", label: "Pendientes de aprobación" },
  { id: "aprobado", label: "Objetivos aprobados" },
  { id: "canje_solicitado", label: "Canjes solicitados" },
  { id: "completado", label: "Canjes completados" },
] as const;

/**
 * Consulta de administración: objetivos, solicitudes, canjes, movimientos y
 * correcciones de todos los alumnos. Administración no aprueba ni canjea (eso es
 * de las familias); sí puede corregir semanas pasadas, que queda registrado.
 */
export default function AdminSkillcoins() {
  const [students, setStudents] = useState<Student[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SkillcoinSummary>>({});
  const [goals, setGoals] = useState<RewardGoal[]>([]);
  const [movements, setMovements] = useState<SkillcoinMovement[]>([]);
  const [corrections, setCorrections] = useState<SkillcoinCorrectionRow[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("todos");
  const [error, setError] = useState("");
  const [fix, setFix] = useState({ student: "", week: "", estudios: 0, compromiso: 0, organizacion: 0, bienestar: 0, reason: "" });
  const [fixMsg, setFixMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id,full_name").eq("role", "alumno").order("full_name");
      if (profilesError) throw profilesError;
      const list = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }));
      const [nextGoals, nextMovements, correctionsResult, sums] = await Promise.all([
        fetchGoals(), fetchMovements(),
        supabase.from("kiru_skillcoin_corrections").select("*").order("created_at", { ascending: false }).limit(100),
        Promise.all(list.map(async (s) => [s.id, await fetchSummary(s.id)] as const)),
      ]);
      if (correctionsResult.error) throw correctionsResult.error;
      setStudents(list);
      setGoals(nextGoals);
      setMovements(nextMovements);
      setCorrections(correctionsResult.data ?? []);
      setSummaries(Object.fromEntries(sums));
      setError("");
    } catch (err) {
      setError(errorText(err, "No se pudieron cargar las SkillCoins."));
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(first);
  }, [load]);

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? "Alumno";
  const shown = goals.filter((g) => filter === "todos" || g.status === filter);

  const saveFix = async () => {
    setFixMsg("");
    try {
      await correctWeek(fix.student, fix.week, fix, fix.reason);
      setFixMsg("Semana corregida y SkillCoins recalculadas.");
      await load();
    } catch (err) {
      setFixMsg(errorText(err));
    }
  };

  return (
    <div className="space-y-6">
      {error && <p className="p-3 rounded-xl bg-rose-50 text-rose-800 text-sm">{error}</p>}

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-serif text-lg font-bold text-slate-900">Saldo por alumno</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase text-slate-500"><th className="py-2 pr-3">Alumno</th><th className="pr-3">Ganadas</th><th className="pr-3">Canjeadas</th><th className="pr-3">Saldo</th><th>Objetivo</th></tr></thead>
            <tbody>
              {students.map((s) => {
                const sum = summaries[s.id];
                const goal = goals.find((g) => g.student_id === s.id && (g.status === "aprobado" || g.status === "canje_solicitado"));
                return (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-semibold">{s.name}</td>
                    <td className="pr-3">{sum?.earned ?? "…"}</td>
                    <td className="pr-3">{sum?.spent ?? "…"}</td>
                    <td className="pr-3 font-bold">{sum?.balance ?? "…"}</td>
                    <td className="text-xs text-slate-600">{goal ? `${goal.reward_name} (${goal.cost} SC) · ${goalLabel(goal, sum?.balance ?? 0)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-serif text-lg font-bold text-slate-900">Objetivos, solicitudes y canjes</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="p-2 border border-slate-200 rounded-xl text-xs">
            {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        {shown.length === 0 ? <p className="text-xs text-slate-500">No hay nada en este estado.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {shown.map((g) => (
              <li key={g.id} className="py-2 flex flex-wrap justify-between gap-2">
                <span><strong>{nameOf(g.student_id)}</strong> · {g.reward_name} ({g.cost} SC){g.replaces_goal_id ? " · cambio de objetivo" : ""}</span>
                <span className="text-xs text-slate-500">{STATUS_LABEL[g.status]} · {new Date(g.updated_at).toLocaleDateString("es-ES")}{g.family_note ? ` · «${g.family_note}»` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-serif text-lg font-bold text-slate-900">Movimientos (canjes)</h2>
          {movements.length === 0 ? <p className="text-xs text-slate-500">Todavía no hay canjes.</p> : (
            <ul className="text-sm space-y-1.5">
              {movements.map((m) => <li key={m.id} className="flex justify-between gap-2"><span>{new Date(m.created_at).toLocaleDateString("es-ES")} · {nameOf(m.student_id)} · {m.reason}</span><strong>{m.amount} SC</strong></li>)}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-serif text-lg font-bold text-slate-900">Correcciones de SkillCoins</h2>
          {corrections.length === 0 ? <p className="text-xs text-slate-500">No hay correcciones.</p> : (
            <ul className="text-xs space-y-1.5 text-slate-700">
              {corrections.map((c) => (
                <li key={c.id}>{new Date(c.created_at).toLocaleString("es-ES")} · {nameOf(c.student_id)} · {weekLabel(c.week)} · {c.estudios}/{c.compromiso}/{c.organizacion}/{c.bienestar} · {c.corrected_role}{c.reason ? ` · «${c.reason}»` : ""}</li>
              ))}
            </ul>
          )}
          <details className="pt-2 border-t border-slate-100">
            <summary className="cursor-pointer text-xs font-bold text-slate-700">Corregir una semana (cualquier semana)</summary>
            <div className="mt-3 space-y-2 text-xs">
              <select value={fix.student} onChange={(e) => setFix({ ...fix, student: e.target.value })} className="w-full p-2 border border-slate-200 rounded-xl">
                <option value="">Elige alumno</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input type="date" value={fix.week} onChange={(e) => setFix({ ...fix, week: e.target.value })} className="w-full p-2 border border-slate-200 rounded-xl" aria-label="Un día de la semana a corregir" />
              <div className="grid grid-cols-4 gap-2">
                {(["estudios", "compromiso", "organizacion", "bienestar"] as const).map((k) => (
                  <label key={k} className="space-y-1"><span className="block capitalize text-slate-500">{k}</span>
                    <input type="number" min={0} max={10} value={fix[k]} onChange={(e) => setFix({ ...fix, [k]: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) })} className="w-full p-2 border border-slate-200 rounded-xl" />
                  </label>
                ))}
              </div>
              <input value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} maxLength={500} placeholder="Motivo" className="w-full p-2 border border-slate-200 rounded-xl" />
              <button disabled={!fix.student || !fix.week} onClick={() => void saveFix()} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40">Guardar corrección</button>
              {fixMsg && <p className="text-slate-600">{fixMsg}</p>}
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
