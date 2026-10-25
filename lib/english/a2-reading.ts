// Short original A2 reading texts, one per Gateway A2 unit, built around that unit's
// vocabulary and grammar. Same format as a1-reading.ts.

import { ReadingQuestion, ReadingText } from "@/lib/english/a1-reading";

const q = (question: string, answer: string, distractors: string[], level: 1 | 2 | 3 = 1): ReadingQuestion => ({
  question,
  answer,
  distractors,
  level,
});
const tf = (statement: string, isTrue: boolean, level: 1 | 2 | 3 = 1): ReadingQuestion =>
  q(`True or false? ${statement}`, isTrue ? "True" : "False", [isTrue ? "False" : "True"], level);

export const A2_READING: ReadingText[] = [
  {
    id: "a2_unit1Text",
    unitId: "unit1",
    title: "A day in the life of Maya",
    text:
      "Maya is fourteen and she lives in a small town near Bristol. On weekdays she gets up at seven and catches the bus at quarter to eight. " +
      "School starts at half past eight. Her favourite lesson is Art, but she doesn't like PE very much. At break she usually chats with her friends in the playground. " +
      "On Tuesdays she goes to an after-school drama club. At the weekend Maya hardly ever stays at home. On Saturday mornings she goes to the sports centre with her sister, " +
      "and in the afternoon she hangs out with friends in the shopping centre. She never does homework on Saturday. She does it on Sunday evening.",
    questions: [
      q("What time does Maya catch the bus?", "7:45", ["7:00", "8:30"]),
      q("What is Maya's favourite lesson?", "Art", ["PE", "Drama"]),
      tf("Maya goes to a drama club on Tuesdays.", true),
      q("Where does Maya go on Saturday mornings?", "to the sports centre", ["to the shopping centre", "to school"], 2),
      tf("Maya often stays at home at the weekend.", false, 2),
      q("When does Maya do her homework?", "on Sunday evening", ["on Saturday", "at break"], 2),
      q("Which word describes how often Maya stays at home at the weekend?", "hardly ever", ["usually", "always"], 3),
    ],
  },
  {
    id: "a2_unit2Text",
    unitId: "unit2",
    title: "Who does the housework?",
    text:
      "In the Taylor family, everybody helps at home. Mum does the shopping on Saturdays and Dad does most of the cooking. " +
      "Jack, who is twelve, lays the table and takes out the rubbish. His sister Emily is sixteen, so she does more jobs: she vacuums the floor and does the washing-up after dinner. " +
      "Today is different. Dad is working late, so Emily is cooking dinner. Jack is helping her. Mum is sitting in an armchair in the living room and she's reading a book. " +
      "'This is a nice change!' she says.",
    questions: [
      q("Who usually does the cooking?", "Dad", ["Mum", "Emily"]),
      q("What jobs does Jack do?", "He lays the table and takes out the rubbish.", ["He vacuums the floor.", "He does the shopping."], 2),
      tf("Emily does the washing-up after dinner.", true),
      q("Why is Emily cooking today?", "Dad is working late.", ["Mum is ill.", "Jack can't cook."], 2),
      q("What is Mum doing now?", "reading a book", ["cooking dinner", "doing the shopping"]),
      q("Where is Mum sitting?", "in the living room", ["in the kitchen", "in the garden"], 2),
      tf("Today Mum is doing more jobs than usual.", false, 3),
    ],
  },
  {
    id: "a2_unit3Text",
    unitId: "unit3",
    title: "The young climber",
    text:
      "Leo Martín is fifteen and he is one of the best young rock climbers in Spain. He started climbing when he was eight. " +
      "Now he trains five days a week. 'I have to go to the gym after school, and I must eat well,' he says. 'I don't have to train on Sundays, so I relax with my family.' " +
      "Leo can climb very quickly, but he always climbs carefully. 'You mustn't take risks,' he explains. 'Strong arms are important, but your legs and your fingers do a lot of the work too.'",
    questions: [
      q("How old was Leo when he started climbing?", "eight", ["five", "fifteen"]),
      q("How many days a week does Leo train?", "five", ["seven", "three"]),
      tf("Leo trains on Sundays.", false),
      q("How does Leo climb?", "quickly and carefully", ["slowly and carefully", "quickly and badly"], 2),
      q("What does Leo say you mustn't do?", "take risks", ["eat well", "train"], 2),
      q("Which parts of the body does Leo mention?", "arms, legs and fingers", ["head, back and knees", "hands, feet and neck"], 3),
    ],
  },
  {
    id: "a2_unit4Text",
    unitId: "unit4",
    title: "A trip to Lisbon",
    text:
      "Last spring we went to Lisbon, the capital of Portugal. We flew from Madrid and then we took the underground to our hotel. " +
      "The hotel was small but it was very clean. On the first day we went on a guided tour of the old town. Our guide was Portuguese, but she could speak English and Spanish perfectly. " +
      "We saw the castle and we ate fish in a small restaurant by the river. On the second day it was rainy, so we couldn't go to the beach. " +
      "We visited a museum instead. I bought some souvenirs for my friends: a tram key ring and some postcards.",
    questions: [
      q("How did they travel to Lisbon?", "by plane", ["by train", "by coach"]),
      q("How did they get to their hotel?", "by underground", ["by taxi", "on foot"]),
      tf("The hotel was big and dirty.", false),
      q("What languages could the guide speak?", "Portuguese, English and Spanish", ["Only Portuguese", "Portuguese and French"], 2),
      q("Why couldn't they go to the beach?", "It was rainy.", ["It was closed.", "They didn't have time."], 2),
      q("What did the writer do on the second day?", "visited a museum", ["went on a guided tour", "went to the beach"], 2),
      q("What souvenirs did the writer buy?", "a key ring and postcards", ["a T-shirt and a map", "a book and a mug"], 3),
    ],
  },
  {
    id: "a2_unit5Text",
    unitId: "unit5",
    title: "Frida Kahlo",
    text:
      "Frida Kahlo was a Mexican painter. She was born in 1907 near Mexico City. When she was eighteen, she was travelling home on a bus when it crashed. " +
      "She was badly hurt and she couldn't walk for months. She didn't go back to school. While she was lying in bed, she started to paint. " +
      "Her mother put a mirror above the bed, so Frida painted many pictures of herself. She didn't sell many paintings during her life, but today she is one of the most famous artists in the world.",
    questions: [
      q("Where was Frida Kahlo from?", "Mexico", ["Spain", "Italy"]),
      q("How old was she when the accident happened?", "18", ["7", "25"]),
      q("What was Frida doing when the accident happened?", "travelling home on a bus", ["painting a picture", "walking to school"], 2),
      tf("She went back to school after the accident.", false),
      q("Why did Frida paint many pictures of herself?", "There was a mirror above her bed.", ["Her teacher asked her to.", "She wanted to sell them."], 2),
      tf("Frida sold a lot of paintings during her life.", false, 2),
      q("Which tense describes an action in progress when the bus crashed?", "past continuous", ["past simple", "present simple"], 3),
    ],
  },
  {
    id: "a2_unit6Text",
    unitId: "unit6",
    title: "Healthy food at school",
    text:
      "Greenfield School wants students to eat better. The school canteen doesn't sell crisps or cans of cola any more. " +
      "Now there are bottles of water and cartons of fresh juice. At lunchtime students can choose a bowl of soup, a salad or a hot meal with lots of vegetables. " +
      "'We shouldn't eat too much sugar,' says the head cook, Mrs Patel. 'But you don't have to stop eating cake. A small piece of cake on Fridays is fine!' " +
      "Most students like the new menu, but some of them miss the chips.",
    questions: [
      q("What doesn't the canteen sell any more?", "crisps and cola", ["water and juice", "soup and salad"]),
      q("What drinks are there now?", "water and fresh juice", ["cola and lemonade", "tea and coffee"]),
      q("Who is Mrs Patel?", "the head cook", ["the head teacher", "a student"]),
      tf("Mrs Patel says students must stop eating cake.", false, 2),
      q("When can students have a small piece of cake?", "on Fridays", ["every day", "never"], 2),
      q("What do some students miss?", "the chips", ["the salad", "the soup"], 2),
      q("Which sentence is a piece of advice?", "We shouldn't eat too much sugar.", ["The canteen doesn't sell crisps.", "Most students like the new menu."], 3),
    ],
  },
  {
    id: "a2_unit7Text",
    unitId: "unit7",
    title: "Saving the bears",
    text:
      "There are about 300 brown bears in the mountains of northern Spain. Fifty years ago there were very few, but now the number is growing. " +
      "Next month a group of students from our school is going to visit a nature reserve to learn about them. We're leaving on Friday morning and we're staying for two nights. " +
      "The guide says we probably won't see a bear, because they are shy animals, but we will see eagles, wolves' footprints and beautiful waterfalls. " +
      "The weather forecast says it's going to be cold and foggy, so we're taking warm clothes.",
    questions: [
      q("How many brown bears are there in northern Spain?", "about 300", ["about 50", "about 3,000"]),
      tf("There were more bears fifty years ago.", false),
      q("When are the students leaving?", "on Friday morning", ["next Sunday", "tonight"]),
      q("How long are they staying?", "two nights", ["one week", "one night"], 2),
      q("Why probably won't they see a bear?", "Bears are shy animals.", ["There aren't any bears.", "It's going to be dark."], 2),
      q("What is the weather going to be like?", "cold and foggy", ["hot and sunny", "warm and windy"], 2),
      q("Which sentence is a prediction?", "We probably won't see a bear.", ["We're leaving on Friday.", "We're taking warm clothes."], 3),
    ],
  },
  {
    id: "a2_unit8Text",
    unitId: "unit8",
    title: "The kindest class",
    text:
      "Every year our town gives a prize to the kindest class in the area. This year the winner was class 3B from Hill School. " +
      "The students organised a cake sale and raised more than £500 for a charity that helps homeless people. They also visited an old people's home every week. " +
      "'Some of the people there were lonely,' says Ben, one of the students. 'Now they are happier, and so are we!' " +
      "Their teacher, Mr Jones, is very proud. 'They are the most generous and hard-working class I've ever had,' he says.",
    questions: [
      q("Which class won the prize?", "3B", ["3A", "2B"]),
      q("How did the students raise money?", "with a cake sale", ["with a concert", "with a football match"]),
      q("Who did the money help?", "homeless people", ["sick animals", "the school library"], 2),
      q("How did some people at the home feel before the visits?", "lonely", ["angry", "excited"], 2),
      tf("Mr Jones isn't happy with the class.", false),
      q("According to Mr Jones, the class is the most generous and ___.", "hard-working", ["shy", "funny"], 3),
    ],
  },
  {
    id: "a2_unit9Text",
    unitId: "unit9",
    title: "My favourite shop",
    text:
      "Have you ever been to a second-hand clothes shop? I've just found a great one near my house. It's small, but it has got everything: jackets, jeans, scarves, belts and even old sunglasses. " +
      "The clothes are cheap because people have already worn them. I've bought three T-shirts and a leather wallet there this month. " +
      "My best friend has never bought second-hand clothes, but she wants to try. We haven't gone together yet, but we're going on Saturday.",
    questions: [
      q("What kind of shop is it?", "a second-hand clothes shop", ["a department store", "a shoe shop"]),
      q("Why are the clothes cheap?", "People have already worn them.", ["They are very small.", "The shop is closing."], 2),
      q("What has the writer bought this month?", "three T-shirts and a wallet", ["a jacket and jeans", "sunglasses and a belt"], 2),
      tf("The writer's best friend has bought second-hand clothes before.", false),
      tf("The two friends have already been to the shop together.", false, 2),
      q("When are they going to the shop?", "on Saturday", ["today", "next month"]),
      q("Which word in the text means 'not new'?", "second-hand", ["cheap", "leather"], 3),
    ],
  },
  {
    id: "a2_unit10Text",
    unitId: "unit10",
    title: "A brilliant young inventor",
    text:
      "Kenta is thirteen and he has already won a national science competition. His invention is a smart umbrella. " +
      "If it starts to rain, the umbrella sends a message to your phone. If you leave it on the bus, your phone tells you where it is! " +
      "The umbrella was designed by Kenta in his bedroom and it was built with the help of his grandfather, who is an engineer. " +
      "'Most inventions are made to solve small problems,' says Kenta. 'If you have a good idea, you should try it.' Next year he will start working on a new project.",
    questions: [
      q("What has Kenta won?", "a science competition", ["a football match", "an art prize"]),
      q("What is Kenta's invention?", "a smart umbrella", ["a phone", "a robot"]),
      q("What happens if it starts to rain?", "The umbrella sends a message to your phone.", ["The umbrella opens.", "The phone switches off."], 2),
      q("Who helped Kenta build it?", "his grandfather", ["his teacher", "his sister"], 2),
      tf("The umbrella was designed in a laboratory.", false, 2),
      q("What does Kenta say about most inventions?", "They are made to solve small problems.", ["They are very expensive.", "They are made by engineers."], 3),
    ],
  },
];
