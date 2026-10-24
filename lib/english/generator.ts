import { A1_GRAMMAR, A1_VOCABULARY, GrammarItem } from "@/lib/english/a1-content";
import { A1_READING, ReadingText } from "@/lib/english/a1-reading";
import { EnglishLevelId, EnglishSkill, EnglishUnit, findLevel, findTopic, findUnit, SKILL_LABELS } from "@/lib/english/curriculum";

export type EnglishDifficulty = "baja" | "media" | "alta";

export const DIFFICULTY_LABELS: Record<EnglishDifficulty, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export const EXERCISE_COUNTS = [10, 15, 20] as const;

interface ExerciseBase {
  id: string;
  instruction: string;
  prompt: string;
  answer: string;
  /** Reading: the text the question is about. */
  passage?: { title: string; text: string };
  /** Listening: English text read aloud by the browser; the student does not see it. */
  audio?: string;
}

export interface ChoiceExercise extends ExerciseBase {
  type: "choice";
  options: string[];
}

export interface WriteExercise extends ExerciseBase {
  type: "write";
  /** Every spelling that counts as correct; the first one is shown as the solution. */
  accepted: string[];
}

/** Writing: build the sentence by putting the shuffled words in order. */
export interface OrderExercise extends ExerciseBase {
  type: "order";
  words: string[];
}

/** Speaking: read the sentence aloud; the answer is what speech recognition heard. */
export interface SpeakExercise extends ExerciseBase {
  type: "speak";
}

