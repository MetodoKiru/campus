"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ProgressReportDocument from "@/components/reports/ProgressReportDocument";
import type { Json } from "@/lib/database.types";

type Report = { id: string; content: Json; period_start: string; period_end: string };
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
const reportKind = (content: Json) => content && typeof content === "object" && !Array.isArray(content) && content.cadence === "trimestral" ? "trimestral" : "mensual";

export default function PublishedProgressReports({ studentId, reportId }: { studentId: string; reportId?: string | null }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void supabase.from("kiru_family_progress_reports").select("id,content,period_start,period_end")
      .eq("student_id", studentId).eq("status", "publicado").order("period_end", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError("No se pudieron cargar los informes.");
        else {
          setReports(data ?? []);
          const initial = data?.find((report) => report.id === reportId)?.id ?? data?.[0]?.id ?? "";
          setSelectedId(initial);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [studentId, reportId]);

  if (loading) return <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Cargando informes…</p>;
  if (error) return <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error}</p>;
  if (!reports.length) return <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-serif text-lg font-bold">Informes de progreso</h2><p className="mt-2 text-sm text-slate-600">Cuando el coordinador comparta un informe, aparecerá aquí.</p></div>;
  const selected = reports.find((report) => report.id === selectedId) ?? reports[0];
  return <div className="space-y-4">
    {reports.length > 1 && <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm"><span className="font-semibold">Informe</span><select value={selected.id} onChange={(event) => { setSelectedId(event.target.value); const params = new URLSearchParams(window.location.search); params.set("informe", event.target.value); window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`); }} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-2">{reports.map((report) => <option key={report.id} value={report.id}>{reportKind(report.content)} · {dateLabel(report.period_start)} – {dateLabel(report.period_end)}</option>)}</select></label>}
    <ProgressReportDocument content={selected.content} periodStart={selected.period_start} periodEnd={selected.period_end} />
  </div>;
}
