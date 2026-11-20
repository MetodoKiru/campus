"use client";

import { useState } from "react";
import { Snowflake } from "lucide-react";
import { PHASE_LABEL, classKey, dateLabel, shortDate, type MentorPeriodView, type SubSlot } from "@/lib/special-periods";
import { btnDark, card, input, subtle } from "@/components/classes/shared";
import { periodAction, useSpecialPeriods } from "./api";
import SlotGrid, { ZonePicker } from "./SlotGrid";

/**
 * Formulario del mentor para Navidad / Semana Santa: qué clases de sus alumnos
 * puede dar y si quiere hacer sustituciones (días, mañana/tarde, zonas y máximo).
 */
export default function MentorSpecialPeriod({ notify }: { notify: (text: string) => void }) {
  const { data, error, reload } = useSpecialPeriods<{ periods: MentorPeriodView[] }>();
  if (error || !data?.periods.length) return null;
  return (
    <div className="space-y-4">
      {data.periods.map((p) => <Card key={`${p.period.id}-${p.answer?.answeredAt ?? ""}`} view={p} notify={notify} reload={reload} />)}
    </div>
  );
}

function Card({ view, notify, reload }: { view: MentorPeriodView; notify: (t: string) => void; reload: () => Promise<void> }) {
  const { period, phase, classes, answer } = view;
  const k = (c: { studentId: string; date: string; start: string }) => `${c.studentId}|${classKey(c.date, c.start)}`;
  const prev = new Map((answer?.ownClasses ?? []).map((o) => [k(o), o.can]));
  const [can, setCan] = useState<Record<string, boolean>>(() => Object.fromEntries(classes.map((c) => [k(c), prev.get(k(c)) ?? true])));
  const [sub, setSub] = useState(answer?.wantsToSubstitute ?? false);
  const [slots, setSlots] = useState<SubSlot[]>(answer?.slots ?? []);
  const [zones, setZones] = useState<string[]>(answer?.zones ?? []);
  const [max, setMax] = useState(answer?.maxSessions ?? 4);
  const [comments, setComments] = useState(answer?.comments ?? "");
  const [open, setOpen] = useState(!answer);
  const editable = phase === "abierto" || phase === "excepciones" || phase === "planificacion";

  const save = async () => {
    const { error } = await periodAction({
      accion: "mentor_responder", periodId: period.id,
      ownClasses: classes.map((c) => ({ studentId: c.studentId, date: c.date, start: c.start, can: can[k(c)] })),
      wantsToSubstitute: sub, slots, zones, maxSessions: max, comments,
    });
    if (error) { notify(`No se pudo guardar: ${error}`); return; }
    notify("Respuesta guardada. ¡Gracias!");
    await reload();
  };

  return (
    <section className={`${card} space-y-3 border-2 border-[#E4D8C5]`} aria-label={period.name}>
      <button type="button" className="w-full text-left" onClick={() => setOpen(!open)}>
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><Snowflake className="h-5 w-5" /> {period.name}</h2>
        <p className="text-xs text-[#6D6962]">
          Del {dateLabel(period.startsOn)} al {dateLabel(period.endsOn, true)} · {PHASE_LABEL[phase]}
          {phase === "abierto" && <> · responde antes del <strong>{shortDate(period.deadlineOn)}</strong></>}
          {answer ? ` · respondido el ${new Date(answer.answeredAt).toLocaleDateString("es-ES")}` : " · pendiente de responder"} {open ? "▲" : "▼"}
        </p>
      </button>
      {open && editable && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#292825]">Tus clases en estas fechas</p>
            {classes.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {classes.map((c) => (
                  <li key={k(c)} className={`${subtle} flex items-center justify-between gap-2 text-xs`}>
                    <span><strong>{c.studentName.split(" ")[0]}</strong> · <span className="capitalize">{dateLabel(c.date)}</span> · {c.start}</span>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={can[k(c)]} onChange={(e) => setCan({ ...can, [k(c)]: e.target.checked })} /> Puedo</label>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-[#6D6962]">No tienes clases en estas fechas.</p>}
            <p className="text-[11px] text-[#77736B]">Las que no puedas las cubriremos con un sustituto si la familia lo acepta. Que la familia quiera la clase lo decide ella en su panel.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#292825]">
            <input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> Me gustaría hacer sustituciones estos días
          </label>
          {sub && (
            <div className="space-y-3">
              <SlotGrid from={period.startsOn} to={period.endsOn} value={slots} onChange={setSlots} />
              <div className="space-y-1"><p className="text-xs text-[#45433F]">Zonas en las que puedes dar clase</p><ZonePicker zones={period.zones} value={zones} onChange={setZones} /></div>
              <label className="flex items-center gap-2 text-xs text-[#45433F]">Máximo de sesiones de sustitución
                <input type="number" min={0} max={60} className={`${input} w-20`} value={max} onChange={(e) => setMax(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} />
              </label>
            </div>
          )}
          <textarea className={input} rows={2} maxLength={2000} placeholder="Comentarios (días que estarás fuera de Madrid, desplazamiento…)" value={comments} onChange={(e) => setComments(e.target.value)} />
          <button type="button" className={btnDark} onClick={save}>{answer ? "Guardar cambios" : "Enviar"}</button>
        </div>
      )}
    </section>
  );
}
