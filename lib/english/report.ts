import { getKiruRecords, saveKiruRecord } from "@/lib/kiru-records";
import { EnglishSkill, findTopic, findUnit, SKILL_LABELS, SKILL_ORDER } from "@/lib/english/curriculum";
import { isCorrect } from "@/lib/english/generator";
import { supabase } from "@/lib/supabase";
import { EnglishTaskWithProgress } from "@/lib/english/tasks";

// Progress reports every 4 weeks. Periods start on the day the student got their first
// English task. A saved report keeps a snapshot of the figures plus the mentor's comment
// as a "progress" record owned by the student, so mentors and guardians can read it.

const PERIOD_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportPeriod {
  index: number;
  /** ISO dates; the end is exclusive. */
  start: string;
  end: string;
  current: boolean;
}

export interface TopicStat {
  key: string;
  title: string;
  skill: EnglishSkill;
  tasks: number;
  correct: number;
  answered: number;
}

export interface EnglishReportData {
  periodIndex: number;
  periodStart: string;
  periodEnd: string;
  assigned: number;
  completed: number;
  pending: number;
  averageGrade: number | null;
  previousAverageGrade: number | null;
  accuracy: number | null;
  answered: number;
  /** Older saved reports only have vocabulary and grammar. */
  bySkill: Partial<Record<EnglishSkill, { correct: number; answered: number }>>;
  topics: TopicStat[];
  mistakes: { prompt: string; given: string; answer: string }[];
  summary: string[];
}

