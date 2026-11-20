"use client";

import { useMemo, useState } from "react";
import { CalendarClock, RotateCcw, Send } from "lucide-react";
import {
  CAUSE_LABEL, NOTICE_HOURS, REASON_CODE_LABEL, REQUEST_STATUS_LABEL, classDateLabel, hoursUntil,
  type StaffClass, type StaffClassesData, type StaffRequest, type UnavailableSlot,
  mentorProposalProblems,
} from "@/lib/classes";
import type { ClassOption } from "@/lib/database.types";
import { Badge, Empty, OptionsEditor, btnDark, btnLight, card, classAction, input, subtle, timeRange, useClasses } from "./shared";

const OPEN = ["pendiente", "mas_info", "contrapropuesta"];

/**
 * Panel de clases del mentor: próximas clases con «Gestionar» (cambio o
 * cancelación), clases por recuperar (proponer fechas), sus solicitudes y
 * «Avisar a mi coordinador» para registros fuera de horario.
 */
export default function MentorClasses({ notify }: { notify: (text: string) => void }) {
  const { data, error, reload, loadedAt: now } = useClasses<StaffClassesData>();
  const [open, setOpen] = useState<string | null>(null);

  const mine = useMemo(() => (data?.sessions ?? []).filter((s) => s.mentorId === data?.viewerId), [data]);
  const upcoming = mine.filter((s) => s.delivery === "programada" && new Date(s.scheduledStart).getTime() > now).slice(0, 20);
  const toRecover = mine.filter((s) => s.kind === "regular" && ["pendiente", "sin_encaje", "propuesta", "rechazada"].includes(s.recovery));
  const requests = (data?.requests ?? []).filter((r) => r.mentorId === data?.viewerId && r.kind !== "aviso_registro");
  const notices = (data?.requests ?? []).filter((r) => r.kind === "aviso_registro" && r.mentorId === data?.viewerId);
  const noticedLogs = new Set(notices.map((n) => n.sessionLogId));
  const unlinked = (data?.unlinkedLogs ?? []).filter((l) => l.mentorId === data?.viewerId && !l.probableDuplicate);
  const openRequestFor = (id: string) => requests.find((r) => r.sessionId === id && OPEN.includes(r.status));
  const familyProposal = (id: string) => requests.find((r) => r.sessionId === id && r.kind === "propuesta_recuperacion" && r.status === "pendiente" && r.requesterRole === "padre");

  const done = async (message: string | null, ok: string) => {
    if (message) { notify(`No se pudo: ${message}`); return; }
    notify(ok);
    setOpen(null);
    await reload();
  };

  if (error) return <div className={card}><Empty>{error}</Empty></div>;
  if (!data) return <div className={card}><Empty>Cargando tus clases…</Empty></div>;

  return (
    <section className={`${card} space-y-5`} aria-label="Mis clases">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><CalendarClock className="h-5 w-5" /> Mis clases</h2>
        <p className="text-xs text-[#77736B]">
          Si necesitas cambiar o cancelar una clase, pídelo aquí. Lo revisa tu coordinador. Con menos de {NOTICE_HOURS} h de antelación
          queda como incidencia para revisar, nunca como sanción automática.
        </p>
      </header>

      {toRecover.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#292825]"><RotateCcw className="h-4 w-4" /> Clases por recuperar</h3>
          {toRecover.map((s) => (
            <div key={s.id} className={`${subtle} space-y-2`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span><strong>{s.studentName}</strong> · clase del {classDateLabel(s.originalStart)}</span>
                <Badge tone={s.recovery === "propuesta" && !familyProposal(s.id) ? "neutral" : "warn"}>
                  {familyProposal(s.id) ? "La familia propone fechas" : s.recovery === "propuesta" ? "Esperando a la familia" : s.recovery === "sin_encaje" ? "Ninguna fecha encajó" : "Propón fechas"}
                </Badge>
              </div>
              {s.cancelCause && <p className="text-[11px] text-[#77736B]">{CAUSE_LABEL[s.cancelCause]}</p>}
              {(() => {
                const fp = familyProposal(s.id);
                if (!fp) return null;
                return (
                  <div className="space-y-1">
                    <p className="text-[11px] text-[#45433F]">Ninguna de tus fechas les encajaba. Acepta una de las suyas o propón otras:</p>
                    {fp.reason && <p className="text-[11px] text-[#77736B]">«{fp.reason}»</p>}
                    <div className="flex flex-wrap gap-2">
                      {fp.options.map((o, i) => (
                        <button key={o.start} type="button" className={btnDark}
                          onClick={() => classAction({ action: "elegir_recuperacion", requestId: fp.id, option: i }).then((m) => done(m, "Recuperación confirmada. La familia recibirá un correo."))}>
                          Aceptar {timeRange(o)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {open === `rec:${s.id}`
                ? <ProposeForm session={s} blocked={data.unavailable.filter((u) => u.studentId === s.studentId)} onCancel={() => setOpen(null)} onDone={done} />
                : <button type="button" className={btnLight} onClick={() => setOpen(`rec:${s.id}`)}>{s.recovery === "propuesta" ? "Proponer otras fechas" : "Proponer fechas"}</button>}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-[#292825]">Próximas clases</h3>
        {upcoming.length === 0 ? <Empty>No tienes clases programadas en las próximas semanas.</Empty> : upcoming.map((s) => {
          const pending = openRequestFor(s.id);
          return (
            <div key={s.id} className={`${subtle} space-y-2`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="capitalize">{classDateLabel(s.scheduledStart)} · <strong className="normal-case">{s.studentName}</strong>{s.kind === "recuperacion" && " · recuperación"}</span>
                {pending
                  ? <Badge tone="warn">{REQUEST_STATUS_LABEL[pending.status]}</Badge>
                  : open !== `ges:${s.id}` && <button type="button" className={btnLight} onClick={() => setOpen(`ges:${s.id}`)}>Gestionar</button>}
              </div>
              {open === `ges:${s.id}` && <RequestForm session={s} blocked={data.unavailable.filter((u) => u.studentId === s.studentId)} onCancel={() => setOpen(null)} onDone={done} />}
            </div>
          );
        })}
      </div>

      {requests.some((r) => OPEN.includes(r.status) || hoursUntil(r.createdAt) > -14 * 24) && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[#292825]">Mis solicitudes</h3>
          {requests.filter((r) => OPEN.includes(r.status) || hoursUntil(r.createdAt) > -14 * 24).map((r) => (
            <RequestRow key={r.id} request={r} session={data.sessions.find((s) => s.id === r.sessionId)} onDone={done} />
          ))}
        </div>
      )}

      {(unlinked.length > 0 || notices.some((n) => n.status === "mas_info")) && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[#292825]">Registros fuera de horario</h3>
          <p className="text-[11px] text-[#77736B]">Estos registros no coinciden con ninguna clase programada. Avisa a tu coordinador y explica qué pasó; no registres otra sesión.</p>
          {unlinked.map((l) => {
            const notice = notices.find((n) => n.sessionLogId === l.id);
            return (
              <div key={l.id} className={`${subtle} space-y-2`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span><strong>{l.studentName}</strong> · {classDateLabel(`${l.sessionDate}T12:00:00Z`, false)}</span>
                  {notice ? <Badge>{REQUEST_STATUS_LABEL[notice.status]}</Badge>
                    : open !== `av:${l.id}` && <button type="button" className={btnLight} onClick={() => setOpen(`av:${l.id}`)}>Avisar a mi coordinador</button>}
                </div>
                {!noticedLogs.has(l.id) && open === `av:${l.id}` && <NoticeForm logId={l.id} onCancel={() => setOpen(null)} onDone={done} />}
                {notice?.status === "mas_info" && <ReplyForm label="Responder a tu coordinador" note={notice.decisionNote} onSend={(reply) => classAction({ action: "responder_aviso", requestId: notice.id, note: reply }).then((m) => done(m, "Respuesta enviada."))} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RequestForm({ session, blocked, onCancel, onDone }: { session: StaffClass; blocked: UnavailableSlot[]; onCancel: () => void; onDone: (m: string | null, ok: string) => void }) {
  const [kind, setKind] = useState<"cambio" | "cancelacion">("cambio");
  const [reason, setReason] = useState("");
  const [options, setOptions] = useState<ClassOption[]>([]);
  const [busy, setBusy] = useState(false);
  const late = hoursUntil(session.scheduledStart) < NOTICE_HOURS;
  const submit = async () => {
    setBusy(true);
    const message = await classAction({ action: "solicitar", sessionId: session.id, kind, reason, options: kind === "cambio" ? options : [] });
    setBusy(false);
    onDone(message, "Solicitud enviada a tu coordinador.");
  };
  return (
    <div className="space-y-2 border-t border-[#E7E3DC] pt-2">
      <div className="flex gap-2">
        <button type="button" className={kind === "cambio" ? btnDark : btnLight} onClick={() => setKind("cambio")}>Cambiar fecha</button>
        <button type="button" className={kind === "cancelacion" ? btnDark : btnLight} onClick={() => setKind("cancelacion")}>Cancelar</button>
      </div>
      {late && (
        <p className="rounded-lg bg-orange-50 p-2 text-[11px] text-orange-900">
          Faltan menos de {NOTICE_HOURS} h. Puedes pedirlo igualmente: tu coordinador lo revisará como posible incidencia y valorará el motivo.
        </p>
      )}
      {kind === "cancelacion" && <p className="text-[11px] text-[#77736B]">Si se aprueba, la familia conserva la sesión y tendrás que proponer fechas para recuperarla.</p>}
      <textarea className={input} rows={2} placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      {kind === "cambio" && <OptionsEditor value={options} onChange={setOptions} realistic blocked={blocked} />}
      <div className="flex gap-2">
        <button type="button" className={btnDark} disabled={busy || reason.trim().length < 3 || (kind === "cambio" && mentorProposalProblems(options, undefined, blocked).length > 0)} onClick={submit}><Send className="mr-1 inline h-3 w-3" />Enviar</button>
        <button type="button" className={btnLight} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

export function ProposeForm({ session, blocked = [], onCancel, onDone, realistic = true }: {
  session: StaffClass; blocked?: UnavailableSlot[]; onCancel: () => void; onDone: (m: string | null, ok: string) => void;
  /** El mentor solo puede proponer fechas realistas; coordinación no tiene ese límite. */
  realistic?: boolean;
}) {
  const [options, setOptions] = useState<ClassOption[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const minutes = Math.round((new Date(session.scheduledEnd).getTime() - new Date(session.scheduledStart).getTime()) / 60000) || 60;
  return (
    <div className="space-y-2 border-t border-[#E7E3DC] pt-2">
      <p className="text-[11px] text-[#77736B]">Propón varias fechas libres. La familia elige una y el campus comprueba que el hueco sigue libre antes de confirmarla.</p>
      <OptionsEditor value={options} onChange={setOptions} defaultMinutes={minutes} realistic={realistic} blocked={blocked} />
      <input className={input} placeholder="Nota para la familia (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <div className="flex gap-2">
        <button type="button" className={btnDark} disabled={busy || !options.length || (realistic && mentorProposalProblems(options, undefined, blocked).length > 0)}
          onClick={async () => { setBusy(true); const m = await classAction({ action: "proponer_recuperacion", sessionId: session.id, options, note }); setBusy(false); onDone(m, "Fechas enviadas a la familia."); }}>
          Enviar a la familia
        </button>
        <button type="button" className={btnLight} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function NoticeForm({ logId, onCancel, onDone }: { logId: string; onCancel: () => void; onDone: (m: string | null, ok: string) => void }) {
  const [code, setCode] = useState<keyof typeof REASON_CODE_LABEL>("cambio_acordado");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 border-t border-[#E7E3DC] pt-2">
      <select className={input} value={code} onChange={(e) => setCode(e.target.value as keyof typeof REASON_CODE_LABEL)}>
        {Object.entries(REASON_CODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input className={input} placeholder={code === "otro" ? "Explica qué pasó" : "Detalle (opcional)"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      <div className="flex gap-2">
        <button type="button" className={btnDark} disabled={code === "otro" && note.trim().length < 3}
          onClick={() => classAction({ action: "avisar_registro", logId, reasonCode: code, note }).then((m) => onDone(m, "Aviso enviado a tu coordinador."))}>Avisar</button>
        <button type="button" className={btnLight} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

export function ReplyForm({ label, note, onSend }: { label: string; note: string; onSend: (reply: string) => void }) {
  const [reply, setReply] = useState("");
  return (
    <div className="space-y-2 rounded-lg bg-orange-50 p-2">
      {note && <p className="text-[11px] text-orange-950">«{note}»</p>}
      <input className={input} placeholder={label} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} />
      <button type="button" className={btnDark} disabled={reply.trim().length < 3} onClick={() => onSend(reply)}>Enviar</button>
    </div>
  );
}

function RequestRow({ request: r, session, onDone }: { request: StaffRequest; session?: StaffClass; onDone: (m: string | null, ok: string) => void }) {
  const what = r.kind === "cambio" ? "Cambio" : r.kind === "cancelacion" ? "Cancelación" : "Fechas de recuperación";
  return (
    <div className={`${subtle} space-y-2 text-xs`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{what} · <strong>{session?.studentName ?? ""}</strong>{session && ` · ${classDateLabel(session.originalStart)}`}</span>
        <Badge tone={r.status === "aprobada" || r.status === "elegida" ? "ok" : r.status === "rechazada" ? "bad" : "neutral"}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
      </div>
      {r.chosenOption && <p className="text-[11px] text-[#38523A]">Nueva fecha: {timeRange(r.chosenOption)}</p>}
      {r.decisionNote && <p className="text-[11px] text-[#77736B]">Coordinación: «{r.decisionNote}»</p>}
      {r.status === "mas_info" && <ReplyForm label="Añade la información" note="" onSend={(reply) => classAction({ action: "responder", requestId: r.id, response: "informar", note: reply }).then((m) => onDone(m, "Información enviada."))} />}
      {r.status === "contrapropuesta" && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold">Coordinación propone:</p>
          {r.options.map((o, i) => (
            <button key={o.start} type="button" className={`${btnLight} mr-2`} onClick={() => classAction({ action: "responder", requestId: r.id, response: "aceptar", option: i }).then((m) => onDone(m, "Cambio confirmado."))}>{timeRange(o)}</button>
          ))}
        </div>
      )}
      {["pendiente", "mas_info", "contrapropuesta"].includes(r.status) && r.kind !== "propuesta_recuperacion" && (
        <button type="button" className="text-[11px] font-semibold text-[#8D887F] underline" onClick={() => classAction({ action: "responder", requestId: r.id, response: "retirar" }).then((m) => onDone(m, "Solicitud retirada."))}>Retirar solicitud</button>
      )}
    </div>
  );
}
