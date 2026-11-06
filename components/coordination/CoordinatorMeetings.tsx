"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CalendarPlus, Copy, ExternalLink, FolderOpen, Mail, Video } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AvailabilityGrid from "@/components/growth/AvailabilityGrid";
import {
  MEETING_DURATION_MINUTES, MEETING_REPORT_FORM_URL, MEETING_REPORT_HOURS, MEETING_STATUS_LABEL, RECORDINGS_FOLDER_URL, ZOOM_RECORDING_WARNING,
  cellLabel, cellsDuration, formatDay, formatMeetingDate, formatMeetingTime, googleCalendarUrl, isoToMadridLocal, madridToday,
  meetingInvitationText, nextDateForCell, rankSlots, reportDeadline,
  type Availability, type AvailabilityRequest, type CoordinatorMeetingsData, type GroupMentor, type MeetingStatus, type StaffMeeting,
} from "@/lib/growth";

type Notify = (text: string, type: "success" | "error") => void;
type Group = CoordinatorMeetingsData["coordinators"][number];

const button = "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const darkButton = "inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50";
const input = "w-full rounded-xl border border-slate-200 bg-[#F7F6F3] p-2.5 text-xs text-slate-800 focus:outline-none";

const STATUS_STYLE: Record<MeetingStatus, string> = {
  borrador: "bg-slate-100 text-slate-600",
  confirmada: "bg-emerald-100 text-emerald-800",
  realizada: "bg-cyan-50 text-cyan-800",
  cancelada: "bg-rose-50 text-rose-700",
};

/**
 * Reuniones mensuales de coordinación en el panel del coordinador: la
 * disponibilidad de SU grupo, la reunión que él fija y confirma a mano, la
 * convocatoria (la envía él) y el registro posterior en Jotform.
 * Administración lo ve todo, sin poder cambiar nada.
 */
export default function CoordinatorMeetings({ notify }: { notify: Notify }) {
  const [data, setData] = useState<CoordinatorMeetingsData | null>(null);
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const response = await fetch(path, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Ha ocurrido un error.");
    return result;
  }, []);

  const load = useCallback(async () => {
    try { setData(await api("/api/coordinador/reuniones") as CoordinatorMeetingsData); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudieron cargar las reuniones.", "error"); }
  }, [api, notify]);
  useEffect(() => {
    let alive = true;
    api("/api/coordinador/reuniones")
      .then((result) => { if (alive) setData(result as CoordinatorMeetingsData); })
      .catch((e) => { if (alive) notify(e instanceof Error ? e.message : "No se pudieron cargar las reuniones.", "error"); });
    return () => { alive = false; };
  }, [api, notify]);

  const run = async (action: () => Promise<unknown>, ok: string) => {
    if (busy) return false;
    setBusy(true);
    try { await action(); await load(); notify(ok, "success"); return true; }
    catch (e) { notify(e instanceof Error ? e.message : "Ha ocurrido un error.", "error"); return false; }
    finally { setBusy(false); }
  };

  if (!data) return <p className="rounded-3xl border border-[#E7E3DC] bg-white p-5 text-sm text-slate-500">Cargando reuniones…</p>;

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-3xl border border-[#E7E3DC] bg-white p-5 text-xs leading-relaxed text-slate-600 shadow-sm">
        <h2 className="font-serif text-lg font-bold text-slate-900">Reunión mensual de coordinación</h2>
        <p>Una reunión al mes, de {MEETING_DURATION_MINUTES} minutos, por Zoom. Obligatoria para los mentores con alumnos activos, con cámara encendida y participación activa: avances, dificultades, buenas prácticas, dudas, propuestas y metodología.</p>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>Marca tu disponibilidad en la cuadrícula y, si hace falta, pide a tu grupo que revise la suya con una fecha límite.</li>
          <li>Mira las coincidencias (ordenadas de más a menos mentores) y elige el horario. Decides tú.</li>
          <li>Crea la reunión de Zoom (o resérvala en tu Calendly gratuito con Zoom conectado), pega el enlace una sola vez y convócala: tus mentores la ven en su menú ☰.</li>
          <li>Envía la invitación con «Invitar con Google Calendar» (les llega por correo y se les añade al calendario) o con «Enviar por correo».</li>
          <li>Después: comprueba la grabación, súbela a la carpeta de Drive de Método Kiru, registra el enlace aquí y rellena el Jotform en las {MEETING_REPORT_HOURS} horas siguientes.</li>
        </ol>
      </section>

      <ZoomWarning />

      {data.coordinators.length === 0 && (
        <p className="rounded-3xl border border-[#E7E3DC] bg-white p-5 text-sm text-slate-500">No hay coordinadores con mentores asignados.</p>
      )}

      {data.coordinators.map((group) => (
        <GroupBlock
          key={group.id}
          group={group}
          meetings={data.meetings.filter((m) => m.coordinatorId === group.id)}
          canEdit={data.canEdit}
          showName={!data.canEdit}
          busy={busy}
          run={run}
          api={api}
        />
      ))}
    </div>
  );
}

