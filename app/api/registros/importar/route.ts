import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { matchByName, normalizeName, type SessionAnswer } from "@/lib/session-logs";

export const runtime = "nodejs";

const MAX_ROWS = 3000;
const MAX_ANSWER = 4000;
type SheetRow = Record<string, unknown>;

function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Acepta «2026-09-16T16:50:39+02:00», «2026-09-16» o «16/09/2026 16:50:39». */
function parseDate(value: string): { iso: string; day: string } | null {
  if (!value) return null;
  const local = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (local) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = local;
    const day = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return { iso: `${day}T${hh.padStart(2, "0")}:${mm}:${ss.padStart(2, "0")}+01:00`, day };
  }
  const isoDay = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!isoDay || Number.isNaN(new Date(value).getTime())) return null;
  return { iso: value.length === 10 ? `${value}T12:00:00+01:00` : value, day: isoDay[1] };
}

/**
 * Recibe las respuestas del formulario «Registro de sesión» desde el Apps Script
 * de la hoja y las guarda en kiru_session_logs. Se puede llamar las veces que
 * haga falta: cada fila se identifica por su marca temporal, mentor y alumno, y
 * se actualiza en vez de duplicarse. La protege una clave compartida
 * (KIRU_REGISTROS_SECRET) que solo conocen Vercel y el Apps Script.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.KIRU_REGISTROS_SECRET;
  if (!url || !service || !secret || secret.length < 24) {
    return NextResponse.json({ error: "La importación de registros no está configurada." }, { status: 503 });
  }
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!given || !sameSecret(given, secret)) return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: { rows?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  if (!Array.isArray(body.rows) || body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Envía entre 0 y ${MAX_ROWS} filas.` }, { status: 400 });
  }

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const [profilesResult, assignmentsResult, usersResult] = await Promise.all([
    admin.from("profiles").select("id,full_name,role").in("role", ["mentor", "alumno"]),
    admin.from("student_mentors").select("student_id,mentor_id"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (profilesResult.error || assignmentsResult.error || usersResult.error) {
    return NextResponse.json({ error: "No se pudieron cargar los mentores y alumnos." }, { status: 500 });
  }
  const mentors = (profilesResult.data ?? []).filter((p) => p.role === "mentor");
  const students = (profilesResult.data ?? []).filter((p) => p.role === "alumno");
  const emailById = new Map(usersResult.data.users.map((u) => [u.id, (u.email ?? "").toLowerCase()]));
  const mentorOf = new Map((assignmentsResult.data ?? []).map((a) => [a.student_id, a.mentor_id]));

  const findMentor = (name: string, email: string) => {
    if (email) {
      const byEmail = mentors.filter((m) => emailById.get(m.id) === email);
      if (byEmail.length === 1) return byEmail[0].id;
    }
    const byName = matchByName(name, mentors);
    return byName.length === 1 ? byName[0].id : null;
  };
  const findStudent = (name: string, mentorId: string | null) => {
    const byName = matchByName(name, students);
    if (byName.length === 1) return byName[0].id;
    const ofMentor = byName.filter((s) => mentorId && mentorOf.get(s.id) === mentorId);
    return ofMentor.length === 1 ? ofMentor[0].id : null;
  };

  const records: Database["public"]["Tables"]["kiru_session_logs"]["Insert"][] = [];
  let skipped = 0;
  for (const raw of body.rows as unknown[]) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { skipped++; continue; }
    const row = raw as SheetRow;
    const answers: SessionAnswer[] = [];
    let stamp = "", email = "", mentorName = "", studentName = "", sessionDay = "", incident = "";
    for (const [question, value] of Object.entries(row)) {
      const q = question.replace(/\s+/g, " ").trim();
      const key = normalizeName(q);
      const a = text(value).slice(0, MAX_ANSWER);
      if (key === "marca temporal") stamp = a;
      else if (key.startsWith("direccion de correo")) email = a.toLowerCase();
      else if (key === "mentor") mentorName = a;
      else if (key === "alumno") studentName = a;
      else if (key.startsWith("fecha de la sesion")) sessionDay = a;
      else if (key.startsWith("incidencia")) incident = a;
      // El estado de pago al mentor es cosa de administración: no se copia.
      else if (!key.includes("pago") && a) answers.push({ q: q.slice(0, 300), a });
    }
    const submitted = parseDate(stamp);
    if (!submitted || (!mentorName && !studentName)) { skipped++; continue; }
    const mentorId = findMentor(mentorName, email);
    records.push({
      source_key: `${submitted.iso}|${normalizeName(mentorName)}|${normalizeName(studentName)}`.slice(0, 400),
      submitted_at: submitted.iso,
      session_date: parseDate(sessionDay)?.day ?? null,
      mentor_name: mentorName.slice(0, 160),
      student_name: studentName.slice(0, 160),
      respondent_email: email ? email.slice(0, 320) : null,
      mentor_id: mentorId,
      student_id: findStudent(studentName, mentorId),
      incident,
      answers,
    });
  }

  // La misma fila puede venir dos veces en un envío; se queda la última.
  const unique = [...new Map(records.map((r) => [r.source_key, r])).values()];
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await admin.from("kiru_session_logs").upsert(unique.slice(i, i + 500), { onConflict: "source_key" });
    if (error) return NextResponse.json({ error: "No se pudieron guardar los registros." }, { status: 500 });
  }

  const unmatched = unique.filter((r) => !r.mentor_id || !r.student_id).map((r) => `${r.mentor_name} / ${r.student_name}`);
  return NextResponse.json({ ok: true, saved: unique.length, skipped, unmatched: [...new Set(unmatched)] });
}
