"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, History, LoaderCircle, MessageSquare, Paperclip, RefreshCw, Send, ShieldAlert, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { MethodologyWarningRow, SkillcoinReviewResolution, SkillcoinReviewRow, SkillcoinReviewStatus } from "@/lib/database.types";
import {
  COMPETENCIAS, COMPETENCIA_LABEL, FLAG_LABEL, MANUAL_REFERENCE, RESOLUTION_LABEL, STATUS_LABEL, WARNING_LEVEL_LABEL, WARNING_STATUS_LABEL,
  computeFlags, countsForLevel, errorText, evidenceUrl, fetchEvaluations, fetchSupervision, fmtDateTime, fmtDay,
  type Competencia, type Evaluation, type Flag, type FlagCode, type ReviewBundle,
} from "@/lib/supervision-coordinacion";

type Person = { id: string; full_name: string; role: string };
type View = "evaluaciones" | "revisiones" | "avisos";
type Props = {
  meId: string;
  isAdmin: boolean;
  people: Person[];
  coordinatorOf: Record<string, string>;
  initialReviewId?: string | null;
  notify: (text: string, type: "success" | "error") => void;
};

const EMPTY: ReviewBundle = { reviews: [], messages: [], files: [], warnings: [], events: [] };
const OPEN: SkillcoinReviewStatus[] = ["pendiente_respuesta", "respondida", "pendiente_valoracion"];
const STATUS_STYLE: Record<SkillcoinReviewStatus, string> = {
  pendiente_respuesta: "bg-amber-50 text-amber-800 border-amber-200",
  respondida: "bg-sky-50 text-sky-800 border-sky-200",
  pendiente_valoracion: "bg-violet-50 text-violet-800 border-violet-200",
  cerrada: "bg-slate-100 text-slate-600 border-slate-200",
};
const EVENT_LABEL: Record<string, string> = {
  solicitada: "Solicitud enviada", respondida: "Respuesta del mentor", adjunto: "Evidencia adjunta", en_valoracion: "En valoración",
  repregunta: "Repregunta de coordinación", cerrada: "Revisión cerrada", aviso_creado: "Aviso metodológico registrado",
  nota_corregida: "Nota corregida por administración", en_revision: "Aviso en revisión", programar_reunion: "Reunión programada",
  reunion_realizada: "Reunión realizada", solicitar_revision: "Revisión metodológica solicitada", registrar_resultado: "Resultado registrado",
  mejora: "Mejora observada", resolver: "Aviso resuelto",
};
const reviewKey = (studentId: string, week: string, c: string) => `${studentId}|${week}|${c}`;

