"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Copy, ExternalLink, MessageCircle, Phone, RefreshCw, Video } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  callWhen, CALL_STATUS_LABEL, DAY_NAMES, DAY_SHORT, fromMinutes, MENTOR_CALL_CRITERIA, MODE_LABEL, PLAN_STATUS_LABEL, PRESENCE_LABEL,
  whatsappLink, type CallMode, type CallView, type MentorCallKey, type MentorPresence, type PersonAvailability, type PlanResponses,
  type PlanStatus, type PlanView, type StaffCallsPayload,
} from "@/lib/llamadas";

type Notify = (text: string, type: "success" | "error") => void;

const button = "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const darkButton = "inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50";
const input = "w-full rounded-xl border border-slate-200 bg-[#F7F6F3] p-2.5 text-xs text-slate-800 focus:outline-none";
const card = "rounded-3xl border border-[#E7E3DC] bg-white p-5 shadow-sm space-y-3";

const PLAN_STYLE: Record<PlanStatus, string> = {
  sin_datos: "bg-amber-50 text-amber-800",
  sin_hueco: "bg-rose-50 text-rose-700",
  confirmada: "bg-emerald-100 text-emerald-800",
  pausada: "bg-slate-100 text-slate-600",
};

async function copy(text: string, notify: Notify) {
  try { await navigator.clipboard.writeText(text); notify("Copiado.", "success"); }
  catch { notify("No se pudo copiar. Selecciona el texto y cópialo a mano.", "error"); }
}

/**
 * Llamadas semanales con las familias (pestaña del coordinador; administración lo ve todo).
 * El campus fija solo la hora con el «match»; aquí se valora al mentor tras las semanas 1 y 4,
 * se apunta lo que contaron los padres y se puede mover una semana o cambiar la hora fija.
 */
