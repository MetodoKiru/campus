// Short original A1 reading texts, one or two per Gateway A1 unit, each built around
// that unit's vocabulary and grammar. Questions are multiple choice; "True or false"
// questions use the options True / False.

export interface ReadingQuestion {
  question: string;
  answer: string;
  distractors: string[];
  level: 1 | 2 | 3;
}

export interface ReadingText {
  id: string;
  unitId: string;
  title: string;
  text: string;
  questions: ReadingQuestion[];
}

const q = (question: string, answer: string, distractors: string[], level: 1 | 2 | 3 = 1): ReadingQuestion => ({
  question,
  answer,
  distractors,
  level,
});
const tf = (statement: string, isTrue: boolean, level: 1 | 2 | 3 = 1): ReadingQuestion =>
  q(`True or false? ${statement}`, isTrue ? "True" : "False", [isTrue ? "False" : "True"], level);

export const A1_READING: ReadingText[] = [
  {
    id: "starterNewClass",
    unitId: "starter",
    title: "A new class",
    text:
      "Hello! My name is Leo and I'm twelve years old. I'm from Valencia, in Spain. Today is Monday, the fourteenth of September, " +
      "and it's my first day at a new school. My teacher is Mrs Brown. She is English and she is very nice. " +
      "There are twenty-five students in my class. My new friend is Yuki. She is from Japan and she is thirteen.",
    questions: [
      q("How old is Leo?", "12", ["13", "14"]),
      q("Where is Leo from?", "Spain", ["England", "Japan"]),
      q("What day is it today?", "Monday", ["Sunday", "Friday"]),
      tf("Mrs Brown is Spanish.", false),
      q("How many students are there in Leo's class?", "25", ["15", "12"], 2),
      q("Where is Yuki from?", "Japan", ["China", "Spain"], 2),
      tf("Yuki is older than Leo.", true, 3),
    ],
  },
  {
    id: "unit1MyFamily",
    unitId: "unit1",
    title: "My family",
    text:
      "This is my family. My dad's name is Carlos. He is a doctor at a big hospital. My mum is Anna. She is a teacher and she is from Italy. " +
      "I have got one brother and one sister. My brother, Pablo, is sixteen. My sister, Lucía, is nine. " +
      "Our grandmother lives with us. Her name is Rosa and she is seventy years old. We have got a dog too. Its name is Toby.",
    questions: [
      q("What is the dad's job?", "doctor", ["teacher", "engineer"]),
      q("Where is the mum from?", "Italy", ["Spain", "France"]),
      q("How many brothers and sisters has the writer got?", "two", ["one", "three"], 2),
      tf("Pablo is nine.", false),
      q("Who lives with the family?", "the grandmother", ["the uncle", "the cousin"], 2),
      q("What is Toby?", "a dog", ["a brother", "a cat"]),
      tf("Rosa is seventy years old.", true),
    ],
  },
  {
    id: "unit1Profile",
    unitId: "unit1",
    title: "A student profile",
    text:
      "Name: Emma Wilson. Age: 13. Nationality: British. City: Manchester. " +
      "Emma is a student at Park Hill School. Her favourite things are her phone, her guitar and her bike. " +
      "Her best friend is Sam. He is American, but he lives in Manchester with his parents. " +
      "Their teacher is Mr Lee. He teaches Science and he is also an engineer.",
    questions: [
      q("What is Emma's surname?", "Wilson", ["Emma", "Lee"]),
      q("What nationality is Emma?", "British", ["American", "Irish"]),
      tf("Sam lives in the United States.", false, 2),
      q("Which object is NOT one of Emma's favourite things?", "her watch", ["her guitar", "her bike"], 2),
      q("What does Mr Lee teach?", "Science", ["Maths", "English"]),
      tf("Mr Lee is an engineer.", true, 3),
    ],
  },
  {
    id: "unit2MyDay",
    unitId: "unit2",
    title: "Tom's school day",
    text:
      "Tom always gets up at seven o'clock. He has a shower and gets dressed. He has breakfast with his sister at half past seven. " +
      "He goes to school by bus. School starts at quarter to nine. His favourite subject is History, but he doesn't like Maths. " +
      "On Tuesdays and Thursdays he has PE. He gets home at five o'clock and does his homework. He usually goes to bed at ten.",
    questions: [
      q("What time does Tom get up?", "7:00", ["7:30", "8:45"]),
      q("How does Tom go to school?", "by bus", ["on foot", "by car"]),
      q("What time does school start?", "8:45", ["9:15", "7:30"], 2),
      tf("Tom likes Maths.", false),
      q("When does Tom have PE?", "on Tuesdays and Thursdays", ["every day", "on Mondays"], 2),
      q("What does Tom do when he gets home?", "his homework", ["PE", "his breakfast"], 2),
      tf("Tom never goes to bed at ten.", false, 3),
    ],
  },
  {
    id: "unit3Cafe",
    unitId: "unit3",
    title: "At the café",
    text:
      "Waiter: Hello. Are you ready to order? " +
      "Mia: Yes, please. I'd like a cheese sandwich and an orange juice. " +
      "Waiter: Sorry, there isn't any orange juice today. There is some apple juice. " +
      "Mia: OK, an apple juice, please. Are there any cakes? " +
      "Waiter: Yes, there are some chocolate cakes. " +
      "Mia: Great! One chocolate cake, please. How much is it? " +
      "Waiter: That's six pounds fifty.",
    questions: [
      q("What does Mia want to eat first?", "a cheese sandwich", ["a chicken sandwich", "a salad"]),
      tf("There is orange juice today.", false),
      q("What does Mia drink?", "apple juice", ["orange juice", "water"]),
      q("What kind of cake is there?", "chocolate", ["lemon", "strawberry"], 2),
      q("How much does Mia pay?", "£6.50", ["£5.60", "£16.50"], 2),
      q("Who asks 'Are you ready to order?'", "the waiter", ["Mia", "the cook"], 2),
      tf("Mia doesn't order a cake.", false, 3),
    ],
  },
  {
    id: "unit4FreeTime",
    unitId: "unit4",
    title: "Free time",
    text:
      "Hi, I'm Daniel. I love sport! I can swim very well and I play basketball on Wednesdays. I can't play tennis, but I want to learn. " +
      "My friend Laura doesn't like sport. She likes reading and drawing, and she can play the guitar. " +
      "At the weekend we often go to the cinema together or we meet our friends in the park. " +
      "We both love listening to music.",
    questions: [
      q("What sport does Daniel play on Wednesdays?", "basketball", ["tennis", "football"]),
      tf("Daniel can play tennis.", false),
      q("What does Laura like?", "reading and drawing", ["swimming", "basketball"]),
      q("What instrument can Laura play?", "the guitar", ["the piano", "the drums"]),
      q("Where do they meet their friends?", "in the park", ["at school", "at the beach"], 2),
      tf("Daniel and Laura both like listening to music.", true, 2),
      q("What does Daniel want to learn?", "tennis", ["swimming", "the guitar"], 3),
    ],
  },
  {
    id: "unit5MyHouse",
    unitId: "unit5",
    title: "My house",
    text:
      "I live in a small house with a garden. On the ground floor there is a kitchen, a living room and a bathroom. " +
      "Upstairs there are three bedrooms. My bedroom is next to my parents' room. " +
      "In my bedroom there is a bed, a desk and a big wardrobe. There aren't any pictures on the walls. " +
      "My cat's favourite place is under my bed. My brother's room is opposite the bathroom.",
    questions: [
      q("How many bedrooms are there?", "three", ["two", "four"]),
      q("Where is the kitchen?", "on the ground floor", ["upstairs", "in the garden"], 2),
      tf("There are some pictures on the bedroom walls.", false),
      q("Where is the cat's favourite place?", "under the bed", ["on the desk", "in the garden"]),
      q("Whose room is next to the writer's room?", "the parents'", ["the brother's", "the cat's"], 2),
      q("Which room is opposite the brother's room?", "the bathroom", ["the kitchen", "the living room"], 3),
    ],
  },
  {
    id: "unit6Shopping",
    unitId: "unit6",
    title: "Shopping for a party",
    text:
      "It's Saturday and Sara is at the shopping centre with her mum. They are looking for clothes for a party. " +
      "Sara usually wears jeans and trainers, but today she is trying on a blue dress. " +
      "'Can I try it in a smaller size?' she asks the shop assistant. The dress is thirty pounds, but there's a sale today, so it's only twenty. " +
      "Her mum is buying a black jacket. They are very happy.",
    questions: [
      q("Where are Sara and her mum?", "at the shopping centre", ["at a party", "at home"]),
      q("What does Sara usually wear?", "jeans and trainers", ["a dress", "a black jacket"], 2),
      q("What colour is the dress?", "blue", ["black", "red"]),
      tf("Sara wants a bigger size.", false, 2),
      q("How much is the dress today?", "£20", ["£30", "£13"], 2),
      q("What is Sara's mum buying?", "a jacket", ["a dress", "trainers"]),
      tf("Sara is wearing the dress right now.", true, 3),
    ],
  },
  {
    id: "unit7Holiday",
    unitId: "unit7",
    title: "A holiday in London",
    text:
      "Last summer I went to London with my family. We travelled by plane and then we took the underground to our hotel. " +
      "The weather was sunny and hot for the first three days, but on Thursday it rained a lot. " +
      "We visited the British Museum and we saw Big Ben. My favourite day was Wednesday: we went on a boat on the river. " +
      "I bought a red bus for my little brother. We didn't go to the zoo because we didn't have time.",
    questions: [
      q("How did the family travel to London?", "by plane", ["by train", "by car"]),
      q("What was the weather like on Thursday?", "rainy", ["sunny", "snowy"]),
      q("What was the writer's favourite day?", "Wednesday", ["Thursday", "Monday"], 2),
      tf("They visited the zoo.", false),
      q("What did the writer buy for the brother?", "a red bus", ["a boat", "a map"], 2),
      q("Why didn't they go to the zoo?", "They didn't have time.", ["It was closed.", "It was rainy."], 3),
    ],
  },
  {
    id: "unit8Plans",
    unitId: "unit8",
    title: "Plans for the future",
    text:
      "Next week is my birthday and I'm going to have a party at home. I'm going to invite ten friends. " +
      "My mum is going to make a big chocolate cake. We aren't going to go out because the weather is going to be cold. " +
      "In the future I'm going to study Technology at university. I want to design apps and websites. " +
      "After university, I'm going to travel the world for a year.",
    questions: [
      q("When is the writer's birthday?", "next week", ["today", "next year"]),
      q("Where is the party going to be?", "at home", ["in a park", "at school"]),
      q("How many friends is the writer going to invite?", "ten", ["two", "twelve"]),
      tf("They are going to go out because the weather is going to be nice.", false, 2),
      q("What is the writer going to study?", "Technology", ["History", "Music"], 2),
      q("What is the writer going to do after university?", "travel the world", ["design a cake", "buy a house"], 3),
    ],
  },
];
