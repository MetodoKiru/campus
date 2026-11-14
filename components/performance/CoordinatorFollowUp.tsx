"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CalculaloCheckRow, LogErrorMarkRow, StudentPlanTool, StudentPlanToolRow } from "@/lib/database.types";
import CoordinatorEvidence from "@/components/performance/CoordinatorEvidence";
import { LOG_ERROR_KIND_LABEL, errorMessage, fmtDay, mondaysOfMonth, monthOptions, todayIso } from "@/lib/desempeno";

type Person = { id: string; full_name: string; role: string };
type Props = {
  people: Person[];
  /** alumno → mentor (lo que el coordinador puede ver por RLS). */
  mentorOf: Record<string, string>;
  notify: (text: string, type: "success" | "error") => void;
};

const TOOLS: { id: StudentPlanTool; label: string }[] = [
  { id: "ingles", label: "Inglés" },
  { id: "lengua", label: "Lengua" },
  { id: "tarjetas", label: "Tarjetas" },
];
const MARK_STATUS: Record<LogErrorMarkRow["status"], { label: string; style: string }> = {
  abierta: { label: "Esperando al mentor", style: "bg-amber-50 text-amber-800 border-amber-200" },
  respondida: { label: "Contestada", style: "bg-sky-50 text-sky-800 border-sky-200" },
  retirada: { label: "Retirada", style: "bg-slate-100 text-slate-600 border-slate-200" },
};

type FollowUpData = { tools: StudentPlanToolRow[]; checks: CalculaloCheckRow[]; marks: LogErrorMarkRow[]; logDates: Record<string, string | null> };

async function fetchFollowUp(month: string): Promise<FollowUpData> {
  const [toolRows, checkRows, markRows] = await Promise.all([
    supabase.from("kiru_student_plan_tools").select("*").is("active_to", null),
    supabase.from("kiru_calculalo_checks").select("*").eq("month", month),
    supabase.from("kiru_log_error_marks").select("*").order("marked_at", { ascending: false }).limit(200),
  ]);
  const failed = [toolRows, checkRows, markRows].find((r) => r.error);
  if (failed?.error) throw failed.error;
  const marks = (markRows.data ?? []) as LogErrorMarkRow[];
  const logIds = [...new Set(marks.map((m) => m.session_log_id))];
  let logDates: Record<string, string | null> = {};
  if (logIds.length) {
    const { data } = await supabase.from("kiru_session_logs").select("id,session_date").in("id", logIds);
    logDates = Object.fromEntries((data ?? []).map((l) => [l.id, l.session_date]));
  }
  return { tools: (toolRows.data ?? []) as StudentPlanToolRow[], checks: (checkRows.data ?? []) as CalculaloCheckRow[], marks, logDates };
}

/**
 * «Seguimiento» del panel de coordinación (desempeño, fase 2a): herramientas
 * obligatorias de cada alumno, ficha mensual de Cálculalo y errores marcados en
 * registros. Aquí no se ve ninguna puntuación: solo administración la ve.
 */
