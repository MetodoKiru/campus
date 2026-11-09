"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronRight } from "lucide-react";
import {
  PAYOUT_STATE_LABEL, SESSION_KIND_LABEL, formatDay, loadMentorPayData, payoutState, periodLabel,
  type MentorPayData, type MentorSession,
} from "@/lib/mentor-pay";
import { COMPETENCIA_LABEL, MENTOR_STATUS_LABEL } from "@/lib/supervision";

const field = "w-full rounded-xl border border-[#E7E3DC] bg-white px-3 py-2 text-xs text-[#292825] outline-none focus:border-[#806C50]";

const KIND_STYLE: Record<MentorSession["kind"], string> = {
  impartida: "border-[#E7E3DC] bg-white text-[#45433F]",
  recuperacion: "border-[#E4D8C5] bg-[#F3EEE5] text-[#806C50]",
  sustitucion: "border-[#E4D8C5] bg-[#F3EEE5] text-[#806C50]",
  fuera_horario: "border-[#E7E3DC] bg-[#FAF8F5] text-[#6D6962]",
};

function firstName(name: string | null): string {
  return (name ?? "Alumno").split(" ")[0];
}

/**
 * «Registro de sesiones» (menú ☰ del mentor): todas las sesiones que ha
 * registrado, con filtros por alumno, fechas y periodo de pago, y el detalle de
 * cada una. Solo lectura: no cambia ningún registro.
 */
