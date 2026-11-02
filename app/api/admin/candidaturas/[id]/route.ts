import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/growth";

export const runtime = "nodejs";

/** Administración cambia el estado de una candidatura. Nada más de ella cambia. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Candidatura no válida." }, { status: 400 });

  let body: { status?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const status = APPLICATION_STATUSES.includes(body.status as ApplicationStatus) ? (body.status as ApplicationStatus) : null;
  if (!status) return NextResponse.json({ error: "Estado no válido." }, { status: 400 });

  const { data, error } = await admin.from("kiru_opportunity_applications")
    .update({ status, status_changed_by: user.id }).eq("id", id).select("id");
  if (error) return NextResponse.json({ error: "No se pudo cambiar el estado." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "No existe esa candidatura." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
