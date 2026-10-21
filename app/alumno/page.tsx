"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  RotateCw, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  ExternalLink, 
  Award, 
  Filter,
  Send
} from "lucide-react";
import SkillCoinsChart from "@/components/SkillCoinsChart";
import { ENGLISH_A1_DATABASE } from "@/lib/english-engine";

interface Flashcard {
  id: string;
  term: string;
  definition: string;
  category: string;
  targetStudents?: string[];
}

interface MentorMessage {
  id: string;
  studentId: string;
  subjectId: string;
  text: string;
  link?: string;
  date: string;
}

const INITIAL_CARDS: Flashcard[] = [
  { id: "1", category: "Geografía", term: "Meandro", definition: "Curva pronunciada que forma el curso de un río en su recorrido." },
  { id: "2", category: "Geografía", term: "Meseta", definition: "Planicie extensa situada a considerable altura sobre el nivel del mar." },
  { id: "3", category: "Historia", term: "1492", definition: "Llegada de Cristóbal Colón a América y fin de la Reconquista en Granada." },
  { id: "4", category: "Historia", term: "Revolución Francesa", definition: "Conflicto social y político iniciado en 1789 que abolió el Antiguo Régimen." },
  { id: "5", category: "Física", term: "Inercia", definition: "Propiedad de los cuerpos de mantener su estado de reposo o movimiento relativo." },
  { id: "6", category: "Inglés", term: "Achievement", definition: "Logro o éxito conseguido con esfuerzo y habilidad." }
];

// RECURSOS OFICIALES 1.1 ASIGNATURAS SPRINT 2
const SUBJECTS = [
  {
    id: "geo",
    name: "1.1.1. Geografía",
    desc: "Práctica de mapas interactivos, relieve y capitales del mundo.",
    links: [
      { title: "GeoGuessr", url: "https://www.geoguessr.com", note: "Explora y deduce ubicaciones reales mediante mapas interactivos." },
      { title: "Seterra", url: "https://www.geoguessr.com/seterra/es", note: "Mapas interactivos para aprender capitales, provincias, ríos y relieve con aciertos." }
    ],
    defaultNote: "Practica las provincias y ríos de España antes de la próxima sesión."
  },
  {
    id: "his",
    name: "1.1.2. Historia",
    desc: "Vídeos resumen cronológicos y conceptos clave.",
    links: [
      { title: "Canal Memorias de Pez (Vídeos resumen)", url: "https://youtube.com/@memoriasdepez?si=txpcTpw_C-eKfYj0", note: "Vídeos explicativos animados sobre etapas históricas clave." }
    ],
    defaultNote: "Mira el vídeo de la Ilustración y las causas de la Revolución Francesa."
  },
  {
    id: "fis",
    name: "1.1.3. Física y Química",
    desc: "Resolución práctica de problemas, fórmulas y ajustes.",
    links: [
      { title: "Clases Particulares en Ávila", url: "https://youtube.com/@clasesparticularesenavila?si=lXZ73ecH2PbmC1nO", note: "Ejercicios guiados paso a paso de cinemática y reacciones químicas para ESO." }
    ],
    defaultNote: "Repasa los ejercicios de ajuste de reacciones del canal de Ávila."
  },
  {
    id: "len",
    name: "1.1.4. Lengua y Literatura",
    desc: "Sintaxis, morfología y comprensión lectora.",
    links: [
      { title: "Sintaxis Guiada Paso a Paso", url: "https://www.sintaxis.org/", note: "Fichas de identificación de sintagmas y complementos oracionales." }
    ],
    defaultNote: "Completa el análisis sintáctico de las 3 oraciones de la ficha."
  },
  {
    id: "ing",
    name: "1.1.5. Inglés",
    desc: "Vocabulario, gramática y preparación curricular Macmillan.",
    links: [],
    defaultNote: "Revisa las flashcards de vocabulario y realiza el test A1."
  },
  {
    id: "qui",
    name: "1.1.6. Química",
    desc: "Tabla periódica, formulación inorgánica y enlaces.",
    links: [
      { title: "Tabla Periódica Interactiva (Ptable)", url: "https://ptable.com/?lang=es", note: "Propiedades y valencias de los elementos químicos." }
    ],
    defaultNote: "Apréndete las valencias de los no metales del grupo 17."
  },
  {
    id: "bio",
    name: "1.1.7. Biología y Geología",
    desc: "Célula, genética, ecosistemas y anatomía humana.",
    links: [
      { title: "Atlas Visual de Biología", url: "https://biologia-geologia.com/", note: "Esquemas interactivos del ciclo celular y anatomía." }
    ],
    defaultNote: "Repasa el ciclo celular y las fases de la mitosis."
  }
];

