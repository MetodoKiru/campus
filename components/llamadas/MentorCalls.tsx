"use client";

import { ExternalLink, Phone, Video } from "lucide-react";
import { card, subtle } from "@/components/classes/shared";
import { callWhen, type MentorCallsPayload } from "@/lib/llamadas";
import { useCalls } from "./api";

/**
 * Panel del mentor: sus llamadas con las familias (semanas 1 y 4) y, si aún no lo ha
 * hecho, el aviso para rellenar su disponibilidad para llamadas.
 */
export default function MentorCalls() {
  const { data } = useCalls<MentorCallsPayload>();
  if (!data) return null;
  const next = data.calls.filter((c) => c.status === "programada").slice(0, 4);
  if (data.answeredAt && !next.length) return null;
  return (
    <section className={`${card} space-y-3 ${data.answeredAt ? "" : "border-2 border-[#E4D8C5]"}`} aria-label="Llamadas con familias">
      <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><Video className="h-5 w-5" /> Llamadas con las familias</h3>
      {!data.answeredAt && (
        <>
          <p className="text-xs leading-relaxed text-[#45433F]">Cada semana hacemos una llamada de 20 minutos con cada familia; tú te unes en la 1.ª y la 4.ª semana de cada ciclo. Marca cuándo puedes y el campus buscará la hora con la familia y tu coordinador.</p>
          <a href={data.formUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-[#242321] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3A3835]">
            Mi disponibilidad para llamadas <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </>
      )}
      {next.map((c) => (
        <div key={c.id} className={`${subtle} flex flex-wrap items-center justify-between gap-2 text-xs`}>
          <span className="text-[#292825]"><b className="capitalize">{callWhen(c.scheduledStart)}</b> · familia de {c.studentName.split(" ")[0]} · con {c.coordinatorName || "tu coordinador"}</span>
          {c.medium === "zoom" && c.zoomUrl
            ? <a href={c.zoomUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-[#E7E3DC] bg-white px-3 py-1.5 font-semibold text-[#45433F]"><Video className="h-3.5 w-3.5" /> Zoom</a>
            : c.medium === "telefono" ? <span className="inline-flex items-center gap-1 text-[#77736B]"><Phone className="h-3.5 w-3.5" /> Por teléfono (te une el coordinador)</span> : null}
        </div>
      ))}
      {data.answeredAt && (
        <p className="text-[11px] text-[#77736B]">¿Te ha cambiado la disponibilidad? <a href={data.formUrl} target="_blank" rel="noopener noreferrer" className="underline">Actualízala</a>.</p>
      )}
    </section>
  );
}
