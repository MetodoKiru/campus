import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";
import { AVAILABILITY_COLUMNS, coordinatorGroups, madridLocalToIso, text, toAvailability, validZoomUrl } from "@/lib/server/growth";
import { MEETING_DURATION_MINUTES, type CoordinatorMeetingsData, type StaffMeeting } from "@/lib/growth";

export const runtime = "nodejs";

/**
 * Reuniones de coordinación para el panel del coordinador: SU grupo (mentores,
 * si tienen alumnos activos, disponibilidad y correos para la convocatoria) y
 * sus reuniones. Administración lo ve todo, en solo lectura.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;

  const groups = await coordinatorGroups(admin, role, user.id);
  if (!groups) return NextResponse.json({ error: "No se pudo cargar tu grupo." }, { status: 500 });
  const coordinatorIds = [...groups.keys()];
  const mentorIds = [...groups.values()].flat();

  let meetingsQuery = admin.from("kiru_coordination_meetings")
    .select("id,coordinator_id,scheduled_at,duration_minutes,zoom_url,status,agenda,cancel_reason,report_sent_at,held_at")
    .order("scheduled_at", { ascending: false })
    .limit(200);
  if (role !== "admin") meetingsQuery = meetingsQuery.eq("coordinator_id", user.id);

  let requestsQuery = admin.from("kiru_availability_requests").select("id,coordinator_id,message,deadline,created_at").order("created_at", { ascending: false }).limit(100);
  if (role !== "admin") requestsQuery = requestsQuery.eq("coordinator_id", user.id);

  const [profiles, availability, assignments, meetings, requests] = await Promise.all([
    coordinatorIds.length + mentorIds.length
      ? admin.from("profiles").select("id,full_name,is_active").in("id", [...coordinatorIds, ...mentorIds])
      : Promise.resolve({ data: [], error: null }),
    admin.from("kiru_mentor_availability").select(AVAILABILITY_COLUMNS).in("mentor_id", [...coordinatorIds, ...mentorIds, user.id]),
    mentorIds.length ? admin.from("student_mentors").select("student_id,mentor_id").in("mentor_id", mentorIds) : Promise.resolve({ data: [], error: null }),
    meetingsQuery,
    requestsQuery,
  ]);
  if (profiles.error || availability.error || assignments.error || meetings.error || requests.error) {
    return NextResponse.json({ error: "No se pudieron cargar las reuniones." }, { status: 500 });
  }

  const studentIds = [...new Set((assignments.data ?? []).map((a) => a.student_id))];
  const activeStudents = new Set<string>();
  if (studentIds.length) {
    const { data } = await admin.from("profiles").select("id").in("id", studentIds).eq("is_active", true);
    for (const s of data ?? []) activeStudents.add(s.id);
  }
  const mentorsWithStudents = new Set((assignments.data ?? []).filter((a) => activeStudents.has(a.student_id)).map((a) => a.mentor_id));
  const nameById = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  const activeMentor = new Set((profiles.data ?? []).filter((p) => p.is_active).map((p) => p.id));
  const availabilityById = new Map((availability.data ?? []).map((a) => [a.mentor_id, a]));

  // Respuestas a las peticiones y grabaciones (estas solo para su coordinador o admin).
  const requestIds = (requests.data ?? []).map((r) => r.id);
  const meetingIds = (meetings.data ?? []).map((m) => m.id);
  const [responses, privates] = await Promise.all([
    requestIds.length ? admin.from("kiru_availability_responses").select("request_id,mentor_id,responded_at").in("request_id", requestIds) : Promise.resolve({ data: [], error: null }),
    meetingIds.length ? admin.from("kiru_coordination_meeting_private").select("meeting_id,recording_url,recording_registered_at").in("meeting_id", meetingIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const responsesByMentor = new Map<string, Record<string, string>>();
  for (const r of responses.data ?? []) {
    const entry = responsesByMentor.get(r.mentor_id) ?? {};
    entry[r.request_id] = r.responded_at;
    responsesByMentor.set(r.mentor_id, entry);
  }
  const privateById = new Map((privates.data ?? []).map((p) => [p.meeting_id, p]));

  // Correos del grupo para preparar la convocatoria (los envía el coordinador).
  const emailById = new Map<string, string>();
  await Promise.all(mentorIds.filter((id) => activeMentor.has(id)).map(async (id) => {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user?.email) emailById.set(id, data.user.email);
  }));

  const data: CoordinatorMeetingsData = {
    canEdit: role === "coordinador",
    coordinators: coordinatorIds.map((coordinatorId) => {
      const ids = (groups.get(coordinatorId) ?? []).filter((id) => activeMentor.has(id));
      return {
        id: coordinatorId,
        name: nameById.get(coordinatorId) ?? "",
        mentors: ids
          .map((id) => ({
            id, name: nameById.get(id) ?? "", hasStudents: mentorsWithStudents.has(id),
            availability: availabilityById.has(id) ? toAvailability(availabilityById.get(id)) : null,
            responses: responsesByMentor.get(id) ?? {},
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "es")),
        emails: ids.map((id) => emailById.get(id)).filter((e): e is string => Boolean(e)),
        availability: availabilityById.has(coordinatorId) ? toAvailability(availabilityById.get(coordinatorId)) : null,
        requests: (requests.data ?? []).filter((r) => r.coordinator_id === coordinatorId)
          .map((r) => ({ id: r.id, message: r.message, deadline: r.deadline, createdAt: r.created_at })),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "es")),
    meetings: (meetings.data ?? []).map((m): StaffMeeting => ({
      id: m.id,
      coordinatorId: m.coordinator_id,
      coordinatorName: nameById.get(m.coordinator_id) ?? "",
      scheduledAt: m.scheduled_at,
      durationMinutes: m.duration_minutes,
      zoomUrl: m.zoom_url,
      status: m.status,
      agenda: m.agenda,
      cancelReason: m.cancel_reason,
      reportSentAt: m.report_sent_at,
      heldAt: m.held_at,
      recordingUrl: privateById.get(m.id)?.recording_url ?? "",
      recordingRegisteredAt: privateById.get(m.id)?.recording_registered_at ?? null,
    })),
  };
  return NextResponse.json(data);
}

/**
 * El coordinador fija la reunión del mes: fecha y hora elegidas por él, enlace
 * de Zoom y temas. Puede guardarla sin convocar o convocarla ya. Nada se
 * programa solo.
 */