export interface SavedEnglishReport {
  module: "english_report";
  version: 1;
  studentId: string;
  mentorId: string;
  comment: string;
  report: EnglishReportData;
  createdAt: string;
  updatedAt: string;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** All 4-week periods from the first task up to today, newest first. */
export function reportPeriods(items: EnglishTaskWithProgress[], now = new Date()): ReportPeriod[] {
  if (!items.length) return [];
  const first = items.reduce((min, item) => (item.task.assignedAt < min ? item.task.assignedAt : min), items[0].task.assignedAt);
  const anchor = startOfDay(new Date(first)).getTime();
  const periods: ReportPeriod[] = [];
  for (let index = 0; anchor + index * PERIOD_DAYS * DAY_MS <= now.getTime(); index++) {
    const start = anchor + index * PERIOD_DAYS * DAY_MS;
    const end = start + PERIOD_DAYS * DAY_MS;
    periods.push({ index, start: new Date(start).toISOString(), end: new Date(end).toISOString(), current: now.getTime() < end });
  }
  return periods.reverse();
}

const inPeriod = (iso: string | undefined, period: { start: string; end: string }) =>
  Boolean(iso) && (iso as string) >= period.start && (iso as string) < period.end;

function completedIn(items: EnglishTaskWithProgress[], period: { start: string; end: string }) {
  return items.filter((item) => item.progress?.status === "completed" && inPeriod(item.progress.completedAt, period));
}

function averageGrade(items: EnglishTaskWithProgress[]): number | null {
  const grades = items
    .filter((item) => item.progress?.total)
    .map((item) => ((item.progress?.score ?? 0) / (item.progress?.total ?? 1)) * 10);
  return grades.length ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : null;
}

const percent = (ratio: number) => Math.round(ratio * 100);

export function buildEnglishReport(items: EnglishTaskWithProgress[], period: ReportPeriod): EnglishReportData {
  const assigned = items.filter((item) => inPeriod(item.task.assignedAt, period));
  const completed = completedIn(items, period);
  const previousPeriod = {
    start: new Date(new Date(period.start).getTime() - PERIOD_DAYS * DAY_MS).toISOString(),
    end: period.start,
  };
  const previousAverageGrade = period.index > 0 ? averageGrade(completedIn(items, previousPeriod)) : null;

  const bySkill: Record<EnglishSkill, { correct: number; answered: number }> = Object.fromEntries(
    SKILL_ORDER.map((skill) => [skill, { correct: 0, answered: 0 }]),
  ) as Record<EnglishSkill, { correct: number; answered: number }>;
  const topics = new Map<string, TopicStat>();
  const mistakes: EnglishReportData["mistakes"] = [];
  let correctTotal = 0;
  let answeredTotal = 0;

  for (const item of completed) {
    const { config } = item.task;
    const key = `${config.levelId}/${config.unitId}/${config.topicId}`;
    const topic = findTopic(config.levelId, config.unitId, config.topicId);
    const unit = findUnit(config.levelId, config.unitId);
    const stat = topics.get(key) ?? {
      key,
      title: topic ? `${unit?.title.split(" · ")[0] ?? config.unitId} · ${topic.title}` : item.task.title,
      skill: item.task.skill,
      tasks: 0,
      correct: 0,
      answered: 0,
    };
    stat.tasks += 1;
    for (const exercise of item.task.exercises) {
      const given = item.progress?.answers[exercise.id];
      if (given === undefined) continue;
      const correct = isCorrect(exercise, given);
      stat.answered += 1;
      bySkill[item.task.skill].answered += 1;
      answeredTotal += 1;
      if (correct) {
        stat.correct += 1;
        bySkill[item.task.skill].correct += 1;
        correctTotal += 1;
      } else {
        mistakes.push({ prompt: exercise.prompt, given, answer: exercise.answer });
      }
    }
    topics.set(key, stat);
  }

  const topicList = [...topics.values()].sort((a, b) => a.correct / Math.max(1, a.answered) - b.correct / Math.max(1, b.answered));
  const report: EnglishReportData = {
    periodIndex: period.index,
    periodStart: period.start,
    periodEnd: period.end,
    assigned: assigned.length,
    completed: completed.length,
    pending: assigned.filter((item) => item.progress?.status !== "completed").length,
    averageGrade: averageGrade(completed),
    previousAverageGrade,
    accuracy: answeredTotal ? correctTotal / answeredTotal : null,
    answered: answeredTotal,
    bySkill,
    topics: topicList,
    // The latest mistakes are the most useful to review; keep the list short.
    mistakes: mistakes.slice(-10),
    summary: [],
  };
  report.summary = summarize(report);
  return report;
}

/** Skills with at least 5 answers, best accuracy first. */
export function skillRanking(report: EnglishReportData): { skill: EnglishSkill; ratio: number; answered: number }[] {
  return SKILL_ORDER.flatMap((skill) => {
    const stat = report.bySkill[skill];
    return stat && stat.answered >= 5 ? [{ skill, ratio: stat.correct / stat.answered, answered: stat.answered }] : [];
  }).sort((a, b) => b.ratio - a.ratio);
}

function summarize(report: EnglishReportData): string[] {
  const lines: string[] = [];
  if (!report.assigned && !report.completed) {
    return ["No hubo tareas de inglés en este periodo."];
  }
  lines.push(`Ha completado ${report.completed} tarea${report.completed === 1 ? "" : "s"} de inglés y ha respondido ${report.answered} ejercicios.`);
  if (report.averageGrade !== null) {
    let line = `Nota media: ${report.averageGrade.toFixed(1)}/10`;
    if (report.previousAverageGrade !== null) {
      const diff = report.averageGrade - report.previousAverageGrade;
      line +=
        Math.abs(diff) < 0.3
          ? ", estable respecto al periodo anterior."
          : diff > 0
            ? `, ${diff.toFixed(1)} puntos más que en el periodo anterior.`
            : `, ${Math.abs(diff).toFixed(1)} puntos menos que en el periodo anterior.`;
    } else {
      line += ".";
    }
    lines.push(line);
  }
  const strong = report.topics.filter((topic) => topic.answered >= 5 && topic.correct / topic.answered >= 0.8);
  const weak = report.topics.filter((topic) => topic.answered >= 5 && topic.correct / topic.answered < 0.6);
  if (strong.length) lines.push(`Domina: ${strong.map((topic) => topic.title).join(", ")}.`);
  if (weak.length) lines.push(`Necesita reforzar: ${weak.map((topic) => topic.title).join(", ")}.`);
  const practised = skillRanking(report);
  if (practised.length >= 2) {
    const best = practised[0];
    const worst = practised[practised.length - 1];
    if (best.ratio - worst.ratio >= 0.15) {
      lines.push(
        `Le va mejor en ${SKILL_LABELS[best.skill]} (${percent(best.ratio)} % de aciertos) que en ${SKILL_LABELS[worst.skill]} (${percent(worst.ratio)} %).`,
      );
    }
  }
  if (report.pending) lines.push(`Tiene ${report.pending} tarea${report.pending === 1 ? "" : "s"} de este periodo sin terminar.`);
  return lines;
}

const reportKey = (periodStart: string) => `english_report_${periodStart.slice(0, 10)}`;

export async function loadEnglishReports(studentId: string): Promise<SavedEnglishReport[]> {
  const records = await getKiruRecords<SavedEnglishReport>("progress");
  return records
    .filter((record) => record.owner_id === studentId && record.data?.module === "english_report" && record.data.report)
    .map((record) => record.data);
}

export async function saveEnglishReport(report: EnglishReportData, studentId: string, comment: string, previous?: SavedEnglishReport) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Debes iniciar sesión.");
  const now = new Date().toISOString();
  const saved: SavedEnglishReport = {
    module: "english_report",
    version: 1,
    studentId,
    mentorId: data.user.id,
    comment: comment.trim(),
    report,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  await saveKiruRecord("progress", reportKey(report.periodStart), saved, studentId);
  return saved;
}

export function formatPeriod(start: string, end: string): string {
  const last = new Date(new Date(end).getTime() - DAY_MS);
  const format = (date: Date) => date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return `${format(new Date(start))} – ${format(last)}`;
}
