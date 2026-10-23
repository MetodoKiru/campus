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
,
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
];