export default function CoordinatorSupervision({ meId, isAdmin, people, coordinatorOf, initialReviewId, notify }: Props) {
  const [view, setView] = useState<View>(initialReviewId ? "revisiones" : "evaluaciones");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [bundle, setBundle] = useState<ReviewBundle>(EMPTY);
  const [filters, setFilters] = useState({ coordinator: "todos", mentor: "todos", student: "todos", competencia: "todas", status: "abiertas" });
  const [selectedEval, setSelectedEval] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<string | null>(initialReviewId ?? null);
  const [selectedWarning, setSelectedWarning] = useState<string | null>(null);
  const [newWarning, setNewWarning] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [evals, data] = await Promise.all([fetchEvaluations(), fetchSupervision()]);
      setEvaluations(evals);
      setBundle(data);
    } catch (error) {
      setLoadError(errorText(error, "No se pudo cargar la supervisión."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  const name = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p.full_name]));
    for (const e of evaluations) { map.set(e.studentId, e.studentName); map.set(e.mentorId, e.mentorName); }
    return (id: string | null | undefined) => (id && map.get(id)) || "—";
  }, [people, evaluations]);

  const myMentors = useMemo(() => {
    const ids = isAdmin ? people.filter((p) => p.role === "mentor").map((p) => p.id)
      : Object.entries(coordinatorOf).filter(([, c]) => c === meId).map(([m]) => m);
    return ids.map((id) => ({ id, name: name(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [isAdmin, people, coordinatorOf, meId, name]);
  const coordinators = useMemo(() => people.filter((p) => p.role === "coordinador").sort((a, b) => a.full_name.localeCompare(b.full_name)), [people]);

  const flags = useMemo(() => computeFlags(evaluations), [evaluations]);
  const openByKey = useMemo(() => new Map(bundle.reviews.filter((r) => r.status !== "cerrada").map((r) => [reviewKey(r.student_id, r.week, r.competencia), r])), [bundle.reviews]);
  const reviewsByKey = useMemo(() => {
    const map = new Map<string, SkillcoinReviewRow[]>();
    for (const r of bundle.reviews) map.set(reviewKey(r.student_id, r.week, r.competencia), [...(map.get(reviewKey(r.student_id, r.week, r.competencia)) ?? []), r]);
    return map;
  }, [bundle.reviews]);

  const passMentor = useCallback((mentorId: string) =>
    (filters.mentor === "todos" || filters.mentor === mentorId)
    && (!isAdmin || filters.coordinator === "todos" || coordinatorOf[mentorId] === filters.coordinator), [filters.mentor, filters.coordinator, isAdmin, coordinatorOf]);

  // Resumen de coordinación (punto 8 de la especificación).
  const summary = useMemo(() => {
    const reviews = bundle.reviews.filter((r) => passMentor(r.mentor_id));
    const warnings = bundle.warnings.filter((w) => passMentor(w.mentor_id));
    const sixMonths = new Date(); sixMonths.setMonth(sixMonths.getMonth() - 6);
    const recent = new Map<string, number>();
    for (const r of reviews) if (r.resolution !== "retirada" && new Date(r.created_at) > sixMonths) recent.set(r.mentor_id, (recent.get(r.mentor_id) ?? 0) + 1);
    return {
      pending: reviews.filter((r) => r.status === "pendiente_respuesta").length,
      toAssess: reviews.filter((r) => r.status === "respondida" || r.status === "pendiente_valoracion").length,
      activeWarnings: warnings.filter((w) => w.status !== "resuelto").length,
      recurrent: [...recent.entries()].filter(([, n]) => n >= 2).map(([id, n]) => ({ id, n })),
      meetings: warnings.filter((w) => w.level >= 2 && w.status !== "resuelto" && !w.meeting_done_at).length,
      closed: reviews.filter((r) => r.status === "cerrada").length,
    };
  }, [bundle, passMentor]);

  const studentsInScope = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of evaluations) if (passMentor(e.mentorId)) map.set(e.studentId, e.studentName);
    for (const r of bundle.reviews) if (passMentor(r.mentor_id)) map.set(r.student_id, name(r.student_id));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [evaluations, bundle.reviews, passMentor, name]);
  const mentorsInScope = useMemo(() => {
    const map = new Map<string, string>(myMentors.map((m) => [m.id, m.name]));
    for (const e of evaluations) map.set(e.mentorId, e.mentorName);
    return [...map.entries()].filter(([id]) => !isAdmin || filters.coordinator === "todos" || coordinatorOf[id] === filters.coordinator)
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [myMentors, evaluations, isAdmin, filters.coordinator, coordinatorOf]);

  const done = async (text: string) => { notify(text, "success"); await load(); };

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando la supervisión…</div>;
  if (loadError) return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{loadError}<button type="button" onClick={() => void load()} className="ml-3 underline">Reintentar</button></div>;

  return <div className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-slate-900">Supervisión de evaluaciones</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">Las notas de SkillCoins de {isAdmin ? "todos los mentores" : "tus mentores"}, con lo que escribieron esa semana. Los indicadores solo señalan qué conviene mirar: una nota alta o repetida no es un error por sí misma. Nada de lo que hagas aquí cambia las SkillCoins.</p>
        </div>
        <button type="button" onClick={() => { setLoading(true); void load(); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" />Actualizar</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Pendientes de respuesta" value={summary.pending} onClick={() => { setView("revisiones"); setFilters((f) => ({ ...f, status: "pendiente_respuesta" })); }} />
        <SummaryCard label="Por valorar" value={summary.toAssess} warn onClick={() => { setView("revisiones"); setFilters((f) => ({ ...f, status: "por_valorar" })); }} />
        <SummaryCard label="Avisos activos" value={summary.activeWarnings} onClick={() => setView("avisos")} />
        <SummaryCard label="Mentores con revisiones recurrentes" value={summary.recurrent.length} onClick={() => setView("avisos")} />
        <SummaryCard label="Reuniones de seguimiento pendientes" value={summary.meetings} onClick={() => setView("avisos")} />
        <SummaryCard label="Revisiones cerradas" value={summary.closed} onClick={() => { setView("revisiones"); setFilters((f) => ({ ...f, status: "cerrada" })); }} />
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {(["evaluaciones", "revisiones", "avisos"] as View[]).map((v) => <button key={v} type="button" onClick={() => setView(v)}
        className={`rounded-xl px-3.5 py-2 text-sm font-semibold ${view === v ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
        {v === "evaluaciones" ? "Evaluaciones" : v === "revisiones" ? "Revisiones" : "Avisos metodológicos"}</button>)}
    </div>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
      {isAdmin && <Select label="Coordinador" value={filters.coordinator} onChange={(coordinator) => setFilters((f) => ({ ...f, coordinator, mentor: "todos" }))}
        options={[["todos", "Todos"], ...coordinators.map((c) => [c.id, c.full_name] as [string, string])]} />}
      <Select label="Mentor" value={filters.mentor} onChange={(mentor) => setFilters((f) => ({ ...f, mentor }))} options={[["todos", "Todos"], ...mentorsInScope]} />
      {view !== "avisos" && <Select label="Alumno" value={filters.student} onChange={(student) => setFilters((f) => ({ ...f, student }))} options={[["todos", "Todos"], ...studentsInScope]} />}
      <Select label="Competencia" value={filters.competencia} onChange={(competencia) => setFilters((f) => ({ ...f, competencia }))}
        options={[["todas", "Todas"], ...COMPETENCIAS.map((c) => [c, COMPETENCIA_LABEL[c]] as [string, string]), ...(view === "avisos" ? [["general", "General"] as [string, string]] : [])]} />
      {view === "revisiones" && <Select label="Estado" value={filters.status} onChange={(status) => setFilters((f) => ({ ...f, status }))}
        options={[["abiertas", "Abiertas"], ["pendiente_respuesta", STATUS_LABEL.pendiente_respuesta], ["por_valorar", "Por valorar"], ["cerrada", "Cerradas (historial)"], ["todas", "Todas"]]} />}
      {view === "avisos" && <Select label="Estado" value={filters.status} onChange={(status) => setFilters((f) => ({ ...f, status }))}
        options={[["abiertas", "Activos"], ["pendiente", "Pendientes"], ["en_revision", "En revisión"], ["resuelto", "Resueltos"], ["todas", "Todos"]]} />}
    </div>

    {view === "evaluaciones" && <EvaluationsView
      evaluations={evaluations.filter((e) => passMentor(e.mentorId) && (filters.student === "todos" || filters.student === e.studentId))}
      competencia={filters.competencia} flags={flags} openByKey={openByKey} reviewsByKey={reviewsByKey}
      selected={selectedEval} onSelect={setSelectedEval}
      onOpenReview={(id) => { setSelectedReview(id); setView("revisiones"); setFilters((f) => ({ ...f, status: "todas" })); }}
      onRequested={(text) => done(text)} notify={notify} />}

    {view === "revisiones" && <ReviewsView bundle={bundle} isAdmin={isAdmin} name={name}
      reviews={bundle.reviews.filter((r) => passMentor(r.mentor_id)
        && (filters.student === "todos" || filters.student === r.student_id)
        && (filters.competencia === "todas" || filters.competencia === r.competencia)
        && (filters.status === "todas" || (filters.status === "abiertas" ? OPEN.includes(r.status)
          : filters.status === "por_valorar" ? r.status === "respondida" || r.status === "pendiente_valoracion" : r.status === filters.status)))}
      selected={selectedReview} onSelect={setSelectedReview} onChanged={done} notify={notify} reload={load} />}

    {view === "avisos" && <WarningsView bundle={bundle} name={name} mentors={myMentors} recurrent={summary.recurrent}
      warnings={bundle.warnings.filter((w) => passMentor(w.mentor_id)
        && (filters.competencia === "todas" || filters.competencia === w.competencia)
        && (filters.status === "todas" || (filters.status === "abiertas" ? w.status !== "resuelto" : w.status === filters.status)))}
      allWarnings={bundle.warnings.filter((w) => passMentor(w.mentor_id))}
      selected={selectedWarning} onSelect={setSelectedWarning} creating={newWarning} setCreating={setNewWarning}
      onOpenReview={(id) => { setSelectedReview(id); setView("revisiones"); setFilters((f) => ({ ...f, status: "todas" })); }}
      onChanged={done} notify={notify} />}
  </div>;
}

/* ---------------------------------------------------------------- Evaluaciones */

function EvaluationsView({ evaluations, competencia, flags, openByKey, reviewsByKey, selected, onSelect, onOpenReview, onRequested, notify }: {
  evaluations: Evaluation[]; competencia: string; flags: Map<string, Flag[]>;
  openByKey: Map<string, SkillcoinReviewRow>; reviewsByKey: Map<string, SkillcoinReviewRow[]>;
  selected: string | null; onSelect: (id: string | null) => void; onOpenReview: (id: string) => void;
  onRequested: (text: string) => Promise<void>; notify: (text: string, type: "success" | "error") => void;
}) {
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const shownCompetencias = competencia === "todas" ? COMPETENCIAS : COMPETENCIAS.filter((c) => c === competencia);
  const byStudent = useMemo(() => {
    const map = new Map<string, Evaluation[]>();
    for (const e of evaluations) map.set(e.studentId, [...(map.get(e.studentId) ?? []), e]);
    return [...map.values()].map((weeks) => [...weeks].sort((a, b) => b.week.localeCompare(a.week)));
  }, [evaluations]);
  const current = evaluations.find((e) => e.logId === selected) ?? null;

  if (!evaluations.length) return <Empty text="No hay notas de SkillCoins de tus mentores en el último año. Llegan desde el formulario «Registro de sesión»." />;
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
    <div className="min-w-0 space-y-4">
      <label className="inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />Solo semanas con algo para revisar</label>
      {byStudent.map((weeks) => {
        const visible = weeks.filter((w) => !onlyFlagged || (flags.get(w.logId) ?? []).some((f) => shownCompetencias.includes(f.competencia)));
        if (!visible.length) return null;
        return <div key={weeks[0].studentId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h3 className="font-semibold text-slate-900">{weeks[0].studentName}</h3>
            <span className="text-xs text-slate-500">Mentor: {[...new Set(weeks.map((w) => w.mentorName))].join(", ")}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">Semana</th>
                {shownCompetencias.map((c) => <th key={c} className="px-2 py-2 text-center font-semibold">{COMPETENCIA_LABEL[c]}</th>)}
              </tr></thead>
              <tbody>
                {visible.map((w, i) => {
                  const wf = flags.get(w.logId) ?? [];
                  const older = weeks[weeks.indexOf(w) + 1];
                  return <tr key={w.logId} onClick={() => onSelect(w.logId)} className={`cursor-pointer border-t border-slate-100 ${selected === w.logId ? "bg-emerald-50" : i % 2 ? "bg-slate-50/40" : ""} hover:bg-emerald-50/60`}>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">{fmtDay(w.week)}{w.current && <span className="ml-1 rounded bg-slate-200 px-1 text-[10px]">corregida</span>}</td>
                    {shownCompetencias.map((c) => {
                      const cf = wf.filter((f) => f.competencia === c);
                      const review = openByKey.get(reviewKey(w.studentId, w.week, c));
                      const diff = older ? w.scores[c] - older.scores[c] : 0;
                      return <td key={c} className="px-2 py-2 text-center">
                        <span className={`inline-flex min-w-12 items-center justify-center gap-1 rounded-lg px-2 py-1 font-semibold ${cf.length ? "bg-amber-100 text-amber-900" : "text-slate-800"}`} title={cf.map((f) => `${FLAG_LABEL[f.code]}: ${f.text}`).join("\n")}>
                          {w.scores[c]}{cf.length > 0 && <AlertTriangle className="h-3 w-3" />}
                          {review && <MessageSquare className="h-3 w-3 text-violet-700" />}
                        </span>
                        {older && diff !== 0 && <span className={`ml-1 text-[10px] ${diff > 0 ? "text-emerald-700" : "text-red-700"}`}>{diff > 0 ? `+${diff}` : diff}</span>}
                      </td>;
                    })}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>;
      })}
    </div>
    <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      {!current ? <Empty text="Pulsa una semana para ver las observaciones del registro y, si hace falta, pedir una justificación." />
        : <EvaluationDetail evaluation={current} flags={flags.get(current.logId) ?? []} openByKey={openByKey} reviewsByKey={reviewsByKey}
          onClose={() => onSelect(null)} onOpenReview={onOpenReview} onRequested={onRequested} notify={notify} />}
    </aside>
  </div>;
}

function EvaluationDetail({ evaluation: e, flags, openByKey, reviewsByKey, onClose, onOpenReview, onRequested, notify }: {
  evaluation: Evaluation; flags: Flag[]; openByKey: Map<string, SkillcoinReviewRow>; reviewsByKey: Map<string, SkillcoinReviewRow[]>;
  onClose: () => void; onOpenReview: (id: string) => void; onRequested: (text: string) => Promise<void>; notify: (text: string, type: "success" | "error") => void;
}) {
  const [form, setForm] = useState<{ competencia: Competencia; reasonCode: FlagCode | "otro"; reason: string; question: string; due: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const start = (c: Competencia) => {
    const flag = flags.find((f) => f.competencia === c);
    setForm({ competencia: c, reasonCode: flag?.code ?? "otro", reason: flag ? `${FLAG_LABEL[flag.code]}: ${flag.text}` : "", question: "", due: "" });
  };
  const submit = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("kiru_request_sc_review", {
        p_log: e.logId, p_competencia: form.competencia, p_reason_code: form.reasonCode, p_reason: form.reason, p_question: form.question,
        p_due_date: form.due || null,
      });
      if (error) throw error;
      setForm(null);
      await onRequested(`Solicitud enviada a ${e.mentorName}. Le llegará a su panel y por correo.`);
    } catch (error) { notify(errorText(error), "error"); } finally { setBusy(false); }
  };

  return <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex items-start justify-between gap-2">
      <div><h3 className="font-semibold text-slate-900">{e.studentName}</h3><p className="text-xs text-slate-500">Semana del {fmtDay(e.week)} · sesión {fmtDay(e.sessionDate)} · {e.mentorName}</p></div>
      <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
    </div>
    {e.current && <p className="rounded-xl bg-slate-50 p-2 text-xs text-slate-600">Administración corrigió esta semana el {fmtDay(e.current.at)}: {COMPETENCIAS.map((c) => `${COMPETENCIA_LABEL[c]} ${e.current![c]}`).join(", ")}. Aquí ves las notas originales del mentor.</p>}
    <div className="grid grid-cols-2 gap-2">
      {COMPETENCIAS.map((c) => {
        const open = openByKey.get(reviewKey(e.studentId, e.week, c));
        const history = reviewsByKey.get(reviewKey(e.studentId, e.week, c)) ?? [];
        const cf = flags.filter((f) => f.competencia === c);
        return <div key={c} className={`rounded-xl border p-2.5 ${cf.length ? "border-amber-200 bg-amber-50/60" : "border-slate-200"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{COMPETENCIA_LABEL[c]}</p>
          <p className="text-lg font-bold text-slate-900">{e.scores[c]}<span className="text-xs font-normal text-slate-400">/10</span></p>
          {open ? <button type="button" onClick={() => onOpenReview(open.id)} className="mt-1 text-left text-[11px] font-semibold text-violet-800 underline">{STATUS_LABEL[open.status]}</button>
            : <button type="button" onClick={() => start(c)} className="mt-1 text-[11px] font-semibold text-emerald-800 underline">Solicitar justificación</button>}
          {history.filter((r) => r.status === "cerrada").map((r) => <button key={r.id} type="button" onClick={() => onOpenReview(r.id)} className="mt-1 block text-left text-[10px] text-slate-500 underline">{r.resolution ? RESOLUTION_LABEL[r.resolution] : ""}</button>)}
        </div>;
      })}
    </div>
    {flags.length > 0 && <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-900">Para revisar (no implica que la nota esté mal)</p>
      {[...new Map(flags.map((f) => [`${f.code}|${f.code === "sin_variacion" ? "" : f.competencia}`, f])).values()].map((f, i) =>
        <p key={i} className="text-xs text-amber-900"><strong>{FLAG_LABEL[f.code]}</strong>{f.code !== "sin_variacion" && ` · ${COMPETENCIA_LABEL[f.competencia]}`}: {f.text}</p>)}
    </div>}
    {form && <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
      <p className="text-sm font-semibold text-slate-900">Solicitar justificación · {COMPETENCIA_LABEL[form.competencia]} ({e.scores[form.competencia]}/10)</p>
      <Select label="Motivo" value={form.reasonCode} onChange={(v) => setForm({ ...form, reasonCode: v as FlagCode | "otro" })}
        options={[...(Object.keys(FLAG_LABEL) as FlagCode[]).map((k) => [k, FLAG_LABEL[k]] as [string, string]), ["otro", "Otro motivo"]]} />
      <TextArea label="Motivo de la revisión *" value={form.reason} onChange={(reason) => setForm({ ...form, reason })} max={1000} />
      <TextArea label="Pregunta o aclaración para el mentor *" value={form.question} onChange={(question) => setForm({ ...form, question })} max={2000}
        placeholder="Por ejemplo: ¿qué observaste en la sesión para poner esta nota? Si tienes una foto del cuaderno o de un ejercicio, adjúntala." />
      <label className="block text-xs font-semibold text-slate-700">Plazo para responder (opcional)
        <input type="date" value={form.due} min={new Date().toISOString().slice(0, 10)} onChange={(ev) => setForm({ ...form, due: ev.target.value })} className="mt-1 block rounded-xl border border-slate-200 bg-white p-2 text-sm" /></label>
      <p className="text-[11px] text-slate-500">El mentor recibe un aviso en su panel y un correo. Su nota no cambia.</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy || !form.reason.trim() || !form.question.trim()} onClick={() => void submit()} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar solicitud</button>
        <button type="button" onClick={() => setForm(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Cancelar</button>
      </div>
    </div>}
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-700">Observaciones del registro de esa semana</p>
      {e.observations.length === 0 ? <p className="text-xs text-slate-500">Sin observaciones de texto.</p>
        : <dl className="max-h-80 space-y-2 overflow-y-auto pr-1">{e.observations.map((o, i) => <div key={i}><dt className="text-[11px] text-slate-500">{o.q}</dt><dd className="text-sm text-slate-800">{o.a}</dd></div>)}</dl>}
    </div>
  </div>;
}

/* ---------------------------------------------------------------- Revisiones */

function ReviewsView({ bundle, reviews, isAdmin, name, selected, onSelect, onChanged, notify, reload }: {
  bundle: ReviewBundle; reviews: SkillcoinReviewRow[]; isAdmin: boolean; name: (id: string | null | undefined) => string;
  selected: string | null; onSelect: (id: string | null) => void; onChanged: (text: string) => Promise<void>;
  notify: (text: string, type: "success" | "error") => void; reload: () => Promise<void>;
}) {
  const current = bundle.reviews.find((r) => r.id === selected) ?? null;
  return <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
    <div className="min-w-0 space-y-2">
      {reviews.length === 0 && <Empty text="No hay revisiones con estos filtros." />}
      {reviews.map((r) => <button key={r.id} type="button" onClick={() => onSelect(r.id)}
        className={`w-full rounded-2xl border p-3 text-left transition ${selected === r.id ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
        <span className="flex items-start justify-between gap-2"><span className="font-semibold text-slate-900">{name(r.student_id)}</span><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span></span>
        <span className="mt-1 block text-xs text-slate-600">{COMPETENCIA_LABEL[r.competencia]} · {r.score_snapshot}/10 · semana del {fmtDay(r.week)}</span>
        <span className="mt-1 block text-[11px] text-slate-500">Mentor: {name(r.mentor_id)} · pedida el {fmtDay(r.created_at)}</span>
        {r.resolution && <span className="mt-1 block text-[11px] font-semibold text-slate-700">{RESOLUTION_LABEL[r.resolution]}</span>}
      </button>)}
    </div>
    {!current ? <Empty text="Elige una revisión para ver la respuesta del mentor, sus evidencias y el historial." />
      : <ReviewDetail key={current.id} review={current} bundle={bundle} isAdmin={isAdmin} name={name} onChanged={onChanged} notify={notify} reload={reload} />}
  </div>;
}

function ReviewDetail({ review: r, bundle, isAdmin, name, onChanged, notify, reload }: {
  review: SkillcoinReviewRow; bundle: ReviewBundle; isAdmin: boolean; name: (id: string | null | undefined) => string;
  onChanged: (text: string) => Promise<void>; notify: (text: string, type: "success" | "error") => void; reload: () => Promise<void>;
}) {
  const messages = bundle.messages.filter((m) => m.review_id === r.id);
  const files = bundle.files.filter((f) => f.review_id === r.id);
  const events = bundle.events.filter((ev) => ev.review_id === r.id);
  const warning = bundle.warnings.find((w) => w.review_id === r.id) ?? null;
  const [busy, setBusy] = useState(false);
  const [askMore, setAskMore] = useState("");
  const [resolution, setResolution] = useState<SkillcoinReviewResolution | "">("");
  const [fields, setFields] = useState({ note: "", criterion: "", improvements: "", manual: MANUAL_REFERENCE[r.competencia], recommended: "" });
  const [nextLevel, setNextLevel] = useState<number | null>(null);
  const [correction, setCorrection] = useState({ score: "", reason: "" });
  const started = useRef(false);

  // Al abrir una revisión respondida, pasa a «pendiente de valoración».
  useEffect(() => {
    if (r.status !== "respondida" || started.current) return;
    started.current = true;
    void supabase.rpc("kiru_sc_review_start_assessment", { p_review: r.id }).then(({ error }) => { if (!error) void reload(); });
  }, [r.id, r.status, reload]);

  useEffect(() => {
    if (resolution !== "insuficiente" && resolution !== "necesita_formacion") return;
    let alive = true;
    void supabase.rpc("kiru_methodology_warning_next_level", { p_mentor: r.mentor_id, p_competencia: r.competencia }).then(({ data }) => {
      if (alive) setNextLevel(Number((data as { level?: number } | null)?.level) || null);
    });
    return () => { alive = false; };
  }, [resolution, r.mentor_id, r.competencia]);

  const run = async (fn: () => PromiseLike<{ error: unknown }>, text: string) => {
    setBusy(true);
    try { const { error } = await fn(); if (error) throw error; await onChanged(text); }
    catch (error) { notify(errorText(error), "error"); } finally { setBusy(false); }
  };
  const open = r.status !== "cerrada";
  const answered = r.status === "respondida" || r.status === "pendiente_valoracion";
  const weekScores = (r.week_scores ?? {}) as Record<string, number>;

  return <div className="min-w-0 space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-lg font-bold text-slate-900">{name(r.student_id)} · {COMPETENCIA_LABEL[r.competencia]} {r.score_snapshot}/10</h3>
          <p className="text-xs text-slate-500">Semana del {fmtDay(r.week)} · mentor {name(r.mentor_id)} · pedida por {name(r.requested_by)} el {fmtDateTime(r.created_at)}{r.due_date ? ` · plazo ${fmtDay(r.due_date)}` : ""}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">Notas de esa semana al pedirla: {COMPETENCIAS.map((c) => `${COMPETENCIA_LABEL[c]} ${weekScores[c] ?? "—"}`).join(" · ")}. La nota original se conserva siempre.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Box title="Motivo">{r.reason}</Box>
        <Box title="Pregunta al mentor">{r.question}</Box>
      </div>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare className="h-4 w-4" />Conversación y evidencias</h4>
      {messages.length === 0 && <p className="text-sm text-slate-500">El mentor todavía no ha respondido.</p>}
      <div className="space-y-3">
        {messages.map((m) => <div key={m.id} className={`rounded-xl p-3 ${m.kind === "respuesta" ? "bg-sky-50" : "bg-slate-50"}`}>
          <p className="text-[11px] text-slate-500">{m.kind === "respuesta" ? "Respuesta" : "Repregunta"} de {name(m.author_id)} · {fmtDateTime(m.created_at)}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{m.body}</p>
          {m.criteria && <p className="mt-2 text-sm text-slate-700"><strong>Criterio usado:</strong> {m.criteria}</p>}
          {files.filter((f) => f.message_id === m.id).map((f) => <button key={f.id} type="button"
            onClick={() => void evidenceUrl(f.storage_path).then((url) => window.open(url, "_blank", "noopener,noreferrer")).catch((error) => notify(errorText(error), "error"))}
            className="mr-2 mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"><Paperclip className="h-3 w-3" />{f.file_name}</button>)}
        </div>)}
      </div>
      {files.length > 0 && <p className="mt-2 text-[11px] text-slate-400">Las evidencias pueden contener datos de un menor: se abren con un enlace que caduca a los 5 minutos. No las descargues ni las reenvíes.</p>}
    </div>

    {open && <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      {answered && <>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Valorar la respuesta</h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(["adecuada", "insuficiente", "necesita_formacion"] as SkillcoinReviewResolution[]).map((key) =>
              <label key={key} className={`cursor-pointer rounded-xl border p-3 text-sm ${resolution === key ? "border-emerald-700 bg-emerald-50" : "border-slate-200"}`}>
                <input type="radio" name="resolution" className="sr-only" checked={resolution === key} onChange={() => setResolution(key)} />
                <span className="font-semibold">{RESOLUTION_LABEL[key]}</span>
                <span className="mt-1 block text-[11px] text-slate-500">{key === "adecuada" ? "Se valida y se cierra. Sin aviso." : key === "insuficiente" ? "Se cierra con un aviso: criterio a revisar y mejoras esperadas." : "Se cierra con un aviso y se recomienda repaso o formación."}</span>
              </label>)}
          </div>
        </div>
        {resolution && <div className="space-y-2">
          {(resolution === "insuficiente" || resolution === "necesita_formacion") && <>
            {nextLevel && <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">Nivel que tendrá: <strong>{WARNING_LEVEL_LABEL[nextLevel as 1 | 2 | 3]}</strong> ({name(r.mentor_id)}, {COMPETENCIA_LABEL[r.competencia].toLowerCase()}; cuentan los avisos de los últimos 6 meses). El mentor lo recibirá en su panel y por correo. No hay sanciones automáticas.</p>}
            <TextArea label={resolution === "necesita_formacion" ? "Competencia y criterio que necesita reforzar *" : "Qué criterio debe revisar *"} value={fields.criterion} onChange={(criterion) => setFields({ ...fields, criterion })} max={2000} />
            <TextArea label="Mejoras esperadas" value={fields.improvements} onChange={(improvements) => setFields({ ...fields, improvements })} max={2000} />
            <TextInput label="Referencia del manual" value={fields.manual} onChange={(manual) => setFields({ ...fields, manual })} />
            {resolution === "necesita_formacion" && <TextArea label="Repaso o formación recomendada" value={fields.recommended} onChange={(recommended) => setFields({ ...fields, recommended })} max={1000} placeholder="Si lo dejas vacío: «Sesión de repaso o formación sobre el criterio…»" />}
          </>}
          <TextArea label="Comentario de la valoración" value={fields.note} onChange={(note) => setFields({ ...fields, note })} max={2000} />
          <button type="button" disabled={busy || ((resolution === "insuficiente" || resolution === "necesita_formacion") && !fields.criterion.trim())}
            onClick={() => void run(() => supabase.rpc("kiru_resolve_sc_review", { p_review: r.id, p_resolution: resolution, p_note: fields.note, p_criterion: fields.criterion, p_improvements: fields.improvements, p_manual_reference: fields.manual, p_recommended: fields.recommended }),
              resolution === "adecuada" ? "Revisión validada y cerrada." : "Revisión cerrada y aviso metodológico registrado.")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Cerrar la revisión</button>
        </div>}
        <div className="border-t border-slate-100 pt-3">
          <TextArea label="¿Necesitas una aclaración antes de valorar?" value={askMore} onChange={setAskMore} max={4000} placeholder="La pregunta vuelve al mentor y la revisión queda pendiente de respuesta." />
          <button type="button" disabled={busy || !askMore.trim()} onClick={() => void run(() => supabase.rpc("kiru_sc_review_ask_more", { p_review: r.id, p_body: askMore }), "Aclaración enviada al mentor.").then(() => setAskMore(""))}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"><Send className="h-4 w-4" />Repreguntar</button>
        </div>
      </>}
      <WithdrawBox busy={busy} onWithdraw={(note) => run(() => supabase.rpc("kiru_resolve_sc_review", { p_review: r.id, p_resolution: "retirada", p_note: note }), "Solicitud retirada.")} />
    </div>}

    {!open && <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <p className="font-semibold text-slate-900">{r.resolution ? RESOLUTION_LABEL[r.resolution] : "Cerrada"}</p>
      <p className="text-xs text-slate-500">Por {name(r.resolved_by)} el {fmtDateTime(r.resolved_at)}</p>
      {r.resolution_note && <p className="mt-2 text-slate-700">{r.resolution_note}</p>}
      {warning && <p className="mt-2 text-xs text-amber-900">Aviso asociado: {WARNING_LEVEL_LABEL[warning.level]} · {WARNING_STATUS_LABEL[warning.status]}</p>}
    </div>}

    {isAdmin && <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-900">Corregir la nota (solo administración)</h4>
      <p className="mt-1 text-xs text-slate-500">Solo si se decide expresamente. La nota original del registro se conserva; la corrección queda con su motivo y enlazada a esta revisión.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <TextInput label="Nueva nota (0-10)" value={correction.score} onChange={(score) => setCorrection({ ...correction, score: score.replace(/[^0-9]/g, "").slice(0, 2) })} />
        <div className="min-w-60 flex-1"><TextInput label="Motivo" value={correction.reason} onChange={(reason) => setCorrection({ ...correction, reason })} /></div>
        <button type="button" disabled={busy || correction.score === "" || !correction.reason.trim()}
          onClick={() => window.confirm("¿Corregir la nota? Cambiará las SkillCoins del alumno.") && void run(() => supabase.rpc("kiru_sc_review_correct", { p_review: r.id, p_new_score: Number(correction.score), p_reason: correction.reason }), "Nota corregida con trazabilidad.")}
          className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50">Corregir</button>
      </div>
    </div>}

    <Timeline events={events} name={name} />
  </div>;
}

function WithdrawBox({ busy, onWithdraw }: { busy: boolean; onWithdraw: (note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs text-slate-500 underline">Retirar la solicitud</button>;
  return <div className="space-y-2 rounded-xl bg-slate-50 p-3">
    <TextArea label="Por qué se retira *" value={note} onChange={setNote} max={2000} />
    <div className="flex gap-2">
      <button type="button" disabled={busy || !note.trim()} onClick={() => void onWithdraw(note)} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Retirar</button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Cancelar</button>
    </div>
  </div>;
}

/* ---------------------------------------------------------------- Avisos */

function WarningsView({ bundle, warnings, allWarnings, name, mentors, recurrent, selected, onSelect, creating, setCreating, onOpenReview, onChanged, notify }: {
  bundle: ReviewBundle; warnings: MethodologyWarningRow[]; allWarnings: MethodologyWarningRow[]; name: (id: string | null | undefined) => string;
  mentors: { id: string; name: string }[]; recurrent: { id: string; n: number }[];
  selected: string | null; onSelect: (id: string | null) => void; creating: boolean; setCreating: (v: boolean) => void;
  onOpenReview: (id: string) => void; onChanged: (text: string) => Promise<void>; notify: (text: string, type: "success" | "error") => void;
}) {
  const perMentor = useMemo(() => {
    const ids = [...new Set([...allWarnings.map((w) => w.mentor_id), ...recurrent.map((r) => r.id)])];
    return ids.map((id) => {
      const mine = allWarnings.filter((w) => w.mentor_id === id);
      return { id, total: mine.length, active: mine.filter((w) => w.status !== "resuelto").length,
        counting: mine.filter((w) => countsForLevel(w)).length, reviews: recurrent.find((r) => r.id === id)?.n ?? 0,
        improved: mine.filter((w) => w.improvement_at).length };
    }).sort((a, b) => b.active - a.active || b.total - a.total);
  }, [allWarnings, recurrent]);
  const current = bundle.warnings.find((w) => w.id === selected) ?? null;

  return <div className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Users className="h-4 w-4" />Avisos por mentor</h3>
        <button type="button" onClick={() => setCreating(!creating)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold"><ShieldAlert className="h-3.5 w-3.5" />Registrar un aviso</button>
      </div>
      <p className="mt-1 text-xs text-slate-500">El nivel de cada aviso nuevo depende de los avisos de la misma competencia de los últimos 6 meses. Los anteriores nunca se borran: siguen aquí aunque ya no cuenten.</p>
      {perMentor.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ningún mentor tiene avisos ni revisiones recurrentes.</p>
        : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="py-1.5 font-semibold">Mentor</th><th className="font-semibold">Activos</th><th className="font-semibold">Cuentan (6 meses)</th><th className="font-semibold">Total histórico</th><th className="font-semibold">Revisiones (6 meses)</th><th className="font-semibold">Con mejora</th></tr></thead>
          <tbody>{perMentor.map((m) => <tr key={m.id} className="border-t border-slate-100">
            <td className="py-2 font-medium">{name(m.id)}{m.reviews >= 2 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">recurrente</span>}</td>
            <td>{m.active}</td><td>{m.counting}</td><td>{m.total}</td><td>{m.reviews}</td><td>{m.improved}</td></tr>)}</tbody>
        </table></div>}
    </div>

    {creating && <NewWarningForm mentors={mentors} onDone={async (text) => { setCreating(false); await onChanged(text); }} notify={notify} />}

    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-2">
        {warnings.length === 0 && <Empty text="No hay avisos con estos filtros." />}
        {warnings.map((w) => <button key={w.id} type="button" onClick={() => onSelect(w.id)}
          className={`w-full rounded-2xl border p-3 text-left ${selected === w.id ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
          <span className="flex items-start justify-between gap-2"><span className="font-semibold text-slate-900">{name(w.mentor_id)}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{WARNING_STATUS_LABEL[w.status]}</span></span>
          <span className="mt-1 block text-xs text-slate-700">{WARNING_LEVEL_LABEL[w.level]}</span>
          <span className="mt-1 block text-[11px] text-slate-500">{COMPETENCIA_LABEL[w.competencia]} · {fmtDay(w.created_at)}{!countsForLevel(w) && " · ya no cuenta para el nivel"}</span>
        </button>)}
      </div>
      {!current ? <Empty text="Elige un aviso para ver su seguimiento." />
        : <WarningDetail key={current.id} warning={current} bundle={bundle} name={name} onOpenReview={onOpenReview} onChanged={onChanged} notify={notify} />}
    </div>
  </div>;
}

function NewWarningForm({ mentors, onDone, notify }: { mentors: { id: string; name: string }[]; onDone: (text: string) => Promise<void>; notify: (text: string, type: "success" | "error") => void }) {
  const [f, setF] = useState({ mentor: mentors[0]?.id ?? "", competencia: "organizacion" as Competencia | "general", criterion: "", improvements: "", manual: MANUAL_REFERENCE.organizacion, recommended: "" });
  const [level, setLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!f.mentor) return;
    let alive = true;
    void supabase.rpc("kiru_methodology_warning_next_level", { p_mentor: f.mentor, p_competencia: f.competencia }).then(({ data }) => {
      if (alive) setLevel(Number((data as { level?: number } | null)?.level) || null);
    });
    return () => { alive = false; };
  }, [f.mentor, f.competencia]);
  const submit = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("kiru_methodology_warning_create", { p_mentor: f.mentor, p_competencia: f.competencia, p_criterion: f.criterion, p_improvements: f.improvements, p_manual_reference: f.manual, p_recommended: f.recommended });
      if (error) throw error;
      await onDone("Aviso registrado. El mentor lo recibirá en su panel y por correo.");
    } catch (error) { notify(errorText(error), "error"); } finally { setBusy(false); }
  };
  return <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
    <h4 className="text-sm font-semibold text-slate-900">Registrar un aviso metodológico sin revisión previa</h4>
    <div className="flex flex-wrap gap-2">
      <Select label="Mentor" value={f.mentor} onChange={(mentor) => setF({ ...f, mentor })} options={mentors.map((m) => [m.id, m.name] as [string, string])} />
      <Select label="Competencia" value={f.competencia} onChange={(c) => setF({ ...f, competencia: c as Competencia | "general", manual: MANUAL_REFERENCE[c as Competencia | "general"] })}
        options={[...COMPETENCIAS.map((c) => [c, COMPETENCIA_LABEL[c]] as [string, string]), ["general", "General"]]} />
    </div>
    {level && <p className="text-xs text-amber-900">Nivel que tendrá: <strong>{WARNING_LEVEL_LABEL[level as 1 | 2 | 3]}</strong>.</p>}
    <TextArea label="Criterio que debe mejorar *" value={f.criterion} onChange={(criterion) => setF({ ...f, criterion })} max={2000} />
    <TextArea label="Mejoras esperadas" value={f.improvements} onChange={(improvements) => setF({ ...f, improvements })} max={2000} />
    <TextInput label="Referencia del manual" value={f.manual} onChange={(manual) => setF({ ...f, manual })} />
    <TextArea label="Recomendación (repaso, formación…)" value={f.recommended} onChange={(recommended) => setF({ ...f, recommended })} max={1000} />
    <button type="button" disabled={busy || !f.mentor || !f.criterion.trim()} onClick={() => void submit()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Registrar aviso</button>
  </div>;
}

function WarningDetail({ warning: w, bundle, name, onOpenReview, onChanged, notify }: {
  warning: MethodologyWarningRow; bundle: ReviewBundle; name: (id: string | null | undefined) => string;
  onOpenReview: (id: string) => void; onChanged: (text: string) => Promise<void>; notify: (text: string, type: "success" | "error") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [meetingAt, setMeetingAt] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState({ result: "", measures: "" });
  const events = bundle.events.filter((ev) => ev.warning_id === w.id);
  const counted = bundle.warnings.filter((x) => w.counted_warning_ids.includes(x.id));
  const act = async (action: string, payload: Record<string, string>, text: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("kiru_methodology_warning_update", { p_warning: w.id, p_action: action, p_payload: payload });
      if (error) throw error;
      setNote("");
      await onChanged(text);
    } catch (error) { notify(errorText(error), "error"); } finally { setBusy(false); }
  };
  const open = w.status !== "resuelto";

  return <div className="min-w-0 space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-lg font-bold text-slate-900">{WARNING_LEVEL_LABEL[w.level]}</h3>
          <p className="text-xs text-slate-500">{name(w.mentor_id)} · {COMPETENCIA_LABEL[w.competencia]} · {fmtDateTime(w.created_at)} · registrado por {name(w.created_by)}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{WARNING_STATUS_LABEL[w.status]}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {w.origin === "manual" ? "Registrado a mano." : `Viene de una revisión con resultado ${w.origin === "insuficiente" ? "B" : "C"}.`}{" "}
        {counted.length ? `Avisos que contaban al crearlo: ${counted.map((x) => fmtDay(x.created_at)).join(", ")}.` : "No había avisos de esta competencia en los 6 meses anteriores."}
        {!countsForLevel(w) && " Tiene más de 6 meses: ya no cuenta para el nivel de los siguientes, pero se conserva."}
      </p>
      {w.review_id && <button type="button" onClick={() => onOpenReview(w.review_id!)} className="mt-1 text-xs font-semibold text-emerald-800 underline">Ver la revisión de origen</button>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Box title="Criterio a revisar">{w.criterion}</Box>
        {w.expected_improvements && <Box title="Mejoras esperadas">{w.expected_improvements}</Box>}
        {w.manual_reference && <Box title="Referencia del manual">{w.manual_reference}</Box>}
        {w.recommended_action && <Box title="Recomendación">{w.recommended_action}</Box>}
        {w.meeting_at && <Box title="Reunión de seguimiento">{fmtDateTime(w.meeting_at)}{w.meeting_done_at ? ` · realizada ${fmtDay(w.meeting_done_at)}` : " · pendiente"}{w.meeting_note ? `. ${w.meeting_note}` : ""}</Box>}
        {w.assessment_kind && <Box title="Revisión metodológica">{w.assessment_kind === "prueba_conocimientos" ? "Prueba de conocimientos" : "Evaluación práctica"} pedida el {fmtDay(w.assessment_requested_at)}{w.assessment_result ? `. Resultado: ${w.assessment_result}` : ""}{w.reinforcement_measures ? `. Medidas: ${w.reinforcement_measures}` : ""}</Box>}
        {w.improvement_at && <Box title="Mejora observada">{fmtDay(w.improvement_at)}{w.improvement_note ? `. ${w.improvement_note}` : ""}</Box>}
        {w.resolved_at && <Box title="Resuelto">{fmtDateTime(w.resolved_at)} por {name(w.resolved_by)}{w.resolution_note ? `. ${w.resolution_note}` : ""}</Box>}
      </div>
    </div>

    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h4 className="text-sm font-semibold text-slate-900">Seguimiento</h4>
      <p className="text-xs text-slate-500">{w.level === 1 ? "Primer aviso: el mentor ya ha recibido el criterio y la referencia del manual." : w.level === 2 ? "Segundo aviso: programa una reunión breve para repasar criterios y ejemplos prácticos." : "Tercer aviso: pide una revisión de conocimientos (prueba o evaluación práctica) y registra el resultado y las medidas de refuerzo."} Las medidas adicionales las decide coordinación o administración.</p>
      {open && <>
        {w.status === "pendiente" && <button type="button" disabled={busy} onClick={() => void act("en_revision", {}, "Aviso en revisión.")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">Marcar en revisión</button>}
        {w.level >= 2 && !w.meeting_done_at && <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-700">Reunión breve<input type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 p-2 text-sm" /></label>
          <button type="button" disabled={busy || !meetingAt} onClick={() => void act("programar_reunion", { at: new Date(meetingAt).toISOString(), note }, "Reunión programada. El mentor recibe aviso y correo.")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50">{w.meeting_at ? "Cambiar fecha" : "Programar"}</button>
          {w.meeting_at && <button type="button" disabled={busy} onClick={() => void act("reunion_realizada", { note }, "Reunión registrada.")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">Reunión realizada</button>}
        </div>}
        {w.level >= 3 && !w.assessment_kind && <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void act("solicitar_revision", { kind: "prueba_conocimientos", note }, "Revisión pedida al mentor.")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">Pedir repetir la prueba de conocimientos</button>
          <button type="button" disabled={busy} onClick={() => void act("solicitar_revision", { kind: "evaluacion_practica", note }, "Revisión pedida al mentor.")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">Pedir una evaluación práctica</button>
        </div>}
        {w.assessment_kind && <div className="space-y-2">
          <TextArea label="Resultado de la revisión" value={result.result} onChange={(v) => setResult({ ...result, result: v })} max={2000} />
          <TextArea label="Medidas de refuerzo" value={result.measures} onChange={(v) => setResult({ ...result, measures: v })} max={2000} />
          <button type="button" disabled={busy || !result.result.trim()} onClick={() => void act("registrar_resultado", result, "Resultado registrado.")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50">Registrar resultado</button>
        </div>}
      </>}
      <TextArea label="Nota (para la reunión, la mejora o la resolución)" value={note} onChange={setNote} max={2000} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void act("mejora", { note }, "Mejora registrada.")} className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800">Registrar mejora</button>
        {open && <button type="button" disabled={busy} onClick={() => void act("resolver", { note }, "Aviso resuelto. Se conserva en el historial.")} className="rounded-xl bg-emerald-800 px-3 py-2 text-sm font-semibold text-white">Marcar resuelto</button>}
      </div>
    </div>
    <Timeline events={events} name={name} />
  </div>;
}

/* ---------------------------------------------------------------- Piezas */

function Timeline({ events, name }: { events: ReviewBundle["events"]; name: (id: string | null | undefined) => string }) {
  if (!events.length) return null;
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4" />Historial</h4>
    <ol className="space-y-1.5 border-l border-slate-200 pl-3">
      {events.map((ev) => <li key={ev.id} className="text-xs text-slate-600"><span className="font-semibold text-slate-800">{EVENT_LABEL[ev.action] ?? ev.action}</span> · {name(ev.actor_id)} · {fmtDateTime(ev.created_at)}</li>)}
    </ol>
  </div>;
}

function SummaryCard({ label, value, warn, onClick }: { label: string; value: number; warn?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border p-3 text-left transition hover:border-slate-300 ${warn && value ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-50/60"}`}>
    <span className="block text-2xl font-bold text-slate-900">{value}</span>
    <span className="block text-[11px] leading-tight text-slate-600">{label}</span>
  </button>;
}

function Empty({ text }: { text: string }) {
  return <div className="flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"><ClipboardCheck className="h-4 w-4 shrink-0" />{text}</div>;
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{children}</p></div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="text-[11px] font-semibold text-slate-600">{label}
    <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 block max-w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-normal text-slate-800">
      {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select></label>;
}

function TextArea({ label, value, onChange, max, placeholder }: { label: string; value: string; onChange: (value: string) => void; max: number; placeholder?: string }) {
  return <label className="block text-xs font-semibold text-slate-700">{label}
    <textarea value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={2} placeholder={placeholder}
      className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" /></label>;
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-slate-700">{label}
    <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm font-normal" /></label>;
}

