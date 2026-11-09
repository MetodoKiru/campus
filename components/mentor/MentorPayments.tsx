"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import type { MentorPayoutRow } from "@/lib/database.types";
import {
  PAYMENT_HOUR, PAYOUT_STATE_LABEL, SESSION_KIND_LABEL, formatDay, formatEuros, loadMentorPayData, paySummary,
  paymentDeadline, payoutState, periodLabel, type MentorPayData, type PayoutState,
} from "@/lib/mentor-pay";

const STATE_STYLE: Record<PayoutState, string> = {
  pagado: "border-[#E7E3DC] bg-[#FAF8F5] text-[#45433F]",
  en_proceso: "border-[#806C50] bg-[#806C50] text-white",
  pendiente: "border-[#E4D8C5] bg-[#F3EEE5] text-[#806C50]",
};

/**
 * «Mis pagos» (menú ☰ del mentor): lo cobrado, lo acumulado pendiente y el
 * desglose de cada liquidación. Las cifras son las de la pestaña «Pagos» de
 * administración; el campus no las calcula ni las cambia.
 */
export default function MentorPayments() {
  const [data, setData] = useState<MentorPayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    loadMentorPayData()
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "No se pudieron cargar tus pagos."); });
    return () => { alive = false; };
  }, []);

  const visible = (data?.payouts ?? [])
    .map((row) => ({ row, state: payoutState(row, now) }))
    .filter((x): x is { row: MentorPayoutRow; state: PayoutState } => x.state !== null);
  const summary = paySummary(data?.payouts ?? [], now);
  const open = visible.filter((x) => x.state !== "pagado").sort((a, b) => a.row.period_end.localeCompare(b.row.period_end));
  const history = visible.filter((x) => x.state === "pagado").sort((a, b) => (b.row.paid_on ?? b.row.period_end).localeCompare(a.row.paid_on ?? a.row.period_end));
  const current = visible.find((x) => x.row.id === selected) ?? null;
  const lastSync = (data?.payouts ?? []).reduce<string | null>((max, p) => (!max || p.synced_at > max ? p.synced_at : max), null);

  return (
    <section className="space-y-5 rounded-3xl border border-[#E7E3DC] bg-white p-6 shadow-xs sm:p-8">
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C50]">Mi actividad</span>
        <h2 className="mt-0.5 font-serif text-xl font-bold text-[#292825]">Mis pagos</h2>
      </div>
      <p className="text-sm leading-relaxed text-[#45433F]">
        Cada periodo de un alumno se paga el día en que termina, antes de las {PAYMENT_HOUR}. Cobras las sesiones que has impartido y registrado (más 10 € de seguimiento familiar por periodo). Las cancelaciones que no se pagan y las clases todavía no dadas no cuentan.
      </p>

      {error && <p className="rounded-2xl border border-[#D9B3AA] bg-white p-4 text-xs text-[#9A4B3F]">{error}</p>}
      {!data && !error && <p className="text-xs text-[#77736B]">Cargando…</p>}

      {data && current && <PayoutDetail row={current.row} state={current.state} data={data} onBack={() => setSelected(null)} />}

      {data && !current && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Total cobrado" value={formatEuros(summary.paid)} />
            <Stat label="Pendiente de liquidar" value={formatEuros(summary.pending)} hint={summary.pendingExtra ? `incluye ${formatEuros(summary.pendingExtra)} de seguimiento` : undefined} />
            <Stat
              label="Próxima liquidación"
              value={summary.next ? formatDay(summary.next.period_end, { day: "numeric", month: "short" }) : "—"}
              hint={summary.next ? (paymentDeadline(summary.next.period_end).getTime() <= now ? "en proceso" : `antes de las ${PAYMENT_HOUR}`) : undefined}
            />
            <Stat label="Sesiones sin liquidar" value={String(summary.pendingSessions)} />
          </div>

          <PayoutList title="Pendiente de cobro" empty="No tienes nada pendiente de cobro." items={open} onOpen={setSelected} />
          <PayoutList title="Historial de pagos" empty="Todavía no hay pagos registrados." items={history} onOpen={setSelected} />

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#77736B]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Los importes son los de administración{lastSync ? ` (actualizados el ${formatDay(lastSync, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}. Se actualizan solos cada hora y cuando registras una sesión. Si ves algo que no cuadra, escribe a Dirección.
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4">
      <p className="text-[11px] font-semibold text-[#77736B]">{label}</p>
      <p className="mt-1 font-serif text-xl font-bold text-[#292825]">{value}</p>
      {hint && <p className="text-[10px] text-[#77736B]">{hint}</p>}
    </div>
  );
}

