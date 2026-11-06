import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";
import { AVAILABILITY_COLUMNS, cleanCells, requireGrowthAccess, saveAvailability, text, toAvailability } from "@/lib/server/growth";
import type { MentorMeeting, MentorMeetingsData } from "@/lib/growth";

export const runtime = "nodejs";

/**
 * «Reuniones con tu coordinador»: la disponibilidad del mentor y las reuniones
 * convocadas de SU grupo (nunca borradores ni reuniones de otros grupos).
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const blocked = await requireGrowthAccess(admin, user.id);
  if (blocked) return blocked;

  const [linkResult, availabilityResult, studentsResult] = await Promise.all([
    admin.from("kiru_coordinator_mentors").select("coordinator_id").eq("mentor_id", user.id).maybeSingle(),
    admin.from("kiru_mentor_availability").select(AVAILABILITY_COLUMNS).eq("mentor_id", user.id).maybeSingle(),
    admin.from("student_mentors").select("student_id").eq("mentor_id", user.id),
  ]);
  if (linkResult.error || availabilityResult.error || studentsResult.error) {
    return NextResponse.json({ error: "No se pudieron cargar tus reuniones." }, { status: 500 });
  }

  // Alumnos activos = asignados y con la cuenta activa.
  const studentIds = (studentsResult.data ?? []).map((s) => s.student_id);
  let mandatory = false;
  if (studentIds.length) {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).in("id", studentIds).eq("is_active", true);
    mandatory = (count ?? 0) > 0;
  }

  const coordinatorId = linkResult.data?.coordinator_id ?? null;
  let coordinatorName: string | null = null;
  let meetings: MentorMeeting[] = [];
  let availabilityRequest: MentorMeetingsData["request"] = null;
  if (coordinatorId) {
    const { data: latest } = await admin.from("kiru_availability_requests")
      .select("id,message,deadline,created_at").eq("coordinator_id", coordinatorId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest) {
      const { data: response } = await admin.from("kiru_availability_responses")
        .select("responded_at").eq("request_id", latest.id).eq("mentor_id", user.id).maybeSingle();
      availabilityRequest = { id: latest.id, message: latest.message, deadline: latest.deadline, createdAt: latest.created_at, respondedAt: response?.responded_at ?? null };
    }
    const [coordinator, rows] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", coordinatorId).maybeSingle(),
      admin.from("kiru_coordination_meetings")
        .select("id,scheduled_at,duration_minutes,zoom_url,status,agenda,cancel_reason")
        .eq("coordinator_id", coordinatorId)
        .neq("status", "borrador")
        .order("scheduled_at", { ascending: false })
        .limit(12),
    ]);
    if (rows.error) return NextResponse.json({ error: "No se pudieron cargar tus reuniones." }, { status: 500 });
    coordinatorName = coordinator.data?.full_name ?? null;
    meetings = (rows.data ?? []).map((m) => ({
      id: m.id,
      scheduledAt: m.scheduled_at,
      durationMinutes: m.duration_minutes,
      coordinatorName: coordinatorName ?? "",
      // El enlace solo hace falta mientras la reunión está convocada.
      zoomUrl: m.status === "confirmada" ? m.zoom_url : "",
      status: m.status as MentorMeeting["status"],
      agenda: m.agenda,
      cancelReason: m.status === "cancelada" ? m.cancel_reason : "",
    }));
  }

  const data: MentorMeetingsData = { coordinatorName, mandatory, availability: toAvailability(availabilityResult.data), request: availabilityRequest, meetings };
  return NextResponse.json(data);
}

/** El mentor guarda o cambia su cuadrícula de 30 minutos cuando quiera. */
export async function PUT(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const blocked = await requireGrowthAccess(admin, user.id);
  if (blocked) return blocked;

  let body: { cells?: unknown; notes?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const cells = cleanCells(body.cells);
  if (!cells.length) return NextResponse.json({ error: "Marca al menos una casilla en la que puedas asistir." }, { status: 400 });

  const { data: link } = await admin.from("kiru_coordinator_mentors").select("coordinator_id").eq("mentor_id", user.id).maybeSingle();
  const saved = await saveAvailability(admin, user.id, cells, text(body.notes, 500), link?.coordinator_id ?? null);
  if (!saved.ok) return NextResponse.json({ error: "No se pudo guardar tu disponibilidad." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
