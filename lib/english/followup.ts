import { findTopic, nextTopicOfSkill } from "@/lib/english/curriculum";
import { EnglishActivity, EnglishDifficulty, EnglishExercise, generateEnglishActivity, isCorrect } from "@/lib/english/generator";
import { EnglishTaskWithProgress } from "@/lib/english/tasks";

// Proposes the next task from a completed one's results. Proposals are only loaded into
// the mentor's builder: the mentor still previews, regenerates and assigns them.

export interface FollowUpSuggestion {
  id: "review" | "harder" | "next-topic" | "same" | "easier";
  label: string;
  reason: string;
  build: () => EnglishActivity;
}

const HARDER: Record<EnglishDifficulty, EnglishDifficulty | null> = { baja: "media", media: "alta", alta: null };
const EASIER: Record<EnglishDifficulty, EnglishDifficulty | null> = { baja: null, media: "baja", alta: "media" };

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** The same exercises the student failed, in a new order and with the options reshuffled. */
function reviewOf(item: EnglishTaskWithProgress, mistakes: EnglishExercise[]): EnglishActivity {
  const exercises = shuffle(mistakes).map((exercise): EnglishExercise =>
    exercise.type === "choice" ? { ...exercise, id: newId(), options: shuffle(exercise.options) } : { ...exercise, id: newId() },
  );
  const title = item.task.title.startsWith("Repaso · ") ? item.task.title : `Repaso · ${item.task.title}`;
  return { config: { ...item.task.config, count: exercises.length }, skill: item.task.skill, title, exercises, available: exercises.length };
}

export function suggestFollowUps(item: EnglishTaskWithProgress): FollowUpSuggestion[] {
  const { task, progress } = item;
  if (progress?.status !== "completed") return [];
  const answers = progress.answers;
  const mistakes = task.exercises.filter((exercise) => !isCorrect(exercise, answers[exercise.id]));
  const ratio = task.exercises.length ? (task.exercises.length - mistakes.length) / task.exercises.length : 0;
  const { config } = task;
  const topicExists = Boolean(findTopic(config.levelId, config.unitId, config.topicId));
  const suggestions: FollowUpSuggestion[] = [];

  if (mistakes.length > 0) {
    suggestions.push({
      id: "review",
      label: `Repasar ${mistakes.length === 1 ? "su fallo" : `sus ${mistakes.length} fallos`}`,
      reason: "Las mismas preguntas que falló, en otro orden.",
      build: () => reviewOf(item, mistakes),
    });
  }
  if (!topicExists) return suggestions;

  if (ratio >= 0.8) {
    const harder = HARDER[config.difficulty];
    if (harder) {
      suggestions.push({
        id: "harder",
        label: `Subir a dificultad ${harder}`,
        reason: "Ha acertado el 80 % o más: el mismo tema con más reto.",
        build: () => generateEnglishActivity({ ...config, difficulty: harder }),
      });
    }
    const next = nextTopicOfSkill(config.levelId, config.unitId, config.topicId);
    if (next) {
      suggestions.push({
        id: "next-topic",
        label: "Pasar al siguiente tema",
        reason: "Domina este tema: avanza en el temario manteniendo la dificultad.",
        build: () => generateEnglishActivity({ ...config, ...next }),
      });
    }
  } else if (ratio >= 0.5) {
    suggestions.push({
      id: "same",
      label: "Otra versión del mismo tema",
      reason: "Va bien pero aún falla: más práctica al mismo nivel.",
      build: () => generateEnglishActivity(config),
    });
  } else {
    const easier = EASIER[config.difficulty];
    suggestions.push({
      id: easier ? "easier" : "same",
      label: easier ? `Bajar a dificultad ${easier}` : "Otra versión del mismo tema",
      reason: "Ha acertado menos de la mitad: conviene consolidar la base.",
      build: () => generateEnglishActivity(easier ? { ...config, difficulty: easier } : config),
    });
  }
  return suggestions;
}
