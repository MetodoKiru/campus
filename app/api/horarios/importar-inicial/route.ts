import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { sharedSecretStatus } from "@/lib/server/shared-secret";
import { matchByName, normalizeName } from "@/lib/session-logs";

export const runtime = "nodejs";

type SheetSlot = {
  mentor_name?: unknown;
  mentor_email?: unknown;
  student_name?: unknown;
  weekday?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  active?: unknown;
};

const DAY_BY_NAME: Record<string, number> = {
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7,
};
const clean = (v: unknown) => String(v ?? "").trim();
const validTime = (v: string) => /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v);
const isActive = (v: unknown) => ["true", "sí", "si", "activo", "1"].includes(clean(v).toLowerCase());

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_REGISTROS_SECRET);
  if (!url || !service || secret === "missing") return NextResponse.json({ error: "Importación no configurada." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: { rows?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  if (!Array.isArray(body.rows) || body.rows.length > 200) return NextResponse.json({ error: "La hoja debe incluir como máximo 200 filas." }, { status: 400 });

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const [profiles, links, users, existing] = await Promise.all([
    admin.from("profiles").select("id,full_name,role").in("role", ["mentor", "alumno"]),
    admin.from("student_mentors").select("student_id,mentor_id"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("kiru_student_schedule_slots").select("id").limit(1),
  ]);
  if (profiles.error || links.error || users.error || existing.error) return NextResponse.json({ error: "No se pudieron validar las relaciones." }, { status: 500 });
  if (existing.data?.length) return NextResponse.json({ error: "Ya hay horarios en el campus. La importación inicial solo se puede ejecutar una vez." }, { status: 409 });

  const mentors = (profiles.data ?? []).filter((p) => p.role === "mentor");
  const students = (profiles.data ?? []).filter((p) => p.role === "alumno");
  const emailById = new Map(users.data.users.map((u) => [u.id, (u.email ?? "").toLowerCase()]));
  const assignment = new Map((links.data ?? []).map((link) => [link.student_id, link.mentor_id]));
  const rows: Database["public"]["Tables"]["kiru_student_schedule_slots"]["Insert"][] = [];
  for (const raw of body.rows as unknown[]) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as SheetSlot;
    if (!isActive(row.active)) continue;
    const mentorName = clean(row.mentor_name), mentorEmail = clean(row.mentor_email).toLowerCase();
    const studentName = clean(row.student_name);
    const mentorMatches = mentorEmail
      ? mentors.filter((m) => emailById.get(m.id) === mentorEmail)
      : matchByName(mentorName, mentors);
    const mentor = mentorMatches.length === 1 ? mentorMatches[0] : null;
    if (!mentor) return NextResponse.json({ error: "Hay una fila activa cuyo mentor no se pudo identificar de forma única." }, { status: 422 });
    const studentMatches = matchByName(studentName, students).filter((s) => assignment.get(s.id) === mentor.id);
    const student = studentMatches.length === 1 ? studentMatches[0] : null;
    const weekday = DAY_BY_NAME[normalizeName(clean(row.weekday))];
    const start = clean(row.start_time), end = clean(row.end_time);
    if (!student || !weekday || !validTime(start) || !validTime(end) || start >= end) {
      return NextResponse.json({ error: "Hay una fila activa con alumno, día u horario no válido o sin relación mentor-alumno." }, { status: 422 });
    }
    rows.push({
      student_id: student.id, mentor_id: mentor.id, weekday,
      start_time: start.length === 5 ? `${start}:00` : start,
      end_time: end.length === 5 ? `${end}:00` : end,
      time_zone: "Europe/Madrid", source: "sheet_import", is_active: true,
    });
  }
  if (!rows.length) return NextResponse.json({ error: "No se encontraron horarios activos para importar." }, { status: 422 });
  const { error } = await admin.from("kiru_student_schedule_slots").insert(rows);
  if (error) {
    console.error("Falló la importación inicial de horarios.", error.code);
    return NextResponse.json({ error: "No se pudo guardar la importación. No se han publicado los horarios." }, { status: 500 });
  }
  return NextResponse.json({ imported: rows.length });
}
