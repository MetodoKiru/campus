"use client";

import React, { useEffect, useState } from "react";
import { Printer, Save } from "lucide-react";
import { SKILL_LABELS } from "@/lib/english/curriculum";
import {
  buildEnglishReport,
  EnglishReportData,
  formatPeriod,
  loadEnglishReports,
  reportPeriods,
  SavedEnglishReport,
  saveEnglishReport,
} from "@/lib/english/report";
import { EnglishTaskWithProgress } from "@/lib/english/tasks";

interface MentorEnglishReportProps {
  student: { id: string; name: string; username: string };
  tasks: EnglishTaskWithProgress[];
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

// Non-breaking space so "60 %" never wraps between the number and the sign.
const pct = (correct: number, answered: number) => (answered ? `${Math.round((correct / answered) * 100)}\u00a0%` : "—");

function printReport(studentName: string, report: EnglishReportData, comment: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  const rows = report.topics
    .map((topic) => `<tr><td>${escapeHtml(topic.title)}</td><td>${topic.tasks}</td><td>${pct(topic.correct, topic.answered)}</td></tr>`)
    .join("");
  const mistakes = report.mistakes
    .map((m) => `<li>${escapeHtml(m.prompt)} — respondió «${escapeHtml(m.given)}», correcta: «${escapeHtml(m.answer)}»</li>`)
    .join("");
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de inglés · ${escapeHtml(studentName)}</title>
<style>body{font-family:Manrope,system-ui,sans-serif;color:#292825;max-width:720px;margin:32px auto;padding:0 16px;font-size:13px;line-height:1.5}
h1{font-family:"DM Serif Display",Georgia,serif;font-size:24px;margin:0}h2{font-size:14px;margin:24px 0 8px}
.muted{color:#77736B}.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}.tile{border:1px solid #E7E3DC;border-radius:12px;padding:10px}
.tile b{display:block;font-size:18px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:6px 4px;border-bottom:1px solid #EEEAE3}</style></head><body>
<p class="muted">Método Kiru · Informe de inglés</p><h1>${escapeHtml(studentName)}</h1><p class="muted">Periodo ${report.periodIndex + 1}: ${escapeHtml(formatPeriod(report.periodStart, report.periodEnd))}</p>
<div class="tiles"><div class="tile">Tareas completadas<b>${report.completed}/${report.assigned}</b></div><div class="tile">Nota media<b>${report.averageGrade === null ? "—" : report.averageGrade.toFixed(1) + "/10"}</b></div>
<div class="tile">Aciertos<b>${report.accuracy === null ? "—" : Math.round(report.accuracy * 100) + " %"}</b></div><div class="tile">Ejercicios<b>${report.answered}</b></div></div>
<h2>Resumen</h2><ul>${report.summary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
${comment.trim() ? `<h2>Comentario del mentor</h2><p>${escapeHtml(comment.trim()).replace(/\n/g, "<br>")}</p>` : ""}
${rows ? `<h2>Por tema</h2><table><tr><th>Tema</th><th>Tareas</th><th>Aciertos</th></tr>${rows}</table>` : ""}
${mistakes ? `<h2>Errores para repasar</h2><ul>${mistakes}</ul>` : ""}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

export default function MentorEnglishReport({ student, tasks }: MentorEnglishReportProps) {
  const [loadedReports, setLoadedReports] = useState<{ studentId: string; items: SavedEnglishReport[] } | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [liveStarts, setLiveStarts] = useState<string[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadEnglishReports(student.id)
      .then((items) => {
        if (active) setLoadedReports({ studentId: student.id, items });
      })
      .catch(() => {
        if (active) setLoadedReports({ studentId: student.id, items: [] });
      });
    return () => {
      active = false;
    };
  }, [student.id]);

  const savedReports = loadedReports?.studentId === student.id ? loadedReports.items : [];
  const periods = reportPeriods(tasks);
  const savedFor = (start: string) => savedReports.find((item) => item.report.periodStart === start);
  // By default open the latest finished period, which is the one due for a report.
  const defaultPeriod = periods.find((period) => !period.current) ?? periods[0];
  const period = periods.find((item) => item.start === selectedStart) ?? defaultPeriod;

  if (!period) {
    return <p className="text-xs text-[#77736B]">Cuando {student.name} tenga tareas de inglés, aquí aparecerán sus informes cada 4 semanas.</p>;
  }

  const saved = savedFor(period.start);
  // A saved report shows the figures as they were when it was saved, unless the mentor asks to refresh them.
  const showLive = !saved || liveStarts.includes(period.start);
  const report = showLive ? buildEnglishReport(tasks, period) : saved.report;
  const comment = comments[period.start] ?? saved?.comment ?? "";

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      const result = await saveEnglishReport(report, student.id, comment, saved);
      setLoadedReports({ studentId: student.id, items: [...savedReports.filter((item) => item.report.periodStart !== period.start), result] });
      setLiveStarts((current) => current.filter((start) => start !== period.start));
      setStatus("Informe guardado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo guardar el informe.");
    } finally {
      setSaving(false);
    }
  };

  const tiles = [
    { label: "Tareas completadas", value: `${report.completed}`, hint: `de ${report.assigned} asignadas en el periodo` },
    {
      label: "Nota media",
      value: report.averageGrade === null ? "—" : `${report.averageGrade.toFixed(1)}/10`,
      hint:
        report.averageGrade !== null && report.previousAverageGrade !== null
          ? `${report.averageGrade - report.previousAverageGrade >= 0 ? "+" : ""}${(report.averageGrade - report.previousAverageGrade).toFixed(1)} vs periodo anterior`
          : "Sin periodo anterior",
    },
    { label: "Aciertos", value: report.accuracy === null ? "—" : `${Math.round(report.accuracy * 100)}\u00a0%`, hint: `${report.answered} ejercicios respondidos` },
    {
      label: "Por tipo",
      value: `${pct(report.bySkill.vocabulary.correct, report.bySkill.vocabulary.answered)} / ${pct(report.bySkill.grammar.correct, report.bySkill.grammar.answered)}`,
      hint: `${SKILL_LABELS.vocabulary} / ${SKILL_LABELS.grammar}`,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {periods.map((item) => {
          const badge = item.current ? "en curso" : savedFor(item.start) ? "guardado" : "pendiente";
          const active = item.start === period.start;
          return (
            <button
              key={item.start}
              type="button"
              onClick={() => setSelectedStart(item.start)}
              className={`shrink-0 text-left px-3 py-2 rounded-xl border text-xs transition ${
                active ? "bg-[#242321] text-white border-[#242321]" : "bg-[#FAF8F5] text-[#555149] border-[#E7E3DC] hover:bg-[#F3F0EA]"
              }`}
            >
              <span className="block font-semibold">Periodo {item.index + 1}</span>
              <span className={`block text-[10px] ${active ? "text-white/70" : "text-[#8D887F]"}`}>
                {formatPeriod(item.start, item.end)} · {badge}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-[#77736B]">
          {period.current
            ? "Periodo en curso: los datos se actualizarán hasta que termine."
            : saved
              ? `Guardado el ${new Date(saved.updatedAt).toLocaleDateString("es-ES")}${showLive ? " · mostrando datos actualizados" : ""}.`
              : "Periodo terminado: revisa el informe, añade tu comentario y guárdalo."}
        </p>
        {saved && !showLive && (
          <button
            type="button"
            onClick={() => setLiveStarts((current) => [...current, period.start])}
            className="text-xs font-semibold text-[#6D6962] hover:text-[#292825]"
          >
            Recalcular con los datos actuales
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="p-4 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#77736B]">{tile.label}</p>
            <p className="text-lg sm:text-xl font-bold text-[#292825] mt-1">{tile.value}</p>
            <p className="text-[11px] text-[#8D887F] mt-0.5">{tile.hint}</p>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-2xl border border-[#E7E3DC] bg-white space-y-1.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#77736B]">Resumen</h4>
        <ul className="list-disc pl-5 space-y-1 text-xs text-[#45433F]">
          {report.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {report.topics.length > 0 && (
        <div className="p-4 rounded-2xl border border-[#E7E3DC] bg-white space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#77736B]">Aciertos por tema</h4>
          <div className="space-y-2.5">
            {report.topics.map((topic) => {
              const ratio = topic.correct / Math.max(1, topic.answered);
              return (
                <div key={topic.key} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-[#45433F] truncate" title={topic.title}>
                    {topic.title}
                  </span>
                  <div className="hidden sm:block h-2 rounded-full bg-[#EEECE7] overflow-hidden" aria-hidden="true">
                    <div className="h-full rounded-full bg-[#8A9870]" style={{ width: `${Math.round(ratio * 100)}%` }} />
                  </div>
                  <span className="text-[#45433F] font-semibold tabular-nums">
                    {Math.round(ratio * 100)} % <span className="font-normal text-[#8D887F]">· {topic.tasks} tarea{topic.tasks === 1 ? "" : "s"}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {report.mistakes.length > 0 && (
        <div className="p-4 rounded-2xl border border-[#E7E3DC] bg-white space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#77736B]">Errores recientes para repasar</h4>
          {report.mistakes.map((mistake, index) => (
            <div key={`${mistake.prompt}-${index}`} className="flex flex-col sm:flex-row sm:justify-between gap-1 text-xs border-b border-[#EEEAE3] last:border-0 pb-1.5">
              <span className="text-[#45433F]">{mistake.prompt}</span>
              <span className="text-[#8A6D62]">
                «{mistake.given}» → <strong>{mistake.answer}</strong>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="english-report-comment" className="text-[11px] font-bold uppercase tracking-wider text-[#77736B] block">
          Comentario del mentor
        </label>
        <textarea
          id="english-report-comment"
          rows={4}
          value={comment}
          onChange={(event) => setComments((current) => ({ ...current, [period.start]: event.target.value }))}
          placeholder="Actitud, avances que has visto en las sesiones y próximos objetivos."
          className="w-full p-3 bg-[#FAF8F5] border border-[#E7E3DC] rounded-2xl text-xs text-[#45433F] focus:outline-none"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 py-3 bg-[#242321] text-white rounded-xl text-xs font-semibold hover:bg-[#3A3835] transition flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Save className="w-4 h-4" /> {saving ? "Guardando…" : saved ? "Actualizar informe guardado" : "Guardar informe"}
        </button>
        <button
          type="button"
          onClick={() => printReport(student.name, report, comment)}
          className="flex-1 py-3 bg-[#F3F0EA] text-[#45433F] rounded-xl text-xs font-semibold hover:bg-[#EAE5DC] transition flex items-center justify-center gap-1.5"
        >
          <Printer className="w-4 h-4" /> Imprimir o guardar en PDF
        </button>
      </div>
      {status && <p role="status" className="text-xs font-semibold text-[#806C50]">{status}</p>}
    </div>
  );
}