export default function CoordinatorFollowUp({ people, mentorOf, notify }: Props) {
  const months = useMemo(() => monthOptions(4), []);
  const [month, setMonth] = useState(months[0].value);
  const [mentorFilter, setMentorFilter] = useState("todos");
  const [tools, setTools] = useState<StudentPlanToolRow[]>([]);
  const [checks, setChecks] = useState<CalculaloCheckRow[]>([]);
  const [marks, setMarks] = useState<LogErrorMarkRow[]>([]);
  const [logDates, setLogDates] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const name = useCallback((id: string | null | undefined) => people.find((p) => p.id === id)?.full_name ?? "—", [people]);
  const students = useMemo(() => Object.keys(mentorOf)
    .filter((s) => mentorFilter === "todos" || mentorOf[s] === mentorFilter)
    .sort((a, b) => name(a).localeCompare(name(b), "es")), [mentorOf, mentorFilter, name]);
  const mentors = useMemo(() => [...new Set(Object.values(mentorOf))].sort((a, b) => name(a).localeCompare(name(b), "es")), [mentorOf, name]);

  const apply = useCallback((d: FollowUpData) => {
    setTools(d.tools); setChecks(d.checks); setMarks(d.marks); setLogDates(d.logDates); setLoadError("");
  }, []);

  useEffect(() => {
    let alive = true;
    fetchFollowUp(month)
      .then((d) => { if (alive) apply(d); })
      .catch((e) => { if (alive) setLoadError(errorMessage(e, "No se pudo cargar el seguimiento.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month, apply]);

  const reload = async () => {
    try { apply(await fetchFollowUp(month)); } catch (e) { setLoadError(errorMessage(e, "No se pudo cargar el seguimiento.")); }
  };

  const visibleMarks = marks.filter((m) => mentorFilter === "todos" || m.mentor_id === mentorFilter);
  const openMarks = visibleMarks.filter((m) => m.status === "abierta");

  return (
    <section className="space-y-6">
      <div className="bg-white rounded-3xl border border-[#E7E3DC] p-5 space-y-2">
        <h2 className="font-serif text-lg font-bold text-[#292825] flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-cyan-800" /> Seguimiento de alumnos</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          SkillCoins (una vez por semana), Cálculalo (4 días o más por semana) y «Descubrirme» son obligatorios para todos los alumnos.
          Inglés, lengua y tarjetas solo lo son si los marcas aquí. Todo esto alimenta el desempeño de los mentores, que de momento solo ve Administración.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select value={mentorFilter} onChange={(e) => setMentorFilter(e.target.value)} aria-label="Mentor" className="p-2 rounded-xl border border-slate-200 bg-white text-xs">
            <option value="todos">Todos los mentores</option>
            {mentors.map((m) => <option key={m} value={m}>{name(m)}</option>)}
          </select>
          <select value={month} onChange={(e) => { setLoading(true); setMonth(e.target.value); }} aria-label="Mes de la ficha de Cálculalo" className="p-2 rounded-xl border border-slate-200 bg-white text-xs">
            {months.map((m) => <option key={m.value} value={m.value}>Cálculalo · {m.label}</option>)}
          </select>
          <button onClick={() => void reload()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {loadError && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">{loadError}</p>}
      {loading && <p className="text-xs text-slate-500 flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" /> Cargando…</p>}

      {!loading && (
        <>
          <CoordinatorEvidence people={people} mentorFilter={mentorFilter} notify={notify} />

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#292825]">Errores en registros {openMarks.length > 0 && <span className="text-amber-700">({openMarks.length} esperando al mentor)</span>}</h3>
            <p className="text-[11px] text-slate-500">Se marcan desde «Registros de sesión», abriendo el registro. El mentor tiene 2 días laborables para corregirlo o contestar.</p>
            {visibleMarks.length === 0 && <p className="text-xs text-slate-500">No hay errores marcados.</p>}
            {visibleMarks.map((m) => (
              <MarkCard key={m.id} mark={m} mentor={name(m.mentor_id)} student={name(m.student_id)} marker={name(m.marked_by)}
                sessionDate={logDates[m.session_log_id] ?? null} notify={notify} onSaved={reload} />
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#292825]">Alumnos: herramientas y ficha de Cálculalo de {months.find((m) => m.value === month)?.label}</h3>
            {students.length === 0 && <p className="text-xs text-slate-500">No hay alumnos asignados.</p>}
            {students.map((s) => (
              <StudentCard key={`${s}-${month}`} studentId={s} student={name(s)} mentor={name(mentorOf[s])} month={month}
                tools={tools.filter((t) => t.student_id === s)} check={checks.find((c) => c.student_id === s) ?? null}
                notify={notify} onSaved={reload} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function MarkCard({ mark, mentor, student, marker, sessionDate, notify, onSaved }: {
  mark: LogErrorMarkRow; mentor: string; student: string; marker: string; sessionDate: string | null;
  notify: Props["notify"]; onSaved: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = MARK_STATUS[mark.status];
  const late = mark.status === "abierta" ? new Date(mark.due_at) < new Date() : !!mark.replied_at && new Date(mark.replied_at) > new Date(mark.due_at);

  const withdraw = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("kiru_log_error_withdraw", { p_mark: mark.id, p_reason: reason });
    setBusy(false);
    if (error) { notify(errorMessage(error, "No se pudo retirar."), "error"); return; }
    notify("Marca retirada: ya no cuenta para el mentor.", "success");
    await onSaved();
  };

  return (
    <article className="bg-white rounded-2xl border border-[#E7E3DC] p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">{mentor} · registro del {fmtDay(sessionDate)} de {student}</p>
          <p className="text-[11px] text-slate-500">{LOG_ERROR_KIND_LABEL[mark.kind]} · marcado el {fmtDay(mark.marked_at)} por {marker} · plazo hasta el {fmtDay(mark.due_at)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {late && mark.status !== "retirada" && <span className="text-[10px] rounded-full border border-rose-200 bg-rose-50 text-rose-800 px-2 py-0.5 font-semibold">{mark.status === "abierta" ? "Plazo vencido" : "Contestó tarde"}</span>}
          <span className={`text-[10px] rounded-full border px-2 py-0.5 font-semibold ${status.style}`}>{status.label}</span>
        </div>
      </div>
      <p className="text-xs text-slate-700 whitespace-pre-line">{mark.comment}</p>
      {mark.reply && <p className="text-xs text-sky-900 bg-sky-50 rounded-xl p-2.5 whitespace-pre-line"><strong>Respuesta del mentor ({fmtDay(mark.replied_at)}):</strong> {mark.reply}</p>}
      {mark.status === "retirada" && <p className="text-[11px] text-slate-500">Retirada el {fmtDay(mark.withdrawn_at)}{mark.withdraw_reason ? `: ${mark.withdraw_reason}` : ""}</p>}
      {mark.status !== "retirada" && (withdrawing ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Por qué se retira (por ejemplo, el registro estaba bien)" className="flex-1 p-2.5 rounded-xl border border-slate-200 bg-white text-xs" />
          <button disabled={busy || !reason.trim()} onClick={() => void withdraw()} className="rounded-xl bg-cyan-800 px-3 py-2 text-[11px] font-semibold text-white hover:bg-cyan-900 disabled:opacity-50">Retirar la marca</button>
          <button disabled={busy} onClick={() => setWithdrawing(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
        </div>
      ) : (
        <button onClick={() => setWithdrawing(true)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800">Retirar (deja de contar)</button>
      ))}
    </article>
  );
}

function StudentCard({ studentId, student, mentor, month, tools, check, notify, onSaved }: {
  studentId: string; student: string; mentor: string; month: string; tools: StudentPlanToolRow[]; check: CalculaloCheckRow | null;
  notify: Props["notify"]; onSaved: () => Promise<void>;
}) {
  const today = todayIso();
  const weeks = useMemo(() => mondaysOfMonth(month).filter((w) => w <= today), [month, today]);
  const [ok, setOk] = useState<Record<string, boolean>>(() => Object.fromEntries((check?.weeks ?? []).map((w) => [w.week, w.ok])));
  const [prepared, setPrepared] = useState<boolean | null>(check ? check.mentor_prepared : null);
  const [quality, setQuality] = useState<string>(check?.quality ? String(check.quality) : "");
  const [note, setNote] = useState(check?.note ?? "");
  const [busy, setBusy] = useState(false);

  const toggleTool = async (tool: StudentPlanTool, required: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("kiru_set_student_tool", { p_student: studentId, p_tool: tool, p_required: required });
    setBusy(false);
    if (error) { notify(errorMessage(error, "No se pudo guardar."), "error"); return; }
    await onSaved();
  };

  const save = async () => {
    if (prepared === null) { notify("Indica si el mentor preparó actividades.", "error"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("kiru_save_calculalo_check", {
      p_student: studentId, p_month: month, p_weeks: weeks.map((w) => ({ week: w, ok: !!ok[w] })),
      p_prepared: prepared, p_quality: quality ? Number(quality) : null, p_note: note,
    });
    setBusy(false);
    if (error) { notify(errorMessage(error, "No se pudo guardar la ficha."), "error"); return; }
    notify(`Ficha de Cálculalo de ${student.split(" ")[0]} guardada.`, "success");
    await onSaved();
  };

  return (
    <article className="bg-white rounded-2xl border border-[#E7E3DC] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{student}</p>
          <p className="text-[11px] text-slate-500">Mentor: {mentor}</p>
        </div>
        {check
          ? <span className="text-[10px] rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-0.5 font-semibold flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Ficha guardada el {fmtDay(check.updated_at)}</span>
          : <span className="text-[10px] rounded-full border border-amber-200 bg-amber-50 text-amber-800 px-2 py-0.5 font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Ficha sin rellenar</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-500">Obligatorio para este alumno:</span>
        {TOOLS.map((t) => {
          const on = tools.some((row) => row.tool === t.id);
          return (
            <button key={t.id} disabled={busy} onClick={() => void toggleTool(t.id, !on)} aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${on ? "border-cyan-800 bg-cyan-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {t.label}{on ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl bg-[#FAF8F5] border border-[#EFEBE4] p-3 space-y-2.5">
        <p className="text-[11px] font-semibold text-slate-700">Cálculalo: ¿trabajó 4 días o más esa semana? (mirando las fechas de sus actividades)</p>
        {weeks.length === 0 ? <p className="text-[11px] text-slate-500">Aún no ha empezado ninguna semana de este mes.</p> : (
          <div className="flex flex-wrap gap-2">
            {weeks.map((w) => (
              <label key={w} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] cursor-pointer ${ok[w] ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>
                <input type="checkbox" checked={!!ok[w]} onChange={(e) => setOk({ ...ok, [w]: e.target.checked })} className="accent-cyan-800" />
                Semana del {fmtDay(w)}
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-slate-700">¿El mentor preparó actividades este mes?</span>
          {[true, false].map((v) => (
            <label key={String(v)} className="flex items-center gap-1 text-[11px] text-slate-700">
              <input type="radio" name={`prep-${studentId}`} checked={prepared === v} onChange={() => setPrepared(v)} className="accent-cyan-800" /> {v ? "Sí" : "No"}
            </label>
          ))}
          <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Calidad (opcional)" className="p-1.5 rounded-lg border border-slate-200 bg-white text-[11px]">
            <option value="">Calidad (opcional)</option>
            {[1, 2, 3, 4, 5].map((q) => <option key={q} value={q}>{q} de 5</option>)}
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Nota (opcional)" className="flex-1 p-2 rounded-xl border border-slate-200 bg-white text-xs" />
          <button disabled={busy} onClick={() => void save()} className="rounded-xl bg-cyan-800 px-3 py-2 text-[11px] font-semibold text-white hover:bg-cyan-900 disabled:opacity-50">Guardar ficha</button>
        </div>
      </div>
    </article>
  );
}
