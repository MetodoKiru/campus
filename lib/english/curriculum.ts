// Course structure for the English engine. Units and topics follow Gateway (Macmillan)
// A1 as described in "Motor funcionamiento inglés" (Drive › 06 Tecnología › MVP).
// Each topic points at a content bank in a1-content.ts.

export type EnglishLevelId = "A1" | "A2" | "B1" | "B2" | "C1";
export type EnglishSkill = "vocabulary" | "grammar";

export interface EnglishTopic {
  id: string;
  title: string;
  skill: EnglishSkill;
  /** Key of the bank in A1_VOCABULARY or A1_GRAMMAR. */
  bank: string;
  /** Instruction shown when the student has to type the answer. */
  writeInstruction?: string;
}

export interface EnglishUnit {
  id: string;
  title: string;
  topics: EnglishTopic[];
}

export interface EnglishLevel {
  id: EnglishLevelId;
  title: string;
  available: boolean;
  units: EnglishUnit[];
}

export const SKILL_LABELS: Record<EnglishSkill, string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
};

const vocab = (id: string, title: string, bank = id): EnglishTopic => ({ id, title, skill: "vocabulary", bank });
const grammar = (id: string, title: string, bank = id, writeInstruction?: string): EnglishTopic => ({
  id,
  title,
  skill: "grammar",
  bank,
  writeInstruction,
});

const A1_UNITS: EnglishUnit[] = [
  {
    id: "starter",
    title: "Starter",
    topics: [
      vocab("classroom", "Classroom language"),
      vocab("numbers", "Numbers"),
      vocab("daysMonths", "Days and months"),
      vocab("starterCountries", "Countries & nationalities", "countries"),
      grammar("starterToBe", "Verb to be", "toBe"),
    ],
  },
  {
    id: "unit1",
    title: "Unit 1 · Personal Information",
    topics: [
      vocab("family", "Family"),
      vocab("personalInfo", "Personal information"),
      vocab("countries", "Countries and nationalities"),
      vocab("jobs", "Jobs"),
      vocab("everydayObjects", "Everyday objects"),
      grammar("toBe", "Verb to be"),
      grammar("subjectPronouns", "Subject pronouns"),
      grammar("possessiveAdjectives", "Possessive adjectives"),
      grammar("articles", "Articles (a / an / the)", "articles", "Escribe a, an o the."),
    ],
  },
  {
    id: "unit2",
    title: "Unit 2 · Daily Life",
    topics: [
      vocab("dailyRoutines", "Daily routines"),
      vocab("schoolSubjects", "School subjects"),
      vocab("time", "Time"),
      vocab("daysOfWeek", "Days of the week"),
      grammar("presentSimple", "Present Simple"),
      grammar("adverbsFrequency", "Adverbs of frequency"),
      grammar("doDoesQuestions", "Questions with do / does"),
    ],
  },
  {
    id: "unit3",
    title: "Unit 3 · Food",
    topics: [
      vocab("food", "Food"),
      vocab("drinks", "Drinks"),
      vocab("meals", "Meals"),
      vocab("restaurants", "Restaurants"),
      grammar("countableUncountable", "Countable / uncountable nouns", "countableUncountable", "Escribe a, an o some."),
      grammar("someAny", "Some / any", "someAny", "Escribe some o any."),
      grammar("muchMany", "Much / many", "muchMany", "Escribe much o many."),
      grammar("unit3ThereIsAre", "There is / There are", "thereIsAre"),
    ],
  },
  {
    id: "unit4",
    title: "Unit 4 · Free Time",
    topics: [
      vocab("sports", "Sports"),
      vocab("hobbies", "Hobbies"),
      vocab("music", "Music"),
      vocab("leisure", "Leisure activities"),
      grammar("canCant", "Can / Can't"),
      grammar("likeIng", "Like + -ing"),
      grammar("objectPronouns", "Object pronouns"),
    ],
  },
  {
    id: "unit5",
    title: "Unit 5 · Home",
    topics: [
      vocab("rooms", "Rooms"),
      vocab("furniture", "Furniture"),
      vocab("householdObjects", "Household objects"),
      vocab("placePrepositions", "Prepositions of place"),
      grammar("thereIsAre", "There is / There are"),
      grammar("prepositions", "Prepositions"),
      grammar("possessiveS", "Possessive 's"),
    ],
  },
  {
    id: "unit6",
    title: "Unit 6 · Clothes",
    topics: [
      vocab("clothes", "Clothes"),
      vocab("shopping", "Shopping"),
      vocab("colours", "Colours"),
      grammar("presentContinuous", "Present Continuous"),
      grammar("presentSimpleVsContinuous", "Present Simple vs Present Continuous"),
    ],
  },
  {
    id: "unit7",
    title: "Unit 7 · Travel",
    topics: [
      vocab("holidays", "Holidays"),
      vocab("transport", "Transport"),
      vocab("weather", "Weather"),
      vocab("directions", "Directions"),
      grammar("pastSimple", "Past Simple"),
      grammar("regularVerbs", "Regular verbs"),
      grammar("irregularVerbs", "Irregular verbs"),
    ],
  },
  {
    id: "unit8",
    title: "Unit 8 · Future",
    topics: [
      vocab("futurePlans", "Future plans"),
      vocab("technology", "Technology"),
      vocab("celebrations", "Celebrations"),
      grammar("goingTo", "Going to"),
      grammar("futureExpressions", "Future expressions"),
    ],
  },
];

export const ENGLISH_LEVELS: EnglishLevel[] = [
  { id: "A1", title: "Gateway A1", available: true, units: A1_UNITS },
  { id: "A2", title: "Gateway A2", available: false, units: [] },
  { id: "B1", title: "Gateway B1", available: false, units: [] },
  { id: "B2", title: "Gateway B2", available: false, units: [] },
  { id: "C1", title: "Gateway C1", available: false, units: [] },
];

export function findLevel(levelId: string): EnglishLevel | undefined {
  return ENGLISH_LEVELS.find((level) => level.id === levelId);
}

export function findUnit(levelId: string, unitId: string): EnglishUnit | undefined {
  return findLevel(levelId)?.units.find((unit) => unit.id === unitId);
}

export function findTopic(levelId: string, unitId: string, topicId: string): EnglishTopic | undefined {
  return findUnit(levelId, unitId)?.topics.find((topic) => topic.id === topicId);
}

/** The next topic of the same skill in syllabus order, moving on to later units when needed. */
export function nextTopicOfSkill(levelId: string, unitId: string, topicId: string): { unitId: string; topicId: string } | undefined {
  const level = findLevel(levelId);
  const current = findTopic(levelId, unitId, topicId);
  if (!level || !current) return undefined;
  const ordered = level.units.flatMap((unit) => unit.topics.map((topic) => ({ unitId: unit.id, topic })));
  const start = ordered.findIndex((entry) => entry.unitId === unitId && entry.topic.id === topicId);
  // Starter and Unit 1 share banks; skip topics that would repeat the same content.
  const next = ordered.slice(start + 1).find((entry) => entry.topic.skill === current.skill && entry.topic.bank !== current.bank);
  return next ? { unitId: next.unitId, topicId: next.topic.id } : undefined;
}
