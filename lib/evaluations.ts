// Evaluaciones trimestrales: tipos y textos compartidos por servidor y paneles.
import type { AcademicStatus, EvaluationStatus, EvaluationTarget } from "@/lib/database.types";

export type { AcademicStatus, EvaluationStatus, EvaluationTarget };

export const EVAL_BUCKET = "kiru-evaluaciones";
/** El formulario del mentor solo se puede rellenar de 2 días antes a 2 días después de su fecha. */
export const MENTOR_WINDOW_DAYS = 2;
export type EvalMode = "apagado" | "prueba" | "activo";

export const TARGET_LABEL: Record<EvaluationTarget, string> = {
  familia: "Formulario de la familia",
  mentor: "Formulario del mentor",
  alumno: "Evaluación en papel del alumno",
};
export const STATUS_LABEL: Record<EvaluationStatus, string> = {
  programada: "Programada",
  abierta: "Pendiente",
  completada: "Hecha",
  sin_respuesta: "Sin respuesta",
  cancelada: "Cancelada",
};
export const ACADEMIC_LABEL: Record<AcademicStatus, string> = {
  sin_elegir: "Sin elegir",
  por_aprobar: "Por aprobar",
  aprobada: "Aprobada",
};
export const MODE_LABEL: Record<EvalMode, string> = {
  apagado: "Apagado (no se crea ni se envía nada)",
  prueba: "Prueba (solo los alumnos elegidos)",
  activo: "Activo (todos los alumnos)",
};

export const cycleLabel = (cycle: number) => (cycle === 0 ? "Inicial" : `Trimestre ${cycle}`);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** «16/12» o «martes 16/12». */
export function shortEvalDate(date: string, withWeekday = false): string {
  const d = new Date(`${date}T12:00:00Z`);
  const dm = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  if (!withWeekday) return dm;
  const wd = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d.getUTCDay()];
  return `${wd} ${dm}`;
}

export function madridTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function mentorWindow(dueOn: string): { opensOn: string; closesOn: string } {
  return { opensOn: addDaysIso(dueOn, -MENTOR_WINDOW_DAYS), closesOn: addDaysIso(dueOn, MENTOR_WINDOW_DAYS) };
}

/** Lo que ve la familia en su panel. */
export type FamilyEvaluationView = {
  id: string; studentId: string; studentName: string; cycle: number; dueOn: string;
  status: EvaluationStatus; link: string; holiday: string | null;
};

export type FileRef = { which: "academica" | "escaneo" | "test_fijo"; index?: number };

/** Lo que ve el mentor. */
export type MentorEvaluationView = {
  id: string; studentId: string; studentName: string; target: "mentor" | "alumno"; cycle: number; dueOn: string; status: EvaluationStatus;
  // Formulario del mentor
  opensOn: string | null; closesOn: string | null; link: string | null;
  // Papel del alumno
  academicStatus: AcademicStatus; academicName: string; academicMine: boolean; scans: number; givenBy: string;
  hasFixedTest: boolean;
};

/** Una fila de la tabla de coordinación. */
export type StaffEvaluationView = {
  id: string; studentId: string; studentName: string; target: EvaluationTarget; cycle: number;
  mentorId: string | null; mentorName: string; dueOn: string; originalDueOn: string; status: EvaluationStatus;
  completedAt: string | null; completedVia: string | null; late: boolean;
  academicStatus: AcademicStatus; academicName: string; academicByName: string; scans: number; givenBy: string; note: string;
  holiday: string | null;
};

export type StaffStudentSettings = {
  studentId: string; studentName: string; familyStartOn: string | null; firstSession: string | null; skipInitial: boolean; paused: boolean;
};

export type StaffEvaluationsPayload = {
  role: "admin" | "coordinador";
  rows: StaffEvaluationView[];
  students: StaffStudentSettings[];
  settings: { mode: EvalMode; testStudents: string[]; hasFixedTest: boolean } | null;
  allStudents: { id: string; name: string }[];
};
