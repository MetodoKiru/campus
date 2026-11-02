import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";
import { requireGrowthAccess, text, toAvailability } from "@/lib/server/growth";
import { DAY_SLOTS, WEEK_DAYS, type MentorMeeting, type MentorMeetingsData } from "@/lib/growth";

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
    admin.from("kiru_mentor_availability").select("days,slots,notes,updated_at").eq("mentor_id", user.id).maybeSingle(),
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
  if (coordinatorId) {
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

  const data: MentorMeetingsData = { coordinatorName, mandatory, availability: toAvailability(availabilityResult.data), meetings };
  return NextResponse.json(data);
}

const DAY_IDS = new Set<string>(WEEK_DAYS.map((d) => d.id));
const SLOT_IDS = new Set<string>(DAY_SLOTS.map((s) => s.id));

/** El mentor guarda o cambia sus preferencias cuando quiera. */
export async function PUT(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const blocked = await requireGrowthAccess(admin, user.id);
  if (blocked) return blocked;

  let body: { days?: unknown; slots?: unknown; notes?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const days = Array.isArray(body.days) ? [...new Set(body.days.filter((d): d is string => typeof d === "string" && DAY_IDS.has(d)))] : [];
  const slots = Array.isArray(body.slots) ? [...new Set(body.slots.filter((s): s is string => typeof s === "string" && SLOT_IDS.has(s)))] : [];
  if (!days.length || !slots.length) return NextResponse.json({ error: "Marca al menos un día y una franja." }, { status: 400 });

  const { error } = await admin.from("kiru_mentor_availability").upsert({ mentor_id: user.id, days, slots, notes: text(body.notes, 500) });
  if (error) return NextResponse.json({ error: "No se pudo guardar tu disponibilidad." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
