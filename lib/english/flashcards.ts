import { getKiruRecords, saveKiruRecord } from "@/lib/kiru-records";
import { VOCABULARY } from "@/lib/english/content";
import { EnglishExercise, isCorrect } from "@/lib/english/generator";
import { EnglishTask, EnglishTaskProgress } from "@/lib/english/tasks";

// Bridge between English tasks and the student's Flashcards tab.
//
// A flashcard set is one record holding many cards, so sending 20 cards is one write:
// - Sent by the mentor: an "activity" record owned by the student, like the cards from
//   the mentor's bulk generator.
// - Created automatically from the student's own mistakes: a "progress" record, the only
//   kind RLS lets a student write. It is a single rolling set of the latest mistakes.

export const ENGLISH_FLASHCARD_CATEGORY = "Inglés";
export const ENGLISH_REVIEW_CATEGORY = "Inglés · repaso";

export interface EnglishFlashcard {
  id: string;
  term: string;
  definition: string;
}

export interface FlashcardSet {
  kind: "flashcard_set";
  title: string;
  category: string;
  cards: EnglishFlashcard[];
  /** English task the cards come from, if any. */
  taskId?: string;
  updatedAt: string;
}

const REVIEW_KEY = "english_review_cards";
const REVIEW_LIMIT = 60;
/** A finished task creates review cards when the student got fewer than this share right. */
export const REVIEW_THRESHOLD = 0.7;

interface VocabPair {
  english: string;
  spanish: string;
}

let vocabIndex: Map<string, VocabPair> | null = null;

/** Every vocabulary entry of every level, found by its English or its Spanish side. */
function vocabularyLookup(): Map<string, VocabPair> {
  if (vocabIndex) return vocabIndex;
  vocabIndex = new Map();
  for (const bank of Object.values(VOCABULARY)) {
    for (const line of bank) {
      const [english, spanish] = line.split("|");
      const pair = { english: english.split("/")[0].trim(), spanish: spanish.trim() };
      for (const key of [...english.split("/"), spanish]) {
        const normalized = key.trim().toLowerCase();
        if (!vocabIndex.has(normalized)) vocabIndex.set(normalized, pair);
      }
    }
  }
  return vocabIndex;
}

const cardId = (term: string) =>
  term
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/**
 * The card that helps remember an exercise: the word and its meaning for vocabulary,
 * the sentence and its missing words for grammar. Exercises that train the ear or word
 * order (dictation, ordering, speaking) have no useful card and give null.
 */
export function flashcardFor(exercise: EnglishExercise): EnglishFlashcard | null {
  if (exercise.type === "order" || exercise.type === "speak" || exercise.passage) return null;
  if (exercise.prompt.includes("___")) {
    // Two-gap answers ("Are, having") read better as "Are … having".
    const answer = exercise.answer.split("/")[0].trim().replace(/,\s*/g, " … ");
    return { id: cardId(exercise.prompt), term: exercise.prompt, definition: answer };
  }
  // Vocabulary questions and listening "what does it mean" questions.
  // Words spelt the same in both languages (hotel, taxi) make no card.
  const word = vocabularyLookup().get(exercise.answer.trim().toLowerCase());
  if (word && word.english.toLowerCase() !== word.spanish.toLowerCase()) {
    return { id: cardId(word.english), term: word.english, definition: word.spanish };
  }
  // "Elige la frase correcta" items share one generic prompt, so they make no card either.
  return null;
}

export function flashcardsFor(exercises: EnglishExercise[]): EnglishFlashcard[] {
  const cards = new Map<string, EnglishFlashcard>();
  for (const exercise of exercises) {
    const card = flashcardFor(exercise);
    if (card && !cards.has(card.id)) cards.set(card.id, card);
  }
  return [...cards.values()];
}

export function mistakesOf(task: EnglishTask, progress: EnglishTaskProgress | null): EnglishExercise[] {
  return task.exercises.filter((exercise) => progress?.answers[exercise.id] !== undefined && !isCorrect(exercise, progress.answers[exercise.id]));
}

/** Mentor: sends a set of cards to the student's Flashcards tab. Sending again for the same task replaces it. */
export async function sendFlashcardsToStudent(
  studentId: string,
  title: string,
  cards: EnglishFlashcard[],
  taskId: string,
  kind: "task" | "mistakes",
): Promise<void> {
  const set: FlashcardSet = { kind: "flashcard_set", title, category: ENGLISH_FLASHCARD_CATEGORY, cards, taskId, updatedAt: new Date().toISOString() };
  await saveKiruRecord("activity", `english_flashcards_${kind}_${taskId}`, set, studentId);
}

/** Student: adds the cards of a task's mistakes to their own review set, newest first. */
export async function saveReviewFlashcards(task: EnglishTask, cards: EnglishFlashcard[]): Promise<number> {
  if (!cards.length) return 0;
  const records = await getKiruRecords<FlashcardSet>("progress");
  const previous = records.find((record) => record.record_key === REVIEW_KEY)?.data;
  const fresh = cards;
  const kept = (previous?.cards ?? []).filter((card) => !fresh.some((item) => item.id === card.id));
  const set: FlashcardSet = {
    kind: "flashcard_set",
    title: "Mis fallos de inglés",
    category: ENGLISH_REVIEW_CATEGORY,
    cards: [...fresh, ...kept].slice(0, REVIEW_LIMIT),
    taskId: task.id,
    updatedAt: new Date().toISOString(),
  };
  await saveKiruRecord("progress", REVIEW_KEY, set);
  return fresh.length;
}

export function isFlashcardSet(value: unknown): value is FlashcardSet {
  const set = value as FlashcardSet | null;
  return Boolean(set && set.kind === "flashcard_set" && Array.isArray(set.cards));
}