export default function StaffCalls({ notify }: { notify: Notify }) {
  const [data, setData] = useState<StaffCallsPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusCall, setFocusCall] = useState<string | null>(null);

  const api = useCallback(async (init: { method?: string; body?: unknown } = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const response = await fetch("/api/llamadas", {
      method: init.method ?? "GET", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Ha ocurrido un error.");
    return result;
  }, []);

  const load = useCallback(async () => {
    try { setData(await api() as StaffCallsPayload); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudieron cargar las llamadas.", "error"); }
  }, [api, notify]);

  useEffect(() => {
    let alive = true;
    const id = new URLSearchParams(window.location.search).get("llamada");
    api().then((r) => { if (alive) { setData(r as StaffCallsPayload); if (id) setFocusCall(id); } })
      .catch((e) => { if (alive) notify(e instanceof Error ? e.message : "No se pudieron cargar las llamadas.", "error"); });
    return () => { alive = false; };
  }, [api, notify]);

  useEffect(() => {
    if (!focusCall || !data) return;
    const t = window.setTimeout(() => document.getElementById(`llamada-${focusCall}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    return () => window.clearTimeout(t);
  }, [focusCall, data]);

  const run = async (body: unknown, ok: string) => {
    if (busy) return false;
    setBusy(true);
    try { await api({ method: "POST", body }); await load(); notify(ok, "success"); return true; }
    catch (e) { notify(e instanceof Error ? e.message : "Ha ocurrido un error.", "error"); return false; }
    finally { setBusy(false); }
  };

  const toRate = useMemo(() => (data?.calls ?? []).filter((c) => c.needsRating), [data]);
  const upcoming = useMemo(() => (data?.calls ?? []).filter((c) => c.status === "programada" && !c.needsRating), [data]);
  const done = useMemo(() => (data?.calls ?? []).filter((c) => c.status !== "programada").reverse().slice(0, 15), [data]);

  if (!data) return <p className="rounded-3xl border border-[#E7E3DC] bg-white p-5 text-sm text-slate-500">Cargando llamadas…</p>;
  const off = data.settings?.mode === "apagado";

  return (
    <div className="space-y-5">
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">Llamadas semanales con las familias</h2>
            <p className="text-xs text-slate-500 max-w-2xl">20 minutos cada semana, a la misma hora. Semanas 1 y 4 del ciclo: familia + mentor + tú. Semanas 2 y 3: familia + tú. El campus busca solo la hora con los formularios de disponibilidad y avisa a todos; después de las semanas 1 y 4 te pedirá que valores al mentor.</p>
          </div>
          <button type="button" className={button} disabled={busy} onClick={() => load()}><RefreshCw className="h-3.5 w-3.5" /> Actualizar</button>
        </div>
        {off && <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">El sistema está apagado: no se crean llamadas ni se envían correos. Administración lo enciende abajo, en «Ajustes».</p>}
      </section>

      <MySetup data={data} busy={busy} run={run} notify={notify} />

      {toRate.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Por valorar ({toRate.length})</h3>
          {toRate.map((c) => <CloseCall key={c.id} call={c} busy={busy} run={run} highlight={focusCall === c.id} />)}
        </section>
      )}

      <section className={card}>
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Próximas llamadas</h3>
        {upcoming.length === 0 ? <p className="text-xs text-slate-500">No hay llamadas en las próximas 3 semanas.</p> : (
          <div className="space-y-2">
            {upcoming.map((c) => <UpcomingCall key={c.id} call={c} busy={busy} run={run} highlight={focusCall === c.id} />)}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Familias ({data.plans.length})</h3>
        {data.plans.length === 0 && <p className="rounded-3xl border border-[#E7E3DC] bg-white p-5 text-xs text-slate-500">{off ? "Cuando se encienda el sistema aparecerán aquí tus familias." : "No tienes familias en el sistema de llamadas todavía."}</p>}
        {data.plans.map((p) => <PlanCard key={p.studentId} plan={p} busy={busy} run={run} notify={notify} isAdmin={data.role === "admin"} />)}
      </section>

      {done.length > 0 && (
        <section className={card}>
          <h3 className="text-sm font-bold text-slate-900">Últimas llamadas</h3>
          <div className="space-y-2">
            {done.map((c) => (
              <div key={c.id} className="rounded-2xl border border-slate-100 p-3 text-xs space-y-1">
                <p className="font-semibold text-slate-800">{c.studentName} · {callWhen(c.scheduledStart)} · semana {c.weekNo} · {CALL_STATUS_LABEL[c.status]}</p>
                {c.mentorPresence && <p className="text-slate-600">Mentor: {PRESENCE_LABEL[c.mentorPresence]}{c.mentorPresence === "estuvo" ? ` · ${MENTOR_CALL_CRITERIA.map((k) => `${k.label} ${c.ratings[k.key] ?? "–"}`).join(" · ")}` : ""}</p>}
                {c.parentsTopics && <p className="text-slate-600">Padres: {c.parentsTopics}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.unlinked.length > 0 && <Unlinked data={data} busy={busy} run={run} />}
      {data.role === "admin" && data.settings && <AdminSettings data={data} busy={busy} run={run} />}
    </div>
  );
}

type Run = (body: unknown, ok: string) => Promise<boolean>;

function MySetup({ data, busy, run, notify }: { data: StaffCallsPayload; busy: boolean; run: Run; notify: Notify }) {
  const [zoom, setZoom] = useState(data.me.zoomUrl);
  const [ack, setAck] = useState(data.me.rulesAck);
  const ready = Boolean(data.me.zoomUrl && data.me.rulesAck && data.me.answeredAt);
  return (
    <section className={`${card} ${ready ? "" : "border-amber-200"}`}>
      <h3 className="text-sm font-bold text-slate-900">{ready ? "Tus datos para las llamadas" : "Antes de tus llamadas (incorporación)"}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="zoom-url" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Enlace de tu sala personal de Zoom</label>
          <input id="zoom-url" className={input} placeholder="https://us05web.zoom.us/j/…" value={zoom} onChange={(e) => setZoom(e.target.value)} />
          <p className="text-[11px] text-slate-500">Zoom gratis sirve: corta a los 40 minutos y las llamadas son de 20. Usa siempre la misma sala; las familias reciben este enlace.</p>
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
            <span>Haré las llamadas desde la <b>aplicación de escritorio de Zoom</b> y las <b>grabaré</b> (en la versión gratis solo se graba desde la aplicación de escritorio, en el ordenador).</span>
          </label>
          <button type="button" className={darkButton} disabled={busy} onClick={() => run({ action: "zoom", zoomUrl: zoom, rulesAck: ack }, "Guardado.")}>Guardar</button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Tu disponibilidad para llamadas</p>
          <p className="text-[11px] text-slate-500">{data.me.answeredAt ? `La rellenaste el ${new Date(data.me.answeredAt).toLocaleDateString("es-ES")}. Si cambia, vuelve a rellenarla: cuenta la última.` : "Aún no la has rellenado. Sin ella el campus no puede buscar hora con tus familias."}</p>
          <div className="flex flex-wrap gap-2">
            <a className={button} href={data.me.teamFormUrl} target="_blank" rel="noopener noreferrer">Abrir el formulario <ExternalLink className="h-3.5 w-3.5" /></a>
            <button type="button" className={button} onClick={() => copy(data.me.teamFormUrl, notify)}><Copy className="h-3.5 w-3.5" /> Copiar enlace</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Scale({ value, onChange, name }: { value: number | null; onChange: (v: number) => void; name: string }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label={name}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)}
          className={`h-8 w-8 rounded-lg border text-xs font-bold ${value === n ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{n}</button>
      ))}
    </div>
  );
}

/** Cerrar una llamada: semanas 1 y 4 con la valoración del mentor (1-5); semanas 2 y 3 solo «hecha» y lo que contaron los padres. */
function CloseCall({ call, busy, run, highlight }: { call: CallView; busy: boolean; run: Run; highlight: boolean }) {
  const [presence, setPresence] = useState<MentorPresence | null>(null);
  const [ratings, setRatings] = useState<Record<MentorCallKey, number | null>>(call.ratings);
  const [topics, setTopics] = useState(call.parentsTopics);
  const [comment, setComment] = useState(call.comment);
  const mentor = call.mentorName.split(" ")[0] || "el mentor";
  return (
    <div id={`llamada-${call.id}`} className={`${card} ${highlight ? "ring-2 ring-slate-900" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">{call.studentName} · {callWhen(call.scheduledStart)}</p>
        <span className="text-[11px] text-slate-500">Semana {call.weekNo} · {call.withMentor ? `con ${mentor}` : "familia y tú"}</span>
      </div>
      {call.withMentor && (
        <>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-700">¿Estuvo {mentor} en la llamada?</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PRESENCE_LABEL) as MentorPresence[]).map((k) => (
                <button key={k} type="button" onClick={() => setPresence(k)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${presence === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{PRESENCE_LABEL[k]}</button>
              ))}
            </div>
          </div>
          {presence === "estuvo" && (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500">1 = muy mal · 5 = muy bien</p>
              {MENTOR_CALL_CRITERIA.map((k) => (
                <div key={k.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{k.label}</p><p className="text-[11px] text-slate-500">{k.hint}</p></div>
                  <Scale name={k.label} value={ratings[k.key]} onChange={(v) => setRatings((r) => ({ ...r, [k.key]: v }))} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="space-y-1">
        <label htmlFor={`topics-${call.id}`} className="text-xs font-semibold text-slate-700">Lo más importante que contaron los padres (opcional)</label>
        <textarea id={`topics-${call.id}`} className={input} rows={2} value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Una o dos frases" />
      </div>
      {call.withMentor && presence && (
        <div className="space-y-1">
          <label htmlFor={`comment-${call.id}`} className="text-xs font-semibold text-slate-700">Comentario sobre {mentor} (opcional)</label>
          <textarea id={`comment-${call.id}`} className={input} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={darkButton} disabled={busy || (call.withMentor && !presence)}
          onClick={() => run({ action: "cerrar", callId: call.id, status: "hecha", mentorPresence: presence, ratings, parentsTopics: topics, comment }, call.withMentor ? "Valoración guardada." : "Guardado.")}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Guardar
        </button>
        <button type="button" className={button} disabled={busy} onClick={() => run({ action: "cerrar", callId: call.id, status: "no_hecha", parentsTopics: topics }, "Anotado: no se hizo.")}>No se hizo la llamada</button>
      </div>
    </div>
  );
}

function UpcomingCall({ call, busy, run, highlight }: { call: CallView; busy: boolean; run: Run; highlight: boolean }) {
  const [moving, setMoving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [date, setDate] = useState(call.scheduledStart.slice(0, 10));
  const [time, setTime] = useState("");
  const past = call.ended;
  return (
    <div id={`llamada-${call.id}`} className={`rounded-2xl border border-slate-100 p-3 space-y-2 ${highlight ? "ring-2 ring-slate-900" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">{callWhen(call.scheduledStart)} · {call.studentName}</p>
          <p className="text-slate-500">Semana {call.weekNo} · {call.withMentor ? `con ${call.mentorName.split(" ")[0] || "el mentor"}` : "familia y tú"} · {call.medium === "telefono" ? `teléfono${call.phone ? ` ${call.phone}` : ""}` : "Zoom"}{call.moved ? " · movida esta semana" : ""}</p>
        </div>
        <div className="flex gap-2">
          {call.medium === "zoom" && call.zoomUrl && <a className={button} href={call.zoomUrl} target="_blank" rel="noopener noreferrer"><Video className="h-3.5 w-3.5" /> Zoom</a>}
          {call.medium === "telefono" && call.phone && <span className={button}><Phone className="h-3.5 w-3.5" /> {call.phone}</span>}
          <button type="button" className={button} onClick={() => setMoving((v) => !v)}>Mover</button>
          {past && !call.withMentor && <button type="button" className={button} onClick={() => setClosing((v) => !v)}>¿Se hizo?</button>}
        </div>
      </div>
      {moving && (
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" className={`${input} w-auto`} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Día" />
          <input type="time" step={1800} className={`${input} w-auto`} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hora" />
          <button type="button" className={darkButton} disabled={busy || !time}
            onClick={async () => { if (await run({ action: "mover_staff", callId: call.id, date, time }, "Llamada movida. Avisamos a la familia.")) setMoving(false); }}>Mover solo esta semana</button>
        </div>
      )}
      {closing && <CloseCall call={call} busy={busy} run={run} highlight={false} />}
    </div>
  );
}

/** Lo que respondió una persona en su formulario: días, franjas y preferencias. */
function PersonResponse({ title, a, emptyText }: { title: string; a: PersonAvailability | null; emptyText: string }) {
  const first = a?.name ? a.name.split(" ")[0] : "";
  return (
    <div className="rounded-2xl border border-slate-100 bg-[#FAF8F5] p-3">
      <p className="text-xs font-bold text-slate-800">{title}{first && title !== "Familia" ? ` · ${first}` : ""}</p>
      {!a ? <p className="mt-1 text-[11px] text-slate-400">{emptyText}</p> : (
        <>
          {a.days.length ? (
            <ul className="mt-1.5 space-y-0.5 text-[11px]">
              {a.days.map((day) => (
                <li key={day.d} className="flex gap-2">
                  <span className="w-9 shrink-0 font-semibold text-slate-700">{DAY_SHORT[day.d]}</span>
                  <span className="text-slate-600">{day.ranges.join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-[11px] text-slate-400">Sin franjas indicadas.</p>}
          {a.medium && <p className="mt-1.5 text-[11px] text-slate-500">Prefiere: {a.medium === "telefono" ? `teléfono${a.phone ? ` (${a.phone})` : ""}` : "Zoom"}</p>}
          {a.bothParentsDays && a.bothParentsDays.length > 0 && <p className="text-[11px] text-slate-500">Los dos padres: {a.bothParentsDays.map((d) => DAY_SHORT[d]).join(", ")}</p>}
          {a.note && <p className="mt-1 text-[11px] text-amber-800">Compromisos: {a.note}</p>}
          {a.answeredAt && <p className="mt-1 text-[10px] text-slate-400">Respondió el {new Date(a.answeredAt).toLocaleDateString("es-ES")}</p>}
        </>
      )}
    </div>
  );
}

function ResponsesView({ r, hasMentor }: { r: PlanResponses; hasMentor: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-700">Lo que ha respondido cada uno</p>
      <div className="grid gap-2 md:grid-cols-3">
        <PersonResponse title="Familia" a={r.family} emptyText="La familia aún no ha rellenado su formulario." />
        <PersonResponse title="Coordinador" a={r.coordinator} emptyText="Falta tu disponibilidad (formulario del equipo)." />
        <PersonResponse title="Mentor" a={r.mentor} emptyText={hasMentor ? "El mentor aún no ha rellenado su formulario." : "Sin mentor: todas las semanas con el coordinador."} />
      </div>
      <p className="text-[11px] text-slate-500">Las horas comunes se cruzan solas abajo; aquí ves lo que puso cada uno por si prefieres fijarla tú.</p>
    </div>
  );
}

function PlanCard({ plan, busy, run, notify, isAdmin }: { plan: PlanView; busy: boolean; run: Run; notify: Notify; isAdmin: boolean }) {
  const [open, setOpen] = useState(plan.status !== "confirmada");
  const [wd, setWd] = useState(String(plan.weekday ?? 1));
  const [start, setStart] = useState(plan.start ?? "19:00");
  const [split, setSplit] = useState(Boolean(plan.mentorWeekday));
  const [mwd, setMwd] = useState(String(plan.mentorWeekday ?? 1));
  const [mstart, setMstart] = useState(plan.mentorStart ?? "19:00");
  const [override, setOverride] = useState(plan.startOverride ?? "");
  const fixed = plan.weekday && plan.start ? `${DAY_NAMES[plan.weekday]} ${plan.start}` : null;
  const mentorFixed = plan.mentorWeekday && plan.mentorStart ? `${DAY_NAMES[plan.mentorWeekday]} ${plan.mentorStart}` : null;
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{plan.studentName}</p>
          <p className="text-[11px] text-slate-500">Mentor: {plan.mentorName || "sin mentor"}{isAdmin ? ` · Coordinador: ${plan.coordinatorName || "—"}` : ""} · {plan.medium === "telefono" ? "por teléfono" : "por Zoom"}{plan.bothParents ? " · pueden los dos padres" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PLAN_STYLE[plan.status]}`}>{PLAN_STATUS_LABEL[plan.status]}</span>
          <button type="button" className={button} onClick={() => setOpen((v) => !v)}>{open ? "Cerrar" : "Ver"}</button>
        </div>
      </div>
      {fixed && <p className="text-xs text-slate-800">Cada <b>{fixed}</b>{mentorFixed ? <> · semanas 1 y 4 con el mentor: <b>{mentorFixed}</b></> : " (el mentor se une las semanas 1 y 4)"}{plan.confirmedVia === "manual" ? " · fijada a mano" : ""}</p>}
      {plan.missing.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-800">{plan.missing.map((m) => <li key={m}>{m}</li>)}</ul>}
      {open && (
        <div className="space-y-4 border-t border-slate-100 pt-3">
          <ResponsesView r={plan.responses} hasMentor={Boolean(plan.mentorId)} />
          {plan.whatsappText && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Avisar en el grupo de WhatsApp de la familia</p>
              <pre className="whitespace-pre-wrap rounded-2xl bg-[#F7F6F3] p-3 text-[11px] text-slate-700">{plan.whatsappText}</pre>
              <div className="flex flex-wrap gap-2">
                <a className={darkButton} href={whatsappLink(plan.whatsappText)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" /> Abrir WhatsApp</a>
                <button type="button" className={button} onClick={() => copy(plan.whatsappText, notify)}><Copy className="h-3.5 w-3.5" /> Copiar texto</button>
              </div>
              <p className="text-[11px] text-slate-500">WhatsApp te deja elegir el grupo de la familia (con el mentor) antes de enviar.</p>
            </div>
          )}
          {plan.options.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Horas que van bien a todos</p>
              {plan.options.map((o, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 p-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{DAY_NAMES[o.weekday]} {fromMinutes(o.start)}{o.mentorWeekday && o.mentorStart !== null ? ` · semanas con mentor: ${DAY_NAMES[o.mentorWeekday]} ${fromMinutes(o.mentorStart)}` : ""}</p>
                    <p className="text-slate-500">{o.reasons.join(" · ")}</p>
                  </div>
                  {!(plan.weekday === o.weekday && plan.start === fromMinutes(o.start) && (plan.mentorWeekday ?? null) === o.mentorWeekday) && (
                    <button type="button" className={button} disabled={busy}
                      onClick={() => run({ action: "fijar", studentId: plan.studentId, weekday: o.weekday, start: fromMinutes(o.start), mentorWeekday: o.mentorWeekday, mentorStart: o.mentorStart === null ? null : fromMinutes(o.mentorStart) }, "Hora cambiada. Avisamos a la familia y al mentor.")}>Usar esta</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Fijar la hora a mano</p>
            <div className="flex flex-wrap items-end gap-2">
              <select className={`${input} w-auto`} value={wd} onChange={(e) => setWd(e.target.value)} aria-label="Día">{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}</select>
              <input type="time" step={1800} className={`${input} w-auto`} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Hora" />
              <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Otra hora para las semanas con mentor</label>
              {split && (
                <>
                  <select className={`${input} w-auto`} value={mwd} onChange={(e) => setMwd(e.target.value)} aria-label="Día con mentor">{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}</select>
                  <input type="time" step={1800} className={`${input} w-auto`} value={mstart} onChange={(e) => setMstart(e.target.value)} aria-label="Hora con mentor" />
                </>
              )}
              <button type="button" className={darkButton} disabled={busy}
                onClick={() => run({ action: "fijar", studentId: plan.studentId, weekday: Number(wd), start, mentorWeekday: split ? Number(mwd) : null, mentorStart: split ? mstart : null }, "Hora fijada. Avisamos a la familia y al mentor.")}>Fijar</button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Formulario de la familia</p>
              <p className="text-[11px] text-slate-500">{plan.familyAnswered ? `Lo rellenaron el ${new Date(plan.familyAnswered).toLocaleDateString("es-ES")}.` : "Aún no lo han rellenado (les llegó por correo y lo tienen en su panel)."}{plan.commitments ? ` Compromisos: ${plan.commitments}` : ""}</p>
              <button type="button" className={button} onClick={() => copy(plan.familyFormUrl, notify)}><Copy className="h-3.5 w-3.5" /> Copiar su enlace personal</button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Semana 1 del ciclo</p>
              <p className="text-[11px] text-slate-500">{plan.anchorMonday ? `Empieza la semana del ${new Date(`${plan.anchorMonday}T12:00:00Z`).toLocaleDateString("es-ES")} (semana de su primera clase).` : "Aún no tiene ninguna clase en el calendario."} Cámbiala solo si no es correcta.</p>
              <div className="flex flex-wrap items-end gap-2">
                <input type="date" className={`${input} w-auto`} value={override} onChange={(e) => setOverride(e.target.value)} aria-label="Primera clase" />
                <button type="button" className={button} disabled={busy} onClick={() => run({ action: "inicio", studentId: plan.studentId, date: override }, "Guardado.")}>Guardar</button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy} onClick={() => run({ action: "buscar", studentId: plan.studentId, force: true }, "Hora revisada.")}><RefreshCw className="h-3.5 w-3.5" /> Buscar otra vez la mejor hora</button>
            <button type="button" className={button} disabled={busy} onClick={() => run({ action: "pausar", studentId: plan.studentId, paused: plan.status !== "pausada" }, plan.status === "pausada" ? "Llamadas reanudadas." : "Llamadas en pausa.")}>{plan.status === "pausada" ? "Reanudar llamadas" : "Pausar llamadas"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Unlinked({ data, busy, run }: { data: StaffCallsPayload; busy: boolean; run: Run }) {
  const [target, setTarget] = useState<Record<string, string>>({});
  const students = data.role === "admin" ? data.allStudents : data.plans.map((p) => ({ id: p.studentId, name: p.studentName }));
  return (
    <section className={card}>
      <h3 className="text-sm font-bold text-slate-900">Respuestas sin reconocer</h3>
      <p className="text-xs text-slate-500">Llegaron sin el enlace personal (y el correo no coincide con ninguna cuenta). Elige de quién son.</p>
      {data.unlinked.map((u) => (
        <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 p-3 text-xs">
          <span className="min-w-0 flex-1">{u.kind === "familia" ? "Familia" : "Equipo"} · {u.name || "sin nombre"}{u.studentName ? ` (alumno: ${u.studentName})` : ""} · {u.email} · {new Date(u.receivedAt).toLocaleDateString("es-ES")}</span>
          <select className={`${input} w-auto`} value={target[u.id] ?? ""} onChange={(e) => setTarget((t) => ({ ...t, [u.id]: e.target.value }))} aria-label="De quién es">
            <option value="">Elige…</option>
            {(u.kind === "familia" ? students : data.staff.map((s) => ({ id: s.id, name: s.name }))).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className={button} disabled={busy || !target[u.id]} onClick={() => run({ action: "enlazar", availabilityId: u.id, targetId: target[u.id] }, "Enlazada.")}>Guardar</button>
          <button type="button" className={button} disabled={busy} onClick={() => run({ action: "enlazar", availabilityId: u.id, archive: true }, "Archivada.")}>Archivar</button>
        </div>
      ))}
    </section>
  );
}

function AdminSettings({ data, busy, run }: { data: StaffCallsPayload; busy: boolean; run: Run }) {
  const [mode, setMode] = useState<CallMode>(data.settings!.mode);
  const [tests, setTests] = useState<string[]>(data.settings!.testStudents);
  return (
    <section className={card}>
      <h3 className="text-sm font-bold text-slate-900">Ajustes (administración)</h3>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MODE_LABEL) as CallMode[]).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${mode === m ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{MODE_LABEL[m]}</button>
        ))}
      </div>
      {mode === "prueba" && (
        <div className="flex flex-wrap gap-2">
          {data.allStudents.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs">
              <input type="checkbox" checked={tests.includes(s.id)} onChange={(e) => setTests((t) => (e.target.checked ? [...t, s.id] : t.filter((x) => x !== s.id)))} /> {s.name}
            </label>
          ))}
        </div>
      )}
      <button type="button" className={darkButton} disabled={busy} onClick={() => run({ action: "ajustes", mode, testStudents: tests }, "Ajustes guardados.")}>Guardar ajustes</button>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-slate-700">Equipo: formulario de disponibilidad y Zoom</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {data.staff.map((s) => (
            <p key={s.id} className="text-[11px] text-slate-600">{s.name} ({s.role}) · {s.answeredAt ? "formulario ✓" : "sin formulario"}{s.role !== "mentor" ? ` · ${s.zoom ? "Zoom ✓" : "sin Zoom"}` : ""}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
