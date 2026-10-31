"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ANSWER_LABEL, NO_RESPONSE_HOURS, STAGE_LABEL, hoursLeft, mailtoLink, offerStage, whatsappLink, whatsappText,
  type OfferEvent, type OfferStage, type StaffOffer, type WhatsAppKind,
} from "@/lib/assignment-offers";

type Notify = (text: string, type: "success" | "error") => void;

const STAGE_STYLE: Record<OfferStage, string> = {
  cerrada: "bg-slate-100 text-slate-500",
  seleccionado: "bg-emerald-100 text-emerald-800",
  sustituto: "bg-sky-100 text-sky-800",
  no_seleccionado: "bg-slate-100 text-slate-600",
  llamada_hecha: "bg-indigo-100 text-indigo-800",
  llamada_solicitada: "bg-indigo-50 text-indigo-700",
  si: "bg-emerald-50 text-emerald-700",
  ajustar: "bg-amber-100 text-amber-800",
  no: "bg-rose-50 text-rose-700",
  esperando: "bg-slate-50 text-slate-600",
  sin_respuesta: "bg-rose-100 text-rose-800",
};

const EVENT_LABEL: Record<string, string> = {
  recibida: "Propuesta enviada al mentor",
  respuesta: "Respuesta del mentor",
  recordatorio: "Recordatorio enviado",
  llamada_solicitada: "Llamada solicitada",
  llamada_hecha: "Llamada hecha",
  seleccionado: "Seleccionado",
  sustituto: "Sustituto previsto",
  no_seleccionado: "No seleccionado para este alumno",
  decision_quitada: "Decisión quitada",
  cerrada: "Propuesta cerrada",
  reabierta: "Propuesta abierta de nuevo",
};

