import { A1_GRAMMAR, A1_VOCABULARY, GrammarItem } from "@/lib/english/a1-content";
import { EnglishLevelId, EnglishSkill, findLevel, findTopic, findUnit, SKILL_LABELS } from "@/lib/english/curriculum";

export type EnglishDifficulty = "baja" | "media" | "alta";

export const DIFFICULTY_LABELS: Record<EnglishDifficulty, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export const EXERCISE_COUNTS = [10, 15, 20] as const;

export interface ChoiceExercise {
  id: string;
  type: "choice";
  instruction: string;
  prompt: string;
  options: string[];
  answer: string;
}

export interface WriteExercise {
  id: string;
  type: "write";
  instruction: string;
  prompt: string;
  /** Every spelling that counts as correct; the first one is shown as the solution. */
  accepted: string[];
  answer: string;
}

export type EnglishExercise = ChoiceExercise | WriteExercise;

export interface EnglishActivityConfig {
  levelId: EnglishLevelId;
  unitId: string;
  topicId: string;
  difficulty: EnglishDifficulty;
  count: number;
}

export interface EnglishActivity {
  config: EnglishActivityConfig;
  skill: EnglishSkill;
  title: string;
  exercises: EnglishExercise[];
  /** How many different exercises the topic can produce at this difficulty. */
  available: number;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Lower-cases, unifies apostrophes and hyphens, and ignores spacing and final punctuation. */
export function normalizeAnswer(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .replace(/[’‘`´]/g, "'")
    .replace(/-/g, " ")
    .replace(/^[¿¡\s]+/, "")
    .replace(/[\s.!?,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCorrect(exercise: EnglishExercise, given: string | undefined): boolean {
  if (!given) return false;
  if (exercise.type === "choice") return given === exercise.answer;
  const normalized = normalizeAnswer(given);
  return exercise.accepted.some((option) => normalizeAnswer(option) === normalized);
}

interface VocabEntry {
  english: string[];
  spanish: string;
}

function parseVocab(bank: string[]): VocabEntry[] {
  return bank.map((line) => {
    const [english, spanish] = line.split("|");
    return { english: english.split("/").map((word) => word.trim()), spanish: spanish.trim() };
  });
}

// Each candidate builds the exercise lazily, so options are shuffled anew every time.
interface Candidate {
  key: string;
  /** Lower is preferred for the chosen difficulty. */
  rank: number;
  build: () => EnglishExercise;
}

function vocabularyCandidates(entries: VocabEntry[], difficulty: EnglishDifficulty): Candidate[] {
  const optionCount = difficulty === "baja" ? 3 : 4;
  const distractorsFor = (entry: VocabEntry, side: "english" | "spanish") =>
    shuffle(entries.filter((other) => other !== entry))
      .map((other) => (side === "english" ? other.english[0] : other.spanish))
      .filter((text, index, all) => all.indexOf(text) === index && text !== (side === "english" ? entry.english[0] : entry.spanish))
      .slice(0, optionCount - 1);

  return entries.flatMap((entry): Candidate[] => {
    const toEnglishChoice: Candidate = {
      key: `${entry.spanish}>en`,
      rank: difficulty === "alta" ? 1 : 0,
      build: () => ({
        id: newId(),
        type: "choice",
        instruction: "Elige la traducción correcta.",
        prompt: `¿Cómo se dice «${entry.spanish}» en inglés?`,
        options: shuffle([entry.english[0], ...distractorsFor(entry, "english")]),
        answer: entry.english[0],
      }),
    };
    const toSpanishChoice: Candidate = {
      key: `${entry.english[0]}>es`,
      rank: difficulty === "alta" ? 1 : 0,
      build: () => ({
        id: newId(),
        type: "choice",
        instruction: "Elige el significado correcto.",
        prompt: `¿Qué significa «${entry.english[0]}»?`,
        options: shuffle([entry.spanish, ...distractorsFor(entry, "spanish")]),
        answer: entry.spanish,
      }),
    };
    if (difficulty !== "alta") return [toEnglishChoice, toSpanishChoice];
    // High difficulty: the student writes the English word; recognition questions only fill gaps.
    const toEnglishWrite: Candidate = {
      key: `${entry.spanish}>en`,
      rank: 0,
      build: () => ({
        id: newId(),
        type: "write",
        instruction: "Escríbelo en inglés.",
        prompt: `«${entry.spanish}»`,
        accepted: entry.english,
        answer: entry.english[0],
      }),
    };
    return [toEnglishWrite, toSpanishChoice];
  });
}

function grammarCandidates(items: GrammarItem[], difficulty: EnglishDifficulty, writeInstruction?: string): Candidate[] {
  const preferredLevels: Record<EnglishDifficulty, number[]> = {
    baja: [1, 2, 3],
    media: [2, 1, 3],
    alta: [3, 2, 1],
  };
  return items.map((item) => {
    const accepted = item.answer.split("/").map((answer) => answer.trim());
    const rank = preferredLevels[difficulty].indexOf(item.level);
    const asWrite = difficulty === "alta" && !item.choiceOnly;
    return {
      key: item.sentence + item.answer,
      // At "media" levels 1 and 2 are equally welcome.
      rank: difficulty === "media" ? (item.level === 3 ? 1 : 0) : rank,
      build: (): EnglishExercise => {
        if (asWrite) {
          return {
            id: newId(),
            type: "write",
            instruction: writeInstruction || "Escribe la palabra que falta.",
            prompt: item.sentence,
            accepted,
            answer: accepted[0],
          };
        }
        const distractors = shuffle(item.distractors).slice(0, difficulty === "baja" ? 2 : 3);
        return {
          id: newId(),
          type: "choice",
          instruction: item.choiceOnly ? "Elige la opción correcta." : "Elige la palabra que completa la frase.",
          prompt: item.sentence,
          options: shuffle([accepted[0], ...distractors]),
          answer: accepted[0],
        };
      },
    };
  });
}

/** Builds a fresh activity: a new selection and order of exercises on every call. */
export function generateEnglishActivity(config: EnglishActivityConfig): EnglishActivity {
  const level = findLevel(config.levelId);
  const unit = findUnit(config.levelId, config.unitId);
  const topic = findTopic(config.levelId, config.unitId, config.topicId);
  if (!level?.available || !unit || !topic) throw new Error("El tema seleccionado no existe en el temario.");

  const candidates =
    topic.skill === "vocabulary"
      ? vocabularyCandidates(parseVocab(A1_VOCABULARY[topic.bank] ?? []), config.difficulty)
      : grammarCandidates(A1_GRAMMAR[topic.bank] ?? [], config.difficulty, topic.writeInstruction);

  // Shuffle first so equal-rank candidates come out in a different order each time.
  const ordered = shuffle(candidates).sort((a, b) => a.rank - b.rank);
  const chosen: Candidate[] = [];
  const usedKeys = new Set<string>();
  for (const candidate of ordered) {
    if (chosen.length >= config.count) break;
    if (usedKeys.has(candidate.key)) continue;
    usedKeys.add(candidate.key);
    chosen.push(candidate);
  }

  return {
    config,
    skill: topic.skill,
    title: `${level.id} · ${unit.title} · ${SKILL_LABELS[topic.skill]} · ${topic.title}`,
    exercises: shuffle(chosen).map((candidate) => candidate.build()),
    available: new Set(candidates.map((candidate) => candidate.key)).size,
  };
}
