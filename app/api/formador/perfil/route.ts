import { NextResponse } from "next/server";
import { requireCandidateStaff } from "@/lib/server/kiru-candidate-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validateCalendlyUrl(value: unknown): string | null | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      !(url.hostname === "calendly.com" || url.hostname.endsWith(".calendly.com")) ||
      url.username ||
      url.password
    ) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function GET(request: Request) {
  const auth = await requireCandidateStaff(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.admin
    .from("profiles")
    .select("calendly_url")
    .eq("id", auth.user.id)
    .single();

  if (error) return NextResponse.json({ error: "No se pudo cargar tu enlace de Calendly." }, { status: 500 });
  return NextResponse.json({ calendlyUrl: data.calendly_url ?? "" }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const auth = await requireCandidateStaff(request);
  if (!auth.ok) return auth.response;

  let body: { calendlyUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }

  const calendlyUrl = validateCalendlyUrl(body.calendlyUrl);
  if (calendlyUrl === undefined) {
    return NextResponse.json({ error: "Introduce un enlace HTTPS válido de calendly.com." }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("profiles")
    .update({ calendly_url: calendlyUrl, updated_at: new Date().toISOString() })
    .eq("id", auth.user.id);

  if (error) return NextResponse.json({ error: "No se pudo guardar el enlace de Calendly." }, { status: 500 });
  return NextResponse.json({ ok: true, calendlyUrl: calendlyUrl ?? "" });
}
