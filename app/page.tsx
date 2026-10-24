"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Eye, EyeOff, KeyRound, X } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoverOpen, setIsRecoverOpen] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No se ha podido iniciar sesión. Inténtalo de nuevo."
        );
      }

      if (
        !result.session?.access_token ||
        !result.session?.refresh_token ||
        !result.user?.id
      ) {
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

      const validRoles = ["alumno", "mentor", "padre", "formador", "admin"];
      if (!validRoles.includes(profile.role)) {
        await supabase.auth.signOut();
        throw new Error("El perfil no tiene un rol válido. Contacta con administración.");
      }

      if (profile.role === "alumno") router.push("/alumno");
      else if (profile.role === "mentor") router.push("/mentor");
      else if (profile.role === "padre") router.push("/padre");
      else if (profile.role === "formador") router.push("/formador");
      else if (profile.role === "admin") router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ha ocurrido un error. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F3EFE6] px-4 py-10 text-[#292D27]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(226,218,200,0.35),_transparent_58%)]" />

      <section className="relative w-full max-w-md rounded-[2rem] border border-[#E5DED0] bg-[#FBF9F4] p-7 shadow-[0_18px_55px_rgba(67,58,42,0.08)] sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 font-serif text-xl font-bold text-white shadow-md">
            K
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">
            Método Kiru
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-900">
            Acceso al Campus
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Introduce tus credenciales para continuar.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="kiru-username" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Usuario
            </label>
            <input
              id="kiru-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tu nombre de usuario"
              className="w-full rounded-xl border border-slate-200 bg-[#F7F3EB] px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"
              required
            />
          </div>

          <div>
            <label htmlFor="kiru-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="kiru-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                className="w-full rounded-xl border border-slate-200 bg-[#FCFBF8] px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsRecoverOpen(true)}
              className="text-xs font-medium text-slate-500 underline-offset-4 transition hover:text-emerald-800 hover:underline"
            >
              ¿Has olvidado tu contraseña?
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-slate-900/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Comprobando acceso…" : "Entrar al Campus"}
            {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="mt-7 text-center text-xs leading-5 text-slate-400">
          Acceso privado para alumnos, familias, mentores y formadores.
        </p>
      </section>

      {isRecoverOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsRecoverOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="recover-title"
            className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-emerald-800" />
                <h2 id="recover-title" className="font-serif text-lg font-bold text-slate-900">
                  Recuperar acceso
                </h2>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setIsRecoverOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Para restablecer tu contraseña, contacta con la persona que administra el Campus Kiru.
            </p>
            <button
              type="button"
              onClick={() => setIsRecoverOpen(false)}
              className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Entendido
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
