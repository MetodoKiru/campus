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
  {"id":16,"level":"A1","topic":"Basic Grammar","question":"Choose the correct form: I ___ from Spain.","options":["am","is","are","be"],"answer":"am","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"facil"},
  {"id":17,"level":"A1","topic":"Basic Grammar","question":"Complete: She ___ two brothers.","options":["have","has","having","is have"],"answer":"has","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"medio"},
  {"id":18,"level":"A1","topic":"Basic Grammar","question":"Complete: We ___ students.","options":["am","is","are","be"],"answer":"are","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"facil"},
  {"id":19,"level":"A1","topic":"Basic Grammar","question":"Complete: There ___ a book on the table.","options":["are","is","be","am"],"answer":"is","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"facil"},
  {"id":20,"level":"A1","topic":"Basic Grammar","question":"Choose the negative: They ___ like tea.","options":["doesn't","don't","aren't","isn't"],"answer":"don't","unit":"Unit 2: Daily Routines & Present Simple","category":"Grammar","difficulty":"medio"},
  {"id":21,"level":"A1","topic":"Basic Grammar","question":"Complete the question: ___ you speak English?","options":["Are","Do","Does","Is"],"answer":"Do","unit":"Unit 2: Daily Routines & Present Simple","category":"Grammar","difficulty":"medio"},
  {"id":22,"level":"A1","topic":"Basic Grammar","question":"Complete: He ___ like milk.","options":["don't","doesn't","isn't","aren't"],"answer":"doesn't","unit":"Unit 2: Daily Routines & Present Simple","category":"Grammar","difficulty":"medio"},
  {"id":23,"level":"A1","topic":"Basic Grammar","question":"Complete: This is ___ apple.","options":["a","an","the","some"],"answer":"an","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"facil"},
  {"id":24,"level":"A1","topic":"Basic Grammar","question":"The cat is ___ the table. (debajo)","options":["on","under","between","behind"],"answer":"under","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"medio"},
  {"id":25,"level":"A1","topic":"Basic Grammar","question":"Complete: I can ___ a bike.","options":["ride","rides","riding","to riding"],"answer":"ride","unit":"Unit 2: Daily Routines & Present Simple","category":"Grammar","difficulty":"medio"},
  {"id":26,"level":"A1","topic":"Basic Grammar","question":"Choose the correct sentence.","options":["She are happy.","She is happy.","She am happy.","She be happy."],"answer":"She is happy.","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"facil"},
  {"id":27,"level":"A1","topic":"Basic Grammar","question":"Complete: How many ___ are there?","options":["book","books","bookes","a book"],"answer":"books","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"medio"},
  {"id":28,"level":"A1","topic":"Basic Grammar","question":"My birthday is ___ May.","options":["at","on","in","to"],"answer":"in","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"medio"},
  {"id":29,"level":"A1","topic":"Everyday Vocabulary","question":"What is the opposite of 'hot'?","options":["Warm","Cold","Tall","Fast"],"answer":"Cold","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"facil"},
  {"id":30,"level":"A1","topic":"Everyday Vocabulary","question":"Which word is a family member?","options":["Kitchen","Cousin","Window","Pencil"],"answer":"Cousin","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"facil"},
  {"id":31,"level":"A1","topic":"Everyday Vocabulary","question":"What do you wear on your feet?","options":["Gloves","Shoes","Hat","Scarf"],"answer":"Shoes","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"facil"},
  {"id":32,"level":"A1","topic":"Everyday Vocabulary","question":"Which one is a fruit?","options":["Carrot","Potato","Apple","Bread"],"answer":"Apple","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"facil"},
  {"id":33,"level":"A1","topic":"Everyday Vocabulary","question":"What is the plural of 'child'?","options":["Childs","Children","Childes","Childrens"],"answer":"Children","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"medio"},
  {"id":34,"level":"A1","topic":"Everyday Vocabulary","question":"What do you use to write?","options":["A spoon","A pencil","A plate","A shoe"],"answer":"A pencil","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"facil"},
  {"id":35,"level":"A1","topic":"Everyday Vocabulary","question":"Which room do you sleep in?","options":["Bathroom","Bedroom","Kitchen","Garden"],"answer":"Bedroom","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"facil"},
  {"id":36,"level":"A1","topic":"Everyday Vocabulary","question":"What does 'thirsty' mean?","options":["Wanting a drink","Wanting sleep","Feeling cold","Feeling angry"],"answer":"Wanting a drink","unit":"Unit 2: Daily Routines & Present Simple","category":"Vocabulary","difficulty":"medio"},
  {"id":37,"level":"A1","topic":"Everyday Vocabulary","question":"Which word means 'rápido'?","options":["Slow","Fast","Late","Quiet"],"answer":"Fast","unit":"Unit 2: Daily Routines & Present Simple","category":"Vocabulary","difficulty":"facil"},
  {"id":38,"level":"A1","topic":"Everyday Vocabulary","question":"What is the opposite of 'expensive'?","options":["Cheap","Big","Beautiful","Difficult"],"answer":"Cheap","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"medio"},
  {"id":39,"level":"A1","topic":"Everyday Vocabulary","question":"Which one is a means of transport?","options":["Bus","Desk","Cup","Shirt"],"answer":"Bus","unit":"Unit 2: Daily Routines & Present Simple","category":"Vocabulary","difficulty":"facil"},
  {"id":40,"level":"A1","topic":"Everyday Vocabulary","question":"What is 'Monday'?","options":["A month","A day of the week","A season","A number"],"answer":"A day of the week","unit":"Unit 2: Daily Routines & Present Simple","category":"Vocabulary","difficulty":"facil"},
  {"id":41,"level":"A1","topic":"Everyday Vocabulary","question":"Which word means 'siempre'?","options":["Never","Sometimes","Always","Yesterday"],"answer":"Always","unit":"Unit 2: Daily Routines & Present Simple","category":"Vocabulary","difficulty":"medio"},
  {"id":42,"level":"A1","topic":"Everyday Vocabulary","question":"What is the opposite of 'young'?","options":["New","Old","Small","Short"],"answer":"Old","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"facil"},
  {"id":43,"level":"A1","topic":"Everyday Vocabulary","question":"Which item can tell you the time?","options":["Clock","Mirror","Plate","Bag"],"answer":"Clock","unit":"Unit 2: Daily Routines & Present Simple","category":"Vocabulary","difficulty":"facil"},
  {"id":44,"level":"A1","topic":"Everyday Vocabulary","question":"What does 'homework' mean?","options":["Vacaciones","Deberes","Desayuno","Trabajo de casa"],"answer":"Deberes","unit":"Unit 2: Daily Routines & Present Simple","category":"Vocabulary","difficulty":"medio"},
  {"id":45,"level":"A1","topic":"Everyday English","question":"Which adjective describes a person who helps others?","options":["Kind","Hungry","Round","Empty"],"answer":"Kind","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"medio"},
  {"id":46,"level":"A1","topic":"Everyday English","question":"You meet someone at 9 a.m. You say…","options":["Good night","Good morning","Good evening","Goodbye"],"answer":"Good morning","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"facil"},
  {"id":47,"level":"A1","topic":"Everyday English","question":"Someone says 'How are you?' You answer…","options":["I'm fine, thanks.","I'm twelve years.","I'm from Spain.","It's Monday."],"answer":"I'm fine, thanks.","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"facil"},
  {"id":48,"level":"A1","topic":"Everyday English","question":"How do you ask someone to repeat?","options":["Repeat, you!","Could you say that again, please?","What your name?","Say again you."],"answer":"Could you say that again, please?","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"medio"},
  {"id":49,"level":"A1","topic":"Everyday English","question":"You need to pass someone. You say…","options":["Excuse me.","Good night.","I'm ten.","See you yesterday."],"answer":"Excuse me.","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"facil"},
  {"id":50,"level":"A1","topic":"Everyday English","question":"Someone helps you. You say…","options":["Sorry","Thank you","Goodbye","Please you"],"answer":"Thank you","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"facil"},
  {"id":51,"level":"A1","topic":"Everyday English","question":"How do you ask for the price?","options":["How much is it?","How old is it?","Where is it from?","What time is it?"],"answer":"How much is it?","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"medio"},
  {"id":52,"level":"A1","topic":"Everyday English","question":"In a café, how do you order politely?","options":["I want coffee now!","Can I have a coffee, please?","You coffee me.","Coffee is you."],"answer":"Can I have a coffee, please?","unit":"Unit 2: Daily Routines & Present Simple","category":"Everyday English","difficulty":"medio"},
  {"id":53,"level":"A1","topic":"Everyday English","question":"Someone says 'Thank you'. You reply…","options":["You're welcome.","I'm welcome.","Thank you welcome.","No, I thank."],"answer":"You're welcome.","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"facil"},
  {"id":54,"level":"A1","topic":"Everyday English","question":"How do you ask where the toilet is?","options":["Where is the toilet, please?","Who toilet you?","What is toilet?","When toilet?"],"answer":"Where is the toilet, please?","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"medio"},
  {"id":55,"level":"A1","topic":"Everyday English","question":"You don't understand. You say…","options":["I don't understand.","I am not understand.","I no understand.","I doesn't understand."],"answer":"I don't understand.","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"medio"},
  {"id":56,"level":"A1","topic":"Everyday English","question":"How do you say goodbye to a friend?","options":["See you later!","Good morning!","Nice to meet you yesterday!","How are you?"],"answer":"See you later!","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"facil"},
  {"id":57,"level":"A1","topic":"Everyday English","question":"You arrive late to class. You say…","options":["I'm sorry I'm late.","I'm late sorry you.","I sorry late am.","Late I am sorry?"],"answer":"I'm sorry I'm late.","unit":"Unit 2: Daily Routines & Present Simple","category":"Everyday English","difficulty":"medio"},
  {"id":58,"level":"A1","topic":"Everyday English","question":"How do you offer help?","options":["Can I help you?","I help you can?","You can helping?","Help you am?"],"answer":"Can I help you?","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"medio"},
  {"id":59,"level":"A1","topic":"Everyday English","question":"You want someone to speak slowly. You say…","options":["Could you speak more slowly, please?","Speak slow you.","You speaking slow?","More slow speak."],"answer":"Could you speak more slowly, please?","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"medio"},
  {"id":60,"level":"A1","topic":"Everyday English","question":"How do you ask someone to spell their name?","options":["How do you spell your name?","How your name spell?","What spell name?","Spell you name how?"],"answer":"How do you spell your name?","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"medio"},
];