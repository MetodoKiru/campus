"use client";

import React from "react";
import { EnglishExercise, isCorrect } from "@/lib/english/generator";

interface ExerciseCardProps {
  exercise: EnglishExercise;
  index: number;
  total: number;
  value?: string;
  onChange?: (value: string) => void;
  /** Shows whether the answer is right and the solution. */
  reveal?: boolean;
  /** Mentor preview: shows the expected answer without an attempt. */
  showSolution?: boolean;
  disabled?: boolean;
  onSubmit?: () => void;
}

export default function ExerciseCard({
  exercise,
  index,
  total,
  value,
  onChange,
  reveal = false,
  showSolution = false,
  disabled = false,
  onSubmit,
}: ExerciseCardProps) {
  const correct = reveal && isCorrect(exercise, value);
  const locked = disabled || reveal || !onChange;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF8F5] border border-[#E7E3DC] space-y-3">
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-[#8D887F]">
        <span>{exercise.instruction}</span>
        <span>
          {index + 1} / {total}
        </span>
      </div>
      <p className="text-sm sm:text-base font-semibold text-[#292825]">{exercise.prompt}</p>

      {exercise.type === "choice" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {exercise.options.map((option) => {
            const selected = value === option;
            const isSolution = (reveal || showSolution) && option === exercise.answer;
            const isWrongPick = reveal && selected && !correct;
            return (
              <button
                key={option}
                type="button"
                disabled={locked}
                onClick={() => onChange?.(option)}
                className={`text-left rounded-xl border px-3 py-2.5 text-xs sm:text-sm transition-colors ${
                  isSolution
                    ? "border-[#9DAA84] bg-[#EEF2E6] text-[#4F5940] font-semibold"
                    : isWrongPick
                      ? "border-[#D4B5A8] bg-[#F6ECE7] text-[#8A6D62]"
                      : selected
                        ? "border-[#B9A58A] bg-[#F0E9DE] text-[#343330]"
                        : "border-[#E7E3DC] bg-white text-[#45433F] hover:bg-[#F7F5F1]"
                } ${locked ? "cursor-default" : "cursor-pointer"}`}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          type="text"
          value={value ?? ""}
          disabled={locked}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && onSubmit) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={showSolution ? exercise.answer : "Escribe tu respuesta"}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className={`w-full p-3 rounded-xl border text-sm bg-white focus:outline-none ${
            reveal ? (correct ? "border-[#9DAA84] bg-[#EEF2E6]" : "border-[#D4B5A8] bg-[#F6ECE7]") : "border-[#E7E3DC]"
          }`}
        />
      )}

      {reveal && (
        <p className={`text-xs font-semibold ${correct ? "text-[#5F6B4C]" : "text-[#8A6D62]"}`}>
          {correct ? "¡Correcto!" : `Respuesta correcta: ${exercise.answer}`}
        </p>
      )}
      {showSolution && !reveal && exercise.type === "write" && exercise.accepted.length > 1 && (
        <p className="text-[11px] text-[#8D887F]">También vale: {exercise.accepted.slice(1).join(", ")}</p>
      )}
    </div>
  );
}
