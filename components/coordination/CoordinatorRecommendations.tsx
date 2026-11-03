"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AREA_LABEL, formatDay, type Opportunity } from "@/lib/growth";

type Notify = (text: string, type: "success" | "error") => void;
type Data = {
  opportunities: Opportunity[];
  mentors: { id: string; name: string }[];
  recommendations: { id: string; opportunityId: string; mentorId: string; note: string; createdAt: string }[];
};

const input = "w-full rounded-xl border border-slate-200 bg-[#F7F6F3] p-2.5 text-xs text-slate-800 focus:outline-none";

/**
 * «Crece con Kiru» para el coordinador: ve las oportunidades publicadas y
 * recomienda a mentores de su grupo. No publica ni decide candidaturas: eso
 * es de administración.
 */
export default function CoordinatorRecommendations({ notify }: { notify: Notify }) {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<{ opportunityId: string; mentorId: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (init?: { method: string; body: unknown }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const response = await fetch("/api/coordinador/oportunidades", {
      method: init?.method ?? "GET",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: init ? JSON.stringify(init.body) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Ha ocurrido un error.");
    return result;
  }, []);
  const load = useCallback(async () => {
    try { setData(await api() as Data); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudieron cargar las oportunidades.", "error"); }
  }, [api, notify]);
  useEffect(() => {
    let alive = true;
    api()
      .then((result) => { if (alive) setData(result as Data); })
      .catch((e) => { if (alive) notify(e instanceof Error ? e.message : "No se pudieron cargar las oportunidades.", "error"); });
    return () => { alive = false; };
  }, [api, notify]);

  const send = async () => {
    if (!form) return;
    setBusy(true);
    try { await api({ method: "POST", body: form }); setForm(null); await load(); notify("Recomendación enviada a administración.", "success"); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudo guardar la recomendación.", "error"); }
    finally { setBusy(false); }
  };

  if (!data) return <p className="rounded-3xl border border-[#E7E3DC] bg-white p-5 text-sm text-slate-500">Cargando oportunidades…</p>;
  const mentorName = new Map(data.mentors.map((m) => [m.id, m.name]));

  return (
    <section className="space-y-4 rounded-3xl border border-[#E7E3DC] bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="font-serif text-lg font-bold text-slate-900">Crece con Kiru: recomendar mentores</h2>
        <p className="mt-1 text-xs text-slate-500">Oportunidades que ha publicado administración. Puedes recomendar a mentores de tu grupo; administración revisa las candidaturas y decide.</p>
      </div>
      {data.opportunities.length === 0 && <p className="rounded-2xl bg-[#F7F6F3] p-4 text-xs text-slate-500">Actualmente no hay oportunidades publicadas.</p>}
      {data.opportunities.map((o) => {
        const mine = data.recommendations.filter((r) => r.opportunityId === o.id);
        const open = form?.opportunityId === o.id;
        return (
          <article key={o.id} className="space-y-2 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">{o.title}</p>
                <p className="text-[11px] text-slate-500">{AREA_LABEL[o.area] ?? o.area}{o.deadline ? ` · plazo hasta el ${formatDay(o.deadline)}` : ""}{o.open ? "" : " · plazo cerrado"}</p>
              </div>
              {!open && data.mentors.length > 0 && (
                <button type="button" onClick={() => setForm({ opportunityId: o.id, mentorId: data.mentors[0].id, note: "" })} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Recomendar a un mentor</button>
              )}
            </div>
            {o.description && <p className="whitespace-pre-line text-xs text-slate-600">{o.description}</p>}
            {mine.map((r) => (
              <p key={r.id} className="rounded-xl bg-[#F7F6F3] p-2 text-[11px] text-slate-600">Recomendaste a <strong>{mentorName.get(r.mentorId) ?? "un mentor"}</strong> el {formatDay(r.createdAt)}: {r.note}</p>
            ))}
            {open && form && (
              <div className="space-y-2 rounded-2xl bg-[#F7F6F3] p-3">
                <select value={form.mentorId} onChange={(e) => setForm({ ...form, mentorId: e.target.value })} className={input}>
                  {data.mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} maxLength={1000} placeholder="Por qué lo recomiendas (compromiso, responsabilidad, iniciativa…)" className={input} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={send} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50">Enviar recomendación</button>
                  <button type="button" disabled={busy} onClick={() => setForm(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
