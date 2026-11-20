"use client";

import { Printer } from "lucide-react";
import type { Json } from "@/lib/database.types";

type AnyRecord = Record<string, unknown>;
const asRecord = (value: unknown): AnyRecord => value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
const asArray = (value: unknown): AnyRecord[] => Array.isArray(value) ? value.map(asRecord) : [];
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
const percent = (value: unknown) => `${Math.round(Number(value) * 100)} %`;

const shortWeek = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

/** Las cuatro áreas del seguimiento, cada una con su color (paleta Kiru: verde botella,
 * azul marino, marrón y carbón) para que se distingan de un vistazo con buen contraste. */
const SKILL_AREAS = [
  { key: "estudios", label: "Estudios", color: "#15533A" },
  { key: "compromiso", label: "Compromiso", color: "#23416B" },
  { key: "organizacion", label: "Organización", color: "#8A5A2B" },
  { key: "bienestar", label: "Bienestar", color: "#44403C" },
] as const;

function MiniBars({ rows, color = "#2D5A43" }: { rows: AnyRecord[]; color?: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">Todavía no hay suficientes datos para mostrar una evolución semanal.</p>;
  return <div className="space-y-2">
    <div className="grid grid-cols-[1fr_auto] items-end gap-3">
      <div className="flex items-end gap-2" style={{ height: 52 }}>
        {rows.map((row) => {
          const value = Number(row.accuracy) || 0;
          return <div key={text(row.week)} title={`${shortWeek(text(row.week))}: ${percent(value)}`} className="flex flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[10px] font-semibold text-slate-500">{percent(value)}</span>
            <div className="w-full rounded-t" style={{ height: `${Math.max(value > 0 ? 10 : 2, Math.min(100, value * 100))}%`, backgroundColor: value > 0 ? color : "#E7E3DC", minHeight: 3 }} />
          </div>;
        })}
      </div>
      <span className="pb-5 text-[10px] uppercase tracking-wide text-slate-400">aciertos</span>
    </div>
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <div className="flex gap-2">{rows.map((row) => <span key={text(row.week)} className="flex-1 text-center text-[10px] text-slate-400">{shortWeek(text(row.week))}</span>)}</div>
      <span className="w-[52px]" />
    </div>
    <p className="text-[11px] text-slate-500">Porcentaje de aciertos por semana. Las semanas sin ejercicios no se dibujan.</p>
  </div>;
}

function SkillcoinBars({ rows }: { rows: AnyRecord[] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No hay valoraciones SkillCoins registradas en este periodo.</p>;
  const weeks = rows.map((row) => text(row.week));
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
      {SKILL_AREAS.map((area) => <span key={area.key} className="inline-flex items-center gap-1.5 font-medium text-slate-600">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: area.color }} />{area.label}
      </span>)}
    </div>
    <div className="space-y-4">
      {SKILL_AREAS.map((area) => {
        const last = Number(rows[rows.length - 1]?.[area.key]) || 0;
        return <div key={area.key} className="grid grid-cols-[104px_1fr_52px] items-center gap-3 sm:gap-4">
          <span className="text-sm font-semibold" style={{ color: area.color }}>{area.label}</span>
          <div className="flex items-end gap-1.5" style={{ height: 40 }}>
            {rows.map((row) => {
              const value = Number(row[area.key]) || 0;
              return <div key={text(row.week)} title={`${shortWeek(text(row.week))}: ${value}/10`} className="w-full rounded-t" style={{ height: `${Math.max(value > 0 ? 10 : 3, value * 10)}%`, backgroundColor: value > 0 ? area.color : "#E7E3DC", minHeight: 3 }} />;
            })}
          </div>
          <span className="text-right text-base font-bold text-slate-800">{last}<span className="text-xs font-normal text-slate-400">/10</span></span>
        </div>;
      })}
      <div className="grid grid-cols-[104px_1fr_52px] gap-3 sm:gap-4">
        <span />
        <div className="flex gap-1.5">{weeks.map((week) => <span key={week} className="flex-1 text-center text-[10px] text-slate-400">{shortWeek(week)}</span>)}</div>
        <span />
      </div>
    </div>
    <p className="text-[11px] text-slate-500">Cada barra es una semana (0–10); el número de la derecha es la última valoración. Las semanas sin valoración no se muestran.</p>
  </div>;
}

