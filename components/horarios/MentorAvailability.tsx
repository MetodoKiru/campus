"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/skillcoins";
import type { WeeklySlot } from "@/lib/database.types";
import { btnDark, card, input, subtle } from "@/components/classes/shared";
import { dayName, fromMinutes, longDate, toMinutes } from "@/lib/horarios";
import {
  ARRIVE_LABEL, DAY_STARTS, EXTRA_DAYS, TRANSPORT_LABEL, chipsToSlots, slotsToChips, type Arrive, type ExtraDay, type Transport,
} from "@/lib/disponibilidad";

type Busy = { weekday: number; start: number; end: number; student: string; studentId: string };
type Renewal = { studentId: string; name: string; periodEnd: string; address: string; municipality: string };
type Extra = { weekday: number | null; start: string; arrive: Arrive } | null;

const chip = (on: boolean, extra = "") =>
  `rounded-full border px-3 py-1.5 text-xs transition-colors ${on ? "border-[#242321] bg-[#242321] text-white" : "border-[#E4D8C5] bg-white text-[#292825] hover:bg-[#F6F1E8]"} ${extra}`;
const bigBtn = (on: boolean) =>
  `flex flex-col gap-0.5 rounded-xl border p-3 text-left text-sm font-semibold ${on ? "border-[#242321] ring-1 ring-[#242321]" : "border-[#E4D8C5]"} bg-white`;
const stepLabel = "text-[10px] font-semibold uppercase tracking-wider text-[#77736B]";

/**
 * «Mi disponibilidad para clases» (versión 2, 15/11/2026). Un formulario por pasos:
 * 1. ¿Puedes seguir con tus clases de siempre? (si no, avisa al coordinador)
 * — Si un alumno suyo renueva pronto: si quisiera un día más, ¿qué día podrías?
 * 2. Desde dónde sale y cómo se mueve. 3. Zonas. 4. Huecos libres (sin mañanas entre semana).
 * Al enviarlo, su coordinador recibe un correo con el resumen.
 * `mentorId` lo usa administración para editar la de otro mentor (sin avisar al coordinador).
 */
