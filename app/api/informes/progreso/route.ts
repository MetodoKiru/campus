import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { requireStaff, UUID_RE } from "@/lib/server/require-staff";
import { findAnswer, parseAnswers, type SessionAnswer } from "@/lib/session-logs";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUBJECTS = ["ingles", "lengua", "calculalo"] as const;
type Subject = (typeof SUBJECTS)[number];
type StaffAuth = Extract<Awaited<ReturnType<typeof requireStaff>>, { ok: true }>;
type Fields = {
  advance: string; attitudeContext: string; schoolRelationship: string; schoolNotes: string;
  adaptation: string; adaptationNotes: string; familyAdvice: string; recommendations: string;
  nextSteps: string; nextStepsOwner: string;
};
const clean = (value: unknown, limit = 1200) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const emptyFields: Fields = { advance: "", attitudeContext: "", schoolRelationship: "no_aplica", schoolNotes: "", adaptation: "no_aplica", adaptationNotes: "", familyAdvice: "", recommendations: "", nextSteps: "", nextStepsOwner: "familia" };

function dateAddMonths(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function dateAddDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inPeriod(value: string | undefined, start: string, end: string) {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= start && day <= end;
}

function weekStart(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function sessionView(log: { id: string; session_date: string | null; incident: string; answers: Json }) {
  const answers = parseAnswers(log.answers);
  const find = (prefix: string) => findAnswer(answers, prefix);
  return {
    id: log.id,
    date: log.session_date,
    objective: find("¿Cuál era el objetivo principal de la sesión?"),
    work: find("¿Qué se ha trabajado hoy?"),
    attitude: find("Actitud y Participación"),
    incident: log.incident || find("Incidencia"),
    achievement: find("¿Cuál ha sido el principal logro del alumno esta semana?"),
    difficulty: find("¿Qué ha sido lo que más le ha costado esta semana?"),
    reasoning: find("¿Cómo ha argumentado o explicado sus decisiones?"),
    familyAdvice: find("Recomendación para la familia"),
    answers: answers.map((answer: SessionAnswer) => ({ question: answer.q, answer: answer.a })),
  };
}

function weeklyAccuracy(rows: Array<{ date: string; correct: number; total: number }>) {
  const byWeek = new Map<string, { correct: number; total: number }>();
  for (const row of rows) {
    const key = weekStart(row.date);
    const value = byWeek.get(key) ?? { correct: 0, total: 0 };
    value.correct += row.correct;
    value.total += row.total;
    byWeek.set(key, value);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, value]) => ({
    week, correct: value.correct, total: value.total, accuracy: value.total ? value.correct / value.total : 0,
  }));
}

async function studentScope(admin: StaffAuth, studentId: string) {
  if (admin.role === "admin") return true;
  const { data: mentorLinks, error } = await admin.admin.from("student_mentors").select("mentor_id").eq("student_id", studentId);
  if (error) throw new Error("No se pudo comprobar la asignación del alumno.");
  const mentorIds = (mentorLinks ?? []).map((row) => row.mentor_id);
  if (!mentorIds.length) return false;
  const { data: coordinatorLinks, error: coordinatorError } = await admin.admin.from("kiru_coordinator_mentors").select("mentor_id").eq("coordinator_id", admin.user.id).in("mentor_id", mentorIds);
  if (coordinatorError) throw new Error("No se pudo comprobar el grupo del coordinador.");
  return Boolean(coordinatorLinks?.length);
}