export default function ProgressReportDocument({ content: rawContent, periodStart, periodEnd, compact = false }: { content: Json | unknown; periodStart: string; periodEnd: string; compact?: boolean }) {
  const content = asRecord(rawContent);
  const coordinator = asRecord(content.coordinator);
  const sessions = asRecord(content.sessions);
  const details = asArray(sessions.details);
  const attitude = asRecord(content.attitude);
  const skillcoins = asArray(content.skillcoins);
  const subjects = Array.isArray(content.subjects) ? content.subjects.map(text) : [];
  const academics = asRecord(content.academics);
  const english = asRecord(academics.ingles);
  const lengua = asRecord(academics.lengua);
  const advice = asArray(content.mentorFamilyAdvice).map((item) => text(item)).filter(Boolean);
  const dates = `${dateLabel(periodStart)} – ${dateLabel(periodEnd)}`;
  const cadence = content.cadence === "trimestral" ? "trimestral" : "mensual";

  return <article className="progress-report bg-white text-[#292825] rounded-3xl border border-[#E7E3DC] p-5 sm:p-8 space-y-6 print:border-0 print:rounded-none print:p-0 print:shadow-none">
    <header className="flex items-start justify-between gap-4 border-b border-[#E7E3DC] pb-5">
      <div><p className="font-serif text-sm text-[#2D5A43]">Método Kiru · Informe {cadence}</p><h1 className="mt-1 font-serif text-2xl font-bold">Progreso de {text(content.studentName)}</h1><p className="mt-1 text-sm text-slate-600">Periodo: {dates}</p></div>
      <button type="button" onClick={() => window.print()} className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50 print:hidden"><Printer className="h-4 w-4" />Guardar o imprimir PDF</button>
    </header>

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Metric label="Sesiones registradas" value={text(sessions.count || 0)} />
      <Metric label="Actitud y participación" value={attitude.average == null ? "Sin datos" : `${Number(attitude.average).toFixed(1)}/5`} detail={`${text(attitude.count || 0)} valoraciones`} />
      {subjects.includes("ingles") && <Metric label="Inglés · tareas completadas" value={text(english.completed || 0)} detail={`${text(english.assigned || 0)} asignadas en el periodo`} />}
      {subjects.includes("lengua") && <Metric label="Lengua · sesiones de práctica" value={text(lengua.attempts || 0)} />}
      {subjects.includes("calculalo") && <Metric label="Matemáticas · Calculalo" value={asRecord(academics.calculalo).available ? "Informe incorporado" : "Pendiente de importar"} />}
    </section>

    {(text(coordinator.advance) || advice.length > 0) && <section className="space-y-2"><h2 className="font-serif text-lg font-bold">Avances de este periodo</h2>{text(coordinator.advance) && <p className="text-sm leading-relaxed">{text(coordinator.advance)}</p>}{advice.map((item, index) => <p key={index} className="text-sm leading-relaxed">{item}</p>)}</section>}

    {subjects.includes("ingles") && <Subject title="Inglés"><p className="mb-4 text-sm">Se completaron {text(english.completed || 0)} de {text(english.assigned || 0)} tareas asignadas durante el periodo.</p><MiniBars rows={asArray(english.weekly)} color="#23416B" /></Subject>}
    {subjects.includes("lengua") && <Subject title="Lengua"><p className="mb-4 text-sm">Se completaron {text(lengua.attempts || 0)} sesiones de práctica en el periodo.</p><MiniBars rows={asArray(lengua.weekly)} color="#15533A" /></Subject>}
    {subjects.includes("calculalo") && <Subject title="Matemáticas · Calculalo"><p className="text-sm">{text(asRecord(academics.calculalo).note) || "Se ha incorporado el informe de Calculalo."}</p></Subject>}

    <Subject title="Actitud, hábitos y SkillCoins"><p className="mb-4 text-sm">Las valoraciones de actitud corresponden a {text(attitude.count || 0)} sesiones registradas; SkillCoins se puntúa una vez por semana.</p><SkillcoinBars rows={skillcoins} /></Subject>

    {(text(coordinator.attitudeContext) || text(coordinator.schoolNotes) || text(coordinator.adaptationNotes)) && <Subject title="Observaciones de seguimiento">{text(coordinator.attitudeContext) && <p className="text-sm leading-relaxed">{text(coordinator.attitudeContext)}</p>}{text(coordinator.schoolNotes) && <p className="text-sm leading-relaxed">Coordinación con colegio u otros profesionales: {text(coordinator.schoolNotes)}</p>}{text(coordinator.adaptationNotes) && <p className="text-sm leading-relaxed">Adaptación curricular: {text(coordinator.adaptationNotes)}</p>}</Subject>}

    {advice.length > 0 || text(coordinator.familyAdvice) ? <Subject title="Consejos para la familia">{advice.map((item, index) => <p key={index} className="text-sm leading-relaxed">{item}</p>)}{text(coordinator.familyAdvice) && <p className="text-sm leading-relaxed">{text(coordinator.familyAdvice)}</p>}</Subject> : null}
    {text(coordinator.recommendations) && <Subject title="Recomendaciones"><p className="text-sm leading-relaxed">{text(coordinator.recommendations)}</p></Subject>}
    {text(coordinator.nextSteps) && <Subject title="Próximos pasos"><p className="text-sm leading-relaxed">{text(coordinator.nextSteps)}</p><p className="mt-2 text-xs text-slate-500">Responsable: {text(coordinator.nextStepsOwner) || "familia"}</p></Subject>}

    {!compact && <details className="rounded-2xl border border-slate-200 p-4 print:open"><summary className="cursor-pointer text-sm font-semibold">Detalle de las sesiones ({details.length})</summary><div className="mt-4 space-y-5">{details.map((session) => <div key={text(session.id)} className="border-t border-slate-100 pt-4"><h3 className="text-sm font-bold">Sesión · {session.date ? dateLabel(text(session.date)) : "fecha no registrada"}</h3>{text(session.incident) && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed"><strong>Incidencia registrada:</strong> {text(session.incident)}</p>}<dl className="mt-3 divide-y divide-slate-100">{asArray(session.answers).map((answer, index) => <div key={index} className="grid gap-x-4 gap-y-0.5 py-2 text-xs sm:grid-cols-[minmax(190px,0.8fr)_1fr]"><dt className="font-semibold text-slate-500">{text(answer.question)}</dt><dd className="whitespace-pre-wrap leading-relaxed text-slate-800">{text(answer.answer) || "—"}</dd></div>)}</dl></div>)}</div></details>}
  </article>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-2xl bg-[#FAF8F5] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-serif text-xl font-bold">{value}</p>{detail && <p className="mt-0.5 text-[10px] text-slate-500">{detail}</p>}</div>;
}

function Subject({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-t border-[#EEEAE3] pt-5"><h2 className="mb-3 font-serif text-lg font-bold">{title}</h2>{children}</section>;
}
