import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { madridTodayIso } from "@/lib/evaluations";
import type { FamilyOnboardingKid, OnboardingStepState } from "@/lib/incorporacion";
import { evaluationLink, loadEvalSettings, supervisorsOf } from "@/lib/server/evaluations";
import { ensurePlan, firstName, formLink, latestFamilyAvailability, loadCallSettings } from "@/lib/server/llamadas";

type Admin = SupabaseClient<Database>;

const DEFAULTS = { infoForm: "https://form.jotform.com/263185065994065", codeField: "kiru_familia" };

export type OnboardingSettings = { infoForm: string; codeField: string };

export async function loadOnboardingSettings(admin: Admin): Promise<OnboardingSettings> {
  const { data } = await admin.from("kiru_settings").select("value").eq("key", "incorporacion_familias").maybeSingle();
  const v = (data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value : {}) as Record<string, unknown>;
  return {
    infoForm: typeof v.form_info === "string" && v.form_info.startsWith("https://") ? v.form_info : DEFAULTS.infoForm,
    codeField: typeof v.campo_codigo === "string" && /^[A-Za-z0-9_]{1,60}$/.test(v.campo_codigo) ? v.campo_codigo : DEFAULTS.codeField,
  };
}

/** Código del alumno para el formulario de información extra (se crea la primera vez). */
export async function onboardingRow(admin: Admin, studentId: string) {
  const { data } = await admin.from("kiru_family_onboarding").select("*").eq("student_id", studentId).maybeSingle();
  if (data) return data;
  const { data: created } = await admin.from("kiru_family_onboarding")
    .upsert({ student_id: studentId }, { onConflict: "student_id", ignoreDuplicates: true }).select("*").maybeSingle();
  if (created) return created;
  const { data: again } = await admin.from("kiru_family_onboarding").select("*").eq("student_id", studentId).single();
  return again!;
}

/** Hijos de la familia (alumnos activos vinculados a su cuenta). */
export async function familyKids(admin: Admin, guardianId: string): Promise<{ id: string; name: string }[]> {
  const { data: links } = await admin.from("student_guardians").select("student_id").eq("guardian_id", guardianId);
  const ids = (links ?? []).map((l) => l.student_id);
  if (!ids.length) return [];
  const { data } = await admin.from("profiles").select("id,full_name").in("id", ids).eq("role", "alumno").eq("is_active", true).order("full_name");
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}

/** ¿Se puede abrir ya la evaluación inicial de este alumno? Respeta el interruptor de «Evaluaciones». */
async function evaluationAllowed(admin: Admin, studentId: string): Promise<boolean> {
  const settings = await loadEvalSettings(admin);
  if (settings.mode === "apagado") return false;
  if (settings.mode === "prueba" && !settings.testStudents.includes(studentId)) return false;
  const { data: st } = await admin.from("students").select("service_status").eq("profile_id", studentId).maybeSingle();
  if (st?.service_status !== "activo") return false;
  const { data: es } = await admin.from("kiru_evaluation_students").select("paused").eq("student_id", studentId).maybeSingle();
  return !es?.paused;
}

