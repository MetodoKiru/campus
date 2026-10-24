"use client";

import React, { useEffect, useState } from "react";
import { RefreshCw, Send, Trash2 } from "lucide-react";
import ExerciseCard from "@/components/english/ExerciseCard";
import { ENGLISH_LEVELS, EnglishLevelId, EnglishSkill, findLevel, findUnit, SKILL_LABELS } from "@/lib/english/curriculum";
import {
  DIFFICULTY_LABELS,
  EXERCISE_COUNTS,
  EnglishActivity,
  EnglishActivityConfig,
  EnglishDifficulty,
  generateEnglishActivity,
  isCorrect,
} from "@/lib/english/generator";
import {
  assignEnglishTask,
  deleteEnglishTask,
  EnglishTask,
  EnglishTaskWithProgress,
  gradeOutOfTen,
  loadEnglishTasks,
} from "@/lib/english/tasks";
import { supabase } from "@/lib/supabase";

interface StudentSummary {
  id: string;
  username: string;
  name: string;
}

interface MentorEnglishTasksProps {
  student: StudentSummary | undefined;
}

const DEFAULT_CONFIG: EnglishActivityConfig = { levelId: "A1", unitId: "unit1", topicId: "toBe", difficulty: "media", count: 10 };

function firstTopicId(levelId: EnglishLevelId, unitId: string, skill: EnglishSkill): string {
  const unit = findUnit(levelId, unitId);
  return unit?.topics.find((topic) => topic.skill === skill)?.id ?? unit?.topics[0]?.id ?? "";
}

function newTaskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const chip = (active: boolean) =>
  `px-3 py-2 rounded-xl text-xs font-semibold border transition ${
    active ? "bg-[#242321] text-white border-[#242321]" : "bg-[#FAF8F5] text-[#555149] border-[#E7E3DC] hover:bg-[#F3F0EA]"
  }`;

