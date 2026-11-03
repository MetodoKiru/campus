"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  APPLICATION_STATUSES, APPLICATION_STATUS_LABEL, AREA_LABEL, OPPORTUNITY_AREAS, OPPORTUNITY_STATUS_LABEL, formatDay,
  type AdminOpportunity, type ApplicationStatus, type OpportunityArea, type OpportunityStatus,
} from "@/lib/growth";

type Notify = (text: string, type: "success" | "error") => void;
type Application = { id: string; opportunityId: string; mentorId: string; mentorName: string; motivation: string; status: ApplicationStatus; submittedAt: string; statusChangedAt: string };
type Recommendation = { id: string; opportunityId: string; mentorName: string; coordinatorName: string; note: string; createdAt: string };
type Data = { opportunities: AdminOpportunity[]; applications: Application[]; recommendations: Recommendation[] };

type Form = {
  title: string; area: OpportunityArea | ""; description: string; functions: string; requirements: string;
  dedication: string; modality: string; remuneration: string; remunerationAuthorized: boolean; positionsCount: string; deadline: string;
};
const EMPTY: Form = { title: "", area: "", description: "", functions: "", requirements: "", dedication: "", modality: "", remuneration: "", remunerationAuthorized: false, positionsCount: "", deadline: "" };

const input = "w-full rounded-2xl border border-slate-200 bg-[#F7F6F3] p-3 text-xs text-slate-900 focus:outline-none";
const label = "block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1";
const button = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const darkButton = "rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50";

const STATUS_STYLE: Record<OpportunityStatus, string> = {
  borrador: "bg-slate-100 text-slate-600",
  publicada: "bg-emerald-100 text-emerald-800",
  cerrada: "bg-rose-50 text-rose-700",
  completada: "bg-slate-200 text-slate-700",
};

/**
 * «Crece con Kiru» en administración: crear, editar, publicar y cerrar
 * oportunidades reales, y gestionar candidaturas y recomendaciones.
 * No hay oportunidades de ejemplo: la lista empieza vacía.
 */