export default function AlumnoPage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<"inicio" | "flashcards" | "asignaturas" | "ingles" | "progreso" | "calculalo">("inicio");
  
  // Usuario dinámico
  const [currentStudentName, setCurrentStudentName] = useState("Carmen Fernández");
  const [currentUsername, setCurrentUsername] = useState("carmen");

  // Estado de Flashcards
  const [allCards, setAllCards] = useState<Flashcard[]>(INITIAL_CARDS);
  const [categoryFilter, setCategoryFilter] = useState<string>("todas");
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mode, setMode] = useState<"estudia" | "practica">("estudia");

  // Modo Práctica (Juego con tiempo)
  const [gameDuration, setGameDuration] = useState<number>(180);
  const [timeLeft, setTimeLeft] = useState<number>(180);
  const [isGameActive, setIsGameActive] = useState(false);
  const [gameScore, setGameScore] = useState(0);
  const [gameAnswersCount, setGameAnswersCount] = useState(0);
  const [gameOptions, setGameOptions] = useState<string[]>([]);
  const [gameFinished, setGameFinished] = useState(false);

  // Asignaturas y mensajes del mentor
  const [selectedSubjectId, setSelectedSubjectId] = useState("geo");
  const [mentorMessages, setMentorMessages] = useState<MentorMessage[]>([]);

  // Inglés A1 Motor de ejercicios corregido y real
  const [englishAnswers, setEnglishAnswers] = useState<Record<number, string>>({});
  const [englishFeedback, setEnglishFeedback] = useState<{ score: number; total: number; checked: boolean }>({ score: 0, total: ENGLISH_A1_DATABASE.length, checked: false });

  // SkillCoins Semanales
  const [scData, setScData] = useState({
    estudios: 8,
    compromiso: 9,
    organizacion: 7,
    bienestar: 9,
    updatedAt: "12/5/26"
  });

  // Carga inicial y datos del usuario
  useEffect(() => {
    const rawUser = localStorage.getItem("kiru_current_user");
    let activeUser = "carmen";
    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        if (parsed.name) setCurrentStudentName(parsed.name);
        if (parsed.username) {
          setCurrentUsername(parsed.username);
          activeUser = parsed.username;
        }
      } catch (e) {
        console.error(e);
      }
    }

    // Cargar flashcards
    const savedCards = localStorage.getItem("kiru_custom_flashcards");
    if (savedCards) {
      try {
        const parsedCards: Flashcard[] = JSON.parse(savedCards);
        const userCards = parsedCards.filter(
          (c) => !c.targetStudents || c.targetStudents.includes(activeUser) || c.targetStudents.includes("todos")
        );
        if (userCards.length > 0) {
          setAllCards(userCards);
        }
      } catch (e) {
        console.error(e);
      }
    }

    // Cargar mensajes enviados por el mentor a este alumno
    const rawMsgs = localStorage.getItem("kiru_mentor_subject_messages");
    if (rawMsgs) {
      try {
        const parsedMsgs: MentorMessage[] = JSON.parse(rawMsgs);
        setMentorMessages(parsedMsgs.filter((m) => m.studentId === activeUser || m.studentId === "todos"));
      } catch (e) {}
    }

    // Leer SkillCoins del Google Sheet oficial
    const fetchSheetData = async () => {
      try {
        const sheetUrl = "https://docs.google.com/spreadsheets/d/1bgZYmXc4uol1GvfyD7QaAldnK37OG3hLC27jMVg6A1c/gviz/tq?tqx=out:json";
        const res = await fetch(sheetUrl);
        const text = await res.text();
        const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
        const data = JSON.parse(jsonText);
        const rows = data?.table?.rows;

        if (rows && rows.length > 0) {
          const lastRow = rows[rows.length - 1].c;
          let dateFormatted = "12/5/26";
          if (lastRow[0]?.f) {
            dateFormatted = lastRow[0].f.split(" ")[0];
          } else if (lastRow[0]?.v) {
            dateFormatted = String(lastRow[0].v).split("T")[0];
          }

          const parsedSC = {
            estudios: Number(lastRow[2]?.v) || 8,
            compromiso: Number(lastRow[3]?.v) || 9,
            organizacion: Number(lastRow[4]?.v) || 7,
            bienestar: Number(lastRow[5]?.v) || 9,
            updatedAt: dateFormatted
          };

          setScData(parsedSC);
          localStorage.setItem(`kiru_sc_${activeUser}`, JSON.stringify(parsedSC));
          return;
        }
      } catch (err) {}

      const localSC = localStorage.getItem(`kiru_sc_${activeUser}`);
      if (localSC) {
        try {
          setScData(JSON.parse(localSC));
        } catch (e) {}
      }
    };

    fetchSheetData();
  }, []);

  // Lista filtrada de flashcards
  const filteredCards = categoryFilter === "todas" 
    ? allCards 
    : allCards.filter((c) => c.category.toLowerCase() === categoryFilter.toLowerCase());

  useEffect(() => {
    setCardIndex(0);
    setIsFlipped(false);
  }, [categoryFilter]);

  // Temporizador del juego de práctica
  useEffect(() => {
    let timer: any = null;
    if (isGameActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (isGameActive && timeLeft === 0) {
      setIsGameActive(false);
      setGameFinished(true);
    }
    return () => clearInterval(timer);
  }, [isGameActive, timeLeft]);

  const setupNewQuestion = () => {
    setIsFlipped(false);
    const pool = filteredCards.length >= 3 ? filteredCards : allCards;
    const randomIdx = Math.floor(Math.random() * pool.length);
    setCardIndex(randomIdx);

    const currentCard = pool[randomIdx];
    const distractors = pool
      .filter((c) => c.id !== currentCard.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 2)
      .map((c) => c.definition);

    const allOptions = [...distractors, currentCard.definition].sort(() => 0.5 - Math.random());
    setGameOptions(allOptions);
  };

  const startPracticeGame = (minutes: number) => {
    const secs = minutes * 60;
    setGameDuration(secs);
    setTimeLeft(secs);
    setGameScore(0);
    setGameAnswersCount(0);
    setGameFinished(false);
    setIsGameActive(true);
    setupNewQuestion();
  };

  const handleSelectOption = (chosenDef: string) => {
    if (!isGameActive) return;
    const pool = filteredCards.length >= 3 ? filteredCards : allCards;
    const currentCard = pool[cardIndex] || pool[0];
    if (chosenDef === currentCard.definition) {
      setGameScore((prev) => prev + 1);
    }
    setGameAnswersCount((prev) => prev + 1);
    setupNewQuestion();
  };

  // Corrección basada en el banco central de preguntas de Inglés A1.
  const checkEnglishExercises = (e: React.FormEvent) => {
    e.preventDefault();
    const questions = ENGLISH_A1_DATABASE;
    const hits = questions.reduce((count, question, index) => {
      const given = (englishAnswers[index] || "").trim().toLocaleLowerCase();
      const expected = question.answer.trim().toLocaleLowerCase();
      return count + (given === expected ? 1 : 0);
    }, 0);
    setEnglishFeedback({ score: hits, total: questions.length, checked: true });
  };

  const activeSubject = SUBJECTS.find((s) => s.id === selectedSubjectId) || SUBJECTS[0];
  const activeSubjectMessages = mentorMessages.filter((m) => m.subjectId === selectedSubjectId);

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#343330] font-sans pb-16">
      {/* Cabecera */}
      <header className="bg-white border-b border-[#E7E3DC] px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="font-serif text-lg sm:text-xl text-[#292825] font-bold">Campus Método Kiru</span>
          <span className="text-[11px] bg-[#F3EEE5] text-[#8A775B] px-2.5 py-0.5 rounded-full border border-[#E4D8C5] font-semibold">
            Alumno: {currentStudentName}
          </span>
        </div>

        <button
          onClick={() => router.push("/")}
          title="Cerrar sesión"
          className="p-2 sm:p-2.5 rounded-xl bg-[#242321] text-white hover:bg-[#3A3835] transition flex items-center justify-center shadow-xs"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Barra superior de navegación */}
        <div className="bg-white rounded-2xl border border-[#E7E3DC] p-1.5 flex flex-wrap gap-1.5 shadow-xs text-xs font-semibold">
          {[
            { id: "inicio", label: "Mi Panel" },
            { id: "asignaturas", label: "1.1. Asignaturas" },
            { id: "flashcards", label: "Flashcards" },
            { id: "ingles", label: "Inglés A1" },
            { id: "progreso", label: "Mi Progreso (SC)" },
            { id: "calculalo", label: "Calcúlalo" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl transition ${
                mainTab === tab.id
                  ? "bg-[#242321] text-white shadow-xs"
                  : "text-[#6D6962] hover:bg-[#F5F2EC]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* SECCIÓN 1: INICIO */}
        {mainTab === "inicio" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-2">
              <span className="text-[11px] font-bold text-[#8D887F] uppercase tracking-wider">Bienvenida</span>
              <h2 className="text-2xl font-serif text-[#292825] font-bold">¡Hola, {currentStudentName}!</h2>
              <p className="text-xs text-[#6D6962] max-w-xl leading-relaxed">
                Tienes disponibles tus recursos didácticos: vídeos y mapas interactivos en <strong>1.1. Asignaturas</strong>, el sistema de <strong>Flashcards</strong>, el módulo de <strong>Inglés A1</strong> y tus <strong>SkillCoins semanales</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div
                onClick={() => setMainTab("asignaturas")}
                className="p-5 bg-white rounded-2xl border border-[#E7E3DC] hover:border-slate-400 transition cursor-pointer shadow-xs space-y-2"
              >
                <h3 className="font-serif text-base text-[#292825] font-bold">1.1. Asignaturas</h3>
                <p className="text-xs text-[#77736B]">Geografía (mapas), Historia (Memorias de Pez), Física (Ávila) y notas del mentor.</p>
              </div>

              <div
                onClick={() => setMainTab("flashcards")}
                className="p-5 bg-white rounded-2xl border border-[#E7E3DC] hover:border-slate-400 transition cursor-pointer shadow-xs space-y-2"
              >
                <h3 className="font-serif text-base text-[#292825] font-bold">Flashcards</h3>
                <p className="text-xs text-[#77736B]">Modo estudio o práctica contrarreloj (1, 3 o 5 mins) con filtro de materias.</p>
              </div>

              <div
                onClick={() => setMainTab("progreso")}
                className="p-5 bg-white rounded-2xl border border-[#E7E3DC] hover:border-slate-400 transition cursor-pointer shadow-xs space-y-2"
              >
                <Award className="w-5 h-5 text-[#927B5D]" />
                <h3 className="font-serif text-base text-[#292825] font-bold">Mis SkillCoins</h3>
                <p className="text-xs text-[#77736B]">Puntuaciones semanales por categorías y evolución gráfica.</p>
              </div>
            </div>
          </div>
        )}

        {/* SECCIÓN 1.1: ASIGNATURAS */}
        {mainTab === "asignaturas" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-serif text-[#292825] font-bold">1.1. Asignaturas y Recursos</h2>
                <p className="text-xs text-[#77736B]">Listado oficial de materias, herramientas recomendadas y notas del mentor.</p>
              </div>

              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="p-2.5 bg-white border border-[#E7E3DC] rounded-xl text-xs font-bold text-[#45433F] focus:outline-none shadow-xs cursor-pointer"
              >
                {SUBJECTS.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white rounded-3xl border border-[#E7E3DC] p-6 sm:p-8 space-y-6 shadow-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A775B] bg-[#F3EEE5] px-2.5 py-1 rounded-full border border-[#E4D8C5]">
                  Materia Activa
                </span>
                <h3 className="text-2xl font-serif text-[#292825] font-bold mt-2">{activeSubject.name}</h3>
                <p className="text-xs text-[#77736B] mt-1">{activeSubject.desc}</p>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#6D6962]">Herramientas y Práctica</h4>
                {activeSubject.links.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeSubject.links.map((lnk, idx) => (
                      <a
                        key={idx}
                        href={lnk.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-4 rounded-2xl border border-[#E7E3DC] bg-[#F7F5F1] hover:bg-white hover:border-slate-400 transition flex flex-col justify-between space-y-2 group shadow-2xs"
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-xs text-[#292825] group-hover:text-[#8A775B]">
                            {lnk.title}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-[#8D887F] group-hover:text-[#292825]" />
                        </div>
                        <p className="text-[11px] text-[#77736B] leading-relaxed">{lnk.note}</p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#8D887F] italic">No hay enlaces externos predeterminados para esta materia.</p>
                )}
              </div>

              <div className="pt-4 border-t border-[#EEEAE4] space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#6D6962]">
                    Recomendaciones de tu Mentor
                  </h4>
                  <span className="text-[10px] text-[#8D887F] font-medium">De más reciente a más antiguo</span>
                </div>

                {activeSubjectMessages.length > 0 ? (
                  <div className="space-y-2.5">
                    {activeSubjectMessages.map((m) => (
                      <div key={m.id} className="p-4 rounded-2xl bg-blue-50/60 border border-[#E2DED7] text-xs text-[#403D38] space-y-2">
                        <div className="flex justify-between items-center text-[10px] text-[#77736B] font-bold uppercase">
                          <span>Recomendación pedagógica</span>
                          <span>{m.date}</span>
                        </div>
                        <p className="leading-relaxed font-medium">{m.text}</p>
                        {m.link && (
                          <a
                            href={m.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-[#8A775B] font-bold hover:underline pt-1"
                          >
                            <span>Abrir enlace adjunto</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-blue-50/60 border border-[#E2DED7] text-xs text-blue-900 leading-relaxed">
                    💬 &ldquo;{activeSubject.defaultNote}&rdquo;
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECCIÓN 3: FLASHCARDS */}
        {mainTab === "flashcards" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-serif text-[#292825] font-bold">Sistema de Flashcards</h2>
                <p className="text-xs text-[#77736B]">Herramienta activa para memorizar términos, fechas y vocabulario.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-[#E7E3DC] text-xs shadow-xs">
                  <Filter className="w-3.5 h-3.5 text-[#8D887F]" />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="todas">Todas las asignaturas</option>
                    <option value="geografía">Geografía</option>
                    <option value="historia">Historia</option>
                    <option value="física">Física y Química</option>
                    <option value="inglés">Inglés</option>
                    <option value="lengua">Lengua</option>
                  </select>
                </div>

                <div className="flex bg-white p-1 rounded-xl border border-[#E7E3DC] text-xs font-bold shadow-xs">
                  <button
                    onClick={() => {
                      setMode("estudia");
                      setIsGameActive(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      mode === "estudia" ? "bg-[#242321] text-white" : "text-[#6D6962] hover:bg-[#F5F2EC]"
                    }`}
                  >
                    Modo Estudia
                  </button>
                  <button
                    onClick={() => setMode("practica")}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      mode === "practica" ? "bg-[#242321] text-white" : "text-[#6D6962] hover:bg-[#F5F2EC]"
                    }`}
                  >
                    Modo Practica
                  </button>
                </div>
              </div>
            </div>

            {mode === "estudia" && (
              <div className="space-y-5">
                <div className="bg-[#F7F5F1] border border-[#E7E3DC] p-4 rounded-2xl text-xs text-[#6D6962] leading-relaxed">
                  💡 <strong>Instrucciones:</strong> Toca la tarjeta para voltearla y ver la respuesta. Usa las flechas para navegar.
                </div>

                {filteredCards.length > 0 ? (
                  <>
                    <div
                      onClick={() => setIsFlipped(!isFlipped)}
                      className="bg-white rounded-3xl border border-[#E7E3DC] shadow-xs p-8 sm:p-12 min-h-[260px] flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:shadow-md relative select-none"
                    >
                      <span className="absolute top-4 left-5 text-[10px] font-bold uppercase tracking-widest text-[#77736B] bg-[#F7F5F1] border border-[#E7E3DC] px-2.5 py-1 rounded-full">
                        {filteredCards[cardIndex]?.category || "General"}
                      </span>
                      <span className="absolute top-4 right-5 text-xs text-[#8D887F] font-semibold">
                        {cardIndex + 1} / {filteredCards.length}
                      </span>

                      {!isFlipped ? (
                        <div className="space-y-3">
                          <span className="text-[11px] font-bold text-[#8A775B] uppercase tracking-wider block">Término / Concepto</span>
                          <h3 className="text-2xl sm:text-3xl font-serif text-[#292825] font-bold">
                            {filteredCards[cardIndex]?.term}
                          </h3>
                        </div>
                      ) : (
                        <div className="space-y-3 max-w-md">
                          <span className="text-[11px] font-bold text-[#77736B] uppercase tracking-wider block">Definición</span>
                          <p className="text-base sm:text-lg text-[#45433F] leading-relaxed font-sans font-medium">
                            {filteredCards[cardIndex]?.definition}
                          </p>
                        </div>
                      )}

                      <div className="absolute bottom-4 flex items-center gap-1.5 text-[11px] text-[#8D887F] font-medium">
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Toca para voltear</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center px-2">
                      <button
                        onClick={() => {
                          setIsFlipped(false);
                          setCardIndex((prev) => (prev > 0 ? prev - 1 : filteredCards.length - 1));
                        }}
                        className="px-4 py-2.5 bg-white border border-[#E7E3DC] rounded-xl text-xs font-semibold text-slate-700 hover:bg-[#F5F2EC] flex items-center gap-1.5 shadow-xs"
                      >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                      </button>

                      <button
                        onClick={() => {
                          setIsFlipped(false);
                          setCardIndex((prev) => (prev < filteredCards.length - 1 ? prev + 1 : 0));
                        }}
                        className="px-4 py-2.5 bg-white border border-[#E7E3DC] rounded-xl text-xs font-semibold text-slate-700 hover:bg-[#F5F2EC] flex items-center gap-1.5 shadow-xs"
                      >
                        Siguiente <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="bg-white p-8 rounded-3xl border border-[#E7E3DC] text-center text-xs text-[#77736B]">
                    No hay flashcards para esta materia todavía.
                  </div>
                )}
              </div>
            )}

            {mode === "practica" && (
              <div className="space-y-5">
                {!isGameActive && !gameFinished ? (
                  <div className="bg-white rounded-3xl border border-[#E7E3DC] p-6 sm:p-8 text-center space-y-4 shadow-xs">
                    <Clock className="w-10 h-10 text-[#8A775B] mx-auto" />
                    <h3 className="text-xl font-serif text-[#292825] font-bold">Juego de Práctica Contrarreloj</h3>
                    <p className="text-xs text-[#77736B] max-w-md mx-auto">
                      Se mostrará un término y deberás elegir la definición correcta entre 3 opciones antes de que termine el tiempo. Al final verás tu nota de aciertos.
                    </p>

                    <div className="pt-2">
                      <span className="text-[11px] font-bold text-[#8D887F] uppercase tracking-wider block mb-2">
                        Elige la duración:
                      </span>
                      <div className="flex justify-center gap-3">
                        {[1, 3, 5].map((mins) => (
                          <button
                            key={mins}
                            onClick={() => startPracticeGame(mins)}
                            className="px-5 py-2.5 bg-[#F7F5F1] border border-[#E7E3DC] hover:bg-[#242321] hover:text-white rounded-xl text-xs font-bold transition shadow-xs"
                          >
                            {mins} Min{mins > 1 ? "s" : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : isGameActive ? (
                  <div className="bg-white rounded-3xl border border-[#E7E3DC] p-6 sm:p-8 space-y-6 shadow-xs">
                    <div className="flex justify-between items-center pb-4 border-b border-[#EEEAE4]">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <Clock className="w-4 h-4 text-rose-600 animate-pulse" />
                        <span>
                          Tiempo: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-[#77736B]">
                        Aciertos: <span className="text-emerald-700 font-bold">{gameScore}</span> / {gameAnswersCount}
                      </div>
                    </div>

                    <div className="text-center py-2 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-[#8D887F] tracking-wider">Concepto</span>
                      <h3 className="text-2xl font-serif text-[#292825] font-bold">
                        {filteredCards[cardIndex]?.term || allCards[cardIndex]?.term}
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {gameOptions.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelectOption(opt)}
                          className="w-full text-left p-4 rounded-2xl border border-[#E7E3DC] bg-[#F7F5F1] hover:bg-[#242321] hover:text-white transition text-xs font-medium leading-relaxed shadow-xs"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl border border-[#E7E3DC] p-8 text-center space-y-4 shadow-xs">
                    <CheckCircle2 className="w-12 h-12 text-emerald-700 mx-auto" />
                    <h3 className="text-2xl font-serif text-[#292825] font-bold">¡Tiempo agotado!</h3>
                    <p className="text-xs text-[#77736B]">Has completado la sesión de práctica.</p>

                    <div className="p-4 bg-[#F7F5F1] rounded-2xl max-w-xs mx-auto border border-[#E7E3DC]">
                      <span className="text-xs text-[#8D887F] block mb-1 font-semibold">Nota Obtenida</span>
                      <span className="text-3xl font-bold font-serif text-[#292825]">
                        {gameAnswersCount > 0 ? ((gameScore / gameAnswersCount) * 10).toFixed(1) : 0} / 10
                      </span>
                      <span className="text-[11px] text-[#77736B] block mt-1">
                        ({gameScore} aciertos de {gameAnswersCount} preguntas)
                      </span>
                    </div>

                    <button
                      onClick={() => setGameFinished(false)}
                      className="px-6 py-2.5 bg-[#242321] text-white rounded-xl text-xs font-semibold hover:bg-[#3A3835] transition shadow-xs"
                    >
                      Volver a jugar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN 4: INGLÉS A1 (CON CORRECCIÓN REAL Y CÁLCULO DE NOTA EXACTA) */}
        {mainTab === "ingles" && (
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-6 animate-in fade-in duration-150">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A775B] bg-[#F3EEE5] px-2.5 py-1 rounded-full border border-[#E4D8C5]">
                A1 Beginner · Macmillan Curriculum
              </span>
              <h2 className="text-2xl font-serif text-[#292825] font-bold mt-2">Módulo de Inglés A1</h2>
              <p className="text-xs text-[#77736B]">Ejercicios autocorregibles con cálculo de nota exacta en tiempo real.</p>
            </div>

            <form onSubmit={checkEnglishExercises} className="space-y-4">
              {ENGLISH_A1_DATABASE.map((question, index) => (
                <div key={question.id} className="p-4 bg-[#F7F5F1] rounded-2xl border border-[#E7E3DC] space-y-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#45433F]">{index + 1}. {question.question}</span>
                    <span className="text-[10px] text-[#8D887F]">{question.topic}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {question.options.map((option) => (
                      <label key={option} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${englishAnswers[index] === option ? "border-[#B9A58A] bg-[#F0E9DE]" : "border-[#E7E3DC] bg-white hover:bg-[#FAF8F5]"}`}>
                        <input
                          type="radio"
                          name={`english-question-${question.id}`}
                          value={option}
                          checked={englishAnswers[index] === option}
                          onChange={() => {
                            setEnglishAnswers(previous => ({ ...previous, [index]: option }));
                            setEnglishFeedback(previous => ({ ...previous, checked: false }));
                          }}
                          required
                          className="accent-[#8A775B]"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                  {englishFeedback.checked && (
                    <p className={`text-[11px] font-medium ${englishAnswers[index]?.trim().toLocaleLowerCase() === question.answer.trim().toLocaleLowerCase() ? "text-[#6F765D]" : "text-[#8A6D62]"}`}>
                      {englishAnswers[index]?.trim().toLocaleLowerCase() === question.answer.trim().toLocaleLowerCase()
                        ? "Correcto"
                        : `Respuesta correcta: ${question.answer}`}
                    </p>
                  )}
                </div>
              ))}
              <button type="submit" className="w-full sm:w-auto px-6 py-3 bg-[#242321] text-white rounded-xl text-xs font-semibold hover:bg-[#3A3835] transition">
                Corregir respuestas
              </button>
              {englishFeedback.checked && (
                <div className="p-4 rounded-2xl border border-[#E7E3DC] bg-[#F7F5F1]">
                  <p className="text-sm font-semibold text-[#343330]">Resultado: {englishFeedback.score} de {englishFeedback.total}</p>
                  <p className="text-xs text-[#6D6962] mt-1">Nota: {englishFeedback.total ? ((englishFeedback.score / englishFeedback.total) * 10).toFixed(1) : "0.0"} / 10</p>
                </div>
              )}
            </form>
          </div>
        )}

        {/* SECCIÓN 5: MI PROGRESO */}
        {mainTab === "progreso" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 border-b border-[#EEEAE4] pb-3">
                <div>
                  <h2 className="text-2xl font-serif text-[#292825] font-bold">SkillCoins Semanales</h2>
                  <p className="text-xs text-[#77736B]">Puntuación semanal no acumulada por categorías (0 a 10 SC).</p>
                </div>
                <span className="text-[11px] text-[#8D887F] font-semibold">
                  Actualizado el {scData.updatedAt}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-4 rounded-2xl bg-[#F3EEE5] border border-[#E4D8C5] space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A775B]">Estudios</span>
                  <p className="text-3xl font-serif font-bold text-[#4C4438]">{scData.estudios} SC</p>
                  <span className="text-[10px] text-[#77736B] block">Técnicas y asimilación</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F1F0ED] border border-[#E2DED7] space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#706A60]">Compromiso</span>
                  <p className="text-3xl font-serif font-bold text-[#403D38]">{scData.compromiso} SC</p>
                  <span className="text-[10px] text-[#77736B] block">Actitud y puntualidad</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F4EFE6] border border-[#E7DCC9] space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Organización</span>
                  <p className="text-3xl font-serif font-bold text-[#504536]">{scData.organizacion} SC</p>
                  <span className="text-[10px] text-[#77736B] block">Agenda y planificación</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F2F0EC] border border-[#E3DFD7] space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#746D63]">Bienestar</span>
                  <p className="text-3xl font-serif font-bold text-[#45413B]">{scData.bienestar} SC</p>
                  <span className="text-[10px] text-[#77736B] block">Confianza y calma</span>
                </div>
              </div>

              <div className="pt-4 border-t border-[#EEEAE4]">
                <SkillCoinsChart />
              </div>
            </div>
          </div>
        )}

        {/* SECCIÓN 6: CALCÚLALO */}
        {mainTab === "calculalo" && (
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] space-y-4 shadow-xs">
            <h2 className="text-xl sm:text-2xl font-serif text-[#292825] font-bold">Plataforma Calcúlalo</h2>
            <p className="text-xs text-[#6D6962] leading-relaxed">
              Accede a la herramienta externa para ejercicios y retos de cálculo matemático.
            </p>
            <a
              href="https://calculalo.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#242321] text-white text-xs font-semibold rounded-xl hover:bg-[#3A3835] transition shadow-xs"
            >
              <span>Abrir Calcúlalo</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </main>
    </div>
  );
}