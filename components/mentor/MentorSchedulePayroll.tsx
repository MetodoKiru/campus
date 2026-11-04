"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Schedule = { id: string; student_name: string; weekday: string; start_time: string; end_time: string };
type Period = { id: string; student_name: string; period_start: string | null; period_end: string | null; status: string; sessions_count: number | null; agreed_amount_eur: number | null; estimated_payment_date: string | null; payment_date: string | null; notes: string };
type Extra = { month: string; amount: number; status: string; estimatedDate: string | null; paidDate: string | null };
type Data = { schedules: Schedule[]; periods: Period[]; monthlyExtras: Extra[]; pendingTotal: number; rate: { hourly_rate_eur: number | null; pending_sessions: number | null; pending_amount_eur: number | null; sessions_total: number | null } | null };
const money = (n: number | null | undefined) => n == null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const dayOrder = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const date = (s: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("es-ES") : "Sin fecha";

export default function MentorSchedulePayroll() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (alive) setError("Tu sesión ha caducado. Vuelve a entrar."); return; }
      const response = await fetch("/api/mentor/datos", { cache: "no-store", headers: { Authorization: "Bearer " + session.access_token } });
      if (!response.ok) { if (alive) setError("No se pudieron cargar tus horarios y remuneración."); return; }
      const result = await response.json() as Data;
      if (alive) setData(result);
    })().catch(() => { if (alive) setError("No se pudieron cargar tus horarios y remuneración."); });
    return () => { alive = false; };
  }, []);
  const schedules = useMemo(() => [...(data?.schedules ?? [])].sort((a, b) => dayOrder.indexOf(a.weekday.toLowerCase()) - dayOrder.indexOf(b.weekday.toLowerCase()) || a.start_time.localeCompare(b.start_time)), [data]);

  if (error) return <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-5 text-sm text-rose-700">{error}</div>;
  if (!data) return <div className="rounded-2xl border border-[#E7E3DC] bg-white p-5 text-sm text-[#77736B]">Cargando horarios y remuneración…</div>;
  return <div className="space-y-5">
    <section className="rounded-3xl border border-[#E7E3DC] bg-white p-5 sm:p-7">
      <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-[#806C50]"/><h2 className="font-serif text-xl font-bold">Mis horarios</h2></div>
      <p className="mt-1 text-sm text-[#77736B]">Se actualizan desde la pestaña «Horarios» del registro de sesiones.</p>
      {schedules.length ? <div className="mt-5 divide-y divide-[#EEEAE4]">{schedules.map((s) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
        <div><p className="font-semibold capitalize">{s.weekday}</p><p className="text-sm text-[#77736B]">{s.student_name}</p></div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-[#F7F6F3] px-3 py-2 text-sm"><Clock3 className="h-4 w-4"/>{s.start_time}–{s.end_time}</div>
      </div>)}</div> : <p className="mt-4 rounded-xl bg-[#F7F6F3] p-4 text-sm text-[#77736B]">No hay horarios activos en la hoja.</p>}
    </section>

    <section className="rounded-3xl border border-[#E7E3DC] bg-white p-5 sm:p-7">
      <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-[#806C50]"/><h2 className="font-serif text-xl font-bold">Mi remuneración</h2></div>
      <p className="mt-1 text-sm text-[#77736B]">Información sincronizada desde «Seguimiento Mentores» y «Pagos».</p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Tarifa por hora" value={money(data.rate?.hourly_rate_eur)}/>
        <Summary label="Sesiones realizadas" value={data.rate?.sessions_total == null ? "—" : String(data.rate.sessions_total)}/>
        <Summary label="Sesiones pendientes" value={data.rate?.pending_sessions == null ? "—" : String(data.rate.pending_sessions)}/>
        <Summary label="Total pendiente" value={money(data.pendingTotal)}/>
      </div>
      {data.monthlyExtras.length > 0 && <div className="mt-6"><h3 className="font-semibold">Extra de equipo · 10 € por mentor y mes</h3><div className="mt-2 divide-y divide-[#EEEAE4] rounded-2xl border border-[#E7E3DC] px-4">{data.monthlyExtras.map((x) => <div key={x.month} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{new Date(x.month + "-15T12:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</span><span>{money(x.amount)} · {x.status}{x.status === "Pendiente" && x.estimatedDate ? " · estimado " + date(x.estimatedDate) : x.paidDate ? " · pagado " + date(x.paidDate) : ""}</span></div>)}</div></div>}
      <div className="mt-6"><h3 className="font-semibold">Periodos de alumnos</h3>{data.periods.length ? <div className="mt-2 overflow-x-auto rounded-2xl border border-[#E7E3DC]"><table className="w-full min-w-[660px] text-left text-sm"><thead className="bg-[#F7F6F3] text-xs text-[#6D6962]"><tr><th className="px-4 py-3">Alumno</th><th className="px-4 py-3">Periodo</th><th className="px-4 py-3">Sesiones</th><th className="px-4 py-3">Importe acordado</th><th className="px-4 py-3">Estado / pago estimado</th></tr></thead><tbody className="divide-y divide-[#EEEAE4]">{data.periods.map((p) => <tr key={p.id}><td className="px-4 py-3">{p.student_name}</td><td className="px-4 py-3">{date(p.period_start)} – {date(p.period_end)}</td><td className="px-4 py-3">{p.sessions_count ?? "—"}</td><td className="px-4 py-3">{money(p.agreed_amount_eur)}</td><td className="px-4 py-3">{p.status}{p.estimated_payment_date ? " · estimado " + date(p.estimated_payment_date) : p.payment_date ? " · pagado " + date(p.payment_date) : ""}</td></tr>)}</tbody></table></div> : <p className="mt-3 rounded-xl bg-[#F7F6F3] p-4 text-sm text-[#77736B]">No hay periodos registrados en la hoja.</p>}</div>
      <p className="mt-4 text-xs text-[#77736B]">La fecha estimada corresponde al fin del periodo indicado en «Pagos». Es una estimación, no una fecha confirmada de transferencia.</p>
    </section>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[#F7F6F3] p-4"><p className="text-xs text-[#77736B]">{label}</p><p className="mt-1 text-lg font-bold text-[#292825]">{value}</p></div>;
}
