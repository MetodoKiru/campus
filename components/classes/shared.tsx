"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { MENTOR_PROPOSAL_RULES, classDateLabel, madridToIso, mentorProposalProblems } from "@/lib/classes";
import type { ClassOption } from "@/lib/database.types";

async function token(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
  return session.access_token;
}

/** Carga /api/clases con la sesión de la persona. */
export function useClasses<T>(enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Momento de la última carga: sirve de «ahora» para separar próximas y pasadas sin llamar a Date.now() al pintar.
  const [loadedAt, setLoadedAt] = useState(0);
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/clases", { cache: "no-store", headers: { Authorization: `Bearer ${await token()}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar las clases.");
      setData(body as T);
      setLoadedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las clases.");
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(first);
  }, [enabled, reload]);
  return { data, error, reload, loadedAt };
}

/** Lanza una acción sobre clases; devuelve null si va bien o el mensaje de error. */
export async function classAction(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/clases", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error ?? "No se pudo guardar.";
  } catch (e) {
    return e instanceof Error ? e.message : "No se pudo guardar.";
  }
}

export const card = "rounded-2xl border border-[#E7E3DC] bg-white p-4 sm:p-5 shadow-xs";
export const subtle = "rounded-xl border border-[#E7E3DC] bg-[#FDFCFB] p-3";
export const btn = "rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50";
export const btnDark = `${btn} bg-[#242321] text-white hover:bg-[#3A3835]`;
export const btnLight = `${btn} border border-[#E7E3DC] bg-white text-[#45433F] hover:bg-[#FAF8F5]`;
export const input = "w-full rounded-xl border border-[#E7E3DC] bg-white px-3 py-2 text-xs text-[#292825]";

export function timeRange(o: ClassOption): string {
  const end = new Date(o.end).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  return `${classDateLabel(o.start)}–${end}`;
}

type Draft = { day: string; start: string; end: string };

/** Editor de varias fechas propuestas (día + hora de inicio y fin, en hora de Madrid). */
export function OptionsEditor({ value, onChange, max = 5, defaultMinutes = 60, realistic = false }: {
  value: ClassOption[]; onChange: (options: ClassOption[]) => void; max?: number; defaultMinutes?: number;
  /** Fechas de un mentor: mínimo 3 en días distintos, sin viernes y terminando como tarde a las 20:30. */
  realistic?: boolean;
}) {
  const empty = { day: "", start: "", end: "" };
  const [drafts, setDrafts] = useState<Draft[]>(realistic ? Array.from({ length: MENTOR_PROPOSAL_RULES.minOptions }, () => ({ ...empty })) : [{ ...empty }]);
  const problems = realistic && value.length > 0 ? mentorProposalProblems(value) : [];
  const update = (next: Draft[]) => {
    setDrafts(next);
    onChange(next.flatMap((d) => {
      const s = madridToIso(d.day, d.start);
      const e = madridToIso(d.day, d.end);
      return s && e && e > s ? [{ start: s, end: e }] : [];
    }));
  };
  const addMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const total = Math.min(23 * 60 + 59, h * 60 + m + defaultMinutes);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  return (
    <div className="space-y-2">
      {realistic && (
        <p className="rounded-lg bg-[#F3EFE6] p-2 text-[11px] text-[#45433F]">
          Propón al menos {MENTOR_PROPOSAL_RULES.minOptions} fechas, cada una en un día distinto y a horas que sepas que encajan a la familia.
          No se pueden proponer viernes y la clase tiene que terminar como tarde a las {MENTOR_PROPOSAL_RULES.latestEnd}.
        </p>
      )}
      {drafts.map((d, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="Día" className={`${input} w-auto`} value={d.day}
            onChange={(e) => update(drafts.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))} />
          <input type="time" aria-label="Empieza" className={`${input} w-auto`} value={d.start}
            onChange={(e) => update(drafts.map((x, j) => (j === i ? { ...x, start: e.target.value, end: x.end || (e.target.value ? addMinutes(e.target.value) : "") } : x)))} />
          <span className="text-xs text-[#77736B]">a</span>
          <input type="time" aria-label="Termina" className={`${input} w-auto`} value={d.end}
            onChange={(e) => update(drafts.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
          {drafts.length > (realistic ? MENTOR_PROPOSAL_RULES.minOptions : 1) && (
            <button type="button" aria-label="Quitar fecha" className="p-1 text-[#8D887F] hover:text-[#292825]" onClick={() => update(drafts.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {drafts.length < max && (
        <button type="button" className="flex items-center gap-1 text-xs font-semibold text-[#6D6962] hover:text-[#292825]"
          onClick={() => update([...drafts, { day: "", start: "", end: "" }])}>
          <Plus className="h-3.5 w-3.5" /> Añadir otra fecha
        </button>
      )}
      {problems.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-orange-800">
          {[...new Set(problems)].map((p) => <li key={p}>• {p}</li>)}
        </ul>
      )}
      {value.length > 0 && <p className="text-[11px] text-[#77736B]">{value.length === 1 ? "1 fecha lista" : `${value.length} fechas listas`}. El campus comprueba al guardar que el hueco está libre.</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-[#FAF8F5] p-3 text-xs text-[#77736B]">{children}</p>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" | "ok" | "bad" }) {
  const tones = {
    neutral: "bg-[#F3EEE5] text-[#806C50]",
    warn: "bg-orange-100 text-orange-900",
    ok: "bg-[#E7F0E4] text-[#38523A]",
    bad: "bg-red-100 text-red-900",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>;
}
