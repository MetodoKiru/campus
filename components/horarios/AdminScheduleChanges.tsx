"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/skillcoins";
import type { ScheduleChangeRow, WeeklySlot } from "@/lib/database.types";
import { btnDark, btnLight, card, subtle } from "@/components/classes/shared";
import { CHANGE_STATUS_LABEL, dayName, longDate, slotsText } from "@/lib/horarios";
import MentorAvailability from "./MentorAvailability";

type Mentor = { id: string; name: string; slots: WeeklySlot[]; updatedAt: string | null; stale: boolean };

/**
 * Administración: cambios de intensidad en curso (quién tiene que hacer qué),
 * los aplicados en los últimos 30 días y la disponibilidad de cada mentor.
 * Puede confirmar en nombre del mentor, cancelar un cambio o editar una disponibilidad.
 */
export default function AdminScheduleChanges({ notify }: { notify: (text: string, type: "success" | "error") => void }) {
  const [changes, setChanges] = useState<ScheduleChangeRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: rows }, { data: people }, { data: avail }] = await Promise.all([
      supabase.from("kiru_schedule_changes").select("*").or(`status.in.(elegir_familia,confirmar_mentor,confirmado),updated_at.gte.${since}`)
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("id,full_name,role,is_active").in("role", ["mentor", "alumno"]),
      supabase.from("kiru_mentor_class_availability").select("mentor_id,slots,updated_at"),
    ]);
    setChanges((rows ?? []) as ScheduleChangeRow[]);
    setNames(new Map((people ?? []).map((p) => [p.id, p.full_name || "—"])));
    const byMentor = new Map((avail ?? []).map((a) => [a.mentor_id, a]));
    setMentors((people ?? []).filter((p) => p.role === "mentor" && p.is_active).map((p) => {
      const a = byMentor.get(p.id);
      const slots = (a?.slots ?? []) as WeeklySlot[];
      const stale = !a || !slots.length || Date.now() - new Date(a.updated_at).getTime() > 30 * 86_400_000;
      return { id: p.id, name: p.full_name || "—", slots, updatedAt: a?.updated_at ?? null, stale };
    }).sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const run = async (call: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setBusy(true);
    const { error } = await call();
    setBusy(false);
    if (error) notify(errorText(error), "error"); else notify(ok, "success");
    await load();
  };

  const open = changes.filter((c) => ["elegir_familia", "confirmar_mentor", "confirmado"].includes(c.status));
  const done = changes.filter((c) => !open.includes(c));

  return (
    <div className="space-y-6">
      <section className={`${card} space-y-3`}>
        <h2 className="font-serif text-lg font-bold text-[#292825]">Cambios de intensidad y horario</h2>
        <p className="text-xs text-[#6D6962]">
          Cuando una familia elige subir o bajar días en la renovación, elige aquí el nuevo horario, su mentor lo confirma y se aplica solo
          el día que empieza la nueva mensualidad (las clases del calendario se rehacen solas y la hoja «Familias» recibe los días y el precio).
        </p>
        {open.length === 0 ? <p className="text-xs text-[#77736B]">No hay cambios en curso.</p> : open.map((c) => (
          <div key={c.id} className={`${subtle} space-y-1.5 text-xs text-[#45433F]`}>
            <p className="text-sm text-[#292825]">
              <strong>{names.get(c.student_id) ?? "Alumno"}</strong> · {c.from_days} → {c.to_days} {c.to_days === 1 ? "día" : "días"} desde el {longDate(c.effective_from)}
              {c.mentor_id ? ` · ${names.get(c.mentor_id) ?? "mentor"}` : " · sin mentor"}
            </p>
            <p><strong>{CHANGE_STATUS_LABEL[c.status]}</strong>{c.chosen_slots.length ? ` · elegido: ${slotsText(c.chosen_slots)}` : ""}</p>
            {c.family_note && <p>Familia: «{c.family_note}»</p>}
            {c.mentor_note && <p>Mentor: «{c.mentor_note}»</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {c.status === "confirmar_mentor" && (
                <button type="button" className={btnDark} disabled={busy}
                  onClick={() => void run(() => supabase.rpc("kiru_horario_decidir", { p_change: c.id, p_ok: true, p_note: "" }), "Confirmado en nombre del mentor.")}>
                  Confirmar en nombre del mentor
                </button>
              )}
              <button type="button" className={btnLight} disabled={busy}
                onClick={() => { if (window.confirm("¿Cancelar este cambio de horario? El horario actual se queda como está.")) void run(() => supabase.rpc("kiru_horario_cancelar", { p_change: c.id }), "Cambio cancelado."); }}>
                Cancelar cambio
              </button>
            </div>
          </div>
        ))}
        {done.length > 0 && (
          <details className="text-xs text-[#45433F]">
            <summary className="cursor-pointer font-semibold">Últimos 30 días ({done.length})</summary>
            <ul className="mt-2 space-y-1">
              {done.map((c) => (
                <li key={c.id}>
                  {names.get(c.student_id) ?? "Alumno"} · {c.from_days} → {c.to_days} · {CHANGE_STATUS_LABEL[c.status]}
                  {c.chosen_slots.length ? ` · ${slotsText(c.chosen_slots)}` : ""}{c.status === "aplicado" && !c.sheet_synced_at ? " · pendiente de pasar a la hoja" : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="font-serif text-lg font-bold text-[#292825]">Disponibilidad de los mentores</h2>
        <p className="text-xs text-[#6D6962]">La marca cada mentor en su panel («Mi disponibilidad para clases»). El día 1 de cada mes se avisa a quien no la haya revisado en 30 días.</p>
        <ul className="space-y-2">
          {mentors.map((m) => {
            const stale = m.stale;
            return (
              <li key={m.id} className={`${subtle} space-y-1 text-xs text-[#45433F]`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-[#292825]">{m.name}</strong>
                  <span className={stale ? "text-amber-700" : "text-emerald-700"}>
                    {m.slots.length && m.updatedAt ? `Actualizada el ${new Date(m.updatedAt).toLocaleDateString("es-ES")}` : "Sin marcar"}
                  </span>
                </div>
                {m.slots.length > 0 && <p>{m.slots.map((s) => `${dayName(s.weekday).slice(0, 3).toLowerCase()} ${s.start}–${s.end}`).join(" · ")}</p>}
                <button type="button" className={btnLight} onClick={() => setEditing(editing === m.id ? null : m.id)}>
                  {editing === m.id ? "Cerrar" : "Ver o editar"}
                </button>
                {editing === m.id && (
                  <MentorAvailability mentorId={m.id} notify={(t) => { notify(t, /^No /.test(t) ? "error" : "success"); void load(); }} />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
