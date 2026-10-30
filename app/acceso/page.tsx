"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Eye, EyeOff } from "lucide-react";

type Step =
  | { kind: "checking" }
  | { kind: "invalid"; message: string }
  | { kind: "form"; fullName: string; username: string }
  | { kind: "done"; username: string };

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-[#FCFBF8] px-4 py-3 text-center font-mono text-lg tracking-[0.4em] outline-none transition placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10";

/**
 * «Crea tu PIN»: el mentor llega aquí desde el correo de bienvenida. El enlace
 * va detrás de «#», así que nunca viaja al servidor ni queda en los registros
 * de Vercel; esta página lo lee y lo manda a /api/acceso.
 */
export default function AccesoPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [step, setStep] = useState<Step>({ kind: "checking" });
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
    let cancelled = false;
    fetch("/api/acceso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: fromHash }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setStep({ kind: "invalid", message: typeof result.error === "string" ? result.error : "Este enlace no es válido." });
          return;
        }
        setToken(fromHash);
        setStep({ kind: "form", fullName: result.fullName, username: result.username });
      })
      .catch(() => {
        if (!cancelled) setStep({ kind: "invalid", message: "No hemos podido comprobar el enlace. Revisa tu conexión y vuelve a abrirlo." });
      });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || step.kind !== "form") return;
    setError("");
    if (pin !== pinAgain) {
      setError("Los dos PIN no coinciden.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 410) setStep({ kind: "invalid", message: result.error });
        else setError(typeof result.error === "string" ? result.error : "No se pudo guardar el PIN.");
        return;
      }
      window.history.replaceState(null, "", "/acceso");
      if (result.session?.access_token && result.session?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession(result.session);
        if (!sessionError) {
          router.push("/mentor");
          return;
        }
      }
      setStep({ kind: "done", username: result.username });
    } catch {
      setError("Ha ocurrido un error. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const firstName = step.kind === "form" ? step.fullName.split(" ")[0] : "";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F3EFE6] px-4 py-10 text-[#292D27]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(226,218,200,0.35),_transparent_58%)]" />

      <section className="relative w-full max-w-md rounded-[2rem] border border-[#E5DED0] bg-[#FBF9F4] p-7 shadow-[0_18px_55px_rgba(67,58,42,0.08)] sm:p-10">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 font-serif text-xl font-bold text-white shadow-md">
            K
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">Método Kiru</p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-900">
            {step.kind === "form" ? `¡Hola, ${firstName}!` : "Tu acceso al Campus"}
          </h1>
        </div>

        {step.kind === "checking" && <p className="text-center text-sm text-slate-500">Comprobando tu enlace…</p>}

        {step.kind === "invalid" && (
          <div className="space-y-5">
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              {step.message}
            </div>
            <Link href="/" className="block text-center text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline">
              Ya tengo PIN: ir a la entrada del Campus
            </Link>
          </div>
        )}

        {step.kind === "done" && (
          <div className="space-y-5 text-center text-sm leading-6 text-slate-600">
            <p>Tu PIN está guardado. Entra con tu usuario <strong className="font-mono text-slate-900">{step.username}</strong> y tu PIN.</p>
            <Link href="/" className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white">
              Ir a la entrada del Campus <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {step.kind === "form" && (
          <>
            <p className="mb-5 text-center text-sm leading-6 text-slate-500">
              Bienvenido/a al equipo. Solo te falta elegir tu PIN para entrar al Campus.
            </p>
            <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Tu usuario</p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900">{step.username}</p>
              <p className="mt-1 text-xs text-slate-500">Apúntalo: lo necesitarás con tu PIN cada vez que entres.</p>
            </div>

            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Para que el navegador guarde usuario y PIN juntos. */}
              <input type="text" name="username" autoComplete="username" value={step.username} readOnly hidden />
              <div>
                <label htmlFor="kiru-pin" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Elige un PIN de 6 números
                </label>
                <div className="relative">
                  <input
                    id="kiru-pin"
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className={inputClass}
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                    onClick={() => setShowPin((visible) => !visible)}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-slate-700"
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="kiru-pin-again" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Repite el PIN
                </label>
                <input
                  id="kiru-pin-again"
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={pinAgain}
                  onChange={(e) => setPinAgain(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  className={inputClass}
                  required
                />
              </div>
              <p className="text-xs leading-5 text-slate-500">No uses 123456, 000000 ni tu fecha de nacimiento.</p>
              <button
                type="submit"
                disabled={isSubmitting || pin.length !== 6 || pinAgain.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-slate-900/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Guardando…" : "Guardar PIN y entrar"}
                {!isSubmitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
