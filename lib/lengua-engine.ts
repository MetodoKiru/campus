// Motor de Lengua de Primaria: cursos, niveles por unidad, tandas de ejercicios e informe.
import { EXERCISES_1_2, UNITS_1_2 } from "@/lib/lengua/primero-segundo";
import { EXERCISES_3_4, UNITS_3_4 } from "@/lib/lengua/tercero-cuarto";
import type { BuildExercise, LenguaCourse, LenguaDifficulty, LenguaExercise, LenguaSkill, LenguaUnit } from "@/lib/lengua/types";

export type * from "@/lib/lengua/types";

export const LENGUA_COURSES: Record<LenguaCourse, string> = {
  "1EP": "1º de Primaria",
  "2EP": "2º de Primaria",
  "3EP": "3º de Primaria",
  "4EP": "4º de Primaria",
};

export function isLenguaCourse(value: unknown): value is LenguaCourse {
  return typeof value === "string" && Object.hasOwn(LENGUA_COURSES, value);
}

export const LENGUA_UNITS: LenguaUnit[] = [...UNITS_1_2, ...UNITS_3_4];

export const LENGUA_DATABASE: LenguaExercise[] = [...EXERCISES_1_2, ...EXERCISES_3_4];

// ───────────── Tareas, intentos y niveles

export interface LenguaTaskConfig {
  course: LenguaCourse;
  units: string[];
  difficulty: LenguaDifficulty | "todas" | "auto";
  questionCount: number;
  includeTrace: boolean;
}

export interface LenguaTask extends LenguaTaskConfig {
  kind: "lengua_task";
  id: string;
  studentId: string;
  title: string;
  note?: string;
  dueDate?: string;
  createdAt: string;
}

export interface LenguaAnswer {
  exerciseId: string;
  unit: string;
  skill: LenguaSkill;
  difficulty: LenguaDifficulty;
  correct: boolean;
  /** Lo que respondió el alumno, para el repaso final. */
  given?: string;
}

export interface LenguaAttempt {
  module: "lengua";
  kind: "lengua_attempt";
  studentId: string;
  taskId?: string;
  course: LenguaCourse;
  score: number;
  total: number;
  completedAt: string;
  answers: LenguaAnswer[];
}

export type LenguaLevel = "sin_datos" | "iniciando" | "en_proceso" | "dominado";

export const LEVEL_LABELS: Record<LenguaLevel, string> = {
  sin_datos: "Sin empezar",
  iniciando: "Iniciando",
  en_proceso: "En proceso",
  dominado: "Dominado",
};

export interface UnitMastery {
  unit: LenguaUnit;
  answered: number;
  correct: number;
  accuracy: number;
  level: LenguaLevel;
  /** Dificultad que conviene practicar a continuación. */
  nextDifficulty: LenguaDifficulty;
}

/** Solo cuentan las últimas respuestas de cada unidad, para que el nivel refleje cómo va ahora. */
const RECENT_ANSWERS_PER_UNIT = 20;

export function computeMastery(attempts: LenguaAttempt[], course: LenguaCourse): UnitMastery[] {
  const sorted = [...attempts].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return LENGUA_UNITS.filter((unit) => unit.course === course).map((unit) => {
    const recent = sorted.flatMap((attempt) => attempt.answers.filter((answer) => answer.unit === unit.id)).slice(0, RECENT_ANSWERS_PER_UNIT);
    const correct = recent.filter((answer) => answer.correct).length;
    const accuracy = recent.length ? correct / recent.length : 0;
    let level: LenguaLevel = "sin_datos";
    if (recent.length) level = accuracy >= 0.85 && recent.length >= 8 ? "dominado" : accuracy >= 0.6 ? "en_proceso" : "iniciando";
    const nextDifficulty: LenguaDifficulty = level === "dominado" ? "desafiante" : level === "en_proceso" ? "medio" : "facil";
    return { unit, answered: recent.length, correct, accuracy, level, nextDifficulty };
  });
}

const DIFFICULTY_ORDER: LenguaDifficulty[] = ["facil", "medio", "desafiante"];

export const DIFFICULTY_LABELS: Record<LenguaDifficulty, string> = { facil: "Fácil", medio: "Media", desafiante: "Desafiante" };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Monta una tanda de ejercicios. Con dificultad «auto» usa el nivel de cada unidad. */
export function buildSession(config: LenguaTaskConfig, mastery: UnitMastery[]): LenguaExercise[] {
  const units = config.units.length ? config.units : LENGUA_UNITS.filter((unit) => unit.course === config.course).map((unit) => unit.id);
  const pool = LENGUA_DATABASE.filter((exercise) => {
    if (exercise.course !== config.course || !units.includes(exercise.unit)) return false;
    if (!config.includeTrace && exercise.type === "trace") return false;
    if (config.difficulty === "todas") return true;
    if (config.difficulty === "auto") {
      const target = mastery.find((item) => item.unit.id === exercise.unit)?.nextDifficulty ?? "facil";
      // Se practica el nivel recomendado y el anterior, para repasar sin frustrar.
      const gap = DIFFICULTY_ORDER.indexOf(target) - DIFFICULTY_ORDER.indexOf(exercise.difficulty);
      return gap === 0 || gap === 1;
    }
    return exercise.difficulty === config.difficulty;
  });
  return shuffle(pool)
    .slice(0, Math.max(1, config.questionCount))
    .sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty))
    .map((exercise) => (exercise.type === "choice" ? { ...exercise, options: shuffle(exercise.options) } : exercise));
}

