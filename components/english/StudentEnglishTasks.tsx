"use client";

import React, { useEffect, useState } from "react";
import ExerciseCard from "@/components/english/ExerciseCard";
import { DIFFICULTY_LABELS, isCorrect } from "@/lib/english/generator";
import { flashcardsFor, mistakesOf, REVIEW_THRESHOLD, saveReviewFlashcards } from "@/lib/english/flashcards";
import {
  answersWithBackup,
  backupAnswers,
  clearAnswersBackup,
  EnglishTask,
  EnglishTaskWithProgress,
  gradeOutOfTen,
  loadEnglishTasks,
  saveEnglishProgress,
} from "@/lib/english/tasks";
import { supabase } from "@/lib/supabase";

function statusLabel(item: EnglishTaskWithProgress): string {
  if (item.progress?.status === "completed") return `Completada · ${gradeOutOfTen(item.progress.score ?? 0, item.progress.total ?? 0)}/10`;
  const answered = Object.keys(item.progress?.answers ?? {}).length;
  return answered ? `En curso · ${answered}/${item.task.exercises.length}` : "Pendiente";
}

interface StudentEnglishTasksProps {
  /** Opens the Flashcards tab on the student's review cards. */
  onOpenFlashcards?: () => void;
}

export default function StudentEnglishTasks({ onOpenFlashcards }: StudentEnglishTasksProps) {
  const [items, setItems] = useState<EnglishTaskWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [checked, setChecked] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  // Answers that are only in this browser because the last save failed.
  const [unsaved, setUnsaved] = useState(false);
  // Review flashcards created from each task's mistakes in this session.
  const [reviewCards, setReviewCards] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const loaded = await loadEnglishTasks(data.user.id);
        if (active) setItems(loaded);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "No se pudieron cargar tus tareas de inglés.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const openItem = items.find((item) => item.task.id === openTaskId) ?? null;

  /** Saves the answers to the server; on failure they stay in this browser to retry. */
  const persist = async (task: EnglishTask, updated: Record<string, string>) => {
    backupAnswers(task.id, updated);
    setSaveStatus("Guardando…");
    const previous = items.find((item) => item.task.id === task.id)?.progress ?? null;
    try {
      const progress = await saveEnglishProgress(task, updated, previous);
      clearAnswersBackup(task.id);
      setItems((current) => current.map((item) => (item.task.id === task.id ? { ...item, progress } : item)));
      setUnsaved(false);
      setSaveStatus("Guardado");
      // A task finished with many mistakes turns them into flashcards to review.
      const justFinished = progress.status === "completed" && previous?.status !== "completed";
      if (justFinished && (progress.score ?? 0) / Math.max(1, progress.total ?? 1) < REVIEW_THRESHOLD) {
        const cards = flashcardsFor(mistakesOf(task, progress));
        if (cards.length) {
          // One retry: the cards are a bonus, but worth a second attempt.
          saveReviewFlashcards(task, cards)
            .catch(() => saveReviewFlashcards(task, cards))
            .then((count) => setReviewCards((current) => ({ ...current, [task.id]: count })))
            .catch(() => undefined);
        }
      }
    } catch {
      setUnsaved(true);
      setSaveStatus("Sin conexión: tus respuestas están a salvo en este dispositivo.");
    }
  };

  const openTask = (item: EnglishTaskWithProgress) => {
    const { answers: restored, unsynced } = answersWithBackup(item.task, item.progress?.answers ?? {});
    setOpenTaskId(item.task.id);
    setAnswers(restored);
    setDraft("");
    setChecked(false);
    setSaveStatus("");
    setUnsaved(false);
    // Answers from a session that could not reach the server are sent now.
    if (unsynced) void persist(item.task, restored);
  };

  const closeTask = () => {
    setOpenTaskId(null);
    setSaveStatus("");
  };

  const pending = items.filter((item) => item.progress?.status !== "completed");
  const completed = items.filter((item) => item.progress?.status === "completed");

  if (openItem) {
    const { task } = openItem;
    const total = task.exercises.length;
    // Resume at the first exercise that has no saved answer.
    const currentIndex = task.exercises.findIndex((exercise) => answers[exercise.id] === undefined);
    const finished = currentIndex === -1;
    // While showing feedback, keep the exercise that was just answered on screen.
    const lastAnsweredIndex = finished ? total - 1 : currentIndex - 1;
    const shownIndex = checked ? lastAnsweredIndex : currentIndex;
    const exercise = shownIndex >= 0 ? task.exercises[shownIndex] : undefined;
    const answeredCount = total - task.exercises.filter((item) => answers[item.id] === undefined).length;

    const checkAnswer = async () => {
      if (!exercise || checked || !draft.trim()) return;
      const updated = { ...answers, [exercise.id]: draft };
      setAnswers(updated);
      setChecked(true);
      await persist(task, updated);
    };

    const retryButton = unsaved && (
      <button
        type="button"
        onClick={() => void persist(task, answers)}
        className="text-xs font-semibold text-[#806C50] underline underline-offset-2"
      >
        Reintentar ahora
      </button>
    );

    const next = () => {
      setDraft("");
      setChecked(false);
    };

    if (finished && !checked) {
      const score = task.exercises.filter((item) => isCorrect(item, answers[item.id])).length;
      const mistakes = task.exercises.filter((item) => !isCorrect(item, answers[item.id]));
      return (
        <div className="space-y-5">
          <button type="button" onClick={closeTask} className="text-xs font-semibold text-[#6D6962] hover:text-[#292825]">
            ← Mis tareas de inglés
          </button>
          <div className="p-6 rounded-3xl border border-[#DDE3D4] bg-[#F5F7F1] space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6F765D]">Tarea completada</p>
            <h3 className="font-serif text-xl font-bold text-[#292825]">{task.title}</h3>
            <p className="text-sm text-[#343330]">
              {score} de {total} correctas · Nota {gradeOutOfTen(score, total)}/10
            </p>
            <p className="text-xs text-[#6D6962]">
              {score === total
                ? "¡Perfecto! Tu mentor ya puede ver el resultado."
                : score / total >= 0.7
                  ? "¡Buen trabajo! Repasa los fallos de abajo."
                  : "Buen intento. Repasa los fallos de abajo con calma."}
            </p>
          </div>
          {reviewCards[task.id] > 0 && (
            <div className="p-4 rounded-2xl border border-[#E7E3DC] bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-[#45433F]">
                Hemos preparado <strong>{reviewCards[task.id]} flashcards</strong> con lo que has fallado. Repásalas unos minutos y verás cómo
                se quedan.
              </p>
              {onOpenFlashcards && (
                <button
                  type="button"
                  onClick={onOpenFlashcards}
                  className="shrink-0 px-4 py-2 bg-[#242321] text-white rounded-xl text-xs font-semibold hover:bg-[#3A3835] transition"
                >
                  Repasar flashcards
                </button>
              )}
            </div>
          )}
          {mistakes.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#77736B]">Para repasar</h4>
              {mistakes.map((item) => (
                <ExerciseCard
                  key={item.id}
                  exercise={item}
                  index={task.exercises.indexOf(item)}
                  total={total}
                  value={answers[item.id]}
                  reveal
                />
              ))}
            </div>
          )}
          {saveStatus && (
            <div className="flex items-center gap-3">
              <p role="status" className="text-xs text-[#8A6D62]">
                {saveStatus}
              </p>
              {retryButton}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={closeTask} className="text-xs font-semibold text-[#6D6962] hover:text-[#292825]">
            ← Mis tareas de inglés
          </button>
          <span className="text-[11px] text-[#77736B]">Tu progreso se guarda en cada respuesta</span>
        </div>
        <div>
          <h3 className="font-serif text-lg font-bold text-[#292825]">{task.title}</h3>
          {task.note && <p className="text-xs text-[#6D6962] mt-1">Nota de tu mentor: {task.note}</p>}
        </div>
        <div className="h-2 rounded-full bg-[#EEECE7] overflow-hidden">
          <div className="h-full bg-[#8A9870] transition-all" style={{ width: `${(answeredCount / total) * 100}%` }} />
        </div>
        {exercise && (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            index={shownIndex}
            total={total}
            value={checked ? answers[exercise.id] : draft}
            onChange={setDraft}
            reveal={checked}
            onSubmit={() => void checkAnswer()}
          />
        )}
        <div className="flex items-center gap-3">
          {checked ? (
            <button
              type="button"
              onClick={next}
              className="px-6 py-3 bg-[#242321] text-white rounded-xl text-xs font-semibold hover:bg-[#3A3835] transition"
            >
              {finished ? "Ver resultado" : "Continuar"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void checkAnswer()}
              disabled={!draft.trim()}
              className="px-6 py-3 bg-[#242321] text-white rounded-xl text-xs font-semibold hover:bg-[#3A3835] transition disabled:opacity-40"
            >
              Comprobar
            </button>
          )}
          {saveStatus && (
            <p role="status" className="text-xs text-[#6D6962]">
              {saveStatus}
            </p>
          )}
          {retryButton}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loading && <p className="text-xs text-[#77736B]">Cargando tus tareas…</p>}
      {loadError && <p className="text-xs text-[#8A6D62]">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && (
        <div className="p-5 rounded-2xl border border-dashed border-[#E7E3DC] text-xs text-[#77736B]">
          Todavía no tienes tareas de inglés. Cuando tu mentor te asigne una, aparecerá aquí.
        </div>
      )}
      {pending.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#77736B]">Por hacer</h3>
          {pending.map((item) => (
            <button
              key={item.task.id}
              type="button"
              onClick={() => openTask(item)}
              className="w-full text-left p-4 rounded-2xl border border-[#E7E3DC] bg-white hover:bg-[#FAF8F5] transition flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <span>
                <span className="block text-sm font-semibold text-[#292825]">{item.task.title}</span>
                <span className="block text-[11px] text-[#77736B] mt-0.5">
                  {item.task.exercises.length} ejercicios · Dificultad {DIFFICULTY_LABELS[item.task.config.difficulty].toLowerCase()} · Asignada el{" "}
                  {new Date(item.task.assignedAt).toLocaleDateString("es-ES")}
                </span>
              </span>
              <span className="text-[11px] font-semibold text-[#806C50] bg-[#F3EEE5] px-3 py-1 rounded-full border border-[#E4D8C5] w-fit">
                {item.progress ? "Continuar" : "Empezar"} · {statusLabel(item)}
              </span>
            </button>
          ))}
        </section>
      )}
      {completed.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#77736B]">Completadas</h3>
          {completed.map((item) => (
            <button
              key={item.task.id}
              type="button"
              onClick={() => openTask(item)}
              className="w-full text-left p-4 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] hover:bg-[#F3F0EA] transition flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <span className="text-sm font-semibold text-[#45433F]">{item.task.title}</span>
              <span className="text-[11px] font-semibold text-[#5F6B4C]">{statusLabel(item)}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
