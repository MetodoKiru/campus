import { A1_READING, ReadingText } from "@/lib/english/a1-reading";
import { A2_READING } from "@/lib/english/a2-reading";
import { B1_READING } from "@/lib/english/b1-reading";

// Course structure for the English engine. Units and topics follow Gateway (Macmillan):
// A1 as described in "Motor funcionamiento inglés" (Drive › 06 Tecnología › MVP), and
// A2 and B1 as in the Gateway 2nd edition scope and sequence published by Macmillan.
// Each topic points at a content bank in lib/english/content.ts.

export type EnglishLevelId = "A1" | "A2" | "B1" | "B2" | "C1";
export type EnglishSkill = "vocabulary" | "grammar" | "reading" | "listening" | "writing" | "speaking";

export interface EnglishTopic {
  id: string;
  title: string;
  skill: EnglishSkill;
  /**
   * Vocabulary/grammar: key of the bank in VOCABULARY or GRAMMAR (lib/english/content.ts).
   * Reading: id of the text in READING. Listening, writing, speaking: the unit id,
   * since they practise that unit's vocabulary and grammar.
   */
  bank: string;
  /** Instruction shown when the student has to type the answer. */
  writeInstruction?: string;
  /** Vocabulary practised as gap-fill sentences (word formation); the bank is in GRAMMAR. */
  gapFill?: boolean;
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
  reading: "Reading",
  listening: "Listening",
  writing: "Writing",
  speaking: "Speaking",
};

export const SKILL_ORDER: EnglishSkill[] = ["vocabulary", "grammar", "reading", "listening", "writing", "speaking"];

const vocab = (id: string, title: string, bank = id): EnglishTopic => ({ id, title, skill: "vocabulary", bank });
const wordFormation = (id: string, title: string, writeInstruction = "Escribe la palabra que falta, formada a partir de la que está entre paréntesis."): EnglishTopic => ({
  id,
  title,
  skill: "vocabulary",
  bank: id,
  writeInstruction,
  gapFill: true,
});
const grammar = (id: string, title: string, bank = id, writeInstruction?: string): EnglishTopic => ({
  id,
  title,
  skill: "grammar",
  bank,
  writeInstruction,
});

