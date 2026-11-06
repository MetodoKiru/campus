"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ClipboardCheck, RotateCcw } from "lucide-react";
import {
  CAUSE_LABEL, NOTICE_HOURS, REASON_CODE_LABEL, RECOVERY_STAGE, REQUEST_STATUS_LABEL, classDateLabel, daysSince, hoursUntil,
  type StaffClass, type StaffClassesData, type StaffRequest,
} from "@/lib/classes";
import type { ClassOption, ClassRecovery } from "@/lib/database.types";
import { ProposeForm } from "./MentorClasses";
import { Badge, Empty, OptionsEditor, btnDark, btnLight, card, classAction, input, subtle, timeRange, useClasses } from "./shared";

type View = "solicitudes" | "recuperaciones" | "avisos" | "incidencias" | "cancelar";
const OPEN = ["pendiente", "mas_info", "contrapropuesta"];
const STAGES: ClassRecovery[] = ["pendiente", "propuesta", "sin_encaje", "programada", "realizada"];

/**
 * Coordinación de clases: solicitudes de cambio y cancelación, seguimiento de
 * recuperaciones en cinco puntos, avisos de registros e incidencias (siempre
 * revisadas por una persona, nunca automáticas).
 */
export default function CoordinatorClasses({ notify }: { notify: (text: string, type: "success" | "error") => void }) {
  const { data, error, reload, loadedAt } = useClasses<StaffClassesData>();
  const [view, setView] = useState<View>("solicitudes");
  const done = async (message: string | null, ok: string) => {
    if (message) { notify(message, "error"); return; }
    notify(ok, "success");
    await reload();
  };

  const derived = useMemo(() => {
    const sessions = data?.sessions ?? [];
    const requests = data?.requests ?? [];
    const pending = requests.filter((r) => (r.kind === "cambio" || r.kind === "cancelacion") && OPEN.includes(r.status));
    const recoveries = sessions.filter((s) => s.kind === "regular" && STAGES.includes(s.recovery)
      && (s.recovery !== "realizada" || daysSince(s.recoveryStatusSince) <= 28));
    const notices = requests.filter((r) => r.kind === "aviso_registro" && ["pendiente", "mas_info"].includes(r.status));
    const incidents = requests.filter((r) => ["potencial", "abierta", "mas_info"].includes(r.incident));
    return { sessions, pending, recoveries, notices, incidents };
  }, [data]);

  if (error) return <div className={card}><Empty>{error}</Empty></div>;
  if (!data) return <div className={card}><Empty>Cargando clases…</Empty></div>;
  const { sessions, pending, recoveries, notices, incidents } = derived;
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const openRecoveries = recoveries.filter((s) => s.recovery !== "realizada").length;

  const tabs: [View, string, number][] = [
    ["solicitudes", "Solicitudes", pending.length],
    ["recuperaciones", "Recuperaciones", openRecoveries],
    ["avisos", "Avisos de registro", notices.length],
    ["incidencias", "Incidencias", incidents.length],
    ["cancelar", "Registrar cancelación", 0],
  ];

  return (
    <section className="space-y-4" aria-label="Clases">
      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label, count]) => (
          <button key={key} type="button" className={view === key ? btnDark : btnLight} onClick={() => setView(key)}>
            {label}{count ? ` (${count})` : ""}
          </button>
        ))}
      </div>

      {view === "solicitudes" && (
        <div className={`${card} space-y-3`}>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#292825]"><CalendarClock className="h-4 w-4" /> Solicitudes pendientes</h3>
          {pending.length === 0 ? <Empty>No hay solicitudes pendientes.</Empty>
            : pending.map((r) => <PendingRequest key={r.id} request={r} session={r.sessionId ? byId.get(r.sessionId) : undefined} onDone={done} />)}
        </div>
      )}

      {view === "recuperaciones" && (
        <div className={`${card} space-y-4`}>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#292825]"><RotateCcw className="h-4 w-4" /> Seguimiento de recuperaciones</h3>
          <p className="text-[11px] text-[#77736B]">Las recuperaciones no caducan ni se consumen solas. Si una lleva 3 días sin avanzar te llega un aviso; puedes recordárselo al mentor o a la familia, o proponer fechas tú.</p>
          {STAGES.map((stage) => {
            const rows = recoveries.filter((s) => s.recovery === stage);
            return (
              <div key={stage} className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#6D6962]">{RECOVERY_STAGE[stage]} · {rows.length}</h4>
                {rows.length === 0 ? <p className="text-[11px] text-[#8D887F]">Ninguna.</p>
                  : rows.map((s) => <RecoveryRow key={s.id} session={s} recovery={sessions.find((x) => x.recoversSessionId === s.id && x.delivery !== "no_impartida")} onDone={done} />)}
              </div>
            );
          })}
        </div>
      )}

      {view === "avisos" && (
        <div className={`${card} space-y-3`}>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#292825]"><ClipboardCheck className="h-4 w-4" /> Avisos de registros fuera de horario</h3>
          {notices.length === 0 ? <Empty>No hay avisos por revisar.</Empty>
            : notices.map((r) => <NoticeRow key={r.id} request={r} data={data} onDone={done} />)}
        </div>
      )}

      {view === "incidencias" && (
        <div className={`${card} space-y-3`}>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#292825]"><AlertTriangle className="h-4 w-4" /> Incidencias por revisar</h3>
          <p className="text-[11px] text-[#77736B]">Una incidencia no es una sanción: valora el motivo y márcala como justificada o no justificada.</p>
          {incidents.length === 0 ? <Empty>No hay incidencias abiertas.</Empty> : incidents.map((r) => (
            <IncidentRow key={r.id} request={r} session={r.sessionId ? byId.get(r.sessionId) : undefined} mentorName={sessions.find((s) => s.mentorId === r.mentorId)?.mentorName ?? r.requestedByName} onDone={done} />
          ))}
        </div>
      )}

      {view === "cancelar" && <RegisterCancellation sessions={sessions} now={loadedAt} onDone={done} />}
    </section>
  );
}

