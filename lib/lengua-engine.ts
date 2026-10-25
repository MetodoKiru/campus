// Motor de Lengua para 1º y 2º de Primaria: temario, banco de ejercicios, niveles por unidad e informe.

export type LenguaCourse = "1EP" | "2EP";
export type LenguaDifficulty = "facil" | "medio" | "desafiante";
export type LenguaSkill = "Lectoescritura" | "Ortografía" | "Gramática" | "Vocabulario" | "Comprensión lectora";

interface LenguaExerciseBase {
  id: string;
  course: LenguaCourse;
  unit: string;
  skill: LenguaSkill;
  difficulty: LenguaDifficulty;
  prompt: string;
  /** Texto que se lee en voz alta con el botón de altavoz. */
  speak?: string;
  /** Dibujo solo cuando es la pista para reconocer la palabra. */
  emoji?: string;
}

/** El alumno repasa con el dedo (o el ratón) la letra o sílaba. */
export interface TraceExercise extends LenguaExerciseBase {
  type: "trace";
  target: string;
}

/** Elegir la respuesta correcta entre varias opciones. */
export interface ChoiceExercise extends LenguaExerciseBase {
  type: "choice";
  options: string[];
  answer: string;
  /** Texto corto que se lee antes de la pregunta (comprensión lectora). */
  reading?: string;
}

/** Ordenar sílabas o letras para formar la palabra. */
export interface BuildExercise extends LenguaExerciseBase {
  type: "build";
  pieces: string[];
  answer: string;
}

export type LenguaExercise = TraceExercise | ChoiceExercise | BuildExercise;

export interface LenguaUnit {
  id: string;
  course: LenguaCourse;
  title: string;
  description: string;
}

export const LENGUA_COURSES: Record<LenguaCourse, string> = {
  "1EP": "1º de Primaria",
  "2EP": "2º de Primaria",
};

export const LENGUA_UNITS: LenguaUnit[] = [
  { id: "1-vocales", course: "1EP", title: "Las vocales", description: "Reconocer, escribir y escuchar a, e, i, o, u." },
  { id: "1-mpls", course: "1EP", title: "Letras m, p, l, s", description: "Primeras consonantes y sus sílabas." },
  { id: "1-tndf", course: "1EP", title: "Letras t, n, d, f", description: "Más consonantes, sílabas y palabras cortas." },
  { id: "1-palabras", course: "1EP", title: "Palabras y frases", description: "Formar palabras, mayúscula y punto." },
  { id: "1-lectura", course: "1EP", title: "Leo y comprendo", description: "Frases y textos muy cortos con preguntas." },
  { id: "2-cqg", course: "2EP", title: "Sílabas ca-que-qui, ga-gue-gui, ce-ci", description: "Sílabas con sonido fuerte y suave." },
  { id: "2-ortografia", course: "2EP", title: "Ortografía: r/rr, mb/mp, mayúsculas", description: "Reglas básicas de escritura." },
  { id: "2-gramatica", course: "2EP", title: "Nombre, adjetivo y verbo", description: "Clases de palabras, género y número." },
  { id: "2-vocabulario", course: "2EP", title: "Vocabulario", description: "Sinónimos, antónimos, familias y orden alfabético." },
  { id: "2-lectura", course: "2EP", title: "Leo y comprendo", description: "Textos cortos con preguntas de comprensión." },
];

const trace = (id: string, course: LenguaCourse, unit: string, difficulty: LenguaDifficulty, target: string, speak?: string): TraceExercise => ({
  id, course, unit, skill: "Lectoescritura", difficulty, type: "trace", target,
  prompt: target.length === 1 ? `Repasa con el dedo la letra «${target}»` : `Repasa con el dedo «${target}»`,
  speak: speak ?? target,
});