export default function MentorAvailability({ notify, mentorId }: { notify: (text: string) => void; mentorId?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy[]>([]);
  const [zonesList, setZonesList] = useState<string[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);

  const [keeps, setKeeps] = useState<boolean | null>(null);
  const [keepsNote, setKeepsNote] = useState("");
  const [from, setFrom] = useState("");
  const [fromWeekend, setFromWeekend] = useState("");
  const [transport, setTransport] = useState<Set<Transport>>(new Set());
  const [zones, setZones] = useState<Set<string>>(new Set());
  const [otherZone, setOtherZone] = useState("");
  const [chips, setChips] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [extra, setExtra] = useState<Record<string, Extra>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const id = mentorId ?? user?.id;
    if (!id) return;
    const [{ data: avail }, { data: slots }, { data: zl }, { data: checks }] = await Promise.all([
      supabase.from("kiru_mentor_class_availability").select("*").eq("mentor_id", id).maybeSingle(),
      supabase.from("kiru_student_schedule_slots").select("student_id,weekday,start_time,end_time").eq("mentor_id", id).eq("is_active", true),
      supabase.rpc("kiru_zonas_mentores"),
      supabase.from("kiru_availability_checks").select("student_id,period_end").eq("mentor_id", id)
        .is("family_released_at", null).gte("period_end", new Date().toISOString().slice(0, 10)).order("period_end"),
    ]);
    const studentIds = [...new Set([...(slots ?? []).map((s) => s.student_id), ...(checks ?? []).map((c) => c.student_id)])];
    const [{ data: people }, { data: studs }] = studentIds.length
      ? await Promise.all([
        supabase.from("profiles").select("id,full_name").in("id", studentIds),
        supabase.from("students").select("profile_id,class_address,municipality").in("profile_id", studentIds),
      ])
      : [{ data: [] as { id: string; full_name: string }[] }, { data: [] as { profile_id: string; class_address: string; municipality: string }[] }];
    const name = new Map((people ?? []).map((p) => [p.id, (p.full_name || "").split(" ")[0] || "Alumno"]));
    setBusy((slots ?? []).map((s) => ({
      weekday: s.weekday, start: toMinutes(String(s.start_time).slice(0, 5)), end: toMinutes(String(s.end_time).slice(0, 5)),
      student: name.get(s.student_id) ?? "Alumno", studentId: s.student_id,
    })));
    const seen = new Set<string>();
    setRenewals((checks ?? []).filter((c) => !seen.has(c.student_id) && seen.add(c.student_id)).map((c) => {
      const st = (studs ?? []).find((x) => x.profile_id === c.student_id);
      return { studentId: c.student_id, name: name.get(c.student_id) ?? "Alumno", periodEnd: c.period_end, address: st?.class_address ?? "", municipality: st?.municipality ?? "" };
    }));
    const list = Array.isArray(zl) ? (zl as unknown[]).filter((z): z is string => typeof z === "string") : [];
    setZonesList(list);
    if (avail) {
      setFrom(avail.from_place ?? "");
      setFromWeekend(avail.from_place_weekend ?? "");
      setTransport(new Set((avail.transport ?? []) as Transport[]));
      setZones(new Set(avail.zones ?? []));
      setOtherZone((avail.zones ?? []).filter((z: string) => !list.includes(z)).join(", "));
      setChips(slotsToChips((avail.slots ?? []) as WeeklySlot[]));
      setNotes(avail.notes ?? "");
      setSentAt(avail.submitted_at ?? null);
      const prev: Record<string, Extra> = {};
      for (const x of (avail.extra_days ?? []) as ExtraDay[]) {
        prev[x.student_id] = x.weekday === null ? { weekday: null, start: "", arrive: "si" } : { weekday: x.weekday, start: x.start ?? "", arrive: x.arrive ?? "si" };
      }
      setExtra(prev);
    }
    setLoaded(true);
  }, [mentorId]);

  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const busyAt = (d: number, start: string) => {
    const s = toMinutes(start);
    return busy.find((b) => b.weekday === d && b.start < s + 60 && b.end > s);
  };
  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  const studentDays = useMemo(() => {
    const m = new Map<string, Busy[]>();
    for (const b of busy) m.set(b.studentId, [...(m.get(b.studentId) ?? []), b]);
    return m;
  }, [busy]);

  const send = async () => {
    setError("");
    if (keeps === null) { setError("Contesta el paso 1: si puedes seguir con tus clases de siempre."); return; }
    if (!keeps && !keepsNote.trim()) { setError("Cuéntanos qué clase ya no puedes dar y desde cuándo."); return; }
    const missing = renewals.find((r) => !extra[r.studentId] || (extra[r.studentId]?.weekday !== null && !extra[r.studentId]?.start));
    if (missing) { setError(`Dinos qué otro día podrías ir a casa de ${missing.name} (o «Ningún día más»).`); return; }
    const allZones = [...zones].filter((z) => zonesList.includes(z))
      .concat(otherZone.split(",").map((z) => z.trim()).filter(Boolean));
    setSaving(true);
    const payload = {
      keeps, keeps_note: keeps ? "" : keepsNote.trim(), from: from.trim(), from_weekend: fromWeekend.trim(),
      transport: [...transport], zones: allZones, slots: chipsToSlots(chips), notes: notes.trim(),
      extra: renewals.map((r) => {
        const x = extra[r.studentId];
        return x?.weekday === null || !x ? { student_id: r.studentId, weekday: null } : { student_id: r.studentId, weekday: x.weekday, start: x.start, arrive: x.arrive };
      }),
    };
    const { error: err } = await supabase.rpc("kiru_disponibilidad_enviar", { p: payload, ...(mentorId ? { p_mentor: mentorId } : {}) });
    setSaving(false);
    if (err) { notify(`No se pudo guardar: ${errorText(err)}`); return; }
    notify(mentorId ? "Disponibilidad guardada." : "¡Gracias! Guardado. Tu coordinador/a ya tiene el resumen en su correo.");
    await load();
  };

  if (!loaded) return <section className={card}><p className="text-xs text-[#77736B]">Cargando…</p></section>;

  return (
    <section className="space-y-3" aria-label="Disponibilidad para clases">
      <div className={`${card} space-y-1`}>
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><Clock className="h-5 w-5" /> Mi disponibilidad para clases</h2>
        <p className="text-xs text-[#6D6962]">
          Son 2 minutos. Con esto tu coordinador/a sabe si puedes seguir igual, a qué zonas llegas y qué huecos tienes.
          {" "}<strong>Marcar huecos no te compromete a dar más clases.</strong>
        </p>
        <p className="text-[11px] text-[#77736B]">{sentAt ? `Último envío: ${new Date(sentAt).toLocaleDateString("es-ES")}. Revísala cada mes.` : "Todavía no la has enviado."}</p>
      </div>

      {/* Paso 1 */}
      <div className={`${card} space-y-2`}>
        <p className={stepLabel}>Paso 1 de 4</p>
        <h3 className="font-serif text-base font-bold text-[#292825]">¿Puedes seguir con tus clases de siempre?</h3>
        <p className="text-xs text-[#6D6962]">Solo las que ya tienes: mismos alumnos, días y horas. Lo de añadir días va aparte.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={keeps === true} className={bigBtn(keeps === true)} onClick={() => setKeeps(true)}>
            Sí, sigo igual<span className="text-[11px] font-normal text-[#6D6962]">Puedo dar mis clases de siempre</span>
          </button>
          <button type="button" aria-pressed={keeps === false} className={bigBtn(keeps === false)} onClick={() => setKeeps(false)}>
            No, ya no puedo alguna<span className="text-[11px] font-normal text-[#6D6962]">Por ejemplo, me han cambiado el horario de la uni</span>
          </button>
        </div>
        {keeps === false && (
          <div className="space-y-2">
            <label className="block space-y-1 text-xs font-semibold text-[#45433F]" htmlFor="disp-keeps-note">
              ¿Qué clase ya no puedes dar y desde cuándo?
              <textarea id="disp-keeps-note" className={input} rows={2} maxLength={500} value={keepsNote} onChange={(e) => setKeepsNote(e.target.value)}
                placeholder="Ej.: desde el 1 de diciembre tengo prácticas los miércoles hasta las 19:30" />
            </label>
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Tu coordinador/a recibirá un correo hoy mismo para buscar contigo una solución antes de tocar nada con la familia.</p>
          </div>
        )}
      </div>

      {/* Renovaciones: ¿un día más? */}
      {renewals.map((r) => {
        const x = extra[r.studentId];
        const theirDays = new Set((studentDays.get(r.studentId) ?? []).map((b) => b.weekday));
        const current = (studentDays.get(r.studentId) ?? []).map((b) => `${dayName(b.weekday).toLowerCase()} ${fromMinutes(b.start)}–${fromMinutes(b.end)}`);
        return (
          <div key={r.studentId} className={`${card} space-y-2 border-2 border-[#E4D8C5]`}>
            <p className={stepLabel}>Pensando en la renovación de {r.name} (fin el {longDate(r.periodEnd)})</p>
            <h3 className="font-serif text-base font-bold text-[#292825]">Si la familia de {r.name} quisiera un día más, ¿qué otro día podrías ir?</h3>
            <p className="text-xs text-[#6D6962]">Es solo por si acaso: la familia todavía no ha elegido. Lo que marques aquí es lo que le ofreceremos.</p>
            <div className={`${subtle} space-y-0.5 text-xs text-[#45433F]`}>
              <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />
                <strong>{r.address || r.municipality || "Dirección sin apuntar (pídesela a tu coordinador/a)"}</strong>
                {r.address && <a className="ml-1 underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`}>ver en el mapa</a>}
              </p>
              {current.length > 0 && <p>Tus clases con {r.name}: <strong>{current.join(", ")}</strong></p>}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Día extra para ${r.name}`}>
              {EXTRA_DAYS.filter((d) => !theirDays.has(d)).map((d) => (
                <button key={d} type="button" aria-pressed={x?.weekday === d} className={chip(x?.weekday === d)}
                  onClick={() => setExtra({ ...extra, [r.studentId]: { weekday: d, start: x?.weekday === d ? x.start : "", arrive: x?.arrive ?? "si" } })}>
                  {dayName(d)}
                </button>
              ))}
              <button type="button" aria-pressed={x?.weekday === null} className={chip(x?.weekday === null)}
                onClick={() => setExtra({ ...extra, [r.studentId]: { weekday: null, start: "", arrive: "si" } })}>Ningún día más</button>
            </div>
            {x && x.weekday !== null && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold text-[#45433F]" htmlFor={`disp-extra-h-${r.studentId}`}>¿A qué hora?
                  <select id={`disp-extra-h-${r.studentId}`} className={input} value={x.start} onChange={(e) => setExtra({ ...extra, [r.studentId]: { ...x, start: e.target.value } })}>
                    <option value="">Elige la hora</option>
                    {DAY_STARTS(x.weekday).filter((s) => !busyAt(x.weekday as number, s)).map((s) => (
                      <option key={s} value={s}>{s}–{fromMinutes(toMinutes(s) + 60)}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-[#45433F]" htmlFor={`disp-extra-a-${r.studentId}`}>¿Llegas a tiempo desde donde estés antes?
                  <select id={`disp-extra-a-${r.studentId}`} className={input} value={x.arrive} onChange={(e) => setExtra({ ...extra, [r.studentId]: { ...x, arrive: e.target.value as Arrive } })}>
                    {(Object.keys(ARRIVE_LABEL) as Arrive[]).map((a) => <option key={a} value={a}>{ARRIVE_LABEL[a]}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        );
      })}

      {/* Paso 2 */}
      <div className={`${card} space-y-2`}>
        <p className={stepLabel}>Paso 2 de 4</p>
        <h3 className="font-serif text-base font-bold text-[#292825]">¿Desde dónde sales y cómo te mueves?</h3>
        <p className="text-xs text-[#6D6962]">Así vemos si llegas a tiempo de una clase a otra.</p>
        <label className="block space-y-1 text-xs font-semibold text-[#45433F]" htmlFor="disp-from">Normalmente salgo desde
          <input id="disp-from" className={input} maxLength={150} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Barrio, municipio o lugar (casa, universidad, trabajo…)" />
        </label>
        <label className="block space-y-1 text-xs font-semibold text-[#45433F]" htmlFor="disp-from-we">Los fines de semana salgo desde <span className="font-normal text-[#77736B]">(si es distinto)</span>
          <input id="disp-from-we" className={input} maxLength={150} value={fromWeekend} onChange={(e) => setFromWeekend(e.target.value)} placeholder="Ej.: Majadahonda (casa de mis padres)" />
        </label>
        <p className="text-xs font-semibold text-[#45433F]">Me desplazo en</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Medio de transporte">
          {(Object.keys(TRANSPORT_LABEL) as Transport[]).map((t) => (
            <button key={t} type="button" aria-pressed={transport.has(t)} className={chip(transport.has(t))} onClick={() => setTransport(toggle(transport, t))}>{TRANSPORT_LABEL[t]}</button>
          ))}
        </div>
      </div>

      {/* Paso 3 */}
      <div className={`${card} space-y-2`}>
        <p className={stepLabel}>Paso 3 de 4</p>
        <h3 className="font-serif text-base font-bold text-[#292825]">¿A qué zonas puedes ir a dar clase?</h3>
        <p className="text-xs text-[#6D6962]">Marca todas a las que llegarías sin problema.</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Zonas">
          {zonesList.map((z) => (
            <button key={z} type="button" aria-pressed={zones.has(z)} className={chip(zones.has(z))} onClick={() => setZones(toggle(zones, z))}>{z}</button>
          ))}
        </div>
        <label className="block space-y-1 text-xs font-semibold text-[#45433F]" htmlFor="disp-zone-other">Otra zona <span className="font-normal text-[#77736B]">(opcional, separadas por comas)</span>
          <input id="disp-zone-other" className={input} maxLength={200} value={otherZone} onChange={(e) => setOtherZone(e.target.value)} placeholder="Ej.: Tres Cantos" />
        </label>
      </div>

      {/* Paso 4 */}
      <div className={`${card} space-y-3`}>
        <p className={stepLabel}>Paso 4 de 4</p>
        <h3 className="font-serif text-base font-bold text-[#292825]">¿Qué huecos tienes libres?</h3>
        <p className="text-xs text-[#6D6962]">
          Pulsa las horas a las que podrías <strong>empezar</strong> una clase (dura 1 hora; la última es de 19:30 a 20:30).
          Entre semana solo hay clases por la tarde y los viernes no hay clase. Las horas son las de estar ya en casa del alumno.
        </p>
        <div className="flex flex-wrap gap-3 text-[11px] text-[#6D6962]">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-[3px] bg-[#242321]" /> Libre</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-[3px] bg-[#D9D3C9]" /> Ya tienes clase</span>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 6, 7].map((d) => (
            <div key={d} className="space-y-1.5 border-t border-[#EEEAE3] pt-2 first:border-0 first:pt-0">
              <p className="flex items-baseline justify-between text-xs font-semibold text-[#292825]">
                {dayName(d)} <span className="font-normal text-[#77736B]">{d >= 6 ? "mañana y tarde" : "solo tarde"}</span>
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={dayName(d)}>
                {DAY_STARTS(d).map((s) => {
                  const b = busyAt(d, s);
                  const key = `${d}-${s}`;
                  const end = fromMinutes(toMinutes(s) + 60);
                  if (b) return <span key={key} className="rounded-full border border-[#D9D3C9] bg-[#D9D3C9] px-3 py-1.5 text-xs text-[#45433F]">{s}–{end} · {b.student}</span>;
                  return <button key={key} type="button" aria-pressed={chips.has(key)} className={chip(chips.has(key))} onClick={() => setChips(toggle(chips, key))}>{s}–{end}</button>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${card} space-y-3`}>
        <label className="block space-y-1 text-xs font-semibold text-[#45433F]" htmlFor="disp-notes">¿Algo más que deba saber tu coordinador/a? <span className="font-normal text-[#77736B]">(opcional)</span>
          <textarea id="disp-notes" className={input} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej.: en enero tengo exámenes y prefiero no coger más alumnos" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{error}</p>}
        <button type="button" className={btnDark} disabled={saving} onClick={() => void send()}>
          {saving ? "Enviando…" : "Enviar mi disponibilidad"}
        </button>
      </div>
    </section>
  );
}
