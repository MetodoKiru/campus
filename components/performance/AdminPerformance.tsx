"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminExemptions from "@/components/performance/AdminExemptions";
import {
  CATEGORY_LABEL, DETAIL_LABEL, DIMENSION_LABEL, KIND_LABEL, MODE_LABEL,
  errorText, fmtDate, fmtNumber, isoDay, statusText,
  type DimensionKey, type Indicator, type MentorResult, type Overview, type PerfMode, type Rules,
} from "@/lib/performance";

const DIMS: DimensionKey[] = ["A", "B", "C", "D", "E"];

/**
 * Administración · «Desempeño de mentores» (fase 1).
 * Solo lo ve administración. Muestra las reglas aprobadas, el modo del sistema,
 * el trimestre en curso (desde la entrada en vigor) y un ensayo con fechas libres
 * que no guarda nada. Nada de esto llega todavía a mentores ni a coordinación.
 */
export default function AdminPerformance({ notify }: { notify?: (msg: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<PerfMode>("oculto");
  const [dataFrom, setDataFrom] = useState("");
  const [officialFrom, setOfficialFrom] = useState("");
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 60 * 864e5)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [preview, setPreview] = useState<MentorResult[] | null>(null);

  const load = useCallback(async () => {
    const { data: res, error: err } = await supabase.rpc("kiru_perf_admin_overview", {});
    if (err) { setError(errorText(err, "No se pudo cargar el desempeño.")); return; }
    const o = res as unknown as Overview;
    setData(o);
    setMode(o.settings.mode);
    setDataFrom(o.settings.data_from);
    setOfficialFrom(o.settings.official_from);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.rpc("kiru_perf_admin_overview", {}).then(({ data: res, error: err }) => {
      if (!alive) return;
      if (err) { setError(errorText(err, "No se pudo cargar el desempeño.")); return; }
      const o = res as unknown as Overview;
      setData(o);
      setMode(o.settings.mode);
      setDataFrom(o.settings.data_from);
      setOfficialFrom(o.settings.official_from);
    });
    return () => { alive = false; };
  }, []);

  const rules = data?.rules.find((r) => r.status === "aprobada");
  const indicators = useMemo(() => data?.indicators ?? [], [data]);

  async function saveSettings() {
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc("kiru_perf_update_settings", { p_mode: mode, p_data_from: dataFrom, p_official_from: officialFrom });
    setBusy(false);
    if (err) { setError(errorText(err)); return; }
    notify?.("Ajustes guardados.");
    load();
  }

  async function recompute() {
    setBusy(true); setError(null);
    const { data: res, error: err } = await supabase.rpc("kiru_perf_recompute", {});
    setBusy(false);
    if (err) { setError(errorText(err)); return; }
    const r = res as { calculado: boolean; motivo?: string; periodo?: string };
    notify?.(r.calculado ? `Recalculado: ${r.periodo}.` : r.motivo ?? "No se ha calculado nada.");
    load();
  }

  async function runPreview() {
    setBusy(true); setError(null);
    const { data: res, error: err } = await supabase.rpc("kiru_perf_preview", { p_from: from, p_to: to });
    setBusy(false);
    if (err) { setError(errorText(err)); return; }
    setPreview(((res as { mentors: MentorResult[] }).mentors) ?? []);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-[#FDFBF7] p-6">
        <h2 className="font-serif text-xl text-slate-900">Desempeño de mentores</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Fase 1: el motor de cálculo. Solo lo ves tú; ni mentores ni coordinación ven nada todavía.
          Por ahora se calculan solos los indicadores que ya tienen datos en el campus (B1, B3, B4, E1 y E2).
          Los demás llegan en las fases siguientes y, mientras tanto, aparecen como pendientes, nunca como cero.
          Sin información suficiente no hay nota final ni categoría.
        </p>
      </section>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {!data && !error && <p className="text-xs text-slate-500">Cargando…</p>}

      {data && (
        <>
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Modo y entrada en vigor</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-slate-600">Modo
                <select value={mode} onChange={(e) => setMode(e.target.value as PerfMode)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                  {(Object.keys(MODE_LABEL) as PerfMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-600">Cuentan datos desde
                <input type="date" value={dataFrom} onChange={(e) => setDataFrom(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800" />
              </label>
              <label className="text-xs text-slate-600">Consecuencias desde
                <input type="date" value={officialFrom} onChange={(e) => setOfficialFrom(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800" />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              En modo «Oculto» los mentores no ven «Mis evidencias» y no sale ningún recordatorio. Desde «Aprendizaje», ven sus entregas
              y empiezan los recordatorios; las puntuaciones siguen siendo solo tuyas. Nada anterior a «Cuentan datos desde» se tiene en cuenta.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={saveSettings} disabled={busy}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Guardar ajustes</button>
              <button onClick={recompute} disabled={busy}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Recalcular ahora</button>
            </div>
          </section>

          <AdminExemptions notify={notify} />

          {rules && <RulesCard version={rules.version} note={rules.note} rules={rules.rules} indicators={indicators} />}

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Trimestre en curso</h3>
            {!data.period ? (
              <p className="text-xs text-slate-600">
                Todavía no hay ningún trimestre calculado: el sistema empieza a contar el {fmtDate(data.settings.data_from)}.
                Mientras tanto puedes hacer un ensayo con datos reales aquí abajo.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-600">
                  {data.period.label} · provisional, se recalcula cada noche
                  {data.mentors[0]?.computed_at ? ` (último cálculo: ${fmtDate(data.mentors[0].computed_at)})` : ""}.
                </p>
                <div className="space-y-4">
                  {data.mentors.map((m) => <MentorCard key={m.mentor_id} m={m} indicators={indicators} rules={rules?.rules} />)}
                </div>
              </>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Ensayo con datos reales</h3>
              <p className="mt-1 text-xs text-slate-600">
                Calcula con las fechas que elijas y las reglas vigentes. No guarda nada ni cuenta para nadie: sirve para ver cómo funcionaría.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-600">Desde
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Hasta
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <button onClick={runPreview} disabled={busy}
                className="rounded-xl bg-[#5B6F8A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4E6079] disabled:opacity-50">Calcular ensayo</button>
            </div>
            {preview && preview.length === 0 && <p className="text-xs text-slate-500">No hay mentores.</p>}
            {preview && preview.map((m) => <MentorCard key={m.mentor_id} m={m} indicators={indicators} rules={rules?.rules} />)}
          </section>

          {data.events.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Historial</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {data.events.map((e) => (
                  <li key={e.id}>{fmtDate(e.created_at)} · {e.action === "ajustes" ? "Cambio de ajustes" : e.action === "recalculo" ? "Recálculo" : e.action}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RulesCard({ version, note, rules, indicators }: { version: number; note: string; rules: Rules; indicators: Indicator[] }) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Reglas vigentes · versión {version}</h3>
        <p className="mt-1 text-xs text-slate-600">{note}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {DIMS.map((d) => (
          <div key={d} className="rounded-xl border border-slate-100 bg-[#FDFBF7] p-4">
            <p className="text-sm font-semibold text-slate-800">{d}. {DIMENSION_LABEL[d]} <span className="font-normal text-slate-500">· {rules.dimensions[d]} %</span></p>
            <ul className="mt-2 space-y-1">
              {indicators.filter((i) => i.dimension === d && rules.indicators[i.code] !== undefined).map((i) => (
                <li key={i.code} className="flex items-baseline justify-between gap-3 text-xs text-slate-600">
                  <span><b className="text-slate-700">{i.code}</b> {i.name} <span className="text-slate-400">· {KIND_LABEL[i.kind]}{i.phase > 1 ? ` · fase ${i.phase}` : ""}</span></span>
                  <span className="shrink-0 tabular-nums">{rules.indicators[i.code]} %</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="rounded-xl border border-slate-100 bg-[#FDFBF7] p-4 text-xs leading-relaxed text-slate-600">
          <p className="text-sm font-semibold text-slate-800">Incidencias y cobertura</p>
          <p className="mt-2">Nota final = el menor entre (nota ponderada − restas) y el tope de la incidencia más grave.</p>
          <p>Leve −{rules.incidents.leve} (máximo −{rules.incidents.leve_max} por trimestre) · Grave −{rules.incidents.grave}, tope {rules.incidents.grave_cap} · Muy grave −{rules.incidents.muy_grave}, tope {rules.incidents.muy_grave_cap} y revisión de continuidad.</p>
          <p className="mt-2">Se publica la nota si tienen nota {rules.coverage.required.join(", ")}, al menos {rules.coverage.min_dimensions} de 5 dimensiones, {rules.coverage.total_min} % de cobertura y {rules.coverage.min_sessions} clases. Una dimensión tiene nota con el {rules.coverage.dimension_min} % de su peso con datos.</p>
        </div>
      </div>
    </section>
  );
}

function Bar({ value }: { value: number | null }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-[#ECE6DA]">
      {value !== null && <div className="h-1.5 rounded-full bg-[#6B7F99]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
    </div>
  );
}

function MentorCard({ m, indicators, rules }: { m: MentorResult; indicators: Indicator[]; rules?: Rules }) {
  const s = m.score;
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">{m.mentor_name}</h4>
        {s.publishable && s.final !== null ? (
          <p className="text-sm text-slate-800"><b className="tabular-nums">{fmtNumber(s.final)}</b> · {CATEGORY_LABEL[s.category ?? ""] ?? s.category}</p>
        ) : (
          <p className="text-xs text-slate-500">Pendiente de evaluación{s.performance !== null ? ` · nota parcial orientativa ${fmtNumber(s.performance)}` : ""}</p>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Cobertura {fmtNumber(s.coverage)} %{s.reasons.length > 0 ? ` · ${s.reasons.join(" · ")}` : ""}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        {DIMS.map((d) => (
          <div key={d}>
            <p className="text-[11px] text-slate-600">{d} · {s.dimensions[d]?.value !== null && s.dimensions[d]?.value !== undefined ? fmtNumber(s.dimensions[d].value) : "pendiente"}</p>
            <Bar value={s.dimensions[d]?.value ?? null} />
          </div>
        ))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">Ver indicadores</summary>
        <ul className="mt-2 divide-y divide-slate-100">
          {indicators.filter((i) => !rules || rules.indicators[i.code] !== undefined).map((i) => {
            const v = m.values[i.code];
            return (
              <li key={i.code} className="py-2 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-slate-700"><b>{i.code}</b> {i.name}</span>
                  <span className={v?.status === "calculado" ? "tabular-nums text-slate-900" : "text-slate-400"}>{statusText(v, i.phase)}</span>
                </div>
                {v && v.total > 0 && <p className="text-[11px] text-slate-500">{v.ok} de {v.total} cumplidos</p>}
                {v && <DetailLine detail={v.detail} />}
              </li>
            );
          })}
        </ul>
      </details>
    </article>
  );
}

function DetailLine({ detail }: { detail: Record<string, unknown> }) {
  const parts = Object.entries(detail)
    .filter(([k, val]) => DETAIL_LABEL[k] && typeof val === "number" && val > 0)
    .map(([k, val]) => `${val} ${DETAIL_LABEL[k]}`);
  if (parts.length === 0) return null;
  return <p className="text-[11px] text-slate-500">{parts.join(" · ")}</p>;
}
