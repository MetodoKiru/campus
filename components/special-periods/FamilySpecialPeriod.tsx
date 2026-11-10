"use client";

import { useState } from "react";
import { Snowflake } from "lucide-react";
import { PHASE_LABEL, WHO_LABEL, classKey, dateLabel, shortDate, type FamilyPeriodView } from "@/lib/special-periods";
import { btnDark, card, input, subtle } from "@/components/classes/shared";
import { euro, periodAction, useSpecialPeriods } from "./api";

type Notify = (text: string, type: "success" | "error") => void;

/**
 * Formulario de Navidad / Semana Santa en el panel de padres: qué clases queréis
 * mantener, si aceptáis sustituto y si queréis alguna extra. Cuando administración
 * aprueba el plan, aquí se ve con quién es cada clase (del sustituto, solo nombre
 * de pila, especialidades y desde cuándo está en Kiru).
 */
export default function FamilySpecialPeriod({ studentId, notify }: { studentId: string; notify: Notify }) {
  const { data, error, reload } = useSpecialPeriods<{ periods: FamilyPeriodView[] }>();
  if (error || !data?.periods.length) return null;
  return (
    <div className="space-y-4">
      {data.periods.map((p) => {
        const s = p.students.find((x) => x.id === studentId);
        return s ? <PeriodCard key={`${p.period.id}-${s.id}-${s.answer?.answeredAt ?? ""}`} view={p} student={s} notify={notify} reload={reload} /> : null;
      })}
    </div>
  );
}

