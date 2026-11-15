"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/skillcoins";
import type { MentorClassAvailabilityRow, WeeklySlot } from "@/lib/database.types";
import { btnDark, btnLight, card, input, subtle } from "@/components/classes/shared";
import { dayName } from "@/lib/horarios";
import { ARRIVE_LABEL, TRANSPORT_LABEL, type Arrive, type Transport } from "@/lib/disponibilidad";
import MentorAvailability from "./MentorAvailability";

type Person = { id: string; name: string };
type Student = Person & { mentorId: string; address: string; municipality: string };

const short = (d: number) => dayName(d).slice(0, 3).toLowerCase();
const slotsLine = (slots: WeeklySlot[]) => slots.map((s) => `${short(s.weekday)} ${s.start}–${s.end}`).join(" · ");
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES") : "");

/**
 * Lo que cada mentor ha contestado en «Mi disponibilidad para clases» (v2) y las direcciones de clase de sus alumnos.
 * La usan el panel del coordinador (sus mentores) y administración (todos, con edición y la lista de zonas).
 */
export default function AvailabilityOverview({ mentors, notify, admin = false }: {
  mentors: Person[];
  notify: (text: string, type: "success" | "error") => void;
  admin?: boolean;
}) {
  const [rows, setRows] = useState<Map<string, MentorClassAvailabilityRow>>(new Map());
  const [students, setStudents] = useState<Student[]>([]);
  const [addr, setAddr] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [zonesText, setZonesText] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const ids = mentors.map((m) => m.id).join(",");

  const load = useCallback(async () => {
    setNow(Date.now());
    const list = ids ? ids.split(",") : [];
    if (!list.length) { setRows(new Map()); setStudents([]); return; }
    const [{ data: avail }, { data: links }, { data: zl }] = await Promise.all([
      supabase.from("kiru_mentor_class_availability").select("*").in("mentor_id", list),
      supabase.from("student_mentors").select("student_id,mentor_id").in("mentor_id", list),
      supabase.rpc("kiru_zonas_mentores"),
    ]);
    setRows(new Map(((avail ?? []) as MentorClassAvailabilityRow[]).map((a) => [a.mentor_id, a])));
    setZonesText((Array.isArray(zl) ? (zl as unknown[]) : []).filter((z): z is string => typeof z === "string").join("\n"));
    const sIds = (links ?? []).map((l) => l.student_id);
    const [{ data: people }, { data: studs }] = sIds.length
      ? await Promise.all([
        supabase.from("profiles").select("id,full_name,is_active").in("id", sIds),
        supabase.from("students").select("profile_id,class_address,municipality,service_status").in("profile_id", sIds),
      ])
      : [{ data: [] as { id: string; full_name: string; is_active: boolean }[] }, { data: [] as { profile_id: string; class_address: string; municipality: string; service_status: string }[] }];
    const info = new Map((studs ?? []).map((s) => [s.profile_id, s]));
    const out: Student[] = (links ?? []).flatMap((l) => {
      const p = (people ?? []).find((x) => x.id === l.student_id);
      const s = info.get(l.student_id);
      if (!p || !p.is_active || s?.service_status === "baja") return [];
      return [{ id: l.student_id, name: p.full_name || "Alumno", mentorId: l.mentor_id, address: s?.class_address ?? "", municipality: s?.municipality ?? "" }];
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
    setStudents(out);
    setAddr(Object.fromEntries(out.map((s) => [s.id, s.address])));
  }, [ids]);

  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const saveAddress = async (s: Student) => {
    setBusy(true);
    const { error } = await supabase.rpc("kiru_alumno_direccion", { p_student: s.id, p_address: (addr[s.id] ?? "").trim() });
    setBusy(false);
    if (error) notify(`No se pudo guardar: ${errorText(error)}`, "error");
    else { notify(`Dirección de ${s.name.split(" ")[0]} guardada.`, "success"); await load(); }
  };

  const saveZones = async () => {
    setBusy(true);
    const zones = zonesText.split("\n").map((z) => z.trim()).filter(Boolean);
    const { error } = await supabase.rpc("kiru_zonas_mentores_guardar", { p_zones: zones });
    setBusy(false);
    if (error) notify(`No se pudo guardar: ${errorText(error)}`, "error");
    else { notify("Zonas guardadas.", "success"); await load(); }
  };

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name.split(" ")[0] ?? "Alumno";

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`}>
        <h2 className="font-serif text-lg font-bold text-[#292825]">Disponibilidad de los mentores</h2>
        <p className="text-xs text-[#6D6962]">
          Lo que cada mentor ha contestado en «Mi disponibilidad para clases». Cada vez que la envía, su coordinador/a recibe un correo con
          este mismo resumen. Si alguien dice que ya no puede dar alguna de sus clases, sale en rojo.
        </p>
        {mentors.length === 0 && <p className="text-xs text-[#77736B]">No hay mentores.</p>}
        <ul className="space-y-2">
          {mentors.map((m) => {
            const a = rows.get(m.id);
            const sent = a?.submitted_at ?? null;
            const old = !sent || now - new Date(sent).getTime() > 30 * 86_400_000;
            return (
              <li key={m.id} className={`${subtle} space-y-1 text-xs text-[#45433F] ${a?.keeps_classes === false ? "ring-1 ring-red-300" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-[#292825]">{m.name}</strong>
                  <span className={old ? "text-amber-700" : "text-emerald-700"}>{sent ? `Enviada el ${fmt(sent)}` : "Todavía no la ha enviado"}</span>
                </div>
                {a && sent && (
                  <>
                    {a.keeps_classes === false
                      ? <p className="font-semibold text-red-800">⚠️ Ya no puede dar alguna de sus clases: «{a.keeps_note}»</p>
                      : a.keeps_classes === true ? <p>✓ Puede seguir con sus clases de siempre.</p> : null}
                    {(a.from_place || a.from_place_weekend) && (
                      <p>Sale desde: <strong>{a.from_place || "—"}</strong>{a.from_place_weekend ? ` (fines de semana: ${a.from_place_weekend})` : ""}</p>
                    )}
                    {a.transport.length > 0 && <p>Se mueve en: {a.transport.map((t) => TRANSPORT_LABEL[t as Transport] ?? t).join(", ")}</p>}
                    {a.zones.length > 0 && <p>Zonas: {a.zones.join(", ")}</p>}
                    <p>Huecos libres: {a.slots.length ? slotsLine(a.slots) : "ninguno marcado"}</p>
                    {a.extra_days.map((x) => (
                      <p key={x.student_id}>
                        Si {nameOf(x.student_id)} quisiera un día más: {x.weekday === null
                          ? <strong>ningún día más</strong>
                          : <strong>{dayName(x.weekday).toLowerCase()} {x.start}–{x.end}</strong>}
                        {x.weekday !== null && x.arrive && x.arrive !== "si" ? ` (llega a tiempo: ${ARRIVE_LABEL[x.arrive as Arrive].toLowerCase()})` : ""}
                      </p>
                    ))}
                    {a.notes && <p>Nota: «{a.notes}»</p>}
                  </>
                )}
                {a && !sent && a.slots.length > 0 && <p>Huecos (formulario antiguo): {slotsLine(a.slots)}</p>}
                {admin && (
                  <>
                    <button type="button" className={btnLight} onClick={() => setEditing(editing === m.id ? null : m.id)}>
                      {editing === m.id ? "Cerrar" : "Ver o editar"}
                    </button>
                    {editing === m.id && (
                      <MentorAvailability mentorId={m.id} notify={(t) => { notify(t, /^No /.test(t) ? "error" : "success"); void load(); }} />
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><MapPin className="h-5 w-5" /> Dirección de clase de cada alumno</h2>
        <p className="text-xs text-[#6D6962]">
          Calle y número donde se da la clase. Su mentor la ve en el formulario de disponibilidad (con enlace al mapa) para saber si llega a tiempo.
        </p>
        {students.length === 0 ? <p className="text-xs text-[#77736B]">No hay alumnos.</p> : (
          <ul className="space-y-2">
            {students.map((s) => (
              <li key={s.id} className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 space-y-1 text-xs font-semibold text-[#45433F]" htmlFor={`addr-${s.id}`}>
                  {s.name} <span className="font-normal text-[#77736B]">· {mentors.find((m) => m.id === s.mentorId)?.name ?? ""}{s.municipality ? ` · ${s.municipality}` : ""}</span>
                  <input id={`addr-${s.id}`} className={input} maxLength={200} value={addr[s.id] ?? ""} placeholder="Ej.: Calle Velázquez 20, 3º B, Madrid"
                    onChange={(e) => setAddr({ ...addr, [s.id]: e.target.value })} />
                </label>
                <button type="button" className={btnLight} disabled={busy || (addr[s.id] ?? "") === s.address} onClick={() => void saveAddress(s)}>Guardar</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin && (
        <section className={`${card} space-y-3`}>
          <h2 className="font-serif text-lg font-bold text-[#292825]">Zonas que pueden marcar los mentores</h2>
          <p className="text-xs text-[#6D6962]">Una zona por línea. Es la lista que ven los mentores en el paso 3 del formulario (también pueden escribir otra).</p>
          <label className="sr-only" htmlFor="zonas-mentores">Zonas</label>
          <textarea id="zonas-mentores" className={input} rows={8} value={zonesText} onChange={(e) => setZonesText(e.target.value)} />
          <button type="button" className={btnDark} disabled={busy} onClick={() => void saveZones()}>Guardar zonas</button>
        </section>
      )}
    </div>
  );
}
