"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Copy, ExternalLink, Mail, Video } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DAY_SLOTS, MEETING_DURATION_MINUTES, MEETING_REPORT_FORM_URL, MEETING_REPORT_HOURS, MEETING_STATUS_LABEL, WEEK_DAYS,
  formatDay, formatMeetingDate, formatMeetingTime, isoToMadridLocal, meetingInvitationText, reportDeadline,
  type CoordinatorMeetingsData, type GroupMentor, type MeetingStatus, type StaffMeeting,
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
        <p>Tú eliges la fecha mirando la disponibilidad del grupo, añades el enlace de Zoom y la convocas. Al convocarla, tus mentores la ven en su menú ☰; la convocatoria por correo la mandas tú con el botón «Enviar por correo». Después, rellena el registro en Jotform en las {MEETING_REPORT_HOURS} horas siguientes.</p>
        <p className="font-semibold text-slate-700">La grabación de Zoom: su enlace va solo en el registro de Jotform (lo ve dirección). No la compartas con el grupo ni la pegues en el campus.</p>
      </section>

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
  const [creating, setCreating] = useState(false);
  // Pendientes: por celebrar o celebradas sin registro todavía.
  const active = meetings.filter((m) => m.status === "borrador" || m.status === "confirmada" || (m.status === "realizada" && !m.reportSentAt)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const done = meetings.filter((m) => !active.includes(m));

  return (
    <section className="space-y-4 rounded-3xl border border-[#E7E3DC] bg-white p-5 shadow-sm sm:p-6">
      {showName && <h2 className="font-serif text-lg font-bold text-slate-900">Grupo de {group.name || "coordinador sin nombre"}</h2>}
      <AvailabilitySummary mentors={group.mentors} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Reuniones</h3>
          {canEdit && !creating && <button type="button" onClick={() => setCreating(true)} className={darkButton}><CalendarDays className="h-3.5 w-3.5" /> Fijar reunión</button>}
        </div>
        {creating && (
          <MeetingForm
            busy={busy}
            onCancel={() => setCreating(false)}
            onSave={async (values, confirm) => {
              const ok = await run(() => api("/api/coordinador/reuniones", { method: "POST", body: { ...values, confirm } }), confirm ? "Reunión convocada. Ya la ven tus mentores." : "Reunión guardada sin convocar.");
              if (ok) setCreating(false);
            }}
          />
        )}
        {active.length === 0 && !creating && <p className="text-xs text-slate-500">No hay ninguna reunión pendiente.{canEdit ? " Fija la del mes cuando hayas visto la disponibilidad del grupo." : ""}</p>}
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

/** Quién puede qué día y franja, y qué encaja con la mayoría. No elige nada solo. */
function AvailabilitySummary({ mentors }: { mentors: GroupMentor[] }) {
  const answered = mentors.filter((m) => m.availability && m.availability.days.length);
  const counts = useMemo(() => ({
    days: Object.fromEntries(WEEK_DAYS.map((d) => [d.id, answered.filter((m) => m.availability!.days.includes(d.id)).length])),
    slots: Object.fromEntries(DAY_SLOTS.map((s) => [s.id, answered.filter((m) => m.availability!.slots.includes(s.id)).length])),
  }), [answered]);
  const maxDay = Math.max(0, ...Object.values(counts.days));
  const maxSlot = Math.max(0, ...Object.values(counts.slots));

  if (mentors.length === 0) return <p className="text-xs text-slate-500">Todavía no tienes mentores asignados.</p>;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Disponibilidad del grupo ({answered.length} de {mentors.length} la han indicado)</h3>
      {answered.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {WEEK_DAYS.map((d) => (
            <span key={d.id} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${counts.days[d.id] && counts.days[d.id] === maxDay ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
              {d.label}: {counts.days[d.id]}
            </span>
          ))}
          {DAY_SLOTS.map((s) => (
            <span key={s.id} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${counts.slots[s.id] && counts.slots[s.id] === maxSlot ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
              {s.label}: {counts.slots[s.id]}
            </span>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-400">
            <tr><th className="py-1.5 pr-3">Mentor</th><th className="py-1.5 pr-3">Días</th><th className="py-1.5 pr-3">Franjas</th><th className="py-1.5">Notas</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mentors.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="py-2 pr-3 font-semibold text-slate-800">
                  {m.name}
                  <span className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${m.hasStudents ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{m.hasStudents ? "Obligatoria" : "Sin alumnos"}</span>
                </td>
                {m.availability && m.availability.days.length ? (
                  <>
                    <td className="py-2 pr-3 text-slate-600">{WEEK_DAYS.filter((d) => m.availability!.days.includes(d.id)).map((d) => d.label).join(", ")}</td>
                    <td className="py-2 pr-3 text-slate-600">{DAY_SLOTS.filter((s) => m.availability!.slots.includes(s.id)).map((s) => s.label).join(", ")}</td>
                    <td className="py-2 text-slate-500">{m.availability.notes || "—"}{m.availability.updatedAt ? <span className="block text-[10px] text-slate-400">Actualizada el {formatDay(m.availability.updatedAt)}</span> : null}</td>
                  </>
                ) : <td colSpan={3} className="py-2 text-slate-400">Aún no ha indicado su disponibilidad</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          <input type="datetime-local" value={values.scheduledAt} onChange={set("scheduledAt")} className={input} />
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
      <p className="text-[11px] text-slate-500">Duración: {MEETING_DURATION_MINUTES} minutos. Puedes guardarla sin convocar (solo la ves tú) y convocarla cuando tengas el Zoom.</p>
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

      {meeting.status === "realizada" && (
        <div className={`space-y-2 rounded-xl border p-3 text-xs ${meeting.reportSentAt ? "border-slate-100 bg-[#F7F6F3] text-slate-600" : now > deadline.getTime() ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {meeting.reportSentAt
            ? <p>Registro enviado el {formatDay(meeting.reportSentAt)}.</p>
            : <p>Falta el registro de la reunión en Jotform. Plazo: {deadline.toLocaleString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}{now > deadline.getTime() ? " (fuera de plazo)" : ""}.</p>}
          {canEdit && !meeting.reportSentAt && (
            <div className="flex flex-wrap gap-2">
              <a href={MEETING_REPORT_FORM_URL} target="_blank" rel="noopener noreferrer" className={darkButton}>Abrir el registro de Jotform <ExternalLink className="h-3 w-3" /></a>
              <button type="button" disabled={busy} onClick={() => patch({ action: "registro" }, "Anotado: registro enviado.")} className={button}>Ya lo he enviado</button>
            </div>
          )}
        </div>
      )}

      {canEdit && (meeting.status === "borrador" || meeting.status === "confirmada") && (
        <div className="flex flex-wrap gap-2">
          {meeting.status === "borrador" && <button type="button" disabled={busy || !meeting.zoomUrl} title={meeting.zoomUrl ? "" : "Añade antes el enlace de Zoom"} onClick={() => patch({ action: "confirmar" }, "Reunión convocada. Ya la ven tus mentores.")} className={darkButton}>Convocar</button>}
          {meeting.status === "confirmada" && (
            <>
              <a href={mailto} className={darkButton}><Mail className="h-3.5 w-3.5" /> Enviar por correo</a>
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
