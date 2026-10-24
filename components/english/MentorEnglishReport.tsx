"use client";

import React, { useEffect, useRef, useState } from "react";
import { Printer, RotateCcw, Save } from "lucide-react";
import { SKILL_LABELS, SKILL_ORDER } from "@/lib/english/curriculum";
import {
  buildEnglishReport,
  draftAssessment,
  EnglishReportData,
  formatPeriod,
  loadEnglishReports,
  reportPeriods,
  SavedEnglishReport,
  saveEnglishReport,
} from "@/lib/english/report";
import { EnglishTaskWithProgress } from "@/lib/english/tasks";
import { supabase } from "@/lib/supabase";

interface MentorEnglishReportProps {
  student: { id: string; name: string; username: string };
  tasks: EnglishTaskWithProgress[];
}

const decimal = (value: number) => value.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percentOf = (correct: number, answered: number) => Math.round((correct / Math.max(1, answered)) * 100);

interface DocumentProps {
  studentName: string;
  mentorName: string;
  report: EnglishReportData;
  /** On screen the assessment is a text area; in the printed copy it is plain text. */
  assessment: React.ReactNode;
  issuedOn: string;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8D887F] mb-3">{children}</h4>;
}

function Bar({ ratio }: { ratio: number }) {
  return (
    <div className="h-1.5 rounded-full bg-[#EFECE6] overflow-hidden print-exact" aria-hidden="true">
      <div className="h-full rounded-full bg-[#2D5A43] print-exact" style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}

/** The report as families see it: the same layout on screen and in the PDF. */
function ReportDocument({ studentName, mentorName, report, assessment, issuedOn }: DocumentProps) {
  const skills = SKILL_ORDER.filter((skill) => report.bySkill[skill]?.answered);
  const topics = [...report.topics].sort((a, b) => b.correct / Math.max(1, b.answered) - a.correct / Math.max(1, a.answered));
  const diff = report.averageGrade !== null && report.previousAverageGrade !== null ? report.averageGrade - report.previousAverageGrade : null;
  const figures = [
    {
      label: "Tareas completadas",
      value: String(report.completed),
      note: report.pending ? `${report.pending} sin terminar` : report.completed ? "Todas terminadas" : "",
    },
    {
      label: "Nota media",
      value: report.averageGrade === null ? "—" : decimal(report.averageGrade),
      note: diff === null ? "sobre 10" : Math.abs(diff) < 0.05 ? "igual que el periodo anterior" : `${diff > 0 ? "+" : "−"}${decimal(Math.abs(diff))} respecto al periodo anterior`,
    },
    {
      label: "Respuestas correctas",
      value: report.accuracy === null ? "—" : `${Math.round(report.accuracy * 100)} %`,
      note: `de ${report.answered} ejercicios`,
    },
  ];

  return (
    <article className="bg-white text-[#2D312E] rounded-[28px] border border-[#EAE7E1] px-6 py-8 sm:px-12 sm:py-12 print:border-0 print:rounded-none print:p-0">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-6 border-b border-[#EAE7E1]">
        <div>
          <p className="font-serif text-sm text-[#2D5A43] tracking-wide">Método Kiru</p>
          <h3 className="font-serif text-3xl sm:text-[34px] leading-tight text-[#292825] mt-2">{studentName}</h3>
          <p className="text-sm text-[#737873] mt-1">Informe de inglés</p>
        </div>
        <dl className="text-xs text-[#737873] sm:text-right space-y-0.5">
          <div>
            <dt className="inline">Periodo: </dt>
            <dd className="inline text-[#45433F]">{formatPeriod(report.periodStart, report.periodEnd)}</dd>
          </div>
          {report.levels && report.levels.length > 0 && (
            <div>
              <dt className="inline">Nivel: </dt>
              <dd className="inline text-[#45433F]">{report.levels.map((level) => `Gateway ${level}`).join(", ")}</dd>
            </div>
          )}
          {mentorName && (
            <div>
              <dt className="inline">Mentoría: </dt>
              <dd className="inline text-[#45433F]">{mentorName}</dd>
            </div>
          )}
        </dl>
      </header>

      <section className="grid grid-cols-3 divide-x divide-[#EAE7E1] py-6 border-b border-[#EAE7E1]">
        {figures.map((figure) => (
          <div key={figure.label} className="px-2 sm:px-5 first:pl-0 last:pr-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8D887F]">{figure.label}</p>
            <p className="font-serif text-2xl sm:text-4xl text-[#292825] mt-2 tabular-nums">{figure.value}</p>
            {figure.note && <p className="text-[11px] text-[#737873] mt-1 leading-snug">{figure.note}</p>}
          </div>
        ))}
      </section>

      <section className="py-7 border-b border-[#EAE7E1]">
        <SectionTitle>Valoración</SectionTitle>
        {assessment}
      </section>

      {skills.length > 0 && (
        <section className="py-7 border-b border-[#EAE7E1] break-inside-avoid">
          <SectionTitle>Por destrezas</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
            {skills.map((skill) => {
              const stat = report.bySkill[skill] ?? { correct: 0, answered: 0 };
              return (
                <div key={skill} className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-[#292825]">{SKILL_LABELS[skill]}</span>
                    <span className="tabular-nums text-[#45433F]">{percentOf(stat.correct, stat.answered)}&nbsp;%</span>
                  </div>
                  <Bar ratio={stat.correct / Math.max(1, stat.answered)} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {topics.length > 0 && (
        <section className="py-7 border-b border-[#EAE7E1] break-inside-avoid">
          <SectionTitle>Temas trabajados</SectionTitle>
          <ul className="divide-y divide-[#F1EEE8]">
            {topics.map((topic) => (
              <li key={topic.key} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span className="text-[#45433F] min-w-0">
                  {topic.title}
                  <span className="text-[#A39E95]"> · {SKILL_LABELS[topic.skill]}</span>
                </span>
                <span className="tabular-nums text-[#292825] shrink-0">{percentOf(topic.correct, topic.answered)}&nbsp;%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.mistakes.length > 0 && (
        <section className="py-7 border-b border-[#EAE7E1] break-inside-avoid">
          <SectionTitle>Para repasar en casa</SectionTitle>
          <ul className="space-y-2.5">
            {report.mistakes.slice(-6).map((mistake, index) => (
              <li key={`${mistake.prompt}-${index}`} className="text-sm leading-snug">
                <span className="text-[#737873]">{mistake.prompt}</span>
                <br />
                <span className="font-semibold text-[#2D5A43]">{mistake.answer}</span>
                <span className="text-[#A39E95]"> (respondió «{mistake.given}»)</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="pt-6 flex items-end justify-between gap-4 text-xs text-[#737873]">
        <span>{issuedOn}</span>
        {mentorName && <span className="font-serif text-base text-[#292825]">{mentorName}</span>}
      </footer>
    </article>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-[#2D312E]">
      {text
        .split(/\n\s*\n/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph.trim()}
          </p>
        ))}
    </div>
  );
}

// Prints the hidden copy of the document in a new window with the app's own styles.
function printDocument(node: HTMLElement, title: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((element) => element.outerHTML)
    .join("");
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>${title.replace(/</g, "&lt;")}</title>${styles}
<style>@page{size:A4;margin:18mm 16mm}body{background:#fff!important;margin:0}main{max-width:720px;margin:0 auto;padding:24px}
.print-exact{-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{main{padding:0}}</style></head>
<body><main>${node.innerHTML}</main></body></html>`);
  win.document.close();
  const links = Array.from(win.document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  const loaded = links.map((link) => new Promise((resolve) => (link.sheet ? resolve(null) : ((link.onload = resolve), (link.onerror = resolve)))));
  void Promise.race([Promise.all(loaded), new Promise((resolve) => setTimeout(resolve, 2500))]).then(() => {
    win.focus();
    win.print();
  });
}

export default function MentorEnglishReport({ student, tasks }: MentorEnglishReportProps) {
  const [loadedReports, setLoadedReports] = useState<{ studentId: string; items: SavedEnglishReport[] } | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [liveStarts, setLiveStarts] = useState<string[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [mentorName, setMentorName] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [openedAt] = useState(() => Date.now());

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

  useEffect(() => {
    let active = true;
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!data.user) return;
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
        if (active && profile?.full_name) setMentorName(profile.full_name);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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
  const draft = draftAssessment(report, student.name);
  // Reports saved before the assessment draft existed fall back to their summary lines.
  const savedText = saved ? saved.comment || saved.report.summary.join(" ") : undefined;
  const assessment = comments[period.start] ?? savedText ?? draft;
  const issuedOn = new Date(saved && !showLive ? saved.updatedAt : openedAt).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      const result = await saveEnglishReport(report, student.id, assessment, saved);
      setLoadedReports({ studentId: student.id, items: [...savedReports.filter((item) => item.report.periodStart !== period.start), result] });
      setLiveStarts((current) => current.filter((start) => start !== period.start));
      setStatus("Informe guardado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo guardar el informe.");
    } finally {
      setSaving(false);
    }
  };

  const setAssessment = (value: string) => setComments((current) => ({ ...current, [period.start]: value }));

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
              : "Periodo terminado: revisa la valoración, ajústala con lo que has visto en las sesiones y guarda el informe."}
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

      <ReportDocument
        studentName={student.name}
        mentorName={mentorName}
        report={report}
        issuedOn={issuedOn}
        assessment={
          <div className="space-y-2">
            <textarea
              aria-label="Valoración del mentor"
              rows={8}
              value={assessment}
              onChange={(event) => setAssessment(event.target.value)}
              className="w-full p-4 -mx-1 rounded-2xl bg-[#FAF9F6] border border-[#EAE7E1] text-[15px] leading-relaxed text-[#2D312E] focus:outline-none focus:border-[#2D5A43]/40 resize-y field-sizing-content min-h-40"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8D887F]">
              <span>Texto de partida con los datos del periodo. Cámbialo con lo que has visto en las sesiones.</span>
              {assessment !== draft && (
                <button type="button" onClick={() => setAssessment(draft)} className="inline-flex items-center gap-1 font-semibold text-[#6D6962] hover:text-[#292825]">
                  <RotateCcw className="w-3 h-3" /> Volver al texto de partida
                </button>
              )}
            </div>
          </div>
        }
      />

      {/* Copy used for printing: identical, with the assessment as plain text. */}
      <div ref={printRef} className="hidden">
        <ReportDocument
          studentName={student.name}
          mentorName={mentorName}
          report={report}
          issuedOn={issuedOn}
          assessment={<Paragraphs text={assessment} />}
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
          onClick={() => printRef.current && printDocument(printRef.current, `Informe de inglés · ${student.name}`)}
          className="flex-1 py-3 bg-[#F3F0EA] text-[#45433F] rounded-xl text-xs font-semibold hover:bg-[#EAE5DC] transition flex items-center justify-center gap-1.5"
        >
          <Printer className="w-4 h-4" /> Imprimir o guardar en PDF
        </button>
      </div>
      {status && (
        <p role="status" className="text-xs font-semibold text-[#806C50]">
          {status}
        </p>
      )}
    </div>
  );
}
