"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { STATUS_LABEL, type StepStatus } from "@/lib/mentor-steps";

type Notify = (text: string, type: "success" | "error") => void;
type Mentor = {
  id: string; name: string; username: string | null; onboardingComplete: boolean;
  steps: { certificado: StepStatus; nuestro_equipo: StepStatus; llamadas: StepStatus };
};
type Exception = { id: string; mentorId: string; reason: string; grantedBy: string; grantedAt: string; revokedAt: string | null; revokedBy: string; revokeReason: string };

const STEP_LABEL = { certificado: "Certificado", nuestro_equipo: "Nuestro Equipo", llamadas: "Llamadas" } as const;
const input = "w-full rounded-2xl border border-slate-200 bg-[#F7F6F3] p-3 text-xs text-slate-900 focus:outline-none";
const fmt = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

/**
 * Incorporación de mentores y autorizaciones excepcionales. Autorizar abre al
 * mentor «Reuniones con tu coordinador» y «Crece con Kiru» sin marcar ningún
 * paso como completado; queda registrado quién, cuándo y por qué.
 */
export default function AdminOnboardingExceptions({ notify }: { notify: Notify }) {
  const [data, setData] = useState<{ mentors: Mentor[]; exceptions: Exception[] } | null>(null);
  const [granting, setGranting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (init?: { method: string; body: unknown }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const response = await fetch("/api/admin/excepciones", {
      method: init?.method ?? "GET",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: init ? JSON.stringify(init.body) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Ha ocurrido un error.");
    return result;
  }, []);
  const load = useCallback(async () => {
    try { setData(await api()); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudieron cargar los mentores.", "error"); }
  }, [api, notify]);
  useEffect(() => {
    let alive = true;
    api()
      .then((result) => { if (alive) setData(result as { mentors: Mentor[]; exceptions: Exception[] }); })
      .catch((e) => { if (alive) notify(e instanceof Error ? e.message : "No se pudieron cargar los mentores.", "error"); });
    return () => { alive = false; };
  }, [api, notify]);

  const run = async (init: { method: string; body: unknown }, ok: string) => {
    setBusy(true);
    try { await api(init); await load(); notify(ok, "success"); return true; }
    catch (e) { notify(e instanceof Error ? e.message : "Ha ocurrido un error.", "error"); return false; }
    finally { setBusy(false); }
  };

  if (!data) return <p className="rounded-3xl border border-slate-100 bg-white p-5 text-sm text-slate-500">Cargando…</p>;

  return (
    <section className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="font-serif text-lg text-slate-900">Incorporación de mentores y autorizaciones</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          «Reuniones con tu coordinador» y «Crece con Kiru» aparecen en el menú ☰ del mentor cuando completa sus tres pasos de incorporación.
          Si quieres que un mentor acceda antes, autorízalo aquí con un motivo: sus pasos se quedan como están y la autorización queda registrada.
        </p>
      </div>
      {data.mentors.length === 0 && <p className="text-xs text-slate-500">No hay mentores activos.</p>}
      <div className="space-y-3">
        {data.mentors.map((m) => {
          const history = data.exceptions.filter((e) => e.mentorId === m.id);
          const active = history.find((e) => !e.revokedAt);
          return (
            <article key={m.id} className="space-y-2 rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{m.name}</p>
                  {m.username && <p className="text-[11px] text-slate-400">@{m.username}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.onboardingComplete ? "bg-emerald-100 text-emerald-800" : active ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                  {m.onboardingComplete ? "Incorporación completa" : active ? "Acceso por autorización" : "Incorporación pendiente"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STEP_LABEL) as (keyof typeof STEP_LABEL)[]).map((step) => (
                  <span key={step} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${m.steps[step] === "completado" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
                    {STEP_LABEL[step]}: {STATUS_LABEL[m.steps[step]] ?? m.steps[step]}
                  </span>
                ))}
              </div>
              {active && (
                <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-900">
                  <p>Autorizado por <strong>{active.grantedBy || "administración"}</strong> el {fmt(active.grantedAt)}. Motivo: {active.reason}</p>
                  <button type="button" disabled={busy} onClick={() => {
                    const why = window.prompt("¿Por qué retiras la autorización? (opcional)") ;
                    if (why === null) return;
                    void run({ method: "PATCH", body: { id: active.id, reason: why } }, "Autorización retirada.");
                  }} className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100">Retirar autorización</button>
                </div>
              )}
              {!m.onboardingComplete && !active && (granting === m.id ? (
                <div className="space-y-2">
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} placeholder="Motivo de la autorización (obligatorio)" className={input} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy || reason.trim().length < 5} onClick={async () => { if (await run({ method: "POST", body: { mentorId: m.id, reason } }, "Autorización registrada. Los pasos no cambian.")) { setGranting(null); setReason(""); } }} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50">Autorizar</button>
                    <button type="button" disabled={busy} onClick={() => { setGranting(null); setReason(""); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setGranting(m.id); setReason(""); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Autorizar a continuar sin completar la incorporación</button>
              ))}
              {history.filter((e) => e.revokedAt).length > 0 && (
                <details className="text-[11px] text-slate-500">
                  <summary className="cursor-pointer">Historial de autorizaciones</summary>
                  <ul className="mt-1 space-y-1">
                    {history.filter((e) => e.revokedAt).map((e) => (
                      <li key={e.id}>Autorizada por {e.grantedBy || "administración"} el {fmt(e.grantedAt)} ({e.reason}); retirada por {e.revokedBy || "administración"} el {fmt(e.revokedAt!)}{e.revokeReason ? ` (${e.revokeReason})` : ""}.</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
