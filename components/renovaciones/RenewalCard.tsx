"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import Toast from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/skillcoins";
import type { PrepayOption, RenewalRow } from "@/lib/database.types";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Días que sigue visible un aviso sin pagar después del fin de la mensualidad. */
const GRACE_DAYS = 5;
/** Desde cuántos días antes del fin se pide respuesta (a la vez que el correo). */
const NOTICE_DAYS = 7;

type Plan = "mantener" | "subir" | "no_renueva";
type Option = PrepayOption;
type Result = { plan: Plan | null; plan_source: "correo" | "campus" | null; paid_reported: boolean; closed: boolean; already: boolean };

export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} de ${MONTHS[m - 1]}` : iso;
}

export function euros(n: number | null | undefined): string {
  return `${Number(n ?? 0).toLocaleString("es-ES")} €`;
}

export function planLabel(r: Pick<RenewalRow, "plan" | "keep_label" | "up_label">): string {
  if (r.plan === "mantener") return r.keep_label;
  if (r.plan === "subir") return r.up_label ?? "Un día más por semana";
  if (r.plan === "no_renueva") return "No renovar";
  return "";
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cutoff(): string {
  return iso(new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000));
}

/** Días que faltan hasta el fin de la mensualidad (negativo si ya pasó). */
export function daysLeft(periodEnd: string): number {
  const [y, m, d] = periodEnd.split("-").map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

/**
 * Fin del periodo tras pagar «months» meses: mismo día del mes, o el último día
 * si ese mes es más corto (empieza el 31 de enero → 28 de febrero).
 */
export function addMonths(periodEnd: string, months: number): string {
  const [y, m, d] = periodEnd.split("-").map(Number);
  const last = new Date(y, m - 1 + months + 1, 0).getDate();
  return iso(new Date(y, m - 1 + months, Math.min(d, last)));
}

/** Opciones de pago de un plan: el mes siguiente y, si hay, varios por adelantado. */
export function paymentOptions(r: RenewalRow, plan: "mantener" | "subir"): Option[] {
  const price = Number(plan === "mantener" ? r.keep_price : r.up_price ?? 0);
  return [{ meses: 1, total: price, ahorro: 0, pct: 0 }, ...(r.prepay?.[plan] ?? [])];
}

/** Importe de lo elegido. */
export function chosenTotal(r: RenewalRow): number | null {
  if (r.plan !== "mantener" && r.plan !== "subir") return null;
  return paymentOptions(r, r.plan).find((o) => o.meses === r.months)?.total ?? null;
}

/** Renovaciones abiertas (sin cerrar y no caducadas) de los hijos de la familia. */
export async function fetchOpenRenewals(studentIds: string[]): Promise<RenewalRow[]> {
  if (!studentIds.length) return [];
  const { data, error } = await supabase.from("kiru_renewals").select("*")
    .in("student_id", studentIds).is("closed_at", null).gte("period_end", cutoff())
    .order("period_end", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * ¿Necesita la familia hacer algo ya? (elegir plan o avisar del pago). La
 * tarjeta está siempre visible, pero solo se marca como pendiente en la última
 * semana, igual que el correo.
 */
export function needsAnswer(r: RenewalRow): boolean {
  return daysLeft(r.period_end) <= NOTICE_DAYS && (!r.plan || (r.plan !== "no_renueva" && !r.paid_reported_at));
}

function monthsText(meses: number): string {
  return meses === 1 ? "Solo el mes siguiente" : `${meses} meses por adelantado`;
}

/**
 * Tarjeta de la mensualidad en el panel de la familia. Está siempre visible:
 * la familia puede dejar pagado el mes siguiente (o varios por adelantado, con
 * descuento) cuando quiera. En la última semana se convierte en el aviso de
 * renovación, con los mismos botones que el correo. Vale la primera respuesta,
 * venga del correo o de aquí: si ya habían respondido, se enseña lo que eligieron.
 */
export default function RenewalCard({ studentId, studentName, onChanged }: { studentId: string; studentName: string; onChanged?: () => void }) {
  const [renewal, setRenewal] = useState<RenewalRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmNo, setConfirmNo] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const firstName = studentName.split(" ")[0] || studentName;

  const reload = useCallback(async () => {
    try { setRenewal((await fetchOpenRenewals([studentId]))[0] ?? null); }
    catch { /* sin conexión: la tarjeta aparecerá en la próxima carga */ }
  }, [studentId]);

  useEffect(() => {
    const first = window.setTimeout(() => { void reload(); }, 0);
    const onFocus = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearTimeout(first); document.removeEventListener("visibilitychange", onFocus); };
  }, [reload]);

  const act = async (call: () => PromiseLike<{ data: unknown; error: unknown }>, ok: string) => {
    if (!renewal) return;
    setBusy(true);
    try {
      const { data, error } = await call();
      if (error) throw error;
      const result = data as Result;
      setToast(result.already
        ? { text: "Ya teníamos vuestra respuesta, así que no hemos cambiado nada.", type: "success" }
        : { text: ok, type: "success" });
      setConfirmNo(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setToast({ text: errorText(err), type: "error" });
      await reload();
    } finally { setBusy(false); }
  };

  const choose = (plan: Plan, months: number, ok: string) =>
    act(() => supabase.rpc("kiru_renewal_choose", { p_id: renewal!.id, p_plan: plan, p_months: months }), ok);
  const reportPaid = () => act(() => supabase.rpc("kiru_renewal_report_paid", { p_id: renewal!.id }), "Gracias. Comprobaremos el pago y se cerrará este aviso.");

  if (!renewal) return toast ? <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} /> : null;

  const left = daysLeft(renewal.period_end);
  const soon = left <= NOTICE_DAYS;
  const open = soon || expanded || !!renewal.plan;
  const source = renewal.plan_source === "correo" ? " (respondido desde el correo)" : "";
  const notRenewing = renewal.plan === "no_renueva";
  const paid = !!renewal.paid_reported_at;
  const total = chosenTotal(renewal);
  const button = "px-4 py-2.5 rounded-xl text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";

  const planBlock = (plan: "mantener" | "subir") => {
    const label = plan === "mantener" ? renewal.keep_label : renewal.up_label ?? "";
    const main = plan === "subir";
    return (
      <div key={plan} className={`rounded-2xl border p-3 space-y-2 ${main ? "border-[#242321] bg-white" : "border-[#E4D8C5] bg-white"}`}>
        <p className="text-sm font-semibold text-[#292825]">
          {label}{main && <span className="font-normal text-[#806C50]"> (recomendado)</span>}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {paymentOptions(renewal, plan).map((o) => (
            <button key={o.meses} type="button" disabled={busy}
              onClick={() => void choose(plan, o.meses, o.meses === 1
                ? `Hemos registrado: ${label}.`
                : `Hemos registrado: ${label}, ${o.meses} meses por adelantado (${euros(o.total)}).`)}
              className={`${button} text-left border ${o.meses === 1 && main ? "bg-[#242321] border-[#242321] text-white hover:bg-[#3A3835]" : "bg-white border-[#242321] text-[#242321] hover:bg-[#F3F0EA]"}`}>
              {monthsText(o.meses)}
              <span className={`block font-normal ${o.meses === 1 && main ? "text-[#D7C8AF]" : "text-[#6D6962]"}`}>
                {o.meses === 1 ? `${euros(o.total)}/mes` : `${euros(o.total)} · hasta el ${longDate(addMonths(renewal.period_end, o.meses))}`}
              </span>
              {o.ahorro > 0 && (
                <span className="block font-normal text-emerald-700">Ahorráis {euros(o.ahorro)}{o.pct ? ` (${o.pct.toLocaleString("es-ES")} %)` : ""}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-3xl border-2 border-[#E4D8C5] bg-[#FBF8F2] p-5 sm:p-6 space-y-4" aria-label="Mensualidad">
      {toast && <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-start gap-3">
        <CalendarClock className="w-5 h-5 text-[#806C50] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-serif text-lg font-bold text-[#292825] leading-snug">
            {soon ? `Renovación de la mensualidad de ${firstName}` : `Mensualidad de ${firstName}`}
          </h3>
          <p className="text-xs text-[#6D6962]">
            {soon ? <>La mensualidad termina el <strong>{longDate(renewal.period_end)}</strong></>
              : <>Pagada hasta el <strong>{longDate(renewal.period_end)}</strong></>}
            {renewal.mentor_name ? <> · Mentor/a: {renewal.mentor_name}</> : null}.
          </p>
        </div>
      </div>

      {!open && (
        <div className="space-y-2">
          <p className="text-sm text-[#45433F]">
            Si queréis, podéis dejar pagado ya el mes siguiente o varios meses por adelantado con descuento.
          </p>
          <button type="button" onClick={() => setExpanded(true)} className={`${button} bg-white border border-[#242321] text-[#242321] hover:bg-[#F3F0EA]`}>
            Ver opciones de pago
          </button>
        </div>
      )}

      {open && !renewal.plan && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[#292825]">¿Cómo seguimos a partir del {longDate(renewal.period_end)}?</p>
          <div className="space-y-2">
            {planBlock("mantener")}
            {renewal.up_label && planBlock("subir")}
          </div>
          {!confirmNo ? (
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" disabled={busy} onClick={() => setConfirmNo(true)} className="text-xs text-[#77736B] underline underline-offset-2 hover:text-[#292825]">
                No vamos a renovar
              </button>
              {!soon && (
                <button type="button" onClick={() => setExpanded(false)} className="text-xs text-[#77736B] hover:text-[#292825]">Ahora no</button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E7E3DC] bg-white p-3 space-y-2">
              <p className="text-xs text-[#45433F]">¿Seguro que no queréis renovar? {firstName} dejará de tener sesiones cuando termine la mensualidad.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void choose("no_renueva", 1, "Hemos registrado que no renováis. ¡Gracias por este tiempo!")}
                  className={`${button} bg-white border border-rose-300 text-rose-800 hover:bg-rose-50`}>Sí, no renovamos</button>
                <button type="button" disabled={busy} onClick={() => setConfirmNo(false)} className={`${button} text-[#6D6962] hover:bg-[#F3F0EA]`}>Volver</button>
              </div>
            </div>
          )}
        </div>
      )}

      {renewal.plan && (
        <p className="flex items-start gap-2 text-sm text-[#45433F]">
          <CheckCircle2 className="w-4 h-4 text-[#806C50] shrink-0 mt-0.5" />
          <span>
            {notRenewing ? <>Nos habéis dicho que no renováis{source}. ¡Gracias por este tiempo con nosotros!</> : (
              <>Habéis elegido: <strong>{planLabel(renewal)}</strong>
                {renewal.months > 1 && <>, <strong>{renewal.months} meses por adelantado</strong> (hasta el {longDate(addMonths(renewal.period_end, renewal.months))})</>}
                {total !== null && <> · {renewal.months > 1 ? `total ${euros(total)}` : `${euros(total)}/mes`}</>}
                {source}.</>
            )}
          </span>
        </p>
      )}

      {open && !notRenewing && (paid ? (
        <p className="flex items-start gap-2 text-sm text-[#45433F]">
          <CheckCircle2 className="w-4 h-4 text-[#806C50] shrink-0 mt-0.5" />
          <span>Nos habéis avisado de que ya habéis pagado{renewal.paid_source === "correo" ? " (desde el correo)" : ""}. Lo comprobaremos y este aviso se cerrará solo.</span>
        </p>
      ) : (
        <div className="space-y-3 border-t border-[#EADFCF] pt-3">
          {renewal.payment_info && (
            <p className="text-xs text-[#6D6962] leading-relaxed whitespace-pre-line">
              {renewal.payment_info}{total !== null && renewal.months > 1 ? `\nImporte: ${euros(total)} (${renewal.months} meses).` : ""}
            </p>
          )}
          <button type="button" disabled={busy} onClick={() => void reportPaid()} className={`${button} bg-white border border-[#E4D8C5] text-[#5C5141] hover:bg-[#F6F0E4]`}>
            Ya he pagado
          </button>
        </div>
      ))}

      {open && renewal.call_url && (
        <p className="text-[11px] text-[#77736B]">
          ¿Preferís hablarlo? <a href={renewal.call_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#292825]">Reservar una llamada</a>
        </p>
      )}
    </section>
  );
}
