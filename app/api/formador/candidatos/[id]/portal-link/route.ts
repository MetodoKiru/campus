import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireCandidateStaff } from "@/lib/server/kiru-candidate-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCandidateStaff(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Identificador de candidatura no válido." }, { status: 400 });
  }

  const { data: candidate, error: lookupError } = await auth.admin
    .from("kiru_candidates")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "No se pudo comprobar la candidatura." }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: "No se encontró la candidatura." }, { status: 404 });

  // Return the raw secret only once. The database stores only its SHA-256 hash.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const issuedAt = new Date().toISOString();

  const { error: updateError } = await auth.admin
    .from("kiru_candidates")
    .update({ public_token_hash: tokenHash, public_token_issued_at: issuedAt, updated_at: issuedAt })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: "No se pudo generar el enlace seguro." }, { status: 500 });

  let baseUrl: URL;
  try {
    baseUrl = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url);
  } catch {
    return NextResponse.json({ error: "La URL pública del Campus no está configurada correctamente." }, { status: 503 });
  }

  const portalUrl = new URL(`/mentores/candidatura/${token}`, baseUrl.origin).toString();
  return NextResponse.json({ portalUrl, issuedAt }, { headers: { "Cache-Control": "no-store" } });
}
