import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EvaluationRow, Json } from "@/lib/database.types";
import { addDaysIso, madridTodayIso, RATING_DAYS, type EvalMode } from "@/lib/evaluations";

type Admin = SupabaseClient<Database>;

export type EvalSettings = {
  mode: EvalMode;
  testStudents: string[];
  familyForm: string;
  mentorForm: string;
  fixedTestPath: string | null;
};

const DEFAULTS: EvalSettings = {
  mode: "apagado",
  testStudents: [],
  familyForm: "https://form.jotform.com/262883780066063",
  mentorForm: "https://form.jotform.com/262884295985075",
  fixedTestPath: null,
};

export async function loadEvalSettings(admin: Admin): Promise<EvalSettings> {
  const { data } = await admin.from("kiru_settings").select("value").eq("key", "evaluaciones").maybeSingle();
  const v = (data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value : {}) as Record<string, unknown>;
  const mode = v.modo === "prueba" || v.modo === "activo" ? v.modo : "apagado";
  const str = (x: unknown, d: string) => (typeof x === "string" && x.startsWith("https://") ? x : d);
  return {
    mode,
    testStudents: Array.isArray(v.alumnos_prueba) ? v.alumnos_prueba.filter((x): x is string => typeof x === "string") : [],
    familyForm: str(v.form_familia, DEFAULTS.familyForm),
    mentorForm: str(v.form_mentor, DEFAULTS.mentorForm),
    fixedTestPath: typeof v.test_fijo_path === "string" && v.test_fijo_path ? v.test_fijo_path : null,
  };
}

export async function saveEvalSettings(admin: Admin, patch: Partial<{ modo: EvalMode; alumnos_prueba: string[]; test_fijo_path: string | null }>) {
  const { data } = await admin.from("kiru_settings").select("value").eq("key", "evaluaciones").maybeSingle();
  const current = (data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value : {}) as Record<string, Json>;
  const value = { ...current, ...patch } as Json;
  return admin.from("kiru_settings").upsert({ key: "evaluaciones", value, updated_at: new Date().toISOString() });
}

/** Enlace del formulario de Jotform con el código de la evaluación en el campo oculto «kiru_eval». */
export function jotformUrl(settings: EvalSettings, e: Pick<EvaluationRow, "target" | "token">, names: { student: string; respondent: string }) {
  const url = new URL(e.target === "mentor" ? settings.mentorForm : settings.familyForm);
  url.searchParams.set("kiru_eval", e.token);
  // Jotform rellena estos campos si su «nombre único» coincide; si no, los ignora.
  if (names.student) url.searchParams.set("nombreAlumno", names.student);
  if (names.respondent) url.searchParams.set("nombreQuien", names.respondent);
  return url.toString();
}

/** Enlace del campus que comprueba el plazo antes de abrir el formulario. */
export const evaluationLink = (base: string, token: string) => new URL(`/evaluacion/${token}`, base).toString();

/** Periodo especial (Navidad, Semana Santa…) que coincide con la fecha, con una semana de margen antes. */
export async function holidaysFor(admin: Admin, dates: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!dates.length) return out;
  const min = dates.reduce((a, b) => (a < b ? a : b));
  const max = dates.reduce((a, b) => (a > b ? a : b));
  const { data } = await admin.from("kiru_special_periods").select("name,starts_on,ends_on")
    .eq("is_active", true).lte("starts_on", addDaysIso(max, 7)).gte("ends_on", min);
  for (const d of dates) {
    const p = (data ?? []).find((x) => d >= addDaysIso(x.starts_on, -7) && d <= x.ends_on);
    if (p) out.set(d, p.name);
  }
  return out;
}

/** Alumnos que coordina alguien (los de sus mentores). Admin: null = todos. */
export async function scopeStudents(admin: Admin, role: string, userId: string): Promise<string[] | null> {
  if (role === "admin") return null;
  const { data: mentors } = await admin.from("kiru_coordinator_mentors").select("mentor_id").eq("coordinator_id", userId);
  const ids = (mentors ?? []).map((m) => m.mentor_id);
  if (!ids.length) return [];
  const { data } = await admin.from("student_mentors").select("student_id").in("mentor_id", ids);
  return [...new Set((data ?? []).map((r) => r.student_id))];
}

export async function supervisorsOf(admin: Admin, studentId: string): Promise<string[]> {
  const { data: links } = await admin.from("student_mentors").select("mentor_id").eq("student_id", studentId);
  const mentorIds = (links ?? []).map((l) => l.mentor_id);
  if (mentorIds.length) {
    const { data } = await admin.from("kiru_coordinator_mentors").select("coordinator_id").in("mentor_id", mentorIds);
    const ids = [...new Set((data ?? []).map((c) => c.coordinator_id))];
    if (ids.length) {
      const { data: active } = await admin.from("profiles").select("id").in("id", ids).eq("is_active", true);
      if (active?.length) return active.map((p) => p.id);
    }
  }
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
  return (admins ?? []).map((p) => p.id);
}

/** Aviso suelto (campanita + correo) ligado a una evaluación. */
export async function notifyEval(admin: Admin, e: Pick<EvaluationRow, "id" | "student_id" | "due_on">, recipients: string[], step: string, title: string, body: string) {
  const rows = [...new Set(recipients)].map((id) => ({
    recipient_id: id, student_id: e.student_id, session_id: null, request_id: null, kind: "evaluacion_trimestral" as const,
    title: title.slice(0, 200), body: body.slice(0, 1000),
    event_key: `eval:${e.id}:${step}:${e.due_on}`.slice(0, 200), email_status: "pendiente" as const,
  }));
  if (!rows.length) return;
  await admin.from("kiru_notifications").upsert(rows, { onConflict: "recipient_id,event_key", ignoreDuplicates: true });
}

export const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] ?? "";

/**
 * Mentores que la familia puede valorar con esta evaluación: solo en las trimestrales
 * (no en la inicial), hasta 30 días después de abrirse, a cada mentor actual del alumno
 * que le ha dado clase en los últimos 3 meses y que aún no ha valorado.
 */
export async function pendingRatingMentors(
  admin: Admin, e: Pick<EvaluationRow, "id" | "student_id" | "target" | "cycle" | "status" | "due_on">,
): Promise<{ id: string; name: string }[]> {
  if (e.target !== "familia" || e.cycle < 1 || !["abierta", "completada"].includes(e.status)) return [];
  if (madridTodayIso() > addDaysIso(e.due_on, RATING_DAYS)) return [];
  const { data: links } = await admin.from("student_mentors").select("mentor_id").eq("student_id", e.student_id);
  const ids = [...new Set((links ?? []).map((l) => l.mentor_id))];
  if (!ids.length) return [];
  const [{ data: mentors }, { data: logs }, { data: done }] = await Promise.all([
    admin.from("profiles").select("id,full_name").in("id", ids).eq("role", "mentor").eq("is_active", true),
    admin.from("kiru_session_logs").select("mentor_id,manual_status").eq("student_id", e.student_id).in("mentor_id", ids)
      .gte("session_date", addDaysIso(e.due_on, -92)),
    admin.from("kiru_mentor_ratings").select("mentor_id").eq("evaluation_id", e.id),
  ]);
  const taught = new Set((logs ?? []).filter((l) => l.manual_status !== "archivado").map((l) => l.mentor_id));
  const rated = new Set((done ?? []).map((r) => r.mentor_id));
  return (mentors ?? []).filter((m) => taught.has(m.id) && !rated.has(m.id))
    .map((m) => ({ id: m.id, name: m.full_name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
