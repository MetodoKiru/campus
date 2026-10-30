import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const BUCKET = "kiru-mentor-docs";
/** Vercel no admite cuerpos de más de 4,5 MB; el PDF del Ministerio ocupa mucho menos. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * El mentor sube el PDF de su certificado de delitos de naturaleza sexual desde
 * su panel, con su nombre y apellidos tal como aparecen en él. Se guarda en el
 * almacén privado (solo lo leen administración y el formador) y el paso queda
 * «enviado» hasta que el formador lo revise. Si ya
 * estaba comprobado no se puede reemplazar; si se pidió corrección, el PDF
 * nuevo sustituye al anterior, que se borra.
 */
export async function POST(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "No se recibió el archivo." }, { status: 400 }); }
  const file = form.get("file");
  const rawName = form.get("nombre");
  const holderName = typeof rawName === "string" ? rawName.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (holderName.length < 3 || !holderName.includes(" ")) return NextResponse.json({ error: "Escribe tu nombre y apellidos tal como aparecen en el certificado." }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No se recibió el archivo." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El PDF pesa demasiado (máximo 4 MB). Sube el original que descargaste del Ministerio." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Se mira el contenido, no solo el nombre: un PDF empieza siempre por «%PDF-».
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return NextResponse.json({ error: "El archivo no es un PDF. Sube el PDF que te descargaste del Ministerio, no una foto." }, { status: 400 });
  }

  const [stepResult, onboardingResult] = await Promise.all([
    admin.from("kiru_mentor_steps").select("status,document_path").eq("mentor_id", user.id).eq("step", "certificado").maybeSingle(),
    admin.from("kiru_mentor_onboarding").select("certificate_checked_at").eq("profile_id", user.id).is("archived_at", null).maybeSingle(),
  ]);
  if (stepResult.error || onboardingResult.error) return NextResponse.json({ error: "No se pudo comprobar tu certificado." }, { status: 500 });
  if (stepResult.data?.status === "completado" || onboardingResult.data?.certificate_checked_at) {
    return NextResponse.json({ error: "Tu certificado ya está comprobado. No hace falta subirlo otra vez." }, { status: 409 });
  }

  const path = `${user.id}/certificado-${Date.now()}.pdf`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) return NextResponse.json({ error: "No se pudo guardar el PDF. Inténtalo de nuevo." }, { status: 500 });

  const { error } = await admin.from("kiru_mentor_steps").upsert({
    mentor_id: user.id,
    step: "certificado",
    status: "enviado",
    document_path: path,
    holder_name: holderName,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    review_note: "",
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: "No se pudo guardar el PDF. Inténtalo de nuevo." }, { status: 500 });
  }

  // Un único certificado por mentor: el anterior (si lo había) deja de hacer falta.
  const previous = stepResult.data?.document_path;
  if (previous && previous !== path) await admin.storage.from(BUCKET).remove([previous]);

  return NextResponse.json({ ok: true });
}
