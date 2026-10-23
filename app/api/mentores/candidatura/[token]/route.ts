import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (typeof token !== "string" || token.length < 40 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json({ error: "Este enlace no es válido. Contacta con el equipo de selección para recibir uno actualizado." }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "El portal no está disponible temporalmente." }, { status: 503 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin
    .from("kiru_candidates")
    .select("name,phase,status,instructions,next_step,calendly_url,updated_at")
    .eq("public_token_hash", tokenHash)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "No se pudo consultar el estado de la candidatura." }, { status: 500 });
  if (!data) {
    return NextResponse.json({ error: "Este enlace no es válido o ha sido sustituido. Contacta con el equipo de selección para recibir uno actualizado." }, { status: 404 });
  }

  return NextResponse.json({ candidate: data }, { headers: { "Cache-Control": "no-store, private" } });
}
