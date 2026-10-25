// Temario y ejercicios de Lengua de 3º y 4º de Primaria.
import { dictation, type LenguaExercise, type LenguaUnit } from "@/lib/lengua/types";

export const UNITS_3_4: LenguaUnit[] = [
  { id: "3-bv", course: "3EP", title: "Ortografía: b y v", description: "mb, bl, br, verbos en -aba y en -bir." },
  { id: "3-gjh", course: "3EP", title: "Ortografía: g, j y h", description: "ge-gi / je-ji, güe-güi y palabras con h." },
  { id: "3-silabas", course: "3EP", title: "Sílabas y sílaba tónica", description: "Separar en sílabas y encontrar la que suena más fuerte." },
  { id: "3-gramatica", course: "3EP", title: "Clases de palabras y tiempos verbales", description: "Nombre, adjetivo, determinante, pronombre y verbo." },
  { id: "3-vocabulario", course: "3EP", title: "Vocabulario", description: "Sinónimos, antónimos, palabras compuestas y diccionario." },
  { id: "3-lectura", course: "3EP", title: "Leo y comprendo", description: "Cuentos y textos informativos con preguntas." },
  { id: "4-acentuacion", course: "4EP", title: "Agudas, llanas y esdrújulas", description: "Clasificar palabras y saber cuándo llevan tilde." },
  { id: "4-puntuacion", course: "4EP", title: "Signos de puntuación", description: "Punto, coma, dos puntos, raya, interrogación y exclamación." },
  { id: "4-gramatica", course: "4EP", title: "La oración y el verbo", description: "Sujeto y predicado, concordancia, persona, número y tiempo." },
  { id: "4-vocabulario", course: "4EP", title: "Vocabulario", description: "Prefijos, sufijos, frases hechas, refranes y gentilicios." },
  { id: "4-lectura", course: "4EP", title: "Leo y comprendo", description: "Textos más largos: idea principal y vocabulario en contexto." },
];

const huerto = "El año pasado, la clase de 4.º B decidió crear un huerto en el patio del colegio. Al principio solo había tierra seca y piedras. Los alumnos limpiaron el terreno, plantaron tomates, lechugas y fresas, y se turnaron para regar cada mañana. En junio recogieron tanta fruta y verdura que la llevaron al comedor para que la probara todo el colegio.";
const carta = "Querida abuela: Te escribo desde el campamento. Hemos subido a una montaña y desde arriba se veía el mar. Por la noche contamos historias alrededor del fuego. Te echo mucho de menos. Un beso muy fuerte, Irene.";
const gatito = "Marta encontró un gatito en la calle. Estaba mojado y temblaba. Lo envolvió en su bufanda y lo llevó a casa. Su padre le dio leche templada y, desde ese día, el gatito duerme a los pies de su cama.";
const pinguinos = "Los pingüinos son aves, pero no pueden volar. Sus alas les sirven para nadar muy rápido bajo el agua. Viven en lugares fríos del hemisferio sur y se alimentan de peces y calamares.";
const nieve = "Al abrir la ventana, Pablo vio que todo estaba blanco y que los coches tenían un gorro de hielo. Corrió a buscar sus guantes y su trineo.";