/** Lo que pide que alguien haga algo: respuestas sin gestionar y plazos vencidos. */
function needsAction(stage: OfferStage): boolean {
  return stage === "si" || stage === "ajustar" || stage === "sin_respuesta" || stage === "llamada_solicitada";
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

/**
 * Panel «Propuestas»: candidatos de cada alumno, sus respuestas y las acciones
 * del responsable. Lo usan administración (todas) y coordinación (sus mentores).
 * WhatsApp y correo solo abren el mensaje preparado: lo envía la persona.
 */
export default function OffersPanel({ notify }: { notify: Notify }) {
  const [offers, setOffers] = useState<StaffOffer[]>([]);
  const [events, setEvents] = useState<OfferEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [onlyPending, setOnlyPending] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const response = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Ha ocurrido un error.");
    return result as { offers?: StaffOffer[]; events?: OfferEvent[] };
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await api("/api/propuestas");
      setOffers(Array.isArray(result.offers) ? result.offers : []);
      setEvents(Array.isArray(result.events) ? result.events : []);
      setNow(Date.now());
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudieron cargar las propuestas.", "error");
    } finally {
      setLoading(false);
    }
  }, [api, notify]);

  useEffect(() => {
    let alive = true;
    api("/api/propuestas")
      .then((result) => {
        if (!alive) return;
        setOffers(Array.isArray(result.offers) ? result.offers : []);
        setEvents(Array.isArray(result.events) ? result.events : []);
        setNow(Date.now());
      })
      .catch((e) => { if (alive) notify(e instanceof Error ? e.message : "No se pudieron cargar las propuestas.", "error"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, notify]);

  const act = async (offer: StaffOffer, action: string, note = "", success = "Guardado.") => {
    setBusy(true);
    try {
      await api(`/api/propuestas/${offer.id}`, { method: "POST", body: JSON.stringify({ action, note }) });
      notify(success, "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo guardar.", "error");
    } finally {
      setBusy(false);
    }
  };

  /** Abre WhatsApp en el clic (para que el navegador no lo bloquee) y, si toca, lo apunta. */
  const openWhatsApp = (offer: StaffOffer, kind: WhatsAppKind, record?: string) => {
    const link = whatsappLink(offer.mentorPhone, whatsappText(kind, offer));
    if (!link) { notify("No tenemos un teléfono válido de este mentor.", "error"); return; }
    window.open(link, "_blank", "noopener,noreferrer");
    if (record) void act(offer, record, "", record === "recordatorio" ? "Recordatorio apuntado." : "Llamada solicitada apuntada.");
  };

  const groups = useMemo(() => {
    const byCode = new Map<string, StaffOffer[]>();
    for (const o of offers) byCode.set(o.code, [...(byCode.get(o.code) ?? []), o]);
    return [...byCode.entries()]
      .map(([code, list]) => ({ code, list, pending: list.some((o) => needsAction(offerStage(o, now))), latest: list[0]?.sentAt ?? "" }))
      .filter((g) => !onlyPending || g.pending || !(g.list.some((o) => o.decision === "seleccionado") || g.list.every((o) => o.closedAt)))
      .sort((a, b) => Number(b.pending) - Number(a.pending) || b.latest.localeCompare(a.latest));
  }, [offers, now, onlyPending]);

  const pendingCount = useMemo(() => offers.filter((o) => needsAction(offerStage(o, now))).length, [offers, now]);

  if (loading) return <p className="text-xs text-slate-500">Cargando propuestas…</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-slate-900">Propuestas de alumnos a mentores</h2>
          <p className="text-xs text-slate-500">
            {pendingCount ? `${pendingCount} piden una acción` : "Nada pendiente"} · Sin respuesta a las {NO_RESPONSE_HOURS} h del envío.
            WhatsApp y correo abren el mensaje preparado; lo revisas y lo envías tú.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-slate-600">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            Ocultar alumnos ya resueltos
          </label>
          <button type="button" onClick={() => void load()} disabled={busy} className="rounded-xl border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">Actualizar</button>
        </div>
      </div>

      {groups.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
          Todavía no ha llegado ninguna propuesta al campus. Aparecen aquí en cuanto el Apps Script envía el correo «Posible alumno para ti».
        </p>
      )}

      {groups.map(({ code, list }) => {
        const first = list[0];
        const selected = list.find((o) => o.decision === "seleccionado");
        const backup = list.find((o) => o.decision === "sustituto");
        return (
          <article key={code} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-serif text-base text-slate-900">{first.studentLabel || "Alumno sin nombre en el campus"}</h3>
                <p className="text-xs text-slate-500">{[first.course, first.zone, first.intensity].filter(Boolean).join(" · ")}</p>
                {first.slots && <p className="text-xs text-slate-500">Disponibilidad de la familia: {first.slots}</p>}
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <p>{list.length} mentor{list.length === 1 ? "" : "es"} contactado{list.length === 1 ? "" : "s"}</p>
                {selected && <p className="font-semibold text-emerald-700">Seleccionado: {selected.mentorName || selected.mentorEmail}</p>}
                {backup && <p className="text-sky-700">Sustituto: {backup.mentorName || backup.mentorEmail}</p>}
                <p className="font-mono text-[10px] text-slate-400">{code}</p>
              </div>
            </header>
            <div className="space-y-2">
              {list.map((o) => (
                <OfferRow key={o.id} offer={o} now={now} busy={busy} events={events.filter((e) => e.offerId === o.id)}
                  hasSelected={Boolean(selected && selected.id !== o.id)} onAct={act} onWhatsApp={openWhatsApp} />
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function OfferRow({ offer, now, busy, events, hasSelected, onAct, onWhatsApp }: {
  offer: StaffOffer; now: number; busy: boolean; events: OfferEvent[]; hasSelected: boolean;
  onAct: (offer: StaffOffer, action: string, note?: string, success?: string) => Promise<void>;
  onWhatsApp: (offer: StaffOffer, kind: WhatsAppKind, record?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const stage = offerStage(offer, now);
  const closed = Boolean(offer.closedAt);
  const canReply = !offer.response && !closed;
  const positive = offer.response === "si" || offer.response === "ajustar";
  const hasPhone = Boolean(whatsappLink(offer.mentorPhone, "x"));
  const btn = "rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";
  const mail = mailtoLink(offer.mentorEmail, "Propuesta de alumno · Método Kiru", whatsappText(canReply ? (offer.reminderSentAt || stage === "sin_respuesta" ? "recordatorio" : "nueva") : "llamada", offer));

  return (
    <div className={`rounded-xl border p-3 ${needsAction(stage) ? "border-amber-200 bg-amber-50/40" : "border-slate-100 bg-slate-50/50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{offer.mentorName || offer.mentorEmail}</p>
          <p className="text-[11px] text-slate-500">
            {offer.mentorEmail}{offer.mentorPhone ? ` · ${offer.mentorPhone}` : " · sin teléfono"} · enviada {fmt(offer.sentAt)}
          </p>
        </div>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STAGE_STYLE[stage]}`}>
          {STAGE_LABEL[stage]}{stage === "esperando" ? ` · quedan ${hoursLeft(offer.sentAt, now)} h` : ""}
        </span>
      </div>

      <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
        {offer.response && (
          <p>Respuesta: <b>{ANSWER_LABEL[offer.response]}</b> {fmt(offer.respondedAt)} {offer.responseSource ? `(desde el ${offer.responseSource})` : ""}
            {offer.responseDetail ? ` · Alternativa: ${offer.responseDetail}` : offer.response === "ajustar" ? " · La alternativa llega por el formulario de Jotform" : ""}</p>
        )}
        {offer.reminderSentAt && <p>Recordatorio: {fmt(offer.reminderSentAt)}</p>}
        {offer.callRequestedAt && <p>Llamada solicitada: {fmt(offer.callRequestedAt)}{offer.callDoneAt ? ` · hecha ${fmt(offer.callDoneAt)}` : ""}</p>}
        {offer.callNotes && <p>Resultado de la llamada: {offer.callNotes}</p>}
        {offer.decision && <p>Decisión {fmt(offer.decidedAt)}{offer.decisionNote ? `: ${offer.decisionNote}` : ""}</p>}
        {offer.decision === "no_seleccionado" && <p className="text-slate-500">Sigue en el equipo y puede recibir otras propuestas.</p>}
      </div>

      {!closed && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {canReply && <button type="button" className={btn} disabled={busy || !hasPhone} onClick={() => onWhatsApp(offer, "nueva")}>WhatsApp: aviso de propuesta</button>}
          {canReply && <button type="button" className={btn} disabled={busy || !hasPhone} onClick={() => onWhatsApp(offer, "recordatorio", "recordatorio")}>WhatsApp: recordatorio</button>}
          {positive && !offer.callDoneAt && <button type="button" className={btn} disabled={busy || !hasPhone} onClick={() => onWhatsApp(offer, "llamada", "llamada_solicitada")}>WhatsApp: pedir llamada de 10 min</button>}
          <a className={btn} href={mail}>Correo</a>
          {canReply && <button type="button" className={btn} disabled={busy} onClick={() => void onAct(offer, "recordatorio", "", "Recordatorio apuntado.")}>Apuntar recordatorio enviado</button>}
        </div>
      )}

      {!closed && (positive || offer.decision) && (
        <div className="mt-2 space-y-1.5">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2}
            placeholder="Resultado de la llamada o motivo de la decisión (opcional)"
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 focus:outline-none" />
          <div className="flex flex-wrap gap-1.5">
            {positive && !offer.callDoneAt && <button type="button" className={btn} disabled={busy} onClick={() => void onAct(offer, "llamada_hecha", note, "Llamada apuntada.").then(() => setNote(""))}>Apuntar llamada hecha</button>}
            {positive && offer.decision !== "seleccionado" && <button type="button" className={`${btn} border-emerald-300 text-emerald-800`} disabled={busy || hasSelected} title={hasSelected ? "Ya hay un mentor seleccionado para este alumno" : ""} onClick={() => void onAct(offer, "seleccionado", note, "Mentor seleccionado.")}>Seleccionar</button>}
            {positive && offer.decision !== "sustituto" && <button type="button" className={btn} disabled={busy} onClick={() => void onAct(offer, "sustituto", note, "Marcado como sustituto.")}>Sustituto</button>}
            {offer.decision !== "no_seleccionado" && positive && <button type="button" className={btn} disabled={busy} onClick={() => void onAct(offer, "no_seleccionado", note, "No seleccionado para este alumno. Sigue en el equipo.")}>No seleccionado</button>}
            {offer.decision && <button type="button" className={btn} disabled={busy} onClick={() => void onAct(offer, "decision_quitada", "", "Decisión quitada.")}>Quitar decisión</button>}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
        {closed
          ? <button type="button" className="font-semibold text-slate-600 underline" disabled={busy} onClick={() => void onAct(offer, "reabierta", "", "Propuesta abierta de nuevo.")}>Abrir de nuevo</button>
          : <button type="button" className="font-semibold text-slate-600 underline" disabled={busy} onClick={() => {
              if (canReply && !offer.reminderSentAt && !window.confirm("Todavía no se ha enviado ningún recordatorio. ¿Cerrar igualmente?")) return;
              void onAct(offer, "cerrada", "", "Propuesta cerrada.");
            }}>Cerrar propuesta</button>}
        {events.length > 0 && <button type="button" className="text-slate-500 underline" onClick={() => setShowHistory(!showHistory)}>{showHistory ? "Ocultar historial" : `Historial (${events.length})`}</button>}
      </div>
      {showHistory && (
        <ul className="mt-1 space-y-0.5 border-l-2 border-slate-200 pl-2 text-[11px] text-slate-500">
          {events.map((e, i) => (
            <li key={`${e.createdAt}-${i}`}>{fmt(e.createdAt)} · {EVENT_LABEL[e.action] ?? e.action}{e.detail ? `: ${e.detail}` : ""}{e.actorName ? ` · ${e.actorName}` : ""}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
