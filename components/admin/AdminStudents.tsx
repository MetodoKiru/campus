"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Status = "activo" | "en_pausa" | "baja";
interface Alumno {
  id: string;
  name: string;
  username: string | null;
  status: Status;
  statusFromSheet: boolean;
  municipality: string;
  mentor: string | null;
  family: string[];
  evaluationsPaused: boolean;
  renewal: null | {
    id: string; periodEnd: string; plan: "mantener" | "subir" | "no_renueva" | null; planSource: string | null;
    paidAt: string | null; paidSource: string | null; closed: boolean; label: string; price: number;
  };
}

const STATUS_LABEL: Record<Status, string> = { activo: "Activo", en_pausa: "En pausa", baja: "Baja" };
const STATUS_STYLE: Record<Status, string> = {
  activo: "bg-emerald-100 text-emerald-800",
  en_pausa: "bg-amber-100 text-amber-800",
  baja: "bg-slate-200 text-slate-600",
};

const day = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "");

async function call(method: "GET" | "POST", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
  const res = await fetch("/api/admin/alumnos", {
    method, cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar.");
  return data;
}

function renewalText(a: Alumno): string {
  const r = a.renewal;
  if (!r) return "Sin renovación en el campus";
  if (r.closed) return `Periodo hasta el ${day(r.periodEnd)} cerrado (pagado)`;
  if (r.plan === "no_renueva") return `No renueva (${r.planSource === "campus" ? "marcado en el campus" : "respondido por correo"})`;
  if (r.paidAt) return `Ha pagado · ${day(r.paidAt)} (${r.paidSource === "campus" ? "campus" : "correo"})`;
  if (r.plan) return `Renueva hasta el ${day(r.periodEnd)}, falta el pago`;
  return `Renovación hasta el ${day(r.periodEnd)}: sin respuesta`;
}

/**
 * «Mis alumnos»: quién está activo, en pausa o de baja, y el pago de su renovación.
 * Poner en pausa o baja para que dejen de salir clases, evaluaciones y avisos.
 */
export default function AdminStudents({ notify }: { notify: (text: string, type: "success" | "error") => void }) {
  const [alumnos, setAlumnos] = useState<Alumno[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "todos" | "sin_pagar">("todos");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const data = await call("GET"); setAlumnos(data.alumnos ?? []); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar los alumnos."); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const act = async (a: Alumno, body: Record<string, unknown>, ok: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(a.id);
    try { await call("POST", { studentId: a.id, ...body }); notify(ok, "success"); await load(); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudo guardar.", "error"); }
    finally { setBusy(null); }
  };

  if (error) return <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">{error}</p>;
  if (!alumnos) return <p className="text-xs text-slate-500">Cargando alumnos…</p>;

  const unpaid = (a: Alumno) => Boolean(a.renewal && !a.renewal.closed && !a.renewal.paidAt && a.renewal.plan !== "no_renueva");
  const visible = alumnos.filter((a) => filter === "todos" || (filter === "sin_pagar" ? unpaid(a) : a.status === filter));
  const count = (f: typeof filter) => alumnos.filter((a) => f === "todos" || (f === "sin_pagar" ? unpaid(a) : a.status === f)).length;

  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 font-serif text-lg text-slate-900"><GraduationCap className="h-5 w-5 text-emerald-800" /> Mis alumnos</h2>
        <p className="text-xs leading-relaxed text-slate-600">
          <strong>Activo</strong>: tiene clases, evaluaciones y avisos. <strong>En pausa</strong> o <strong>Baja</strong>: dejan de salir clases nuevas,
          formularios de evaluación y recordatorios (el historial no se borra). Si la familia no ha pulsado «he pagado», puedes marcar
          «Ha pagado» aquí: llega a la hoja igual que si lo hubiera hecho la familia y el alumno queda activo.
        </p>
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          Aquí manda el campus. La hoja Contabilidad lo ve en la pestaña «Familias», columna «Estado en el campus» (se actualiza cada
          10 minutos), y no envía renovación, recordatorio ni aviso de impago a quien esté en pausa o de baja.
        </p>
      </section>

      <div className="flex flex-wrap gap-1.5">
        {([["todos", "Todos"], ["activo", "Activos"], ["en_pausa", "En pausa"], ["baja", "Baja"], ["sin_pagar", "Renovación sin pagar"]] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${filter === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {label} <span className={filter === value ? "text-white/70" : "text-slate-400"}>{count(value)}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-5 text-xs italic text-slate-400">No hay alumnos en este filtro.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => {
            const r = a.renewal;
            const canPay = !r || (!r.closed && !r.paidAt);
            const canStop = Boolean(r && !r.closed && r.plan !== "no_renueva");
            const isBusy = busy === a.id;
            return (
              <li key={a.id} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{a.name} <span className="font-mono text-[11px] font-normal text-slate-400">@{a.username}</span></p>
                    <p className="text-[11px] text-slate-500">
                      Mentor: {a.mentor ?? <em>sin asignar</em>} · Familia: {a.family.length ? a.family.join(", ") : <em>sin enlazar</em>}
                      {a.municipality && <> · {a.municipality}</>}
                    </p>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  <strong>Renovación:</strong> {renewalText(a)}
                  {a.evaluationsPaused && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">Evaluaciones pausadas a mano</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                    Estado
                    <select value={a.status} disabled={isBusy}
                      onChange={(e) => void act(a, { accion: "estado", estado: e.target.value }, `${a.name}: ${STATUS_LABEL[e.target.value as Status].toLowerCase()}.`,
                        e.target.value === "activo" ? undefined : `¿Poner a ${a.name} ${e.target.value === "baja" ? "de baja" : "en pausa"}? Dejarán de salir sus clases nuevas, evaluaciones y avisos.`)}
                      className="rounded-xl border border-slate-200 bg-[#F7F6F3] px-2 py-1.5 text-xs font-semibold text-slate-800">
                      <option value="activo">Activo</option>
                      <option value="en_pausa">En pausa</option>
                      <option value="baja">Baja</option>
                    </select>
                  </label>
                  <button type="button" disabled={isBusy || !canPay}
                    onClick={() => void act(a, { accion: "pagado" }, r ? `Marcado «ha pagado» para ${a.name}.` : `${a.name} queda activo.`,
                      `¿Marcar que la familia de ${a.name} ha pagado? El alumno quedará activo.`)}
                    className="rounded-xl bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-40">
                    Ha pagado
                  </button>
                  <button type="button" disabled={isBusy || !canStop}
                    onClick={() => void act(a, { accion: "no_renueva" }, `Marcado «no renueva» para ${a.name}.`,
                      `¿Marcar que ${a.name} no renueva? Se apunta en la hoja como si lo hubiera respondido la familia.`)}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    No renueva
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