export const EXERCISES_3_4: LenguaExercise[] = [
  // ───── 3º · b y v
  { id: "3b-c1", course: "3EP", unit: "3-bv", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "Completa: ha_lar", speak: "hablar", options: ["b", "v"], answer: "b" },
  { id: "3b-c2", course: "3EP", unit: "3-bv", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "Completa: cam_iar", speak: "cambiar", options: ["b", "v"], answer: "b" },
  { id: "3b-c3", course: "3EP", unit: "3-bv", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "Completa: nue_e", speak: "nueve", options: ["b", "v"], answer: "v" },
  { id: "3b-c4", course: "3EP", unit: "3-bv", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "Completa: canta_a", speak: "cantaba", options: ["b", "v"], answer: "b" },
  { id: "3b-c5", course: "3EP", unit: "3-bv", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Qué palabra está bien escrita?", options: ["bentana", "ventana", "vemtana", "bemtana"], answer: "ventana" },
  { id: "3b-c6", course: "3EP", unit: "3-bv", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "Antes de «l» y de «r» siempre se escribe…", options: ["b", "v", "m", "n"], answer: "b" },
  { id: "3b-c7", course: "3EP", unit: "3-bv", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "Completa: escri_ir", speak: "escribir", options: ["b", "v"], answer: "b" },
  { id: "3b-c8", course: "3EP", unit: "3-bv", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "Completa: _i_ir", speak: "vivir", options: ["b … b", "v … v", "b … v", "v … b"], answer: "v … v" },
  dictation("3b-w1", "3EP", "3-bv", "facil", "nieve"),
  dictation("3b-w2", "3EP", "3-bv", "medio", "hablaba"),
  dictation("3b-w3", "3EP", "3-bv", "medio", "biblioteca"),
  dictation("3b-w4", "3EP", "3-bv", "desafiante", "el lobo vive en el bosque"),

  // ───── 3º · g, j y h
  { id: "3g-c1", course: "3EP", unit: "3-gjh", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "Completa: ca_a", speak: "caja", options: ["g", "j"], answer: "j" },
  { id: "3g-c2", course: "3EP", unit: "3-gjh", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "Completa: ro_o (es un color)", speak: "rojo", options: ["g", "j"], answer: "j" },
  { id: "3g-c3", course: "3EP", unit: "3-gjh", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "¿Qué palabra está bien escrita?", options: ["uevo", "huevo", "güevo", "hevo"], answer: "huevo" },
  { id: "3g-c4", course: "3EP", unit: "3-gjh", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "Completa: _ente", speak: "gente", options: ["g", "j"], answer: "g" },
  { id: "3g-c5", course: "3EP", unit: "3-gjh", skill: "Ortografía", difficulty: "medio", type: "choice", emoji: "🐧", prompt: "¿Cómo se escribe?", speak: "pingüino", options: ["pinguino", "pingüino", "pinjuino", "pingüíno"], answer: "pingüino" },
  { id: "3g-c6", course: "3EP", unit: "3-gjh", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "Las palabras que empiezan por «hie-» y «hue-» se escriben con…", options: ["h", "g", "j", "y"], answer: "h" },
  { id: "3g-c7", course: "3EP", unit: "3-gjh", skill: "Ortografía", difficulty: "medio", type: "choice", emoji: "🧊", prompt: "¿Cómo se escribe?", speak: "hielo", options: ["ielo", "hielo", "yelo", "jielo"], answer: "hielo" },
  { id: "3g-c8", course: "3EP", unit: "3-gjh", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "Completa: _irafa", speak: "jirafa", options: ["g", "j"], answer: "j" },
  { id: "3g-c9", course: "3EP", unit: "3-gjh", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "¿Qué palabra lleva diéresis (ü)?", options: ["guerra", "cigüeña", "guitarra", "juguete"], answer: "cigüeña" },
  dictation("3g-w1", "3EP", "3-gjh", "facil", "hueso"),
  dictation("3g-w2", "3EP", "3-gjh", "medio", "jirafa"),
  dictation("3g-w3", "3EP", "3-gjh", "desafiante", "la gente come helado"),

  // ───── 3º · Sílabas y sílaba tónica
  { id: "3s-c1", course: "3EP", unit: "3-silabas", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "¿Cuál es la sílaba que suena más fuerte en «mesa»?", speak: "mesa", options: ["me", "sa"], answer: "me" },
  { id: "3s-c2", course: "3EP", unit: "3-silabas", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "¿Cuál es la sílaba que suena más fuerte en «camión»?", speak: "camión", options: ["ca", "mión"], answer: "mión" },
  { id: "3s-c3", course: "3EP", unit: "3-silabas", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "¿Cómo se separa en sílabas «árbol»?", options: ["ár-bol", "á-rbol", "árb-ol", "ár-b-ol"], answer: "ár-bol" },
  { id: "3s-c4", course: "3EP", unit: "3-silabas", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Cómo se separa en sílabas «chocolate»?", options: ["cho-co-la-te", "choc-o-la-te", "cho-col-a-te", "c-ho-co-la-te"], answer: "cho-co-la-te" },
  { id: "3s-c5", course: "3EP", unit: "3-silabas", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Cuál es la sílaba tónica de «pájaro»?", speak: "pájaro", options: ["pá", "ja", "ro"], answer: "pá" },
  { id: "3s-c6", course: "3EP", unit: "3-silabas", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Cuál es la sílaba tónica de «teléfono»?", speak: "teléfono", options: ["te", "lé", "fo", "no"], answer: "lé" },
  { id: "3s-c7", course: "3EP", unit: "3-silabas", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Cuántas sílabas tiene «ordenador»?", speak: "ordenador", options: ["3", "4", "5", "6"], answer: "4" },
  { id: "3s-c8", course: "3EP", unit: "3-silabas", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "¿En qué palabra la sílaba tónica es la última?", options: ["canción", "casa", "lápiz", "música"], answer: "canción" },
  { id: "3s-b1", course: "3EP", unit: "3-silabas", skill: "Ortografía", difficulty: "facil", type: "build", prompt: "Ordena las sílabas para formar «chocolate».", speak: "chocolate", pieces: ["co", "la", "cho", "te"], answer: "chocolate" },

  // ───── 3º · Clases de palabras y tiempos verbales
  { id: "3r-c1", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "facil", type: "choice", prompt: "En «Los niños juegan en el patio», ¿cuál es el verbo?", options: ["niños", "juegan", "patio", "Los"], answer: "juegan" },
  { id: "3r-c2", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "facil", type: "choice", prompt: "¿En qué tiempo está «comeré»?", options: ["pasado", "presente", "futuro"], answer: "futuro" },
  { id: "3r-c3", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "facil", type: "choice", prompt: "¿En qué tiempo está «salté»?", options: ["pasado", "presente", "futuro"], answer: "pasado" },
  { id: "3r-c4", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "¿Qué palabra es un pronombre personal?", options: ["ellos", "casa", "rápido", "correr"], answer: "ellos" },
  { id: "3r-c5", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "En «aquel perro ladra», ¿qué palabra es un determinante?", options: ["aquel", "perro", "ladra"], answer: "aquel" },
  { id: "3r-c6", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "«Sevilla» es un nombre…", options: ["común", "propio"], answer: "propio" },
  { id: "3r-c7", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "Completa: Las flores son ___", options: ["bonito", "bonita", "bonitos", "bonitas"], answer: "bonitas" },
  { id: "3r-c8", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "desafiante", type: "choice", prompt: "¿Cuál es el plural de «lápiz»?", options: ["lápizs", "lápices", "lapices", "lápizes"], answer: "lápices" },
  { id: "3r-c9", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "desafiante", type: "choice", prompt: "¿Qué palabra es un adjetivo?", options: ["valiente", "valentía", "valer", "valientemente"], answer: "valiente" },
  { id: "3r-b1", course: "3EP", unit: "3-gramatica", skill: "Gramática", difficulty: "medio", type: "build", prompt: "Ordena las palabras para formar la frase.", pieces: ["juega", "El", "al fútbol", "niño"], answer: "El niño juega al fútbol" },

  // ───── 3º · Vocabulario
  { id: "3v-c1", course: "3EP", unit: "3-vocabulario", skill: "Vocabulario", difficulty: "facil", type: "choice", prompt: "¿Qué palabra significa lo mismo que «rápido»?", options: ["veloz", "lento", "tranquilo", "pesado"], answer: "veloz" },
  { id: "3v-c2", course: "3EP", unit: "3-vocabulario", skill: "Vocabulario", difficulty: "facil", type: "choice", prompt: "¿Qué palabra es lo contrario de «valiente»?", options: ["cobarde", "fuerte", "listo", "alto"], answer: "cobarde" },
  { id: "3v-c3", course: "3EP", unit: "3-vocabulario", skill: "Vocabulario", difficulty: "facil", type: "choice", prompt: "¿Qué palabra es de la familia de «flor»?", options: ["floristería", "flojo", "flota", "fruta"], answer: "floristería" },
  { id: "3v-c4", course: "3EP", unit: "3-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "¿Qué palabra es compuesta?", options: ["sacapuntas", "sacar", "puntos", "lápiz"], answer: "sacapuntas" },
  { id: "3v-c5", course: "3EP", unit: "3-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "En «Me senté en el banco del parque», «banco» significa…", options: ["un asiento", "un lugar para guardar dinero", "un grupo de peces", "una mesa"], answer: "un asiento" },
  { id: "3v-c6", course: "3EP", unit: "3-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "¿Qué palabra NO significa lo mismo que «contento»?", options: ["alegre", "feliz", "triste", "animado"], answer: "triste" },
  { id: "3v-c7", course: "3EP", unit: "3-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "Una casa muy grande es una…", options: ["casita", "casona", "caseta", "casera"], answer: "casona" },
  { id: "3v-c8", course: "3EP", unit: "3-vocabulario", skill: "Vocabulario", difficulty: "desafiante", type: "choice", prompt: "¿Qué palabra va primero en el diccionario?", options: ["cama", "casa", "cabra", "cara"], answer: "cabra" },
  { id: "3v-c9", course: "3EP", unit: "3-vocabulario", skill: "Vocabulario", difficulty: "desafiante", type: "choice", prompt: "En «deshacer», «des-» significa…", options: ["lo contrario", "otra vez", "antes", "muy"], answer: "lo contrario" },
  dictation("3v-w1", "3EP", "3-vocabulario", "medio", "sacapuntas", "Vocabulario"),

  // ───── 3º · Leo y comprendo
  { id: "3l-c1", course: "3EP", unit: "3-lectura", skill: "Comprensión lectora", difficulty: "facil", type: "choice", reading: gatito, prompt: "¿Dónde encontró Marta al gatito?", options: ["en la calle", "en el colegio", "en el parque", "en su casa"], answer: "en la calle" },
  { id: "3l-c2", course: "3EP", unit: "3-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: gatito, prompt: "¿Por qué temblaba el gatito?", options: ["porque estaba mojado y tenía frío", "porque tenía hambre", "porque estaba jugando", "porque le asustó un perro"], answer: "porque estaba mojado y tenía frío" },
  { id: "3l-c3", course: "3EP", unit: "3-lectura", skill: "Comprensión lectora", difficulty: "desafiante", type: "choice", reading: gatito, prompt: "¿Qué palabra describe mejor a Marta?", options: ["bondadosa", "egoísta", "perezosa", "miedosa"], answer: "bondadosa" },
  { id: "3l-c4", course: "3EP", unit: "3-lectura", skill: "Comprensión lectora", difficulty: "facil", type: "choice", reading: pinguinos, prompt: "¿Pueden volar los pingüinos?", options: ["sí", "no", "solo de noche", "solo los pequeños"], answer: "no" },
  { id: "3l-c5", course: "3EP", unit: "3-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: pinguinos, prompt: "¿Para qué usan las alas?", options: ["para nadar", "para volar", "para abrigarse", "para correr"], answer: "para nadar" },
  { id: "3l-c6", course: "3EP", unit: "3-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: pinguinos, prompt: "¿De qué se alimentan?", options: ["de peces y calamares", "de hierba", "de frutas", "de insectos"], answer: "de peces y calamares" },
  { id: "3l-c7", course: "3EP", unit: "3-lectura", skill: "Comprensión lectora", difficulty: "desafiante", type: "choice", reading: pinguinos, prompt: "¿Qué tipo de texto es?", options: ["un texto informativo", "un cuento", "un poema", "una receta"], answer: "un texto informativo" },
  { id: "3l-c8", course: "3EP", unit: "3-lectura", skill: "Comprensión lectora", difficulty: "desafiante", type: "choice", reading: nieve, prompt: "¿Qué había pasado durante la noche?", options: ["había nevado", "había hecho mucho calor", "había llovido", "había hecho viento"], answer: "había nevado" },

  // ───── 4º · Agudas, llanas y esdrújulas
  { id: "4a-c1", course: "4EP", unit: "4-acentuacion", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "«canción» es una palabra…", speak: "canción", options: ["aguda", "llana", "esdrújula"], answer: "aguda" },
  { id: "4a-c2", course: "4EP", unit: "4-acentuacion", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "«música» es una palabra…", speak: "música", options: ["aguda", "llana", "esdrújula"], answer: "esdrújula" },
  { id: "4a-c3", course: "4EP", unit: "4-acentuacion", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "Las palabras esdrújulas llevan tilde…", options: ["siempre", "nunca", "solo si acaban en vocal", "solo si acaban en n o s"], answer: "siempre" },
  { id: "4a-c4", course: "4EP", unit: "4-acentuacion", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "¿Qué palabra está bien escrita?", options: ["camion", "camión", "cámion", "camíon"], answer: "camión" },
  { id: "4a-c5", course: "4EP", unit: "4-acentuacion", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "«árbol» es una palabra…", speak: "árbol", options: ["aguda", "llana", "esdrújula"], answer: "llana" },
  { id: "4a-c6", course: "4EP", unit: "4-acentuacion", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "Las palabras agudas llevan tilde cuando terminan en…", options: ["vocal, n o s", "cualquier consonante", "l o r", "nunca llevan tilde"], answer: "vocal, n o s" },
  { id: "4a-c7", course: "4EP", unit: "4-acentuacion", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Qué palabra está bien escrita?", options: ["lapiz", "lápiz", "lapíz", "lápíz"], answer: "lápiz" },
  { id: "4a-c8", course: "4EP", unit: "4-acentuacion", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "¿Qué palabra aguda NO lleva tilde?", options: ["reloj", "sofá", "café", "jamás"], answer: "reloj" },
  { id: "4a-c9", course: "4EP", unit: "4-acentuacion", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "¿Qué palabra está bien escrita?", options: ["examen", "exámen", "éxamen", "examén"], answer: "examen" },
  dictation("4a-w1", "4EP", "4-acentuacion", "facil", "corazón"),
  dictation("4a-w2", "4EP", "4-acentuacion", "medio", "pájaro"),
  dictation("4a-w3", "4EP", "4-acentuacion", "desafiante", "murciélago"),

  // ───── 4º · Signos de puntuación
  { id: "4p-c1", course: "4EP", unit: "4-puntuacion", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "¿Qué signo falta al principio? «_Cómo te llamas?»", options: ["¿", "¡", ",", "."], answer: "¿" },
  { id: "4p-c2", course: "4EP", unit: "4-puntuacion", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "¿Qué frase está bien escrita?", options: ["¡Qué sorpresa!", "Qué sorpresa!", "¡Qué sorpresa", "¿Qué sorpresa!"], answer: "¡Qué sorpresa!" },
  { id: "4p-c3", course: "4EP", unit: "4-puntuacion", skill: "Ortografía", difficulty: "facil", type: "choice", prompt: "Después de un punto se escribe…", options: ["mayúscula", "minúscula", "una coma", "un número"], answer: "mayúscula" },
  { id: "4p-c4", course: "4EP", unit: "4-puntuacion", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "¿Dónde va la coma?", options: ["Compré peras, manzanas y uvas.", "Compré, peras manzanas y uvas.", "Compré peras manzanas, y uvas.", "Compré peras manzanas y, uvas."], answer: "Compré peras, manzanas y uvas." },
  { id: "4p-c5", course: "4EP", unit: "4-puntuacion", skill: "Ortografía", difficulty: "medio", type: "choice", prompt: "En un diálogo, ¿qué signo indica que habla un personaje?", options: ["la raya (—)", "el punto", "la coma", "los paréntesis"], answer: "la raya (—)" },
  { id: "4p-c6", course: "4EP", unit: "4-puntuacion", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "¿Qué signo falta? «Necesito tres cosas_ lápiz, goma y regla.»", options: [":", ";", ".", "¿"], answer: ":" },
  { id: "4p-c7", course: "4EP", unit: "4-puntuacion", skill: "Ortografía", difficulty: "desafiante", type: "choice", prompt: "¿Qué frase está bien puntuada?", options: ["Luis, ven aquí.", "Luis ven, aquí.", "Luis ven aquí,", "Luis. ven aquí"], answer: "Luis, ven aquí." },
  { id: "4p-b1", course: "4EP", unit: "4-puntuacion", skill: "Ortografía", difficulty: "facil", type: "build", prompt: "Ordena las piezas para formar la pregunta.", pieces: ["vives?", "¿Dónde"], answer: "¿Dónde vives?" },
  dictation("4p-w1", "4EP", "4-puntuacion", "desafiante", "Hoy hace sol, pero hace frío."),

  // ───── 4º · La oración y el verbo
  { id: "4g-c1", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "facil", type: "choice", prompt: "«Nosotros cantábamos» está en…", options: ["pasado", "presente", "futuro"], answer: "pasado" },
  { id: "4g-c2", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "facil", type: "choice", prompt: "¿Cuál es el infinitivo de «escribiremos»?", options: ["escribir", "escribe", "escrito", "escribiendo"], answer: "escribir" },
  { id: "4g-c3", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "facil", type: "choice", prompt: "¿Qué frase está bien escrita?", options: ["Los gatos negros duermen.", "Los gatos negro duermen.", "Los gato negros duerme.", "El gatos negros duermen."], answer: "Los gatos negros duermen." },
  { id: "4g-c4", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "En «El perro de Ana ladra mucho», ¿cuál es el sujeto?", options: ["El perro de Ana", "ladra mucho", "Ana", "mucho"], answer: "El perro de Ana" },
  { id: "4g-c5", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "En «Mis primos viven en Málaga», ¿cuál es el predicado?", options: ["viven en Málaga", "Mis primos", "en Málaga", "Mis"], answer: "viven en Málaga" },
  { id: "4g-c6", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "¿Qué palabra es un adverbio?", options: ["rápidamente", "rápido", "rapidez", "rápida"], answer: "rápidamente" },
  { id: "4g-c7", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "medio", type: "choice", prompt: "¿A qué conjugación pertenece «partir»?", options: ["primera (-ar)", "segunda (-er)", "tercera (-ir)"], answer: "tercera (-ir)" },
  { id: "4g-c8", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "desafiante", type: "choice", prompt: "«Vosotros corréis» está en…", options: ["primera persona del plural", "segunda persona del plural", "tercera persona del plural", "segunda persona del singular"], answer: "segunda persona del plural" },
  { id: "4g-c9", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "desafiante", type: "choice", prompt: "¿Qué palabra es una preposición?", options: ["desde", "dedo", "decir", "después"], answer: "desde" },
  { id: "4g-b1", course: "4EP", unit: "4-gramatica", skill: "Gramática", difficulty: "facil", type: "build", prompt: "Ordena las piezas para formar la oración.", pieces: ["regaron", "Los jardineros", "las plantas"], answer: "Los jardineros regaron las plantas" },

  // ───── 4º · Vocabulario
  { id: "4v-c1", course: "4EP", unit: "4-vocabulario", skill: "Vocabulario", difficulty: "facil", type: "choice", prompt: "¿Qué palabra se forma con «para» + «aguas»?", options: ["paraguas", "parador", "aguado", "parada"], answer: "paraguas" },
  { id: "4v-c2", course: "4EP", unit: "4-vocabulario", skill: "Vocabulario", difficulty: "facil", type: "choice", prompt: "¿Qué palabra es lo contrario de «generoso»?", options: ["tacaño", "amable", "rico", "feliz"], answer: "tacaño" },
  { id: "4v-c3", course: "4EP", unit: "4-vocabulario", skill: "Vocabulario", difficulty: "facil", type: "choice", prompt: "¿Qué palabra es un diminutivo?", options: ["pajarito", "pajarraco", "pájaro", "pajarera"], answer: "pajarito" },
  { id: "4v-c4", course: "4EP", unit: "4-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "«Estar en las nubes» significa…", options: ["estar distraído", "ir en avión", "estar muy alto", "estar mojado"], answer: "estar distraído" },
  { id: "4v-c5", course: "4EP", unit: "4-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "En «zapatero», «-ero» indica…", options: ["la persona que trabaja en algo", "algo pequeño", "algo grande", "lo contrario"], answer: "la persona que trabaja en algo" },
  { id: "4v-c6", course: "4EP", unit: "4-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "¿Qué prefijo significa «otra vez»?", options: ["re-", "des-", "in-", "sub-"], answer: "re-" },
  { id: "4v-c7", course: "4EP", unit: "4-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "Una persona de Madrid es…", options: ["madrileña", "madrina", "madridana", "madrense"], answer: "madrileña" },
  { id: "4v-c8", course: "4EP", unit: "4-vocabulario", skill: "Vocabulario", difficulty: "medio", type: "choice", prompt: "Completa el refrán: «Más vale tarde que…»", options: ["nunca", "pronto", "mañana", "siempre"], answer: "nunca" },
  { id: "4v-c9", course: "4EP", unit: "4-vocabulario", skill: "Vocabulario", difficulty: "desafiante", type: "choice", prompt: "En «La sierra está llena de nieve», «sierra» significa…", options: ["un conjunto de montañas", "una herramienta para cortar", "un pez", "un camino"], answer: "un conjunto de montañas" },

  // ───── 4º · Leo y comprendo
  { id: "4l-c1", course: "4EP", unit: "4-lectura", skill: "Comprensión lectora", difficulty: "facil", type: "choice", reading: huerto, prompt: "¿Dónde crearon el huerto?", options: ["en el patio del colegio", "en el parque", "en casa de un alumno", "en el campo"], answer: "en el patio del colegio" },
  { id: "4l-c2", course: "4EP", unit: "4-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: huerto, prompt: "¿Qué hicieron primero?", options: ["limpiar el terreno", "regar", "recoger fresas", "llevar la fruta al comedor"], answer: "limpiar el terreno" },
  { id: "4l-c3", course: "4EP", unit: "4-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: huerto, prompt: "¿Cada cuánto regaban?", options: ["cada mañana", "una vez a la semana", "cada tarde", "nunca"], answer: "cada mañana" },
  { id: "4l-c4", course: "4EP", unit: "4-lectura", skill: "Comprensión lectora", difficulty: "desafiante", type: "choice", reading: huerto, prompt: "¿Cuál es la idea principal del texto?", options: ["Una clase convirtió un terreno seco en un huerto", "A los alumnos les gustan las fresas", "El comedor del colegio es muy grande", "Regar es aburrido"], answer: "Una clase convirtió un terreno seco en un huerto" },
  { id: "4l-c5", course: "4EP", unit: "4-lectura", skill: "Comprensión lectora", difficulty: "desafiante", type: "choice", reading: huerto, prompt: "¿Qué significa «se turnaron»?", options: ["lo hicieron por orden, unos días cada uno", "se dieron la vuelta", "se cansaron", "lo hicieron todos a la vez"], answer: "lo hicieron por orden, unos días cada uno" },
  { id: "4l-c6", course: "4EP", unit: "4-lectura", skill: "Comprensión lectora", difficulty: "facil", type: "choice", reading: carta, prompt: "¿Quién escribe la carta?", options: ["Irene", "la abuela", "el monitor", "un amigo"], answer: "Irene" },
  { id: "4l-c7", course: "4EP", unit: "4-lectura", skill: "Comprensión lectora", difficulty: "medio", type: "choice", reading: carta, prompt: "¿Qué tipo de texto es?", options: ["una carta", "una noticia", "una receta", "un poema"], answer: "una carta" },
  { id: "4l-c8", course: "4EP", unit: "4-lectura", skill: "Comprensión lectora", difficulty: "desafiante", type: "choice", reading: carta, prompt: "¿Cómo se siente Irene?", options: ["contenta, pero echa de menos a su abuela", "muy enfadada", "aburrida", "asustada"], answer: "contenta, pero echa de menos a su abuela" },
];