function PendingRequest({ request: r, session, onDone }: { request: StaffRequest; session?: StaffClass; onDone: (m: string | null, ok: string) => void }) {
  const [note, setNote] = useState("");
  const [counter, setCounter] = useState<ClassOption[]>([]);
  const [showCounter, setShowCounter] = useState(false);
  const decide = (decision: string, extra: Record<string, unknown> = {}, ok = "Decisión guardada.") =>
    classAction({ action: "decidir", requestId: r.id, decision, note, ...extra }).then((m) => onDone(m, ok));
  const who = r.requesterRole === "padre" ? "la familia" : "el mentor";
  return (
    <div className={`${subtle} space-y-2 text-xs`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>{r.kind === "cambio" ? "Cambio" : "Cancelación"}</strong> · {session?.studentName} con {session?.mentorName}
          {session && <> · <span className="capitalize">{classDateLabel(session.scheduledStart)}</span></>}
        </span>
        <span className="flex gap-1">
          <Badge>Pide {who}</Badge>
          {r.late && <Badge tone="warn">Menos de {NOTICE_HOURS} h ({r.hoursNotice} h)</Badge>}
          {r.status !== "pendiente" && <Badge>{REQUEST_STATUS_LABEL[r.status]}</Badge>}
        </span>
      </div>
      <p className="text-[#45433F]">«{r.reason}»</p>
      {r.preferences && <p className="text-[11px] text-[#77736B]">Preferencias: {r.preferences}</p>}
      {r.reply && <p className="text-[11px] text-[#77736B]">Respuesta: «{r.reply}»</p>}
      {r.kind === "cancelacion" && (
        <p className="text-[11px] text-[#77736B]">
          {r.requesterRole === "mentor" ? "Si la apruebas, la familia conserva la sesión y queda por recuperar."
            : r.late ? "Con menos de 48 h la sesión se consume (y el mentor no cobra). Si hay un motivo justificado puedes aprobarla como excepción: la familia la conserva."
              : "Con aviso suficiente la familia conserva la sesión para recuperarla."}
        </p>
      )}
      <input className={input} placeholder="Nota (la ven mentor y familia)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <div className="flex flex-wrap gap-2">
        {r.kind === "cambio" && r.options.map((o, i) => (
          <button key={o.start} type="button" className={btnDark} onClick={() => decide("aprobar", { option: i }, "Cambio aprobado.")}>Aprobar {timeRange(o)}</button>
        ))}
        {r.kind === "cambio" && r.options.length === 0 && <span className="text-[11px] text-[#77736B]">La familia no ha propuesto fecha: haz una contrapropuesta.</span>}
        {r.kind === "cancelacion" && <button type="button" className={btnDark} onClick={() => decide("aprobar_cancelacion", {}, "Cancelación aprobada.")}>Aprobar cancelación</button>}
        {r.kind === "cancelacion" && r.requesterRole === "padre" && r.late && (
          <button type="button" className={btnLight} disabled={note.trim().length < 3} title="Escribe el motivo en la nota" onClick={() => decide("aprobar_excepcion", {}, "Aprobada como excepción.")}>Aprobar como excepción</button>
        )}
        {r.kind === "cambio" && <button type="button" className={btnLight} onClick={() => setShowCounter((v) => !v)}>Proponer otra fecha</button>}
        <button type="button" className={btnLight} disabled={note.trim().length < 3} onClick={() => decide("mas_info", {}, "Petición de información enviada.")}>Pedir más información</button>
        <button type="button" className={btnLight} onClick={() => decide("rechazar", {}, "Solicitud no aprobada.")}>No aprobar</button>
      </div>
      {showCounter && (
        <div className="space-y-2 border-t border-[#E7E3DC] pt-2">
          <OptionsEditor value={counter} onChange={setCounter} />
          <button type="button" className={btnDark} disabled={!counter.length} onClick={() => decide("contrapropuesta", { options: counter }, "Contrapropuesta enviada.")}>Enviar contrapropuesta</button>
        </div>
      )}
    </div>
  );
}

function RecoveryRow({ session: s, recovery, onDone }: { session: StaffClass; recovery?: StaffClass; onDone: (m: string | null, ok: string) => void }) {
  const [mode, setMode] = useState<"" | "proponer" | "excepcion">("");
  const [note, setNote] = useState("");
  const days = daysSince(s.recoveryStatusSince);
  const manage = (what: string, ok: string) => classAction({ action: "gestionar_recuperacion", sessionId: s.id, manage: what, note }).then((m) => onDone(m, ok));
  return (
    <div className={`${subtle} space-y-2 text-xs`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><strong>{s.studentName}</strong> · {s.mentorName} · clase del {classDateLabel(s.originalStart)}</span>
        <span className="flex gap-1">
          {s.recovery !== "realizada" && <Badge tone={days >= 3 ? "warn" : "neutral"}>{days === 0 ? "Hoy" : `${days} ${days === 1 ? "día" : "días"} en este punto`}</Badge>}
          {s.cancelCause && <Badge>{CAUSE_LABEL[s.cancelCause]}</Badge>}
        </span>
      </div>
      {recovery && <p className="text-[11px] text-[#38523A]">Recuperación: <span className="capitalize">{classDateLabel(recovery.scheduledStart)}</span>{recovery.deliveredByName && ` · la dio ${recovery.deliveredByName}`}</p>}
      {s.recoveryExceptionNote && <p className="text-[11px] text-[#77736B]">Excepción de plazo: «{s.recoveryExceptionNote}»</p>}
      {s.recovery !== "realizada" && s.recovery !== "programada" && (
        <div className="flex flex-wrap gap-2">
          {(s.recovery === "pendiente" || s.recovery === "sin_encaje") && <button type="button" className={btnLight} onClick={() => manage("recordar_mentor", "Recordatorio enviado al mentor.")}>Recordar al mentor</button>}
          {s.recovery === "propuesta" && <button type="button" className={btnLight} onClick={() => manage("recordar_familia", "Recordatorio enviado a la familia.")}>Recordar a la familia</button>}
          <button type="button" className={btnLight} onClick={() => setMode(mode === "proponer" ? "" : "proponer")}>Proponer fechas</button>
          <button type="button" className={btnLight} onClick={() => setMode(mode === "excepcion" ? "" : "excepcion")}>Excepción de plazo</button>
        </div>
      )}
      {mode === "proponer" && <ProposeForm session={s} onCancel={() => setMode("")} onDone={(m, ok) => { setMode(""); void onDone(m, ok); }} />}
      {mode === "excepcion" && (
        <div className="space-y-2">
          <input className={input} placeholder="Motivo y fecha acordada (después del fin del periodo)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          <button type="button" className={btnDark} disabled={note.trim().length < 3} onClick={() => manage("excepcion_plazo", "Excepción registrada.").then(() => setMode(""))}>Registrar excepción</button>
        </div>
      )}
    </div>
  );
}

function NoticeRow({ request: r, data, onDone }: { request: StaffRequest; data: StaffClassesData; onDone: (m: string | null, ok: string) => void }) {
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const log = data.unlinkedLogs.find((l) => l.id === r.sessionLogId);
  const candidates = log ? data.sessions.filter((s) => s.studentId === log.studentId && s.delivery === "programada"
    && Math.abs(new Date(s.scheduledStart).getTime() - new Date(`${log.sessionDate}T12:00:00Z`).getTime()) < 10 * 86_400_000) : [];
  const manage = (what: string, ok: string) =>
    classAction({ action: "gestionar_aviso", requestId: r.id, manage: what, note, sessionId: link || undefined }).then((m) => onDone(m, ok));
  return (
    <div className={`${subtle} space-y-2 text-xs`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><strong>{r.requestedByName}</strong>{log && <> · {log.studentName} · {classDateLabel(`${log.sessionDate}T12:00:00Z`, false)}</>}</span>
        <Badge tone={r.status === "mas_info" ? "neutral" : "warn"}>{r.status === "mas_info" ? "Esperando al mentor" : (r.reasonCode ? REASON_CODE_LABEL[r.reasonCode] : "Aviso")}</Badge>
      </div>
      {r.reason && <p className="text-[#45433F]">«{r.reason}»</p>}
      {r.reply && <p className="text-[11px] text-[#77736B]">Respuesta del mentor: «{r.reply}»</p>}
      {candidates.length > 0 && (
        <label className="block space-y-1">
          <span className="text-[11px] text-[#77736B]">Si sustituye a una clase programada, enlázala para que cuente una sola vez:</span>
          <select className={input} value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">No enlazar</option>
            {candidates.map((s) => <option key={s.id} value={s.id}>{classDateLabel(s.scheduledStart)}</option>)}
          </select>
        </label>
      )}
      <input className={input} placeholder="Nota" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnDark} onClick={() => manage("gestionado", "Aviso gestionado.")}>Gestionado</button>
        <button type="button" className={btnLight} disabled={note.trim().length < 3} onClick={() => manage("mas_info", "Petición enviada al mentor.")}>Pedir más información</button>
        <button type="button" className={btnLight} disabled={note.trim().length < 3} onClick={() => manage("incidencia", "Incidencia abierta.")}>Abrir incidencia</button>
      </div>
    </div>
  );
}

function IncidentRow({ request: r, session, mentorName, onDone }: { request: StaffRequest; session?: StaffClass; mentorName: string; onDone: (m: string | null, ok: string) => void }) {
  const [note, setNote] = useState("");
  const review = (verdict: string, ok: string) => classAction({ action: "revisar_incidencia", requestId: r.id, verdict, note }).then((m) => onDone(m, ok));
  return (
    <div className={`${subtle} space-y-2 text-xs`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><strong>{mentorName}</strong>{session && <> · {session.studentName} · {classDateLabel(session.originalStart)}</>}</span>
        <Badge tone="warn">{r.kind === "aviso_registro" ? "Aviso de registro" : `${r.kind === "cambio" ? "Cambio" : "Cancelación"} con ${r.hoursNotice ?? "?"} h`}</Badge>
      </div>
      <p className="text-[#45433F]">«{r.reason || r.incidentNote}»</p>
      <input className={input} placeholder="Valoración" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnDark} onClick={() => review("justificada", "Marcada como justificada.")}>Justificada</button>
        <button type="button" className={btnLight} onClick={() => review("no_justificada", "Marcada como no justificada.")}>No justificada</button>
        <button type="button" className={btnLight} disabled={note.trim().length < 3} onClick={() => review("mas_info", "Petición enviada al mentor.")}>Pedir más información</button>
      </div>
    </div>
  );
}

function RegisterCancellation({ sessions, now, onDone }: { sessions: StaffClass[]; now: number; onDone: (m: string | null, ok: string) => void }) {
  const [sessionId, setSessionId] = useState("");
  const [cause, setCause] = useState("no_presentado");
  const [note, setNote] = useState("");
  const options = sessions.filter((s) => s.delivery === "programada" && hoursUntil(s.scheduledStart, now) > -7 * 24 && hoursUntil(s.scheduledStart, now) < 21 * 24);
  return (
    <div className={`${card} space-y-3`}>
      <h3 className="text-sm font-bold text-[#292825]">Registrar una cancelación</h3>
      <p className="text-[11px] text-[#77736B]">Para cuando te enteras por otra vía (llamada, mensaje) o la familia no se presentó. Se aplican las mismas reglas: con menos de 48 h o no presentado, la sesión se consume; si cancela el mentor o es una excepción, la familia la conserva.</p>
      <select className={input} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
        <option value="">Elige la clase</option>
        {options.map((s) => <option key={s.id} value={s.id}>{classDateLabel(s.scheduledStart)} · {s.studentName} con {s.mentorName}</option>)}
      </select>
      <select className={input} value={cause} onChange={(e) => setCause(e.target.value)}>
        {(["no_presentado", "familia_menos_48h", "familia_con_aviso", "mentor", "excepcion"] as const).map((c) => <option key={c} value={c}>{CAUSE_LABEL[c]}</option>)}
      </select>
      <input className={input} placeholder="Motivo" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <button type="button" className={btnDark} disabled={!sessionId || note.trim().length < 3}
        onClick={() => classAction({ action: "registrar_cancelacion", sessionId, cause, note }).then((m) => { if (!m) { setSessionId(""); setNote(""); } void onDone(m, "Cancelación registrada."); })}>
        Registrar
      </button>
    </div>
  );
}