function PayoutList({ title, empty, items, onOpen }: { title: string; empty: string; items: { row: MentorPayoutRow; state: PayoutState }[]; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">{title}</h3>
      {items.length === 0 && <p className="text-xs text-[#77736B]">{empty}</p>}
      <ul className="space-y-2">
        {items.map(({ row, state }) => (
          <li key={row.id}>
            <button type="button" onClick={() => onOpen(row.id)} className="flex w-full items-center gap-3 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-left transition hover:bg-[#F3F0EA]">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#292825]">{row.student_name} · {periodLabel(row)}</span>
                <span className="block text-[11px] text-[#77736B]">
                  {row.sessions_registered} {row.sessions_registered === 1 ? "sesión" : "sesiones"}
                  {state === "pagado" ? (row.paid_on ? ` · pagado el ${formatDay(row.paid_on)}` : "") : ` · se paga el ${formatDay(row.period_end)}`}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-sm font-bold text-[#292825]">{formatEuros(row.amount_cents)}</span>
                <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATE_STYLE[state]}`}>{PAYOUT_STATE_LABEL[state]}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#A39E95]" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PayoutDetail({ row, state, data, onBack }: { row: MentorPayoutRow; state: PayoutState; data: MentorPayData; onBack: () => void }) {
  const sessions = data.sessions.filter((s) => s.payout_id === row.id).sort((a, b) => a.session_date.localeCompare(b.session_date));
  const sessionsAmount = row.amount_cents - row.extra_cents;
  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-[#6D6962] hover:text-[#292825]">← Todos mis pagos</button>
      <div className="space-y-3 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#292825]">{row.student_name} · {periodLabel(row)}</h3>
            <p className="text-[11px] text-[#77736B]">
              {state === "pagado"
                ? (row.paid_on ? `Pagado el ${formatDay(row.paid_on, { day: "numeric", month: "long", year: "numeric" })}` : "Pagado")
                : `Se paga el ${formatDay(row.period_end, { day: "numeric", month: "long" })} antes de las ${PAYMENT_HOUR}`}
            </p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${STATE_STYLE[state]}`}>{PAYOUT_STATE_LABEL[state]}</span>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-[11px] text-[#77736B]">Sesiones</dt><dd className="font-semibold text-[#292825]">{row.sessions_registered}</dd></div>
          <div><dt className="text-[11px] text-[#77736B]">Por sesiones</dt><dd className="font-semibold text-[#292825]">{formatEuros(sessionsAmount)}</dd></div>
          <div><dt className="text-[11px] text-[#77736B]">Seguimiento familiar</dt><dd className="font-semibold text-[#292825]">{formatEuros(row.extra_cents)}</dd></div>
          <div><dt className="text-[11px] text-[#77736B]">Total</dt><dd className="font-serif text-lg font-bold text-[#292825]">{formatEuros(row.amount_cents)}</dd></div>
        </dl>
        {state !== "pagado" && <p className="text-[11px] text-[#77736B]">Mientras el periodo siga abierto, la cifra sube con cada sesión que registres.</p>}
      </div>

      <div className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Sesiones de este pago</h4>
        {sessions.length !== row.sessions_registered && (
          <p className="rounded-xl border border-[#E4D8C5] bg-[#F3EEE5] p-3 text-xs text-[#45433F]">
            Administración cuenta {row.sessions_registered} {row.sessions_registered === 1 ? "sesión" : "sesiones"} en este periodo y aquí aparecen {sessions.length}. El importe que vale es el de administración; Dirección ya tiene el aviso para revisarlo.
          </p>
        )}
        {sessions.length === 0 && <p className="text-xs text-[#77736B]">No hay sesiones registradas en el campus para este periodo.</p>}
        <ul className="divide-y divide-[#F0ECE6] rounded-2xl border border-[#E7E3DC]">
          {sessions.map((s) => (
            <li key={s.log_id} className="flex items-center gap-3 p-3 text-sm">
              <span className="w-24 shrink-0 font-semibold text-[#292825]">{formatDay(s.session_date, { weekday: "short", day: "numeric", month: "short" })}</span>
              <span className="w-12 shrink-0 text-xs text-[#77736B]">{s.time}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-[#45433F]">{s.topic || "—"}</span>
              <span className="shrink-0 text-[10px] font-bold text-[#806C50]">{s.kind === "impartida" ? "" : SESSION_KIND_LABEL[s.kind]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
