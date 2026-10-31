import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";
import type { OfferEvent, StaffOffer } from "@/lib/assignment-offers";

export const runtime = "nodejs";

/**
 * Propuestas de alumno para administración (todas) y coordinación (solo las de
 * sus mentores), con su historial. Lo lee el panel «Propuestas».
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["admin", "coordinador"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;

  let mentorFilter: string[] | null = null;
  if (role === "coordinador") {
    const { data, error } = await admin.from("kiru_coordinator_mentors").select("mentor_id").eq("coordinator_id", user.id);
    if (error) return NextResponse.json({ error: "No se pudieron cargar tus mentores." }, { status: 500 });
    mentorFilter = (data ?? []).map((r) => r.mentor_id);
    if (!mentorFilter.length) return NextResponse.json({ offers: [], events: [] });
  }

  let query = admin
    .from("kiru_assignment_offers")
    .select("id,offer_code,student_label,mentor_id,mentor_name,mentor_email,mentor_phone,course,student_profile,zone,intensity,slots,sent_at,response,response_detail,responded_at,response_source,reminder_sent_at,call_requested_at,call_done_at,call_notes,decision,decision_note,decided_at,closed_at")
    .order("sent_at", { ascending: false })
    .limit(500);
  if (mentorFilter) query = query.in("mentor_id", mentorFilter);
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: "No se pudieron cargar las propuestas." }, { status: 500 });

  // Nombre y teléfono del mentor en el campus, si el script no los mandó.
  const mentorIds = [...new Set((rows ?? []).map((r) => r.mentor_id).filter((v): v is string => Boolean(v)))];
  const [profilesResult, onboardingResult] = mentorIds.length
    ? await Promise.all([
        admin.from("profiles").select("id,full_name").in("id", mentorIds),
        admin.from("kiru_mentor_onboarding").select("profile_id,phone").in("profile_id", mentorIds),
      ])
    : [{ data: [] as { id: string; full_name: string }[] }, { data: [] as { profile_id: string | null; phone: string | null }[] }];
  const nameById = new Map((profilesResult.data ?? []).map((p) => [p.id, p.full_name]));
  const phoneById = new Map((onboardingResult.data ?? []).map((o) => [o.profile_id, o.phone ?? ""]));

  const offers: StaffOffer[] = (rows ?? []).map((r) => ({
    id: r.id,
    code: r.offer_code,
    studentLabel: r.student_label,
    mentorId: r.mentor_id,
    mentorName: r.mentor_name || (r.mentor_id ? nameById.get(r.mentor_id) ?? "" : ""),
    mentorEmail: r.mentor_email,
    mentorPhone: r.mentor_phone || (r.mentor_id ? phoneById.get(r.mentor_id) ?? "" : ""),
    course: r.course,
    studentProfile: r.student_profile,
    zone: r.zone,
    intensity: r.intensity,
    slots: r.slots,
    sentAt: r.sent_at,
    response: r.response,
    responseDetail: r.response_detail,
    respondedAt: r.responded_at,
    responseSource: r.response_source,
    reminderSentAt: r.reminder_sent_at,
    callRequestedAt: r.call_requested_at,
    callDoneAt: r.call_done_at,
    callNotes: r.call_notes,
    decision: r.decision,
    decisionNote: r.decision_note,
    decidedAt: r.decided_at,
    closedAt: r.closed_at,
  }));

  const ids = offers.map((o) => o.id);
  let events: OfferEvent[] = [];
  if (ids.length) {
    const { data: eventRows } = await admin
      .from("kiru_assignment_offer_events")
      .select("offer_id,action,detail,actor_id,created_at")
      .in("offer_id", ids)
      .order("created_at", { ascending: false })
      .limit(2000);
    const actorIds = [...new Set((eventRows ?? []).map((e) => e.actor_id).filter((v): v is string => Boolean(v)))];
    const { data: actors } = actorIds.length ? await admin.from("profiles").select("id,full_name").in("id", actorIds) : { data: [] };
    const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name]));
    events = (eventRows ?? []).map((e) => ({
      offerId: e.offer_id,
      action: e.action,
      detail: e.detail,
      actorName: e.actor_id ? actorName.get(e.actor_id) ?? "" : "Apps Script",
      createdAt: e.created_at,
    }));
  }

  return NextResponse.json({ offers, events });
}
