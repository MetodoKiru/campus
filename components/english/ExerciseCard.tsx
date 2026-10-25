"use client";

import React, { useState } from "react";
import { Mic, Undo2, Volume2 } from "lucide-react";
import { encodeMatch, EnglishExercise, isCorrect, MatchExercise, OrderExercise, parseMatch, SpeakExercise } from "@/lib/english/generator";
import { canRecognize, canSpeak, listenOnce, speakEnglish } from "@/lib/english/speech";

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

const secondaryButton =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E7E3DC] bg-white text-xs font-semibold text-[#45433F] hover:bg-[#F7F5F1] transition disabled:opacity-40";

function AudioControls({ text }: { text: string }) {
  if (!canSpeak()) {
    return <p className="text-xs text-[#8A6D62]">Tu navegador no puede reproducir el audio. Prueba con Chrome o Safari.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => speakEnglish(text)} className={secondaryButton}>
        <Volume2 className="w-4 h-4" /> Escuchar
      </button>
      <button type="button" onClick={() => speakEnglish(text, true)} className={secondaryButton}>
        <Volume2 className="w-4 h-4" /> Más despacio
      </button>
    </div>
  );
}

function OrderInput({ exercise, locked, onChange }: { exercise: OrderExercise; locked: boolean; onChange?: (value: string) => void }) {
  // Indexes into exercise.words, so repeated words are told apart.
  const [picked, setPicked] = useState<number[]>([]);
  const joiner = exercise.letters ? "" : " ";
  const update = (next: number[]) => {
    setPicked(next);
    onChange?.(next.map((index) => exercise.words[index]).join(joiner));
  };
  return (
    <div className="space-y-3">
      <div className="min-h-12 p-3 rounded-xl border border-dashed border-[#D9D3C8] bg-white flex flex-wrap gap-1.5 items-center">
        {picked.length === 0 && (
          <span className="text-xs text-[#A39E95]">{exercise.letters ? "Tu palabra aparecerá aquí" : "Tu frase aparecerá aquí"}</span>
        )}
        {picked.map((wordIndex, position) => (
          <button
            key={`${wordIndex}-${position}`}
            type="button"
            disabled={locked}
            onClick={() => update(picked.filter((_, i) => i !== position))}
            className="px-2.5 py-1.5 rounded-lg bg-[#F0E9DE] border border-[#E4D8C5] text-sm text-[#343330]"
          >
            {exercise.words[wordIndex]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {exercise.words.map((word, index) =>
          picked.includes(index) ? null : (
            <button
              key={index}
              type="button"
              disabled={locked}
              onClick={() => update([...picked, index])}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E7E3DC] text-sm text-[#45433F] hover:bg-[#F7F5F1]"
            >
              {word}
            </button>
          ),
        )}
        {picked.length > 0 && !locked && (
          <button type="button" onClick={() => update([])} className={`${secondaryButton} ml-auto`}>
            <Undo2 className="w-4 h-4" /> Empezar de nuevo
          </button>
        )}
      </div>
    </div>
  );
}

const tile = "w-full text-left rounded-xl border px-3 py-2.5 text-xs sm:text-sm transition-colors";
const tileIdle = "border-[#E7E3DC] bg-white text-[#45433F] hover:bg-[#F7F5F1]";
const tileSelected = "border-[#B9A58A] bg-[#F0E9DE] text-[#343330]";
const tileJoined = "border-[#E4D8C5] bg-[#FAF6EF] text-[#8D887F]";
const tileRight = "border-[#9DAA84] bg-[#EEF2E6] text-[#4F5940]";
const tileWrong = "border-[#D4B5A8] bg-[#F6ECE7] text-[#8A6D62]";

/** The same number on both sides shows which words were joined. */
function PairBadge({ number }: { number: number }) {
  if (!number) return null;
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 mr-1.5 rounded-full bg-[#806C50] text-white text-[9px] font-bold align-[1px]">
      {number}
    </span>
  );
}

function MatchInput({ exercise, onChange }: { exercise: MatchExercise; onChange?: (value: string) => void }) {
  const [joined, setJoined] = useState<[string, string][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const leftOf = (right: string) => joined.find((pair) => pair[1] === right)?.[0];
  const rightOf = (left: string) => joined.find((pair) => pair[0] === left)?.[1];

  const update = (next: [string, string][]) => {
    setJoined(next);
    // The answer only counts once every word has its pair.
    onChange?.(next.length === exercise.pairs.length ? encodeMatch(next) : "");
  };
  const pickLeft = (left: string) => {
    if (rightOf(left)) update(joined.filter((pair) => pair[0] !== left));
    setSelected(selected === left ? null : left);
  };
  const pickRight = (right: string) => {
    const previous = leftOf(right);
    if (previous && !selected) {
      update(joined.filter((pair) => pair[1] !== right));
      return;
    }
    if (!selected) return;
    update([...joined.filter((pair) => pair[0] !== selected && pair[1] !== right), [selected, right]]);
    setSelected(null);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {exercise.pairs.map(({ left }) => {
            const right = rightOf(left);
            return (
              <button
                key={left}
                type="button"
                onClick={() => pickLeft(left)}
                className={`${tile} ${selected === left ? tileSelected : right ? tileJoined : tileIdle}`}
              >
                <PairBadge number={right ? joined.findIndex((pair) => pair[0] === left) + 1 : 0} />
                <span className="font-semibold">{left}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {exercise.options.map((right) => (
            <button
              key={right}
              type="button"
              onClick={() => pickRight(right)}
              className={`${tile} ${leftOf(right) ? tileJoined : tileIdle}`}
            >
              <PairBadge number={leftOf(right) ? joined.findIndex((pair) => pair[1] === right) + 1 : 0} />
              {right}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[#8D887F]">
        {joined.length}/{exercise.pairs.length} unidas · Toca una pareja ya unida para deshacerla.
      </p>
    </div>
  );
}

function MatchResult({ exercise, value, reveal }: { exercise: MatchExercise; value?: string; reveal: boolean }) {
  const given = parseMatch(value ?? "");
  return (
    <div className="space-y-1.5">
      {exercise.pairs.map(({ left, right }) => {
        const answered = given.get(left);
        const ok = !reveal || answered === right;
        return (
          <div key={left} className={`${tile} ${ok ? tileRight : tileWrong} flex flex-wrap justify-between gap-2`}>
            <span>
              <span className="font-semibold">{left}</span> = {right}
            </span>
            {reveal && !ok && answered && <span className="text-[11px]">Tú: {answered}</span>}
          </div>
        );
      })}
    </div>
  );
}

function SpeakInput({
  exercise,
  value,
  locked,
  onChange,
}: {
  exercise: SpeakExercise;
  value?: string;
  locked: boolean;
  onChange?: (value: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const supported = canRecognize();

  const record = async () => {
    setError("");
    setListening(true);
    try {
      onChange?.(await listenOnce().promise);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "No se ha podido usar el micrófono.");
    } finally {
      setListening(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canSpeak() && (
          <button type="button" onClick={() => speakEnglish(exercise.answer, true)} className={secondaryButton}>
            <Volume2 className="w-4 h-4" /> Escuchar cómo se dice
          </button>
        )}
        {supported && !locked && (
          <button
            type="button"
            onClick={() => void record()}
            disabled={listening}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#242321] text-white text-xs font-semibold hover:bg-[#3A3835] transition disabled:opacity-60"
          >
            <Mic className="w-4 h-4" /> {listening ? "Te escucho…" : value ? "Grabar otra vez" : "Hablar"}
          </button>
        )}
      </div>
      {!supported && !locked && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-[#8A6D62]">Tu navegador no permite usar el micrófono. Léela en voz alta y después escríbela.</p>
          <input
            type="text"
            value={value ?? ""}
            onChange={(event) => onChange?.(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full p-3 rounded-xl border border-[#E7E3DC] text-sm bg-white focus:outline-none"
          />
        </div>
      )}
      {value && supported && <p className="text-xs text-[#6D6962]">Hemos oído: «{value}»</p>}
      {error && <p className="text-xs text-[#8A6D62]">{error}</p>}
    </div>
  );
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

      {exercise.passage && (
        <details open className="rounded-xl bg-white border border-[#E7E3DC] p-3 text-sm text-[#45433F] leading-relaxed">
          <summary className="cursor-pointer text-xs font-bold text-[#292825]">{exercise.passage.title}</summary>
          {/* Dialogues and profiles ("Waiter: …", "Age: …") get one line per speaker or field. */}
          {exercise.passage.text.split(/ (?=[A-Z][a-z]+: )/).map((line, position) => (
            <p key={position} className={position === 0 ? "mt-2" : "mt-1"}>
              {line}
            </p>
          ))}
        </details>
      )}

      {exercise.audio && <AudioControls text={exercise.audio} />}
      {exercise.audio && (showSolution || reveal) && <p className="text-[11px] text-[#8D887F]">Audio: «{exercise.audio}»</p>}

      <p className="text-sm sm:text-base font-semibold text-[#292825]">{exercise.prompt}</p>

      {exercise.type === "choice" && (
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
      )}

      {exercise.type === "write" && (
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

      {exercise.type === "match" &&
        (reveal || showSolution || locked ? (
          <MatchResult exercise={exercise} value={value} reveal={reveal} />
        ) : (
          <MatchInput exercise={exercise} onChange={onChange} />
        ))}

      {exercise.type === "order" &&
        (reveal || showSolution ? (
          <div className="flex flex-wrap gap-1.5">
            {(reveal ? (exercise.letters ? [value ?? ""] : (value ?? "").split(" ")) : exercise.letters ? [exercise.words.join(" ")] : exercise.words).map(
              (word, position) => (
                <span key={position} className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E7E3DC] text-sm text-[#45433F]">
                  {word}
                </span>
              ),
            )}
          </div>
        ) : (
          <OrderInput exercise={exercise} locked={locked} onChange={onChange} />
        ))}

      {exercise.type === "speak" && (
        <SpeakInput exercise={exercise} value={value} locked={locked || showSolution} onChange={onChange} />
      )}

      {reveal && (
        <p className={`text-xs font-semibold ${correct ? "text-[#5F6B4C]" : "text-[#8A6D62]"}`}>
          {correct
            ? "¡Correcto!"
            : exercise.type === "speak"
              ? `Casi. Hemos oído «${value ?? ""}». Practica: ${exercise.answer}`
              : exercise.type === "match"
                ? "Arriba tienes las parejas correctas; las marcadas en rojo son las que se cruzaron."
                : `Respuesta correcta: ${exercise.answer}`}
        </p>
      )}
      {showSolution && !reveal && exercise.type === "order" && <p className="text-[11px] text-[#5F6B4C] font-semibold">Solución: {exercise.answer}</p>}
      {showSolution && !reveal && exercise.type === "write" && exercise.accepted.length > 1 && (
        <p className="text-[11px] text-[#8D887F]">También vale: {exercise.accepted.slice(1).join(", ")}</p>
      )}
    </div>
  );
}
