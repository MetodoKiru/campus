import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

type Persona = { id: string; nombre: string; nombreCompleto: string };

/** Primer nombre («Paula Ybarra» → «Paula»), como se escribe en los formularios. Si dos coinciden, nombre completo. */
function nombresCortos(people: { id: string; full_name: string }[]): Persona[] {
  const first = (n: string) => n.trim().split(/\s+/)[0] ?? "";
  const count = new Map<string, number>();
  for (const p of people) count.set(first(p.full_name).toLowerCase(), (count.get(first(p.full_name).toLowerCase()) ?? 0) + 1);
  return people
    .map((p) => ({ id: p.id, nombreCompleto: p.full_name.trim(), nombre: (count.get(first(p.full_name).toLowerCase()) ?? 0) > 1 ? p.full_name.trim() : first(p.full_name) }))
    .filter((p) => p.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Listas de mentores y alumnos activos para los desplegables de los formularios.
 * La llama cada hora el Apps Script de «Registro de sesión» (clave KIRU_REGISTROS_SECRET).
 * Activo = alumno con servicio «activo» en el campus y al menos un horario semanal activo;
 * mentor = el de esos horarios. Las cuentas de prueba (sin horario) no salen.
 * No cambia nada: solo lee.
 */
export async function GET(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_REGISTROS_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "No está configurado." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  const { data: slots, error } = await admin.from("kiru_student_schedule_slots")
    .select("student_id,mentor_id,weekday,start_time,end_time").eq("is_active", true);
  if (error) return NextResponse.json({ error: "No se pudieron leer los horarios." }, { status: 500 });

  const studentIds = [...new Set((slots ?? []).map((s) => s.student_id))];
  const { data: students } = studentIds.length
    ? await admin.from("students").select("profile_id,service_status").in("profile_id", studentIds)
    : { data: [] };
  const activeStudents = new Set((students ?? []).filter((s) => s.service_status === "activo").map((s) => s.profile_id));
  const live = (slots ?? []).filter((s) => activeStudents.has(s.student_id) && s.mentor_id);

  const ids = [...new Set(live.flatMap((s) => [s.student_id, s.mentor_id as string]))];
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id,full_name,role,is_active").in("id", ids)
    : { data: [] };
  const byId = new Map((profiles ?? []).filter((p) => p.is_active && p.full_name?.trim()).map((p) => [p.id, p]));
  const ok = live.filter((s) => byId.get(s.student_id)?.role === "alumno" && byId.get(s.mentor_id as string)?.role === "mentor");

  const alumnos = nombresCortos([...new Set(ok.map((s) => s.student_id))].map((id) => ({ id, full_name: byId.get(id)!.full_name })));
  const mentores = nombresCortos([...new Set(ok.map((s) => s.mentor_id as string))].map((id) => ({ id, full_name: byId.get(id)!.full_name })));
  const corto = new Map([...alumnos, ...mentores].map((p) => [p.id, p.nombre]));
  const horarios = ok.map((s) => ({
    mentor: corto.get(s.mentor_id as string), alumno: corto.get(s.student_id),
    dia: s.weekday, inicio: String(s.start_time).slice(0, 5), fin: String(s.end_time).slice(0, 5),
  }));

  return NextResponse.json({ ok: true, mentores, alumnos, horarios });
}
