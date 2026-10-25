"use client";

import React, { useEffect, useMemo, useState } from "react";
import ExercisePlayer from "@/components/lengua/ExercisePlayer";
import { getKiruRecords, saveKiruRecord } from "@/lib/kiru-records";
import { supabase } from "@/lib/supabase";
import {
  buildSession,
  computeMastery,
  isLenguaCourse,
  LENGUA_COURSES,
  LENGUA_UNITS,
  LEVEL_LABELS,
  parseLenguaAttempt,
  parseLenguaTask,
  recommendedUnit,
  type LenguaAnswer,
  type LenguaAttempt,
  type LenguaCourse,
  type LenguaExercise,
  type LenguaLevel,
  type LenguaTask,
} from "@/lib/lengua-engine";

export const LEVEL_STYLES: Record<LenguaLevel, string> = {
  sin_datos: "bg-[#F3F1ED] text-[#77736B]",
  iniciando: "bg-[#F8ECE5] text-[#9A5B3C]",
  en_proceso: "bg-[#F6F0DC] text-[#866A1F]",
  dominado: "bg-[#EEF2E6] text-[#4F6A30]",
};

type Session = { exercises: LenguaExercise[]; taskId?: string; title: string };

export default function LenguaStudent() {
  const [userId, setUserId] = useState("");
  const [course, setCourse] = useState<LenguaCourse>("1EP");
  const [tasks, setTasks] = useState<LenguaTask[]>([]);
  const [attempts, setAttempts] = useState<LenguaAttempt[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<{ score: number; total: number; status: string } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const [activity, taskRecords, progress] = await Promise.all([getKiruRecords("activity"), getKiruRecords("task"), getKiruRecords("progress")]);
        if (!active) return;
        setUserId(user?.id ?? "");
        const loadedTasks = taskRecords.map((record) => parseLenguaTask(record.data)).filter((task): task is LenguaTask => Boolean(task));
        setTasks(loadedTasks);
        setAttempts(progress.map((record) => parseLenguaAttempt(record.data)).filter((attempt): attempt is LenguaAttempt => Boolean(attempt)));
        // El curso lo fija el mentor; si no lo ha hecho, se usa el de la última tarea.
        const profile = activity.map((record) => record.data as { kind?: string; course?: string }).find((data) => data?.kind === "lengua_profile");
        const assignedCourse = profile?.course ?? loadedTasks[0]?.course;
        if (isLenguaCourse(assignedCourse)) setCourse(assignedCourse);
      } catch (error) {
        console.error("No se pudieron cargar los datos de Lengua.", error);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const mastery = useMemo(() => computeMastery(attempts.filter((attempt) => attempt.course === course), course), [attempts, course]);
  const doneTaskIds = useMemo(() => new Set(attempts.map((attempt) => attempt.taskId).filter(Boolean)), [attempts]);
  const courseTasks = tasks.filter((task) => task.course === course);
  const pendingTasks = courseTasks.filter((task) => !doneTaskIds.has(task.id));
  const next = recommendedUnit(mastery);

  const start = (newSession: Session) => {
    if (!newSession.exercises.length) return;
    setResult(null);
    setSession(newSession);
  };

  const finish = async (answers: LenguaAnswer[]) => {
    if (!session) return;
    const score = answers.filter((answer) => answer.correct).length;
    const attempt: LenguaAttempt = { module: "lengua", kind: "lengua_attempt", studentId: userId, taskId: session.taskId, course, score, total: answers.length, completedAt: new Date().toISOString(), answers };
    setResult({ score, total: answers.length, status: "Guardando…" });
    setAttempts((previous) => [attempt, ...previous]);
    try {
      await saveKiruRecord("progress", `lengua_attempt_${Date.now()}`, attempt);
      setResult({ score, total: answers.length, status: "¡Guardado! Tu mentor ya puede verlo." });
    } catch {
      setResult({ score, total: answers.length, status: "No se ha podido guardar. Comprueba la conexión." });
    }
  };

  if (session) {
    return (
      <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[#77736B]">{session.title}</p>
          <button type="button" onClick={() => setSession(null)} className="text-xs font-semibold text-[#77736B] hover:text-[#292825]">Salir</button>
        </div>
        <ExercisePlayer exercises={session.exercises} onFinish={finish} onClose={() => setSession(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Lengua · {LENGUA_COURSES[course]}</p>
            <h2 className="text-2xl font-serif text-[#292825] font-bold mt-1">Leo, escribo y juego</h2>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
            {(Object.keys(LENGUA_COURSES) as LenguaCourse[]).map((item) => (
              <button key={item} type="button" onClick={() => setCourse(item)} className={`px-3 py-2 rounded-xl ${course === item ? "bg-[#242321] text-white" : "bg-[#FAF8F5] border border-[#E7E3DC] text-[#555149]"}`}>{LENGUA_COURSES[item]}</button>
            ))}
          </div>
        </div>

        {result && (
          <p className="rounded-2xl bg-[#F7F5F1] px-4 py-3 text-sm text-[#45433F]">
            Última sesión: <strong>{result.score} / {result.total}</strong> · {result.status}
          </p>
        )}

        {next && (
          <button
            type="button"
            onClick={() => start({ title: `Práctica: ${next.unit.title}`, exercises: buildSession({ course, units: [next.unit.id], difficulty: "auto", questionCount: 8, includeTrace: true }, mastery) })}
            className="w-full text-left rounded-2xl bg-[#8A9870] text-white p-5 hover:bg-[#76845E] transition"
          >
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Te toca practicar</p>
            <p className="text-xl font-bold mt-1">{next.unit.title} →</p>
            <p className="text-sm opacity-90">{next.unit.description}</p>
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-3">
        <h3 className="font-serif text-lg font-bold text-[#292825]">Tareas de tu mentor</h3>
        {courseTasks.length === 0 && <p className="text-sm text-[#77736B]">No tienes tareas de Lengua ahora mismo.</p>}
        {courseTasks.map((task) => {
          const done = doneTaskIds.has(task.id);
          return (
            <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EEEAE3] p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-[#292825]">{task.title}{done && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EEF2E6] text-[#4F6A30]">Hecha</span>}</p>
                <p className="text-xs text-[#77736B]">{task.questionCount} ejercicios{task.dueDate ? ` · para el ${new Date(task.dueDate).toLocaleDateString("es-ES")}` : ""}</p>
                {task.note && <p className="text-xs text-[#555149] italic">«{task.note}»</p>}
              </div>
              <button
                type="button"
                onClick={() => start({ title: task.title, taskId: task.id, exercises: buildSession(task, mastery) })}
                className={`px-4 py-2 rounded-xl text-sm font-semibold ${done ? "bg-[#FAF8F5] border border-[#E7E3DC] text-[#555149]" : "bg-[#242321] text-white"}`}
              >
                {done ? "Repetir" : "Empezar"}
              </button>
            </div>
          );
        })}
        {pendingTasks.length > 0 && <p className="text-xs text-[#77736B]">Te quedan {pendingTasks.length} {pendingTasks.length === 1 ? "tarea" : "tareas"} por hacer.</p>}
      </div>

      <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-3">
        <h3 className="font-serif text-lg font-bold text-[#292825]">Mis unidades</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mastery.map((item) => (
            <button
              key={item.unit.id}
              type="button"
              onClick={() => start({ title: `Práctica: ${item.unit.title}`, exercises: buildSession({ course, units: [item.unit.id], difficulty: "auto", questionCount: 8, includeTrace: true }, mastery) })}
              className="text-left rounded-2xl border border-[#EEEAE3] p-4 hover:bg-[#FAF8F5] space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[#292825]">{item.unit.title}</p>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${LEVEL_STYLES[item.level]}`}>{LEVEL_LABELS[item.level]}</span>
              </div>
              <div className="h-2 rounded-full bg-[#EEECE7] overflow-hidden"><div className="h-full bg-[#8A9870]" style={{ width: `${Math.round(item.accuracy * 100)}%` }} /></div>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[#8D887F]">{LENGUA_UNITS.filter((unit) => unit.course === course).length} unidades · los ejercicios se adaptan a cómo vas en cada una.</p>
      </div>
    </div>
  );
}
