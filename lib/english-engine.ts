export interface EnglishQuestion {
  id: number;
  level: string;
  topic: string;
  question: string;
  context?: string;
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
  },
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
  {"id":61,"level":"A1","topic":"Basic Grammar","question":"Complete: My parents ___ at home.","options":["is","am","are","be"],"answer":"are","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"facil"},
  {"id":62,"level":"A1","topic":"Basic Grammar","question":"Choose the correct question.","options":["Where you live?","Where do you live?","Where does you live?","Where are live you?"],"answer":"Where do you live?","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"medio"},
  {"id":63,"level":"A1","topic":"Basic Grammar","question":"Complete: She ___ to school every day.","options":["go","goes","going","is go"],"answer":"goes","unit":"Unit 2: Daily Routines & Present Simple","category":"Grammar","difficulty":"medio"},
  {"id":64,"level":"A1","topic":"Basic Grammar","question":"Complete: I ___ breakfast at seven.","options":["has","having","have","am have"],"answer":"have","unit":"Unit 2: Daily Routines & Present Simple","category":"Grammar","difficulty":"facil"},
  {"id":65,"level":"A1","topic":"Basic Grammar","question":"Choose the correct possessive: This is ___ bag. (de él)","options":["his","he","him","he's"],"answer":"his","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"medio"},
  {"id":66,"level":"A1","topic":"Basic Grammar","question":"Complete: There ___ two chairs in the room.","options":["is","are","am","be"],"answer":"are","unit":"Unit 1: Introductions & To Be","category":"Grammar","difficulty":"facil"},
  {"id":67,"level":"A1","topic":"Basic Grammar","question":"Complete: They ___ watching TV now.","options":["is","am","are","be"],"answer":"are","unit":"Unit 2: Daily Routines & Present Simple","category":"Grammar","difficulty":"medio"},
  {"id":68,"level":"A1","topic":"Everyday Vocabulary","question":"Which word means 'cansado'?","options":["Hungry","Tired","Thirsty","Angry"],"answer":"Tired","unit":"Unit 2: Daily Routines & Present Simple","category":"Vocabulary","difficulty":"facil"},
  {"id":69,"level":"A1","topic":"Everyday Vocabulary","question":"Which one is a school subject?","options":["Maths","Sofa","Spoon","Jacket"],"answer":"Maths","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"facil"},
  {"id":70,"level":"A1","topic":"Everyday Vocabulary","question":"What is the opposite of 'early'?","options":["Late","Near","Quick","Short"],"answer":"Late","unit":"Unit 2: Daily Routines & Present Simple","category":"Vocabulary","difficulty":"medio"},
  {"id":71,"level":"A1","topic":"Everyday Vocabulary","question":"Which word means 'ventana'?","options":["Door","Wall","Window","Floor"],"answer":"Window","unit":"Unit 1: Introductions & To Be","category":"Vocabulary","difficulty":"facil"},
  {"id":72,"level":"A1","topic":"Everyday English","question":"How do you introduce a friend?","options":["This is my friend Ana.","I friend Ana.","She my friend is Ana.","My friend are Ana."],"answer":"This is my friend Ana.","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"facil"},
  {"id":73,"level":"A1","topic":"Everyday English","question":"You want to ask for the Wi-Fi password politely.","options":["What's the Wi-Fi password, please?","Give Wi-Fi.","Where password you?","Wi-Fi me now."],"answer":"What's the Wi-Fi password, please?","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"medio"},
  {"id":74,"level":"A1","topic":"Everyday English","question":"How do you ask someone to help you?","options":["Can you help me, please?","You help me can?","Help I you?","Can help you me."],"answer":"Can you help me, please?","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"facil"},
  {"id":75,"level":"A1","topic":"Everyday English","question":"Someone asks 'Where are you from?' You answer…","options":["I'm from Mexico.","I'm 14 years.","It's half past two.","I'm fine, thanks."],"answer":"I'm from Mexico.","unit":"Unit 1: Introductions & To Be","category":"Everyday English","difficulty":"facil"},
  {
    id: 76,
    level: "A1",
    topic: "Food and Shopping",
    question: "Complete: There ___ some apples in the bag.",
    options: ["is","are","am","be"],
    answer: "are",
    unit: "Unit 3: Food & Shopping",
    category: "Grammar",
    difficulty: "facil"
  },
  {
    id: 77,
    level: "A1",
    topic: "Food and Shopping",
    question: "At a café: 'I'd like ___ water, please.'",
    options: ["some","many","a few","an"],
    answer: "some",
    unit: "Unit 3: Food & Shopping",
    category: "Grammar",
    difficulty: "medio"
  },
  {
    id: 78,
    level: "A1",
    topic: "Food Vocabulary",
    question: "Which word means 'zanahoria'?",
    options: ["Cucumber","Carrot","Onion","Potato"],
    answer: "Carrot",
    unit: "Unit 3: Food & Shopping",
    category: "Vocabulary",
    difficulty: "facil"
  },
  {
    id: 79,
    level: "A1",
    topic: "At a Café",
    question: "You want to see the menu. What do you say?",
    options: ["Could I see the menu, please?","I see menu now.","Where menu you?","Give me see menu."],
    answer: "Could I see the menu, please?",
    unit: "Unit 3: Food & Shopping",
    category: "Everyday English",
    difficulty: "medio"
  },
  {
    id: 80,
    level: "A1",
    topic: "Prices",
    question: "Complete: 'How ___ are these bananas?' (asking the price)",
    options: ["many","much","old","long"],
    answer: "much",
    unit: "Unit 3: Food & Shopping",
    category: "Grammar",
    difficulty: "medio"
  },
  {
    id: 81,
    level: "A1",
    topic: "Shopping Vocabulary",
    question: "What is the opposite of 'cheap'?",
    options: ["Expensive","Easy","Small","Clean"],
    answer: "Expensive",
    unit: "Unit 3: Food & Shopping",
    category: "Vocabulary",
    difficulty: "facil"
  },
  {
    id: 82,
    level: "A1",
    topic: "At a Café",
    question: "A waiter asks, 'Would you like something to drink?' You answer…",
    options: ["Yes, a glass of water, please.","I am drink water.","No, I like drink.","A glass water is."],
    answer: "Yes, a glass of water, please.",
    unit: "Unit 3: Food & Shopping",
    category: "Everyday English",
    difficulty: "facil"
  },
  {
    id: 83,
    level: "A1",
    topic: "Food and Shopping",
    question: "Complete: 'There isn't ___ cheese left.'",
    options: ["some","any","many","a few"],
    answer: "any",
    unit: "Unit 3: Food & Shopping",
    category: "Grammar",
    difficulty: "medio"
  },
  {
    id: 84,
    level: "A1",
    topic: "Food Vocabulary",
    question: "Which food is common for breakfast?",
    options: ["Bread","Soap","A pencil","A ticket"],
    answer: "Bread",
    unit: "Unit 3: Food & Shopping",
    category: "Vocabulary",
    difficulty: "facil"
  },
  {
    id: 85,
    level: "A1",
    topic: "Food and Shopping",
    question: "Choose the correct sentence.",
    options: ["I would like a sandwich, please.","I would like sandwich please.","I like would a sandwich.","I would a sandwich like."],
    answer: "I would like a sandwich, please.",
    unit: "Unit 3: Food & Shopping",
    category: "Everyday English",
    difficulty: "medio"
  },
  {
    id: 86,
    level: "A1",
    topic: "Places in Town",
    question: "The bank is ___ the supermarket and the café.",
    options: ["between","under","on","at"],
    answer: "between",
    unit: "Unit 4: Places & Directions",
    category: "Grammar",
    difficulty: "medio"
  },
  {
    id: 87,
    level: "A1",
    topic: "Places Vocabulary",
    question: "Where can you borrow books?",
    options: ["At a library","At a bakery","At a station","At a cinema"],
    answer: "At a library",
    unit: "Unit 4: Places & Directions",
    category: "Vocabulary",
    difficulty: "facil"
  },
  {
    id: 88,
    level: "A1",
    topic: "Asking for Directions",
    question: "Someone asks how to get to the station. You say…",
    options: ["Go straight ahead.","I am straight station.","You go station where.","Straight ahead is go."],
    answer: "Go straight ahead.",
    unit: "Unit 4: Places & Directions",
    category: "Everyday English",
    difficulty: "facil"
  },
  {
    id: 89,
    level: "A1",
    topic: "There Is / There Are",
    question: "Complete: 'There ___ two parks near my house.'",
    options: ["is","are","am","be"],
    answer: "are",
    unit: "Unit 4: Places & Directions",
    category: "Grammar",
    difficulty: "facil"
  },
  {
    id: 90,
    level: "A1",
    topic: "Places Vocabulary",
    question: "What is the opposite of 'near'?",
    options: ["Far","Next","Behind","Inside"],
    answer: "Far",
    unit: "Unit 4: Places & Directions",
    category: "Vocabulary",
    difficulty: "facil"
  },
  {
    id: 91,
    level: "A1",
    topic: "Asking for Directions",
    question: "Choose a useful question when you are lost.",
    options: ["Excuse me, where is the museum?","Museum you where are?","Tell museum me now.","I lost where museum."],
    answer: "Excuse me, where is the museum?",
    unit: "Unit 4: Places & Directions",
    category: "Everyday English",
    difficulty: "medio"
  },
  {
    id: 92,
    level: "A1",
    topic: "Prepositions of Place",
    question: "Complete: 'The keys are ___ the bag.'",
    options: ["in","between","at","from"],
    answer: "in",
    unit: "Unit 4: Places & Directions",
    category: "Grammar",
    difficulty: "facil"
  },
  {
    id: 93,
    level: "A1",
    topic: "Transport Vocabulary",
    question: "Which vehicle travels on rails?",
    options: ["Train","Boat","Bicycle","Taxi"],
    answer: "Train",
    unit: "Unit 4: Places & Directions",
    category: "Vocabulary",
    difficulty: "facil"
  },
  {
    id: 94,
    level: "A1",
    topic: "Asking for Directions",
    question: "Someone asks, 'Is there a bus stop near here?' You answer…",
    options: ["Yes, it's next to the bank.","Yes, I am a bus stop.","The bus stop are near.","I have near bus."],
    answer: "Yes, it's next to the bank.",
    unit: "Unit 4: Places & Directions",
    category: "Everyday English",
    difficulty: "medio"
  },
  {
    id: 95,
    level: "A1",
    topic: "Free Time and Abilities",
    question: "Complete: 'She can ___ the piano.'",
    options: ["play","plays","playing","to play"],
    answer: "play",
    unit: "Unit 5: Free Time & Abilities",
    category: "Grammar",
    difficulty: "facil"
  },
  {
    id: 96,
    level: "A1",
    topic: "Free Time Vocabulary",
    question: "Which activity uses a racket and a ball?",
    options: ["Tennis","Reading","Cooking","Drawing"],
    answer: "Tennis",
    unit: "Unit 5: Free Time & Abilities",
    category: "Vocabulary",
    difficulty: "facil"
  },
  {
    id: 97,
    level: "A1",
    topic: "Free Time Conversation",
    question: "Someone asks, 'What do you do in your free time?' You answer…",
    options: ["I like reading.","I am thirteen years.","At half past two.","I from Spain."],
    answer: "I like reading.",
    unit: "Unit 5: Free Time & Abilities",
    category: "Everyday English",
    difficulty: "medio"
  },
  {
    id: 98,
    level: "A1",
    topic: "Free Time and Abilities",
    question: "Complete: 'They ___ swimming on Sundays.'",
    options: ["go","do","make","play"],
    answer: "go",
    unit: "Unit 5: Free Time & Abilities",
    category: "Grammar",
    difficulty: "medio"
  },
  {
    id: 99,
    level: "A1",
    topic: "Free Time Vocabulary",
    question: "What does 'draw' mean in Spanish?",
    options: ["Dibujar","Bailar","Cantar","Nadar"],
    answer: "Dibujar",
    unit: "Unit 5: Free Time & Abilities",
    category: "Vocabulary",
    difficulty: "facil"
  },
  {
    id: 100,
    level: "A1",
    topic: "Free Time Conversation",
    question: "A friend asks, 'Do you want to go to the park?' You answer…",
    options: ["Yes, that sounds great!","I want park go yes.","The park is yesterday.","I am go to park."],
    answer: "Yes, that sounds great!",
    unit: "Unit 5: Free Time & Abilities",
    category: "Everyday English",
    difficulty: "medio"
  }
,
  {
    id: 101,
    level: "A1",
    topic: "Reading: Mia's Day",
    question: "What time does Mia get up?",
    context: "Mia is twelve. She gets up at seven o'clock and has breakfast with her brother. She walks to school at eight. After school, she plays basketball.",
    options: ["At six o'clock","At seven o'clock","At eight o'clock","At nine o'clock"],
    answer: "At seven o'clock",
    unit: "Unit 2: Daily Routines & Present Simple",
    category: "Reading",
    difficulty: "facil"
  },
  {
    id: 102,
    level: "A1",
    topic: "Reading: Mia's Day",
    question: "How does Mia go to school?",
    context: "Mia is twelve. She gets up at seven o'clock and has breakfast with her brother. She walks to school at eight. After school, she plays basketball.",
    options: ["By bus","By car","On foot","By train"],
    answer: "On foot",
    unit: "Unit 2: Daily Routines & Present Simple",
    category: "Reading",
    difficulty: "facil"
  },
  {
    id: 103,
    level: "A1",
    topic: "Reading: A Family",
    question: "Where does Leo live?",
    context: "Leo lives in a small flat in Madrid with his mother and his sister Ana. They have a cat called Snow. Leo's favourite room is the kitchen because he likes cooking.",
    options: ["In a big house","In a small flat","In a hotel","At school"],
    answer: "In a small flat",
    unit: "Unit 1: Introductions & To Be",
    category: "Reading",
    difficulty: "facil"
  },
  {
    id: 104,
    level: "A1",
    topic: "Reading: A Family",
    question: "What is the cat's name?",
    context: "Leo lives in a small flat in Madrid with his mother and his sister Ana. They have a cat called Snow. Leo's favourite room is the kitchen because he likes cooking.",
    options: ["Leo","Ana","Snow","Madrid"],
    answer: "Snow",
    unit: "Unit 1: Introductions & To Be",
    category: "Reading",
    difficulty: "facil"
  },
  {
    id: 105,
    level: "A1",
    topic: "Reading: Weekend Plans",
    question: "What does Emma do on Saturday morning?",
    context: "Emma is busy this weekend. On Saturday morning, she visits her grandparents. In the afternoon, she plays tennis with her friend. On Sunday, she does her homework and watches a film.",
    options: ["She watches a film","She visits her grandparents","She does her homework","She goes shopping"],
    answer: "She visits her grandparents",
    unit: "Unit 5: Free Time & Abilities",
    category: "Reading",
    difficulty: "medio"
  },
  {
    id: 106,
    level: "A1",
    topic: "Reading: Weekend Plans",
    question: "When does Emma watch a film?",
    context: "Emma is busy this weekend. On Saturday morning, she visits her grandparents. In the afternoon, she plays tennis with her friend. On Sunday, she does her homework and watches a film.",
    options: ["On Friday","On Saturday morning","On Saturday afternoon","On Sunday"],
    answer: "On Sunday",
    unit: "Unit 5: Free Time & Abilities",
    category: "Reading",
    difficulty: "medio"
  },
  {
    id: 107,
    level: "A1",
    topic: "Reading: At the Café",
    question: "What does Tom order?",
    context: "Tom and his dad are at a café. Tom orders a cheese sandwich and orange juice. His dad has a coffee. They sit next to the window because it is sunny outside.",
    options: ["A burger and water","A cheese sandwich and orange juice","A cake and tea","A coffee and a salad"],
    answer: "A cheese sandwich and orange juice",
    unit: "Unit 3: Food & Shopping",
    category: "Reading",
    difficulty: "medio"
  },
  {
    id: 108,
    level: "A1",
    topic: "Reading: At the Café",
    question: "Where do Tom and his dad sit?",
    context: "Tom and his dad are at a café. Tom orders a cheese sandwich and orange juice. His dad has a coffee. They sit next to the window because it is sunny outside.",
    options: ["Near the door","In the garden","Next to the window","At home"],
    answer: "Next to the window",
    unit: "Unit 3: Food & Shopping",
    category: "Reading",
    difficulty: "medio"
  },
  {
    id: 109,
    level: "A1",
    topic: "Reading: The Town",
    question: "Where is the library?",
    context: "Our town has a library, a park and a sports centre. The library is opposite the school. The park is behind the sports centre. The bus stop is next to the library.",
    options: ["Behind the sports centre","Opposite the school","Inside the park","Next to the café"],
    answer: "Opposite the school",
    unit: "Unit 4: Places & Directions",
    category: "Reading",
    difficulty: "medio"
  },
  {
    id: 110,
    level: "A1",
    topic: "Reading: The Town",
    question: "What is next to the library?",
    context: "Our town has a library, a park and a sports centre. The library is opposite the school. The park is behind the sports centre. The bus stop is next to the library.",
    options: ["The bus stop","The sports centre","The cinema","The café"],
    answer: "The bus stop",
    unit: "Unit 4: Places & Directions",
    category: "Reading",
    difficulty: "medio"
  },
  {
    id: 111,
    level: "A1",
    topic: "Use of English: Present Simple",
    question: "Choose the correct sentence.",
    options: ["He go to school every day.","He goes to school every day.","He going to school every day.","He gone to school every day."],
    answer: "He goes to school every day.",
    unit: "Unit 2: Daily Routines & Present Simple",
    category: "Use of English",
    difficulty: "facil"
  },
  {
    id: 112,
    level: "A1",
    topic: "Use of English: Present Simple",
    question: "Complete: '___ your sister like music?'",
    options: ["Do","Does","Is","Are"],
    answer: "Does",
    unit: "Unit 2: Daily Routines & Present Simple",
    category: "Use of English",
    difficulty: "medio"
  },
  {
    id: 113,
    level: "A1",
    topic: "Use of English: Articles",
    question: "Choose the correct phrase.",
    options: ["an apple","a apple","the apple an","apple a"],
    answer: "an apple",
    unit: "Unit 3: Food & Shopping",
    category: "Use of English",
    difficulty: "facil"
  },
  {
    id: 114,
    level: "A1",
    topic: "Use of English: Prepositions",
    question: "Complete: 'My birthday is ___ May.'",
    options: ["at","on","in","from"],
    answer: "in",
    unit: "Unit 1: Introductions & To Be",
    category: "Use of English",
    difficulty: "medio"
  },
  {
    id: 115,
    level: "A1",
    topic: "Use of English: Can / Can't",
    question: "Choose the correct sentence.",
    options: ["She can to swim.","She cans swim.","She can swim.","She can swimming."],
    answer: "She can swim.",
    unit: "Unit 5: Free Time & Abilities",
    category: "Use of English",
    difficulty: "facil"
  },
  {
    id: 116,
    level: "A1",
    topic: "Use of English: Countable Nouns",
    question: "Complete: 'There are three ___ on the table.'",
    options: ["book","books","bookes","a book"],
    answer: "books",
    unit: "Unit 3: Food & Shopping",
    category: "Use of English",
    difficulty: "facil"
  },
  {
    id: 117,
    level: "A1",
    topic: "Use of English: Past and Present Time",
    question: "Choose the correct time expression: 'I have breakfast ___ the morning.'",
    options: ["on","at","in","to"],
    answer: "in",
    unit: "Unit 2: Daily Routines & Present Simple",
    category: "Use of English",
    difficulty: "medio"
  },
  {
    id: 118,
    level: "A1",
    topic: "Use of English: Questions",
    question: "Put the question in the correct form.",
    options: ["Where you live?","Where do you live?","Where does you live?","Where are live you?"],
    answer: "Where do you live?",
    unit: "Unit 1: Introductions & To Be",
    category: "Use of English",
    difficulty: "medio"
  },
  {
    id: 119,
    level: "A1",
    topic: "Use of English: There Is / There Are",
    question: "Complete: 'There ___ a supermarket near my house.'",
    options: ["are","am","is","be"],
    answer: "is",
    unit: "Unit 4: Places & Directions",
    category: "Use of English",
    difficulty: "facil"
  },
  {
    id: 120,
    level: "A1",
    topic: "Use of English: Some / Any",
    question: "Complete: 'Are there ___ eggs in the fridge?'",
    options: ["some","any","much","a"],
    answer: "any",
    unit: "Unit 3: Food & Shopping",
    category: "Use of English",
    difficulty: "medio"
  },
  {
    id: 121, level: "A1", topic: "Listening: Bus timetable", question: "¿A qué hora sale el autobús?",
    context: "Good morning. The bus to the city centre leaves at eight fifteen from platform three. Please have your ticket ready before boarding.", options: ["At 8:15","At 8:50","At 3:15","At 9:15"], answer: "At 8:15",
    unit: "Unit 4: Places & Directions", category: "Listening", difficulty: "medio"
  },
  {
    id: 122, level: "A1", topic: "Listening: Café order", question: "¿Qué pide la clienta para beber?",
    context: "Customer: Could I have a cheese sandwich and an orange juice, please? Waiter: Of course. Would you like anything else? Customer: No, thank you.", options: ["A cup of tea","An orange juice","A bottle of water","A coffee"], answer: "An orange juice",
    unit: "Unit 3: Food & Shopping", category: "Listening", difficulty: "facil"
  },
  {
    id: 123, level: "A1", topic: "Listening: Daily routine", question: "¿A qué hora empieza a trabajar Alex?",
    context: "I usually get up at seven and have breakfast at half past seven. I take the train at eight, and I start work at half past eight every morning.", options: ["At 7:30","At 8:00","At 8:30","At 9:00"], answer: "At 8:30",
    unit: "Unit 2: Daily Routines & Present Simple", category: "Listening", difficulty: "medio"
  },
  {
    id: 124, level: "A1", topic: "Listening: Meeting a friend", question: "¿Dónde van a quedar?",
    context: "Hi Mia, it's Ben. Let's meet outside the library at four o'clock. If it rains, we can wait inside the café next door.", options: ["At the station","Outside the library","In the school hall","At the supermarket"], answer: "Outside the library",
    unit: "Unit 1: Introductions & To Be", category: "Listening", difficulty: "facil"
  },
  {
    id: 125, level: "A1", topic: "Listening: Weather", question: "¿Qué tiempo va a hacer por la tarde?",
    context: "The morning is sunny, but the weather changes after lunch. It will be cloudy and rainy this afternoon, so take an umbrella when you go out.", options: ["Sunny and hot","Snowy","Cloudy and rainy","Windy and cold"], answer: "Cloudy and rainy",
    unit: "Unit 5: Weather & Free Time", category: "Listening", difficulty: "medio"
  },
  {
    id: 126, level: "A1", topic: "Listening: Shopping", question: "¿Cuánto cuestan las manzanas?",
    context: "Assistant: The apples are one pound fifty a kilo today. Customer: Great. Can I have two kilos, please? Assistant: Certainly. That's three pounds.", options: ["£1.50 in total","£2.00 a kilo","£3.00 in total","£3.50 in total"], answer: "£3.00 in total",
    unit: "Unit 3: Food & Shopping", category: "Listening", difficulty: "desafiante"
  },
  {
    id: 127, level: "A1", topic: "Listening: Family", question: "¿Cuántas personas hay en la familia de Sam?",
    context: "There are five people in my family: my parents, my two sisters and me. We live in a small house near the park.", options: ["Three","Four","Five","Six"], answer: "Five",
    unit: "Unit 1: Introductions & To Be", category: "Listening", difficulty: "facil"
  },
  {
    id: 128, level: "A1", topic: "Listening: Directions", question: "¿Cómo llega la persona al museo?",
    context: "Go straight on for two streets, then turn left at the bank. The museum is opposite the park, next to the post office.", options: ["Turn right at the bank","Go behind the station","Turn left at the bank","Cross the river"], answer: "Turn left at the bank",
    unit: "Unit 4: Places & Directions", category: "Listening", difficulty: "medio"
  },
  {
    id: 129, level: "A1", topic: "Listening: Weekend plans", question: "¿Qué va a hacer el sábado?",
    context: "I can't play football on Saturday because I have a music lesson in the morning. In the afternoon, I'm going to visit my grandmother, and on Sunday I'll do my homework.", options: ["Play football","Visit his grandmother","Go shopping","Do homework in the morning"], answer: "Visit his grandmother",
    unit: "Unit 5: Weather & Free Time", category: "Listening", difficulty: "medio"
  },
  {
    id: 130, level: "A1", topic: "Listening: At school", question: "¿Qué tiene que llevar mañana?",
    context: "Don't forget your English book and a pencil for tomorrow's lesson. You don't need your computer because we are going to work in pairs and use the classroom worksheets.", options: ["A computer and a ruler","An English book and a pencil","Only a notebook","A sports bag"], answer: "An English book and a pencil",
    unit: "Unit 2: Daily Routines & Present Simple", category: "Listening", difficulty: "medio"
  },
  {
    id: 131, level: "A1", topic: "Listening: Doctor's appointment", question: "¿A qué hora es la cita?",
    context: "Hello, this is the clinic calling to confirm your appointment with Dr Green. Your appointment is on Tuesday at quarter past eleven. Please arrive ten minutes early.", options: ["At 10:45","At 11:00","At 11:15","At 11:50"], answer: "At 11:15",
    unit: "Unit 5: Weather & Free Time", category: "Listening", difficulty: "desafiante"
  },
  {
    id: 132, level: "A1", topic: "Listening: House description", question: "¿Dónde está la cocina?",
    context: "My flat has two bedrooms and one bathroom. The kitchen is opposite the living room, and there is a small balcony next to my bedroom.", options: ["Next to the bathroom","Behind the bedroom","Opposite the living room","Above the living room"], answer: "Opposite the living room",
    unit: "Unit 4: Places & Directions", category: "Listening", difficulty: "medio"
  }
];

export interface EnglishWritingPrompt {
  id: number;
  title: string;
  instruction: string;
  unit: string;
  minimumWords: number;
  rubric: string[];
}

export const ENGLISH_A1_WRITING_PROMPTS: EnglishWritingPrompt[] = [
  { id: 1, title: "Introduce yourself", instruction: "Write a short introduction. Include your name, age, where you live, and two things you like.", unit: "Unit 1: Introductions & To Be", minimumWords: 25, rubric: ["I included all the requested information.", "I used I am / I live / I like correctly.", "I used capital letters and full stops."] },
  { id: 2, title: "My daily routine", instruction: "Describe your usual school day. Say when you get up, what you do in the morning and when you go to bed.", unit: "Unit 2: Daily Routines & Present Simple", minimumWords: 30, rubric: ["I described at least three daily activities.", "I used the present simple.", "I used time expressions such as at seven or in the morning."] },
  { id: 3, title: "My family or a friend", instruction: "Describe a person who is important to you. Write about their appearance, personality and one thing you do together.", unit: "Unit 1: Introductions & To Be", minimumWords: 30, rubric: ["I described the person with at least two adjectives.", "I used he/she is or has correctly.", "I included one shared activity."] },
  { id: 4, title: "My home", instruction: "Describe your home and your favourite room. Use there is / there are and at least three objects or pieces of furniture.", unit: "Unit 4: Places & Directions", minimumWords: 30, rubric: ["I described my home and favourite room.", "I used there is / there are.", "I used at least three place or furniture words."] },
  { id: 5, title: "Food I like", instruction: "Write about your favourite meal. Say what ingredients it has, what you usually drink with it and what food you do not like.", unit: "Unit 3: Food & Shopping", minimumWords: 25, rubric: ["I named a favourite meal and ingredients.", "I used like / don't like.", "I included food and drink vocabulary."] },
  { id: 6, title: "A café dialogue", instruction: "Write a short dialogue between a customer and a waiter. Order two things and include please, thank you and the price.", unit: "Unit 3: Food & Shopping", minimumWords: 30, rubric: ["I wrote both parts of the dialogue.", "I used polite requests.", "I included a price and a polite response."] },
  { id: 7, title: "Give directions", instruction: "Explain how to get from your school to a nearby place. Use at least three direction expressions.", unit: "Unit 4: Places & Directions", minimumWords: 25, rubric: ["I named the starting point and destination.", "I used at least three direction expressions.", "The order of instructions is clear."] },
  { id: 8, title: "My favourite free-time activity", instruction: "Describe what you like doing in your free time, how often you do it and who you do it with.", unit: "Unit 5: Weather & Free Time", minimumWords: 25, rubric: ["I described an activity and how often I do it.", "I used like + verb-ing or an A1 structure correctly.", "I included who I do it with or where."] },
  { id: 9, title: "Last weekend", instruction: "Write four or five simple sentences about last weekend. Say where you went and what you did.", unit: "Unit 5: Weather & Free Time", minimumWords: 30, rubric: ["I wrote about a past event.", "I used understandable past-time expressions.", "My sentences are in a clear order."] },
  { id: 10, title: "A message to a friend", instruction: "Write a short message inviting a friend to do something this weekend. Suggest a day, time and place, and ask a question.", unit: "Unit 5: Weather & Free Time", minimumWords: 25, rubric: ["I invited my friend to an activity.", "I suggested a day, time and place.", "I asked a question and used a friendly ending."] }
];

/** Select different bank questions that practise the same topics as the student's mistakes. */
export function getSimilarEnglishReviewQuestions(missedQuestionIds: number[], questionsPerError = 2): EnglishQuestion[] {
  const missed = missedQuestionIds.map((id) => ENGLISH_A1_DATABASE.find((question) => question.id === id)).filter((question): question is EnglishQuestion => Boolean(question));
  const excluded = new Set(missedQuestionIds);
  const selected = new Set<number>();
  const result: EnglishQuestion[] = [];

  for (const source of missed) {
    const candidates = ENGLISH_A1_DATABASE
      .filter((question) => !excluded.has(question.id) && !selected.has(question.id))
      .map((question) => ({
        question,
        score: (question.topic === source.topic ? 8 : 0)
          + (question.unit === source.unit ? 4 : 0)
          + (question.category === source.category ? 2 : 0)
          + (question.difficulty === source.difficulty ? 1 : 0),
      }))
      .filter((item) => item.score >= 2)
      .sort((a, b) => b.score - a.score || a.question.id - b.question.id);

    for (const item of candidates.slice(0, Math.max(1, Math.min(3, questionsPerError)))) {
      if (selected.has(item.question.id)) continue;
      selected.add(item.question.id);
      result.push(item.question);
    }
  }

  return result;
}