function GroupBlock({ group, meetings, canEdit, showName, busy, run, api }: {
  group: Group;
  meetings: StaffMeeting[];
  canEdit: boolean;
  showName: boolean;
  busy: boolean;
  run: (action: () => Promise<unknown>, ok: string) => Promise<boolean>;
  api: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>;
}) {
  const [creating, setCreating] = useState<string | null>(null);
  // Pendientes: por celebrar o celebradas sin registro todavía.
  const active = meetings.filter((m) => m.status === "borrador" || m.status === "confirmada" || (m.status === "realizada" && (!m.reportSentAt || !m.recordingUrl))).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const done = meetings.filter((m) => !active.includes(m));

  return (
    <section className="space-y-4 rounded-3xl border border-[#E7E3DC] bg-white p-5 shadow-sm sm:p-6">
      {showName && <h2 className="font-serif text-lg font-bold text-slate-900">Grupo de {group.name || "coordinador sin nombre"}</h2>}
      {canEdit && <OwnAvailability availability={group.availability} busy={busy} run={run} api={api} />}
      {!canEdit && (
        <p className="text-xs text-slate-500">Disponibilidad del coordinador: {group.availability?.cells.length ? `${group.availability.cells.length} medias horas (${cellsDuration(group.availability.cells.length)})` : "sin indicar"}.</p>
      )}
      <Commitment mentors={group.mentors} requests={group.requests} canEdit={canEdit} busy={busy} run={run} api={api} />
      <Coincidences
        mentors={group.mentors}
        coordinatorCells={group.availability?.cells ?? []}
        canEdit={canEdit}
        onPick={(cell) => { setCreating(nextDateForCell(cell)); setTimeout(() => document.getElementById(`fijar-${group.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Reuniones</h3>
          {canEdit && creating === null && <button type="button" onClick={() => setCreating("")} className={darkButton}><CalendarDays className="h-3.5 w-3.5" /> Fijar reunión</button>}
        </div>
        {creating !== null && (
          <div id={`fijar-${group.id}`}>
            <MeetingForm
              key={creating}
              busy={busy}
              initial={{ scheduledAt: creating, zoomUrl: "", agenda: "" }}
              onCancel={() => setCreating(null)}
              onSave={async (values, confirm) => {
                const ok = await run(() => api("/api/coordinador/reuniones", { method: "POST", body: { ...values, confirm } }), confirm ? "Reunión convocada. Ya la ven tus mentores. Envíales ahora la invitación." : "Reunión guardada sin convocar.");
                if (ok) setCreating(null);
              }}
            />
          </div>
        )}
        {active.length === 0 && creating === null && <p className="text-xs text-slate-500">No hay ninguna reunión pendiente.{canEdit ? " Fija la del mes cuando hayas visto la disponibilidad del grupo." : ""}</p>}
        {active.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} group={group} canEdit={canEdit} busy={busy} run={run} api={api} />)}
        {done.length > 0 && (
          <details className="rounded-2xl border border-slate-100 bg-[#F7F6F3] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">Reuniones anteriores ({done.length})</summary>
            <div className="mt-3 space-y-3">{done.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} group={group} canEdit={canEdit} busy={busy} run={run} api={api} />)}</div>
          </details>
        )}
      </div>
    </section>
  );
}

type Run = (action: () => Promise<unknown>, ok: string) => Promise<boolean>;
type Api = (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>;

/** Aviso de grabación que pidió dirección, y cómo se graba con Zoom gratuito. */
function ZoomWarning() {
  return (
    <section className="space-y-2 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-xs leading-relaxed text-amber-950 shadow-sm">
      <p className="flex items-start gap-2 text-sm font-bold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {ZOOM_RECORDING_WARNING}</p>
      <details>
        <summary className="cursor-pointer font-semibold">Cómo se graba con una cuenta gratuita de Zoom</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>La cuenta gratuita no graba en la nube: solo graba <strong>en tu ordenador</strong>, y solo desde la aplicación de escritorio de Zoom (Windows, Mac o Linux). Desde el móvil, la tableta o el navegador no se puede grabar.</li>
          <li>Abre la reunión como anfitrión desde la aplicación de escritorio y pulsa «Grabar» (o «Record») en la barra inferior. Verás el aviso de «Grabando» arriba a la izquierda.</li>
          <li>Al terminar, no cierres Zoom hasta que acabe de «convertir» la grabación. Se guarda en la carpeta Documentos › Zoom de tu ordenador (un archivo .mp4 con la fecha).</li>
          <li>Abre el archivo y comprueba que se ve y se oye. Súbelo a la carpeta de Drive de Método Kiru y no lo compartas con nadie más: el acceso es solo para Método Kiru.</li>
          <li>Las reuniones gratuitas de 3 o más personas se cortan a los 40 minutos: con 30 minutos hay margen, pero empieza puntual.</li>
        </ul>
      </details>
    </section>
  );
}

/** La cuadrícula del propio coordinador. */
function OwnAvailability({ availability, busy, run, api }: { availability: Availability | null; busy: boolean; run: Run; api: Api }) {
  const saved = availability?.cells ?? [];
  const [cells, setCells] = useState<string[]>(saved);
  const [open, setOpen] = useState(!saved.length);
  const changed = cells.length !== saved.length || cells.some((c) => !saved.includes(c));
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Tu disponibilidad</h3>
          <p className="text-[11px] text-slate-500">{saved.length ? `${saved.length} medias horas marcadas (${cellsDuration(saved.length)} a la semana). Las coincidencias solo cuentan estas horas.` : "Marca todas las medias horas en las que puedes celebrar la reunión. Mientras no marques nada, las coincidencias usan solo la disponibilidad de tus mentores."}</p>
        </div>
        {saved.length > 0 && <button type="button" onClick={() => setOpen(!open)} className={button}>{open ? "Cerrar" : "Cambiar"}</button>}
      </div>
      {open && (
        <>
          <AvailabilityGrid value={cells} onChange={setCells} disabled={busy} accent="slate" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !changed || !cells.length} onClick={async () => { if (await run(() => api("/api/coordinador/reuniones/disponibilidad", { method: "PUT", body: { cells } }), "Tu disponibilidad está guardada.")) setOpen(false); }} className={darkButton}>Guardar mi disponibilidad</button>
            {changed && <button type="button" disabled={busy} onClick={() => setCells(saved)} className={button}>Deshacer</button>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Seguimiento del compromiso con la disponibilidad: si la ha completado,
 * cuántas medias horas, cuándo la actualizó y si respondió a la petición en
 * plazo. Es información para el seguimiento cualitativo: sin puntuaciones ni
 * clasificaciones.
 */
function Commitment({ mentors, requests, canEdit, busy, run, api }: { mentors: GroupMentor[]; requests: AvailabilityRequest[]; canEdit: boolean; busy: boolean; run: Run; api: Api }) {
  const [asking, setAsking] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [message, setMessage] = useState("");
  const latest = requests[0] ?? null;

  if (mentors.length === 0) return <p className="text-xs text-slate-500">Todavía no tienes mentores asignados.</p>;
  const answered = mentors.filter((m) => m.availability?.cells.length);

  const responseText = (m: GroupMentor) => {
    if (!latest) return "—";
    const at = m.responses[latest.id];
    if (!at) return latest.deadline >= madridToday() ? "Pendiente" : "Sin responder (plazo vencido)";
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
    return `${formatDay(at)} · ${day <= latest.deadline ? "en plazo" : "fuera de plazo"}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Disponibilidad del grupo ({answered.length} de {mentors.length} la han completado)</h3>
        {canEdit && !asking && <button type="button" onClick={() => setAsking(true)} className={button}>Pedir que la revisen</button>}
      </div>
      {asking && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-[#F7F6F3] p-3">
          <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <label className="space-y-1 text-[11px] font-bold uppercase tracking-wider text-slate-500"><span>Fecha límite</span>
              <input type="date" value={deadline} min={madridToday()} onChange={(e) => setDeadline(e.target.value)} className={input} /></label>
            <label className="space-y-1 text-[11px] font-bold uppercase tracking-wider text-slate-500"><span>Mensaje (opcional)</span>
              <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Ej.: vamos a fijar la reunión de diciembre" className={input} /></label>
          </div>
          <p className="text-[11px] text-slate-500">Tus mentores verán la petición en su apartado de reuniones. Si quieres, avísales también por tu canal habitual.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !deadline} onClick={async () => { if (await run(() => api("/api/coordinador/reuniones/peticiones", { method: "POST", body: { deadline, message } }), "Petición enviada a tu grupo.")) { setAsking(false); setMessage(""); setDeadline(""); } }} className={darkButton}>Pedir a mi grupo</button>
            <button type="button" disabled={busy} onClick={() => setAsking(false)} className={button}>Cancelar</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="py-1.5 pr-3">Mentor</th>
              <th className="py-1.5 pr-3">Medias horas</th>
              <th className="py-1.5 pr-3">Actualizada</th>
              <th className="py-1.5">{latest ? `Petición (hasta el ${formatDay(latest.deadline)})` : "Petición"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mentors.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="py-2 pr-3 font-semibold text-slate-800">
                  {m.name}
                  <span className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${m.hasStudents ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{m.hasStudents ? "Obligatoria" : "Sin alumnos"}</span>
                  {m.availability?.notes && <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{m.availability.notes}</span>}
                </td>
                <td className="py-2 pr-3 text-slate-600">{m.availability?.cells.length ? `${m.availability.cells.length} (${cellsDuration(m.availability.cells.length)})` : <span className="text-slate-400">Sin completar</span>}</td>
                <td className="py-2 pr-3 text-slate-600">{m.availability?.cells.length && m.availability.updatedAt ? formatDay(m.availability.updatedAt) : "—"}</td>
                <td className="py-2 text-slate-600">{responseText(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">Para el seguimiento cualitativo de cada mentor: una disponibilidad amplia y real y responder a tiempo suman, pero no hay puntuación ni penalización automática.</p>
    </div>
  );
}

/** Horarios en los que coinciden el coordinador y su grupo, de más a menos mentores. */
function Coincidences({ mentors, coordinatorCells, canEdit, onPick }: { mentors: GroupMentor[]; coordinatorCells: string[]; canEdit: boolean; onPick: (cell: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const ranked = useMemo(() => rankSlots(mentors, coordinatorCells), [mentors, coordinatorCells]);
  if (!mentors.some((m) => m.availability?.cells.length)) return null;
  const best = ranked[0]?.available.length ?? 0;
  const visible = showAll ? ranked : ranked.slice(0, 12);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Coincidencias ({ranked.length} horarios posibles)</h3>
        <p className="text-[11px] text-slate-500">
          {ranked.length === 0
            ? "Ningún mentor coincide con las horas que has marcado. Amplía tu disponibilidad o pide a tu grupo que revise la suya."
            : best === mentors.length
              ? "Hay horarios en los que puede todo el grupo. La decisión es tuya."
              : `Ningún horario reúne a todo el grupo; el mejor reúne a ${best} de ${mentors.length}. Puedes elegir la mejor alternativa.`}
          {!coordinatorCells.length && " Aún no has marcado tu disponibilidad: se muestran todas las horas."}
        </p>
      </div>
      <ul className="space-y-2">
        {visible.map((slot) => (
          <li key={slot.cell} className="space-y-1.5 rounded-2xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">{cellLabel(slot.cell)}</p>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${slot.available.length === mentors.length ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{slot.available.length} de {mentors.length} · {slot.percent}%</span>
                {canEdit && <button type="button" onClick={() => onPick(slot.cell)} className={button}>Elegir este horario</button>}
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden><div className="h-full rounded-full bg-emerald-400" style={{ width: `${slot.percent}%` }} /></div>
            <p className="text-[11px] text-slate-600"><span className="font-semibold text-emerald-800">Pueden:</span> {slot.available.map((m) => m.name).join(", ")}</p>
            {slot.missing.length > 0 && <p className="text-[11px] text-slate-500"><span className="font-semibold text-rose-700">No pueden:</span> {slot.missing.map((m) => `${m.name}${m.hasStudents ? " (obligatoria)" : ""}`).join(", ")}</p>}
          </li>
        ))}
      </ul>
      {ranked.length > 12 && <button type="button" onClick={() => setShowAll(!showAll)} className={button}>{showAll ? "Ver solo los mejores" : `Ver los ${ranked.length} horarios`}</button>}
    </div>
  );
}

type FormValues = { scheduledAt: string; zoomUrl: string; agenda: string };

function MeetingForm({ initial, busy, onSave, onCancel, saveOnly }: {
  initial?: FormValues;
  busy: boolean;
  onSave: (values: FormValues, confirm: boolean) => void;
  onCancel: () => void;
  saveOnly?: boolean;
}) {
  const [values, setValues] = useState<FormValues>(initial ?? { scheduledAt: "", zoomUrl: "", agenda: "" });
  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues({ ...values, [key]: e.target.value });
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>Fecha y hora (España peninsular)</span>
          <input type="datetime-local" step={1800} value={values.scheduledAt} onChange={set("scheduledAt")} className={input} />
        </label>
        <label className="space-y-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>Enlace de Zoom</span>
          <input type="url" value={values.zoomUrl} onChange={set("zoomUrl")} placeholder="https://us02web.zoom.us/j/…" className={input} />
        </label>
      </div>
      <label className="block space-y-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span>Temas previstos (opcional)</span>
        <textarea value={values.agenda} onChange={set("agenda")} rows={2} maxLength={1000} className={input} />
      </label>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Duración: {MEETING_DURATION_MINUTES} minutos, empezando en punto o y media. Crea la reunión en Zoom (o resérvala en tu Calendly gratuito con Zoom conectado: Calendly crea el enlace y la apunta en tu Google Calendar) y pega aquí el enlace de Zoom una sola vez. Puedes guardarla sin convocar (solo la ves tú) y convocarla cuando tengas el enlace.
      </p>
      <div className="flex flex-wrap gap-2">
        {!saveOnly && <button type="button" disabled={busy} onClick={() => onSave(values, true)} className={darkButton}>Convocar</button>}
        <button type="button" disabled={busy} onClick={() => onSave(values, false)} className={button}>{saveOnly ? "Guardar cambios" : "Guardar sin convocar"}</button>
        <button type="button" disabled={busy} onClick={onCancel} className={button}>Cancelar</button>
      </div>
    </div>
  );
}

function MeetingRow({ meeting, group, canEdit, busy, run, api }: {
  meeting: StaffMeeting;
  group: Group;
  canEdit: boolean;
  busy: boolean;
  run: (action: () => Promise<unknown>, ok: string) => Promise<boolean>;
  api: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [now] = useState(() => Date.now());
  const patch = (body: Record<string, unknown>, ok: string) => run(() => api(`/api/coordinador/reuniones/${meeting.id}`, { method: "PATCH", body }), ok);
  const started = new Date(meeting.scheduledAt).getTime() <= now;
  const deadline = reportDeadline(meeting);
  const invitation = meetingInvitationText({ ...meeting, coordinatorName: meeting.coordinatorName || group.name });

  const copy = () => run(async () => {
    try { await navigator.clipboard.writeText(invitation); }
    catch { throw new Error("No se pudo copiar la convocatoria en este navegador."); }
  }, "Convocatoria copiada. Pégala donde quieras enviarla.");
  const calendar = googleCalendarUrl({ ...meeting, coordinatorName: meeting.coordinatorName || group.name }, group.emails);
  const mailto = `mailto:?bcc=${encodeURIComponent(group.emails.join(","))}&subject=${encodeURIComponent(`Reunión de coordinación · ${formatMeetingDate(meeting.scheduledAt)}`)}&body=${encodeURIComponent(invitation)}`;

  if (editing) {
    return (
      <MeetingForm
        saveOnly
        busy={busy}
        initial={{ scheduledAt: isoToMadridLocal(meeting.scheduledAt), zoomUrl: meeting.zoomUrl, agenda: meeting.agenda }}
        onCancel={() => setEditing(false)}
        onSave={async (values) => { if (await patch({ action: "editar", ...values }, "Reunión actualizada.")) setEditing(false); }}
      />
    );
  }

  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">{formatMeetingDate(meeting.scheduledAt)}</p>
          <p className="text-xs text-slate-500">{formatMeetingTime(meeting.scheduledAt)} · {meeting.durationMinutes} min{meeting.zoomUrl ? "" : " · sin enlace de Zoom"}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[meeting.status]}`}>{MEETING_STATUS_LABEL[meeting.status]}</span>
      </div>
      {meeting.agenda && <p className="whitespace-pre-line text-xs text-slate-600">{meeting.agenda}</p>}
      {meeting.cancelReason && <p className="text-xs text-slate-500">Motivo de la cancelación: {meeting.cancelReason}</p>}

      {meeting.status === "confirmada" && <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-900">{ZOOM_RECORDING_WARNING}</p>}

      {meeting.status === "realizada" && <AfterMeeting meeting={meeting} canEdit={canEdit} busy={busy} now={now} deadline={deadline} patch={patch} />}

      {canEdit && (meeting.status === "borrador" || meeting.status === "confirmada") && (
        <div className="flex flex-wrap gap-2">
          {meeting.status === "borrador" && <button type="button" disabled={busy || !meeting.zoomUrl} title={meeting.zoomUrl ? "" : "Añade antes el enlace de Zoom"} onClick={() => patch({ action: "confirmar" }, "Reunión convocada. Ya la ven tus mentores.")} className={darkButton}>Convocar</button>}
          {meeting.status === "confirmada" && (
            <>
              <a href={calendar} target="_blank" rel="noopener noreferrer" className={darkButton}><CalendarPlus className="h-3.5 w-3.5" /> Invitar con Google Calendar</a>
              <a href={mailto} className={button}><Mail className="h-3.5 w-3.5" /> Enviar por correo</a>
              <button type="button" onClick={copy} className={button}><Copy className="h-3.5 w-3.5" /> Copiar convocatoria</button>
              <a href={meeting.zoomUrl} target="_blank" rel="noopener noreferrer" className={button}><Video className="h-3.5 w-3.5" /> Zoom</a>
              {started && <button type="button" disabled={busy} onClick={() => patch({ action: "realizada" }, "Reunión marcada como realizada. Ahora toca el registro.")} className={button}>Marcar como realizada</button>}
            </>
          )}
          {!started && <button type="button" disabled={busy} onClick={() => setEditing(true)} className={button}>Cambiar</button>}
          <button type="button" disabled={busy} onClick={() => setCancelling(!cancelling)} className={button}>Cancelar reunión</button>
        </div>
      )}
      {cancelling && (
        <div className="space-y-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Motivo (lo verán tus mentores)" className={input} />
          <button type="button" disabled={busy} onClick={async () => { if (await patch({ action: "cancelar", reason }, "Reunión cancelada.")) setCancelling(false); }} className={darkButton}>Confirmar cancelación</button>
        </div>
      )}
      {meeting.status === "confirmada" && canEdit && group.emails.length === 0 && <p className="text-[11px] text-slate-400">No hay correos de tus mentores en el campus: copia la convocatoria y envíala por tu canal habitual.</p>}
    </article>
  );
}

/** Lo que toca después de la reunión, en orden. */
function AfterMeeting({ meeting, canEdit, busy, now, deadline, patch }: {
  meeting: StaffMeeting; canEdit: boolean; busy: boolean; now: number; deadline: Date;
  patch: (body: Record<string, unknown>, ok: string) => Promise<boolean>;
}) {
  const [url, setUrl] = useState(meeting.recordingUrl);
  const late = now > deadline.getTime();
  const done = Boolean(meeting.recordingUrl) && Boolean(meeting.reportSentAt);
  const step = (n: number, ok: boolean, children: React.ReactNode) => (
    <li className="flex gap-2">
      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${ok ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300"}`}>{ok ? "✓" : n}</span>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </li>
  );
  return (
    <div className={`space-y-2 rounded-xl border p-3 text-xs ${done ? "border-slate-100 bg-[#F7F6F3] text-slate-600" : late && !meeting.reportSentAt ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
      <p className="font-semibold">{done ? "Seguimiento completado." : "Después de la reunión:"}</p>
      <ol className="space-y-2">
        {step(1, Boolean(meeting.recordingUrl), <p>Comprueba que la grabación se ha guardado (Documentos › Zoom en tu ordenador) y que se ve y se oye.</p>)}
        {step(2, Boolean(meeting.recordingUrl), (
          <p>Súbela a la carpeta de Google Drive de Método Kiru, con acceso restringido (no la compartas con el grupo ni con enlaces públicos).{" "}
            <a href={RECORDINGS_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline"><FolderOpen className="h-3 w-3" /> Abrir la carpeta</a></p>
        ))}
        {step(3, Boolean(meeting.recordingUrl), (
          <>
            <p>Registra aquí el enlace de Drive de la grabación. Solo lo veis tú y administración; tus mentores no.</p>
            {meeting.recordingUrl && <p className="break-all">Registrada{meeting.recordingRegisteredAt ? ` el ${formatDay(meeting.recordingRegisteredAt)}` : ""}: <a href={meeting.recordingUrl} target="_blank" rel="noopener noreferrer" className="underline">{meeting.recordingUrl}</a></p>}
            {canEdit && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…" className={input} />
                <button type="button" disabled={busy || !url.trim() || url.trim() === meeting.recordingUrl} onClick={() => patch({ action: "grabacion", recordingUrl: url }, "Enlace de la grabación registrado.")} className={darkButton}>{meeting.recordingUrl ? "Cambiar enlace" : "Registrar enlace"}</button>
              </div>
            )}
          </>
        ))}
        {step(4, Boolean(meeting.reportSentAt), (
          <>
            {meeting.reportSentAt
              ? <p>Registro de Jotform enviado el {formatDay(meeting.reportSentAt)}.</p>
              : <p>Completa el registro de Jotform en las {MEETING_REPORT_HOURS} horas siguientes. Plazo: {deadline.toLocaleString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}{late ? " (fuera de plazo)" : ""}.</p>}
            {canEdit && !meeting.reportSentAt && (
              <div className="flex flex-wrap gap-2">
                <a href={MEETING_REPORT_FORM_URL} target="_blank" rel="noopener noreferrer" className={darkButton}>Abrir el registro de Jotform <ExternalLink className="h-3 w-3" /></a>
                <button type="button" disabled={busy} onClick={() => patch({ action: "registro" }, "Anotado: registro enviado.")} className={button}>Ya lo he enviado</button>
              </div>
            )}
          </>
        ))}
      </ol>
    </div>
  );
}