export async function GET(request: Request) {
  const auth = await requireStaff(request, ["coordinador", "admin"]);
  if (!auth.ok) return auth.response;

  const { admin, user, role } = auth;
  let mentorIds: string[] | undefined;
  if (role === "coordinador") {
    const { data, error } = await admin.from("kiru_coordinator_mentors").select("mentor_id").eq("coordinator_id", user.id);
    if (error) return NextResponse.json({ error: "No se pudieron cargar los mentores asignados." }, { status: 500 });
    mentorIds = (data ?? []).map((row) => row.mentor_id);
  }
  const { data: assignments, error: assignmentError } = await admin.from("student_mentors").select("student_id,mentor_id");
  if (assignmentError) return NextResponse.json({ error: "No se pudieron cargar los alumnos." }, { status: 500 });
  const visibleAssignments = (assignments ?? []).filter((row) => !mentorIds || mentorIds.includes(row.mentor_id));
  const studentIds = [...new Set(visibleAssignments.map((row) => row.student_id))];
  if (!studentIds.length) return NextResponse.json({ students: [] });

  const [profiles, renewals, reports] = await Promise.all([
    admin.from("profiles").select("id,full_name").in("id", studentIds).eq("role", "alumno"),
    admin.from("kiru_renewals").select("student_id,period_end,closed_at,guardian_email").in("student_id", studentIds).order("period_end", { ascending: false }),
    admin.from("kiru_family_progress_reports").select("id,student_id,period_start,period_end,due_date,status,content,published_at").in("student_id", studentIds).order("period_end", { ascending: false }),
  ]);
  if (profiles.error || renewals.error || reports.error) return NextResponse.json({ error: "No se pudo cargar la información de informes." }, { status: 500 });
  const nameById = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name]));
  const reportRows = reports.data ?? [];
  const seen = new Set<string>();
  const renewalRows = renewals.data ?? [];
  const students = renewalRows.filter((renewal) => renewal.closed_at === null).flatMap((renewal) => {
    if (seen.has(renewal.student_id) || !nameById.has(renewal.student_id)) return [];
    seen.add(renewal.student_id);
    const end = renewal.period_end;
    return ([{ cadence: "mensual" as const, months: 1 }, { cadence: "trimestral" as const, months: 3 }]).map(({ cadence, months }) => {
      const start = dateAddMonths(end, months);
      const report = reportRows.find((row) => row.student_id === renewal.student_id && row.period_start === start && row.period_end === end) ?? null;
      return { studentId: renewal.student_id, studentName: nameById.get(renewal.student_id), email: renewal.guardian_email,
        cadence, periodStart: start, periodEnd: end, dueDate: dateAddDays(end, -4), report };
    });
  });
  return NextResponse.json({ students });
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, ["coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const action = body.action;

  if (action === "publicar") {
    if (typeof body.reportId !== "string" || !UUID_RE.test(body.reportId)) return NextResponse.json({ error: "Informe no válido." }, { status: 400 });
    const { data: report, error: reportError } = await auth.admin.from("kiru_family_progress_reports").select("id,student_id,status,content").eq("id", body.reportId).maybeSingle();
    if (reportError || !report) return NextResponse.json({ error: "No se encontró el informe." }, { status: 404 });
    if (!(await studentScope(auth, report.student_id))) return NextResponse.json({ error: "No tienes acceso a este alumno." }, { status: 403 });
    if (report.status === "publicado") return NextResponse.json({ ok: true, reportId: report.id, alreadyPublished: true });
    const content = report.content as unknown as Record<string, unknown>;
    const fields = content.coordinator as Partial<Fields> | undefined;
    if (!fields?.nextSteps?.trim()) return NextResponse.json({ error: "Añade el próximo paso antes de publicar el informe." }, { status: 400 });
    const { error } = await auth.admin.from("kiru_family_progress_reports").update({ status: "publicado", published_at: new Date().toISOString(), published_by: auth.user.id, updated_by: auth.user.id }).eq("id", report.id).eq("status", "borrador");
    if (error) return NextResponse.json({ error: "No se pudo publicar el informe." }, { status: 500 });
    return NextResponse.json({ ok: true, reportId: report.id });
  }

  if (action !== "guardar" || typeof body.studentId !== "string" || !UUID_RE.test(body.studentId)
    || typeof body.periodStart !== "string" || !DATE_RE.test(body.periodStart)
    || typeof body.periodEnd !== "string" || !DATE_RE.test(body.periodEnd)) {
    return NextResponse.json({ error: "Completa el alumno y el periodo del informe." }, { status: 400 });
  }
  const studentId = body.studentId;
  if (!(await studentScope(auth, studentId))) return NextResponse.json({ error: "No tienes acceso a este alumno." }, { status: 403 });
  const periodStart = body.periodStart;
  const periodEnd = body.periodEnd;
  if (periodStart >= periodEnd) return NextResponse.json({ error: "El periodo no es válido." }, { status: 400 });
  const dueDate = dateAddDays(periodEnd, -4);

  const [student, logsResult, tasksResult, progressResult, activityResult, skillcoinResult, previousReport] = await Promise.all([
    auth.admin.from("profiles").select("id,full_name").eq("id", studentId).eq("role", "alumno").maybeSingle(),
    auth.admin.from("kiru_session_logs").select("id,session_date,incident,answers").eq("student_id", studentId).gte("session_date", periodStart).lte("session_date", periodEnd).order("session_date"),
    auth.admin.from("kiru_app_records").select("record_key,data,created_at").eq("owner_id", studentId).eq("record_type", "task"),
    auth.admin.from("kiru_app_records").select("record_key,data,created_at").eq("owner_id", studentId).eq("record_type", "progress"),
    auth.admin.from("kiru_app_records").select("record_key,data,created_at").eq("owner_id", studentId).eq("record_type", "activity"),
    auth.admin.rpc("kiru_skillcoin_summary", { p_student: studentId }),
    auth.admin.from("kiru_family_progress_reports").select("id,status,content,created_by").eq("student_id", studentId).eq("period_start", periodStart).eq("period_end", periodEnd).maybeSingle(),
  ]);
  if (student.error || !student.data) return NextResponse.json({ error: "No se encontró el alumno." }, { status: 404 });
  if (logsResult.error || tasksResult.error || progressResult.error || activityResult.error || skillcoinResult.error || previousReport.error) return NextResponse.json({ error: "No se pudieron reunir los datos del alumno." }, { status: 500 });
  if (previousReport.data?.status === "publicado") return NextResponse.json({ error: "Este informe ya se compartió con la familia." }, { status: 409 });

  const tasks = tasksResult.data ?? [];
  const progress = progressResult.data ?? [];
  const activity = activityResult.data ?? [];
  const sessionDetails = (logsResult.data ?? []).map(sessionView);
  const attitude = sessionDetails.flatMap((item) => {
    const value = Number(item.attitude);
    return Number.isFinite(value) && value >= 1 && value <= 5 ? [{ date: item.date, value }] : [];
  });
  const englishTasks = tasks.filter((row) => (row.data as Record<string, unknown>)?.kind === "english_task");
  const englishProgress = new Map(progress.map((row) => [row.record_key, row.data as Record<string, unknown>]));
  const englishRows = englishTasks.flatMap((row) => {
    const data = row.data as Record<string, unknown>;
    const saved = englishProgress.get(row.record_key);
    const completedAt = typeof saved?.completedAt === "string" ? saved.completedAt : "";
    if (!inPeriod(completedAt, periodStart, periodEnd)) return [];
    const total = Number(saved?.total) || 0;
    const correct = Number(saved?.score) || 0;
    return [{ date: completedAt, total, correct, title: clean(data.title, 100) }];
  });
  const englishAssigned = englishTasks.filter((row) => inPeriod((row.data as Record<string, unknown>)?.assignedAt as string, periodStart, periodEnd)).length;
  const lenguaAttempts = progress.flatMap((row) => {
    const data = row.data as Record<string, unknown>;
    if (data?.kind !== "lengua_attempt" || typeof data.completedAt !== "string" || !inPeriod(data.completedAt, periodStart, periodEnd)) return [];
    const answers = Array.isArray(data.answers) ? data.answers as Array<Record<string, unknown>> : [];
    return [{ date: data.completedAt, total: answers.length, correct: answers.filter((answer) => answer.correct === true).length,
      answers: answers.map((answer) => ({ unit: clean(answer.unit, 100), skill: clean(answer.skill, 80), correct: answer.correct === true })) }];
  });
  const lenguaTasks = tasks.filter((row) => (row.data as Record<string, unknown>)?.kind === "lengua_task");
  const subjectHistory: Subject[] = [];
  if (englishTasks.length || progress.some((row) => (row.data as Record<string, unknown>)?.module === "english_report")) subjectHistory.push("ingles");
  if (lenguaAttempts.length || lenguaTasks.length || activity.some((row) => String(row.record_key).startsWith("lengua_profile_"))) subjectHistory.push("lengua");
  if (activity.some((row) => (row.data as Record<string, unknown>)?.module === "calculalo")) subjectHistory.push("calculalo");
  const requestedSubjects = Array.isArray(body.subjects) ? body.subjects.filter((item): item is Subject => SUBJECTS.includes(item as Subject)) : subjectHistory;
  // El coordinador confirma la selección disponible para ese alumno; cuando el cliente omite
  // el campo se conservan las asignaturas detectadas automáticamente.
  const subjects = [...new Set(requestedSubjects.length ? requestedSubjects : subjectHistory)];
  const sc = (skillcoinResult.data ?? {}) as { weeks?: Array<{ week: string; estudios: number; compromiso: number; organizacion: number; bienestar: number; corrected: boolean }> };
  const skillcoinWeeks = (sc.weeks ?? []).filter((week) => week.week >= weekStart(periodStart) && week.week <= weekStart(periodEnd));
  const fields = { ...emptyFields, ...(body.fields && typeof body.fields === "object" ? body.fields as Partial<Fields> : {}) };
  for (const key of Object.keys(emptyFields) as (keyof Fields)[]) fields[key] = clean(fields[key], key.endsWith("Notes") ? 1200 : 1000) as never;
  const recommendationsFromMentor = [...new Set(sessionDetails.map((item) => item.familyAdvice).filter(Boolean))];

  const content = {
    version: 1,
    cadence: periodStart <= dateAddMonths(periodEnd, 3) ? "trimestral" : "mensual",
    studentName: student.data.full_name,
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    subjects,
    detectedSubjects: subjectHistory,
    sessions: { count: sessionDetails.length, details: sessionDetails },
    attitude: { count: attitude.length, average: attitude.length ? attitude.reduce((sum, item) => sum + item.value, 0) / attitude.length : null, values: attitude },
    skillcoins: skillcoinWeeks,
    academics: {
      ingles: subjects.includes("ingles") ? { assigned: englishAssigned, completed: englishRows.length, weekly: weeklyAccuracy(englishRows), tasks: englishRows } : null,
      lengua: subjects.includes("lengua") ? { attempts: lenguaAttempts.length, weekly: weeklyAccuracy(lenguaAttempts), attemptsDetail: lenguaAttempts } : null,
      calculalo: subjects.includes("calculalo") ? { available: false, note: "El informe de Calculalo todavía no se ha importado a este periodo." } : null,
    },
    mentorFamilyAdvice: recommendationsFromMentor,
    coordinator: fields,
  };
  const { data: saved, error: saveError } = await auth.admin.from("kiru_family_progress_reports").upsert({
    ...(previousReport.data?.id ? { id: previousReport.data.id } : {}),
    student_id: studentId,
    period_start: periodStart,
    period_end: periodEnd,
    due_date: dueDate,
    status: "borrador",
    content: content as unknown as Json,
    created_by: previousReport.data?.created_by ?? auth.user.id,
    updated_by: auth.user.id,
    published_by: null,
    published_at: null,
  }, { onConflict: "student_id,period_start,period_end" }).select("id,status,content,period_start,period_end,due_date").single();
  if (saveError || !saved) return NextResponse.json({ error: "No se pudo guardar el borrador." }, { status: 500 });
  return NextResponse.json({ report: saved });
}