export default function AdminOpportunities({ notify }: { notify: Notify }) {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const response = await fetch(path, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Ha ocurrido un error.");
    return result;
  }, []);
  const load = useCallback(async () => {
    try { setData(await api("/api/admin/oportunidades") as Data); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudieron cargar las oportunidades.", "error"); }
  }, [api, notify]);
  useEffect(() => {
    let alive = true;
    api("/api/admin/oportunidades")
      .then((result) => { if (alive) setData(result as Data); })
      .catch((e) => { if (alive) notify(e instanceof Error ? e.message : "No se pudieron cargar las oportunidades.", "error"); });
    return () => { alive = false; };
  }, [api, notify]);

  const run = async (action: () => Promise<unknown>, ok: string) => {
    if (busy) return false;
    setBusy(true);
    try { await action(); await load(); notify(ok, "success"); return true; }
    catch (e) { notify(e instanceof Error ? e.message : "Ha ocurrido un error.", "error"); return false; }
    finally { setBusy(false); }
  };

  const save = async (publish: boolean) => {
    if (!editing) return;
    const ok = editing.id
      ? await run(() => api(`/api/admin/oportunidades/${editing.id}`, { method: "PATCH", body: { action: "editar", ...editing.form } }), "Oportunidad guardada.")
      : await run(() => api("/api/admin/oportunidades", { method: "POST", body: { ...editing.form, publish } }), publish ? "Oportunidad publicada. Ya la ven los mentores." : "Guardada como borrador (no la ve nadie).");
    if (ok) setEditing(null);
  };
  const act = (o: AdminOpportunity, action: "publicar" | "cerrar" | "reabrir" | "completar", ok: string) =>
    run(() => api(`/api/admin/oportunidades/${o.id}`, { method: "PATCH", body: { action } }), ok);

  if (!data) return <p className="rounded-3xl border border-slate-100 bg-white p-5 text-sm text-slate-500">Cargando…</p>;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg text-slate-900">Crece con Kiru · Oportunidades internas</h2>
            <p className="mt-1 text-[11px] text-slate-500">Publica solo responsabilidades reales. Mientras no haya ninguna publicada, los mentores ven «Actualmente no hay oportunidades disponibles». La remuneración solo se enseña si marcas que está autorizada.</p>
          </div>
          {!editing && <button type="button" onClick={() => setEditing({ id: null, form: EMPTY })} className={darkButton}>Nueva oportunidad</button>}
        </div>

        {editing && <OpportunityForm value={editing.form} isNew={!editing.id} busy={busy} onChange={(form) => setEditing({ ...editing, form })} onSave={save} onCancel={() => setEditing(null)} />}

        {data.opportunities.length === 0 && !editing && <p className="rounded-2xl bg-[#F7F6F3] p-4 text-xs text-slate-500">No hay oportunidades creadas.</p>}
        {data.opportunities.map((o) => {
          const applications = data.applications.filter((a) => a.opportunityId === o.id);
          const recommendations = data.recommendations.filter((r) => r.opportunityId === o.id);
          return (
            <article key={o.id} className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{o.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {AREA_LABEL[o.area] ?? o.area}
                    {o.positionsCount === null ? " · personas buscadas sin definir" : ` · ${o.positionsCount} ${o.positionsCount === 1 ? "persona" : "personas"} buscadas`}
                    {o.deadline ? ` · plazo hasta el ${formatDay(o.deadline)}` : " · sin fecha límite"}
                    {o.status === "publicada" && !o.open ? " · fuera de plazo (ya no admite candidaturas)" : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[o.status]}`}>{OPPORTUNITY_STATUS_LABEL[o.status]}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => setEditing({ id: o.id, form: { title: o.title, area: o.area, description: o.description, functions: o.functions, requirements: o.requirements, dedication: o.dedication, modality: o.modality, remuneration: o.remuneration, remunerationAuthorized: o.remunerationAuthorized, positionsCount: o.positionsCount === null ? "" : String(o.positionsCount), deadline: o.deadline ?? "" } })} className={button}>Editar</button>
                {o.status === "borrador" && <button type="button" disabled={busy} onClick={() => act(o, "publicar", "Oportunidad publicada.")} className={darkButton}>Publicar</button>}
                {o.status === "publicada" && <button type="button" disabled={busy} onClick={() => act(o, "cerrar", "Oportunidad cerrada.")} className={button}>Cerrar</button>}
                {o.status === "cerrada" && <button type="button" disabled={busy} onClick={() => act(o, "reabrir", "Oportunidad publicada de nuevo.")} className={button}>Volver a publicar</button>}
                {(o.status === "publicada" || o.status === "cerrada") && <button type="button" disabled={busy} onClick={() => { if (window.confirm("¿Marcar esta oportunidad como completada? Se conservarán sus candidaturas e historial.")) void act(o, "completar", "Oportunidad marcada como completada."); }} className={button}>Marcar completada</button>}
                {o.status === "borrador" && applications.length === 0 && (
                  <button type="button" disabled={busy} onClick={() => { if (window.confirm("¿Borrar este borrador?")) void run(() => api(`/api/admin/oportunidades/${o.id}`, { method: "DELETE" }), "Borrador eliminado."); }} className={button}>Borrar borrador</button>
                )}
              </div>

              {recommendations.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Recomendaciones de coordinación</p>
                  {recommendations.map((r) => (
                    <p key={r.id} className="rounded-xl bg-[#F7F6F3] p-2 text-[11px] text-slate-600"><strong>{r.coordinatorName}</strong> recomienda a <strong>{r.mentorName}</strong> ({formatDay(r.createdAt)}): {r.note}</p>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Candidaturas ({applications.length})</p>
                {applications.length === 0 && <p className="text-[11px] text-slate-400">Ninguna todavía.</p>}
                {applications.map((a) => (
                  <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-[#F7F6F3] p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{a.mentorName}</p>
                      <p className="text-[11px] text-slate-500">Enviada el {formatDay(a.submittedAt)}</p>
                      {a.motivation && <p className="mt-1 whitespace-pre-line text-[11px] text-slate-600">{a.motivation}</p>}
                    </div>
                    <select
                      value={a.status}
                      disabled={busy}
                      aria-label={`Estado de la candidatura de ${a.mentorName}`}
                      onChange={(e) => void run(() => api(`/api/admin/candidaturas/${a.id}`, { method: "PATCH", body: { status: e.target.value } }), "Estado actualizado. El mentor lo ve en su panel.")}
                      className="rounded-xl border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-700"
                    >
                      {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{APPLICATION_STATUS_LABEL[s]}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function OpportunityForm({ value, isNew, busy, onChange, onSave, onCancel }: {
  value: Form; isNew: boolean; busy: boolean;
  onChange: (form: Form) => void; onSave: (publish: boolean) => void; onCancel: () => void;
}) {
  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label}>Nombre del puesto o responsabilidad</label><input value={value.title} onChange={set("title")} maxLength={160} className={input} /></div>
        <div>
          <label className={label}>Área</label>
          <select value={value.area} onChange={set("area")} className={input}>
            <option value="">Elige el área</option>
            {OPPORTUNITY_AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
      </div>
      <div><label className={label}>Descripción</label><textarea value={value.description} onChange={set("description")} rows={3} maxLength={4000} className={input} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label}>Funciones</label><textarea value={value.functions} onChange={set("functions")} rows={3} maxLength={4000} className={input} /></div>
        <div><label className={label}>Requisitos</label><textarea value={value.requirements} onChange={set("requirements")} rows={3} maxLength={4000} className={input} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><label className={label}>Personas buscadas</label><input type="number" min={1} max={100} step={1} value={value.positionsCount} onChange={set("positionsCount")} placeholder="Sin definir" className={input} /></div>
        <div><label className={label}>Dedicación aproximada</label><input value={value.dedication} onChange={set("dedication")} maxLength={200} className={input} /></div>
        <div><label className={label}>Modalidad</label><input value={value.modality} onChange={set("modality")} maxLength={200} className={input} /></div>
        <div><label className={label}>Fecha límite para candidaturas</label><input type="date" value={value.deadline} onChange={set("deadline")} className={input} /></div>
      </div>
      <div className="space-y-2 rounded-2xl bg-[#F7F6F3] p-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={value.remunerationAuthorized} onChange={(e) => onChange({ ...value, remunerationAuthorized: e.target.checked })} />
          La remuneración está autorizada y definida (si no, no se enseña)
        </label>
        {value.remunerationAuthorized && <input value={value.remuneration} onChange={set("remuneration")} maxLength={300} placeholder="Remuneración" className={input} />}
      </div>
      <div className="flex flex-wrap gap-2">
        {isNew && <button type="button" disabled={busy} onClick={() => onSave(true)} className={darkButton}>Publicar</button>}
        <button type="button" disabled={busy} onClick={() => onSave(false)} className={isNew ? button : darkButton}>{isNew ? "Guardar como borrador" : "Guardar cambios"}</button>
        <button type="button" disabled={busy} onClick={onCancel} className={button}>Cancelar</button>
      </div>
    </div>
  );
}
