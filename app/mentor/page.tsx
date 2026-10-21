"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Users, 
  BookOpen, 
  Sparkles, 
  CheckCircle2, 
  ExternalLink,
  Save,
  Eye,
  Sliders,
  Layers,
  Plus,
  Send,
  Award
} from "lucide-react";
import { ENGLISH_A1_DATABASE, EnglishQuestion, EnglishConfig } from "@/lib/english-engine";
import SkillCoinsChart from "@/components/SkillCoinsChart";
import { supabase } from "@/lib/supabase";
import { getKiruRecords, saveKiruRecord } from "@/lib/kiru-records";

const ALL_SUBJECTS = [
  { id: "geo", name: "Geografía" },
  { id: "his", name: "Historia" },
  { id: "fis", name: "Física y Química" },
  { id: "len", name: "Lengua y Literatura" },
  { id: "ing", name: "Inglés" },
  { id: "qui", name: "Química" },
  { id: "bio", name: "Biología" }
];

interface Flashcard {
  id: string;
  category: string;
  term: string;
  definition: string;
  targetStudents?: string[];
}

interface MentorSubjectMessage {
  id: string;
  studentId: string;
  subjectId: string;
  text: string;
  link?: string;
  date: string;
}

export default function MentorPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  useEffect(() => {
    let alive = true;
    const verifyRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/"); return; }
        const { data: profile, error } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).single();
        if (error || !profile?.is_active || profile.role !== "mentor" || user.app_metadata?.kiru_role !== "mentor") {
          router.replace("/");
          return;
        }
        if (alive) setAuthorized(true);
      } catch { router.replace("/"); }
      finally { if (alive) setAuthChecking(false); }
    };
    void verifyRole();
    return () => { alive = false; };
  }, [router]);

  const [activeTab, setActiveTab] = useState<"asignaturas" | "envio_recursos" | "flashcards" | "ingles" | "skillcoins">("asignaturas");
  const [students, setStudents] = useState<Array<{ id: string; username: string; name: string }>>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [studentSubjects, setStudentSubjects] = useState<Record<string, string[]>>({});

  const [msgSubject, setMsgSubject] = useState("geo");
  const [msgTarget, setMsgTarget] = useState("");
  const [msgText, setMsgText] = useState("");
  const [msgLink, setMsgLink] = useState("");

  const [bulkCategory, setBulkCategory] = useState("Geografía");
  const [bulkText, setBulkText] = useState("");
  const [bulkTarget, setBulkTarget] = useState("");

  const [englishConfig, setEnglishConfig] = useState<EnglishConfig>({
    studentUsername: "",
    selectedUnits: [],
    selectedCategory: "Todas",
    difficulty: "todas",
    questionCount: 20
  });
  const [previewQuestions, setPreviewQuestions] = useState<EnglishQuestion[]>([]);

  const [studentSC, setStudentSC] = useState({ estudios: 0, compromiso: 0, organizacion: 0, bienestar: 0 });

  useEffect(() => {
    let active = true;
    const loadAssignedStudents = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: links, error: linkError } = await supabase.from("student_mentors").select("student_id").eq("mentor_id", user.id);
        if (linkError) throw linkError;
        const ids = Array.from(new Set((links || []).map((link: any) => link.student_id)));
        if (!ids.length) { if (active) setStudents([]); return; }
        const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,full_name,username").in("id", ids);
        if (profileError) throw profileError;
        if (!active) return;
        const assigned = (profiles || []).filter((p: any) => p.username).map((p: any) => ({ id: p.id, username: p.username, name: p.full_name }));
        setStudents(assigned);
        if (assigned.length && !selectedStudent) { setSelectedStudent(assigned[0].username); setMsgTarget(assigned[0].username); setBulkTarget(assigned[0].username); setEnglishConfig((current) => ({ ...current, studentUsername: assigned[0].username })); }
        const [activities, settings, progress] = await Promise.all([getKiruRecords<any>("activity"), getKiruRecords<any>("activity"), getKiruRecords<any>("progress")]);
        if (!active) return;
        const subjects: Record<string, string[]> = {};
        activities.map((r) => r.data).filter((d) => d?.kind === "subject_config").forEach((d) => { const student = assigned.find((s) => s.id === d.studentId); if (student) subjects[student.username] = d.subjects || []; });
        setStudentSubjects(subjects);
        const cfg = settings.map((r) => r.data).find((d) => d?.kind === "english_config" && assigned.some((s) => s.id === d.studentId));
        if (cfg) { const student = assigned.find((s) => s.id === cfg.studentId); setEnglishConfig({ ...cfg.config, studentUsername: student?.username || "" }); }
        const sc = progress.map((r) => r.data).find((d) => d?.module === "skillcoins" && assigned.some((s) => s.id === d.studentId));
        if (sc?.scores) setStudentSC({ estudios: Number(sc.scores.estudios) || 0, compromiso: Number(sc.scores.compromiso) || 0, organizacion: Number(sc.scores.organizacion) || 0, bienestar: Number(sc.scores.bienestar) || 0 });
      } catch (error) { console.error("No se pudieron cargar los alumnos asignados.", error); }
    };
    void loadAssignedStudents();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let pool = ENGLISH_A1_DATABASE;

    if (englishConfig.selectedUnits.length > 0) {
      pool = pool.filter((q) => englishConfig.selectedUnits.includes(q.unit));
    }

    if (englishConfig.selectedCategory !== "Todas") {
      pool = pool.filter((q) => q.category === englishConfig.selectedCategory);
    }

    if (englishConfig.difficulty !== "todas") {
      pool = pool.filter((q) => q.difficulty === englishConfig.difficulty);
    }

    setPreviewQuestions(pool.slice(0, englishConfig.questionCount));
  }, [englishConfig]);

  const handleToggleSubject = async (subjectId: string) => {
    const student = students.find((item) => item.username === selectedStudent);
    if (!student) { setSavedMsg("No tienes alumnos asignados todavía."); return; }
    const current = studentSubjects[selectedStudent] || [];
    const updated = current.includes(subjectId) ? current.filter((id) => id !== subjectId) : [...current, subjectId];
    setStudentSubjects((previous) => ({ ...previous, [selectedStudent]: updated }));
    try { await saveKiruRecord("activity", `subject_config_${student.id}`, { kind: "subject_config", studentId: student.id, subjects: updated }); setSavedMsg("Asignaturas guardadas en el sistema."); }
    catch { setSavedMsg("No se pudieron guardar las asignaturas."); }
  };

  const handleSendSubjectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;
    const targets = msgTarget === "todos" ? students : students.filter((student) => student.username === msgTarget);
    if (!targets.length) { setSavedMsg("No hay alumnos asignados a los que enviar el mensaje."); return; }
    try {
      for (const student of targets) await saveKiruRecord("message", `mentor_message_${Date.now()}_${student.id}`, { studentId: student.id, studentUsername: student.username, subjectId: msgSubject, text: msgText.trim(), link: msgLink.trim() || undefined, date: new Date().toISOString() }, student.id);
      setMsgText(""); setMsgLink(""); setSavedMsg("Recomendación guardada y enviada a los alumnos seleccionados.");
    } catch { setSavedMsg("No se pudo guardar el mensaje. Comprueba la asignación y los permisos."); }
  };

  const handleCreateBulkFlashcards = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    const targets = bulkTarget === "todos" ? students : students.filter((student) => student.username === bulkTarget);
    if (!targets.length) { setSavedMsg("Selecciona un alumno asignado."); return; }
    const lines = bulkText.split("\\n").filter((line) => line.trim());
    const cards = lines.map((line) => { let parts = line.split(":"); if (parts.length < 2) parts = line.split(" - "); return parts.length >= 2 ? { term: parts[0].trim(), definition: parts.slice(1).join(":").trim() } : null; }).filter((card): card is { term: string; definition: string } => !!card?.term && !!card.definition);
    if (!cards.length) { alert("Usa el formato: Término - Definición (un concepto por línea)"); return; }
    try {
      for (const student of targets) for (const [index, card] of cards.entries()) await saveKiruRecord("activity", `flashcard_${Date.now()}_${student.id}_${index}`, { kind: "flashcard", id: `${Date.now()}_${index}`, studentId: student.id, category: bulkCategory, ...card }, student.id);
      setBulkText(""); setSavedMsg(`Se han guardado ${cards.length * targets.length} flashcards en Supabase.`);
    } catch { setSavedMsg("No se pudieron guardar las flashcards."); }
  };

  const handleSaveEnglishConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find((item) => item.username === selectedStudent);
    if (!student) { setSavedMsg("No tienes alumnos asignados todavía."); return; }
    try { await saveKiruRecord("activity", `english_config_${student.id}`, { kind: "english_config", studentId: student.id, config: englishConfig }, student.id); setSavedMsg("Configuración de Inglés A1 guardada en Supabase."); }
    catch { setSavedMsg("No se pudo guardar la configuración de Inglés A1."); }
  };

  const handleUpdateSC = async (field: "estudios" | "compromiso" | "organizacion" | "bienestar", val: number) => {
    const student = students.find((item) => item.username === selectedStudent);
    if (!student) { setSavedMsg("No tienes alumnos asignados todavía."); return; }
    const updated = { ...studentSC, [field]: Math.max(0, Math.min(10, val)) };
    setStudentSC(updated);
    try { await saveKiruRecord("progress", `skillcoins_${student.id}`, { module: "skillcoins", studentId: student.id, scores: updated, updatedAt: new Date().toISOString() }, student.id); setSavedMsg("SkillCoins guardadas en Supabase."); }
    catch { setSavedMsg("No se pudieron guardar las SkillCoins."); }
  };

  const availableUnits = Array.from(new Set(ENGLISH_A1_DATABASE.map((q) => q.unit)));

  if (authChecking) return <main className="min-h-screen flex items-center justify-center text-sm text-[#77736B]">Comprobando permisos…</main>;
  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#343330] font-sans pb-16">
      <header className="bg-white border-b border-[#E7E3DC] px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#242321] text-white flex items-center justify-center font-serif font-bold">
            M
          </div>
          <div>
            <h1 className="font-serif text-lg sm:text-xl text-[#292825] font-bold">Espacio del mentor</h1>
            <p className="text-[11px] text-[#77736B]">Planificación, recursos y seguimiento individual</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://calculalo.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F3F0EA] text-[#45433F] text-xs font-semibold hover:bg-slate-200 transition shadow-xs"
          >
            <span>Calcúlalo</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#77736B]" />
          </a>

          <Link
            href="/"
            title="Cerrar sesión"
            className="p-2 sm:p-2 rounded-xl bg-[#242321] text-white hover:bg-[#3A3835] transition shadow-xs flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E7E3DC] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#77736B]" />
            <span className="text-xs font-bold text-[#555149] uppercase tracking-wider">Alumno seleccionado:</span>
          </div>

          <div className="flex gap-2">
            {students.length === 0 ? <p className="text-xs text-[#77736B] py-2">No tienes alumnos asignados todavía.</p> : students.map((s) => (
              <button
                key={s.username}
                onClick={() => setSelectedStudent(s.username)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs ${
                  selectedStudent === s.username
                    ? "bg-[#242321] text-white"
                    : "bg-[#FAF8F5] text-[#555149] border border-[#E7E3DC] hover:bg-[#F3F0EA]"
                }`}
              >
                {s.name} (@{s.username})
              </button>
            ))}
          </div>
        </div>

        {savedMsg && (
          <div className="p-3.5 rounded-2xl bg-[#F3EEE5] border border-[#E4D8C5] text-[#806C50] text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#806C50]" />
            <span>{savedMsg}</span>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#E7E3DC] p-1.5 flex flex-wrap gap-2 w-fit shadow-xs text-xs font-semibold">
          <button
            onClick={() => setActiveTab("asignaturas")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
              activeTab === "asignaturas" ? "bg-[#242321] text-white shadow-xs" : "text-[#6D6962] hover:bg-[#FAF8F5]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Selección de Asignaturas</span>
          </button>
          <button
            onClick={() => setActiveTab("envio_recursos")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
              activeTab === "envio_recursos" ? "bg-[#242321] text-white shadow-xs" : "text-[#6D6962] hover:bg-[#FAF8F5]"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Asignaturas (Enviar Recursos)</span>
          </button>
          <button
            onClick={() => setActiveTab("flashcards")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
              activeTab === "flashcards" ? "bg-[#242321] text-white shadow-xs" : "text-[#6D6962] hover:bg-[#FAF8F5]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Generar Flashcards</span>
          </button>
          <button
            onClick={() => setActiveTab("ingles")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
              activeTab === "ingles" ? "bg-[#242321] text-white shadow-xs" : "text-[#6D6962] hover:bg-[#FAF8F5]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Motor de Inglés A1</span>
          </button>
          <button
            onClick={() => setActiveTab("skillcoins")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
              activeTab === "skillcoins" ? "bg-[#242321] text-white shadow-xs" : "text-[#6D6962] hover:bg-[#FAF8F5]"
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>SkillCoins & Gráficas</span>
          </button>
        </div>

        {activeTab === "asignaturas" && (
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-6">
            <div>
              <h2 className="text-xl font-serif text-[#292825] font-bold">Asignaturas Visibles para @{selectedStudent}</h2>
              <p className="text-xs text-[#77736B] mt-1">
                Activa solo las asignaturas que cursa este alumno para evitar materias innecesarias en su panel.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ALL_SUBJECTS.map((sub) => {
                const isSelected = (studentSubjects[selectedStudent] || []).includes(sub.id);
                return (
                  <div
                    key={sub.id}
                    onClick={() => handleToggleSubject(sub.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                      isSelected
                        ? "bg-[#F3EEE5]/60 border-[#D9C8AE] text-[#4A4032] font-bold"
                        : "bg-[#FAF8F5] border-[#E7E3DC] text-[#6D6962] hover:border-slate-300 font-medium"
                    }`}
                  >
                    <span className="text-xs">{sub.name}</span>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="rounded text-[#806C50] focus:ring-0 cursor-pointer pointer-events-none"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "envio_recursos" && (
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-5 animate-in fade-in duration-150">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C50] bg-[#F3EEE5] px-2.5 py-0.5 rounded-full border border-[#E4D8C5]">
                Sección Asignaturas
              </span>
              <h2 className="text-xl font-serif text-[#292825] font-bold mt-1.5">
                Enviar Recomendaciones y Enlaces por Asignatura
              </h2>
              <p className="text-xs text-[#77736B]">
                Escribe una recomendación y adjunta un enlace para que aparezca en el espacio de la asignatura del alumno.
              </p>
            </div>

            <form onSubmit={handleSendSubjectMessage} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B] mb-1">
                    Asignatura
                  </label>
                  <select
                    value={msgSubject}
                    onChange={(e) => setMsgSubject(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-xl text-xs font-semibold text-[#45433F] focus:outline-none"
                  >
                    {ALL_SUBJECTS.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B] mb-1">
                    Enviar a
                  </label>
                  <select
                    value={msgTarget}
                    onChange={(e) => setMsgTarget(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-xl text-xs font-semibold text-[#45433F] focus:outline-none"
                  >
                    <option value="todos">Todos los alumnos</option>
                    {STUDENTS.map((s) => (
                      <option key={s.username} value={s.username}>{s.name} (@{s.username})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B] mb-1">
                  Mensaje / Recomendación Pedagógica
                </label>
                <textarea
                  rows={3}
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  placeholder="Ej: Mira este vídeo sobre el relieve peninsular..."
                  className="w-full p-3 bg-[#FAF8F5] border border-[#E7E3DC] rounded-2xl text-xs text-[#45433F] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B] mb-1">
                  Enlace externo o recurso (Opcional)
                </label>
                <input
                  type="url"
                  value={msgLink}
                  onChange={(e) => setMsgLink(e.target.value)}
                  placeholder="https://youtube.com/..."
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-xl text-xs text-[#45433F] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 bg-[#242321] text-white rounded-xl text-xs font-bold hover:bg-[#3A3835] transition flex items-center gap-2 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Publicar en la asignatura del alumno</span>
              </button>
            </form>
          </div>
        )}

        {activeTab === "flashcards" && (
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-5">
            <div>
              <h2 className="text-xl font-serif text-[#292825] font-bold">Generador Masivo de Flashcards</h2>
              <p className="text-xs text-[#77736B] mt-1">
                Pega una lista de conceptos y definiciones para generar tarjetas de golpe.
              </p>
            </div>

            <form onSubmit={handleCreateBulkFlashcards} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B] mb-1">
                    Asignatura de las tarjetas
                  </label>
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-xl text-xs font-semibold"
                  >
                    <option value="Geografía">Geografía</option>
                    <option value="Historia">Historia</option>
                    <option value="Física">Física y Química</option>
                    <option value="Lengua">Lengua</option>
                    <option value="Inglés">Inglés</option>
                    <option value="Biología">Biología</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B] mb-1">
                    Enviar a
                  </label>
                  <select
                    value={bulkTarget}
                    onChange={(e) => setBulkTarget(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-xl text-xs font-semibold"
                  >
                    <option value="todos">Todos los alumnos</option>
                    {STUDENTS.map((s) => (
                      <option key={s.username} value={s.username}>
                        {s.name} (@{s.username})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B] mb-1">
                  Lista de conceptos (Formato: Concepto - Definición)
                </label>
                <textarea
                  rows={7}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`Meseta: Planicie extensa...\nDelta: Terreno comprendido...`}
                  className="w-full p-3 bg-[#FAF8F5] border border-[#E7E3DC] rounded-2xl text-xs font-mono text-[#45433F] leading-relaxed focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                className="px-6 py-3 bg-[#242321] text-white rounded-xl text-xs font-semibold hover:bg-[#3A3835] transition flex items-center gap-2 shadow-xs"
              >
                <Plus className="w-4 h-4" /> Generar y Enviar Flashcards a los Alumnos
              </button>
            </form>
          </div>
        )}

        {activeTab === "ingles" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleSaveEnglishConfig} className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-5">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#555149]" />
                <h3 className="font-serif text-base text-[#292825] font-bold">Configuración de Ejercicios A1</h3>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#77736B] block">
                  Nivel de Dificultad
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {[
                    { id: "facil", label: "Fácil" },
                    { id: "medio", label: "Medio" },
                    { id: "desafiante", label: "Desafío" },
                    { id: "todas", label: "Mixto" }
                  ].map((d) => (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => setEnglishConfig({ ...englishConfig, difficulty: d.id as any })}
                      className={`py-2 rounded-xl font-bold transition border ${
                        englishConfig.difficulty === d.id
                          ? "bg-[#242321] text-white border-slate-900"
                          : "bg-[#FAF8F5] text-[#555149] border-[#E7E3DC] hover:bg-[#F3F0EA]"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-bold uppercase tracking-wider text-[#77736B] text-[11px]">
                    Cantidad de Ejercicios
                  </label>
                  <span className="font-bold text-[#292825]">{englishConfig.questionCount} ejercicios</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={englishConfig.questionCount}
                  onChange={(e) => setEnglishConfig({ ...englishConfig, questionCount: Number(e.target.value) })}
                  className="w-full accent-slate-900 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#77736B] block">
                  Área de Ejercicios
                </label>
                <select
                  value={englishConfig.selectedCategory}
                  onChange={(e) => setEnglishConfig({ ...englishConfig, selectedCategory: e.target.value })}
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-xl text-xs font-semibold text-[#45433F]"
                >
                  <option value="Todas">Todas las áreas</option>
                  <option value="Grammar">Gramática</option>
                  <option value="Vocabulary">Vocabulario temático</option>
                  <option value="Everyday English">Inglés funcional y cotidiano</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#77736B] block">
                  Unidades Curriculares A1
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {availableUnits.map((unit) => {
                    const isChecked = englishConfig.selectedUnits.includes(unit);
                    return (
                      <label
                        key={unit}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] text-xs font-medium cursor-pointer hover:bg-[#F3F0EA] transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const updated = isChecked
                              ? englishConfig.selectedUnits.filter((u) => u !== unit)
                              : [...englishConfig.selectedUnits, unit];
                            setEnglishConfig({ ...englishConfig, selectedUnits: updated });
                          }}
                          className="rounded text-[#292825] focus:ring-0"
                        />
                        <span className="text-[#45433F]">{unit}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#242321] text-white rounded-xl text-xs font-semibold hover:bg-[#3A3835] transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Save className="w-4 h-4" /> Asignar Tanda de Ejercicios al Alumno
              </button>
            </form>

            <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#806C50]" />
                <h3 className="font-serif text-base text-[#292825] font-bold">
                  Previsualización ({previewQuestions.length} ejercicios)
                </h3>
              </div>
              <p className="text-xs text-[#77736B]">
                Así verá los ejercicios el alumno en su panel:
              </p>

              <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                {previewQuestions.map((q, idx) => (
                  <div key={q.id} className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E7E3DC] space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-[10px] text-[#8D887F] font-bold uppercase">
                      <span>{q.category} · {q.difficulty}</span>
                      <span className="text-[#806C50] bg-[#F3EEE5] px-2 py-0.5 rounded-full border border-[#E4D8C5]">
                        {q.unit.split(":")[0]}
                      </span>
                    </div>

                    <p className="font-semibold text-[#45433F]">
                      {idx + 1}. {q.question}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {q.options?.map((opt: string, i: number) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-white border border-[#E7E3DC] text-[11px] text-[#6D6962]">
                          {opt}
                        </span>
                      ))}
                    </div>

                    <span className="text-[10px] text-[#8D887F] block pt-1">
                      Respuesta esperada: <strong className="text-[#6D6962]">{q.answer}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "skillcoins" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-[#EEEAE3] pb-3">
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#292825]">
                    Editar SkillCoins de @{selectedStudent}
                  </h3>
                  <p className="text-xs text-[#77736B]">Puntúa semanalmente de 0 a 10 cada categoría tras la sesión.</p>
                </div>
                <span className="text-[10px] text-[#8D887F] font-semibold">Actualizado</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["estudios", "compromiso", "organizacion", "bienestar"] as const).map((cat) => (
                  <div key={cat} className="p-3.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-2xl space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#77736B] block capitalize">{cat}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={studentSC[cat]}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateSC(cat, parseInt(e.target.value) || 0)}
                        className="w-16 p-2 bg-white border border-[#E7E3DC] rounded-xl text-center text-sm font-bold text-[#45433F]"
                      />
                      <span className="text-xs text-[#8D887F] font-semibold">/ 10 SC</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
              <SkillCoinsChart />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}