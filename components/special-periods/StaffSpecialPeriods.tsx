"use client";

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import {
  DEFAULT_ZONES, KIND_LABEL, PHASE_LABEL, WHO_LABEL, classKey, dateLabel, partOfDay, proposeForYear, shortDate, zoneMatches,
  type Assignment, type SpecialPeriod, type SpecialPeriodKind, type StaffMentorAnswer, type StaffPeriodView, type StaffStudent, type SubSlot, type Who,
} from "@/lib/special-periods";
import { btnDark, btnLight, card, input, subtle } from "@/components/classes/shared";
import { euro, periodAction, useSpecialPeriods } from "./api";
import SlotGrid, { ZonePicker } from "./SlotGrid";

type Notify = (text: string, type: "success" | "error") => void;

/**
 * Periodos especiales para administración (todo) y coordinación (su grupo):
 * fechas configurables por país o región, respuestas de familias y mentores,
 * cruce con sustitutos, plan por alumno, aprobación del importe e historial.
 */
export default function StaffSpecialPeriods({ notify }: { notify: Notify }) {
  const [periodo, setPeriodo] = useState<string | null>(null);
  const { data, error, reload } = useSpecialPeriods<StaffPeriodView>(periodo);
  const [editing, setEditing] = useState<Partial<SpecialPeriod> | null>(null);
  const isAdmin = data?.role === "admin";
  const sel = data?.selected ?? null;

  const run = async (body: Record<string, unknown>, ok: string) => {
    const { error: e, data: d } = await periodAction(body);
    if (e) { notify(e, "error"); return null; }
    notify(ok, "success");
    await reload();
    return d;
  };

  if (error) return <section className={card}><p className="text-xs text-red-600">{error}</p></section>;
  if (!data) return <section className={card}><p className="text-xs text-slate-500">Cargando…</p></section>;

  return (
    <div className="space-y-5">
      <section className={`${card} space-y-3`}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CalendarRange className="h-5 w-5" /> Periodos especiales</h2>
          {isAdmin && <button type="button" className={btnLight} onClick={() => setEditing({ kind: "otro", country: "ES", region: "", zones: DEFAULT_ZONES, isActive: true })}>Nuevo periodo</button>}
        </header>
        <p className="text-xs text-slate-600">
          Navidad, Semana Santa o cualquier otro periodo, con sus fechas para cada año, país o región. Las familias y los mentores responden en su panel; aquí se cruza,
          se decide quién da cada clase y {isAdmin ? "apruebas" : "administración aprueba"} el plan con su importe. Hasta que el plan está aprobado, la renovación de esa familia no lleva precio.
        </p>
        <div className="flex flex-wrap gap-2">
          {data.periods.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriodo(p.id)}
              className={`rounded-xl px-3 py-1.5 text-xs ${sel?.period.id === p.id ? "bg-slate-900 text-white" : "border border-[#E7E3DC] text-slate-700"} ${p.isActive ? "" : "opacity-50"}`}>
              {p.name} · {p.country}{p.region ? ` ${p.region}` : ""}
            </button>
          ))}
        </div>
        {sel && (
          <div className={`${subtle} flex flex-wrap items-center justify-between gap-2 text-xs`}>
            <span>
              <strong>{sel.period.name}</strong> ({KIND_LABEL[sel.period.kind]}) · del {shortDate(sel.period.startsOn)} al {shortDate(sel.period.endsOn)} ·
              formulario {shortDate(sel.period.formOpensOn)}–{shortDate(sel.period.deadlineOn)} · excepciones hasta {shortDate(sel.period.exceptionsUntil)} ·
              cierre {shortDate(sel.period.closesOn)} · <em>{PHASE_LABEL[sel.phase]}</em>{sel.period.isActive ? "" : " · DESACTIVADO"}
            </span>
            {isAdmin && (
              <span className="flex gap-2">
                <button type="button" className={btnLight} onClick={() => setEditing(sel.period)}>Cambiar fechas</button>
                <button type="button" className={btnLight} onClick={() => setEditing(proposeForYear(sel.period, Number(sel.period.startsOn.slice(0, 4)) + 1))}>Crear el del año siguiente</button>
              </span>
            )}
          </div>
        )}
        {editing && isAdmin && (
          <PeriodEditor value={editing} onCancel={() => setEditing(null)} onSave={async (v) => {
            const d = await run({ accion: "periodo_guardar", ...v }, "Periodo guardado.");
            if (d) { setEditing(null); if (typeof d.id === "string") setPeriodo(d.id); }
          }} />
        )}
      </section>

      {sel && <PeriodWork key={sel.period.id} sel={sel} isAdmin={isAdmin} run={run} />}
    </div>
  );
}

