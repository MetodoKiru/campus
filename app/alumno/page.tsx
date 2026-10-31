"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Home,
  BookOpen,
  Coins,
  Store,
  Menu,
  X
} from "lucide-react";
import SkillCoinsChart from "@/components/SkillCoinsChart";
import LenguaStudent from "@/components/lengua/LenguaStudent";
import StudentEnglishTasks from "@/components/english/StudentEnglishTasks";
import { getKiruRecords, saveKiruRecord, type KiruRecord, type KiruRecordData } from "@/lib/kiru-records";
import { isFlashcardSet } from "@/lib/english/flashcards";
import { supabase } from "@/lib/supabase";
import Toast from "@/components/Toast";
import StudentGoal from "@/components/skillcoins/StudentGoal";
import StudentShop from "@/components/skillcoins/StudentShop";
import NotificationBell from "@/components/skillcoins/NotificationBell";
import ProgressBar from "@/components/skillcoins/ProgressBar";
import { useStudentSkillcoins } from "@/components/skillcoins/useStudentSkillcoins";
import { latestWeekInfo, weekLabel } from "@/lib/skillcoins";

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

/** Picks a random card and two distractor definitions. Kept outside the component so render stays pure. */
// Single cards from the mentor's bulk generator, plus card sets (English tasks and the
// student's own review cards from mistakes).
function collectFlashcards(records: KiruRecord<KiruRecordData>[]): Flashcard[] {
  return records.flatMap((record, index) => {
    const value = record.data;
    if (isFlashcardSet(value)) {
      return value.cards.map((card) => ({ id: `${record.record_key}:${card.id}`, term: card.term, definition: card.definition, category: value.category }));
    }
    if (value && value.kind === "flashcard" && typeof value.term === "string" && typeof value.definition === "string") {
      return [{ id: String(value.id || index), term: value.term, definition: value.definition, category: typeof value.category === "string" ? value.category : "General" }];
    }
    return [];
  });
}