export const LENGUA_DATABASE: LenguaExercise[] = [
  // ───── 1º · Las vocales
  trace("1v-t1", "1EP", "1-vocales", "facil", "a"),
  trace("1v-t2", "1EP", "1-vocales", "facil", "e"),
  trace("1v-t3", "1EP", "1-vocales", "facil", "i"),
  trace("1v-t4", "1EP", "1-vocales", "facil", "o"),
  trace("1v-t5", "1EP", "1-vocales", "facil", "u"),
  trace("1v-t6", "1EP", "1-vocales", "medio", "A"),
  trace("1v-t7", "1EP", "1-vocales", "medio", "E"),
  { id: "1v-c1", course: "1EP", unit: "1-vocales", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🐝", prompt: "¿Con qué vocal empieza «abeja»?", speak: "abeja", options: ["a", "e", "o", "u"], answer: "a" },
  { id: "1v-c2", course: "1EP", unit: "1-vocales", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🐘", prompt: "¿Con qué vocal empieza «elefante»?", speak: "elefante", options: ["i", "e", "a", "o"], answer: "e" },
  { id: "1v-c3", course: "1EP", unit: "1-vocales", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🏝️", prompt: "¿Con qué vocal empieza «isla»?", speak: "isla", options: ["u", "a", "i", "e"], answer: "i" },
  { id: "1v-c4", course: "1EP", unit: "1-vocales", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🐻", prompt: "¿Con qué vocal empieza «oso»?", speak: "oso", options: ["o", "u", "a", "e"], answer: "o" },
  { id: "1v-c5", course: "1EP", unit: "1-vocales", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🍇", prompt: "¿Con qué vocal empieza «uva»?", speak: "uva", options: ["e", "i", "u", "o"], answer: "u" },
  { id: "1v-c6", course: "1EP", unit: "1-vocales", skill: "Lectoescritura", difficulty: "medio", type: "choice", prompt: "Escucha y elige la vocal que oyes.", speak: "i", options: ["a", "i", "o", "u"], answer: "i" },
  { id: "1v-c7", course: "1EP", unit: "1-vocales", skill: "Lectoescritura", difficulty: "medio", type: "choice", prompt: "¿Cuál es la «a» mayúscula?", options: ["A", "E", "O", "U"], answer: "A" },
  { id: "1v-c8", course: "1EP", unit: "1-vocales", skill: "Lectoescritura", difficulty: "desafiante", type: "choice", prompt: "¿Qué vocales tiene «búho»?", speak: "búho", options: ["u y o", "a y o", "u y e", "i y o"], answer: "u y o" },

  // ───── 1º · m, p, l, s
  trace("1m-t1", "1EP", "1-mpls", "facil", "m"),
  trace("1m-t2", "1EP", "1-mpls", "facil", "p"),
  trace("1m-t3", "1EP", "1-mpls", "facil", "l"),
  trace("1m-t4", "1EP", "1-mpls", "facil", "s"),
  trace("1m-t5", "1EP", "1-mpls", "medio", "ma"),
  trace("1m-t6", "1EP", "1-mpls", "medio", "pe"),
  { id: "1m-c1", course: "1EP", unit: "1-mpls", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🍎", prompt: "¿Con qué sílaba empieza «manzana»?", speak: "manzana", options: ["ma", "pa", "la", "sa"], answer: "ma" },
  { id: "1m-c2", course: "1EP", unit: "1-mpls", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🦆", prompt: "¿Con qué sílaba empieza «pato»?", speak: "pato", options: ["po", "pa", "pe", "pi"], answer: "pa" },
  { id: "1m-c3", course: "1EP", unit: "1-mpls", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🌙", prompt: "¿Con qué sílaba empieza «luna»?", speak: "luna", options: ["la", "le", "lu", "lo"], answer: "lu" },
  { id: "1m-c4", course: "1EP", unit: "1-mpls", skill: "Lectoescritura", difficulty: "medio", type: "choice", emoji: "☀️", prompt: "¿Qué palabra es?", speak: "sol", options: ["sal", "sol", "sus", "sil"], answer: "sol" },
  { id: "1m-c5", course: "1EP", unit: "1-mpls", skill: "Lectoescritura", difficulty: "medio", type: "choice", prompt: "Escucha y elige la sílaba.", speak: "mi", options: ["me", "mi", "mo", "mu"], answer: "mi" },
  { id: "1m-b1", course: "1EP", unit: "1-mpls", skill: "Lectoescritura", difficulty: "medio", type: "build", prompt: "Ordena las sílabas para formar «mamá».", speak: "mamá", pieces: ["má", "ma"], answer: "mamá" },
  { id: "1m-b2", course: "1EP", unit: "1-mpls", skill: "Lectoescritura", difficulty: "medio", type: "build", prompt: "Ordena las sílabas: «oso»", speak: "oso", pieces: ["so", "o"], answer: "oso" },
  { id: "1m-b3", course: "1EP", unit: "1-mpls", skill: "Lectoescritura", difficulty: "desafiante", type: "build", prompt: "Ordena las sílabas: «paloma»", speak: "paloma", pieces: ["ma", "pa", "lo"], answer: "paloma" },
  { id: "1m-b4", course: "1EP", unit: "1-mpls", skill: "Lectoescritura", difficulty: "desafiante", type: "build", prompt: "Ordena las letras: «sal»", speak: "sal", pieces: ["l", "s", "a"], answer: "sal" },

  // ───── 1º · t, n, d, f
  trace("1t-t1", "1EP", "1-tndf", "facil", "t"),
  trace("1t-t2", "1EP", "1-tndf", "facil", "n"),
  trace("1t-t3", "1EP", "1-tndf", "facil", "d"),
  trace("1t-t4", "1EP", "1-tndf", "facil", "f"),
  trace("1t-t5", "1EP", "1-tndf", "medio", "ñ"),
  { id: "1t-c1", course: "1EP", unit: "1-tndf", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🍅", prompt: "¿Con qué sílaba empieza «tomate»?", speak: "tomate", options: ["ta", "to", "tu", "te"], answer: "to" },
  { id: "1t-c2", course: "1EP", unit: "1-tndf", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🎲", prompt: "¿Con qué sílaba empieza «dado»?", speak: "dado", options: ["da", "de", "do", "di"], answer: "da" },
  { id: "1t-c3", course: "1EP", unit: "1-tndf", skill: "Lectoescritura", difficulty: "facil", type: "choice", emoji: "🦭", prompt: "¿Con qué letra empieza «foca»?", speak: "foca", options: ["t", "f", "d", "n"], answer: "f" },
  { id: "1t-c4", course: "1EP", unit: "1-tndf", skill: "Lectoescritura", difficulty: "medio", type: "choice", emoji: "👃", prompt: "¿Qué palabra es?", speak: "nariz", options: ["nariz", "nadar", "nube", "nido"], answer: "nariz" },
  { id: "1t-c5", course: "1EP", unit: "1-tndf", skill: "Lectoescritura", difficulty: "medio", type: "choice", emoji: "🧒", prompt: "¿Qué palabra es?", speak: "niño", options: ["nino", "niño", "nido", "niña"], answer: "niño" },
  { id: "1t-b1", course: "1EP", unit: "1-tndf", skill: "Lectoescritura", difficulty: "medio", type: "build", prompt: "Ordena las sílabas: «nube»", speak: "nube", pieces: ["be", "nu"], answer: "nube" },
  { id: "1t-b2", course: "1EP", unit: "1-tndf", skill: "Lectoescritura", difficulty: "desafiante", type: "build", prompt: "Ordena las sílabas: «tomate»", speak: "tomate", pieces: ["te", "to", "ma"], answer: "tomate" },
  { id: "1t-b3", course: "1EP", unit: "1-tndf", skill: "Lectoescritura", difficulty: "desafiante", type: "build", prompt: "Ordena las letras: «foca»", speak: "foca", pieces: ["c", "o", "a", "f"], answer: "foca" },

  // ───── 1º · Palabras y frases
  { id: "1p-c1", course: "1EP", unit: "1-palabras", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "¿Qué frase está bien escrita?", options: ["mi perro es pequeño.", "Mi perro es pequeño.", "Mi perro es pequeño", "mi perro es pequeño"], answer: "Mi perro es pequeño." },
  { id: "1p-c2", course: "1EP", unit: "1-palabras", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "Los nombres de personas empiezan por…", options: ["mayúscula", "minúscula", "número", "punto"], answer: "mayúscula" },
  { id: "1p-c3", course: "1EP", unit: "1-palabras", skill: "Lectoescritura", difficulty: "facil", type: "choice", prompt: "¿Cuántas sílabas tiene «gato»?", speak: "ga-to", options: ["1", "2", "3", "4"], answer: "2" },
  { id: "1p-c4", course: "1EP", unit: "1-palabras", skill: "Lectoescritura", difficulty: "medio", type: "choice", prompt: "¿Cuántas sílabas tiene «mariposa»?", speak: "ma-ri-po-sa", options: ["2", "3", "4", "5"], answer: "4" },
  { id: "1p-c5", course: "1EP", unit: "1-palabras", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Qué nombre está bien escrito?", options: ["lucía", "Lucía", "LUcía", "lUcía"], answer: "Lucía" },
  { id: "1p-b1", course: "1EP", unit: "1-palabras", skill: "Lectoescritura", difficulty: "medio", type: "build", prompt: "Ordena las palabras para formar la frase.", pieces: ["come", "El", "gato", "pescado."], answer: "El gato come pescado." },
  { id: "1p-b2", course: "1EP", unit: "1-palabras", skill: "Lectoescritura", difficulty: "desafiante", type: "build", prompt: "Ordena las palabras para formar la frase.", pieces: ["sale", "El", "por", "sol", "la mañana."], answer: "El sol sale por la mañana." },
  trace("1p-t1", "1EP", "1-palabras", "medio", "sol"),
  trace("1p-t2", "1EP", "1-palabras", "desafiante", "mamá"),

  // ───── 1º · Leo y comprendo
  { id: "1l-c1", course: "1EP", unit: "1-lectura", skill: "Comprensión lectora", difficulty: "facil", type: "choice", reading: "Lola tiene un gato. El gato se llama Pipo.", prompt: "¿Cómo se llama el gato?", options: ["Lola", "Pipo", "Pepe", "Tomi"], answer: "Pipo" },
  { id: "1l-c2", course: "1EP", unit: "1-lectura", skill: "Comprensión lectora", difficulty: "facil", type: "choice", reading: "Mi pelota es roja y grande.", prompt: "¿De qué color es la pelota?", options: ["azul", "verde", "roja", "amarilla"], answer: "roja" },
  { id: "1l-c3", course: "1EP", unit: "1-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: "Dani va al parque con su abuela. Juegan con la pelota y comen un helado.", prompt: "¿Con quién va Dani al parque?", options: ["con su madre", "con su abuela", "con su amigo", "solo"], answer: "con su abuela" },
  { id: "1l-c4", course: "1EP", unit: "1-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: "Dani va al parque con su abuela. Juegan con la pelota y comen un helado.", prompt: "¿Qué comen en el parque?", options: ["una manzana", "un bocadillo", "un helado", "una galleta"], answer: "un helado" },
  { id: "1l-c5", course: "1EP", unit: "1-lectura", skill: "Comprensión lectora", difficulty: "desafiante", type: "choice", reading: "Ana se pone el abrigo y el gorro. Fuera hace mucho frío y está nevando.", prompt: "¿Por qué se pone Ana el abrigo?", options: ["porque hace calor", "porque hace frío", "porque llueve", "porque es de noche"], answer: "porque hace frío" },

  // ───── 2º · ca-que-qui, ga-gue-gui, ce-ci
  trace("2c-t1", "2EP", "2-cqg", "facil", "que"),
  trace("2c-t2", "2EP", "2-cqg", "facil", "gui"),
  trace("2c-t3", "2EP", "2-cqg", "medio", "ce"),
  { id: "2c-c1", course: "2EP", unit: "2-cqg", skill: "Ortografía", difficulty: "facil", type: "choice", emoji: "🧀", prompt: "Completa: ___so", speak: "queso", options: ["que", "ke", "qe", "cue"], answer: "que" },
  { id: "2c-c2", course: "2EP", unit: "2-cqg", skill: "Ortografía", difficulty: "facil", type: "choice", emoji: "🏠", prompt: "Completa: ___sa", speak: "casa", options: ["ka", "ca", "qa", "cua"], answer: "ca" },
  { id: "2c-c3", course: "2EP", unit: "2-cqg", skill: "Ortografía", difficulty: "medio", type: "choice", emoji: "🎸", prompt: "¿Cómo se escribe?", speak: "guitarra", options: ["gitarra", "guitarra", "jitarra", "guitara"], answer: "guitarra" },
  { id: "2c-c4", course: "2EP", unit: "2-cqg", skill: "Ortografía", difficulty: "medio", type: "choice", emoji: "🍒", prompt: "¿Cómo se escribe?", speak: "cereza", options: ["zereza", "sereza", "cereza", "cerresa"], answer: "cereza" },
  { id: "2c-c5", course: "2EP", unit: "2-cqg", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Qué palabra está bien escrita?", options: ["gato", "jato", "guato", "gatto"], answer: "gato" },
  { id: "2c-c6", course: "2EP", unit: "2-cqg", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "Delante de «e» e «i», el sonido fuerte de «c» se escribe…", options: ["qu", "c", "k", "z"], answer: "qu" },
  { id: "2c-c7", course: "2EP", unit: "2-cqg", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "¿Qué palabra está bien escrita?", options: ["zielo", "cielo", "sielo", "quielo"], answer: "cielo" },
  { id: "2c-b1", course: "2EP", unit: "2-cqg", skill: "Ortografía", difficulty: "medio", type: "build", prompt: "Ordena las sílabas: «queso»", speak: "queso", pieces: ["so", "que"], answer: "queso" },
  { id: "2c-b2", course: "2EP", unit: "2-cqg", skill: "Ortografía", difficulty: "desafiante", type: "build", prompt: "Ordena las sílabas: «guitarra»", speak: "guitarra", pieces: ["rra", "gui", "ta"], answer: "guitarra" },

  // ───── 2º · Ortografía: r/rr, mb/mp, mayúsculas
  { id: "2o-c1", course: "2EP", unit: "2-ortografia", skill: "Ortografía", difficulty: "facil", type: "choice", emoji: "🐕", prompt: "¿Cómo se escribe?", speak: "perro", options: ["pero", "perro", "perrro", "pérro"], answer: "perro" },
  { id: "2o-c2", course: "2EP", unit: "2-ortografia", skill: "Ortografía", difficulty: "facil", type: "choice", emoji: "🌹", prompt: "¿Cómo se escribe?", speak: "rosa", options: ["rrosa", "rosa", "rossa", "rroza"], answer: "rosa" },
  { id: "2o-c3", course: "2EP", unit: "2-ortografia", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "Antes de «b» y «p» siempre se escribe…", options: ["m", "n", "ñ", "l"], answer: "m" },
  { id: "2o-c4", course: "2EP", unit: "2-ortografia", skill: "Ortografía", difficulty: "medio", type: "choice", emoji: "🏮", prompt: "¿Cómo se escribe?", speak: "lámpara", options: ["lánpara", "lámpara", "lampara", "lámbara"], answer: "lámpara" },
  { id: "2o-c5", course: "2EP", unit: "2-ortografia", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Qué palabra está bien escrita?", options: ["canbio", "cambio", "camvio", "canvio"], answer: "cambio" },
  { id: "2o-c6", course: "2EP", unit: "2-ortografia", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "¿Qué frase está bien escrita?", options: ["vivo en madrid.", "Vivo en madrid.", "Vivo en Madrid.", "vivo en Madrid"], answer: "Vivo en Madrid." },
  { id: "2o-c7", course: "2EP", unit: "2-ortografia", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "Entre dos vocales, el sonido fuerte de la «r» se escribe…", options: ["r", "rr", "rrr", "dr"], answer: "rr" },
  trace("2o-t1", "2EP", "2-ortografia", "medio", "rr"),
  trace("2o-t2", "2EP", "2-ortografia", "desafiante", "mb"),

  // ───── 2º · Nombre, adjetivo y verbo
  { id: "2g-c1", course: "2EP", unit: "2-gramatica", skill: "Gramática", difficulty: "facil", type: "choice", prompt: "¿Qué palabra es un nombre?", options: ["mesa", "bonito", "correr", "rápido"], answer: "mesa" },
  { id: "2g-c2", course: "2EP", unit: "2-gramatica", skill: "Gramática", difficulty: "facil", type: "choice", prompt: "¿Qué palabra es una acción (verbo)?", options: ["silla", "saltar", "azul", "gato"], answer: "saltar" },
  { id: "2g-c3", course: "2EP", unit: "2-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "En «el perro grande», ¿qué palabra dice cómo es?", options: ["el", "perro", "grande", "ninguna"], answer: "grande" },
  { id: "2g-c4", course: "2EP", unit: "2-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "¿Cuál es el plural de «flor»?", options: ["flors", "flores", "floras", "flore"], answer: "flores" },
  { id: "2g-c5", course: "2EP", unit: "2-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "¿Cuál es el femenino de «niño»?", options: ["niñe", "niños", "niña", "niñas"], answer: "niña" },
  { id: "2g-c6", course: "2EP", unit: "2-gramatica", skill: "Gramática", difficulty: "desafiante", type: "choice", prompt: "Completa con el artículo correcto: ___ mesas", options: ["el", "la", "los", "las"], answer: "las" },
  { id: "2g-c7", course: "2EP", unit: "2-gramatica", skill: "Gramática", difficulty: "desafiante", type: "choice", prompt: "En «Marta come una manzana roja», ¿cuál es el verbo?", options: ["Marta", "come", "manzana", "roja"], answer: "come" },
  { id: "2g-b1", course: "2EP", unit: "2-gramatica", skill: "Gramática", difficulty: "medio", type: "build", prompt: "Ordena las palabras para formar la frase.", pieces: ["salta", "La", "rana", "verde"], answer: "La rana verde salta" },

  // ───── 2º · Vocabulario
  { id: "2v-c1", course: "2EP", unit: "2-vocabulario", skill: "Vocabulario", difficulty: "facil", type: "choice", prompt: "¿Qué palabra es lo contrario de «alto»?", options: ["grande", "bajo", "largo", "gordo"], answer: "bajo" },
  { id: "2v-c2", course: "2EP", unit: "2-vocabulario", skill: "Vocabulario", difficulty: "facil", type: "choice", prompt: "¿Qué palabra significa lo mismo que «contento»?", options: ["triste", "alegre", "enfadado", "cansado"], answer: "alegre" },
  { id: "2v-c3", course: "2EP", unit: "2-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "¿Qué palabra es de la familia de «pan»?", options: ["panadería", "pantalla", "pantalón", "pájaro"], answer: "panadería" },
  { id: "2v-c4", course: "2EP", unit: "2-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "¿Qué palabra va primero en orden alfabético?", options: ["casa", "árbol", "luna", "perro"], answer: "árbol" },
  { id: "2v-c5", course: "2EP", unit: "2-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "¿Qué palabra no es una fruta?", options: ["pera", "plátano", "zanahoria", "fresa"], answer: "zanahoria" },
  { id: "2v-c6", course: "2EP", unit: "2-vocabulario", skill: "Vocabulario", difficulty: "desafiante", type: "choice", prompt: "¿Qué palabra es lo contrario de «abrir»?", options: ["cerrar", "entrar", "subir", "romper"], answer: "cerrar" },
  { id: "2v-b1", course: "2EP", unit: "2-vocabulario", skill: "Vocabulario", difficulty: "desafiante", type: "build", prompt: "Ordena las palabras en orden alfabético.", pieces: ["mesa", "gato", "sol", "árbol"], answer: "árbol gato mesa sol" },

  // ───── 2º · Leo y comprendo
  { id: "2l-c1", course: "2EP", unit: "2-lectura", skill: "Comprensión lectora", difficulty: "facil", type: "choice", reading: "El sábado, Pablo y su hermana Nuria fueron a la playa. Hicieron un castillo de arena muy alto.", prompt: "¿Qué día fueron a la playa?", options: ["el lunes", "el sábado", "el domingo", "el viernes"], answer: "el sábado" },
  { id: "2l-c2", course: "2EP", unit: "2-lectura", skill: "Comprensión lectora", difficulty: "facil", type: "choice", reading: "El sábado, Pablo y su hermana Nuria fueron a la playa. Hicieron un castillo de arena muy alto.", prompt: "¿Qué hicieron en la playa?", options: ["nadar con peces", "un castillo de arena", "una cometa", "un dibujo"], answer: "un castillo de arena" },
  { id: "2l-c3", course: "2EP", unit: "2-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: "La ardilla Rita guarda bellotas en otoño. Así, cuando llega el invierno y hace frío, tiene comida.", prompt: "¿Para qué guarda Rita las bellotas?", options: ["para jugar", "para tener comida en invierno", "para regalarlas", "para plantar árboles"], answer: "para tener comida en invierno" },
  { id: "2l-c4", course: "2EP", unit: "2-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: "La ardilla Rita guarda bellotas en otoño. Así, cuando llega el invierno y hace frío, tiene comida.", prompt: "¿En qué estación guarda las bellotas?", options: ["primavera", "verano", "otoño", "invierno"], answer: "otoño" },
  { id: "2l-c5", course: "2EP", unit: "2-lectura", skill: "Comprensión lectora", difficulty: "desafiante", type: "choice", reading: "Leo olvidó el paraguas en casa. Cuando salió del colegio, llegó a casa empapado y estornudando.", prompt: "¿Qué tiempo hacía al salir del colegio?", options: ["hacía sol", "llovía", "nevaba", "hacía viento"], answer: "llovía" },
  { id: "2l-c6", course: "2EP", unit: "2-lectura", skill: "Comprensión lectora", difficulty: "desafiante", type: "choice", reading: "Leo olvidó el paraguas en casa. Cuando salió del colegio, llegó a casa empapado y estornudando.", prompt: "¿Qué significa «empapado»?", options: ["muy mojado", "muy cansado", "muy contento", "muy sucio"], answer: "muy mojado" },
];

// ───────────── Tareas, intentos y niveles

export interface LenguaTaskConfig {
  course: LenguaCourse;
  units: string[];
  difficulty: LenguaDifficulty | "todas" | "auto";
  questionCount: number;
  includeTrace: boolean;
}

export interface LenguaTask extends LenguaTaskConfig {
  kind: "lengua_task";
  id: string;
  studentId: string;
  title: string;
  note?: string;
  dueDate?: string;
  createdAt: string;
}

export interface LenguaAnswer {
  exerciseId: string;
  unit: string;
  skill: LenguaSkill;
  difficulty: LenguaDifficulty;
  correct: boolean;
}

export interface LenguaAttempt {
  module: "lengua";
  kind: "lengua_attempt";
  studentId: string;
  taskId?: string;
  course: LenguaCourse;
  score: number;
  total: number;
  completedAt: string;
  answers: LenguaAnswer[];
}

export type LenguaLevel = "sin_datos" | "iniciando" | "en_proceso" | "dominado";

export const LEVEL_LABELS: Record<LenguaLevel, string> = {
  sin_datos: "Sin empezar",
  iniciando: "Iniciando",
  en_proceso: "En proceso",
  dominado: "Dominado",
};

export interface UnitMastery {
  unit: LenguaUnit;
  answered: number;
  correct: number;
  accuracy: number;
  level: LenguaLevel;
  /** Dificultad que conviene practicar a continuación. */
  nextDifficulty: LenguaDifficulty;
}

/** Solo cuentan las últimas respuestas de cada unidad, para que el nivel refleje cómo va ahora. */
const RECENT_ANSWERS_PER_UNIT = 20;

export function computeMastery(attempts: LenguaAttempt[], course: LenguaCourse): UnitMastery[] {
  const sorted = [...attempts].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return LENGUA_UNITS.filter((unit) => unit.course === course).map((unit) => {
    const recent = sorted.flatMap((attempt) => attempt.answers.filter((answer) => answer.unit === unit.id)).slice(0, RECENT_ANSWERS_PER_UNIT);
    const correct = recent.filter((answer) => answer.correct).length;
    const accuracy = recent.length ? correct / recent.length : 0;
    let level: LenguaLevel = "sin_datos";
    if (recent.length) level = accuracy >= 0.85 && recent.length >= 8 ? "dominado" : accuracy >= 0.6 ? "en_proceso" : "iniciando";
    const nextDifficulty: LenguaDifficulty = level === "dominado" ? "desafiante" : level === "en_proceso" ? "medio" : "facil";
    return { unit, answered: recent.length, correct, accuracy, level, nextDifficulty };
  });
}

const DIFFICULTY_ORDER: LenguaDifficulty[] = ["facil", "medio", "desafiante"];

export const DIFFICULTY_LABELS: Record<LenguaDifficulty, string> = { facil: "Fácil", medio: "Media", desafiante: "Desafiante" };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Monta una tanda de ejercicios. Con dificultad «auto» usa el nivel de cada unidad. */
export function buildSession(config: LenguaTaskConfig, mastery: UnitMastery[]): LenguaExercise[] {
  const units = config.units.length ? config.units : LENGUA_UNITS.filter((unit) => unit.course === config.course).map((unit) => unit.id);
  const pool = LENGUA_DATABASE.filter((exercise) => {
    if (exercise.course !== config.course || !units.includes(exercise.unit)) return false;
    if (!config.includeTrace && exercise.type === "trace") return false;
    if (config.difficulty === "todas") return true;
    if (config.difficulty === "auto") {
      const target = mastery.find((item) => item.unit.id === exercise.unit)?.nextDifficulty ?? "facil";
      // Se practica el nivel recomendado y el anterior, para repasar sin frustrar.
      const gap = DIFFICULTY_ORDER.indexOf(target) - DIFFICULTY_ORDER.indexOf(exercise.difficulty);
      return gap === 0 || gap === 1;
    }
    return exercise.difficulty === config.difficulty;
  });
  return shuffle(pool)
    .slice(0, Math.max(1, config.questionCount))
    .sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty))
    .map((exercise) => (exercise.type === "choice" ? { ...exercise, options: shuffle(exercise.options) } : exercise));
}

/** Las frases se forman con espacios; las palabras, juntando sílabas o letras. */
export function joinPieces(exercise: BuildExercise, pieces: string[]): string {
  return pieces.join(exercise.answer.includes(" ") ? " " : "");
}

export function checkAnswer(exercise: LenguaExercise, given: string): boolean {
  if (exercise.type === "trace") return given === "ok";
  return given.trim() === exercise.answer.trim();
}

/** Recomendación de práctica libre: la primera unidad del curso que aún no está dominada. */
export function recommendedUnit(mastery: UnitMastery[]): UnitMastery | undefined {
  return mastery.find((item) => item.level !== "dominado") ?? mastery[mastery.length - 1];
}

export interface LenguaReport {
  course: LenguaCourse;
  generatedAt: string;
  attempts: number;
  exercisesDone: number;
  accuracy: number;
  bySkill: Array<{ skill: LenguaSkill; answered: number; accuracy: number }>;
  mastery: UnitMastery[];
  strengths: string[];
  toReinforce: string[];
  pendingTasks: number;
  summary: string;
}

export function buildReport(studentName: string, course: LenguaCourse, attempts: LenguaAttempt[], tasks: LenguaTask[]): LenguaReport {
  const own = attempts.filter((attempt) => attempt.course === course);
  const answers = own.flatMap((attempt) => attempt.answers);
  const correct = answers.filter((answer) => answer.correct).length;
  const mastery = computeMastery(own, course);
  const skills = Array.from(new Set(answers.map((answer) => answer.skill)));
  const bySkill = skills.map((skill) => {
    const list = answers.filter((answer) => answer.skill === skill);
    return { skill, answered: list.length, accuracy: list.filter((answer) => answer.correct).length / list.length };
  });
  const strengths = mastery.filter((item) => item.level === "dominado").map((item) => item.unit.title);
  const toReinforce = mastery.filter((item) => item.level === "iniciando").map((item) => item.unit.title);
  const doneTaskIds = new Set(own.map((attempt) => attempt.taskId).filter(Boolean));
  const pendingTasks = tasks.filter((task) => task.course === course && !doneTaskIds.has(task.id)).length;
  const accuracy = answers.length ? correct / answers.length : 0;

  let summary: string;
  if (!answers.length) summary = `${studentName} todavía no ha hecho ejercicios de Lengua de ${LENGUA_COURSES[course]}.`;
  else {
    const parts = [`${studentName} ha completado ${own.length} ${own.length === 1 ? "sesión" : "sesiones"} con ${answers.length} ejercicios y un ${Math.round(accuracy * 100)} % de aciertos.`];
    if (strengths.length) parts.push(`Domina: ${strengths.join(", ")}.`);
    if (toReinforce.length) parts.push(`Conviene reforzar: ${toReinforce.join(", ")}.`);
    const next = recommendedUnit(mastery);
    if (next && next.level !== "dominado") parts.push(`Siguiente paso recomendado: «${next.unit.title}» en dificultad ${DIFFICULTY_LABELS[next.nextDifficulty].toLowerCase()}.`);
    summary = parts.join(" ");
  }

  return { course, generatedAt: new Date().toISOString(), attempts: own.length, exercisesDone: answers.length, accuracy, bySkill, mastery, strengths, toReinforce, pendingTasks, summary };
}

/** Valida los datos que llegan de Supabase antes de usarlos en pantalla. */
export function parseLenguaAttempt(value: unknown): LenguaAttempt | null {
  const data = value as Partial<LenguaAttempt> | null;
  if (!data || data.kind !== "lengua_attempt" || (data.course !== "1EP" && data.course !== "2EP") || !Array.isArray(data.answers)) return null;
  return {
    module: "lengua",
    kind: "lengua_attempt",
    studentId: String(data.studentId ?? ""),
    taskId: typeof data.taskId === "string" ? data.taskId : undefined,
    course: data.course,
    score: Number(data.score) || 0,
    total: Number(data.total) || 0,
    completedAt: typeof data.completedAt === "string" ? data.completedAt : "",
    answers: data.answers.filter((answer): answer is LenguaAnswer => Boolean(answer) && typeof answer.unit === "string" && typeof answer.correct === "boolean"),
  };
}

export function parseLenguaTask(value: unknown): LenguaTask | null {
  const data = value as Partial<LenguaTask> | null;
  if (!data || data.kind !== "lengua_task" || typeof data.id !== "string" || (data.course !== "1EP" && data.course !== "2EP")) return null;
  return {
    kind: "lengua_task",
    id: data.id,
    studentId: String(data.studentId ?? ""),
    title: typeof data.title === "string" && data.title ? data.title : "Tarea de Lengua",
    note: typeof data.note === "string" ? data.note : undefined,
    dueDate: typeof data.dueDate === "string" ? data.dueDate : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    course: data.course,
    units: Array.isArray(data.units) ? data.units.filter((unit): unit is string => typeof unit === "string") : [],
    difficulty: ["facil", "medio", "desafiante", "todas", "auto"].includes(String(data.difficulty)) ? (data.difficulty as LenguaTaskConfig["difficulty"]) : "auto",
    questionCount: Math.max(1, Math.min(30, Number(data.questionCount) || 10)),
    includeTrace: data.includeTrace !== false,
  };
}
