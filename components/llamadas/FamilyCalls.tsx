"use client";

import { useState } from "react";
import { Phone, Video } from "lucide-react";
import { card, subtle } from "@/components/classes/shared";
import { callWhen, type FamilyCallsPayload } from "@/lib/llamadas";
import { callAction, useCalls } from "./api";

type Notify = (text: string, type: "success" | "error") => void;

/**
 * Panel de padres: la llamada semanal de seguimiento.
 * · Sin formulario: no se muestra; lo pide el paso 1 de los primeros pasos de la familia.
 * · Con hora: la hora fija, las próximas llamadas (quién está) y «Mover esta semana» a otra hora libre.
 */
export default function FamilyCalls({ studentId, notify }: { studentId: string; notify: Notify }) {
  const { data, reload } = useCalls<FamilyCallsPayload>();
  const [moving, setMoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kid = data?.kids.find((k) => k.studentId === studentId);
  if (!kid) return null;

  const move = async (callId: string, start: string) => {
    setBusy(true);
    const error = await callAction({ action: "mover", callId, start });
    setBusy(false);
    if (error) { notify(error, "error"); return; }
    notify("Llamada movida. Avisamos al coordinador.", "success");
    setMoving(null);
    await reload();
  };

  // Sin formulario: lo pide el paso 1 de «Vuestros primeros pasos» (FamilyOnboarding).
  if (!kid.answeredAt) return null;

  return (
    <section className={`${card} space-y-3`} aria-label="Llamada semanal">
      <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]">
        {kid.medium === "telefono" ? <Phone className="h-5 w-5" /> : <Video className="h-5 w-5" />} Llamada semanal de {kid.studentName}
      </h3>
      {kid.fixed ? (
        <p className="text-xs leading-relaxed text-[#45433F]">
          Cada <b>{kid.fixed}</b>, 20 minutos{kid.mentorFixed ? <>; las semanas en las que se une {kid.mentorName || "su mentor"}: <b>{kid.mentorFixed}</b></> : ""}. {kid.medium === "telefono" ? "Os llamaremos por teléfono." : "Por Zoom, siempre con el mismo enlace."}
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-[#45433F]">Gracias por vuestros horarios. Estamos buscando la hora que va bien a todos; os avisaremos por correo.</p>
      )}
      {kid.medium === "zoom" && kid.zoomUrl && kid.fixed && (
        <a href={kid.zoomUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-[#242321] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3A3835]">
          <Video className="h-3.5 w-3.5" /> Entrar en la llamada (Zoom)
        </a>
      )}
      {kid.calls.length > 0 && (
        <div className="space-y-2">
          {kid.calls.map((c) => (
            <div key={c.id} className={`${subtle} space-y-2 text-xs`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#292825]"><b className="capitalize">{callWhen(c.scheduledStart)}</b> · {c.withMentor ? `con ${kid.coordinatorName || "el coordinador"} y ${kid.mentorName || "el mentor"}` : `con ${kid.coordinatorName || "el coordinador"}`}{c.moved ? " · movida" : ""}</span>
                {c.moveOptions.length > 0 && (
                  <button type="button" className="rounded-xl border border-[#E7E3DC] bg-white px-3 py-1.5 font-semibold text-[#45433F]" onClick={() => setMoving(moving === c.id ? null : c.id)}>
                    {moving === c.id ? "Cerrar" : "Mover esta semana"}
                  </button>
                )}
              </div>
              {moving === c.id && (
                <div className="space-y-1.5">
                  <p className="text-[#77736B]">Horas libres esta semana para todos:</p>
                  <div className="flex flex-wrap gap-2">
                    {c.moveOptions.map((o) => (
                      <button key={o} type="button" disabled={busy} onClick={() => move(c.id, o)}
                        className="rounded-xl border border-[#E7E3DC] bg-white px-3 py-1.5 font-semibold capitalize text-[#292825] hover:bg-[#F6F0E4]">{callWhen(o)}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[#77736B]">
        ¿Os ha cambiado la disponibilidad? <a href={kid.formUrl} target="_blank" rel="noopener noreferrer" className="underline">Actualizad vuestros horarios</a>.
      </p>
    </section>
  );
}