export async function onboardingFor(admin: Admin, requestUrl: string, kid: { id: string; name: string }, email: string): Promise<FamilyOnboardingKid> {
  const [callSettings, infoSettings] = await Promise.all([loadCallSettings(admin), loadOnboardingSettings(admin)]);

  // Paso 1: disponibilidad para la llamada semanal.
  const plan = await ensurePlan(admin, kid.id);
  const availability = await latestFamilyAvailability(admin, kid.id);
  const calls = {
    state: (availability ? "hecho" : "pendiente") as OnboardingStepState,
    formUrl: formLink(callSettings.familyForm, callSettings.codeField, plan.token, { email }),
  };

  // Paso 2: evaluación inicial (y luego cada 3 meses).
  const { data: evals } = await admin.from("kiru_evaluations").select("id,cycle,status,token,due_on")
    .eq("student_id", kid.id).eq("target", "familia").neq("status", "cancelada").order("cycle");
  const rows = evals ?? [];
  let evaluation: FamilyOnboardingKid["evaluation"];
  const open = rows.find((r) => r.status === "abierta" || r.status === "sin_respuesta");
  if (rows.some((r) => r.status === "completada")) evaluation = { state: "hecho", link: null, canOpen: false };
  else if (open) evaluation = { state: "pendiente", link: evaluationLink(requestUrl, open.token), canOpen: false };
  else {
    const allowed = await evaluationAllowed(admin, kid.id);
    const programmed = rows.find((r) => r.status === "programada" && r.cycle === 0);
    const { data: es } = await admin.from("kiru_evaluation_students").select("skip_initial").eq("student_id", kid.id).maybeSingle();
    if (!programmed && es?.skip_initial) evaluation = { state: "hecho", link: null, canOpen: false };
    else evaluation = { state: allowed ? "pendiente" : "en_espera", link: null, canOpen: allowed };
  }

  // Paso 3: información extra (voluntaria).
  const row = await onboardingRow(admin, kid.id);
  const { data: last } = await admin.from("kiru_family_info").select("received_at").eq("student_id", kid.id)
    .order("received_at", { ascending: false }).limit(1).maybeSingle();
  const info = {
    state: (last ? "hecho" : row.info_skipped_at ? "saltado" : "pendiente") as OnboardingStepState,
    formUrl: formLink(infoSettings.infoForm, infoSettings.codeField, row.token, { email }),
    sentAt: last?.received_at ?? null,
  };

  return { studentId: kid.id, studentName: firstName(kid.name), calls, evaluation, info };
}

/**
 * Abre ya la evaluación inicial de la familia, sin esperar a la primera clase.
 * · Si está programada, pasa a abierta hoy.
 * · Si aún no existe, la crea abierta hoy (ciclo 0). Las trimestrales siguientes las sigue
 *   creando la tarea diaria desde la primera clase, como siempre.
 */
export async function openInitialEvaluation(admin: Admin, requestUrl: string, studentId: string): Promise<string | null> {
  const { data: rows } = await admin.from("kiru_evaluations").select("id,cycle,status,token")
    .eq("student_id", studentId).eq("target", "familia").neq("status", "cancelada").order("cycle");
  const open = (rows ?? []).find((r) => r.status === "abierta" || r.status === "sin_respuesta");
  if (open) return evaluationLink(requestUrl, open.token);
  if ((rows ?? []).some((r) => r.status === "completada")) return null;
  if (!(await evaluationAllowed(admin, studentId))) return null;
  const today = madridTodayIso();
  const now = new Date().toISOString();
  const programmed = (rows ?? []).find((r) => r.status === "programada" && r.cycle === 0);
  if (programmed) {
    await admin.from("kiru_evaluations").update({ status: "abierta", opened_at: now, opened_on: today, updated_at: now }).eq("id", programmed.id);
    return evaluationLink(requestUrl, programmed.token);
  }
  const { data: created } = await admin.from("kiru_evaluations").insert({
    student_id: studentId, target: "familia", cycle: 0, anchor_on: today, due_on: today, original_due_on: today,
    status: "abierta", opened_at: now, opened_on: today, note: "Abierta por la familia desde sus primeros pasos en el campus.",
  }).select("token").maybeSingle();
  if (created) return evaluationLink(requestUrl, created.token);
  // Otra pestaña la creó a la vez.
  const { data: again } = await admin.from("kiru_evaluations").select("token").eq("student_id", studentId).eq("target", "familia").eq("cycle", 0).maybeSingle();
  return again ? evaluationLink(requestUrl, again.token) : null;
}

/** Aviso (campanita + correo) al coordinador del alumno —o a administración— cuando llega información. */
export async function notifyInfo(admin: Admin, studentId: string, infoId: string, studentName: string, files: number) {
  const recipients = await supervisorsOf(admin, studentId);
  const kid = firstName(studentName) || "un alumno";
  const rows = recipients.map((id) => ({
    recipient_id: id, student_id: studentId, session_id: null, request_id: null, kind: "informacion_familia" as const,
    title: `La familia de ${kid} ha enviado información`.slice(0, 200),
    body: `Contactos (colegio, psicólogo…)${files ? ` y ${files} archivo${files > 1 ? "s" : ""}` : ""}. Lo tienes en la ficha del alumno, en «Información de la familia».`,
    event_key: `informacion_familia:${infoId}`, email_status: "pendiente" as const,
  }));
  if (rows.length) await admin.from("kiru_notifications").upsert(rows, { onConflict: "recipient_id,event_key", ignoreDuplicates: true });
}

export type { Json };
