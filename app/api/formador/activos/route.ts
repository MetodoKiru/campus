import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";

export const runtime = "nodejs";
const STAFF = ["formador", "admin"] as const;

/**
 * Mentores activos para supervisión del formador: pasos de incorporación,
 * certificado, número de alumnos, especialidades validadas y última respuesta a una oferta
 * (la mejor señal de disponibilidad para nuevas asignaciones).
 * Permisos mínimos: no devuelve nombres de alumnos, familias ni datos académicos,
 * solo cuántos alumnos tiene cada mentor.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, STAFF);
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const { data: mentors, error } = await admin
    .from("profiles")
    .select("id,full_name,username,is_active")
    .eq("role", "mentor")
    .eq("is_active", true)
    .order("full_name");
  if (error) return NextResponse.json({ error: "No se pudieron cargar los mentores." }, { status: 500 });

  const ids = (mentors ?? []).map((m) => m.id);
  if (!ids.length) return NextResponse.json({ mentors: [] });

  const [assignments, steps, onboarding, offers, specialties, users] = await Promise.all([
    admin.from("student_mentors").select("mentor_id").in("mentor_id", ids),
    admin.from("kiru_mentor_steps").select("mentor_id,step,status").in("mentor_id", ids),
    admin.from("kiru_mentor_onboarding").select("profile_id,confidentiality_signed_at,certificate_checked_at").in("profile_id", ids),
    admin.from("kiru_assignment_offers").select("mentor_id,response,responded_at,sent_at").in("mentor_id", ids).order("sent_at", { ascending: false }),
    admin.from("kiru_mentor_specialties").select("email,specialties,hours"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (assignments.error || steps.error || onboarding.error || offers.error || specialties.error || users.error) {
    return NextResponse.json({ error: "No se pudo completar la información de los mentores." }, { status: 500 });
  }

  const count = new Map<string, number>();
  for (const a of assignments.data ?? []) count.set(a.mentor_id, (count.get(a.mentor_id) ?? 0) + 1);
  const stepsBy = new Map<string, Record<string, string>>();
  for (const s of steps.data ?? []) stepsBy.set(s.mentor_id, { ...(stepsBy.get(s.mentor_id) ?? {}), [s.step]: s.status });
  const onbBy = new Map((onboarding.data ?? []).filter((o) => o.profile_id).map((o) => [o.profile_id as string, o]));
  const lastOffer = new Map<string, { response: string | null; respondedAt: string | null; sentAt: string | null }>();
  for (const o of offers.data ?? []) {
    if (o.mentor_id && !lastOffer.has(o.mentor_id)) lastOffer.set(o.mentor_id, { response: o.response, respondedAt: o.responded_at, sentAt: o.sent_at });
  }

  const emailById = new Map(users.data.users.map((u) => [u.id, (u.email ?? "").toLowerCase()]));
  const specByEmail = new Map((specialties.data ?? []).map((s) => [s.email, s]));

  return NextResponse.json({
    mentors: (mentors ?? []).map((m) => {
      const onb = onbBy.get(m.id);
      const spec = specByEmail.get(emailById.get(m.id) ?? "");
      return {
        id: m.id,
        fullName: m.full_name,
        username: m.username,
        students: count.get(m.id) ?? 0,
        steps: stepsBy.get(m.id) ?? {},
        confidentialitySignedAt: onb?.confidentiality_signed_at ?? null,
        certificateCheckedAt: onb?.certificate_checked_at ?? null,
        lastOffer: lastOffer.get(m.id) ?? null,
        specialties: spec?.specialties ?? [],
        accreditedHours: spec ? Number(spec.hours) : null,
      };
    }),
  });
}
