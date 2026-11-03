"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, FileText, LoaderCircle, Save, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import ProgressReportDocument from "@/components/reports/ProgressReportDocument";

type Fields = { advance: string; attitudeContext: string; schoolRelationship: string; schoolNotes: string; adaptation: string; adaptationNotes: string; familyAdvice: string; recommendations: string; nextSteps: string; nextStepsOwner: string };
type ReportRow = { id: string; status: "borrador" | "publicado"; content: Json; period_start: string; period_end: string; due_date: string };
type StudentPeriod = { studentId: string; studentName: string; email: string; cadence: "mensual" | "trimestral"; periodStart: string; periodEnd: string; dueDate: string; report: ReportRow | null };
const EMPTY: Fields = { advance: "", attitudeContext: "", schoolRelationship: "no_aplica", schoolNotes: "", adaptation: "no_aplica", adaptationNotes: "", familyAdvice: "", recommendations: "", nextSteps: "", nextStepsOwner: "familia" };
const SUBJECTS = [{ id: "ingles", label: "Inglés" }, { id: "lengua", label: "Lengua" }, { id: "calculalo", label: "Matemáticas · Calculalo" }];
const fmt = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
const getRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export default function CoordinatorReportsPanel() {
  const [students, setStudents] = useState<StudentPeriod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const response = await fetch("/api/informes/progreso", { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar los informes.");
    setStudents(result.students ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "No se pudieron cargar los informes.")); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const selected = useMemo(() => students.find((item) => `${item.studentId}|${item.periodStart}` === selectedId) ?? null, [students, selectedId]);
  const report = selected?.report ?? null;
  const content = getRecord(report?.content);
  const coordFields = getRecord(content.coordinator);
  const published = report?.status === "publicado";

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      setFields({ ...EMPTY, ...(coordFields as Partial<Fields>) });
      const stored = Array.isArray(content.subjects) ? content.subjects.filter((value): value is string => typeof value === "string") : [];
      const detected = Array.isArray(content.detectedSubjects) ? content.detectedSubjects.filter((value): value is string => typeof value === "string") : [];
      setSelectedSubjects(stored.length ? stored : detected);
    }, 0);
    return () => window.clearTimeout(timer);
  // Selection intentionally resets the editor to the selected saved snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, report?.id, report?.status]);

  const call = async (action: "guardar" | "publicar") => {
    if (!selected) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
      const body = action === "guardar"
        ? { action, studentId: selected.studentId, periodStart: selected.periodStart, periodEnd: selected.periodEnd, fields, subjects: selectedSubjects }
        : { action, reportId: report?.id };
      const response = await fetch("/api/informes/progreso", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el informe.");
      await load();
      if (action === "guardar") setMessage("Borrador guardado con los datos actualizados.");
      else setMessage("Informe compartido con la familia. Recibirá un enlace por email.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar la acción."); }
    finally { setWorking(false); }
  };

  return <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
    <aside className="space-y-3">
      <div className="rounded-2xl bg-white border border-slate-200 p-4"><h2 className="font-serif text-lg font-bold text-slate-900">Informes por preparar</h2><p className="mt-1 text-xs text-slate-500">La fecha límite es cuatro días antes del fin del periodo familiar. Puedes prepararlo antes de la llamada.</p></div>
      {students.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No hay periodos de renovación activos para tus alumnos.</div>}
      {students.map((item) => <button key={`${item.studentId}|${item.periodStart}`} type="button" onClick={() => { setSelectedId(`${item.studentId}|${item.periodStart}`); setError(""); setMessage(""); }} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === `${item.studentId}|${item.periodStart}` ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
        <span className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">{item.studentName}</span>{item.report?.status === "publicado" ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <FileText className="h-4 w-4 text-slate-400" />}</span>
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-emerald-800">Informe {item.cadence}</span>
        <span className="mt-2 block text-[11px] text-slate-500">{fmt(item.periodStart)} – {fmt(item.periodEnd)}</span>
        <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-800"><CalendarClock className="h-3.5 w-3.5" />Listo antes del {fmt(item.dueDate)}</span>
        <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{item.report?.status === "publicado" ? "Compartido" : item.report ? "Borrador guardado" : "Pendiente"}</span>
      </button>)}
    </aside>

    {!selected ? <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Selecciona un alumno para preparar su informe.</div> : <section className="min-w-0 space-y-4">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {!report && <div className="rounded-3xl border border-slate-200 bg-white p-6"><h2 className="font-serif text-xl font-bold">{selected.studentName}</h2><p className="mt-2 text-sm text-slate-600">El Campus reunirá sus registros del {fmt(selected.periodStart)} al {fmt(selected.periodEnd)} y preparará el borrador {selected.cadence}.</p><button type="button" onClick={() => void call("guardar")} disabled={working} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Crear borrador {selected.cadence}</button></div>}
      {report && <>
        {!published && <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <div><h2 className="font-serif text-xl font-bold">Completar informe</h2><p className="mt-1 text-xs text-slate-500">Los datos del Campus y todas las respuestas del registro del mentor aparecerán en el informe familiar.</p></div>
          <fieldset className="space-y-2"><legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Asignaturas del informe</legend><div className="flex flex-wrap gap-2">{SUBJECTS.map((subject) => <label key={subject.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs"><input type="checkbox" checked={selectedSubjects.includes(subject.id)} onChange={(event) => setSelectedSubjects((previous) => event.target.checked ? [...previous, subject.id] : previous.filter((item) => item !== subject.id))} />{subject.label}</label>)}</div></fieldset>
          <Field label="Avance principal del periodo" value={fields.advance} onChange={(advance) => setFields((current) => ({ ...current, advance }))} />
          <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Relación con colegio u otros profesionales" value={fields.schoolRelationship} choices={[["no_aplica", "No aplica"], ["sin_cambios", "Sin cambios"], ["coordinacion", "Hay coordinación"]]} onChange={(schoolRelationship) => setFields((current) => ({ ...current, schoolRelationship }))} /><SelectField label="Adaptación curricular" value={fields.adaptation} choices={[["no_aplica", "No aplica"], ["se_mantiene", "Se mantiene"], ["hay_avances", "Hay avances"]]} onChange={(adaptation) => setFields((current) => ({ ...current, adaptation }))} /></div>
          {fields.schoolRelationship !== "no_aplica" && <Field label="Detalle de la coordinación" value={fields.schoolNotes} onChange={(schoolNotes) => setFields((current) => ({ ...current, schoolNotes }))} />}
          {fields.adaptation !== "no_aplica" && <Field label="Avances de adaptación curricular" value={fields.adaptationNotes} onChange={(adaptationNotes) => setFields((current) => ({ ...current, adaptationNotes }))} />}
          <Field label="Actitud y participación: contexto del coordinador" value={fields.attitudeContext} onChange={(attitudeContext) => setFields((current) => ({ ...current, attitudeContext }))} />
          <Field label="Consejo concreto para la familia" value={fields.familyAdvice} onChange={(familyAdvice) => setFields((current) => ({ ...current, familyAdvice }))} />
          <Field label="Recomendaciones" value={fields.recommendations} onChange={(recommendations) => setFields((current) => ({ ...current, recommendations }))} />
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]"><Field label="Próximo paso claro" value={fields.nextSteps} onChange={(nextSteps) => setFields((current) => ({ ...current, nextSteps }))} required /><SelectField label="Responsable" value={fields.nextStepsOwner} choices={[["familia", "Familia"], ["alumno", "Alumno/a"], ["mentor", "Mentor/a"], ["coordinador", "Coordinador/a"], ["equipo", "Equipo compartido"]]} onChange={(nextStepsOwner) => setFields((current) => ({ ...current, nextStepsOwner }))} /></div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={working} onClick={() => void call("guardar")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />Guardar borrador</button><button type="button" disabled={working || !report} onClick={() => void call("publicar")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />Publicar y avisar a la familia</button></div>
        </div>}
        {published && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Este informe ya está publicado. La familia puede verlo en el Campus; el mentor solo puede consultarlo después de publicarse.</div>}
        <ProgressReportDocument content={report.content} periodStart={report.period_start} periodEnd={report.period_end} />
      </>}
    </section>}
  </div>;
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">{label}{required ? " *" : ""}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={2} maxLength={1200} className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" /></label>;
}

function SelectField({ label, value, choices, onChange }: { label: string; value: string; choices: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">{choices.map(([key, labelText]) => <option key={key} value={key}>{labelText}</option>)}</select></label>;
}
