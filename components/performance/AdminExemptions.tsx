"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EvidenceExemptionRow, MaterialEvidenceRow } from "@/lib/database.types";
import { EVIDENCE_KIND_LABEL, EXEMPTION_CAUSE_LABEL, bimesterLabel, errorMessage, fmtDay } from "@/lib/desempeno";

type Item = EvidenceExemptionRow & { evidence: MaterialEvidenceRow | null };
type Loaded = { items: Item[]; names: Record<string, string> };

async function fetchExemptions(): Promise<Loaded> {
  const { data, error } = await supabase.from("kiru_evidence_exemptions").select("*").eq("status", "propuesta").order("created_at");
  if (error) throw error;
  const rows = (data ?? []) as EvidenceExemptionRow[];
  const evIds = rows.map((r) => r.evidence_id);
  const { data: evRows } = evIds.length ? await supabase.from("kiru_material_evidence").select("*").in("id", evIds) : { data: [] };
  const evidence = (evRows ?? []) as MaterialEvidenceRow[];
  const people = [...new Set([...evidence.flatMap((e) => [e.mentor_id, e.student_id]), ...rows.map((r) => r.proposed_by).filter((x): x is string => !!x)])];
  const { data: profiles } = people.length ? await supabase.from("profiles").select("id,full_name").in("id", people) : { data: [] };
  return {
    items: rows.map((r) => ({ ...r, evidence: evidence.find((e) => e.id === r.evidence_id) ?? null })),
    names: Object.fromEntries(((profiles ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])),
  };
}

/**
 * Exenciones de evidencias por aprobar (solo Administración). Se pueden aprobar o
 * rechazar varias a la vez, por ejemplo todas las de «material no disponible».
 */
export default function AdminExemptions({ notify }: { notify?: (msg: string) => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchExemptions().then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setError(errorMessage(e, "No se pudieron cargar las exenciones.")); });
    return () => { alive = false; };
  }, []);
  const reload = useCallback(async () => {
    try { setData(await fetchExemptions()); setSelected(new Set()); } catch (e) { setError(errorMessage(e, "No se pudieron cargar las exenciones.")); }
  }, []);

  const causes = useMemo(() => [...new Set((data?.items ?? []).map((i) => i.cause))], [data]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    const { data: count, error: rpcError } = await supabase.rpc("kiru_evidence_exemption_decide", { p_ids: [...selected], p_approve: approve, p_note: note });
    setBusy(false);
    if (rpcError) { setError(errorMessage(rpcError, "No se pudo guardar.")); return; }
    notify?.(`${count ?? 0} exención${count === 1 ? "" : "es"} ${approve ? "aprobada" : "rechazada"}${count === 1 ? "" : "s"}.`);
    setNote("");
    await reload();
  };

  if (!data && !error) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Exenciones de evidencias por aprobar {data && data.items.length > 0 ? `(${data.items.length})` : ""}</h3>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {data && data.items.length === 0 && <p className="text-xs text-slate-500">No hay ninguna propuesta pendiente.</p>}
      {data && data.items.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="text-slate-500">Seleccionar:</span>
            <button onClick={() => setSelected(new Set(data.items.map((i) => i.id)))} className="font-semibold text-slate-600 hover:text-slate-900">todas</button>
            {causes.map((c) => (
              <button key={c} onClick={() => setSelected(new Set(data.items.filter((i) => i.cause === c).map((i) => i.id)))} className="font-semibold text-slate-600 hover:text-slate-900">
                {EXEMPTION_CAUSE_LABEL[c].toLowerCase()}
              </button>
            ))}
            <button onClick={() => setSelected(new Set())} className="font-semibold text-slate-400 hover:text-slate-700">ninguna</button>
          </div>
          <ul className="space-y-2">
            {data.items.map((i) => (
              <li key={i.id}>
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-xs cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" className="mt-0.5" checked={selected.has(i.id)}
                    onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(i.id); else next.delete(i.id); setSelected(next); }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-800">
                      {i.evidence ? `${data.names[i.evidence.mentor_id] ?? "Mentor"} · ${EVIDENCE_KIND_LABEL[i.evidence.kind]} de ${data.names[i.evidence.student_id]?.split(" ")[0] ?? "alumno"} · bimestre ${bimesterLabel(i.evidence)}` : "Entrega"}
                    </span>
                    <span className="block text-slate-500">{EXEMPTION_CAUSE_LABEL[i.cause]} · propuesta por {data.names[i.proposed_by ?? ""] ?? "—"} ({i.proposed_role === "mentor" ? "mentor" : "coordinación"}) el {fmtDay(i.created_at)}</span>
                    <span className="mt-1 block text-slate-700">{i.note}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Nota (opcional), la verán el mentor y quien la propuso"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs" />
            <button disabled={busy || selected.size === 0} onClick={() => void decide(true)}
              className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Aprobar ({selected.size})</button>
            <button disabled={busy || selected.size === 0} onClick={() => void decide(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Rechazar</button>
          </div>
        </>
      )}
    </section>
  );
}
