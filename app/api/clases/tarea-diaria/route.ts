import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";
import { EVIDENCE_BUCKET } from "@/lib/supervision";

export const runtime = "nodejs";

/**
 * Tarea diaria: genera las clases de las próximas semanas y manda los avisos de
 * recuperaciones sin avanzar y de fin de periodo. La ejecuta Supabase (pg_cron)
 * cada noche; esta ruta es el respaldo de Vercel Cron (cabecera con CRON_SECRET).
 * Repetirla el mismo día no duplica clases ni avisos.
 */
export async function GET(request: Request) {
  const secret = sharedSecretStatus(request, process.env.CRON_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "No está configurado." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });
  const { data, error } = await admin.rpc("kiru_clases_tarea_diaria", {});
  if (error) {
    console.error("Tarea diaria de clases:", error.code, error.message);
    return NextResponse.json({ error: "La tarea diaria falló." }, { status: 500 });
  }
  // Recordatorios de justificaciones de SkillCoins (no duplica si ya los mandó pg_cron).
  const supervision = await admin.rpc("kiru_supervision_tarea_diaria", {});
  if (supervision.error) console.error("Tarea diaria de supervisión:", supervision.error.code, supervision.error.message);
  const evidencias = await purgeExpiredEvidence(admin);
  return NextResponse.json({ ok: true, resultado: data, supervision: supervision.data ?? null, evidencias });
}

/**
 * Fotos y documentos de justificaciones: se conservan hasta el 31 de agosto de cada
 * curso. Borra del almacén los de cursos anteriores (de revisiones ya cerradas) y los
 * marca como eliminados; el texto de la justificación se queda. Supabase no permite
 * borrar archivos desde SQL, por eso se hace aquí con la API de Storage.
 */
async function purgeExpiredEvidence(admin: NonNullable<ReturnType<typeof serviceClient>>): Promise<number | null> {
  const expired = await admin.rpc("kiru_evidence_expired", { p_limit: 500 });
  if (expired.error) {
    console.error("Evidencias caducadas:", expired.error.code, expired.error.message);
    return null;
  }
  const rows = (expired.data ?? []) as { id: string; storage_path: string }[];
  let deleted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const removed = await admin.storage.from(EVIDENCE_BUCKET).remove(chunk.map((row) => row.storage_path));
    if (removed.error) {
      console.error("Borrar evidencias caducadas:", removed.error.message);
      continue; // se reintenta mañana; nada queda marcado sin haberse borrado
    }
    const marked = await admin.rpc("kiru_evidence_mark_deleted", { p_ids: chunk.map((row) => row.id) });
    if (marked.error) console.error("Marcar evidencias eliminadas:", marked.error.code, marked.error.message);
    else deleted += Number(marked.data ?? 0);
  }
  return deleted;
}
