"use client";

import { useState } from "react";
import { CalendarClock, RotateCcw } from "lucide-react";
import { REQUEST_STATUS_LABEL, classDateLabel, hoursUntil, type FamilyClass, type FamilyClassesData, type FamilyRequest } from "@/lib/classes";
import type { ClassOption } from "@/lib/database.types";
import { Badge, Empty, OptionsEditor, btnDark, btnLight, card, classAction, input, subtle, timeRange, useClasses } from "./shared";

const OPEN = ["pendiente", "mas_info", "contrapropuesta"];
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

/** Estado de una clase pasada, en palabras para la familia. */
function outcome(s: FamilyClass): { text: string; tone: "ok" | "warn" | "neutral" | "bad" } {
  if (s.delivery === "impartida") return { text: s.deliveredByName && s.deliveredByName !== s.mentorName ? `Realizada (la dio ${s.deliveredByName})` : "Realizada", tone: "ok" };
  if (s.delivery === "no_impartida") {
    if (s.recovery === "realizada") return { text: "Cancelada y recuperada", tone: "ok" };
    if (s.recovery === "programada") return { text: "Cancelada · recuperación confirmada", tone: "neutral" };
    if (["pendiente", "propuesta", "sin_encaje"].includes(s.recovery)) return { text: "Cancelada · conserváis la sesión para recuperarla", tone: "warn" };
    if (s.consumption === "consumida") return { text: "Cancelada con menos de 48 h · sesión consumida", tone: "bad" };
    return { text: "Cancelada", tone: "neutral" };
  }
  return { text: "Sin registro del mentor todavía", tone: "neutral" };
}

/**
 * Clases de un hijo para la familia: próximas clases (pedir cambio o
 * cancelar), fechas de recuperación por elegir, sus solicitudes y el resumen
 * del periodo (contratadas, consumidas, realizadas y por recuperar).
 */