function pickPracticeQuestion(pool: Flashcard[]): { index: number; options: string[] } {
  const index = Math.floor(Math.random() * pool.length);
  const currentCard = pool[index];
  const distractors = pool
    .filter((c) => c.id !== currentCard.id)
    .sort(() => 0.5 - Math.random())
    .slice(0, 2)
    .map((c) => c.definition);
  const options = [...distractors, currentCard.definition].sort(() => 0.5 - Math.random());
  return { index, options };
}

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
  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentStudentName, setCurrentStudentName] = useState("");
  const [studentId, setStudentId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const verifyRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/"); return; }
        const { data: profile, error } = await supabase.from("profiles").select("id,full_name,username,role,is_active").eq("id", user.id).single();
        if (error || !profile?.is_active || profile.role !== "alumno" || user.app_metadata?.kiru_role !== "alumno") {
          router.replace("/");
          return;
        }
        if (alive) {
          setCurrentStudentName(profile.full_name);
          setStudentId(profile.id);
          setAuthorized(true);
        }
      } catch { router.replace("/"); }
      finally { if (alive) setAuthChecking(false); }
    };
    void verifyRole();
    return () => { alive = false; };
  }, [router]);

  const [mainTab, setMainTab] = useState<"inicio" | "flashcards" | "asignaturas" | "ingles" | "lengua" | "progreso" | "tienda" | "calculalo">("inicio");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const showMessage = (text: string, type: "success" | "error" = "success") => setToast({ text, type });
  const skillcoins = useStudentSkillcoins(studentId);
  const { summary } = skillcoins;
  const { week: latestWeek, title: latestTitle, note: latestNote } = latestWeekInfo(summary);
  const goTo = (tab: typeof mainTab) => { setMainTab(tab); setMenuOpen(false); window.scrollTo({ top: 0 }); };
  

  // Estado de Flashcards
  const [flashcardProgressLoaded, setFlashcardProgressLoaded] = useState(false);
  const [, setFlashcardProgressStatus] = useState("");
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
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

  // Todos los datos personales y compartidos se consultan en Supabase; no se usa almacenamiento local.
  useEffect(() => {
    let active = true;
    const loadStudentData = async () => {
      try {
        const [activityRecords, messageRecords, progressRecords] = await Promise.all([
          getKiruRecords<KiruRecordData>("activity"),
          getKiruRecords<KiruRecordData>("message"),
          getKiruRecords<KiruRecordData>("progress"),
        ]);
        if (!active) return;
        setAllCards(collectFlashcards([...activityRecords, ...progressRecords]));
        const savedPractice = progressRecords.map((record) => record.data).find((value) => value?.kind === "flashcard_practice_state");
        if (savedPractice) {
          setGameScore(Number(savedPractice.gameScore) || 0);
          setGameAnswersCount(Number(savedPractice.gameAnswersCount) || 0);
          setGameDuration(Number(savedPractice.gameDuration) || 180);
          setTimeLeft(Math.max(0, Number(savedPractice.timeLeft) || 0));
          setGameFinished(Boolean(savedPractice.gameFinished));
          setIsGameActive(Boolean(savedPractice.isGameActive) && Number(savedPractice.timeLeft) > 0);
          if (Array.isArray(savedPractice.gameOptions)) setGameOptions(savedPractice.gameOptions.filter((option: unknown) => typeof option === "string"));
          if (typeof savedPractice.cardIndex === "number") setCardIndex(savedPractice.cardIndex);
        }
        setFlashcardProgressLoaded(true);
        setMentorMessages(messageRecords.map((record) => record.data).filter((value) => value && typeof value.text === "string").map((value) => ({ ...value, studentId: value.studentUsername || value.studentId, date: typeof value.date === "string" ? new Date(value.date).toLocaleDateString("es-ES") : "" })) as MentorMessage[]);
      } catch (error) {
        console.error("No se pudieron cargar los datos del alumno desde Supabase.", error);
      }
    };
    void loadStudentData();
    return () => { active = false; };
  }, []);

  // Lista filtrada de flashcards. "Inglés" incluye también "Inglés · repaso".
  const filteredCards = categoryFilter === "todas" 
    ? allCards 
    : allCards.filter((c) => c.category.toLowerCase().startsWith(categoryFilter.toLowerCase()));

  // Abre las flashcards de repaso de inglés recién creadas desde una tarea.
  const openEnglishReviewCards = async () => {
    try {
      const [activityRecords, progressRecords] = await Promise.all([getKiruRecords<KiruRecordData>("activity"), getKiruRecords<KiruRecordData>("progress")]);
      setAllCards(collectFlashcards([...activityRecords, ...progressRecords]));
    } catch (error) {
      console.error("No se pudieron recargar las flashcards.", error);
    }
    setMode("estudia");
    setIsGameActive(false);
    setCategoryFilter("inglés · repaso");
    setCardIndex(0);
    setIsFlipped(false);
    setMainTab("flashcards");
  };

  const changeCategoryFilter = (value: string) => {
    setCategoryFilter(value);
    setCardIndex(0);
    setIsFlipped(false);
  };

  // Último estado de la práctica, para que el guardado periódico no use valores antiguos.
  const practiceStateRef = useRef({ gameScore, gameAnswersCount, gameDuration, timeLeft, isGameActive, gameFinished, gameOptions, cardIndex });
  useEffect(() => {
    practiceStateRef.current = { gameScore, gameAnswersCount, gameDuration, timeLeft, isGameActive, gameFinished, gameOptions, cardIndex };
  });

  // Temporizador del juego de práctica
  // Guarda el progreso cuando cambia la sesión; el reloj se sincroniza aparte cada 5 segundos.
  useEffect(() => {
    if (!flashcardProgressLoaded) return;
    const persistPractice = async () => {
      try {
        await saveKiruRecord("progress", "flashcard_practice_state", {
          kind: "flashcard_practice_state",
          ...practiceStateRef.current,
          updatedAt: new Date().toISOString(),
        });
        setFlashcardProgressStatus("Progreso guardado");
      } catch {
        setFlashcardProgressStatus("No se pudo guardar el progreso");
      }
    };
    const debounce = window.setTimeout(() => { void persistPractice(); }, 900);
    return () => window.clearTimeout(debounce);
  }, [flashcardProgressLoaded, gameScore, gameAnswersCount, gameDuration, isGameActive, gameFinished, gameOptions, cardIndex]);

  useEffect(() => {
    if (!flashcardProgressLoaded || !isGameActive) return;
    const syncTimer = window.setInterval(async () => {
      try {
        await saveKiruRecord("progress", "flashcard_practice_state", {
          kind: "flashcard_practice_state",
          ...practiceStateRef.current,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        setFlashcardProgressStatus("No se pudo sincronizar el temporizador");
      }
    }, 5000);
    return () => window.clearInterval(syncTimer);
  }, [flashcardProgressLoaded, isGameActive]);

  // Temporizador estable: no se reinicia cada segundo ni al cambiar de pestaña.
  useEffect(() => {
    if (!isGameActive) return;
    const timer = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          setIsGameActive(false);
          setGameFinished(true);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isGameActive]);

  const setupNewQuestion = () => {
    setIsFlipped(false);
    const pool = filteredCards.length >= 3 ? filteredCards : allCards;
    const { index, options } = pickPracticeQuestion(pool);
    setCardIndex(index);
    setGameOptions(options);
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

  const activeSubject = SUBJECTS.find((s) => s.id === selectedSubjectId) || SUBJECTS[0];
  const activeSubjectMessages = mentorMessages.filter((m) => m.subjectId === selectedSubjectId);

  if (authChecking) return <main className="min-h-screen bg-[#F7F6F3] flex items-center justify-center text-sm text-[#6D6962]">Comprobando permisos…</main>;
  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#343330] font-sans pb-16">
      {/* Cabecera */}
      <header className="bg-white border-b border-[#E7E3DC] px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            className="lg:hidden w-9 h-9 shrink-0 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] text-[#45433F] flex items-center justify-center hover:bg-[#F3F0EA] transition"
          >
            <Menu className="w-4 h-4" />
          </button>
          <span className="font-serif text-lg sm:text-xl text-[#292825] font-bold truncate">Campus Método Kiru</span>
          <span className="hidden sm:inline text-[11px] bg-[#F3EEE5] text-[#8A775B] px-2.5 py-0.5 rounded-full border border-[#E4D8C5] font-semibold">
            Alumno: {currentStudentName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goTo("progreso")}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F3EEE5] text-[#5C5141] text-xs font-bold hover:bg-[#EDE5D6] transition"
          >
            <Coins className="w-3.5 h-3.5" /> {summary.balance.toLocaleString("es-ES")} SC
          </button>
          <NotificationBell onOpenItem={(n) => goTo(n.kind === "canje_completado" ? "progreso" : "inicio")} />
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
        </div>
      </header>

      {toast && <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} />}

      {/* Fondo del menú en móvil */}
      {menuOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMenuOpen(false)} aria-hidden />}

      <div className="max-w-6xl mx-auto lg:flex lg:gap-6 lg:px-6">
        {/* Menú lateral: fijo en ordenador, desplegable en móvil */}
        <aside
          className={`fixed lg:sticky top-0 lg:top-[72px] left-0 z-50 lg:z-0 h-full lg:h-auto w-72 lg:w-56 shrink-0 bg-white lg:bg-transparent border-r border-[#E7E3DC] lg:border-0 p-4 lg:p-0 lg:pt-6 transition-transform lg:translate-x-0 ${
            menuOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
          } lg:self-start`}
          aria-label="Menú del alumno"
        >
          <div className="flex items-center justify-between lg:hidden mb-4">
            <span className="font-serif font-bold text-[#292825]">{currentStudentName}</span>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F3F0EA]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <nav className="lg:bg-white lg:rounded-2xl lg:border lg:border-[#E7E3DC] lg:p-2 lg:shadow-xs space-y-1 text-sm">
            {([
              { id: "inicio", label: "Mi panel", icon: Home },
              { id: "progreso", label: "Mis SkillCoins", icon: Coins },
              { id: "tienda", label: "Tienda", icon: Store },
            ] as const).map((item) => (
              <button
                key={item.id}
                onClick={() => goTo(item.id)}
                aria-current={mainTab === item.id ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-semibold transition ${
                  mainTab === item.id ? "bg-[#242321] text-white" : "text-[#45433F] hover:bg-[#F5F2EC]"
                }`}
              >
                <item.icon className="w-4 h-4" /> {item.label}
              </button>
            ))}
            <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8D887F] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Aprender
            </p>
            {([
              { id: "asignaturas", label: "Asignaturas" },
              { id: "flashcards", label: "Flashcards" },
              { id: "ingles", label: "Inglés" },
              { id: "lengua", label: "Lengua" },
              { id: "calculalo", label: "Calcúlalo" },
            ] as const).map((item) => (
              <button
                key={item.id}
                onClick={() => goTo(item.id)}
                aria-current={mainTab === item.id ? "page" : undefined}
                className={`w-full text-left pl-9 pr-3 py-2 rounded-xl text-[13px] transition ${
                  mainTab === item.id ? "bg-[#242321] text-white font-semibold" : "text-[#6D6962] hover:bg-[#F5F2EC]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-4 lg:mt-3 rounded-2xl bg-[#F3EEE5] border border-[#E4D8C5] p-3 text-xs text-[#5C5141]">
            <p className="font-bold">Tu saldo</p>
            <p className="text-xl font-serif font-bold text-[#292825]">{summary.balance.toLocaleString("es-ES")} SC</p>
          </div>
        </aside>

      <main className="flex-1 min-w-0 max-w-4xl mx-auto px-4 sm:px-6 lg:px-0 pt-6 space-y-6">
        {/* SECCIÓN 1: INICIO */}
        {mainTab === "inicio" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-2">
              <span className="text-[11px] font-bold text-[#8D887F] uppercase tracking-wider">Bienvenida</span>
              <h2 className="text-2xl font-serif text-[#292825] font-bold">¡Hola, {currentStudentName}!</h2>
              <p className="text-xs text-[#6D6962] max-w-xl leading-relaxed">
                ¿Qué quieres trabajar hoy?
              </p>
            </div>

            {studentId && (
              <StudentGoal
                studentId={studentId}
                balance={summary.balance}
                goals={skillcoins.goals}
                onChanged={skillcoins.reload}
                onOpenShop={() => goTo("tienda")}
                onMessage={showMessage}
              />
            )}

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
                onClick={() => goTo("tienda")}
                className="p-5 bg-white rounded-2xl border border-[#E7E3DC] hover:border-slate-400 transition cursor-pointer shadow-xs space-y-2"
              >
                <Award className="w-5 h-5 text-[#927B5D]" />
                <h3 className="font-serif text-base text-[#292825] font-bold">Tienda de recompensas</h3>
                <p className="text-xs text-[#77736B]">Tienes {summary.balance.toLocaleString("es-ES")} SC. Descubre qué recompensas tienes más cerca.</p>
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
                    onChange={(e) => changeCategoryFilter(e.target.value)}
                    className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="todas">Todas las asignaturas</option>
                    <option value="geografía">Geografía</option>
                    <option value="historia">Historia</option>
                    <option value="física">Física y Química</option>
                    <option value="inglés">Inglés</option>
                    <option value="inglés · repaso">Inglés: mis fallos</option>
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

        {mainTab === "lengua" && <LenguaStudent />}

        {/* SECCIÓN 4: INGLÉS · TAREAS ASIGNADAS POR EL MENTOR */}
        {mainTab === "ingles" && (
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-6 animate-in fade-in duration-150">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A775B] bg-[#F3EEE5] px-2.5 py-1 rounded-full border border-[#E4D8C5]">
                Gateway A1 · Macmillan
              </span>
              <h2 className="text-2xl font-serif text-[#292825] font-bold mt-2">Inglés: tus tareas</h2>
              <p className="text-xs text-[#77736B]">Haz las tareas que te manda tu mentor. Puedes parar cuando quieras: se guarda cada respuesta.</p>
            </div>
            <StudentEnglishTasks onOpenFlashcards={() => void openEnglishReviewCards()} />
          </div>
        )}

        {/* SECCIÓN 5: MIS SKILLCOINS */}
        {mainTab === "progreso" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="rounded-3xl bg-[#242321] text-white p-6 sm:p-8 grid sm:grid-cols-3 gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D7C8AF]">Saldo disponible</span>
                <p className="text-4xl font-serif font-bold mt-1">{summary.balance.toLocaleString("es-ES")} SC</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D7C8AF]">Ganadas</span>
                <p className="text-2xl font-serif font-bold mt-1">{summary.earned.toLocaleString("es-ES")} SC</p>
                <p className="text-[11px] text-[#CFC6B8]">En {summary.weeks.length} semana{summary.weeks.length === 1 ? "" : "s"} registradas</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D7C8AF]">Canjeadas</span>
                <p className="text-2xl font-serif font-bold mt-1">{summary.spent.toLocaleString("es-ES")} SC</p>
                <button onClick={() => goTo("tienda")} className="text-[11px] underline text-[#E8E2D8]">Ir a la tienda</button>
              </div>
            </div>

            {(() => {
              const goal = skillcoins.goals.find((g) => g.status === "aprobado" || g.status === "canje_solicitado");
              return goal ? (
                <div className="bg-white rounded-3xl border border-[#E7E3DC] p-5 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#8A775B]">Mi objetivo: {goal.reward_name}</p>
                  <ProgressBar cost={goal.cost} balance={summary.balance} />
                </div>
              ) : null;
            })()}

            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 border-b border-[#EEEAE4] pb-3">
                <div>
                  <h2 className="text-2xl font-serif text-[#292825] font-bold">{latestTitle === "Sin semanas registradas" ? "Mi última semana" : latestTitle}</h2>
                  <p className="text-xs text-[#77736B]">Cada categoría puntúa de 0 a 10 SC por semana.</p>
                </div>
                <span className="text-[11px] text-[#8D887F] font-semibold">
                  {latestWeek ? latestNote : "Sin semanas registradas"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-4 rounded-2xl bg-[#F3EEE5] border border-[#E4D8C5] space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A775B]">Estudios</span>
                  <p className="text-3xl font-serif font-bold text-[#4C4438]">{latestWeek?.estudios ?? 0} SC</p>
                  <span className="text-[10px] text-[#77736B] block">Técnicas y asimilación</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F1F0ED] border border-[#E2DED7] space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#706A60]">Compromiso</span>
                  <p className="text-3xl font-serif font-bold text-[#403D38]">{latestWeek?.compromiso ?? 0} SC</p>
                  <span className="text-[10px] text-[#77736B] block">Actitud y puntualidad</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F4EFE6] border border-[#E7DCC9] space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Organización</span>
                  <p className="text-3xl font-serif font-bold text-[#504536]">{latestWeek?.organizacion ?? 0} SC</p>
                  <span className="text-[10px] text-[#77736B] block">Agenda y planificación</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F2F0EC] border border-[#E3DFD7] space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#746D63]">Bienestar</span>
                  <p className="text-3xl font-serif font-bold text-[#45413B]">{latestWeek?.bienestar ?? 0} SC</p>
                  <span className="text-[10px] text-[#77736B] block">Confianza y calma</span>
                </div>
              </div>

              <div className="pt-4 border-t border-[#EEEAE4]">
                <SkillCoinsChart weeks={summary.weeks} />
              </div>
            </div>

            {(summary.weeks.length > 0 || skillcoins.movements.length > 0) && (
              <div className="bg-white rounded-3xl border border-[#E7E3DC] p-5 sm:p-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#555149]">Historial</h3>
                <ul className="space-y-2 text-sm">
                  {[
                    ...summary.weeks.map((w) => ({ key: "w" + w.week, date: w.week, text: weekLabel(w.week), amount: w.total })),
                    ...skillcoins.movements.map((m) => ({ key: m.id, date: m.created_at.slice(0, 10), text: m.reason, amount: m.amount })),
                  ].sort((x, y) => y.date.localeCompare(x.date)).map((item) => (
                    <li key={item.key} className="flex items-center justify-between gap-3 border-b border-[#EEEAE4] last:border-0 pb-2 last:pb-0">
                      <span className="text-[#6D6962]">{item.text}</span>
                      <span className={`font-bold ${item.amount < 0 ? "text-[#8A4B3C]" : "text-[#292825]"}`}>{item.amount > 0 ? "+" : ""}{item.amount} SC</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* TIENDA */}
        {mainTab === "tienda" && studentId && (
          <StudentShop
            studentId={studentId}
            summary={summary}
            rewards={skillcoins.rewards}
            goals={skillcoins.goals}
            loading={skillcoins.loading}
            onChanged={skillcoins.reload}
            onMessage={showMessage}
          />
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
    </div>
  );
}