export interface EnglishQuestion {
  id: number;
  level: string;
  topic: string;
  question: string;
  options: string[];
  answer: string;
  unit: string;       
  category: string;   
  difficulty: string; 
}

export interface EnglishConfig {
  studentUsername?: string;
  selectedUnits: string[];
  selectedCategory: string;
  difficulty: "facil" | "medio" | "desafiante" | "todas";
  questionCount: number;
}

export const ENGLISH_A1_DATABASE: EnglishQuestion[] = [
  {
    id: 1,
    level: "A1",
    topic: "Greetings and Basics",
    question: "¿Cómo se dice 'Buenos días' en inglés?",
    options: ["Good morning", "Good afternoon", "Good night", "Goodbye"],
    answer: "Good morning",
    unit: "Unit 1: Introductions & To Be",
    category: "Everyday English",
    difficulty: "facil"
  },
  {
    id: 2,
    level: "A1",
    topic: "Verb To Be",
    question: "Completa la frase: 'She ___ a student.'",
    options: ["am", "are", "is", "be"],
    answer: "is",
    unit: "Unit 1: Introductions & To Be",
    category: "Grammar",
    difficulty: "facil"
  },
  {
    id: 3,
    level: "A1",
    topic: "Daily Routines",
    question: "Elige la traducción correcta de 'I wake up early'.",
    options: ["Me acuesto tarde", "Me despierto temprano", "Desayuno solo", "Voy a casa"],
    answer: "Me despierto temprano",
    unit: "Unit 2: Daily Routines & Present Simple",
    category: "Vocabulary",
    difficulty: "medio"
  }
  ,{
    id: 4, level: "A1", topic: "Verb To Be", question: "Choose the correct sentence:",
    options: ["I am twelve years old.", "I is twelve years old.", "I are twelve years old.", "I be twelve years old."],
    answer: "I am twelve years old.", unit: "Unit 1: Introductions & To Be", category: "Grammar", difficulty: "facil"
  },
  {
    id: 5, level: "A1", topic: "Introductions", question: "How do you ask someone's name?",
    options: ["How old are you?", "What is your name?", "Where are you from?", "How are you?"],
    answer: "What is your name?", unit: "Unit 1: Introductions & To Be", category: "Everyday English", difficulty: "facil"
  },
  {
    id: 6, level: "A1", topic: "Verb To Be", question: "Complete: They ___ from Spain.",
    options: ["am", "is", "are", "be"],
    answer: "are", unit: "Unit 1: Introductions & To Be", category: "Grammar", difficulty: "facil"
  },
  {
    id: 7, level: "A1", topic: "Personal Information", question: "Choose the correct answer: 'Where are you from?'",
    options: ["I am thirteen.", "I am from Madrid.", "My name is Ana.", "I am fine, thanks."],
    answer: "I am from Madrid.", unit: "Unit 1: Introductions & To Be", category: "Everyday English", difficulty: "facil"
  },
  {
    id: 8, level: "A1", topic: "Present Simple", question: "Complete: He ___ football every Saturday.",
    options: ["play", "plays", "playing", "to play"],
    answer: "plays", unit: "Unit 2: Daily Routines & Present Simple", category: "Grammar", difficulty: "medio"
  },
  {
    id: 9, level: "A1", topic: "Daily Routines", question: "What does 'have breakfast' mean?",
    options: ["Cenar", "Desayunar", "Comer", "Dormir"],
    answer: "Desayunar", unit: "Unit 2: Daily Routines & Present Simple", category: "Vocabulary", difficulty: "facil"
  },
  {
    id: 10, level: "A1", topic: "Present Simple", question: "Choose the correct negative: 'I ___ like coffee.'",
    options: ["doesn't", "don't", "am not", "not"],
    answer: "don't", unit: "Unit 2: Daily Routines & Present Simple", category: "Grammar", difficulty: "medio"
  },
  {
    id: 11, level: "A1", topic: "Time", question: "What time is 'half past seven'?",
    options: ["7:15", "7:30", "7:45", "8:30"],
    answer: "7:30", unit: "Unit 2: Daily Routines & Present Simple", category: "Vocabulary", difficulty: "medio"
  },
  {
    id: 12, level: "A1", topic: "Adjectives", question: "Choose the opposite of 'big'.",
    options: ["Tall", "Long", "Small", "Old"],
    answer: "Small", unit: "Unit 1: Introductions & To Be", category: "Vocabulary", difficulty: "facil"
  },
  {
    id: 13, level: "A1", topic: "Articles", question: "Complete: It is ___ orange.",
    options: ["a", "an", "the", "—"],
    answer: "an", unit: "Unit 1: Introductions & To Be", category: "Grammar", difficulty: "medio"
  },
  {
    id: 14, level: "A1", topic: "Everyday English", question: "What is a polite way to say thank you?",
    options: ["Excuse me", "You're welcome", "Thank you very much", "Good night"],
    answer: "Thank you very much", unit: "Unit 1: Introductions & To Be", category: "Everyday English", difficulty: "facil"
  },
  {
    id: 15, level: "A1", topic: "Present Simple", question: "Complete: My sister ___ to school by bus.",
    options: ["go", "goes", "going", "is go"],
    answer: "goes", unit: "Unit 2: Daily Routines & Present Simple", category: "Grammar", difficulty: "medio"
  }
];