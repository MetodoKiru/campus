"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock, ExternalLink, Video } from "lucide-react";
import { call } from "@/components/mentor/MentorSteps";
import {
  DAY_SLOTS, MEETING_DURATION_MINUTES, MEETING_STATUS_LABEL, WEEK_DAYS,
  formatDay, formatMeetingDate, formatMeetingTime,
  type DaySlot, type MentorMeeting, type MentorMeetingsData, type WeekDay,
} from "@/lib/growth";

const primaryButton = "inline-flex items-center gap-1.5 rounded-xl bg-[#242321] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#3A3835] disabled:opacity-50";
const secondaryButton = "inline-flex items-center gap-1.5 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] px-4 py-2.5 text-xs font-bold text-[#45433F] transition hover:bg-[#F3F0EA] disabled:opacity-50";

const STATUS_STYLE: Record<MentorMeeting["status"], string> = {
  confirmada: "bg-[#242321] text-white border-[#242321]",
  realizada: "bg-[#F3EEE5] text-[#806C50] border-[#E4D8C5]",
  cancelada: "bg-white text-[#9A4B3F] border-[#D9B3AA]",
};

/**
 * «Reuniones con tu coordinador» (menú ☰ del mentor): la reunión mensual de su
 * grupo, que convoca a mano el coordinador, y las preferencias del mentor.
 */
