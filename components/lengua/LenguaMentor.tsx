"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getKiruRecords, saveKiruRecord, type KiruRecord } from "@/lib/kiru-records";
import { LEVEL_STYLES } from "@/components/lengua/LenguaStudent";
import {
  buildReport,
  DIFFICULTY_LABELS,
  LENGUA_COURSES,
  LENGUA_DATABASE,
  LENGUA_UNITS,
  LEVEL_LABELS,
  parseLenguaAttempt,
  parseLenguaTask,
  type LenguaAttempt,
  type LenguaCourse,
  type LenguaReport,
  type LenguaTask,
  type LenguaTaskConfig,
} from "@/lib/lengua-engine";

type Student = { id: string; username: string; name: string };

const DIFFICULTY_OPTIONS: Array<{ id: LenguaTaskConfig["difficulty"]; label: string }> = [
  { id: "auto", label: "Según su nivel" },
  { id: "facil", label: DIFFICULTY_LABELS.facil },
  { id: "medio", label: DIFFICULTY_LABELS.medio },
  { id: "desafiante", label: DIFFICULTY_LABELS.desafiante },
  { id: "todas", label: "Mezcla" },
];

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}

/** Abre el informe en una ventana aparte lista para imprimir o guardar como PDF. */
function printReport(student: Student, report: LenguaReport) {
  const popup = window.open("", "_blank", "width=820,height=900");
  if (!popup) return;
  const rows = report.mastery.map((item) => `<tr><td>${escapeHtml(item.unit.title)}</td><td>${LEVEL_LABELS[item.level]}</td><td>${item.answered ? Math.round(item.accuracy * 100) + " %" : "—"}</td><td>${item.answered}</td></tr>`).join("");
  const skills = report.bySkill.map((item) => `<li>${escapeHtml(item.skill)}: ${Math.round(item.accuracy * 100)} % de aciertos (${item.answered} ejercicios)</li>`).join("");
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de Lengua · ${escapeHtml(student.name)}</title>
<style>body{font-family:Georgia,serif;color:#292825;max-width:720px;margin:32px auto;padding:0 16px;line-height:1.5}h1{margin-bottom:0}p.meta{color:#77736B;margin-top:4px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border-bottom:1px solid #E7E3DC;padding:8px;text-align:left;font-family:system-ui,sans-serif;font-size:14px}.box{background:#F7F5F1;border-radius:12px;padding:16px}</style></head>
<body><h1>Informe de Lengua</h1><p class="meta">${escapeHtml(student.name)} · ${LENGUA_COURSES[report.course]} · ${new Date(report.generatedAt).toLocaleDateString("es-ES")} · Método Kiru</p>
<div class="box"><p>${escapeHtml(report.summary)}</p></div>
<h2>Unidades</h2><table><thead><tr><th>Unidad</th><th>Nivel</th><th>Aciertos</th><th>Ejercicios</th></tr></thead><tbody>${rows}</tbody></table>
${skills ? `<h2>Por destrezas</h2><ul>${skills}</ul>` : ""}
<p class="meta">Tareas pendientes: ${report.pendingTasks}</p></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

export default function LenguaMentor({ student, onStatus }: { student: Student | undefined; onStatus: (message: string) => void }) {
  const [course, setCourse] = useState<LenguaCourse>("1EP");
  const [tasks, setTasks] = useState<LenguaTask[]>([]);
  const [attempts, setAttempts] = useState<LenguaAttempt[]>([]);
  const [form, setForm] = useState<{ title: string; units: string[]; difficulty: LenguaTaskConfig["difficulty"]; questionCount: number; includeTrace: boolean; dueDate: string; note: string }>({
    title: "", units: [], difficulty: "auto", questionCount: 10, includeTrace: true, dueDate: "", note: "",
  });

  useEffect(() => {
    if (!student) return;
    let active = true;
    const ownedByStudent = <T,>(records: KiruRecord<T>[]) => records.filter((record) => record.owner_id === student.id).map((record) => record.data);
    const load = async () => {
      try {
        const [activity, taskRecords, progress] = await Promise.all([getKiruRecords("activity"), getKiruRecords("task"), getKiruRecords("progress")]);
        if (!active) return;
        const loadedTasks = ownedByStudent(taskRecords).map(parseLenguaTask).filter((task): task is LenguaTask => Boolean(task)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setTasks(loadedTasks);
        setAttempts(ownedByStudent(progress).map(parseLenguaAttempt).filter((attempt): attempt is LenguaAttempt => Boolean(attempt)).sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
        const profile = ownedByStudent(activity).map((data) => data as { kind?: string; course?: string }).find((data) => data?.kind === "lengua_profile");
        const assignedCourse = profile?.course ?? loadedTasks[0]?.course;
        setCourse(assignedCourse === "2EP" ? "2EP" : "1EP");
      } catch (error) {
        console.error("No se pudo cargar el progreso de Lengua.", error);
      }
    };
    void load();
    return () => { active = false; };
  }, [student]);

  const report = useMemo(() => buildReport(student?.name ?? "El alumno", course, attempts, tasks), [student, course, attempts, tasks]);
  const units = LENGUA_UNITS.filter((unit) => unit.course === course);
  const available = LENGUA_DATABASE.filter((exercise) => exercise.course === course && (!form.units.length || form.units.includes(exercise.unit)) && (form.includeTrace || exercise.type !== "trace")).length;

  if (!student) return <p className="text-sm text-[#77736B]">Selecciona un alumno para gestionar Lengua.</p>;

  const changeCourse = async (value: LenguaCourse) => {
    setCourse(value);
    setForm((previous) => ({ ...previous, units: [] }));
    try {
      await saveKiruRecord("activity", `lengua_profile_${student.id}`, { kind: "lengua_profile", studentId: student.id, course: value, updatedAt: new Date().toISOString() }, student.id);
      onStatus(`Curso de Lengua de @${student.username}: ${LENGUA_COURSES[value]}.`);
    } catch {
      onStatus("No se pudo guardar el curso de Lengua.");
    }
  };

  const sendTask = async (event: React.FormEvent) => {
    event.preventDefault();
    const createdAt = new Date();
    const id = String(createdAt.getTime());
    const selected = units.filter((unit) => form.units.includes(unit.id)).map((unit) => unit.title);
    const task: LenguaTask = {
      kind: "lengua_task",
      id,
      studentId: student.id,
      title: form.title.trim() || (selected.length ? selected.join(" + ") : `Repaso de ${LENGUA_COURSES[course]}`),
      note: form.note.trim() || undefined,
      dueDate: form.dueDate || undefined,
      createdAt: createdAt.toISOString(),
      course,
      units: form.units,
      difficulty: form.difficulty,
      questionCount: form.questionCount,
      includeTrace: form.includeTrace,
    };
    try {
      await saveKiruRecord("task", `lengua_task_${id}`, task, student.id);
      setTasks((previous) => [task, ...previous]);
      setForm((previous) => ({ ...previous, title: "", note: "", dueDate: "" }));
      onStatus(`Tarea de Lengua enviada a @${student.username}.`);
    } catch {
      onStatus("No se pudo enviar la tarea de Lengua.");
    }
  };

  const saveReport = async () => {
    try {
      await saveKiruRecord("progress", `lengua_report_${student.id}_${report.generatedAt.slice(0, 10)}`, { kind: "lengua_report", module: "lengua", studentId: student.id, ...report }, student.id);
      onStatus("Informe de Lengua guardado.");
    } catch {
      onStatus("No se pudo guardar el informe.");
    }
  };

  const attemptsByTask = (taskId: string) => attempts.filter((attempt) => attempt.taskId === taskId);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="bg-white p-5 rounded-3xl border border-[#E7E3DC] shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-bold text-[#292825]">Lengua de @{student.username}</h3>
          <p className="text-xs text-[#77736B]">El curso decide el temario que ve el alumno.</p>
        </div>
        <div className="flex gap-1.5 text-xs font-semibold">
          {(Object.keys(LENGUA_COURSES) as LenguaCourse[]).map((item) => (
            <button key={item} type="button" onClick={() => void changeCourse(item)} className={`px-3 py-2 rounded-xl ${course === item ? "bg-[#242321] text-white" : "bg-[#FAF8F5] border border-[#E7E3DC] text-[#555149]"}`}>{LENGUA_COURSES[item]}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={sendTask} className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
          <h3 className="font-serif text-base font-bold text-[#292825]">Enviar tarea</h3>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Título (opcional)" className="w-full p-2.5 rounded-xl border border-[#E7E3DC] text-sm" />
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Unidades (ninguna = todas)</p>
            <div className="flex flex-wrap gap-1.5">
              {units.map((unit) => {
                const checked = form.units.includes(unit.id);
                return (
                  <button key={unit.id} type="button" onClick={() => setForm({ ...form, units: checked ? form.units.filter((item) => item !== unit.id) : [...form.units, unit.id] })} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${checked ? "bg-[#242321] text-white" : "bg-[#FAF8F5] border border-[#E7E3DC] text-[#555149]"}`}>
                    {unit.title}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Dificultad</p>
            <div className="flex flex-wrap gap-1.5">
              {DIFFICULTY_OPTIONS.map((option) => (
                <button key={option.id} type="button" onClick={() => setForm({ ...form, difficulty: option.id })} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${form.difficulty === option.id ? "bg-[#242321] text-white" : "bg-[#FAF8F5] border border-[#E7E3DC] text-[#555149]"}`}>{option.label}</button>
              ))}
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#555149]">{form.questionCount} ejercicios · {available} disponibles con estas unidades</span>
            <input type="range" min={3} max={20} value={form.questionCount} onChange={(event) => setForm({ ...form, questionCount: Number(event.target.value) })} className="w-full accent-[#242321]" />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#45433F]">
            <input type="checkbox" checked={form.includeTrace} onChange={(event) => setForm({ ...form, includeTrace: event.target.checked })} />
            Incluir trazado de letras con el dedo
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="space-y-1"><span className="text-xs font-semibold text-[#555149]">Fecha de entrega</span><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="w-full p-2.5 rounded-xl border border-[#E7E3DC] text-sm" /></label>
            <label className="space-y-1"><span className="text-xs font-semibold text-[#555149]">Nota para el alumno</span><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="¡Tú puedes!" className="w-full p-2.5 rounded-xl border border-[#E7E3DC] text-sm" /></label>
          </div>
          <button type="submit" className="w-full py-2.5 rounded-xl bg-[#242321] text-white text-sm font-semibold hover:bg-[#3A3835]">Enviar tarea a @{student.username}</button>
        </form>

        <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-3">
          <h3 className="font-serif text-base font-bold text-[#292825]">Tareas enviadas</h3>
          {tasks.filter((task) => task.course === course).length === 0 && <p className="text-sm text-[#77736B]">Todavía no has enviado tareas de este curso.</p>}
          {tasks.filter((task) => task.course === course).map((task) => {
            const done = attemptsByTask(task.id);
            const best = done.reduce((top, attempt) => Math.max(top, attempt.total ? attempt.score / attempt.total : 0), 0);
            const overdue = !done.length && task.dueDate && new Date(task.dueDate) < new Date(new Date().toDateString());
            return (
              <div key={task.id} className="rounded-2xl border border-[#EEEAE3] p-3.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#292825]">{task.title}</p>
                  <p className="text-[11px] text-[#77736B]">{task.questionCount} ejercicios{task.dueDate ? ` · entrega ${new Date(task.dueDate).toLocaleDateString("es-ES")}` : ""}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${done.length ? LEVEL_STYLES.dominado : overdue ? LEVEL_STYLES.iniciando : LEVEL_STYLES.sin_datos}`}>
                  {done.length ? `Hecha · ${Math.round(best * 100)} %` : overdue ? "Vencida" : "Pendiente"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-base font-bold text-[#292825]">Progreso e informe</h3>
            <p className="text-xs text-[#77736B]">{report.attempts} sesiones · {report.exercisesDone} ejercicios · {Math.round(report.accuracy * 100)} % de aciertos</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void saveReport()} className="px-3 py-2 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] text-xs font-semibold text-[#555149]">Guardar informe</button>
            <button type="button" onClick={() => printReport(student, report)} className="px-3 py-2 rounded-xl bg-[#242321] text-white text-xs font-semibold">Imprimir / PDF</button>
          </div>
        </div>
        <p className="rounded-2xl bg-[#F7F5F1] p-4 text-sm text-[#343330] leading-relaxed">{report.summary}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {report.mastery.map((item) => (
            <div key={item.unit.id} className="rounded-2xl border border-[#EEEAE3] p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[#292825]">{item.unit.title}</p>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${LEVEL_STYLES[item.level]}`}>{LEVEL_LABELS[item.level]}</span>
              </div>
              <div className="h-2 rounded-full bg-[#EEECE7] overflow-hidden"><div className="h-full bg-[#8A9870]" style={{ width: `${Math.round(item.accuracy * 100)}%` }} /></div>
              <p className="text-[11px] text-[#77736B]">{item.answered ? `${item.correct}/${item.answered} aciertos recientes · siguiente: ${DIFFICULTY_LABELS[item.nextDifficulty].toLowerCase()}` : "Sin ejercicios todavía"}</p>
            </div>
          ))}
        </div>
        {attempts.filter((attempt) => attempt.course === course).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Últimas sesiones</p>
            {attempts.filter((attempt) => attempt.course === course).slice(0, 6).map((attempt) => (
              <div key={attempt.completedAt} className="flex justify-between text-xs text-[#45433F] border-b border-[#F1EEE8] py-1.5">
                <span>{new Date(attempt.completedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} · {attempt.taskId ? tasks.find((task) => task.id === attempt.taskId)?.title ?? "Tarea" : "Práctica libre"}</span>
                <span className="font-bold">{attempt.score}/{attempt.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