function PeriodEditor({ value, onSave, onCancel }: { value: Partial<SpecialPeriod>; onSave: (v: Partial<SpecialPeriod>) => void; onCancel: () => void }) {
  const [v, setV] = useState<Partial<SpecialPeriod>>(value);
  const [zonesText, setZonesText] = useState((value.zones ?? DEFAULT_ZONES).join(", "));
  const field = (key: keyof SpecialPeriod, label: string, type = "date") => (
    <label className="space-y-1 text-xs text-slate-600">
      <span>{label}</span>
      <input type={type} className={input} value={(v[key] as string) ?? ""} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
    </label>
  );
  return (
    <div className={`${subtle} space-y-3`}>
      <div className="grid gap-2 sm:grid-cols-3">
        {field("name", "Nombre (p. ej. Navidad 2027)", "text")}
        <label className="space-y-1 text-xs text-slate-600"><span>Tipo</span>
          <select className={input} value={v.kind ?? "otro"} onChange={(e) => setV({ ...v, kind: e.target.value as SpecialPeriodKind })}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">{field("country", "País", "text")}{field("region", "Región", "text")}</div>
        {field("startsOn", "Primer día del periodo")}
        {field("endsOn", "Último día del periodo")}
        {field("formOpensOn", "Se abre el formulario")}
        {field("deadlineOn", "Fecha límite para responder")}
        {field("exceptionsUntil", "Excepciones hasta")}
        {field("closesOn", "Cierre de la planificación")}
      </div>
      <label className="block space-y-1 text-xs text-slate-600"><span>Zonas (separadas por comas)</span>
        <textarea className={input} rows={2} value={zonesText} onChange={(e) => setZonesText(e.target.value)} />
      </label>
      <label className="block space-y-1 text-xs text-slate-600"><span>Notas</span>
        <textarea className={input} rows={2} value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={v.isActive ?? true} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Activo (se ve en los paneles y lo consultan las renovaciones)</label>
      <div className="flex gap-2">
        <button type="button" className={btnDark} onClick={() => onSave({ ...v, zones: zonesText.split(",").map((z) => z.trim()).filter(Boolean) })}>Guardar</button>
        <button type="button" className={btnLight} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

type Sel = NonNullable<StaffPeriodView["selected"]>;
type Run = (body: Record<string, unknown>, ok: string) => Promise<Record<string, unknown> | null>;

function PeriodWork({ sel, isAdmin, run }: { sel: Sel; isAdmin: boolean; run: Run }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todos" | "sin_respuesta" | "por_revisar" | "aprobados">("todos");
  const [external, setExternal] = useState<Partial<StaffMentorAnswer> | null>(null);
  const withClasses = sel.students.filter((s) => s.classes.length || s.answer);
  const answered = withClasses.filter((s) => s.answer).length;
  const approved = withClasses.filter((s) => s.plan?.status === "aprobado").length;
  const subs = sel.mentors.filter((m) => m.wantsToSubstitute);
  // Sesiones ya asignadas a cada sustituto (para la capacidad).
  const used = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sel.students) for (const a of s.plan?.assignments ?? []) if (a.who === "sustituto" && a.substituteId) m.set(a.substituteId, (m.get(a.substituteId) ?? 0) + 1);
    return m;
  }, [sel.students]);
  const shown = withClasses.filter((s) =>
    filter === "todos" ? true : filter === "sin_respuesta" ? !s.answer : filter === "aprobados" ? s.plan?.status === "aprobado" : !!s.answer && s.plan?.status !== "aprobado");

  return (
    <>
      <section className={`${card} space-y-3`}>
        <h3 className="text-sm font-bold text-slate-900">Respuestas</h3>
        <div className="grid gap-2 text-xs sm:grid-cols-4">
          <div className={subtle}><strong className="block text-lg">{answered}/{withClasses.length}</strong>familias han respondido</div>
          <div className={subtle}><strong className="block text-lg">{approved}</strong>planes aprobados</div>
          <div className={subtle}><strong className="block text-lg">{sel.mentors.filter((m) => !m.external).length}</strong>mentores han respondido{sel.pendingMentors.length ? ` · faltan ${sel.pendingMentors.length}` : ""}</div>
          <div className={subtle}><strong className="block text-lg">{subs.length}</strong>sustitutos disponibles</div>
        </div>
        {sel.pendingMentors.length > 0 && <p className="text-xs text-slate-600">Mentores sin responder: {sel.pendingMentors.map((m) => m.name).join(", ")}.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnLight} onClick={() => run({ accion: "avisar", periodId: sel.period.id, to: "familias" }, "Aviso enviado a las familias que no han respondido (campanita y correo).")}>Avisar a familias sin responder</button>
          <button type="button" className={btnLight} onClick={() => run({ accion: "avisar", periodId: sel.period.id, to: "mentores" }, "Aviso enviado a los mentores que no han respondido (campanita y correo).")}>Avisar a mentores sin responder</button>
        </div>
        <p className="text-[11px] text-slate-500">Cada aviso llega una sola vez al día por persona aunque pulses varias veces.</p>
      </section>

      <section className={`${card} space-y-3`}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Sustitutos</h3>
          {isAdmin && <button type="button" className={btnLight} onClick={() => setExternal({ name: "", email: "", slots: [], zones: [], maxSessions: 4, comments: "", wantsToSubstitute: true })}>Añadir sustituto sin cuenta</button>}
        </header>
        {external && <ExternalEditor period={sel.period} value={external} onCancel={() => setExternal(null)} onSave={async (v) => {
          const d = await run({ accion: "externo_guardar", periodId: sel.period.id, ...v }, "Sustituto guardado.");
          if (d) setExternal(null);
        }} />}
        {subs.length === 0 ? <p className="text-xs text-slate-500">Todavía no hay sustitutos para este periodo.</p> : (
          <ul className="space-y-2">
            {subs.map((m) => (
              <li key={m.id} className={`${subtle} text-xs space-y-1`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><strong>{m.name}</strong>{m.external ? " (sin cuenta)" : ""}{m.email ? ` · ${m.email}` : ""} · {used.get(m.id) ?? 0}/{m.maxSessions} sesiones asignadas</span>
                  {isAdmin && m.external && <button type="button" className={btnLight} onClick={() => setExternal(m)}>Cambiar</button>}
                </div>
                <p className="text-slate-600">{m.slots.map((s) => `${shortDate(s.date).slice(0, 5)} ${s.manana ? "M" : ""}${s.tarde ? "T" : ""}`).join(" · ")}</p>
                <p className="text-slate-500">Zonas: {m.zones.join(", ") || "—"}{m.specialties.length ? ` · Especialidades: ${m.specialties.join(", ")}` : ""}{m.comments ? ` · «${m.comments}»` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Alumnos</h3>
          <select className={`${input} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="todos">Todos</option><option value="sin_respuesta">Sin respuesta</option><option value="por_revisar">Por revisar</option><option value="aprobados">Aprobados</option>
          </select>
        </header>
        {shown.length === 0 ? <p className="text-xs text-slate-500">No hay alumnos en este filtro.</p> : (
          <ul className="space-y-2">
            {shown.map((s) => (
              <li key={s.id} className={subtle}>
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left text-xs" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                  <span><strong>{s.name}</strong> · {s.mentorName || "sin mentor"} · {s.classes.length} clases{s.municipality ? ` · ${s.municipality}` : ""}</span>
                  <span className="font-semibold">{statusLabel(s)} {openId === s.id ? "▲" : "▼"}</span>
                </button>
                {openId === s.id && <PlanEditor key={`${s.id}-${s.plan?.revision ?? 0}-${s.plan?.status ?? ""}`} student={s} sel={sel} isAdmin={isAdmin} run={run} used={used} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} space-y-2`}>
        <h3 className="text-sm font-bold text-slate-900">Historial</h3>
        {sel.log.length === 0 ? <p className="text-xs text-slate-500">Sin movimientos todavía.</p> : (
          <ul className="max-h-72 space-y-1 overflow-y-auto text-xs text-slate-700">
            {sel.log.map((l, i) => (
              <li key={i}>{new Date(l.at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} · <strong>{l.actor}</strong> · {l.action.replace(/_/g, " ")}{l.student ? ` · ${l.student}` : ""}{l.details ? ` · ${l.details}` : ""}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function statusLabel(s: StaffStudent): string {
  if (s.plan?.status === "aprobado") return "✓ Aprobado";
  if (s.plan?.status === "propuesto") return "Propuesto, falta aprobar";
  if (s.plan) return "Plan en borrador";
  if (s.answer) return s.answer.late ? "Respondido fuera de plazo" : "Respondido";
  return "Sin respuesta";
}

function ExternalEditor({ period, value, onSave, onCancel }: { period: SpecialPeriod; value: Partial<StaffMentorAnswer>; onSave: (v: Record<string, unknown>) => void; onCancel: () => void }) {
  const [name, setName] = useState(value.name ?? "");
  const [email, setEmail] = useState(value.email ?? "");
  const [slots, setSlots] = useState<SubSlot[]>(value.slots ?? []);
  const [zones, setZones] = useState<string[]>(value.zones ?? []);
  const [max, setMax] = useState(value.maxSessions ?? 4);
  const [comments, setComments] = useState(value.comments ?? "");
  const [active, setActive] = useState(value.wantsToSubstitute ?? true);
  return (
    <div className={`${subtle} space-y-3`}>
      <p className="text-xs text-slate-600">Para quien no tiene cuenta en el campus (por ejemplo, quien respondió al formulario de sustitutos por correo).</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Nombre y apellidos" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <SlotGrid from={period.startsOn} to={period.endsOn} value={slots} onChange={setSlots} />
      <ZonePicker zones={period.zones} value={zones} onChange={setZones} />
      <label className="flex items-center gap-2 text-xs">Máximo de sesiones <input type="number" min={0} max={60} className={`${input} w-20`} value={max} onChange={(e) => setMax(Number(e.target.value) || 0)} /></label>
      <textarea className={input} rows={2} placeholder="Comentarios" value={comments} onChange={(e) => setComments(e.target.value)} />
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Disponible para sustituir</label>
      <div className="flex gap-2">
        <button type="button" className={btnDark} onClick={() => onSave({ id: value.id, name, email, slots, zones, maxSessions: max, comments, wantsToSubstitute: active })}>Guardar</button>
        <button type="button" className={btnLight} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

/** Sustitutos que encajan en una clase: libres ese día en esa parte del día, con capacidad y (si se sabe) la zona. */
function candidatesFor(c: { date: string; start: string }, s: StaffStudent, sel: Sel, used: Map<string, number>) {
  const part = partOfDay(c.start);
  return sel.mentors
    .filter((m) => m.wantsToSubstitute && m.mentorId !== s.mentorId)
    .filter((m) => m.slots.some((x) => x.date === c.date && x[part]))
    .map((m) => ({ m, left: m.maxSessions - (used.get(m.id) ?? 0), zone: zoneMatches(m.zones, s.municipality) }))
    .sort((a, b) => Number(b.zone === true) - Number(a.zone === true) || b.left - a.left);
}

function PlanEditor({ student: s, sel, isAdmin, run, used }: { student: StaffStudent; sel: Sel; isAdmin: boolean; run: Run; used: Map<string, number> }) {
  const famWants = new Map((s.answer?.choices ?? []).map((c) => [classKey(c.date, c.start), c.wants]));
  const regular = sel.mentors.find((m) => m.mentorId && m.mentorId === s.mentorId);
  const regularCan = new Map((regular?.ownClasses ?? []).filter((o) => o.studentId === s.id).map((o) => [classKey(o.date, o.start), o.can]));
  const saved = new Map((s.plan?.assignments ?? []).map((a) => [classKey(a.date, a.start), a]));

  const [rows, setRows] = useState<Assignment[]>(() => s.classes.map((c) => {
    const k = classKey(c.date, c.start);
    const prev = saved.get(k);
    if (prev) return prev;
    let who: Who = "habitual";
    let substituteId: string | null = null;
    if (famWants.get(k) === false) who = "no_quiere";
    else if (regularCan.get(k) === false) {
      const best = candidatesFor(c, s, sel, used).find((x) => x.left > 0);
      if (s.answer?.acceptsSubstitute !== false && best) { who = "sustituto"; substituteId = best.m.id; } else who = "sin_cobertura";
    }
    return { date: c.date, start: c.start, end: c.end, who, substituteId };
  }));
  const [notes, setNotes] = useState(s.plan?.notes ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(s.billing.map((b) => {
    const prev = s.plan?.amounts.find((a) => a.periodStart === b.start);
    const v = prev ? prev.amount : b.suggested ?? b.price;
    return [b.start, v == null ? "" : String(v)];
  })));
  const setRow = (i: number, patch: Partial<Assignment>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const anyRemoved = rows.some((r) => r.who === "no_quiere");

  const save = (proponer: boolean) => run({ accion: "plan_guardar", periodId: sel.period.id, studentId: s.id, assignments: rows, notes, proponer },
    proponer ? "Plan propuesto." : "Plan guardado.");
  const approve = async () => {
    const d = await run({ accion: "plan_guardar", periodId: sel.period.id, studentId: s.id, assignments: rows, notes, proponer: true }, "Plan guardado.");
    if (!d) return;
    const lines = s.billing.filter((b) => amounts[b.start] !== "" && Number(amounts[b.start]) !== b.price)
      .map((b) => ({ periodStart: b.start, periodEnd: b.end, amount: Number(amounts[b.start]), suggested: b.suggested }));
    await run({ accion: "plan_aprobar", periodId: sel.period.id, studentId: s.id, amounts: lines }, "Plan aprobado. La familia lo verá en su panel y la renovación saldrá con este importe.");
  };

  return (
    <div className="mt-3 space-y-3 text-xs">
      {s.answer ? (
        <p className="text-slate-600">
          Familia: mantiene {s.answer.choices.filter((c) => c.wants).length} de {s.answer.choices.length} · {s.answer.acceptsSubstitute ? "acepta sustituto" : "NO acepta sustituto"}
          {s.answer.extraSessions ? ` · pide ${s.answer.extraSessions} extra` : ""}{s.answer.late ? " · fuera de plazo (excepción)" : ""}{s.answer.comments ? ` · «${s.answer.comments}»` : ""}
        </p>
      ) : <p className="text-amber-700">La familia todavía no ha respondido.</p>}
      {!regular && s.mentorId && <p className="text-amber-700">Su mentor ({s.mentorName}) todavía no ha dicho qué clases puede dar.</p>}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">Clase</th><th className="py-1 pr-2">Familia</th><th className="py-1 pr-2">Mentor</th><th className="py-1">Quién la da</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const k = classKey(r.date, r.start);
              const cands = candidatesFor(r, s, sel, used);
              return (
                <tr key={k} className="border-t border-[#F0ECE5] align-top">
                  <td className="py-1 pr-2 capitalize">{dateLabel(r.date)} · {r.start}</td>
                  <td className="py-1 pr-2">{famWants.has(k) ? (famWants.get(k) ? "Sí" : "No") : "—"}</td>
                  <td className="py-1 pr-2">{regularCan.has(k) ? (regularCan.get(k) ? "Puede" : "No puede") : "—"}</td>
                  <td className="py-1 space-y-1">
                    <select className={input} value={r.who === "sustituto" ? `sub:${r.substituteId}` : r.who}
                      onChange={(e) => e.target.value.startsWith("sub:") ? setRow(i, { who: "sustituto", substituteId: e.target.value.slice(4) }) : setRow(i, { who: e.target.value as Who, substituteId: null })}>
                      <option value="habitual">{WHO_LABEL.habitual}</option>
                      <option value="no_quiere">{WHO_LABEL.no_quiere}</option>
                      <option value="sin_cobertura">{WHO_LABEL.sin_cobertura}</option>
                      {cands.map((c) => <option key={c.m.id} value={`sub:${c.m.id}`}>Sustituto: {c.m.name} · quedan {c.left}{c.zone === true ? " · zona ✓" : c.zone === false ? " · otra zona" : ""}</option>)}
                      {r.who === "sustituto" && r.substituteId && !cands.some((c) => c.m.id === r.substituteId) && <option value={`sub:${r.substituteId}`}>Sustituto (ya no disponible ese día)</option>}
                    </select>
                    {r.who === "sustituto" && s.answer && !s.answer.acceptsSubstitute && <p className="text-amber-700">La familia dijo que no acepta sustituto.</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <textarea className={input} rows={2} placeholder="Notas internas del plan" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {isAdmin && (
        <div className={`${subtle} space-y-2`}>
          <p className="font-semibold text-slate-800">Importe de las mensualidades afectadas</p>
          {s.billing.length === 0 ? (
            <p className="text-slate-600">El campus todavía no conoce la cuota de esta familia (llega con su primera renovación). Si el importe no cambia, aprueba sin más.</p>
          ) : s.billing.map((b) => (
            <div key={b.start} className="flex flex-wrap items-center gap-2">
              <span>Del {shortDate(b.start)} al {shortDate(b.end)} · cuota {b.price != null ? euro(b.price) : "—"} · {b.kept} de {b.expected} sesiones</span>
              {b.suggested != null && anyRemoved && <span className="text-slate-500">· sugerencia proporcional {euro(b.suggested)}</span>}
              <input className={`${input} w-28`} inputMode="decimal" value={amounts[b.start] ?? ""} onChange={(e) => setAmounts({ ...amounts, [b.start]: e.target.value.replace(",", ".") })} />
              <span>€</span>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">
            La sugerencia aplica la fórmula proporcional (cuota × sesiones que se mantienen ÷ previstas) solo por las clases que la familia quita con acuerdo previo; las
            que Kiru no puede cubrir no restan, se recuperan. Nada se cobra solo: el importe que apruebes es el que llevará la renovación de esa mensualidad.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnLight} onClick={() => save(false)}>Guardar borrador</button>
        {!isAdmin && <button type="button" className={btnDark} onClick={() => save(true)}>Proponer a administración</button>}
        {isAdmin && <button type="button" className={btnDark} onClick={approve}>{s.plan?.status === "aprobado" ? "Aprobar de nuevo" : "Aprobar plan e importe"}</button>}
      </div>
      {s.plan?.approvedAt && <p className="text-slate-500">Aprobado por {s.plan.approvedByName ?? "administración"} el {new Date(s.plan.approvedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} (revisión {s.plan.revision}).</p>}
    </div>
  );
}
