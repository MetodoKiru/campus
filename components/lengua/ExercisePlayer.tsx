"use client";

import React, { useState } from "react";
import { Volume2 } from "lucide-react";
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

function ListenButton({ text, label = "Escuchar" }: { text: string; label?: string }) {
  return (
    <button type="button" onClick={() => speak(text)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E7E3DC] text-sm font-semibold text-[#555149] hover:bg-[#FAF8F5]">
      <Volume2 className="w-4 h-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function BuildWord({ exercise, value, onChange }: { exercise: BuildExercise; value: number[]; onChange: (chosen: number[]) => void }) {
  const remaining = exercise.pieces.map((piece, index) => ({ piece, index })).filter(({ index }) => !value.includes(index));
  return (
    <div className="space-y-4">
      <div className="min-h-16 rounded-2xl border-2 border-dashed border-[#D9CFBF] bg-white p-3 flex flex-wrap items-center justify-center gap-2">
        {value.length === 0 && <span className="text-base text-[#A39E95]">Toca las piezas en orden</span>}
        {value.map((index) => (
          <button key={index} type="button" onClick={() => onChange(value.filter((item) => item !== index))} className="px-4 py-2.5 rounded-xl bg-[#F0E9DE] border border-[#B9A58A] text-xl font-bold text-[#292825]">
            {exercise.pieces[index]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {remaining.map(({ piece, index }) => (
          <button key={index} type="button" onClick={() => onChange([...value, index])} className="px-4 py-2.5 rounded-xl bg-white border-2 border-[#E7E3DC] text-xl font-bold text-[#343330] hover:bg-[#FAF8F5]">
            {piece}
          </button>
        ))}
      </div>
    </div>
  );
}

type Given = { text?: string; pieces?: number[] };

function givenText(exercise: LenguaExercise, given: Given | undefined): string {
  if (!given) return "";
  if (exercise.type === "build") return given.pieces && given.pieces.length === exercise.pieces.length ? joinPieces(exercise, given.pieces.map((index) => exercise.pieces[index])) : "";
  return given.text ?? "";
}

function Review({ exercises, answers, onClose }: { exercises: LenguaExercise[]; answers: LenguaAnswer[]; onClose: () => void }) {
  const score = answers.filter((answer) => answer.correct).length;
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-[#77736B]">Has terminado</p>
        <p className="text-5xl font-bold text-[#292825]">{score} / {answers.length}</p>
        <p className="text-lg text-[#45433F]">{score === answers.length ? "¡Todo bien!" : "Mira abajo qué hay que repasar."}</p>
      </div>
      <ol className="space-y-2.5">
        {exercises.map((exercise, index) => {
          const answer = answers[index];
          if (!answer) return null;
          const isTrace = exercise.type === "trace";
          const expected = isTrace ? exercise.target : exercise.answer;
          return (
            <li key={exercise.id} className={`rounded-2xl border-2 p-4 space-y-1 ${answer.correct ? "border-[#D5DEC4] bg-[#F7F9F2]" : "border-[#EBCFC0] bg-[#FCF5F1]"}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-semibold text-[#292825]">{index + 1}. {exercise.prompt}</p>
                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${answer.correct ? "bg-[#E3EBD5] text-[#4F6A30]" : "bg-[#F5DED2] text-[#8A4626]"}`}>{answer.correct ? "Bien" : "Repasar"}</span>
              </div>
              {isTrace ? (
                <p className="text-base text-[#45433F]">{answer.correct ? `Has trazado bien «${expected}».` : `Hay que practicar más el trazo de «${expected}».`}</p>
              ) : (
                <>
                  <p className="text-base text-[#45433F]">Tu respuesta: <strong>{answer.given || "sin responder"}</strong></p>
                  {!answer.correct && <p className="text-base text-[#45433F]">La respuesta correcta: <strong>{expected}</strong></p>}
                </>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex justify-center">
        <button type="button" onClick={onClose} className="px-6 py-3 rounded-2xl bg-[#242321] text-white text-base font-bold hover:bg-[#3A3835]">Volver</button>
      </div>
    </div>
  );
}

/** Tanda de ejercicios sin corrección inmediata: el alumno ve el resultado de todo en el repaso final. */
export default function ExercisePlayer({ exercises, onFinish, onClose }: { exercises: LenguaExercise[]; onFinish: (answers: LenguaAnswer[]) => void; onClose: () => void }) {
  const [position, setPosition] = useState(0);
  const [givens, setGivens] = useState<Record<number, Given>>({});
  const [finished, setFinished] = useState<LenguaAnswer[] | null>(null);

  if (finished) return <Review exercises={exercises} answers={finished} onClose={onClose} />;
  const exercise = exercises[position];
  if (!exercise) return null;

  const given = givens[position];
  const setGiven = (value: Given) => setGivens((previous) => ({ ...previous, [position]: value }));
  const ready = exercise.type === "build" ? givenText(exercise, given) !== "" : Boolean(given?.text?.trim());
  const isLast = position + 1 >= exercises.length;

  const next = () => {
    if (!ready) return;
    if (!isLast) { setPosition(position + 1); return; }
    const answers: LenguaAnswer[] = exercises.map((item, index) => {
      const text = givenText(item, givens[index]);
      return { exerciseId: item.id, unit: item.unit, skill: item.skill, difficulty: item.difficulty, correct: checkAnswer(item, text), given: text };
    });
    setFinished(answers);
    onFinish(answers);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-3 flex-1 rounded-full bg-[#EEECE7] overflow-hidden">
          <div className="h-full bg-[#8A9870] transition-all" style={{ width: `${(position / exercises.length) * 100}%` }} />
        </div>
        <span className="text-sm font-semibold text-[#77736B]">{position + 1} / {exercises.length}</span>
      </div>

      {exercise.type === "choice" && exercise.reading && (
        <div className="rounded-2xl bg-[#F7F5F1] border border-[#EEEAE3] p-4 space-y-3">
          <p className="text-xl leading-relaxed text-[#292825]">{exercise.reading}</p>
          <ListenButton text={exercise.reading} label="Escuchar el texto" />
        </div>
      )}

      <div className="text-center space-y-3">
        {exercise.emoji && <div className="text-7xl leading-none" aria-hidden="true">{exercise.emoji}</div>}
        <h3 className="text-2xl font-bold text-[#292825] leading-snug">{exercise.prompt}</h3>
        {exercise.speak && <ListenButton text={exercise.speak} />}
      </div>

      {exercise.type === "trace" && <TraceLetter key={exercise.id} target={exercise.target} onResult={(ok) => setGiven({ text: ok === null ? undefined : ok ? "ok" : "fail" })} />}

      {exercise.type === "choice" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {exercise.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setGiven({ text: option })}
              className={`px-4 py-4 rounded-2xl border-2 text-xl font-semibold transition ${given?.text === option ? "border-[#242321] bg-[#F0E9DE] text-[#292825]" : "border-[#E7E3DC] bg-white text-[#343330] hover:bg-[#FAF8F5]"}`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {exercise.type === "write" && (
        <input
          key={exercise.id}
          value={given?.text ?? ""}
          onChange={(event) => setGiven({ text: event.target.value })}
          placeholder="Escribe aquí"
          aria-label="Tu respuesta"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full px-4 py-4 rounded-2xl border-2 border-[#E7E3DC] bg-white text-2xl text-center font-semibold text-[#292825] focus:border-[#242321] outline-none"
        />
      )}

      {exercise.type === "build" && <BuildWord key={exercise.id} exercise={exercise} value={given?.pieces ?? []} onChange={(pieces) => setGiven({ pieces })} />}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button type="button" onClick={() => setPosition(position - 1)} disabled={position === 0} className="px-4 py-3 rounded-2xl border border-[#E7E3DC] bg-white text-base font-semibold text-[#555149] disabled:invisible">← Anterior</button>
        <button type="button" onClick={next} disabled={!ready} className="px-6 py-3 rounded-2xl bg-[#8A9870] text-white text-base font-bold hover:bg-[#76845E] disabled:opacity-40">
          {isLast ? "Terminar" : "Siguiente →"}
        </button>
      </div>
    </div>
  );
}
