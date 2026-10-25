// Original B1 reading texts, one per Gateway B1 unit, built around that unit's
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

export const B1_READING: ReadingText[] = [
  {
    id: "b1_unit1Text",
    unitId: "unit1",
    title: "Three generations under one roof",
    text:
      "In many countries, more and more families are living with three generations in the same house. The García family from Seville is a good example. " +
      "Grandma Carmen retired five years ago and now she looks after her grandson, Hugo, who is a toddler, while his parents are at work. " +
      "Hugo's sister, Lucía, is a teenager and she's studying for her exams this year. 'Sometimes it's noisy and we don't always agree,' she says, " +
      "'but I get on really well with my grandmother. She gives me advice and she never criticises me.' " +
      "Her parents say the arrangement is a big improvement: they save money and the children are growing up with a lot of love around them.",
    questions: [
      q("What is happening in many countries?", "More families are living with three generations together.", ["More grandparents are living alone.", "Families are getting smaller."]),
      q("What does Grandma Carmen do?", "She looks after her grandson.", ["She works in an office.", "She studies for exams."]),
      q("How old is Hugo?", "He is a toddler.", ["He is a teenager.", "He is an adult."], 2),
      tf("Lucía doesn't get on with her grandmother.", false),
      q("Why do the parents think it's an improvement?", "They save money and the children have a lot of love.", ["The house is quieter.", "The grandmother cooks every day."], 2),
      q("Which word in the text means 'stopped working because of age'?", "retired", ["grew up", "looked after"], 3),
    ],
  },
  {
    id: "b1_unit2Text",
    unitId: "unit2",
    title: "The case of the missing painting",
    text:
      "On Saturday night a valuable painting disappeared from the town museum. The security guard was watching a football match on his phone when the alarm went off. " +
      "When he got to the room, the painting had gone. Detective Inspector Shah looked into the case the next morning. She found fingerprints on a window and a clue on the floor: a ticket from the local cinema. " +
      "She interviewed three suspects. Two of them had alibis, but the third, a young man who worked at the museum café, couldn't explain where he had been. " +
      "In the end, the police tracked him down at the train station. He was carrying a large bag. Inside it they found the painting.",
    questions: [
      q("What was the security guard doing when the alarm went off?", "watching a football match", ["sleeping", "talking to a detective"]),
      q("What did the detective find on the floor?", "a cinema ticket", ["a phone", "a bag"], 2),
      q("How many suspects did she interview?", "three", ["two", "one"]),
      tf("All the suspects had alibis.", false),
      q("Where did the third suspect work?", "at the museum café", ["at the cinema", "at the train station"], 2),
      q("Where did the police find him?", "at the train station", ["at the museum", "at home"]),
      q("What does 'tracked him down' mean in the text?", "found him after searching", ["let him go", "followed him home"], 3),
    ],
  },
  {
    id: "b1_unit3Text",
    unitId: "unit3",
    title: "How I learnt Japanese",
    text:
      "When I was fourteen, I discovered Japanese comics and I decided to learn the language. At first it seemed impossible: there are three writing systems and thousands of characters. " +
      "I didn't have much money for classes, so I used a few free apps and I watched a lot of Japanese films with subtitles. " +
      "I wrote down new words in a notebook and I revised them every night. The person who helped me most was Kenji, an exchange student whose family lived near my school. " +
      "He corrected my pronunciation and taught me some slang. Now I'm not completely fluent, but I can have a conversation and I've made friends in Japan.",
    questions: [
      q("Why did the writer start learning Japanese?", "because of Japanese comics", ["because of a school trip", "because of a teacher"]),
      q("Why didn't the writer go to classes?", "There wasn't much money.", ["There were no classes.", "Classes were boring."], 2),
      q("What did the writer do every night?", "revised new words", ["watched comics", "phoned Kenji"]),
      q("Who was Kenji?", "an exchange student", ["a teacher", "the writer's cousin"]),
      tf("The writer is completely fluent now.", false, 2),
      q("In 'Kenji, an exchange student whose family lived near my school', what does 'whose' refer to?", "Kenji's", ["the writer's", "the school's"], 3),
    ],
  },
  {
    id: "b1_unit4Text",
    unitId: "unit4",
    title: "Too much screen time?",
    text:
      "Have you ever had a headache after a long day in front of a screen? You aren't alone. Doctors have noticed a big increase in young people with eye problems and back pain since 2020. " +
      "Dr Ana Ruiz has worked at a health centre in Madrid for twelve years. 'Teenagers have always had colds and the flu,' she says, 'but in the last few years I've seen more patients with sore eyes and neck pain.' " +
      "Her advice is simple: take a break every forty minutes, stretch your neck and shoulders, and don't use your phone in bed. " +
      "'I haven't found a magic cure yet,' she laughs, 'but these small changes really work.'",
    questions: [
      q("What problems have doctors noticed more since 2020?", "eye problems and back pain", ["broken bones", "food poisoning"]),
      q("How long has Dr Ruiz worked at the health centre?", "for twelve years", ["since twelve years", "for two years"]),
      tf("Dr Ruiz says teenagers never had colds before.", false, 2),
      q("How often should you take a break?", "every forty minutes", ["every four hours", "once a day"]),
      q("Where shouldn't you use your phone?", "in bed", ["at the health centre", "at school"]),
      q("What does Dr Ruiz say about a magic cure?", "She hasn't found one yet.", ["She has just found one.", "She found one in 2020."], 3),
    ],
  },
  {
    id: "b1_unit5Text",
    unitId: "unit5",
    title: "Are we watching too much?",
    text:
      "A survey at our school asked 200 students about their viewing habits. The results were surprising. Students watch less live TV than their parents, but they spend more time watching series online. " +
      "The most popular programmes were comedy series and reality shows. Documentaries were the least popular, although many students said they were interesting. " +
      "One in four students admitted that series are too addictive: 'I always say just one more episode,' said one girl, 'and then it's two in the morning!' " +
      "Most students thought they didn't have enough time for sport because of screens, but very few wanted to watch less.",
    questions: [
      q("How many students answered the survey?", "200", ["20", "2,000"]),
      tf("Students watch more live TV than their parents.", false),
      q("What were the most popular programmes?", "comedy series and reality shows", ["documentaries and the news", "cartoons and game shows"]),
      q("What did many students say about documentaries?", "They were interesting.", ["They were scary.", "They were too long."], 2),
      q("What problem did one in four students mention?", "Series are too addictive.", ["Series are too expensive.", "Series are boring."], 2),
      q("Which sentence from the text uses 'enough'?", "They didn't have enough time for sport.", ["Series are too addictive.", "Students watch less live TV."], 3),
    ],
  },
  {
    id: "b1_unit6Text",
    unitId: "unit6",
    title: "An island in danger",
    text:
      "Tuvalu is a small country of nine islands in the Pacific Ocean. Its highest point is only about four and a half metres above sea level. " +
      "Scientists say that if global warming continues, sea levels will rise and some of the islands might disappear this century. " +
      "Floods are already getting worse, and salt water is getting into the ground, so it's harder to grow food. " +
      "The government is going to build higher land on the main island, and people are using more solar panels to reduce their carbon footprint. " +
      "'We may be small,' says a local teacher, 'but if the world doesn't act now, we will be the first to lose our home.'",
    questions: [
      q("Where is Tuvalu?", "in the Pacific Ocean", ["in the Atlantic Ocean", "in Europe"]),
      q("How high is its highest point?", "about 4.5 metres", ["about 45 metres", "about 450 metres"], 2),
      q("Why is it harder to grow food?", "Salt water is getting into the ground.", ["It's too cold.", "There are no farmers."], 2),
      q("What is the government going to do?", "build higher land", ["move everyone abroad", "stop using solar panels"]),
      tf("Floods are getting better on Tuvalu.", false),
      q("Which word in the text expresses possibility?", "might", ["will", "going to"], 3),
    ],
  },
  {
    id: "b1_unit7Text",
    unitId: "unit7",
    title: "My first job interview",
    text:
      "Last summer I applied for a part-time job at a bookshop. I filled in the application form and sent my CV, and a week later they invited me for an interview. " +
      "I was really nervous. My mum gave me some advice: 'You should arrive early, and you mustn't look at your phone.' " +
      "The manager asked me why I wanted the job. I told her I was reliable and well-organised, and that I loved books. " +
      "Then she asked a difficult question: 'If a customer were rude to you, what would you do?' I said I would stay calm and try to help. I got the job! " +
      "The salary isn't high, but I don't have to work at weekends, and I've learnt a lot.",
    questions: [
      q("What kind of job did the writer apply for?", "a part-time job at a bookshop", ["a full-time job at a café", "a job at a school"]),
      q("What advice did the writer's mum give?", "Arrive early and don't look at your phone.", ["Wear a suit.", "Talk about money."]),
      q("What qualities did the writer mention?", "reliable and well-organised", ["ambitious and creative", "outgoing and funny"], 2),
      q("What did the writer say about a rude customer?", "I would stay calm and try to help.", ["I would ask them to leave.", "I would call the manager."], 2),
      tf("The writer has to work at weekends.", false),
      q("Which grammar does the manager use in her question?", "second conditional", ["first conditional", "past continuous"], 3),
    ],
  },
  {
    id: "b1_unit8Text",
    unitId: "unit8",
    title: "Friends again",
    text:
      "Marta and Elena used to be best friends. They had known each other since primary school and they used to share all their secrets. " +
      "But when they were fifteen, they fell out. Elena had told another girl one of Marta's secrets, and Marta was so upset that she stopped talking to her. " +
      "For two years they didn't speak. Then, one day, they met by chance at a concert. Elena apologised and Marta realised that she had missed her friend. " +
      "'I was relieved,' says Marta. 'Forgiving her wasn't easy, but our friendship is stronger now.'",
    questions: [
      q("Since when had Marta and Elena known each other?", "since primary school", ["since they were fifteen", "since a concert"]),
      q("Why did they fall out?", "Elena told someone one of Marta's secrets.", ["Marta moved to another city.", "They liked the same boy."], 2),
      q("How long didn't they speak?", "two years", ["two months", "fifteen years"]),
      q("Where did they meet again?", "at a concert", ["at school", "at a party"]),
      q("How did Marta feel when they made up?", "relieved", ["jealous", "embarrassed"], 2),
      q("Which action happened first?", "Elena told the secret.", ["Marta stopped talking to Elena.", "They met at a concert."], 3),
    ],
  },
  {
    id: "b1_unit9Text",
    unitId: "unit9",
    title: "Meeting the author",
    text:
      "Last week the writer of my favourite fantasy series came to our school library. She told us that she had started writing when she was twelve, in a notebook she kept under her bed. " +
      "Somebody asked her where she got her ideas. She said that most of them came from dreams, and that she always wrote them down as soon as she woke up. " +
      "I asked her if the main character was based on a real person. She smiled and said that he was a bit like her younger brother! " +
      "At the end she told us that her new novel would come out in the spring. I can't wait to read it.",
    questions: [
      q("What kind of books does the author write?", "fantasy", ["biographies", "cookbooks"]),
      q("When did she start writing?", "when she was twelve", ["after university", "last week"]),
      q("Where did most of her ideas come from?", "dreams", ["films", "her teachers"], 2),
      q("Who is the main character a bit like?", "her younger brother", ["her father", "the writer of the text"], 2),
      q("When will her new novel come out?", "in the spring", ["next week", "in the autumn"]),
      q("What did the author say? Choose the reported sentence.", "She said that most of her ideas came from dreams.", ["She said that most of her ideas come from dreams tomorrow.", "She said me that her ideas came from dreams."], 3),
    ],
  },
  {
    id: "b1_unit10Text",
    unitId: "unit10",
    title: "Staying safe online",
    text:
      "Every day millions of photos are uploaded to social networks, and a lot of personal information is shared without people realising it. " +
      "Last year my cousin's account was hacked because his password was too simple. Since then, he has changed all his passwords and he has had his laptop checked by an expert. " +
      "Here are some tips: never open an attachment from someone you don't know, check your privacy settings, and log out when you use a shared computer. " +
      "If you receive a strange email asking for your password, delete it. Your bank will never ask for it by email.",
    questions: [
      q("What happened to the writer's cousin last year?", "His account was hacked.", ["His laptop was stolen.", "He lost his phone."]),
      q("Why was it hacked?", "His password was too simple.", ["He opened an attachment.", "He used a shared computer."], 2),
      q("What has the cousin done since then?", "changed his passwords and had his laptop checked", ["stopped using social networks", "bought a new laptop"], 2),
      tf("You should open attachments from people you don't know.", false),
      q("What should you do when you use a shared computer?", "log out", ["save your password", "download everything"]),
      q("Which phrase is an example of 'have something done'?", "he has had his laptop checked", ["his account was hacked", "photos are uploaded"], 3),
    ],
  },
];