export default function MentorMeetings({ notify }: { notify: (text: string) => void }) {
  const [data, setData] = useState<MentorMeetingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    try { setData(await call<MentorMeetingsData>("/api/mentor/reuniones")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar tus reuniones."); }
  }, []);
  useEffect(() => {
    let alive = true;
    call<MentorMeetingsData>("/api/mentor/reuniones")
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "No se pudieron cargar tus reuniones."); });
    return () => { alive = false; };
  }, []);

  const upcoming = data?.meetings.filter((m) => m.status === "confirmada" && new Date(m.scheduledAt).getTime() + m.durationMinutes * 60000 > now)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)) ?? [];
  const past = data?.meetings.filter((m) => !upcoming.includes(m)) ?? [];

  return (
    <section className="space-y-5 rounded-3xl border border-[#E7E3DC] bg-white p-6 shadow-xs sm:p-8">
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C50]">Coordinación</span>
        <h2 className="mt-0.5 font-serif text-xl font-bold text-[#292825]">Reuniones con tu coordinador</h2>
      </div>

      <div className="space-y-1.5 text-sm leading-relaxed text-[#45433F]">
        <p>Una vez al mes, tu coordinador reúne por Zoom a su grupo de mentores durante {MEETING_DURATION_MINUTES} minutos para compartir avances, dificultades, buenas prácticas, dudas, propuestas y aspectos de la metodología.</p>
        <p>Se entra con la cámara encendida y participando. {data?.mandatory ? <strong className="font-semibold text-[#292825]">Como tienes alumnos activos, tu asistencia es obligatoria.</strong> : "Es obligatoria para los mentores con alumnos activos."}</p>
      </div>

      {error && <p className="rounded-2xl border border-[#D9B3AA] bg-white p-4 text-xs text-[#9A4B3F]">{error}</p>}
      {!data && !error && <p className="text-xs text-[#77736B]">Cargando…</p>}

      {data && (
        <>
          {!data.coordinatorName && (
            <p className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-xs text-[#555149]">Todavía no tienes coordinador asignado. Cuando administración te asigne uno, aquí verás vuestras reuniones.</p>
          )}

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#555149]">Próxima reunión</h3>
            {upcoming.length === 0 ? (
              <p className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-xs text-[#77736B]">
                {data.coordinatorName ? `${data.coordinatorName} aún no ha convocado la reunión de este mes. Te aparecerá aquí cuando la confirme.` : "No hay reuniones convocadas."}
              </p>
            ) : upcoming.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} />)}
          </div>

          <AvailabilityForm data={data} reload={load} notify={notify} />

          {past.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#555149]">Reuniones anteriores</h3>
              {past.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function MeetingCard({ meeting }: { meeting: MentorMeeting }) {
  const live = meeting.status === "confirmada";
  return (
    <article className={`space-y-3 rounded-2xl border p-4 sm:p-5 ${live ? "border-[#D9C8AE] bg-white" : "border-[#E7E3DC] bg-[#FAF8F5]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-bold text-[#292825]">{formatMeetingDate(meeting.scheduledAt)}</p>
        <span className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[meeting.status]}`}>{MEETING_STATUS_LABEL[meeting.status]}</span>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="flex items-center gap-1.5 text-xs font-semibold text-[#77736B]"><Clock className="h-3.5 w-3.5" aria-hidden /> Hora</dt>
        <dd className="text-[#292825]">{formatMeetingTime(meeting.scheduledAt)} (hora de España peninsular)</dd>
        <dt className="flex items-center gap-1.5 text-xs font-semibold text-[#77736B]"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> Duración</dt>
        <dd className="text-[#292825]">{meeting.durationMinutes} minutos</dd>
        <dt className="text-xs font-semibold text-[#77736B]">Coordinador/a</dt>
        <dd className="text-[#292825]">{meeting.coordinatorName}</dd>
        {meeting.agenda && <><dt className="text-xs font-semibold text-[#77736B]">Temas previstos</dt><dd className="whitespace-pre-line text-[#292825]">{meeting.agenda}</dd></>}
        {meeting.cancelReason && <><dt className="text-xs font-semibold text-[#77736B]">Motivo</dt><dd className="text-[#292825]">{meeting.cancelReason}</dd></>}
      </dl>
      {live && meeting.zoomUrl && (
        <a href={meeting.zoomUrl} target="_blank" rel="noopener noreferrer" className={primaryButton}>
          <Video className="h-3.5 w-3.5" /> Entrar en Zoom <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </article>
  );
}

function AvailabilityForm({ data, reload, notify }: { data: MentorMeetingsData; reload: () => Promise<void>; notify: (text: string) => void }) {
  const [days, setDays] = useState<WeekDay[]>(data.availability.days);
  const [slots, setSlots] = useState<DaySlot[]>(data.availability.slots);
  const [notes, setNotes] = useState(data.availability.notes);
  const [busy, setBusy] = useState(false);
  const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = async () => {
    if (!days.length || !slots.length) { notify("No has marcado ningún día o ninguna franja."); return; }
    setBusy(true);
    try {
      await call("/api/mentor/reuniones", { method: "PUT", body: { days, slots, notes } });
      await reload();
      notify("Disponibilidad guardada. Tu coordinador la verá al elegir la fecha.");
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo guardar tu disponibilidad."); }
    finally { setBusy(false); }
  };

  const chip = (selected: boolean) => `rounded-xl border px-3 py-2 text-xs font-semibold transition ${selected ? "border-[#D9C8AE] bg-[#F3EEE5] text-[#4A4032]" : "border-[#E7E3DC] bg-[#FAF8F5] text-[#6D6962] hover:bg-[#F3F0EA]"}`;

  return (
    <div className="space-y-4 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 sm:p-5">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#555149]">Tu disponibilidad para la reunión</h3>
        <p className="mt-1 text-xs text-[#77736B]">
          Marca los días y las franjas que mejor te vienen. Tu coordinador elige la fecha que encaja con la mayoría del grupo. Puedes cambiarlo cuando lo necesites.
          {data.availability.updatedAt ? ` Última actualización: ${formatDay(data.availability.updatedAt)}.` : ""}
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Días de la semana</legend>
        <div className="flex flex-wrap gap-2">
          {WEEK_DAYS.map((day) => (
            <button key={day.id} type="button" aria-pressed={days.includes(day.id)} onClick={() => setDays(toggle(days, day.id))} className={chip(days.includes(day.id))}>{day.label}</button>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Horarios preferidos</legend>
        <div className="flex flex-wrap gap-2">
          {DAY_SLOTS.map((slot) => (
            <button key={slot.id} type="button" aria-pressed={slots.includes(slot.id)} onClick={() => setSlots(toggle(slots, slot.id))} className={chip(slots.includes(slot.id))}>{slot.label}</button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1">
        <label htmlFor="disponibilidad-notas" className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Algo más (opcional)</label>
        <textarea id="disponibilidad-notas" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2}
          placeholder="Ej.: los jueves solo a partir de las 18:00"
          className="w-full rounded-xl border border-[#E7E3DC] bg-white p-2.5 text-xs text-[#45433F] focus:outline-none" />
      </div>
      <button type="button" disabled={busy} onClick={save} className={data.availability.updatedAt ? secondaryButton : primaryButton}>
        {busy ? "Guardando…" : data.availability.updatedAt ? "Actualizar mi disponibilidad" : "Guardar mi disponibilidad"}
      </button>
    </div>
  );
}
