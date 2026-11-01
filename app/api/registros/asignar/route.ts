import { NextResponse } from "next/server";
import { requireStaff, UUID_RE } from "@/lib/server/require-staff";

export const runtime = "nodejs";

type Body = { logId?: unknown; action?: unknown; mentorId?: unknown; studentId?: unknown };

/**
 * Administración adjudica a mano un registro de sesión desde «Sin asignar»:
 * - asignar: elige mentor y alumno (la importación ya no los cambia).
 * - archivar: no se enlaza con nadie y deja de salir en «Sin asignar» (p. ej. un mentor que ya no está).
 * - automatico: vuelve a dejar que la importación lo enlace por nombre o correo.
 * Después recalcula las SkillCoins del alumno de antes y del de ahora.
 */
export async function POST(request: Request) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const logId = typeof body.logId === "string" ? body.logId : "";
  const action = body.action;
  const mentorId = typeof body.mentorId === "string" && body.mentorId ? body.mentorId : null;
  const studentId = typeof body.studentId === "string" && body.studentId ? body.studentId : null;
  if (!UUID_RE.test(logId) || !["asignar", "archivar", "automatico"].includes(action as string)) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  if ((mentorId && !UUID_RE.test(mentorId)) || (studentId && !UUID_RE.test(studentId))) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }

  const { data: log, error: logError } = await admin.from("kiru_session_logs").select("id,mentor_id,student_id").eq("id", logId).maybeSingle();
  if (logError) return NextResponse.json({ error: "No se pudo cargar el registro." }, { status: 500 });
  if (!log) return NextResponse.json({ error: "Ese registro ya no existe." }, { status: 404 });

  let update: { mentor_id?: string | null; student_id?: string | null; manual_status: "asignado" | "archivado" | null; manual_by: string | null; manual_at: string | null };
  if (action === "asignar") {
    if (!mentorId || !studentId) return NextResponse.json({ error: "Elige el mentor y el alumno." }, { status: 400 });
    const { data: found, error } = await admin.from("profiles").select("id,role").in("id", [mentorId, studentId]);
    if (error) return NextResponse.json({ error: "No se pudieron comprobar las cuentas." }, { status: 500 });
    const roleOf = new Map((found ?? []).map((p) => [p.id, p.role]));
    if (roleOf.get(mentorId) !== "mentor") return NextResponse.json({ error: "La cuenta elegida como mentor no es de mentor." }, { status: 400 });
    if (roleOf.get(studentId) !== "alumno") return NextResponse.json({ error: "La cuenta elegida como alumno no es de alumno." }, { status: 400 });
    update = { mentor_id: mentorId, student_id: studentId, manual_status: "asignado", manual_by: user.id, manual_at: new Date().toISOString() };
  } else if (action === "archivar") {
    update = { manual_status: "archivado", manual_by: user.id, manual_at: new Date().toISOString() };
  } else {
    update = { manual_status: null, manual_by: null, manual_at: null };
  }

  const { error: saveError } = await admin.from("kiru_session_logs").update(update).eq("id", logId);
  if (saveError) return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 500 });

  const touched = [...new Set([log.student_id, update.student_id].filter((id): id is string => !!id))];
  for (const id of touched) {
    const { error } = await admin.rpc("kiru_skillcoin_refresh", { p_student: id });
    if (error) return NextResponse.json({ error: "Guardado, pero no se pudieron recalcular las SkillCoins." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
