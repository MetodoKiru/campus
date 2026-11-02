import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";
import { isOpportunityOpen, type AdminOpportunity, type OpportunityArea } from "@/lib/growth";
import { readOpportunityFields } from "./fields";

export const runtime = "nodejs";

const COLUMNS = "id,title,area,description,functions,requirements,dedication,modality,remuneration,remuneration_authorized,deadline,status,published_at,closed_at,updated_at";

/** Administración: todas las oportunidades, candidaturas y recomendaciones. */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const [opportunities, applications, recommendations] = await Promise.all([
    admin.from("kiru_opportunities").select(COLUMNS).order("created_at", { ascending: false }),
    admin.from("kiru_opportunity_applications").select("id,opportunity_id,mentor_id,motivation,status,submitted_at,status_changed_at").order("submitted_at", { ascending: false }),
    admin.from("kiru_opportunity_recommendations").select("id,opportunity_id,mentor_id,coordinator_id,note,created_at").order("created_at", { ascending: false }),
  ]);
  if (opportunities.error || applications.error || recommendations.error) return NextResponse.json({ error: "No se pudieron cargar las oportunidades." }, { status: 500 });

  const people = [...new Set([
    ...(applications.data ?? []).map((a) => a.mentor_id),
    ...(recommendations.data ?? []).flatMap((r) => [r.mentor_id, r.coordinator_id]),
  ])];
  const { data: profiles } = people.length ? await admin.from("profiles").select("id,full_name").in("id", people) : { data: [] as { id: string; full_name: string }[] };
  const name = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return NextResponse.json({
    opportunities: (opportunities.data ?? []).map((o): AdminOpportunity => ({
      id: o.id, title: o.title, area: o.area as OpportunityArea, description: o.description, functions: o.functions,
      requirements: o.requirements, dedication: o.dedication, modality: o.modality, remuneration: o.remuneration,
      remunerationAuthorized: o.remuneration_authorized, deadline: o.deadline, status: o.status,
      open: isOpportunityOpen(o.status, o.deadline), publishedAt: o.published_at, closedAt: o.closed_at, updatedAt: o.updated_at,
    })),
    applications: (applications.data ?? []).map((a) => ({
      id: a.id, opportunityId: a.opportunity_id, mentorId: a.mentor_id, mentorName: name.get(a.mentor_id) ?? "",
      motivation: a.motivation, status: a.status, submittedAt: a.submitted_at, statusChangedAt: a.status_changed_at,
    })),
    recommendations: (recommendations.data ?? []).map((r) => ({
      id: r.id, opportunityId: r.opportunity_id, mentorName: name.get(r.mentor_id) ?? "", coordinatorName: name.get(r.coordinator_id) ?? "",
      note: r.note, createdAt: r.created_at,
    })),
  });
}

/** Nueva oportunidad: nace como borrador (no la ve nadie) o publicada. */
export async function POST(request: Request) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const fields = readOpportunityFields(body);
  if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });
  const publish = body.publish === true;
  if (publish && fields.deadline && !isOpportunityOpen("publicada", fields.deadline)) {
    return NextResponse.json({ error: "La fecha límite ya ha pasado." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("kiru_opportunities").insert({
    ...fields,
    status: publish ? "publicada" : "borrador",
    published_at: publish ? now : null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return NextResponse.json({ error: "No se pudo guardar la oportunidad." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
