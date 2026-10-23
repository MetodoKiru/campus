"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  History, 
  BarChart3, 
  BookOpen, 
  Calculator, 
  Eye, 
  FileText, 
  ArrowLeft,
  Calendar
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function StudentDetailMentorPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("inicio");
  const [logs, setLogs] = useState<any[]>([]);

  // Estados para Asignar Tarea (Gateway)
  const [level, setLevel] = useState("A1");
  const [unit, setUnit] = useState("Unit 1 - Personal Information");
  const [type, setType] = useState("Vocabulary");
  const [difficulty, setDifficulty] = useState("Media");
  const [numExercises, setNumExercises] = useState(10);
  const [assignedSuccess, setAssignedSuccess] = useState(false);

  useEffect(() => {
    async function loadLogs() {
      const { data } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("student_username", "carmen")
        .order("created_at", { ascending: false });

      setLogs(data ?? []);
    }
    loadLogs();
  }, []);

  const handleAssignTask = (e: React.FormEvent) => {
    e.preventDefault();
    setAssignedSuccess(true);
    setTimeout(() => setAssignedSuccess(false), 3000);
  };

  return (
    <div className="min-h-screen bg-kiru-bg pb-12">
      {/* Cabecera superior */}
      <header className="bg-kiru-card border-b border-kiru-border px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link 
            href="/mentor" 
            className="p-2 rounded-xl bg-[#F7F6F3] border border-kiru-border text-kiru-muted hover:text-kiru-text transition-colors flex items-center gap-1 text-xs font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a alumnos
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-kiru-forest-light text-kiru-forest font-serif font-bold text-sm flex items-center justify-center">
              C
            </div>
            <div>
              <h1 className="font-serif text-lg text-kiru-text">Carmen</h1>
              <span className="text-[10px] font-semibold tracking-wider uppercase text-kiru-forest">Nivel: Explorador</span>
            </div>
          </div>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.replace("/"); }} className="text-xs font-semibold text-red-500 hover:underline">
          Cerrar sesión
        </button>
      </header>

      {/* Barra de navegación superior horizontal */}
      <div className="bg-kiru-card border-b border-kiru-border px-6">
        <nav className="max-w-4xl mx-auto flex gap-2 overflow-x-auto py-2">
          {[
            { id: "inicio", label: "Inicio", icon: History },
            { id: "estadisticas", label: "Estadísticas", icon: BarChart3 },
            { id: "asignar", label: "Asignar tarea", icon: BookOpen },
            { id: "calculalo", label: "Calcúlalo", icon: Calculator },
            { id: "memiro", label: "MeMiro", icon: Eye },
            { id: "informe", label: "Asignar informe", icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-kiru-forest-light text-kiru-forest font-semibold"
                    : "text-kiru-muted hover:text-kiru-text hover:bg-black/5"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <main className="max-w-4xl mx-auto p-6">
        {/* PESTAÑA: INICIO / HISTORIAL */}
        {activeTab === "inicio" && (
          <div className="space-y-4">
            <div className="bg-kiru-card rounded-3xl p-6 border border-kiru-border shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-kiru-forest" />
                <h2 className="font-serif text-lg text-kiru-text">Historial cronológico de actividad</h2>
              </div>
              <p className="text-xs text-kiru-muted mb-6">Registro detallado de accesos y ejercicios completados por el alumno.</p>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-kiru-forest">Hoy</p>
                <div className="border-l-2 border-kiru-forest-light ml-2 pl-4 space-y-4">
                  {logs.length ? logs.map((log, idx) => (
                    <div key={log.id ?? idx} className="relative text-xs">
                      <span className="font-semibold text-kiru-forest mr-2">
                        {log.created_at?.slice(11, 16) || "—"} —
                      </span>
                      <span className="text-kiru-text">{log.action_text}</span>
                    </div>
                  )) : <p className="text-xs text-kiru-muted">Todavía no hay actividad registrada.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA: ESTADÍSTICAS */}
        {activeTab === "estadisticas" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-kiru-card p-6 rounded-3xl border border-kiru-border shadow-sm text-center">
                <p className="text-xs uppercase font-semibold text-kiru-muted mb-2">SkillCoins</p>
                <p className="font-serif text-4xl text-kiru-text font-bold">—</p>
              </div>
              <div className="bg-kiru-card p-6 rounded-3xl border border-kiru-border shadow-sm text-center">
                <p className="text-xs uppercase font-semibold text-kiru-muted mb-2">Actividades Realizadas</p>
                <p className="font-serif text-4xl text-kiru-text font-bold">—</p>
              </div>
              <div className="bg-kiru-card p-6 rounded-3xl border border-kiru-border shadow-sm text-center">
                <p className="text-xs uppercase font-semibold text-kiru-muted mb-2">Precisión Media</p>
                <p className="font-serif text-4xl text-kiru-text font-bold">—</p>
              </div>
            </div>

            <div className="bg-kiru-card p-6 rounded-3xl border border-kiru-border shadow-sm">
              <h3 className="font-serif text-base text-kiru-text mb-2">Evolución académica</h3>
              <p className="text-xs text-kiru-muted">
                Estructura preparada para gráficos de rendimiento y áreas de refuerzo pedagógico.
              </p>
            </div>
          </div>
        )}

        {/* PESTAÑA: ASIGNAR TAREA (MOTOR GATEWAY) */}
        {activeTab === "asignar" && (
          <div className="bg-kiru-card rounded-3xl p-6 border border-kiru-border shadow-sm space-y-6">
            <div>
              <h2 className="font-serif text-xl text-kiru-text">Motor Curricular de Inglés (Gateway)</h2>
              <p className="text-xs text-kiru-muted mt-1">
                Generador automático de actividades alineado con el currículo oficial.
              </p>
            </div>

            {assignedSuccess && (
              <div className="p-3 bg-kiru-forest-light text-kiru-forest rounded-xl text-xs font-semibold text-center">
                ¡Actividad generada y asignada correctamente a Carmen!
              </div>
            )}

            <form onSubmit={handleAssignTask} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-kiru-muted uppercase mb-1">Nivel MCER</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#F7F6F3] border border-kiru-border text-xs outline-none"
                  >
                    <option value="A1">Gateway A1</option>
                    <option value="A2">Gateway A2</option>
                    <option value="B1">Gateway B1</option>
                    <option value="B2">Gateway B2</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-kiru-muted uppercase mb-1">Unidad Oficial</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#F7F6F3] border border-kiru-border text-xs outline-none"
                  >
                    <option value="Unit 1 - Personal Information">Unit 1 · Personal Information</option>
                    <option value="Unit 2 - Daily Life">Unit 2 · Daily Life</option>
                    <option value="Unit 3 - Food">Unit 3 · Food</option>
                    <option value="Unit 4 - Free Time">Unit 4 · Free Time</option>
                    <option value="Unit 5 - Home">Unit 5 · Home</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-kiru-muted uppercase mb-1">Bloque / Habilidad</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#F7F6F3] border border-kiru-border text-xs outline-none"
                  >
                    <option value="Vocabulary">Vocabulary</option>
                    <option value="Grammar">Grammar</option>
                    <option value="Reading">Reading</option>
                    <option value="Listening">Listening</option>
                    <option value="Writing">Writing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-kiru-muted uppercase mb-1">Dificultad</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#F7F6F3] border border-kiru-border text-xs outline-none"
                  >
                    <option value="Baja">Baja</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-kiru-muted uppercase mb-1">Nº de Ejercicios</label>
                  <select
                    value={numExercises}
                    onChange={(e) => setNumExercises(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl bg-[#F7F6F3] border border-kiru-border text-xs outline-none"
                  >
                    <option value={10}>10 ejercicios</option>
                    <option value={15}>15 ejercicios</option>
                    <option value={20}>20 ejercicios</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-3 bg-kiru-forest text-white rounded-xl text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  Asignar Actividad
                </button>
                <button
                  type="button"
                  className="px-6 py-3 bg-[#F7F6F3] border border-kiru-border text-kiru-text rounded-xl text-xs font-medium hover:bg-black/5 transition-colors"
                >
                  Previsualizar actividad
                </button>
              </div>
            </form>
          </div>
        )}

        {/* PESTAÑA: CALCÚLALO */}
        {activeTab === "calculalo" && (
          <div className="bg-kiru-card rounded-3xl p-6 border border-kiru-border shadow-sm space-y-4">
            <h2 className="font-serif text-xl text-kiru-text">Acceso de Profesor a Calcúlalo</h2>
            <p className="text-xs text-kiru-muted">
              Instrucciones para gestionar las sesiones de cálculo mental de tus alumnos:
            </p>
            <ol className="list-decimal list-inside text-xs text-kiru-text space-y-2 bg-[#F7F6F3] p-4 rounded-2xl border border-kiru-border">
              <li>Haz clic en el enlace inferior.</li>
              <li>Selecciona la opción <strong>«Acceder como profesor»</strong>.</li>
              <li>Introduce tus credenciales de mentor.</li>
            </ol>
            <a
              href="https://calculalo.es"
              target="_blank"
              rel="noreferrer"
              className="inline-block px-6 py-3 bg-kiru-forest text-white rounded-xl text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Acceder a Calcúlalo (Profesor)
            </a>
          </div>
        )}

        {/* PESTAÑA: MEMIRO */}
        {activeTab === "memiro" && (
          <div className="bg-kiru-card rounded-3xl p-6 border border-kiru-border shadow-sm space-y-4">
            <h2 className="font-serif text-xl text-kiru-text">Acceso a MeMiro</h2>
            <p className="text-xs text-kiru-muted">
              Plataforma de seguimiento y autoevaluación:
            </p>
            <ol className="list-decimal list-inside text-xs text-kiru-text space-y-2 bg-[#F7F6F3] p-4 rounded-2xl border border-kiru-border">
              <li>Haz clic en el enlace a MeMiro.</li>
              <li>Accede con tu usuario de mentor vinculado.</li>
            </ol>
            <a
              href="https://memiro.es"
              target="_blank"
              rel="noreferrer"
              className="inline-block px-6 py-3 bg-kiru-forest text-white rounded-xl text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Acceder a MeMiro
            </a>
          </div>
        )}

        {/* PESTAÑA: ASIGNAR INFORME */}
        {activeTab === "informe" && (
          <div className="bg-kiru-card rounded-3xl p-6 border border-kiru-border shadow-sm text-center py-12">
            <FileText className="w-8 h-8 text-kiru-muted mx-auto mb-3" />
            <h2 className="font-serif text-xl text-kiru-text mb-1">Módulo de Informes</h2>
            <p className="text-xs text-kiru-muted max-w-sm mx-auto">
              Esta sección queda preparada para desarrollar el sistema automatizado de informes pedagógicos en los próximos sprints.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}