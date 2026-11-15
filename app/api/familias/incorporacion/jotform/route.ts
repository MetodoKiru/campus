import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { serviceClient } from "@/lib/server/classes";
import { loadOnboardingSettings, notifyInfo } from "@/lib/server/incorporacion";

export const runtime = "nodejs";

const UUID_IN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Preguntas del formulario, en orden, para leer el resumen («pretty») que manda Jotform. */
const LABELS = [
  "Nombre del alumno/a", "Correo electrónico de la familia", "Nombre del colegio",
  "Persona de contacto (tutor/a, orientador/a o coordinador/a)", "Cargo de la persona de contacto", "Cargo",
  "Teléfono del colegio", "Correo del colegio",
  "Nombre del profesional", "Profesión (psicólogo/a, logopeda…)", "Profesión", "Centro o consulta",
  "Teléfono del profesional", "Correo del profesional", "Teléfono", "Correo electrónico", "Nombre",
  "Nombre del otro contacto", "Relación con el alumno/a", "Teléfono o correo electrónico",
  "¿Nos autorizáis a contactar con estas personas para coordinarnos?",
  "¿Algo más que nos ayude a entenderle mejor?",
];

const text = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (v && typeof v === "object") return Object.values(v).map(text).filter(Boolean).join(" ");
  return v === null || v === undefined ? "" : String(v);
};

/** «Etiqueta:valor, Etiqueta:valor» → lista. Solo corta donde empieza una etiqueta conocida. */
function splitPretty(pretty: string): { label: string; value: string }[] {
  const marks: { at: number; label: string }[] = [];
  const sorted = [...LABELS].sort((a, b) => b.length - a.length);
  for (const label of sorted) {
    let from = 0;
    for (;;) {
      const i = pretty.indexOf(`${label}:`, from);
      if (i < 0) break;
      const okStart = i === 0 || pretty.slice(Math.max(0, i - 2), i) === ", ";
      const covered = marks.some((m) => i >= m.at && i < m.at + m.label.length + 1);
      if (okStart && !covered) marks.push({ at: i, label });
      from = i + 1;
    }
  }
  marks.sort((a, b) => a.at - b.at);
  return marks.map((m, n) => {
    const end = n + 1 < marks.length ? marks[n + 1].at - 2 : pretty.length;
    return { label: m.label, value: pretty.slice(m.at + m.label.length + 1, end).trim() };
  }).filter((x) => x.value && !/^c[oó]digo/i.test(x.label));
}

/** Enlaces a los archivos subidos (Jotform los manda como lista de URLs). */
function filesIn(raw: Record<string, unknown>): { name: string; url: string }[] {
  const urls = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") { for (const m of v.matchAll(/https:\/\/[^\s"',]+\/uploads\/[^\s"',]+/g)) urls.add(m[0]); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const [k, v] of Object.entries(raw)) if (/^q\d+_/.test(k)) walk(v);
  return [...urls].slice(0, 40).map((url) => ({ name: decodeURIComponent(url.split("/").pop() ?? "archivo").slice(0, 200), url: url.slice(0, 600) }));
}

/**
 * Webhook de Jotform «Información extra de vuestro hijo/a · Método Kiru».
 * El alumno se reconoce por el código oculto del enlace del campus (campo «kiru_familia»); si no lo
 * trae, por el correo de la familia; si tampoco, queda guardado sin enlazar. Avisa al coordinador.
 */
export async function POST(request: Request) {
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "No está configurado." }, { status: 503 });
  let raw: Record<string, unknown> = {};
  let submissionId = "";
  let pretty = "";
  try {
    const form = await request.formData();
    submissionId = String(form.get("submissionID") ?? "").slice(0, 64);
    pretty = String(form.get("pretty") ?? "").slice(0, 20000);
    const rawRequest = form.get("rawRequest");
    if (typeof rawRequest === "string") raw = JSON.parse(rawRequest);
  } catch {
    return NextResponse.json({ ok: false, error: "Respuesta no válida." }, { status: 400 });
  }
  const settings = await loadOnboardingSettings(admin);
  const field = new RegExp(`^q\\d+_${settings.codeField}$`, "i");
  const codeRaw = text(Object.entries(raw).find(([k]) => field.test(k) || /^q\d+_codigo/i.test(k))?.[1]);
  const code = UUID_IN.exec(codeRaw)?.[0]?.toLowerCase() ?? null;
  const list = splitPretty(pretty);
  const studentName = (list.find((x) => x.label === "Nombre del alumno/a")?.value
    ?? text(Object.entries(raw).find(([k]) => /^q\d+_nombreDel/i.test(k))?.[1])).trim().slice(0, 200);
  const emailText = (list.find((x) => x.label === "Correo electrónico de la familia")?.value ?? "").trim().toLowerCase();
  const email = EMAIL_RE.test(emailText) ? emailText.slice(0, 200) : "";

  let studentId: string | null = null;
  if (code) {
    const { data } = await admin.from("kiru_family_onboarding").select("student_id").eq("token", code).maybeSingle();
    studentId = data?.student_id ?? null;
  }
  if (!studentId && email) {
    // Por el correo de la cuenta del padre o la madre, si solo tiene un hijo/a en el campus.
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const u = users?.users.find((x) => x.email?.toLowerCase() === email);
    if (u) {
      const { data: links } = await admin.from("student_guardians").select("student_id").eq("guardian_id", u.id);
      if (links?.length === 1) studentId = links[0].student_id;
    }
  }

  const files = filesIn(raw);
  const { data: saved, error } = await admin.from("kiru_family_info").insert({
    student_id: studentId, student_name: studentName, email, files: files as unknown as Json,
    answers: { _lista: list, ...(pretty ? { _resumen: pretty } : {}) } as unknown as Json,
    submission_id: submissionId || null,
  }).select("id").maybeSingle();
  if (error && !/duplicate/i.test(error.message)) return NextResponse.json({ ok: false }, { status: 500 });
  if (saved && studentId) await notifyInfo(admin, studentId, saved.id, studentName, files.length);
  return NextResponse.json({ ok: true, linked: Boolean(studentId) });
}
