"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/skillcoins";
import type { AvailabilityCheckRow, ScheduleChangeRow } from "@/lib/database.types";
import { btnDark, btnLight, card, input, subtle } from "@/components/classes/shared";
import { longDate, slotsText } from "@/lib/horarios";

type Row = ScheduleChangeRow & { studentName: string };
type Check = { id: string; student_id: string; period_end: string; missed_at: string | null; studentName: string };

/**
 * Aviso en el panel del mentor: una familia ha subido o bajado de intensidad y
 * ha elegido el nuevo horario. El mentor lo confirma o pide otro (explicando
 * por qué). También le recuerda marcar su disponibilidad si no lo ha hecho y, antes
 * de cada renovación, le pide confirmar que su disponibilidad sigue igual (si no
 * lo hace, el correo a la familia se retrasa y cuenta como falta).
 */
export default function MentorScheduleChanges({ notify, onOpenAvailability }: { notify: (text: string) => void; onOpenAvailability: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [waiting, setWaiting] = useState<Row[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [needsAvailability, setNeedsAvailability] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: changes }, { data: avail }, { data: pending }] = await Promise.all([
      supabase.from("kiru_schedule_changes").select("*").eq("mentor_id", user.id)
        .in("status", ["elegir_familia", "confirmar_mentor"]).order("created_at"),
      supabase.from("kiru_mentor_class_availability").select("slots,updated_at").eq("mentor_id", user.id).maybeSingle(),
      supabase.from("kiru_availability_checks").select("id,student_id,period_end,missed_at").eq("mentor_id", user.id)
        .is("confirmed_at", null).is("family_released_at", null).order("period_end"),
    ]);
    const list = (changes ?? []) as ScheduleChangeRow[];
    const open = (pending ?? []) as Pick<AvailabilityCheckRow, "id" | "student_id" | "period_end" | "missed_at">[];
    const ids = [...new Set([...list.map((c) => c.student_id), ...open.map((c) => c.student_id)])];
    const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] as { id: string; full_name: string }[] };
    const name = new Map((people ?? []).map((p) => [p.id, (p.full_name || "").split(" ")[0] || "Tu alumno"]));
    const withNames = list.map((c) => ({ ...c, studentName: name.get(c.student_id) ?? "Tu alumno" }));
    setChecks(open.map((c) => ({ ...c, studentName: name.get(c.student_id) ?? "Tu alumno" })));
    setRows(withNames.filter((c) => c.status === "confirmar_mentor"));
    setWaiting(withNames.filter((c) => c.status === "elegir_familia"));
    const slots = (avail?.slots ?? []) as unknown[];
    const stale = !avail || !slots.length || Date.now() - new Date(avail.updated_at).getTime() > 30 * 86_400_000;
    setNeedsAvailability(stale && withNames.some((c) => c.to_days > c.from_days));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const decide = async (id: string, ok: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("kiru_horario_decidir", { p_change: id, p_ok: ok, p_note: ok ? "" : note });
    setBusy(false);
    if (error) { notify(`No se pudo guardar: ${errorText(error)}`); return; }
    notify(ok ? "Horario confirmado. Avisamos a la familia." : "Hemos pedido a la familia que elija otro horario.");
    setRejecting(null); setNote("");
    await load();
  };

  const stillTheSame = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("kiru_disponibilidad_sigue_igual", {});
    setBusy(false);
    if (error) { notify(`No se pudo guardar: ${errorText(error)}`); return; }
    notify("¡Gracias! Disponibilidad confirmada.");
    await load();
  };

  if (!rows.length && !waiting.length && !checks.length) return null;
  const urgent = checks.some((c) => c.missed_at);

  return (
    <section className={`${card} space-y-3 border-2 border-[#E4D8C5]`} aria-label="Cambios de horario">
      <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><CalendarClock className="h-5 w-5" /> Cambios de horario</h2>
      {checks.length > 0 && (
        <div className={`rounded-2xl border p-4 space-y-2 text-xs ${urgent ? "border-red-300 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <p className="text-sm font-semibold">
            {urgent ? "URGENTE: confirma hoy tu disponibilidad" : "Confirma tu disponibilidad"}
          </p>
          <p>
            Renuevan pronto: {checks.map((c) => `${c.studentName} (fin el ${longDate(c.period_end)})`).join(", ")}. Su familia podrá elegir subir o bajar días,
            así que antes necesitamos saber qué huecos tienes. No significa que vayas a dar más clases.
          </p>
          {urgent && <p><strong>La renovación está parada hasta que confirmes y queda anotado como falta.</strong></p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnDark} disabled={busy} onClick={() => void stillTheSame()}>Mi disponibilidad sigue igual</button>
            <button type="button" className={btnLight} onClick={onOpenAvailability}>Actualizarla</button>
          </div>
        </div>
      )}
      {needsAvailability && (
        <div className={`${subtle} space-y-2 text-xs text-[#45433F]`}>
          <p><strong>Una familia va a tener más clases contigo.</strong> Marca tu disponibilidad para que pueda elegir un hueco que te venga bien.</p>
          <button type="button" className={btnDark} onClick={onOpenAvailability}>Marcar mi disponibilidad</button>
        </div>
      )}
      {rows.map((c) => (
        <div key={c.id} className={`${subtle} space-y-2`}>
          <p className="text-sm text-[#292825]">
            <strong>{c.studentName}</strong> pasa de {c.from_days} a <strong>{c.to_days} {c.to_days === 1 ? "día" : "días"} por semana</strong> desde el {longDate(c.effective_from)}.
          </p>
          <p className="text-sm text-[#45433F]">La familia ha elegido: <strong>{slotsText(c.chosen_slots)}</strong>.</p>
          {c.family_note && <p className="text-xs text-[#6D6962]">Nota de la familia: «{c.family_note}»</p>}
          {rejecting === c.id ? (
            <div className="space-y-2">
              <textarea className={input} rows={2} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Por qué no te encaja y qué otro día u hora podrías (lo leerá la familia)." />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnDark} disabled={busy || !note.trim()} onClick={() => void decide(c.id, false)}>Pedir otro horario</button>
                <button type="button" className={btnLight} disabled={busy} onClick={() => { setRejecting(null); setNote(""); }}>Volver</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnDark} disabled={busy} onClick={() => void decide(c.id, true)}>Confirmar este horario</button>
              <button type="button" className={btnLight} disabled={busy} onClick={() => setRejecting(c.id)}>No me encaja</button>
            </div>
          )}
        </div>
      ))}
      {waiting.map((c) => (
        <p key={c.id} className="text-xs text-[#6D6962]">
          {c.studentName} pasa a {c.to_days} {c.to_days === 1 ? "día" : "días"} por semana desde el {longDate(c.effective_from)}: su familia está eligiendo el nuevo horario
          {c.mentor_note ? ` (le pediste otro: «${c.mentor_note}»)` : ""}.
        </p>
      ))}
    </section>
  );
}
