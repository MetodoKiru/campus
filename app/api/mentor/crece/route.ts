import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";
import { requireGrowthAccess, text, toOpportunity } from "@/lib/server/growth";
import { isOpportunityOpen, type MentorApplication, type MentorGrowthData } from "@/lib/growth";

export const runtime = "nodejs";

const OPPORTUNITY_COLUMNS = "id,title,area,description,functions,requirements,dedication,modality,remuneration,remuneration_authorized,deadline,status,published_at,closed_at,created_by,updated_by,created_at,updated_at";

/**
 * «Crece con Kiru»: oportunidades publicadas por administración (nunca
 * borradores) y las candidaturas del propio mentor con su estado.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const blocked = await requireGrowthAccess(admin, user.id);
  if (blocked) return blocked;

  const applicationsResult = await admin
    .from("kiru_opportunity_applications")
    .select("id,opportunity_id,motivation,status,submitted_at,status_changed_at")
    .eq("mentor_id", user.id)
    .order("submitted_at", { ascending: false });
  if (applicationsResult.error) return NextResponse.json({ error: "No se pudieron cargar tus candidaturas." }, { status: 500 });
  const applied = (applicationsResult.data ?? []).map((a) => a.opportunity_id);

  // Publicadas, y además las ya cerradas a las que se presentó (para ver su estado).
  const [published, appliedClosed] = await Promise.all([
    admin.from("kiru_opportunities").select(OPPORTUNITY_COLUMNS).eq("status", "publicada").order("published_at", { ascending: false }),
    applied.length
      ? admin.from("kiru_opportunities").select(OPPORTUNITY_COLUMNS).in("id", applied).neq("status", "borrador")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (published.error || appliedClosed.error) return NextResponse.json({ error: "No se pudieron cargar las oportunidades." }, { status: 500 });

  const byId = new Map([...(published.data ?? []), ...(appliedClosed.data ?? [])].map((row) => [row.id, row]));
  const applications: MentorApplication[] = (applicationsResult.data ?? []).flatMap((a) => {
    const opportunity = byId.get(a.opportunity_id);
    return opportunity ? [{
      id: a.id,
      opportunityId: a.opportunity_id,
      opportunityTitle: opportunity.title,
      motivation: a.motivation,
      status: a.status,
      submittedAt: a.submitted_at,
      statusChangedAt: a.status_changed_at,
    }] : [];
  });

  const data: MentorGrowthData = {
    opportunities: (published.data ?? []).map(toOpportunity),
    applications,
  };
  return NextResponse.json(data);
}

/**
 * «Presentar candidatura». El mentor sale de la sesión (no del formulario).
 * La base vuelve a comprobar plazo, estado y duplicados aunque esto fallara.
 */
export async function POST(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const blocked = await requireGrowthAccess(admin, user.id);
  if (blocked) return blocked;

  let body: { opportunityId?: unknown; motivation?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const opportunityId = typeof body.opportunityId === "string" && UUID_RE.test(body.opportunityId) ? body.opportunityId : null;
  if (!opportunityId) return NextResponse.json({ error: "Oportunidad no válida." }, { status: 400 });

  const { data: opportunity } = await admin.from("kiru_opportunities").select("status,deadline").eq("id", opportunityId).maybeSingle();
  if (!opportunity || opportunity.status === "borrador") return NextResponse.json({ error: "Esta oportunidad no existe." }, { status: 404 });
  if (!isOpportunityOpen(opportunity.status, opportunity.deadline)) {
    return NextResponse.json({ error: "Esta oportunidad ya está cerrada o fuera de plazo." }, { status: 409 });
  }

  const { error } = await admin.from("kiru_opportunity_applications").insert({
    opportunity_id: opportunityId,
    mentor_id: user.id,
    motivation: text(body.motivation, 2000),
  });
  if (error?.code === "23505") return NextResponse.json({ error: "Ya te has presentado a esta oportunidad." }, { status: 409 });
  if (error?.code === "23514") return NextResponse.json({ error: "Esta oportunidad ya está cerrada o fuera de plazo." }, { status: 409 });
  if (error) return NextResponse.json({ error: "No se pudo enviar tu candidatura." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
