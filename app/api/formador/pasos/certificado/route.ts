import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";

export const runtime = "nodejs";

/**
 * Enlace temporal (5 minutos) para que el formador o administración abran el
 * PDF del certificado que subió un mentor. El archivo nunca es público.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["formador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const mentorId = new URL(request.url).searchParams.get("mentorId") ?? "";
  if (!UUID_RE.test(mentorId)) return NextResponse.json({ error: "Mentor no válido." }, { status: 400 });

  const { data, error } = await admin
    .from("kiru_mentor_steps")
    .select("document_path")
    .eq("mentor_id", mentorId)
    .eq("step", "certificado")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo cargar el certificado." }, { status: 500 });
  if (!data?.document_path) return NextResponse.json({ error: "Este mentor no ha subido el PDF desde el campus." }, { status: 404 });

  const { data: signed, error: signError } = await admin.storage.from("kiru-mentor-docs").createSignedUrl(data.document_path, 300);
  if (signError || !signed) return NextResponse.json({ error: "No se pudo abrir el PDF." }, { status: 500 });
  return NextResponse.json({ url: signed.signedUrl });
}
