import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";
import { text, toOpportunity } from "@/lib/server/growth";

export const runtime = "nodejs";

const OPPORTUNITY_COLUMNS = "id,title,area,description,functions,requirements,dedication,modality,remuneration,remuneration_authorized,deadline,status,published_at,closed_at,created_by,updated_by,created_at,updated_at";

/**
 * El coordinador ve las oportunidades publicadas y puede recomendar a mentores
 * de SU grupo. No publica oportunidades ni ve ni decide candidaturas.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["coordinador"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  const [opportunities, links, recommendations] = await Promise.all([
    admin.from("kiru_opportunities").select(OPPORTUNITY_COLUMNS).eq("status", "publicada").order("published_at", { ascending: false }),
    admin.from("kiru_coordinator_mentors").select("mentor_id").eq("coordinator_id", user.id),
    admin.from("kiru_opportunity_recommendations").select("id,opportunity_id,mentor_id,note,created_at").eq("coordinator_id", user.id).order("created_at", { ascending: false }),
  ]);
  if (opportunities.error || links.error || recommendations.error) return NextResponse.json({ error: "No se pudieron cargar las oportunidades." }, { status: 500 });

  const mentorIds = (links.data ?? []).map((l) => l.mentor_id);
  const { data: mentors } = mentorIds.length
    ? await admin.from("profiles").select("id,full_name").in("id", mentorIds).eq("is_active", true).order("full_name")
    : { data: [] as { id: string; full_name: string }[] };

  return NextResponse.json({
    opportunities: (opportunities.data ?? []).map(toOpportunity),
    mentors: (mentors ?? []).map((m) => ({ id: m.id, name: m.full_name })),
    recommendations: (recommendations.data ?? []).map((r) => ({ id: r.id, opportunityId: r.opportunity_id, mentorId: r.mentor_id, note: r.note, createdAt: r.created_at })),
  });
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, ["coordinador"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: { opportunityId?: unknown; mentorId?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const opportunityId = typeof body.opportunityId === "string" && UUID_RE.test(body.opportunityId) ? body.opportunityId : null;
  const mentorId = typeof body.mentorId === "string" && UUID_RE.test(body.mentorId) ? body.mentorId : null;
  const note = text(body.note, 1000);
  if (!opportunityId || !mentorId) return NextResponse.json({ error: "Elige la oportunidad y el mentor." }, { status: 400 });
  if (note.length < 3) return NextResponse.json({ error: "Escribe por qué lo recomiendas." }, { status: 400 });

  const { data: link } = await admin.from("kiru_coordinator_mentors").select("mentor_id").eq("mentor_id", mentorId).eq("coordinator_id", user.id).maybeSingle();
  if (!link) return NextResponse.json({ error: "Solo puedes recomendar a mentores de tu grupo." }, { status: 403 });

  const { error } = await admin.from("kiru_opportunity_recommendations").insert({ opportunity_id: opportunityId, mentor_id: mentorId, coordinator_id: user.id, note });
  if (error?.code === "23505") return NextResponse.json({ error: "Ya recomendaste a este mentor para esta oportunidad." }, { status: 409 });
  if (error?.code === "23514") return NextResponse.json({ error: "Esta oportunidad ya no está publicada." }, { status: 409 });
  if (error) return NextResponse.json({ error: "No se pudo guardar la recomendación." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
