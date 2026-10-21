"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { 
  Eye, 
  EyeOff, 
  KeyRound, 
  ArrowRight, 
  X, 
  MessageCircle, 
  Sparkles, 
  CheckCircle2, 
  BookOpen, 
  Layers, 
  Award,
  MapPin,
  HelpCircle,
  Users
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isRecoverOpen, setIsRecoverOpen] = useState(false);
  const [recoverFullName, setRecoverFullName] = useState("");
  const [recoveredPass, setRecoveredPass] = useState<string | null>(null);
  const [recoverError, setRecoverError] = useState("");

  const officialPhone = "34651382833";
  const whatsappMessage = encodeURIComponent("Hola, me gustaría más información sobre Método Kiru");
  const whatsappUrl = `https://wa.me/${officialPhone}?text=${whatsappMessage}`;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No se ha podido iniciar sesión."
        );
      }

      if (!result.session?.access_token || !result.session?.refresh_token || !result.user?.id) {
        throw new Error("La respuesta de acceso no es válida. Contacta con administración.");
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (sessionError) {
        throw new Error("No se ha podido iniciar la sesión. Inténtalo de nuevo.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_active")
        .eq("id", result.user.id)
        .single();

      if (profileError || !profile || !profile.is_active) {
        await supabase.auth.signOut();
        throw new Error("La cuenta está inactiva o no tiene un perfil válido. Contacta con administración.");
      }

      const validRoles = ["alumno", "mentor", "padre", "admin"];
      if (!validRoles.includes(profile.role)) {
        await supabase.auth.signOut();
        throw new Error("El perfil no tiene un rol válido. Contacta con administración.");
      }

      // Keep only the minimum profile data in localStorage. Never store passwords or tokens there.
      localStorage.setItem("kiru_current_user", JSON.stringify({
        id: profile.id,
        name: profile.full_name,
        username: username.trim().toLowerCase(),
        role: profile.role,
      }));

      if (profile.role === "alumno") router.push("/alumno");
      else if (profile.role === "mentor") router.push("/mentor");
      else if (profile.role === "padre") router.push("/padre");
      else if (profile.role === "admin") router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ha ocurrido un error. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecover = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveredPass(null);
    setRecoverError("La recuperación segura de contraseña estará disponible próximamente. Contacta con administración para restablecer tu acceso.");
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1E293B] font-sans flex flex-col justify-between selection:bg-slate-200 text-xs sm:text-sm">
      
      {/* Barra superior con navegación */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center font-serif font-bold text-xs shadow-xs">
            K
          </div>
          <span className="font-serif text-base text-slate-900 font-bold">Método Kiru</span>
        </div>

        <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-600">
          <a href="#" className="hover:text-slate-900 transition">Inicio</a>
          <a href="#programas" className="hover:text-slate-900 transition">Programas</a>
          <a href="#tarifas" className="hover:text-slate-900 transition">Tarifas</a>
          <a href="#equipo" className="hover:text-slate-900 transition">Nuestro equipo</a>
          <a href="#faq" className="hover:text-slate-900 transition">FAQ</a>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition shadow-xs"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
            <span>WhatsApp</span>
          </a>

          <a
            href="#campus"
            className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-xs"
          >
            Acceso Campus
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* HERO SECTION CON EL NUEVO TÍTULO Y COBERTURA */}
        <div className="bg-white p-6 sm:p-10 rounded-3xl border border-slate-200 shadow-xs space-y-5 text-center">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
            <span>Mentoría Pedagógica y Técnicas de Estudio a Domicilio</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif text-slate-900 font-normal max-w-3xl mx-auto leading-[1.15] tracking-tight">
            Autonomía, hábitos y excelencia escolar.
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Acompañamiento individualizado en el hogar para estudiantes de Primaria, ESO y Bachillerato. Desarrollamos autogestión, estructura de trabajo y seguimiento continuado con las familias.
          </p>

          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-1 flex items-center justify-center gap-2 flex-wrap">
            <span className="text-emerald-800">COBERTURA:</span>
            <span>Pozuelo de Alarcón</span>
            <span>·</span>
            <span>Aravaca</span>
            <span>·</span>
            <span>Valdemarín</span>
            <span>·</span>
            <span>Chamberí</span>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-6 py-3 bg-emerald-700 text-white rounded-full text-xs font-semibold hover:bg-emerald-800 transition shadow-xs"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Contactar por WhatsApp</span>
            </a>
            <a
              href="#programas"
              className="px-6 py-3 bg-slate-100 text-slate-800 border border-slate-200 rounded-full text-xs font-semibold hover:bg-slate-200 transition shadow-xs"
            >
              Ver Programas
            </a>
          </div>
        </div>

        {/* PROGRAMAS / CARACTERÍSTICAS */}
        <div id="programas" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-2">
            <BookOpen className="w-4 h-4 text-blue-700" />
            <h3 className="font-serif text-base text-slate-900 font-bold">1.1. Asignaturas</h3>
            <p className="text-xs text-slate-500">Geografía, Historia, Física y recursos didácticos específicos.</p>
          </div>

          <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-2">
            <Layers className="w-4 h-4 text-emerald-800" />
            <h3 className="font-serif text-base text-slate-900 font-bold">Flashcards</h3>
            <p className="text-xs text-slate-500">Práctica contrarreloj y memorización activa por materias.</p>
          </div>

          <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-2">
            <Award className="w-4 h-4 text-amber-700" />
            <h3 className="font-serif text-base text-slate-900 font-bold">SkillCoins</h3>
            <p className="text-xs text-slate-500">Evaluación de hábitos, organización y bienestar semanal.</p>
          </div>
        </div>

        {/* TARIFAS */}
        <section id="tarifas" className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="text-center space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Planes y Precios</span>
            <h2 className="text-xl font-serif text-slate-900 font-bold">Tarifas Transparentes</h2>
            <p className="text-xs text-slate-500">Sesiones a domicilio con acompañamiento pedagógico individualizado.</p>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between">
            <span className="font-semibold">📦 Welcome Pack obligatorio (3 libros + material Método Kiru):</span>
            <span className="font-bold text-emerald-950 font-serif">25€</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-4 rounded-2xl border border-slate-200 bg-[#FAF8F5] space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Plan Foco</span>
              <div className="font-serif text-lg font-bold text-slate-900">30€ <span className="text-xs text-slate-400 font-sans">/ hora</span></div>
              <p className="text-[11px] text-slate-600">Apoyo académico específico y resolución de dudas puntuales.</p>
            </div>

            <div className="p-4 rounded-2xl border-2 border-slate-900 bg-white space-y-2 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-800 uppercase">Plan Hábito & Autonomía</span>
              <div className="font-serif text-lg font-bold text-slate-900">27€ <span className="text-xs text-slate-400 font-sans">/ hora</span></div>
              <p className="text-[11px] text-slate-600">Mentoría integral continuada, hábitos de estudio y reportes.</p>
            </div>
          </div>
        </section>

        {/* ACCESO AL CAMPUS VIRTUAL */}
        <section id="campus" className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4 max-w-md mx-auto w-full">
          <div className="text-center space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Área Privada</span>
            <h2 className="text-xl font-serif text-slate-900 font-bold">Plataforma Kiru</h2>
            <p className="text-xs text-slate-500">Inicia sesión con tus credenciales</p>
          </div>

          {error && (
            <div className="p-2.5 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ej: carmen, mentor, familia..."
                className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full p-2.5 pr-8 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsRecoverOpen(true);
                  setRecoveredPass(null);
                  setRecoverError("");
                }}
                className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-slate-900 disabled:opacity-60 text-white rounded-full text-xs font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>{isSubmitting ? "Comprobando…" : "Acceder"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </section>

      </main>

      {/* PIE DE PÁGINA */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400 space-y-1">
        <p className="font-semibold text-slate-600">©️2025 Método Kiru.</p>
        <p className="text-[11px]">Pozuelo, Las Rozas, Majadahonda, Aravaca, Boadilla y Centro.</p>
      </footer>

      {/* Modal de recuperación */}
      {isRecoverOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-800" />
                <h3 className="font-serif text-base text-slate-900 font-bold">Recuperar contraseña</h3>
              </div>
              <button onClick={() => setIsRecoverOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecover} className="space-y-3 text-xs">
              <input
                type="text"
                placeholder="Nombre y Apellidos"
                value={recoverFullName}
                onChange={(e) => setRecoverFullName(e.target.value)}
                className="w-full p-3 bg-[#FAF8F5] border border-slate-200 rounded-xl focus:outline-none"
                required
              />

              {recoveredPass && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-medium">
                  {recoveredPass}
                </div>
              )}

              {recoverError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl">
                  {recoverError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition"
              >
                Consultar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}