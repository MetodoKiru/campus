"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/skillcoins";
import type { WeeklySlot } from "@/lib/database.types";
import { btnDark, btnLight, card, input } from "@/components/classes/shared";
import {
  CLASS_WEEKDAYS, GRID_END, GRID_START, GRID_STEP, WEEKDAYS, WEEKDAYS_SHORT, cellKey, cellsToSlots, dayName, fromMinutes, slotsToCells, toMinutes,
} from "@/lib/horarios";

type Busy = { weekday: number; start: number; end: number; student: string };

/**
 * «Mi disponibilidad para clases»: el mentor marca en una cuadrícula semanal
 * (medias horas de 8:00 a 20:30, sin viernes) cuándo puede dar clase. Sus clases actuales
 * salen en gris con el nombre del alumno. Con esto, cuando una familia sube o
 * baja de intensidad, solo ve los huecos que de verdad tiene libres.
 * `mentorId` lo usa administración para editar la de otro mentor.
 */
export default function MentorAvailability({ notify, mentorId }: { notify: (text: string) => void; mentorId?: string }) {
  const [cells, setCells] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const painting = useRef<boolean | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const id = mentorId ?? user?.id;
    if (!id) return;
    const [{ data: avail }, { data: slots }] = await Promise.all([
      supabase.from("kiru_mentor_class_availability").select("slots,notes,updated_at").eq("mentor_id", id).maybeSingle(),
      supabase.from("kiru_student_schedule_slots").select("student_id,weekday,start_time,end_time").eq("mentor_id", id).eq("is_active", true),
    ]);
    const ids = [...new Set((slots ?? []).map((s) => s.student_id))];
    const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] as { id: string; full_name: string }[] };
    const name = new Map((people ?? []).map((p) => [p.id, (p.full_name || "").split(" ")[0] || "Alumno"]));
    setBusy((slots ?? []).map((s) => ({
      weekday: s.weekday, start: toMinutes(String(s.start_time).slice(0, 5)), end: toMinutes(String(s.end_time).slice(0, 5)),
      student: name.get(s.student_id) ?? "Alumno",
    })));
    setCells(slotsToCells((avail?.slots ?? []) as WeeklySlot[]));
    setNotes(avail?.notes ?? "");
    setUpdatedAt(avail?.updated_at && (avail.slots as WeeklySlot[] | null)?.length ? avail.updated_at : null);
    setDirty(false);
    setLoaded(true);
  }, [mentorId]);

  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const stop = () => { painting.current = null; };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let m = GRID_START; m < GRID_END; m += GRID_STEP) out.push(m);
    return out;
  }, []);

  const busyAt = (d: number, m: number) => busy.find((b) => b.weekday === d && b.start < m + GRID_STEP && b.end > m);

  const setCell = (key: string, on: boolean) => {
    setCells((prev) => {
      if (prev.has(key) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
    setDirty(true);
  };

  const fillDay = (d: number, from: number, to: number) => {
    setCells((prev) => {
      const next = new Set(prev);
      for (let m = from; m < to; m += GRID_STEP) next.add(cellKey(d, m));
      return next;
    });
    setDirty(true);
  };
  const clearDay = (d: number) => {
    setCells((prev) => new Set([...prev].filter((k) => !k.startsWith(`${d}-`))));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const slots = cellsToSlots(cells);
    const { error } = await supabase.rpc("kiru_disponibilidad_guardar", { p_slots: slots, p_notes: notes, ...(mentorId ? { p_mentor: mentorId } : {}) });
    setSaving(false);
    if (error) { notify(`No se pudo guardar: ${errorText(error)}`); return; }
    notify(slots.length ? "Disponibilidad guardada. ¡Gracias!" : "Disponibilidad guardada (sin franjas marcadas).");
    await load();
  };

  const summary = cellsToSlots(cells);

  return (
    <section className={`${card} space-y-4`} aria-label="Disponibilidad para clases">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><Clock className="h-5 w-5" /> Mi disponibilidad para clases</h2>
        <p className="text-xs text-[#6D6962]">
          Marca los días y horas en los que <strong>podrías dar clase</strong> (pulsa o arrastra sobre la cuadrícula, en franjas de 30 minutos).
          Tus clases actuales salen en gris.
        </p>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-[#45433F]">
          <li><strong>Marcarla no significa que vayas a dar más (o menos) clases.</strong> Sirve para que las familias sepan qué días podrían pedir más clases y para que sepamos qué huecos tienes por si llega otro alumno.</li>
          <li>Las horas son las de <strong>estar en casa del alumno dando la clase</strong> (sin contar el desplazamiento).</li>
          <li>Las clases duran 1 hora y la última es de <strong>19:30 a 20:30</strong>. Los <strong>viernes no hay clase</strong>.</li>
        </ul>
        <p className="text-[11px] text-[#77736B]">
          {updatedAt ? `Actualizada el ${new Date(updatedAt).toLocaleDateString("es-ES")}. Revísala cada mes.` : "Todavía no la has marcado."}
        </p>
      </div>

      {!loaded ? <p className="text-xs text-[#77736B]">Cargando…</p> : (
        <>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[320px] select-none border-separate border-spacing-[2px] text-[10px]">
              <thead>
                <tr>
                  <th className="w-10" />
                  {CLASS_WEEKDAYS.map((n) => ({ d: WEEKDAYS[n - 1], i: n - 1 })).map(({ d, i }) => (
                    <th key={d} className="font-semibold text-[#555149]">
                      <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span><span className="hidden sm:inline">{d}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m}>
                    <td className="pr-1 text-right align-middle text-[#77736B]">{m % 60 === 0 ? fromMinutes(m) : ""}</td>
                    {CLASS_WEEKDAYS.map((d) => {
                      const key = cellKey(d, m);
                      const on = cells.has(key);
                      const b = busyAt(d, m);
                      const label = `${dayName(d)} ${fromMinutes(m)}${b ? ` · clase con ${b.student}` : ""}${on ? " · disponible" : ""}`;
                      return (
                        <td key={key} className="p-0">
                          <button
                            type="button"
                            aria-label={label}
                            aria-pressed={on}
                            title={label}
                            onPointerDown={(e) => { e.preventDefault(); painting.current = !on; setCell(key, !on); }}
                            onPointerEnter={() => { if (painting.current !== null) setCell(key, painting.current); }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCell(key, !on); } }}
                            className={`block h-5 w-full rounded-[3px] border ${
                              b ? "border-[#B9B2A6] bg-[#D9D3C9] text-[#45433F]" : on ? "border-emerald-600 bg-emerald-500" : "border-[#EEEAE3] bg-[#FAF8F5] hover:bg-[#F0ECE5]"
                            }`}
                          >
                            {b && b.start >= m && b.start < m + GRID_STEP ? <span className="block truncate px-0.5 leading-[18px]">{b.student}</span> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#6D6962]">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-[3px] bg-emerald-500" /> Puedo dar clase</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-[3px] bg-[#D9D3C9]" /> Ya tengo clase</span>
          </div>

          <details className="text-xs text-[#45433F]">
            <summary className="cursor-pointer font-semibold">Atajos por día</summary>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {CLASS_WEEKDAYS.map((n) => (
                <div key={n} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-20">{dayName(n)}</span>
                  <button type="button" className={btnLight} onClick={() => fillDay(n, 16 * 60, GRID_END)}>Tarde 16:00–20:30</button>
                  <button type="button" className={btnLight} onClick={() => fillDay(n, 10 * 60, 14 * 60)}>Mañana 10–14</button>
                  <button type="button" className={btnLight} onClick={() => clearDay(n)}>Vaciar</button>
                </div>
              ))}
            </div>
          </details>

          <label className="block space-y-1 text-xs text-[#45433F]">
            <span className="font-semibold">Comentarios (opcional)</span>
            <textarea className={input} rows={2} maxLength={500} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
              placeholder="Por ejemplo: en exámenes de enero tengo menos tiempo; prefiero Aravaca o Pozuelo." />
          </label>

          <p className="text-xs text-[#45433F]">
            {summary.length
              ? <>Disponible: {summary.map((s) => `${dayName(s.weekday).toLowerCase()} ${s.start}–${s.end}`).join(" · ")}</>
              : "No has marcado ninguna franja."}
          </p>

          <button type="button" className={btnDark} disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? "Guardando…" : dirty ? "Guardar disponibilidad" : "Guardada"}
          </button>
        </>
      )}
    </section>
  );
}
