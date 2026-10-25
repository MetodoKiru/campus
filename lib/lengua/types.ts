// Tipos compartidos por el motor de Lengua y los archivos de contenido de cada curso.

export type LenguaCourse = "1EP" | "2EP" | "3EP" | "4EP";
export type LenguaDifficulty = "facil" | "medio" | "desafiante";
export type LenguaSkill = "Lectoescritura" | "Ortografía" | "Gramática" | "Vocabulario" | "Comprensión lectora";

interface LenguaExerciseBase {
  id: string;
  course: LenguaCourse;
  unit: string;
  skill: LenguaSkill;
  difficulty: LenguaDifficulty;
  prompt: string;
  /** Texto que se lee en voz alta con el botón de altavoz. */
  speak?: string;
  /** Dibujo solo cuando es la pista para reconocer la palabra. */
  emoji?: string;
}

/** El alumno repasa con el dedo (o el ratón) la letra o sílaba. */
export interface TraceExercise extends LenguaExerciseBase {
  type: "trace";
  target: string;
}

/** Elegir la respuesta correcta entre varias opciones. */
export interface ChoiceExercise extends LenguaExerciseBase {
  type: "choice";
  options: string[];
  answer: string;
  /** Texto corto que se lee antes de la pregunta (comprensión lectora). */
  reading?: string;
}

/** Ordenar sílabas o letras para formar la palabra. */
export interface BuildExercise extends LenguaExerciseBase {
  type: "build";
  pieces: string[];
  answer: string;
}

/** Dictado: el alumno escucha la palabra o frase y la escribe. */
export interface WriteExercise extends LenguaExerciseBase {
  type: "write";
  answer: string;
}

export type LenguaExercise = TraceExercise | ChoiceExercise | BuildExercise | WriteExercise;

export interface LenguaUnit {
  id: string;
  course: LenguaCourse;
  title: string;
  description: string;
}

export const trace = (id: string, course: LenguaCourse, unit: string, difficulty: LenguaDifficulty, target: string, speak?: string): TraceExercise => ({
  id, course, unit, skill: "Lectoescritura", difficulty, type: "trace", target,
  prompt: target.length === 1 ? `Repasa con el dedo la letra «${target}»` : `Repasa con el dedo «${target}»`,
  speak: speak ?? target,
});

/** Dictado de una palabra o frase, que se escucha con el botón «Escuchar». */
export const dictation = (id: string, course: LenguaCourse, unit: string, difficulty: LenguaDifficulty, answer: string, skill: LenguaSkill = "Ortografía"): WriteExercise => ({
  id, course, unit, skill, difficulty, type: "write", answer,
  prompt: answer.includes(" ") ? "Escucha y escribe la frase" : "Escucha y escribe la palabra",
  speak: answer,
});