export async function POST(request: Request) {
  const auth = await requireStaff(request, ["coordinador"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: { scheduledAt?: unknown; zoomUrl?: unknown; agenda?: unknown; confirm?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const scheduledAt = typeof body.scheduledAt === "string" ? madridLocalToIso(body.scheduledAt) : null;
  if (!scheduledAt) return NextResponse.json({ error: "Elige la fecha y la hora." }, { status: 400 });
  if (!/T\d{2}:(00|30)$/.test(String(body.scheduledAt))) return NextResponse.json({ error: "La reunión tiene que empezar en punto o y media." }, { status: 400 });
  if (new Date(scheduledAt).getTime() < Date.now()) return NextResponse.json({ error: "La fecha ya ha pasado." }, { status: 400 });
  const zoomUrl = validZoomUrl(body.zoomUrl);
  if (zoomUrl === null) return NextResponse.json({ error: "El enlace de Zoom no es válido (tiene que empezar por https:// y ser de zoom.us)." }, { status: 400 });
  const confirm = body.confirm === true;
  if (confirm && !zoomUrl) return NextResponse.json({ error: "Para convocar la reunión hace falta el enlace de Zoom." }, { status: 400 });

  const { error } = await admin.from("kiru_coordination_meetings").insert({
    coordinator_id: user.id,
    scheduled_at: scheduledAt,
    duration_minutes: MEETING_DURATION_MINUTES,
    zoom_url: zoomUrl,
    agenda: text(body.agenda, 1000),
    status: confirm ? "confirmada" : "borrador",
    confirmed_at: confirm ? new Date().toISOString() : null,
    created_by: user.id,
  });
  if (error?.code === "23505") return NextResponse.json({ error: "Ya tienes una reunión ese mes. Cámbiala o cancélala antes de crear otra." }, { status: 409 });
  if (error) return NextResponse.json({ error: "No se pudo guardar la reunión." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
