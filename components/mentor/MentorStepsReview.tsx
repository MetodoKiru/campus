"use client";

import { useCallback, useEffect, useState } from "react";
import { STATUS_LABEL, type StepStatus } from "@/lib/mentor-steps";

type Item = {
  mentorId: string;
  mentorName: string;
  username: string | null;
  step: "certificado" | "nuestro_equipo";
  status: StepStatus;
  submittedAt: string | null;
  note: string;
  hasDocument: boolean;
  holderName: string;
};

const STEP_LABEL = { certificado: "Certificado de delitos sexuales", nuestro_equipo: "Formulario «Nuestro Equipo»" };

/**
 * Bloque del panel del formador (también entra administración): lo que los
 * mentores han marcado como enviado en su menú y espera revisión.
 */
export default function MentorStepsReview({ api, notify }: {
  api: (path: string, init?: RequestInit) => Promise<{ items?: Item[]; url?: string }>;
  notify: (text: string, type: "success" | "error") => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const result = await api("/api/formador/pasos"); setItems(Array.isArray(result.items) ? result.items : []); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudieron cargar los pasos pendientes.", "error"); }
  }, [api, notify]);
  useEffect(() => {
    let alive = true;
    api("/api/formador/pasos")
      .then((result) => { if (alive) setItems(Array.isArray(result.items) ? result.items : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [api]);

  const review = async (item: Item, status: "completado" | "requiere_correccion") => {
    const key = `${item.mentorId}:${item.step}`;
    setBusy(true);
    try {
      await api("/api/formador/pasos", { method: "POST", body: JSON.stringify({ mentorId: item.mentorId, step: item.step, status, note: notes[key] ?? "" }) });
      notify(status === "completado" ? "Marcado como completado." : "Se ha pedido la corrección al mentor.", "success");
      await load();
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo guardar la revisión.", "error"); }
    finally { setBusy(false); }
  };

  const openCertificate = async (item: Item) => {
    // La pestaña se abre antes de pedir el enlace para que el navegador no la bloquee.
    const tab = window.open("", "_blank");
    try {
      const { url } = await api(`/api/formador/pasos/certificado?mentorId=${item.mentorId}`);
      if (!url) throw new Error("No se pudo abrir el PDF.");
      if (tab) { tab.opener = null; tab.location.replace(url); } else window.location.assign(url);
    } catch (e) {
      tab?.close();
      notify(e instanceof Error ? e.message : "No se pudo abrir el PDF.", "error");
    }
  };

  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-lg font-bold text-slate-900">Pasos de mentores para revisar ({items.length})</h2>
      {items.map((item) => {
        const key = `${item.mentorId}:${item.step}`;
        return (
          <article key={key} className="bg-white rounded-2xl border border-[#E7E3DC] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">{item.mentorName}{item.username ? <span className="font-normal text-slate-400"> · @{item.username}</span> : null}</p>
                <p className="text-xs text-slate-500">{STEP_LABEL[item.step]}{item.submittedAt ? ` · enviado el ${new Date(item.submittedAt).toLocaleDateString("es-ES")}` : ""}</p>
              </div>
              <span className="rounded-full border border-[#E4D8C5] bg-[#F3EEE5] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#806C50]">{STATUS_LABEL[item.status]}</span>
            </div>
            {item.step === "certificado" && item.holderName && (
              <p className="text-xs text-slate-500">Nombre en el certificado, según el mentor: <span className="font-semibold text-slate-700">{item.holderName}</span>. Comprueba que coincide con el PDF.</p>
            )}
            {item.step === "certificado" && (item.hasDocument ? (
              <button type="button" onClick={() => openCertificate(item)} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Ver el PDF del certificado</button>
            ) : (
              <p className="text-xs text-slate-500">Lo entregó fuera del campus: búscalo en «Documentación de incorporación».</p>
            ))}
            {item.step === "nuestro_equipo" && (
              <p className="text-xs text-slate-500">Comprueba su respuesta en la hoja «Nuestro Equipo (respuestas)» y, si está bien, publícala como siempre.</p>
            )}
            <input
              value={notes[key] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
              maxLength={1000}
              placeholder="Motivo, si hay que corregir algo (lo verá el mentor)"
              className="w-full p-2.5 rounded-xl border border-slate-200 bg-[#F7F6F3] text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => review(item, "completado")} className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Marcar completado</button>
              <button disabled={busy} onClick={() => review(item, "requiere_correccion")} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Requiere corrección</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