/** Las frases se forman con espacios; las palabras, juntando sílabas o letras. */
export function joinPieces(exercise: BuildExercise, pieces: string[]): string {
  return pieces.join(exercise.answer.includes(" ") ? " " : "");
}

/** En el dictado no cuentan las mayúsculas ni los espacios de más; las tildes sí. */
function normalizeWritten(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export function checkAnswer(exercise: LenguaExercise, given: string): boolean {
  if (exercise.type === "trace") return given === "ok";
  if (exercise.type === "write") return normalizeWritten(given) === normalizeWritten(exercise.answer);
  return given.trim() === exercise.answer.trim();
}

/** Recomendación de práctica libre: la primera unidad del curso que aún no está dominada. */
export function recommendedUnit(mastery: UnitMastery[]): UnitMastery | undefined {
  return mastery.find((item) => item.level !== "dominado") ?? mastery[mastery.length - 1];
}

export interface LenguaReport {
  course: LenguaCourse;
  generatedAt: string;
  attempts: number;
  exercisesDone: number;
  accuracy: number;
  bySkill: Array<{ skill: LenguaSkill; answered: number; accuracy: number }>;
  mastery: UnitMastery[];
  strengths: string[];
  toReinforce: string[];
  pendingTasks: number;
  summary: string;
}

export function buildReport(studentName: string, course: LenguaCourse, attempts: LenguaAttempt[], tasks: LenguaTask[]): LenguaReport {
  const own = attempts.filter((attempt) => attempt.course === course);
  const answers = own.flatMap((attempt) => attempt.answers);
  const correct = answers.filter((answer) => answer.correct).length;
  const mastery = computeMastery(own, course);
  const skills = Array.from(new Set(answers.map((answer) => answer.skill)));
  const bySkill = skills.map((skill) => {
    const list = answers.filter((answer) => answer.skill === skill);
    return { skill, answered: list.length, accuracy: list.filter((answer) => answer.correct).length / list.length };
  });
  const strengths = mastery.filter((item) => item.level === "dominado").map((item) => item.unit.title);
  const toReinforce = mastery.filter((item) => item.level === "iniciando").map((item) => item.unit.title);
  const doneTaskIds = new Set(own.map((attempt) => attempt.taskId).filter(Boolean));
  const pendingTasks = tasks.filter((task) => task.course === course && !doneTaskIds.has(task.id)).length;
  const accuracy = answers.length ? correct / answers.length : 0;

  let summary: string;
  if (!answers.length) summary = `${studentName} todavía no ha hecho ejercicios de Lengua de ${LENGUA_COURSES[course]}.`;
  else {
    const parts = [`${studentName} ha completado ${own.length} ${own.length === 1 ? "sesión" : "sesiones"} con ${answers.length} ejercicios y un ${Math.round(accuracy * 100)} % de aciertos.`];
    if (strengths.length) parts.push(`Domina: ${strengths.join(", ")}.`);
    if (toReinforce.length) parts.push(`Conviene reforzar: ${toReinforce.join(", ")}.`);
    const next = recommendedUnit(mastery);
    if (next && next.level !== "dominado") parts.push(`Siguiente paso recomendado: «${next.unit.title}» en dificultad ${DIFFICULTY_LABELS[next.nextDifficulty].toLowerCase()}.`);
    summary = parts.join(" ");
  }

  return { course, generatedAt: new Date().toISOString(), attempts: own.length, exercisesDone: answers.length, accuracy, bySkill, mastery, strengths, toReinforce, pendingTasks, summary };
}

/** Valida los datos que llegan de Supabase antes de usarlos en pantalla. */
export function parseLenguaAttempt(value: unknown): LenguaAttempt | null {
  const data = value as Partial<LenguaAttempt> | null;
  if (!data || data.kind !== "lengua_attempt" || !isLenguaCourse(data.course) || !Array.isArray(data.answers)) return null;
  return {
    module: "lengua",
    kind: "lengua_attempt",
    studentId: String(data.studentId ?? ""),
    taskId: typeof data.taskId === "string" ? data.taskId : undefined,
    course: data.course,
    score: Number(data.score) || 0,
    total: Number(data.total) || 0,
    completedAt: typeof data.completedAt === "string" ? data.completedAt : "",
    answers: data.answers.filter((answer): answer is LenguaAnswer => Boolean(answer) && typeof answer.unit === "string" && typeof answer.correct === "boolean"),
  };
}

export function parseLenguaTask(value: unknown): LenguaTask | null {
  const data = value as Partial<LenguaTask> | null;
  if (!data || data.kind !== "lengua_task" || typeof data.id !== "string" || !isLenguaCourse(data.course)) return null;
  return {
    kind: "lengua_task",
    id: data.id,
    studentId: String(data.studentId ?? ""),
    title: typeof data.title === "string" && data.title ? data.title : "Tarea de Lengua",
    note: typeof data.note === "string" ? data.note : undefined,
    dueDate: typeof data.dueDate === "string" ? data.dueDate : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    course: data.course,
    units: Array.isArray(data.units) ? data.units.filter((unit): unit is string => typeof unit === "string") : [],
    difficulty: ["facil", "medio", "desafiante", "todas", "auto"].includes(String(data.difficulty)) ? (data.difficulty as LenguaTaskConfig["difficulty"]) : "auto",
    questionCount: Math.max(1, Math.min(30, Number(data.questionCount) || 10)),
    includeTrace: data.includeTrace !== false,
  };
}
