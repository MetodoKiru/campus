"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock, ExternalLink, Video } from "lucide-react";
import { call } from "@/components/mentor/MentorSteps";
import AvailabilityGrid from "@/components/growth/AvailabilityGrid";
import {
  MEETING_DURATION_MINUTES, MEETING_STATUS_LABEL,
  cellsDuration, deadlineOpen, formatDay, formatMeetingDate, formatMeetingTime,
  type MentorMeeting, type MentorMeetingsData,
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
  const [cells, setCells] = useState<string[]>(data.availability.cells);
  const [notes, setNotes] = useState(data.availability.notes);
  const [busy, setBusy] = useState(false);
  const saved = data.availability.cells;
  const changed = cells.length !== saved.length || cells.some((c) => !saved.includes(c)) || notes !== data.availability.notes;
  const request = data.request;
  const requestOpen = request && !request.respondedAt;

  const save = async () => {
    if (!cells.length) { notify("Marca al menos una casilla en la que puedas asistir."); return; }
    setBusy(true);
    try {
      await call("/api/mentor/reuniones", { method: "PUT", body: { cells, notes } });
      await reload();
      notify("Disponibilidad guardada. Tu coordinador la verá al elegir la fecha.");
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo guardar tu disponibilidad."); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 sm:p-5">
      <div className="space-y-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#555149]">Tu disponibilidad para la reunión</h3>
        <p className="text-xs leading-relaxed text-[#555149]">
          Marca <strong className="font-semibold text-[#292825]">todas las medias horas en las que de verdad puedes asistir</strong>. Cuantas más opciones reales des, más fácil es encontrar una hora en la que esté todo el grupo: es una forma de facilitar la coordinación y de mostrar tu implicación con el equipo.
        </p>
        <p className="text-xs leading-relaxed text-[#77736B]">Marca solo lo que puedas cumplir: no hace falta marcar horas por compromiso. Toca una casilla para marcarla o desmarcarla; toca el día o la hora para marcar la columna o la fila entera.</p>
      </div>

      {request && (
        <p className={`rounded-xl border p-3 text-xs ${requestOpen ? "border-[#D9C8AE] bg-white text-[#4A4032]" : "border-[#E7E3DC] bg-white text-[#6D6962]"}`}>
          {requestOpen
            ? <>Tu coordinador te pide revisar tu disponibilidad antes del <strong>{formatDay(request.deadline)}</strong>{deadlineOpen(request.deadline) ? "." : " (el plazo ya ha pasado, pero aún puedes actualizarla)."}{request.message ? ` «${request.message}»` : ""} Guarda la cuadrícula aunque no cambies nada para confirmar que está al día.</>
            : <>Revisaste tu disponibilidad el {formatDay(request.respondedAt)} tras la petición de tu coordinador. ¡Gracias!</>}
        </p>
      )}

      <AvailabilityGrid value={cells} onChange={setCells} disabled={busy} />

      <p className="text-xs text-[#555149]">
        {cells.length
          ? <>Has marcado <strong className="font-semibold text-[#292825]">{cells.length} medias horas</strong> ({cellsDuration(cells.length)} a la semana).</>
          : "Todavía no has marcado ninguna casilla."}
        {data.availability.updatedAt ? ` Última actualización: ${formatDay(data.availability.updatedAt)}.` : ""}
      </p>

      <div className="space-y-1">
        <label htmlFor="disponibilidad-notas" className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Algo más (opcional)</label>
        <textarea id="disponibilidad-notas" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2}
          placeholder="Ej.: en diciembre solo puedo por las tardes"
          className="w-full rounded-xl border border-[#E7E3DC] bg-white p-2.5 text-xs text-[#45433F] focus:outline-none" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || (!changed && !requestOpen)} onClick={save} className={primaryButton}>
          {busy ? "Guardando…" : data.availability.updatedAt ? (changed ? "Guardar cambios" : "Confirmar que está al día") : "Guardar mi disponibilidad"}
        </button>
        {changed && data.availability.updatedAt && <button type="button" disabled={busy} onClick={() => { setCells(saved); setNotes(data.availability.notes); }} className={secondaryButton}>Deshacer cambios</button>}
      </div>
    </div>
  );
}