const A1_UNIT_LIST: EnglishUnit[] = [
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

const A2_UNIT_LIST: EnglishUnit[] = [
  {
    id: "unit1",
    title: "Unit 1 · It's my life",
    topics: [
      vocab("a2_schoolDay", "The school day"),
      vocab("a2_freeTime", "Free-time activities"),
      vocab("a2_placesInTown", "Places to go in a town"),
      grammar("a2_presentSimple", "Present simple affirmative and negative"),
      grammar("a2_prepositionsTime", "Prepositions of time", "a2_prepositionsTime", "Escribe in, on o at."),
      grammar("a2_adverbsFrequency", "Adverbs of frequency"),
      grammar("a2_presentSimpleQuestions", "Present simple questions"),
    ],
  },
  {
    id: "unit2",
    title: "Unit 2 · Around the house",
    topics: [
      vocab("a2_rooms", "Rooms"),
      vocab("a2_householdObjects", "Household objects and furniture"),
      vocab("a2_houseJobs", "Jobs around the house"),
      grammar("a2_thereIsAre", "There is / There are"),
      grammar("a2_prepositionsPlace", "Prepositions of place"),
      grammar("a2_presentContinuous", "Present continuous"),
      grammar("a2_presentSimpleContinuous", "Present simple and present continuous"),
    ],
  },
  {
    id: "unit3",
    title: "Unit 3 · Fitness fanatics",
    topics: [
      vocab("a2_body", "Parts of the body"),
      vocab("a2_physicalActivities", "Physical activities"),
      vocab("a2_sports", "Sports"),
      grammar("a2_canCant", "Can / can't"),
      grammar("a2_adverbsManner", "Adverbs of manner"),
      grammar("a2_haveToMust", "Have to / don't have to, must / mustn't"),
    ],
  },
  {
    id: "unit4",
    title: "Unit 4 · Tourist information",
    topics: [
      vocab("a2_countries", "Countries and nationalities"),
      vocab("a2_tourism", "Words connected with tourism"),
      vocab("a2_transport", "Transport"),
      grammar("a2_pastBe", "Past simple of to be"),
      grammar("a2_pastCan", "Past simple of can (could)"),
      grammar("a2_pastSimpleAff", "Past simple affirmative"),
    ],
  },
  {
    id: "unit5",
    title: "Unit 5 · Great works",
    topics: [
      vocab("a2_placesOfWork", "Places of work"),
      vocab("a2_jobs", "Jobs and work"),
      vocab("a2_cultureWork", "Culture and work"),
      grammar("a2_pastSimpleNeg", "Past simple negative"),
      grammar("a2_pastSimpleQuestions", "Past simple questions and short answers"),
      grammar("a2_pastContinuous", "Past continuous"),
    ],
  },
  {
    id: "unit6",
    title: "Unit 6 · Eat well, live well",
    topics: [
      vocab("a2_foodDrink", "Food and drink"),
      vocab("a2_containers", "Containers"),
      grammar("a2_countableUncountable", "Countable and uncountable nouns", "a2_countableUncountable", "Escribe a, an o some."),
      grammar("a2_someAny", "Some / any / a / an"),
      grammar("a2_muchMany", "A lot of / much / many"),
      grammar("a2_should", "Should / shouldn't"),
    ],
  },
  {
    id: "unit7",
    title: "Unit 7 · Wildlife watch",
    topics: [
      vocab("a2_wildAnimals", "Wild animals and insects"),
      vocab("a2_naturalWorld", "The natural world"),
      vocab("a2_weather", "The weather"),
      grammar("a2_goingTo", "Be going to"),
      grammar("a2_willWont", "Will / won't"),
      grammar("a2_presentContinuousFuture", "Present continuous for future"),
    ],
  },
  {
    id: "unit8",
    title: "Unit 8 · The world around me",
    topics: [
      vocab("a2_feelings", "Feelings"),
      vocab("a2_personality", "Personality"),
      vocab("a2_socialProblems", "Social problems"),
      grammar("a2_comparatives", "Comparative adjectives"),
      grammar("a2_superlatives", "Superlative adjectives"),
      grammar("a2_articles", "Articles", "a2_articles", "Escribe a, an o the."),
    ],
  },
  {
    id: "unit9",
    title: "Unit 9 · Top shops",
    topics: [
      vocab("a2_clothes", "Clothes"),
      vocab("a2_accessories", "Accessories"),
      vocab("a2_shops", "Shops"),
      grammar("a2_presentPerfect", "Present perfect"),
      grammar("a2_everNever", "Present perfect with ever and never"),
      grammar("a2_justAlreadyYet", "Present perfect with just, already and yet"),
    ],
  },
  {
    id: "unit10",
    title: "Unit 10 · Brilliant brains",
    topics: [
      vocab("a2_inventions", "Useful inventions"),
      vocab("a2_creating", "Creating and inventing"),
      vocab("a2_nounsIon", "Nouns ending in -ion"),
      grammar("a2_passive", "The passive"),
      grammar("a2_passiveBy", "The passive with by"),
      grammar("a2_zeroConditional", "Zero conditional"),
      grammar("a2_firstConditional", "First conditional"),
    ],
  },
];

const B1_UNIT_LIST: EnglishUnit[] = [
  {
    id: "unit1",
    title: "Unit 1 · Family life",
    topics: [
      vocab("b1_agesStages", "Ages and stages of life"),
      vocab("b1_family", "The family"),
      wordFormation("b1_nounSuffixes", "Noun suffixes -ment, -ion, -ence"),
      grammar("b1_presentSimpleContinuous", "Present simple and present continuous"),
      grammar("b1_articles", "Articles", "b1_articles", "Escribe a, an o the."),
    ],
  },
  {
    id: "unit2",
    title: "Unit 2 · Who did it?",
    topics: [
      vocab("b1_crimes", "Crimes and criminals"),
      vocab("b1_detectiveWork", "Detective work"),
      vocab("b1_phrasalInvestigating", "Phrasal verbs: investigating and finding"),
      grammar("b1_pastSimple", "Past simple"),
      grammar("b1_pastContinuous", "Past continuous"),
    ],
  },
  {
    id: "unit3",
    title: "Unit 3 · Universal language",
    topics: [
      vocab("b1_languages", "Countries, nationalities and languages"),
      vocab("b1_learningLanguage", "Learning a language"),
      wordFormation("b1_negativePrefixes", "Negative prefixes un-, in-, im-, ir-, il-"),
      grammar("b1_quantifiers", "Some, any, much, many, a lot of, a few, a little"),
      grammar("b1_relativePronouns", "Relative pronouns"),
    ],
  },
  {
    id: "unit4",
    title: "Unit 4 · Health watch",
    topics: [
      vocab("b1_body", "Parts of the body"),
      vocab("b1_illnesses", "Health problems and illnesses"),
      vocab("b1_healthCompounds", "Compound nouns: health and medicine"),
      grammar("b1_ppEverNever", "Present perfect with ever and never"),
      grammar("b1_ppForSince", "Present perfect with for and since"),
      grammar("b1_ppJustYetAlready", "Present perfect with just, yet, already"),
      grammar("b1_ppPastSimple", "Present perfect and past simple"),
    ],
  },
  {
    id: "unit5",
    title: "Unit 5 · TV addicts",
    topics: [
      vocab("b1_television", "Television"),
      vocab("b1_tvAdjectives", "Adjectives describing TV programmes"),
      wordFormation("b1_ingEd", "Adjectives ending in -ing and -ed"),
      grammar("b1_comparativesSuperlatives", "Comparatives and superlatives"),
      grammar("b1_lessAsAs", "Less … than, (not) as … as"),
      grammar("b1_tooEnough", "Too and (not) enough"),
    ],
  },
  {
    id: "unit6",
    title: "Unit 6 · Planet Earth",
    topics: [
      vocab("b1_geography", "Geographical features"),
      vocab("b1_environment", "The environment"),
      vocab("b1_get", "Different uses of get"),
      grammar("b1_goingToWill", "Be going to and will"),
      grammar("b1_willMayMight", "Will, may, might"),
      grammar("b1_zeroFirstConditional", "Zero and first conditional"),
    ],
  },
  {
    id: "unit7",
    title: "Unit 7 · Job hunting",
    topics: [
      vocab("b1_jobs", "Jobs and work"),
      vocab("b1_qualities", "Personal qualities"),
      vocab("b1_compoundAdjectives", "Compound adjectives"),
      grammar("b1_modalsObligation", "Modal verbs of obligation, prohibition and advice"),
      grammar("b1_secondConditional", "Second conditional"),
    ],
  },
  {
    id: "unit8",
    title: "Unit 8 · Best friends forever",
    topics: [
      vocab("b1_friendships", "Friendships"),
      vocab("b1_feelings", "Feelings"),
      wordFormation("b1_nounSuffixesNess", "Noun suffixes -ness, -ship, -dom"),
      grammar("b1_pastPerfect", "Past perfect"),
      grammar("b1_usedTo", "Used to"),
      grammar("b1_gerundsInfinitives", "Gerunds and infinitives"),
    ],
  },
  {
    id: "unit9",
    title: "Unit 9 · Bestsellers",
    topics: [
      vocab("b1_fiction", "Fiction"),
      vocab("b1_nonFiction", "Non-fiction"),
      vocab("b1_phrasalReading", "Phrasal verbs: reading and writing"),
      grammar("b1_reportedStatements", "Reported speech: statements"),
      grammar("b1_reportedQuestions", "Reported speech: questions"),
    ],
  },
  {
    id: "unit10",
    title: "Unit 10 · Log on",
    topics: [
      vocab("b1_computer", "Using a computer"),
      vocab("b1_internet", "The Internet"),
      vocab("b1_email", "Collocations with email"),
      grammar("b1_passivePresent", "The passive: present simple"),
      grammar("b1_passiveOtherTenses", "The passive: other tenses"),
      grammar("b1_haveSomethingDone", "Have something done"),
    ],
  },
];

// Every unit also gets Reading (one topic per text), Listening, Writing and Speaking.
function withSkills(units: EnglishUnit[], texts: ReadingText[]): EnglishUnit[] {
  return units.map((unit) => ({
    ...unit,
    topics: [
      ...unit.topics,
      ...texts
        .filter((text) => text.unitId === unit.id)
        .map((text) => ({ id: `reading_${text.id}`, title: text.title, skill: "reading" as const, bank: text.id })),
      { id: `listening_${unit.id}`, title: "Listening practice", skill: "listening", bank: unit.id },
      { id: `writing_${unit.id}`, title: "Sentence building", skill: "writing", bank: unit.id },
      { id: `speaking_${unit.id}`, title: "Read aloud", skill: "speaking", bank: unit.id },
    ],
  }));
}

export const ENGLISH_LEVELS: EnglishLevel[] = [
  { id: "A1", title: "Gateway A1", available: true, units: withSkills(A1_UNIT_LIST, A1_READING) },
  { id: "A2", title: "Gateway A2", available: true, units: withSkills(A2_UNIT_LIST, A2_READING) },
  { id: "B1", title: "Gateway B1", available: true, units: withSkills(B1_UNIT_LIST, B1_READING) },
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
