import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";
import { sharedSecretStatus } from "@/lib/server/shared-secret";
import { matchByName, normalizeName } from "@/lib/session-logs";

export const runtime = "nodejs";

const MAX_ROWS = 2000;
type SheetRow = Record<string, unknown>;

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** «2026-10-19», «2026-10-19T00:00:00+02:00» o «19/10/2026» → «2026-10-19». */
function parseDay(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const local = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

/** 45, «45», «45,00 €», «1.234,50 €» o «45.5» → céntimos. Vacío → null. */
function parseCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  let raw = text(value).replace(/[€\s]/g, "");
  if (!raw) return null;
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Busca la columna por el principio de su cabecera (sin tildes ni mayúsculas). */
function pick(row: SheetRow, start: string): unknown {
  const wanted = normalizeName(start);
  for (const [key, value] of Object.entries(row)) if (normalizeName(key).startsWith(wanted)) return value;
  return undefined;
}

/**
 * Recibe la pestaña «Pagos» de la hoja «Registro de sesión (respuestas)» desde
 * su Apps Script (misma clave KIRU_REGISTROS_SECRET que los registros) y la
 * guarda tal cual en kiru_mentor_payouts para que cada mentor vea sus pagos.
 * La hoja manda: aquí no se calcula ningún importe. La columna «Notas» no se
 * copia (es interna). Cada cambio queda en el historial de la base.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_REGISTROS_SECRET);
  if (!url || !service || secret === "missing") {
    return NextResponse.json({ error: "La copia de pagos no está configurada." }, { status: 503 });
  }
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: { rows?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  if (!Array.isArray(body.rows) || body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Envía entre 0 y ${MAX_ROWS} filas.` }, { status: 400 });
  }

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profiles, error } = await admin.from("profiles").select("id,full_name,role")
    .in("role", ["mentor", "admin", "coordinador", "formador", "alumno"]);
  if (error) return NextResponse.json({ error: "No se pudieron cargar los mentores y alumnos." }, { status: 500 });
  const mentors = (profiles ?? []).filter((p) => p.role !== "alumno");
  const students = (profiles ?? []).filter((p) => p.role === "alumno");
  const one = (list: { id: string }[]) => (list.length === 1 ? list[0].id : null);
  // Primero entre mentores; si el nombre solo existe en el equipo (p. ej. Dirección que sustituye), también vale.
  const findMentor = (name: string) => one(matchByName(name, mentors.filter((m) => m.role === "mentor"))) ?? one(matchByName(name, mentors));

  const rows: Json[] = [];
  const unmatched = new Set<string>();
  let skipped = 0;
  for (const [index, raw] of (body.rows as unknown[]).entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { skipped++; continue; }
    const row = raw as SheetRow;
    const mentorName = text(pick(row, "Mentor"));
    const studentName = text(pick(row, "Alumno"));
    const start = parseDay(pick(row, "Desde"));
    const end = parseDay(pick(row, "Hasta"));
    if (!mentorName || !studentName || !start || !end || end <= start) { skipped++; continue; }
    const mentorId = findMentor(mentorName);
    const studentId = one(matchByName(studentName, students));
    if (!mentorId) unmatched.add(mentorName);
    if (!studentId) unmatched.add(studentName);
    const sessions = Number(text(pick(row, "Sesiones registradas")).replace(",", "."));
    rows.push({
      key: `${normalizeName(mentorName)}|${normalizeName(studentName)}|${start}`,
      row: Number(text(pick(row, "_fila"))) || index + 2,
      mentor_name: mentorName.slice(0, 120),
      student_name: studentName.slice(0, 120),
      mentor_id: mentorId,
      student_id: studentId,
      start,
      end,
      status: text(pick(row, "Estado")).slice(0, 60),
      sessions: Number.isFinite(sessions) ? Math.max(0, Math.round(sessions)) : 0,
      extra_cents: parseCents(pick(row, "Extra equipo")) ?? 0,
      // «Importe (€)» ya incluye el «Importe acordado» cuando lo hay: es la cifra que se paga.
      amount_cents: parseCents(pick(row, "Importe (")) ?? 0,
      paid_on: parseDay(pick(row, "Fecha de pago")),
    });
  }

  const { data, error: syncError } = await admin.rpc("kiru_mentor_payouts_sync", { p_rows: rows });
  if (syncError) return NextResponse.json({ error: "No se pudieron guardar los pagos." }, { status: 500 });
  const result = (data ?? {}) as { saved?: number; removed?: number };
  return NextResponse.json({ ok: true, saved: result.saved ?? 0, removed: result.removed ?? 0, skipped, unmatched: [...unmatched] });
}
