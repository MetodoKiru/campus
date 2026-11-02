"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { call } from "@/components/mentor/MentorSteps";
import {
  APPLICATION_STATUS_LABEL, AREA_LABEL, formatDay,
  type ApplicationStatus, type MentorApplication, type MentorGrowthData, type Opportunity,
} from "@/lib/growth";

const primaryButton = "inline-flex items-center gap-1.5 rounded-xl bg-[#242321] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#3A3835] disabled:opacity-50";
const secondaryButton = "inline-flex items-center gap-1.5 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] px-4 py-2.5 text-xs font-bold text-[#45433F] transition hover:bg-[#F3F0EA] disabled:opacity-50";

const APPLICATION_STYLE: Record<ApplicationStatus, string> = {
  enviada: "bg-[#FAF8F5] text-[#77736B] border-[#E7E3DC]",
  en_revision: "bg-[#F3EEE5] text-[#806C50] border-[#E4D8C5]",
  entrevista: "bg-[#F3EEE5] text-[#806C50] border-[#E4D8C5]",
  aceptada: "bg-[#242321] text-white border-[#242321]",
  no_seleccionada: "bg-white text-[#77736B] border-[#E7E3DC]",
};

/** Pide un archivo de la guía con la sesión del mentor (no es una ruta pública). */
async function guideBlob(part: "pdf" | "1" | "2"): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
  const response = await fetch(`/api/mentor/crece/guia?parte=${part}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  if (!response.ok) throw new Error("No se pudo abrir la guía.");
  return response.blob();
}

/**
 * «Crece con Kiru» (menú ☰ del mentor): la guía «Crecer en Kiru» tal como la
 * preparó dirección, las oportunidades internas que publica administración y
 * el estado de las candidaturas del mentor.
 */
export default function GrowWithKiru({ notify }: { notify: (text: string) => void }) {
  const [data, setData] = useState<MentorGrowthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await call<MentorGrowthData>("/api/mentor/crece")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar las oportunidades."); }
  }, []);
  useEffect(() => {
    let alive = true;
    call<MentorGrowthData>("/api/mentor/crece")
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "No se pudieron cargar las oportunidades."); });
    return () => { alive = false; };
  }, []);

  const appliedTo = new Map((data?.applications ?? []).map((a) => [a.opportunityId, a]));

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-3xl border border-[#E7E3DC] bg-white p-6 shadow-xs sm:p-8">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C50]">Desarrollo del equipo</span>
          <h2 className="mt-0.5 font-serif text-xl font-bold text-[#292825]">Crece con Kiru</h2>
        </div>
        <Guide notify={notify} />
      </section>

      <section className="space-y-5 rounded-3xl border border-[#E7E3DC] bg-white p-6 shadow-xs sm:p-8">
        <div>
          <h2 className="font-serif text-xl font-bold text-[#292825]">Oportunidades internas</h2>
          <p className="mt-1 text-xs text-[#77736B]">Responsabilidades que Método Kiru necesita cubrir ahora mismo. Cada una depende de las necesidades reales de Kiru; presentarte no supone un ascenso automático.</p>
        </div>
        {error && <p className="rounded-2xl border border-[#D9B3AA] bg-white p-4 text-xs text-[#9A4B3F]">{error}</p>}
        {!data && !error && <p className="text-xs text-[#77736B]">Cargando…</p>}
        {data && data.opportunities.length === 0 && (
          <p className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-xs text-[#555149]">Actualmente no hay oportunidades disponibles. Si te gustaría asumir algo nuevo, cuéntaselo a tu coordinador.</p>
        )}
        {data?.opportunities.map((opportunity) => (
          <OpportunityCard key={opportunity.id} opportunity={opportunity} application={appliedTo.get(opportunity.id) ?? null} reload={load} notify={notify} />
        ))}
      </section>

      {data && data.applications.length > 0 && (
        <section className="space-y-4 rounded-3xl border border-[#E7E3DC] bg-white p-6 shadow-xs sm:p-8">
          <h2 className="font-serif text-xl font-bold text-[#292825]">Mis candidaturas</h2>
          <ul className="space-y-2">
            {data.applications.map((application) => <ApplicationRow key={application.id} application={application} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function Guide({ notify }: { notify: (text: string) => void }) {
  const [pages, setPages] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    Promise.all((["1", "2"] as const).map(guideBlob))
      .then((blobs) => {
        for (const blob of blobs) urls.push(URL.createObjectURL(blob));
        if (alive) setPages(urls); else urls.forEach((u) => URL.revokeObjectURL(u));
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      const url = URL.createObjectURL(await guideBlob("pdf"));
      const link = document.createElement("a");
      link.href = url;
      link.download = "Crecer en Kiru - Metodo Kiru.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo descargar la guía."); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#555149]">Guía «Crecer en Kiru»</h3>
        <button type="button" disabled={busy} onClick={download} className={secondaryButton}>
          <Download className="h-3.5 w-3.5" /> {busy ? "Preparando…" : "Descargar la guía (PDF)"}
        </button>
      </div>
      {failed && <p className="rounded-2xl border border-[#D9B3AA] bg-white p-4 text-xs text-[#9A4B3F]">No se pudo cargar la guía. Prueba a descargarla en PDF.</p>}
      {!failed && pages.length === 0 && <p className="text-xs text-[#77736B]">Cargando la guía…</p>}
      <div className="space-y-3">
        {pages.map((url, index) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" title="Abrir la página en grande" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida con sesión (blob:) */}
            <img src={url} alt={`Guía «Crecer en Kiru», página ${index + 1} de ${pages.length}`} className="w-full rounded-2xl border border-[#E7E3DC]" />
          </a>
        ))}
      </div>
    </div>
  );
}

function OpportunityCard({ opportunity, application, reload, notify }: {
  opportunity: Opportunity;
  application: MentorApplication | null;
  reload: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [applying, setApplying] = useState(false);
  const [motivation, setMotivation] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setBusy(true);
    try {
      await call("/api/mentor/crece", { method: "POST", body: { opportunityId: opportunity.id, motivation } });
      setApplying(false);
      await reload();
      notify("Candidatura enviada. Aquí verás en qué estado está.");
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo enviar tu candidatura."); }
    finally { setBusy(false); }
  };

  const rows: [string, string][] = [
    ["Área", AREA_LABEL[opportunity.area] ?? opportunity.area],
    ["Descripción", opportunity.description],
    ["Funciones", opportunity.functions],
    ["Requisitos", opportunity.requirements],
    ["Dedicación aproximada", opportunity.dedication],
    ["Modalidad", opportunity.modality],
    ["Remuneración", opportunity.remuneration],
    ["Fecha límite para presentarte", opportunity.deadline ? formatDay(opportunity.deadline) : ""],
  ];

  return (
    <article className={`space-y-4 rounded-2xl border p-4 sm:p-5 ${opportunity.open ? "border-[#D9C8AE] bg-white" : "border-[#E7E3DC] bg-[#FAF8F5]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-serif text-lg font-bold text-[#292825]">{opportunity.title}</h3>
        <span className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${opportunity.open ? "border-[#E4D8C5] bg-[#F3EEE5] text-[#806C50]" : "border-[#E7E3DC] bg-white text-[#77736B]"}`}>
          {opportunity.open ? "Abierta" : "Plazo cerrado"}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-xs font-semibold text-[#77736B]">{label}</dt>
            <dd className="whitespace-pre-line text-[#292825]">{value}</dd>
          </div>
        ))}
      </dl>
      {application ? (
        <p className="text-xs text-[#555149]">Te presentaste el {formatDay(application.submittedAt)}. Estado: <strong className="font-semibold">{APPLICATION_STATUS_LABEL[application.status]}</strong>.</p>
      ) : !opportunity.open ? (
        <p className="text-xs text-[#77736B]">El plazo para presentarse ha terminado.</p>
      ) : applying ? (
        <div className="space-y-2">
          <label htmlFor={`motivacion-${opportunity.id}`} className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Motivación o información adicional (opcional)</label>
          <textarea id={`motivacion-${opportunity.id}`} value={motivation} onChange={(e) => setMotivation(e.target.value)} maxLength={2000} rows={4}
            placeholder="Cuéntanos brevemente por qué te interesa y qué disponibilidad tendrías."
            className="w-full rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] p-2.5 text-xs text-[#45433F] focus:outline-none" />
          <p className="text-[11px] text-[#77736B]">La candidatura va con tu nombre de la cuenta del campus y la fecha de hoy. Solo puedes presentarte una vez a cada oportunidad.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={apply} className={primaryButton}>{busy ? "Enviando…" : "Enviar candidatura"}</button>
            <button type="button" disabled={busy} onClick={() => setApplying(false)} className={secondaryButton}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setApplying(true)} className={primaryButton}>Presentar candidatura</button>
      )}
    </article>
  );
}

function ApplicationRow({ application }: { application: MentorApplication }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#292825]">{application.opportunityTitle}</p>
        <p className="text-[11px] text-[#77736B]">Enviada el {formatDay(application.submittedAt)}{application.status !== "enviada" ? ` · actualizada el ${formatDay(application.statusChangedAt)}` : ""}</p>
      </div>
      <span className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${APPLICATION_STYLE[application.status]}`}>{APPLICATION_STATUS_LABEL[application.status]}</span>
    </li>
  );
}
