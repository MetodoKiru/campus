import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";
import { isOpportunityOpen } from "@/lib/growth";
import type { Database } from "@/lib/database.types";
import { readOpportunityFields } from "../fields";

export const runtime = "nodejs";

type Update = Database["public"]["Tables"]["kiru_opportunities"]["Update"];

/** Editar, publicar, cerrar o volver a abrir una oportunidad (solo administración). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Oportunidad no válida." }, { status: 400 });

  const { data: current } = await admin.from("kiru_opportunities").select("status,deadline,published_at").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "No existe esa oportunidad." }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const now = new Date().toISOString();
  let update: Update;

  switch (body.action) {
    case "editar": {
      const fields = readOpportunityFields(body);
      if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });
      update = fields;
      break;
    }
    case "publicar":
    case "reabrir":
      if (current.status === "publicada") return NextResponse.json({ error: "Ya está publicada." }, { status: 409 });
      if (current.deadline && !isOpportunityOpen("publicada", current.deadline)) {
        return NextResponse.json({ error: "La fecha límite ya ha pasado: cámbiala antes de publicarla." }, { status: 400 });
      }
      update = { status: "publicada", published_at: current.published_at ?? now, closed_at: null };
      break;
    case "cerrar":
      if (current.status !== "publicada") return NextResponse.json({ error: "Solo se cierra una oportunidad publicada." }, { status: 409 });
      update = { status: "cerrada", closed_at: now };
      break;
    case "completar":
      if (current.status !== "publicada" && current.status !== "cerrada") return NextResponse.json({ error: "Solo puedes completar una oportunidad publicada o cerrada." }, { status: 409 });
      update = { status: "completada", closed_at: now };
      break;
    default:
      return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }

  const { error } = await admin.from("kiru_opportunities").update({ ...update, updated_by: user.id }).eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Solo se borra un borrador sin candidaturas ni recomendaciones; lo demás se cierra. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Oportunidad no válida." }, { status: 400 });

  const { data: current } = await admin.from("kiru_opportunities").select("status").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "No existe esa oportunidad." }, { status: 404 });
  if (current.status !== "borrador") return NextResponse.json({ error: "Una oportunidad publicada no se borra: ciérrala." }, { status: 409 });
  const { error } = await admin.from("kiru_opportunities").delete().eq("id", id).eq("status", "borrador");
  if (error) return NextResponse.json({ error: "No se pudo borrar (puede que ya tenga candidaturas)." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
