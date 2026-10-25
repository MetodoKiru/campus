"use client";

import React, { useState } from "react";
import TraceLetter from "@/components/lengua/TraceLetter";
import { checkAnswer, joinPieces, type BuildExercise, type LenguaAnswer, type LenguaExercise } from "@/lib/lengua-engine";

/** Lee en voz alta con la voz del navegador, si el dispositivo la tiene. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-ES";
  utterance.rate = 0.8;
  window.speechSynthesis.speak(utterance);
}

/** Un trazo cuenta como acierto si sale bien en uno de los dos primeros intentos. */
const TRACE_TRIES_THAT_COUNT = 2;

function BuildWord({ exercise, locked, onCheck }: { exercise: BuildExercise; locked: boolean; onCheck: (answer: string) => void }) {
  const [chosen, setChosen] = useState<number[]>([]);
  const remaining = exercise.pieces.map((piece, index) => ({ piece, index })).filter(({ index }) => !chosen.includes(index));
  const built = joinPieces(exercise, chosen.map((index) => exercise.pieces[index]));
  return (
    <div className="space-y-4">
      <div className="min-h-16 rounded-2xl border-2 border-dashed border-[#D9CFBF] bg-white p-3 flex flex-wrap items-center justify-center gap-2">
        {chosen.length === 0 && <span className="text-sm text-[#A39E95]">Toca las piezas en orden</span>}
        {chosen.map((index) => (
          <button key={index} type="button" disabled={locked} onClick={() => setChosen((previous) => previous.filter((item) => item !== index))} className="px-4 py-2.5 rounded-xl bg-[#F0E9DE] border border-[#B9A58A] text-lg font-bold text-[#292825]">
            {exercise.pieces[index]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {remaining.map(({ piece, index }) => (
          <button key={index} type="button" disabled={locked} onClick={() => setChosen((previous) => [...previous, index])} className="px-4 py-2.5 rounded-xl bg-white border border-[#E7E3DC] text-lg font-bold text-[#343330] hover:bg-[#FAF8F5] shadow-xs">
            {piece}
          </button>
        ))}
      </div>
      {!locked && (
        <div className="flex justify-center">
          <button type="button" disabled={remaining.length > 0} onClick={() => onCheck(built)} className="px-5 py-2.5 rounded-xl bg-[#242321] text-white text-sm font-semibold disabled:opacity-40">Comprobar</button>
        </div>
      )}
    </div>
  );
}

export default function ExercisePlayer({ exercises, onFinish }: { exercises: LenguaExercise[]; onFinish: (answers: LenguaAnswer[]) => void }) {
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<LenguaAnswer[]>([]);
  const [current, setCurrent] = useState<{ given: string; correct: boolean } | null>(null);
  const [traceTries, setTraceTries] = useState(0);
  const exercise = exercises[position];
  if (!exercise) return null;

  const answer = (given: string) => {
    if (current && exercise.type !== "trace") return;
    const correct = checkAnswer(exercise, given);
    if (exercise.type === "trace") {
      const tries = traceTries + 1;
      setTraceTries(tries);
      // Se guarda el mejor resultado: si ya acertó, un intento posterior peor no lo borra.
      if (current?.correct) return;
      setCurrent({ given, correct: correct && tries <= TRACE_TRIES_THAT_COUNT });
      return;
    }
    setCurrent({ given, correct });
  };

  const next = () => {
    if (!current) return;
    const recorded = [...answers, { exerciseId: exercise.id, unit: exercise.unit, skill: exercise.skill, difficulty: exercise.difficulty, correct: current.correct }];
    setAnswers(recorded);
    setCurrent(null);
    setTraceTries(0);
    if (position + 1 >= exercises.length) onFinish(recorded);
    else setPosition(position + 1);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-3 flex-1 rounded-full bg-[#EEECE7] overflow-hidden">
          <div className="h-full bg-[#8A9870] transition-all" style={{ width: `${(position / exercises.length) * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-[#77736B]">{position + 1} / {exercises.length}</span>
      </div>

      {exercise.type === "choice" && exercise.reading && (
        <div className="rounded-2xl bg-[#F7F5F1] border border-[#EEEAE3] p-4 flex gap-3 items-start">
          <p className="text-lg leading-relaxed text-[#292825] flex-1">{exercise.reading}</p>
          <button type="button" onClick={() => speak(exercise.reading ?? "")} title="Escuchar el texto" className="shrink-0 w-10 h-10 rounded-full bg-white border border-[#E7E3DC] text-lg">🔊</button>
        </div>
      )}

      <div className="text-center space-y-2">
        {exercise.emoji && <div className="text-6xl" aria-hidden="true">{exercise.emoji}</div>}
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-xl font-bold text-[#292825]">{exercise.prompt}</h3>
          {exercise.speak && <button type="button" onClick={() => speak(exercise.speak ?? "")} title="Escuchar" className="w-10 h-10 rounded-full bg-white border border-[#E7E3DC] text-lg shrink-0">🔊</button>}
        </div>
      </div>

      {exercise.type === "trace" && <TraceLetter key={exercise.id} target={exercise.target} onResult={(ok) => answer(ok ? "ok" : "fail")} />}

      {exercise.type === "choice" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {exercise.options.map((option) => {
            const picked = current?.given === option;
            const isAnswer = current && option === exercise.answer;
            return (
              <button
                key={option}
                type="button"
                onClick={() => answer(option)}
                disabled={Boolean(current)}
                className={`px-4 py-3.5 rounded-2xl border text-lg font-semibold transition ${isAnswer ? "border-[#8A9870] bg-[#EEF2E6] text-[#3F5228]" : picked ? "border-[#C99A82] bg-[#F8ECE5] text-[#7A3F25]" : "border-[#E7E3DC] bg-white text-[#343330] hover:bg-[#FAF8F5]"}`}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      {exercise.type === "build" && <BuildWord key={exercise.id} exercise={exercise} locked={Boolean(current)} onCheck={answer} />}

      {current && exercise.type !== "trace" && (
        <p className={`text-center text-base font-semibold ${current.correct ? "text-[#5E7A3A]" : "text-[#9A5B3C]"}`}>
          {current.correct ? "¡Muy bien! ⭐" : `Era «${exercise.answer}». ¡La próxima sale!`}
        </p>
      )}

      {current && (
        <div className="flex justify-center">
          <button type="button" onClick={next} className="px-6 py-3 rounded-2xl bg-[#8A9870] text-white text-base font-bold hover:bg-[#76845E]">
            {position + 1 >= exercises.length ? "Terminar" : "Siguiente →"}
          </button>
        </div>
      )}
    </div>
  );
}