export default function MentorEnglishTasks({ student }: MentorEnglishTasksProps) {
  const [config, setConfig] = useState<EnglishActivityConfig>(DEFAULT_CONFIG);
  const [activity, setActivity] = useState<EnglishActivity>(() => generateEnglishActivity(DEFAULT_CONFIG));
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [assigning, setAssigning] = useState(false);
  // Tasks are kept with the student they were loaded for, so switching students shows "loading".
  const [loadedTasks, setLoadedTasks] = useState<{ studentId: string; items: EnglishTaskWithProgress[] } | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const level = findLevel(config.levelId);
  const unit = findUnit(config.levelId, config.unitId);
  const topic = unit?.topics.find((item) => item.id === config.topicId);
  const skill: EnglishSkill = topic?.skill ?? "vocabulary";

  // Every change of the configuration produces a new version, like the "regenerate" button.
  const update = (changes: Partial<EnglishActivityConfig>) => {
    const next = { ...config, ...changes };
    setConfig(next);
    setActivity(generateEnglishActivity(next));
  };

  const studentId = student?.id;
  const tasksLoading = Boolean(studentId) && loadedTasks?.studentId !== studentId;
  const tasks = studentId && loadedTasks?.studentId === studentId ? loadedTasks.items : [];

  const refreshTasks = async (id: string) => {
    try {
      setLoadedTasks({ studentId: id, items: await loadEnglishTasks(id) });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudieron cargar las tareas.");
    }
  };

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    loadEnglishTasks(studentId)
      .then((items) => {
        if (active) setLoadedTasks({ studentId, items });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadedTasks({ studentId, items: [] });
        setStatus(error instanceof Error ? error.message : "No se pudieron cargar las tareas.");
      });
    return () => {
      active = false;
    };
  }, [studentId]);

  const assign = async () => {
    if (!student) {
      setStatus("Selecciona un alumno asignado.");
      return;
    }
    setAssigning(true);
    setStatus("");
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Debes iniciar sesión.");
      const task: EnglishTask = {
        kind: "english_task",
        version: 1,
        id: newTaskId(),
        studentId: student.id,
        mentorId: data.user.id,
        title: activity.title,
        skill: activity.skill,
        config: activity.config,
        exercises: activity.exercises,
        note: note.trim() || undefined,
        assignedAt: new Date().toISOString(),
      };
      await assignEnglishTask(task);
      setStatus(`Tarea asignada a ${student.name}.`);
      setNote("");
      setActivity(generateEnglishActivity(config));
      await refreshTasks(student.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo asignar la tarea.");
    } finally {
      setAssigning(false);
    }
  };

  const remove = async (item: EnglishTaskWithProgress) => {
    if (!student || !window.confirm(`¿Eliminar la tarea «${item.task.title}»? También se borrará del panel del alumno.`)) return;
    try {
      await deleteEnglishTask(item.recordId);
      await refreshTasks(student.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo eliminar la tarea.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-5">
          <div>
            <h3 className="font-serif text-base text-[#292825] font-bold">Crear tarea de inglés</h3>
            <p className="text-xs text-[#77736B] mt-1">
              Elige el tema del temario y la plataforma genera los ejercicios. Cada versión es distinta.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Nivel</p>
            <div className="flex flex-wrap gap-1.5">
              {ENGLISH_LEVELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.available}
                  onClick={() => update({ levelId: item.id })}
                  title={item.available ? item.title : "Próximamente"}
                  className={`${chip(config.levelId === item.id)} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {item.id}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Unidad · {level?.title}</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {level?.units.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => update({ unitId: item.id, topicId: firstTopicId(config.levelId, item.id, skill) })}
                  className={`${chip(config.unitId === item.id)} whitespace-nowrap`}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Tipo</p>
            <div className="flex gap-1.5">
              {(["vocabulary", "grammar"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => update({ topicId: firstTopicId(config.levelId, config.unitId, item) })}
                  className={chip(skill === item)}
                >
                  {SKILL_LABELS[item]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Tema</p>
            <div className="flex flex-wrap gap-1.5">
              {unit?.topics
                .filter((item) => item.skill === skill)
                .map((item) => (
                  <button key={item.id} type="button" onClick={() => update({ topicId: item.id })} className={chip(config.topicId === item.id)}>
                    {item.title}
                  </button>
                ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Dificultad</p>
              <div className="flex gap-1.5">
                {(Object.keys(DIFFICULTY_LABELS) as EnglishDifficulty[]).map((item) => (
                  <button key={item} type="button" onClick={() => update({ difficulty: item })} className={chip(config.difficulty === item)}>
                    {DIFFICULTY_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Nº de ejercicios</p>
              <div className="flex gap-1.5">
                {EXERCISE_COUNTS.map((item) => (
                  <button key={item} type="button" onClick={() => update({ count: item })} className={chip(config.count === item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-[#77736B]">
            {config.difficulty === "baja" && "Baja: el alumno elige entre 3 opciones; se priorizan los contenidos más básicos."}
            {config.difficulty === "media" && "Media: el alumno elige entre más opciones, con contenidos de todo el tema."}
            {config.difficulty === "alta" && "Alta: el alumno escribe la respuesta; se priorizan los contenidos más difíciles."}
            {activity.available < config.count &&
              ` Este tema tiene ${activity.available} ejercicios distintos, así que la tarea tendrá ${activity.exercises.length}.`}
          </p>

          <div className="space-y-1.5">
            <label htmlFor="english-task-note" className="text-[11px] font-bold uppercase tracking-wider text-[#77736B] block">
              Nota para el alumno (opcional)
            </label>
            <input
              id="english-task-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder="Ej.: Repasa el verbo to be antes de empezar"
              className="w-full p-2.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-xl text-xs text-[#45433F] focus:outline-none"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setActivity(generateEnglishActivity(config))}
              className="flex-1 py-3 bg-[#F3F0EA] text-[#45433F] rounded-xl text-xs font-semibold hover:bg-[#EAE5DC] transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" /> Generar otra versión
            </button>
            <button
              type="button"
              onClick={() => void assign()}
              disabled={!student || assigning || activity.exercises.length === 0}
              className="flex-1 py-3 bg-[#242321] text-white rounded-xl text-xs font-semibold hover:bg-[#3A3835] transition flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Send className="w-4 h-4" /> {assigning ? "Asignando…" : student ? `Asignar a ${student.name}` : "Selecciona un alumno"}
            </button>
          </div>
          {status && <p role="status" className="text-xs font-semibold text-[#806C50]">{status}</p>}
        </div>

        <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
          <div>
            <h3 className="font-serif text-base text-[#292825] font-bold">Previsualización</h3>
            <p className="text-xs text-[#77736B] mt-1">
              {activity.title} · {activity.exercises.length} ejercicios. Así lo verá el alumno; la respuesta correcta aparece marcada.
            </p>
          </div>
          <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
            {activity.exercises.map((exercise, index) => (
              <ExerciseCard key={exercise.id} exercise={exercise} index={index} total={activity.exercises.length} showSolution />
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-serif text-base text-[#292825] font-bold">
            Tareas de inglés {student ? `de ${student.name}` : ""}
          </h3>
          {student && (
            <button type="button" onClick={() => void refreshTasks(student.id)} className="text-xs font-semibold text-[#6D6962] hover:text-[#292825]">
              Actualizar
            </button>
          )}
        </div>
        {tasksLoading && <p className="text-xs text-[#77736B]">Cargando tareas…</p>}
        {!tasksLoading && tasks.length === 0 && <p className="text-xs text-[#77736B]">Este alumno todavía no tiene tareas de inglés.</p>}
        <div className="space-y-2">
          {tasks.map((item) => {
            const answers = item.progress?.answers ?? {};
            const answered = Object.keys(answers).length;
            const done = item.progress?.status === "completed";
            const expanded = expandedTaskId === item.task.id;
            return (
              <div key={item.task.id} className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5]">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <button type="button" onClick={() => setExpandedTaskId(expanded ? null : item.task.id)} className="text-left">
                    <span className="block text-sm font-semibold text-[#292825]">{item.task.title}</span>
                    <span className="block text-[11px] text-[#77736B] mt-0.5">
                      Asignada el {new Date(item.task.assignedAt).toLocaleDateString("es-ES")} · {item.task.exercises.length} ejercicios ·
                      Dificultad {DIFFICULTY_LABELS[item.task.config.difficulty].toLowerCase()}
                      {done && item.progress?.completedAt ? ` · Completada el ${new Date(item.progress.completedAt).toLocaleDateString("es-ES")}` : ""}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold px-3 py-1 rounded-full border ${
                        done ? "text-[#5F6B4C] bg-[#EEF2E6] border-[#DDE3D4]" : "text-[#806C50] bg-[#F3EEE5] border-[#E4D8C5]"
                      }`}
                    >
                      {done
                        ? `${item.progress?.score}/${item.progress?.total} · ${gradeOutOfTen(item.progress?.score ?? 0, item.progress?.total ?? 0)}/10`
                        : answered
                          ? `En curso · ${answered}/${item.task.exercises.length}`
                          : "Pendiente"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void remove(item)}
                      title="Eliminar tarea"
                      className="p-1.5 rounded-lg text-[#8D887F] hover:bg-[#F3F0EA] hover:text-[#8A6D62]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-[#E7E3DC] p-4 space-y-2">
                    {item.task.note && <p className="text-xs text-[#6D6962]">Nota enviada: {item.task.note}</p>}
                    {item.task.exercises.map((exercise, index) => {
                      const given = answers[exercise.id];
                      const correct = isCorrect(exercise, given);
                      return (
                        <div key={exercise.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 text-xs py-1.5 border-b border-[#EEEAE3] last:border-0">
                          <span className="text-[#45433F]">
                            {index + 1}. {exercise.prompt}
                          </span>
                          <span className={given === undefined ? "text-[#8D887F]" : correct ? "text-[#5F6B4C] font-semibold" : "text-[#8A6D62] font-semibold"}>
                            {given === undefined ? "Sin responder" : correct ? `✓ ${given}` : `✗ ${given} (correcta: ${exercise.answer})`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