export default function FamilyClasses({ studentId, notify }: { studentId: string; notify: (text: string, type: "success" | "error") => void }) {
  const { data, error, reload, loadedAt: now } = useClasses<FamilyClassesData>();
  const [open, setOpen] = useState<string | null>(null);
  const done = async (message: string | null, ok: string) => {
    if (message) { notify(message, "error"); return; }
    notify(ok, "success");
    setOpen(null);
    await reload();
  };
  if (error) return <div className={card}><Empty>{error}</Empty></div>;
  if (!data) return <div className={card}><Empty>Cargando clases…</Empty></div>;

  const sessions = data.sessions.filter((s) => s.studentId === studentId);
  const requests = data.requests.filter((r) => r.studentId === studentId);
  const proposals = requests.filter((r) => r.kind === "propuesta_recuperacion" && r.status === "pendiente");
  const upcoming = sessions.filter((s) => s.delivery === "programada" && new Date(s.scheduledStart).getTime() > now).slice(0, 12);
  const past = sessions.filter((s) => s.kind === "regular" && new Date(s.originalStart).getTime() <= now || s.delivery === "no_impartida").slice(-12).reverse();
  const myRequests = requests.filter((r) => r.kind !== "propuesta_recuperacion" && (OPEN.includes(r.status) || hoursUntil(r.createdAt) > -14 * 24));
  const today = new Date(now).toISOString().slice(0, 10);
  const period = data.periods.find((p) => p.studentId === studentId && p.coverageStart <= today && p.coverageEnd > today)
    ?? data.periods.find((p) => p.studentId === studentId);
  const openRequestFor = (id: string) => requests.find((r) => r.sessionId === id && OPEN.includes(r.status) && r.kind !== "propuesta_recuperacion");

  return (
    <section className={`${card} space-y-5`} aria-label="Clases">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><CalendarClock className="h-5 w-5" /> Clases</h3>
        <p className="text-xs text-[#77736B]">
          Podéis pedir un cambio o cancelar una clase desde aquí. Con al menos {data.noticeHours} h de aviso conserváis la sesión; con menos de {data.noticeHours} h
          (o si no se presenta) la sesión se considera consumida. Coordinación revisa cada petición.
        </p>
      </header>

      {period && (
        <div className={`${subtle} grid grid-cols-2 gap-2 text-xs sm:grid-cols-4`}>
          <p className="col-span-2 text-[11px] font-semibold text-[#6D6962] sm:col-span-4">Periodo del {fmtDay(period.coverageStart)} al {fmtDay(period.coverageEnd)}</p>
          <Stat label="Contratadas" value={period.sessionsIncluded ?? "—"} />
          <Stat label="Realizadas" value={period.delivered} />
          <Stat label="Consumidas" value={period.consumed} />
          <Stat label="Por recuperar" value={period.recoveriesOpen} />
        </div>
      )}

      {proposals.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-[#292825]"><RotateCcw className="h-4 w-4" /> Elegid la fecha de recuperación</h4>
          {proposals.map((r) => <ProposalCard key={r.id} request={r} session={sessions.find((s) => s.id === r.sessionId)} onDone={done} />)}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-bold text-[#292825]">Próximas clases</h4>
        {upcoming.length === 0 ? <Empty>No hay clases programadas en las próximas semanas.</Empty> : upcoming.map((s) => {
          const pending = openRequestFor(s.id);
          return (
            <div key={s.id} className={`${subtle} space-y-2`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="capitalize">{classDateLabel(s.scheduledStart)} · <span className="normal-case">{s.mentorName}</span>{s.kind === "recuperacion" && " · recuperación"}{s.rescheduled && " · fecha cambiada"}</span>
                {pending ? <Badge tone="warn">{REQUEST_STATUS_LABEL[pending.status]}</Badge>
                  : open !== s.id && <button type="button" className={btnLight} onClick={() => setOpen(s.id)}>Cambiar o cancelar</button>}
              </div>
              {open === s.id && <FamilyRequestForm session={s} hours={data.noticeHours} onCancel={() => setOpen(null)} onDone={done} />}
            </div>
          );
        })}
      </div>

      {myRequests.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-[#292825]">Peticiones</h4>
          {myRequests.map((r) => <FamilyRequestRow key={r.id} request={r} session={sessions.find((s) => s.id === r.sessionId)} onDone={done} />)}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-[#292825]">Últimas clases</h4>
          <ul className="space-y-1.5">
            {past.map((s) => {
              const o = outcome(s);
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E7E3DC] bg-white px-3 py-2 text-xs">
                  <span className="capitalize">{classDateLabel(s.originalStart)}</span>
                  <Badge tone={o.tone}>{o.text}</Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <p className="rounded-lg bg-white p-2 text-center"><span className="block font-serif text-lg font-bold text-[#292825]">{value}</span><span className="text-[10px] text-[#77736B]">{label}</span></p>;
}

function FamilyRequestForm({ session, hours, onCancel, onDone }: { session: FamilyClass; hours: number; onCancel: () => void; onDone: (m: string | null, ok: string) => void }) {
  const [kind, setKind] = useState<"cambio" | "cancelacion">("cambio");
  const [reason, setReason] = useState("");
  const [preferences, setPreferences] = useState("");
  const [options, setOptions] = useState<ClassOption[]>([]);
  const [busy, setBusy] = useState(false);
  const late = hoursUntil(session.scheduledStart) < hours;
  return (
    <div className="space-y-2 border-t border-[#E7E3DC] pt-2">
      <div className="flex gap-2">
        <button type="button" className={kind === "cambio" ? btnDark : btnLight} onClick={() => setKind("cambio")}>Pedir otra fecha</button>
        <button type="button" className={kind === "cancelacion" ? btnDark : btnLight} onClick={() => setKind("cancelacion")}>Cancelar</button>
      </div>
      {late && kind === "cancelacion" && (
        <p className="rounded-lg bg-orange-50 p-2 text-[11px] text-orange-900">Faltan menos de {hours} h: si se cancela, la sesión se considera consumida. Si hay un motivo de fuerza mayor, explicadlo y coordinación lo valorará.</p>
      )}
      {!late && kind === "cancelacion" && <p className="text-[11px] text-[#77736B]">Con este aviso conserváis la sesión: el mentor os propondrá fechas para recuperarla.</p>}
      {late && kind === "cambio" && <p className="text-[11px] text-[#77736B]">Faltan menos de {hours} h. Coordinación intentará moverla, pero puede no ser posible.</p>}
      <textarea className={input} rows={2} placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      {kind === "cambio" && (
        <>
          <p className="text-[11px] text-[#77736B]">Si tenéis fechas que os vengan bien, añadidlas; si no, indicad vuestras preferencias.</p>
          <OptionsEditor value={options} onChange={setOptions} />
          <input className={input} placeholder="Preferencias (p. ej. tardes de martes o jueves)" value={preferences} onChange={(e) => setPreferences(e.target.value)} maxLength={1000} />
        </>
      )}
      <div className="flex gap-2">
        <button type="button" className={btnDark} disabled={busy || reason.trim().length < 3}
          onClick={async () => { setBusy(true); const m = await classAction({ action: "solicitar", sessionId: session.id, kind, reason, options: kind === "cambio" ? options : [], preferences }); setBusy(false); onDone(m, "Petición enviada. Coordinación os responderá."); }}>
          Enviar
        </button>
        <button type="button" className={btnLight} onClick={onCancel}>Volver</button>
      </div>
    </div>
  );
}

function ProposalCard({ request: r, session, onDone }: { request: FamilyRequest; session?: FamilyClass; onDone: (m: string | null, ok: string) => void }) {
  const [none, setNone] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className={`${subtle} space-y-2 text-xs`}>
      <p>Para recuperar la clase del <span className="capitalize">{session ? classDateLabel(session.originalStart) : ""}</span>:</p>
      {r.reason && <p className="text-[11px] text-[#77736B]">«{r.reason}»</p>}
      <div className="flex flex-wrap gap-2">
        {r.options.map((o, i) => (
          <button key={o.start} type="button" className={btnDark} onClick={() => classAction({ action: "elegir_recuperacion", requestId: r.id, option: i }).then((m) => onDone(m, "Recuperación confirmada."))}>{timeRange(o)}</button>
        ))}
        <button type="button" className={btnLight} onClick={() => setNone((v) => !v)}>Ninguna nos encaja</button>
      </div>
      {none && (
        <div className="space-y-2">
          <input className={input} placeholder="¿Qué días y horas os vendrían bien?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          <button type="button" className={btnDark} onClick={() => classAction({ action: "elegir_recuperacion", requestId: r.id, option: null, note }).then((m) => onDone(m, "Avisado: coordinación buscará otras fechas."))}>Enviar</button>
        </div>
      )}
    </div>
  );
}

function FamilyRequestRow({ request: r, session, onDone }: { request: FamilyRequest; session?: FamilyClass; onDone: (m: string | null, ok: string) => void }) {
  const [reply, setReply] = useState("");
  const what = r.kind === "cambio" ? "Cambio" : "Cancelación";
  return (
    <div className={`${subtle} space-y-2 text-xs`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{what}{r.requestedByMe ? "" : " (pedido por el mentor)"}{session && <> · <span className="capitalize">{classDateLabel(session.originalStart)}</span></>}</span>
        <Badge tone={r.status === "aprobada" ? "ok" : r.status === "rechazada" ? "bad" : "neutral"}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
      </div>
      {r.chosenOption && <p className="text-[11px] text-[#38523A]">Nueva fecha: {timeRange(r.chosenOption)}</p>}
      {r.decisionNote && <p className="text-[11px] text-[#77736B]">Coordinación: «{r.decisionNote}»</p>}
      {r.requestedByMe && r.status === "contrapropuesta" && (
        <div className="flex flex-wrap gap-2">
          {r.options.map((o, i) => (
            <button key={o.start} type="button" className={btnDark} onClick={() => classAction({ action: "responder", requestId: r.id, response: "aceptar", option: i }).then((m) => onDone(m, "Cambio confirmado."))}>Aceptar {timeRange(o)}</button>
          ))}
        </div>
      )}
      {r.requestedByMe && r.status === "mas_info" && (
        <div className="space-y-2">
          <input className={input} placeholder="Información para coordinación" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} />
          <button type="button" className={btnDark} disabled={reply.trim().length < 3} onClick={() => classAction({ action: "responder", requestId: r.id, response: "informar", note: reply }).then((m) => onDone(m, "Información enviada."))}>Enviar</button>
        </div>
      )}
      {r.requestedByMe && OPEN.includes(r.status) && (
        <button type="button" className="text-[11px] font-semibold text-[#8D887F] underline" onClick={() => classAction({ action: "responder", requestId: r.id, response: "retirar" }).then((m) => onDone(m, "Petición retirada."))}>Retirar petición</button>
      )}
    </div>
  );
}
