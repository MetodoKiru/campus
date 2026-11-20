"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import Toast from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/skillcoins";
import type { ScheduleChangeView, WeeklySlot } from "@/lib/database.types";
import { dayName, longDate, slotsText } from "@/lib/horarios";

const button = "px-4 py-2.5 rounded-xl text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
const key = (s: Pick<WeeklySlot, "weekday" | "start">) => `${s.weekday}-${s.start}`;

/**
 * Tarjeta de la familia tras subir o bajar la intensidad: elige el horario que
 * quedará (tantos días como el plan nuevo, uno por día). Al bajar, salen
 * primero sus clases de ahora para quedarse con las que quiera; al subir, los
 * huecos libres de su mentor. Después el mentor lo confirma y el cambio se
 * aplica solo al empezar la nueva mensualidad.
 */
export default function FamilyScheduleChange({ studentId, studentName, refreshKey = 0 }: { studentId: string; studentName: string; refreshKey?: number }) {
  const [view, setView] = useState<ScheduleChangeView | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const firstName = studentName.split(" ")[0] || studentName;

  const reload = useCallback(async () => {
    const { data: rows } = await supabase.from("kiru_schedule_changes").select("id,status,applied_at")
      .eq("student_id", studentId).in("status", ["elegir_familia", "confirmar_mentor", "confirmado", "aplicado"])
      .order("created_at", { ascending: false }).limit(1);
    const row = rows?.[0];
    // Un cambio ya aplicado solo se enseña la primera semana.
    if (!row || (row.status === "aplicado" && row.applied_at && Date.now() - new Date(row.applied_at).getTime() > 7 * 86_400_000)) {
      setView(null); return;
    }
    const { data, error } = await supabase.rpc("kiru_horario_ver", { p_change: row.id });
    if (error) return;
    const v = data as unknown as ScheduleChangeView;
    setView(v);
    // Se proponen por defecto las clases de ahora (al bajar, las que caben).
    if (v.status === "elegir_familia") {
      setPicked((prev) => prev.length ? prev : v.options.filter((o) => o.current).slice(0, v.to_days).map(key));
    }
  }, [studentId]);

  useEffect(() => {
    const t = window.setTimeout(() => { void reload(); }, 0);
    const onFocus = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearTimeout(t); document.removeEventListener("visibilitychange", onFocus); };
  }, [reload, refreshKey]);

  const byDay = useMemo(() => {
    const m = new Map<number, ScheduleChangeView["options"]>();
    for (const o of view?.options ?? []) m.set(o.weekday, [...(m.get(o.weekday) ?? []), o]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [view]);

  if (!view) return toast ? <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} /> : null;

  const toggle = (o: WeeklySlot) => {
    const k = key(o);
    setPicked((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k);
      // Un solo horario por día: elegir otra hora ese día sustituye a la anterior.
      const rest = prev.filter((x) => !x.startsWith(`${o.weekday}-`));
      return [...rest, k].slice(-view.to_days);
    });
  };

  const submit = async () => {
    setBusy(true);
    const slots = picked.map((k) => { const [d, start] = k.split("-"); return { weekday: Number(d), start }; });
    const { error } = await supabase.rpc("kiru_horario_elegir", { p_change: view.id, p_slots: slots, p_note: note });
    setBusy(false);
    if (error) { setToast({ text: errorText(error), type: "error" }); await reload(); return; }
    setToast({ text: `¡Gracias! Hemos avisado a ${view.mentor ?? "su mentor"} para que lo confirme.`, type: "success" });
    setPicked([]); setNote("");
    await reload();
  };

  const days = `${view.to_days} ${view.to_days === 1 ? "día" : "días"} por semana`;

  return (
    <section className="rounded-3xl border-2 border-[#E4D8C5] bg-[#FBF8F2] p-5 sm:p-6 space-y-4" aria-label="Nuevo horario">
      {toast && <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-start gap-3">
        <CalendarClock className="w-5 h-5 text-[#806C50] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-serif text-lg font-bold text-[#292825] leading-snug">Nuevo horario de {firstName}</h3>
          <p className="text-xs text-[#6D6962]">
            Pasáis a <strong>{days}</strong>{view.plan_price != null && <> ({Number(view.plan_price).toLocaleString("es-ES")} €/mes)</>} a partir del <strong>{longDate(view.effective_from)}</strong>.
            {view.current_slots.length > 0 && <> Ahora: {slotsText(view.current_slots)}.</>}
          </p>
        </div>
      </div>

      {view.status === "elegir_familia" && (
        <div className="space-y-3">
          {view.mentor_note && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {view.mentor ?? "Su mentor"} no puede en el horario que elegisteis: «{view.mentor_note}». Elegid otro, por favor.
            </p>
          )}
          <p className="text-sm font-semibold text-[#292825]">
            {view.plan === "bajar"
              ? `Elegid ${view.to_days === 1 ? "el día" : `los ${view.to_days} días`} que queréis mantener${byDay.some(([, list]) => list.some((o) => !o.current)) ? " (o un hueco nuevo)" : ""}:`
              : `Elegid ${view.to_days} ${view.to_days === 1 ? "día" : "días"} en total (uno por día). Os marcamos los huecos libres de ${view.mentor ?? "su mentor"}:`}
          </p>
          {byDay.length === 0 ? (
            <p className="text-xs text-[#6D6962]">
              {view.mentor ?? "Su mentor"} todavía no ha marcado su disponibilidad. Ya le hemos avisado; en cuanto lo haga, veréis aquí los huecos (y os llegará un recordatorio).
            </p>
          ) : (
            <div className="space-y-2">
              {byDay.map(([d, list]) => (
                <div key={d} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-24 text-xs font-semibold text-[#45433F]">{dayName(d)}</span>
                  {list.map((o) => {
                    const on = picked.includes(key(o));
                    return (
                      <button key={key(o)} type="button" aria-pressed={on} onClick={() => toggle(o)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition ${on ? "bg-[#242321] border-[#242321] text-white" : "bg-white border-[#E4D8C5] text-[#45433F] hover:bg-[#F3F0EA]"}`}>
                        {o.start}–{o.end}{o.current ? " · actual" : ""}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {byDay.length > 0 && (
            <>
              <textarea className="w-full rounded-xl border border-[#E7E3DC] bg-white px-3 py-2 text-xs" rows={2} maxLength={600} value={note}
                onChange={(e) => setNote(e.target.value)} placeholder="¿Algo que deba saber el mentor? (opcional)" />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={busy || picked.length !== view.to_days} onClick={() => void submit()}
                  className={`${button} bg-[#242321] text-white hover:bg-[#3A3835]`}>
                  Enviar este horario
                </button>
                <span className="text-[11px] text-[#77736B]">{picked.length} de {view.to_days} elegido{view.to_days > 1 ? "s" : ""}</span>
              </div>
            </>
          )}
        </div>
      )}

      {view.status === "confirmar_mentor" && (
        <p className="flex items-start gap-2 text-sm text-[#45433F]">
          <CheckCircle2 className="w-4 h-4 text-[#806C50] shrink-0 mt-0.5" />
          <span>Habéis elegido <strong>{slotsText(view.chosen_slots)}</strong>. Esperando a que {view.mentor ?? "su mentor"} lo confirme; os avisaremos.</span>
        </p>
      )}
      {(view.status === "confirmado" || view.status === "aplicado") && (
        <p className="flex items-start gap-2 text-sm text-[#45433F]">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>
            Horario confirmado: <strong>{slotsText(view.chosen_slots)}</strong>
            {view.status === "confirmado" ? `, a partir del ${longDate(view.effective_from)}.` : ". Ya está en vuestro calendario."}
            {view.mentor_note && <> Nota de {view.mentor ?? "su mentor"}: «{view.mentor_note}».</>}
          </span>
        </p>
      )}
    </section>
  );
}