export type EnglishExercise = ChoiceExercise | WriteExercise | OrderExercise | SpeakExercise;

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
    .replace(/,/g, "")
    .replace(/^[¿¡\s]+/, "")
    .replace(/[\s.!?,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
  "10": "ten", "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen", "15": "fifteen", "16": "sixteen",
  "17": "seventeen", "18": "eighteen", "19": "nineteen", "20": "twenty",
};

// Recognisers write contractions either way ("I'm" / "I am"), so both sides are expanded.
const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "can not"],
  [/\bwon't\b/g, "will not"],
  [/\bcannot\b/g, "can not"],
  [/n't\b/g, " not"],
  [/'m\b/g, " am"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
  [/'d\b/g, " would"],
  [/\b(it|he|she|that|what|there|where|who)'s\b/g, "$1 is"],
];

function speechWords(value: string): string[] {
  const expanded = CONTRACTIONS.reduce((text, [pattern, full]) => text.replace(pattern, full), normalizeAnswer(value));
  return expanded
    .replace(/[.!?¿¡"«»:;]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => NUMBER_WORDS[word] ?? word);
}

/** Speech recognition is imperfect: accept when at least 80 % of the words were heard in order. */
export function speechMatches(target: string, heard: string): boolean {
  const expected = speechWords(target);
  const got = speechWords(heard);
  if (!expected.length || !got.length) return false;
  const lcs = Array.from({ length: expected.length + 1 }, () => new Array<number>(got.length + 1).fill(0));
  for (let i = 1; i <= expected.length; i++) {
    for (let j = 1; j <= got.length; j++) {
      lcs[i][j] = expected[i - 1] === got[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }
  const matched = lcs[expected.length][got.length];
  return matched / expected.length >= 0.8 && got.length <= expected.length + 3;
}

export function isCorrect(exercise: EnglishExercise, given: string | undefined): boolean {
  if (!given) return false;
  switch (exercise.type) {
    case "choice":
      return given === exercise.answer;
    case "write": {
      const normalized = normalizeAnswer(given);
      return exercise.accepted.some((option) => normalizeAnswer(option) === normalized);
    }
    case "order":
      return normalizeAnswer(given) === normalizeAnswer(exercise.answer);
    case "speak":
      return speechMatches(exercise.answer, given);
  }
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
  return items.map((item) => {
    const accepted = item.answer.split("/").map((answer) => answer.trim());
    const rank = LEVEL_PREFERENCE[difficulty].indexOf(item.level);
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

const LEVEL_PREFERENCE: Record<EnglishDifficulty, number[]> = { baja: [1, 2, 3], media: [2, 1, 3], alta: [3, 2, 1] };

function readingCandidates(text: ReadingText, difficulty: EnglishDifficulty): Candidate[] {
  return text.questions.map((question) => ({
    key: question.question,
    rank: difficulty === "media" ? (question.level === 3 ? 1 : 0) : LEVEL_PREFERENCE[difficulty].indexOf(question.level),
    build: () => ({
      id: newId(),
      type: "choice",
      instruction: "Lee el texto y responde.",
      prompt: question.question,
      options: shuffle([question.answer, ...shuffle(question.distractors).slice(0, difficulty === "baja" ? 1 : 2)]),
      answer: question.answer,
      passage: { title: text.title, text: text.text },
    }),
  }));
}

/** A complete sentence from a grammar item, with optional wrong versions for listening. */
interface UnitSentence {
  sentence: string;
  wrong: string[];
}

function completeSentence(sentence: string, fill: string): string {
  return sentence
    .replace("___", fill)
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+([.!?,])/g, "$1")
    .trim();
}

/** The vocabulary and full sentences of a unit, used by listening, writing and speaking. */
function unitMaterial(unit: EnglishUnit): { vocab: VocabEntry[]; sentences: UnitSentence[] } {
  const vocab: VocabEntry[] = [];
  const sentences: UnitSentence[] = [];
  const seen = new Set<string>();
  const addSentence = (sentence: string, wrong: string[]) => {
    if (seen.has(sentence)) return;
    seen.add(sentence);
    sentences.push({ sentence, wrong });
  };
  for (const topic of unit.topics) {
    if (topic.skill === "vocabulary") {
      for (const entry of parseVocab(A1_VOCABULARY[topic.bank] ?? [])) {
        if (vocab.some((other) => other.english[0] === entry.english[0])) continue;
        vocab.push(entry);
        // Whole phrases from the vocabulary (e.g. at the restaurant) are good sentences too.
        if (entry.english[0].split(" ").length >= 3) addSentence(entry.english[0], []);
      }
    }
    if (topic.skill === "grammar") {
      for (const item of A1_GRAMMAR[topic.bank] ?? []) {
        if (item.choiceOnly) {
          if (/[.?!]$/.test(item.answer) && item.answer.includes(" ")) addSentence(item.answer, item.distractors);
          continue;
        }
        const answer = item.answer.split("/")[0].trim();
        addSentence(
          completeSentence(item.sentence, answer),
          item.distractors.map((wrong) => completeSentence(item.sentence, wrong)),
        );
      }
    }
  }
  return { vocab, sentences };
}

const wordCount = (sentence: string) => sentence.split(" ").length;

function listeningCandidates(unit: EnglishUnit, difficulty: EnglishDifficulty): Candidate[] {
  const { vocab, sentences } = unitMaterial(unit);
  const meaning: Candidate[] = vocab.map((entry) => ({
    key: `meaning:${entry.english[0]}`,
    rank: { baja: 0, media: 1, alta: 2 }[difficulty],
    build: () => ({
      id: newId(),
      type: "choice",
      instruction: "Escucha y elige el significado.",
      prompt: "¿Qué palabra o expresión has oído?",
      audio: entry.english[0],
      options: shuffle([
        entry.spanish,
        ...shuffle(vocab.filter((other) => other.spanish !== entry.spanish))
          .slice(0, difficulty === "baja" ? 2 : 3)
          .map((other) => other.spanish),
      ]),
      answer: entry.spanish,
    }),
  }));
  const heard: Candidate[] = sentences
    .filter((item) => item.wrong.length > 0)
    .map((item) => ({
      key: `heard:${item.sentence}`,
      rank: { baja: 1, media: 0, alta: 1 }[difficulty],
      build: () => ({
        id: newId(),
        type: "choice",
        instruction: "Escucha y elige la frase exacta.",
        prompt: "¿Qué frase has oído?",
        audio: item.sentence,
        options: shuffle([item.sentence, ...shuffle(item.wrong).slice(0, difficulty === "baja" ? 1 : 2)]),
        answer: item.sentence,
      }),
    }));
  if (difficulty !== "alta") return [...meaning, ...heard];
  const dictation: Candidate[] = sentences
    .filter((item) => wordCount(item.sentence) <= 9)
    .map((item) => ({
      key: `dictation:${item.sentence}`,
      rank: 0,
      build: () => ({
        id: newId(),
        type: "write",
        instruction: "Escucha y escribe la frase completa.",
        prompt: "Dictado",
        audio: item.sentence,
        accepted: [item.sentence],
        answer: item.sentence,
      }),
    }));
  return [...dictation, ...heard, ...meaning];
}

/** Prefers short sentences at "baja" and long ones at "alta". */
function lengthRank(words: number, difficulty: EnglishDifficulty): number {
  if (difficulty === "baja") return words <= 5 ? 0 : words <= 7 ? 1 : 2;
  if (difficulty === "media") return words >= 5 && words <= 8 ? 0 : 1;
  return words >= 7 ? 0 : words >= 5 ? 1 : 2;
}

function writingCandidates(unit: EnglishUnit, difficulty: EnglishDifficulty): Candidate[] {
  return unitMaterial(unit)
    .sentences.filter((item) => wordCount(item.sentence) >= 3)
    .map((item) => {
      const words = item.sentence.split(" ");
      return {
        key: item.sentence,
        rank: lengthRank(words.length, difficulty),
        build: (): EnglishExercise => {
          let shuffled = shuffle(words);
          // Never hand out the words already in the right order.
          for (let tries = 0; tries < 5 && shuffled.join(" ") === item.sentence; tries++) shuffled = shuffle(words);
          return {
            id: newId(),
            type: "order",
            instruction: "Ordena las palabras para formar la frase.",
            prompt: "Toca las palabras en el orden correcto.",
            words: shuffled,
            answer: item.sentence,
          };
        },
      };
    });
}

function speakingCandidates(unit: EnglishUnit, difficulty: EnglishDifficulty): Candidate[] {
  const { vocab, sentences } = unitMaterial(unit);
  const phrases: Candidate[] = vocab.map((entry) => ({
    key: entry.english[0],
    rank: difficulty === "baja" ? 0 : 3,
    build: () => ({
      id: newId(),
      type: "speak",
      instruction: "Pulsa el micrófono y dilo en voz alta.",
      prompt: entry.english[0],
      answer: entry.english[0],
    }),
  }));
  const reading: Candidate[] = sentences.map((item) => ({
    key: item.sentence,
    rank: lengthRank(wordCount(item.sentence), difficulty),
    build: () => ({
      id: newId(),
      type: "speak",
      instruction: "Pulsa el micrófono y lee la frase en voz alta.",
      prompt: item.sentence,
      answer: item.sentence,
    }),
  }));
  return [...phrases, ...reading];
}

/** Builds a fresh activity: a new selection and order of exercises on every call. */
export function generateEnglishActivity(config: EnglishActivityConfig): EnglishActivity {
  const level = findLevel(config.levelId);
  const unit = findUnit(config.levelId, config.unitId);
  const topic = findTopic(config.levelId, config.unitId, config.topicId);
  if (!level?.available || !unit || !topic) throw new Error("El tema seleccionado no existe en el temario.");

  const candidatesBySkill: Record<EnglishSkill, () => Candidate[]> = {
    vocabulary: () => vocabularyCandidates(parseVocab(A1_VOCABULARY[topic.bank] ?? []), config.difficulty),
    grammar: () => grammarCandidates(A1_GRAMMAR[topic.bank] ?? [], config.difficulty, topic.writeInstruction),
    reading: () => {
      const text = A1_READING.find((item) => item.id === topic.bank);
      return text ? readingCandidates(text, config.difficulty) : [];
    },
    listening: () => listeningCandidates(unit, config.difficulty),
    writing: () => writingCandidates(unit, config.difficulty),
    speaking: () => speakingCandidates(unit, config.difficulty),
  };
  const candidates = candidatesBySkill[topic.skill]();

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