function PeriodCard({ view, student, notify, reload }: {
  view: FamilyPeriodView; student: FamilyPeriodView["students"][number]; notify: Notify; reload: () => Promise<void>;
}) {
  const { period, phase } = view;
  const initial = new Map((student.answer?.choices ?? []).map((c) => [classKey(c.date, c.start), c.wants]));
  const [wants, setWants] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(student.classes.map((c) => [classKey(c.date, c.start), initial.get(classKey(c.date, c.start)) ?? true])));
  const [acceptsSubstitute, setAccepts] = useState(student.answer?.acceptsSubstitute ?? true);
  const [extra, setExtra] = useState(student.answer?.extraSessions ?? 0);
  const [comments, setComments] = useState(student.answer?.comments ?? "");
  const [saving, setSaving] = useState(false);
  const open = phase === "abierto" || phase === "excepciones" || phase === "planificacion";
  const kept = Object.values(wants).filter(Boolean).length;

  const save = async () => {
    setSaving(true);
    const { error, data } = await periodAction({
      accion: "familia_responder", periodId: period.id, studentId: student.id,
      choices: student.classes.map((c) => ({ date: c.date, start: c.start, wants: wants[classKey(c.date, c.start)] })),
      acceptsSubstitute, extraSessions: extra, comments,
    });
    setSaving(false);
    if (error) { notify(error, "error"); return; }
    notify(data.late ? "Respuesta guardada. Está fuera de plazo: la revisará administración." : "¡Gracias! Hemos guardado vuestra respuesta.", "success");
    await reload();
  };

  return (
    <section className={`${card} space-y-4 border-2 border-[#E4D8C5]`} aria-label={period.name}>
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><Snowflake className="h-5 w-5" /> {period.name} · {student.name}</h3>
        <p className="text-xs text-[#6D6962]">
          Del {dateLabel(period.startsOn)} al {dateLabel(period.endsOn, true)}. {PHASE_LABEL[phase]}
          {phase === "abierto" && <> · podéis responder hasta el <strong>{shortDate(period.deadlineOn)}</strong></>}.
        </p>
      </header>

      {student.plan ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[#292825]">Vuestro plan para estas fechas</p>
          <ul className="space-y-2">
            {student.plan.assignments.map((a) => (
              <li key={classKey(a.date, a.start)} className={`${subtle} text-xs`}>
                <span className="capitalize font-semibold">{dateLabel(a.date)}</span> · {a.start}–{a.end} · {WHO_LABEL[a.who]}
                {a.who === "sustituto" && a.substitute && (
                  <span className="block text-[#6D6962] mt-1">
                    Mentor/a sustituto/a: <strong>{a.substitute.firstName}</strong>
                    {a.substitute.specialties.length > 0 && <> · {a.substitute.specialties.join(", ")}</>}
                    {a.substitute.inKiruSince && <> · en Kiru desde {new Date(a.substitute.inKiruSince).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</>}
                  </span>
                )}
                {a.who === "sin_cobertura" && <span className="block text-[#6D6962] mt-1">No hemos podido cubrir esta clase: la conserváis para recuperarla.</span>}
              </li>
            ))}
          </ul>
          {student.plan.amounts.length > 0 && (
            <div className={`${subtle} text-xs space-y-1`}>
              {student.plan.amounts.map((m) => (
                <p key={m.periodStart}>Mensualidad del {shortDate(m.periodStart)} al {shortDate(m.periodEnd)}: <strong>{euro(m.amount)}</strong></p>
              ))}
              <p className="text-[#6D6962]">Os llegará con la renovación de esa mensualidad.</p>
            </div>
          )}
          {open && <p className="text-[11px] text-[#77736B]">Si necesitáis cambiar algo, modificad vuestra respuesta abajo: Método Kiru lo revisará de nuevo.</p>}
        </div>
      ) : student.answer ? (
        <p className={`${subtle} text-xs`}>Hemos recibido vuestra respuesta el {new Date(student.answer.answeredAt).toLocaleDateString("es-ES")}. Os avisaremos cuando el plan esté revisado.</p>
      ) : null}

      {open && (
        <div className="space-y-3">
          {student.classes.length ? (
            <>
              <p className="text-xs text-[#45433F]">Estas son las clases de vuestro horario que caen en {period.name}. Marcad las que queréis <strong>mantener</strong>.</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {student.classes.map((c) => {
                  const k = classKey(c.date, c.start);
                  return (
                    <li key={k} className={`${subtle} flex items-center justify-between gap-2 text-xs`}>
                      <span><span className="capitalize">{dateLabel(c.date)}</span> · {c.start}–{c.end}</span>
                      <span className="flex gap-1">
                        <button type="button" onClick={() => setWants({ ...wants, [k]: true })} className={`rounded-lg px-2 py-1 ${wants[k] ? "bg-[#242321] text-white" : "border border-[#E7E3DC]"}`}>Sí</button>
                        <button type="button" onClick={() => setWants({ ...wants, [k]: false })} className={`rounded-lg px-2 py-1 ${!wants[k] ? "bg-[#242321] text-white" : "border border-[#E7E3DC]"}`}>No</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11px] text-[#77736B]">Mantenéis {kept} de {student.classes.length}. Si quitáis clases ahora (acuerdo previo), la mensualidad se ajusta de forma proporcional y os la confirmamos antes de cobrar nada.</p>
            </>
          ) : <p className="text-xs text-[#6D6962]">No hay clases de vuestro horario en estas fechas.</p>}
          <label className="flex items-start gap-2 text-xs text-[#45433F]">
            <input type="checkbox" className="mt-0.5" checked={acceptsSubstitute} onChange={(e) => setAccepts(e.target.checked)} />
            <span>Si nuestro mentor no puede algún día, aceptamos un mentor sustituto de Método Kiru.</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-[#45433F]">
            ¿Queréis alguna clase extra estos días?
            <input type="number" min={0} max={20} className={`${input} w-20`} value={extra} onChange={(e) => setExtra(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} />
          </label>
          <textarea className={input} rows={2} maxLength={2000} placeholder="Comentarios (días que estaréis fuera, horarios que os vienen mejor…)" value={comments} onChange={(e) => setComments(e.target.value)} />
          <button type="button" className={btnDark} disabled={saving} onClick={save}>{student.answer ? "Guardar cambios" : "Enviar respuesta"}</button>
        </div>
      )}
    </section>
  );
}
