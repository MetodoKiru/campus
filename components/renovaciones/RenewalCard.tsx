"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import Toast from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/skillcoins";
import type { RenewalRow } from "@/lib/database.types";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Días que sigue visible un aviso sin pagar después del fin de la mensualidad. */
const GRACE_DAYS = 5;

type Plan = "mantener" | "subir" | "no_renueva";
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

function cutoff(): string {
  const d = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

/** ¿Necesita la familia hacer algo? (elegir plan o avisar del pago) */
export function needsAnswer(r: RenewalRow): boolean {
  return !r.plan || (r.plan !== "no_renueva" && !r.paid_reported_at);
}

/**
 * Aviso de renovación en el panel de la familia, con los mismos botones que el
 * correo. Vale la primera respuesta, venga del correo o de aquí: si ya habían
 * respondido, se enseña lo que eligieron.
 */
export default function RenewalCard({ studentId, studentName, onChanged }: { studentId: string; studentName: string; onChanged?: () => void }) {
  const [renewal, setRenewal] = useState<RenewalRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmNo, setConfirmNo] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const firstName = studentName.split(" ")[0] || studentName;

  const reload = useCallback(async () => {
    try { setRenewal((await fetchOpenRenewals([studentId]))[0] ?? null); }
    catch { /* sin conexión: el aviso aparecerá en la próxima carga */ }
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

  const choose = (plan: Plan, ok: string) => act(() => supabase.rpc("kiru_renewal_choose", { p_id: renewal!.id, p_plan: plan }), ok);
  const reportPaid = () => act(() => supabase.rpc("kiru_renewal_report_paid", { p_id: renewal!.id }), "Gracias. Comprobaremos el pago y se cerrará este aviso.");

  if (!renewal) return toast ? <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} /> : null;

  const source = renewal.plan_source === "correo" ? " (respondido desde el correo)" : "";
  const notRenewing = renewal.plan === "no_renueva";
  const paid = !!renewal.paid_reported_at;
  const button = "px-4 py-2.5 rounded-xl text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <section className="rounded-3xl border-2 border-[#E4D8C5] bg-[#FBF8F2] p-5 sm:p-6 space-y-4" aria-label="Renovación de la mensualidad">
      {toast && <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-start gap-3">
        <CalendarClock className="w-5 h-5 text-[#806C50] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-serif text-lg font-bold text-[#292825] leading-snug">Renovación de la mensualidad de {firstName}</h3>
          <p className="text-xs text-[#6D6962]">
            La mensualidad termina el <strong>{longDate(renewal.period_end)}</strong>
            {renewal.mentor_name ? <> · Mentor/a: {renewal.mentor_name}</> : null}.
          </p>
        </div>
      </div>

      {!renewal.plan && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[#292825]">¿Cómo seguimos?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={busy} onClick={() => void choose("mantener", "Hemos registrado que mantenéis el plan.")}
              className={`${button} bg-white border border-[#242321] text-[#242321] hover:bg-[#F3F0EA] text-left`}>
              {renewal.keep_label}<span className="block font-normal text-[#6D6962]">{euros(renewal.keep_price)}/mes</span>
            </button>
            {renewal.up_label && (
              <button type="button" disabled={busy} onClick={() => void choose("subir", "Hemos registrado que pasáis a un día más por semana.")}
                className={`${button} bg-[#242321] border border-[#242321] text-white hover:bg-[#3A3835] text-left`}>
                {renewal.up_label} <span className="text-[#D7C8AF]">(recomendado)</span>
                <span className="block font-normal text-[#D7C8AF]">{euros(renewal.up_price)}/mes</span>
              </button>
            )}
          </div>
          {!confirmNo ? (
            <button type="button" disabled={busy} onClick={() => setConfirmNo(true)} className="text-xs text-[#77736B] underline underline-offset-2 hover:text-[#292825]">
              No vamos a renovar
            </button>
          ) : (
            <div className="rounded-2xl border border-[#E7E3DC] bg-white p-3 space-y-2">
              <p className="text-xs text-[#45433F]">¿Seguro que no queréis renovar? {firstName} dejará de tener sesiones cuando termine la mensualidad.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void choose("no_renueva", "Hemos registrado que no renováis. ¡Gracias por este tiempo!")}
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
            {notRenewing ? <>Nos habéis dicho que no renováis{source}. ¡Gracias por este tiempo con nosotros!</> : <>Habéis elegido: <strong>{planLabel(renewal)}</strong>{source}.</>}
          </span>
        </p>
      )}

      {!notRenewing && (paid ? (
        <p className="flex items-start gap-2 text-sm text-[#45433F]">
          <CheckCircle2 className="w-4 h-4 text-[#806C50] shrink-0 mt-0.5" />
          <span>Nos habéis avisado de que ya habéis pagado{renewal.paid_source === "correo" ? " (desde el correo)" : ""}. Lo comprobaremos y este aviso se cerrará solo.</span>
        </p>
      ) : (
        <div className="space-y-3 border-t border-[#EADFCF] pt-3">
          {renewal.payment_info && <p className="text-xs text-[#6D6962] leading-relaxed whitespace-pre-line">{renewal.payment_info}</p>}
          <button type="button" disabled={busy} onClick={() => void reportPaid()} className={`${button} bg-white border border-[#E4D8C5] text-[#5C5141] hover:bg-[#F6F0E4]`}>
            Ya he pagado
          </button>
        </div>
      ))}

      {renewal.call_url && (
        <p className="text-[11px] text-[#77736B]">
          ¿Preferís hablarlo? <a href={renewal.call_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#292825]">Reservar una llamada</a>
        </p>
      )}
    </section>
  );
}