export default function MentorSessions({ onOpenReview }: { onOpenReview: (reviewId: string) => void }) {
  const [data, setData] = useState<MentorPayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [period, setPeriod] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMentorPayData()
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "No se pudieron cargar tus sesiones."); });
    return () => { alive = false; };
  }, []);

  const students = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of data?.sessions ?? []) if (s.student_id) map.set(s.student_id, s.student_name ?? "Alumno");
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const periods = useMemo(() => (data?.payouts ?? []).filter((p) => data?.sessions.some((s) => s.payout_id === p.id)), [data]);

  const filtered = (data?.sessions ?? []).filter((s) =>
    (!student || s.student_id === student)
    && (!from || s.session_date >= from)
    && (!until || s.session_date <= until)
    && (!period || s.payout_id === period));

  const openReviews = (logId: string) => (data?.reviews ?? []).filter((r) => r.session_log_id === logId && r.status !== "cerrada");
  const session = data?.sessions.find((s) => s.log_id === selected) ?? null;

  return (
    <section className="space-y-5 rounded-3xl border border-[#E7E3DC] bg-white p-6 shadow-xs sm:p-8">
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C50]">Mi actividad</span>
        <h2 className="mt-0.5 font-serif text-xl font-bold text-[#292825]">Registro de sesiones</h2>
      </div>
      <p className="text-sm leading-relaxed text-[#45433F]">
        Todas las sesiones que has registrado con el formulario. Si envías dos registros del mismo alumno y día, cuenta uno solo.
      </p>

      {error && <p className="rounded-2xl border border-[#D9B3AA] bg-white p-4 text-xs text-[#9A4B3F]">{error}</p>}
      {!data && !error && <p className="text-xs text-[#77736B]">Cargando…</p>}

      {data && session && (
        <SessionDetail session={session} data={data} onBack={() => setSelected(null)} onOpenReview={onOpenReview} />
      )}

      {data && !session && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-[#6D6962]">Alumno</span>
              <select value={student} onChange={(e) => setStudent(e.target.value)} className={field}>
                <option value="">Todos</option>
                {students.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-[#6D6962]">Desde</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-[#6D6962]">Hasta</span>
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={field} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-[#6D6962]">Periodo de pago</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className={field}>
                <option value="">Todos</option>
                {periods.map((p) => <option key={p.id} value={p.id}>{firstName(p.student_name)} · {periodLabel(p)}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-[#77736B]">{filtered.length} {filtered.length === 1 ? "sesión" : "sesiones"}</p>

          {filtered.length === 0 && <p className="text-xs text-[#77736B]">No hay sesiones con estos filtros.</p>}
          <ul className="space-y-2">
            {filtered.map((s) => {
              const reviews = openReviews(s.log_id);
              return (
                <li key={s.log_id}>
                  <button type="button" onClick={() => setSelected(s.log_id)} className="flex w-full items-start gap-3 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-left transition hover:bg-[#F3F0EA]">
                    <span className="w-14 shrink-0 text-center">
                      <span className="block font-serif text-lg font-bold leading-none text-[#292825]">{formatDay(s.session_date, { day: "numeric" })}</span>
                      <span className="block text-[10px] font-semibold uppercase text-[#77736B]">{formatDay(s.session_date, { month: "short" })}</span>
                      {s.time && <span className="mt-1 block text-[10px] text-[#77736B]">{s.time}</span>}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-[#292825]">{s.student_name ?? "Alumno"}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${KIND_STYLE[s.kind]}`}>{SESSION_KIND_LABEL[s.kind]}</span>
                        {reviews.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#806C50] bg-[#806C50] px-2 py-0.5 text-[10px] font-bold text-white">
                            <AlertCircle className="h-3 w-3" /> Revisión pendiente
                          </span>
                        )}
                      </span>
                      {s.family && <span className="block text-[11px] text-[#77736B]">Familia: {s.family}</span>}
                      {s.topic && <span className="block truncate text-xs text-[#45433F]">{s.topic}</span>}
                      {s.sc && (
                        <span className="block text-[11px] text-[#6D6962]">
                          SkillCoins: {(["estudios", "compromiso", "organizacion", "bienestar"] as const).filter((k) => s.sc?.[k] !== null).map((k) => `${COMPETENCIA_LABEL[k]} ${s.sc?.[k]}`).join(" · ")}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#A39E95]" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function SessionDetail({ session, data, onBack, onOpenReview }: {
  session: MentorSession;
  data: MentorPayData;
  onBack: () => void;
  onOpenReview: (reviewId: string) => void;
}) {
  const payout = data.payouts.find((p) => p.id === session.payout_id) ?? null;
  const state = payout ? payoutState(payout) : null;
  const reviews = data.reviews.filter((r) => r.session_log_id === session.log_id);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-[#6D6962] hover:text-[#292825]">← Todas mis sesiones</button>
      <div className="space-y-3 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#292825]">{session.student_name ?? "Alumno"} · {formatDay(session.session_date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>
            <p className="text-[11px] text-[#77736B]">
              {session.time ? `${session.time} · ` : ""}{session.family ? `Familia: ${session.family} · ` : ""}registro enviado el {formatDay(session.submitted_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${KIND_STYLE[session.kind]}`}>{SESSION_KIND_LABEL[session.kind]}</span>
        </div>
        {session.kind === "recuperacion" && session.recovers_date && (
          <p className="text-xs text-[#45433F]">Recupera la clase del {formatDay(session.recovers_date, { day: "numeric", month: "long" })}.</p>
        )}
        {session.kind === "sustitucion" && <p className="text-xs text-[#45433F]">Diste esta clase en lugar del mentor habitual. Cuenta para tu pago, no para el suyo.</p>}
        {session.repeats.length > 0 && (
          <p className="text-xs text-[#45433F]">
            Enviaste {session.repeats.length === 1 ? "otro registro" : `${session.repeats.length} registros más`} de este mismo día ({session.repeats.map((r) => formatDay(r.submitted_at, { day: "numeric", month: "short" })).join(", ")}). Cuenta como una sola sesión.
          </p>
        )}
        {payout && (
          <p className="text-xs text-[#45433F]">
            Periodo de pago: {periodLabel(payout)}{state ? ` · ${PAYOUT_STATE_LABEL[state]}` : ""}
          </p>
        )}
      </div>

      {session.sc && (
        <div className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">SkillCoins{session.isScWeek ? " · sesión SC de la semana" : ""}</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["estudios", "compromiso", "organizacion", "bienestar"] as const).map((k) => (
              <div key={k} className="rounded-xl border border-[#E7E3DC] bg-white p-3 text-center">
                <p className="text-[11px] text-[#77736B]">{COMPETENCIA_LABEL[k]}</p>
                <p className="font-serif text-lg font-bold text-[#292825]">{session.sc?.[k] ?? "—"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Revisión de coordinación</h4>
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpenReview(r.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left text-sm transition ${r.status === "cerrada" ? "border-[#E7E3DC] bg-white hover:bg-[#FAF8F5]" : "border-[#806C50] bg-[#F3EEE5] hover:bg-[#EFE7DA]"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[#292825]">{COMPETENCIA_LABEL[r.competencia]} {r.score_snapshot}/10 · {MENTOR_STATUS_LABEL[r.status]}</span>
                    {r.due_date && r.status === "pendiente_respuesta" && <span className="block text-[11px] text-[#77736B]">Responder antes del {formatDay(r.due_date)}</span>}
                  </span>
                  <span className="text-xs font-semibold text-[#806C50]">{r.status === "pendiente_respuesta" ? "Responder →" : "Ver →"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {session.incident && (
        <div className="space-y-1">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Observaciones</h4>
          <p className="whitespace-pre-line text-sm text-[#45433F]">{session.incident}</p>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Tu registro completo</h4>
        <dl className="divide-y divide-[#F0ECE6] rounded-2xl border border-[#E7E3DC]">
          {session.answersList.map((item, index) => (
            <div key={`${item.q}-${index}`} className="space-y-0.5 p-3">
              <dt className="text-[11px] font-semibold text-[#77736B]">{item.q}</dt>
              <dd className="whitespace-pre-line text-sm text-[#292825]">{item.a}</dd>
            </div>
          ))}
          {session.answersList.length === 0 && <p className="p-3 text-xs text-[#77736B]">Sin respuestas guardadas.</p>}
        </dl>
      </div>
    </div>
  );
}
