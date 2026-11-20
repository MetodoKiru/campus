import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

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
  // Cambios de horario del día (antes de generar las clases, para que salgan ya con el horario nuevo).
  const horarios = await admin.rpc("kiru_horarios_tarea_diaria", {});
  if (horarios.error) console.error("Tarea diaria de horarios:", horarios.error.code, horarios.error.message);
  const { data, error } = await admin.rpc("kiru_clases_tarea_diaria", {});
  if (error) {
    console.error("Tarea diaria de clases:", error.code, error.message);
    return NextResponse.json({ error: "La tarea diaria falló." }, { status: 500 });
  }
  // Recordatorios de justificaciones de SkillCoins (no duplica si ya los mandó pg_cron).
  const supervision = await admin.rpc("kiru_supervision_tarea_diaria", {});
  if (supervision.error) console.error("Tarea diaria de supervisión:", supervision.error.code, supervision.error.message);
  // Tareas de las asignaturas: recordatorios (si pg_cron no los mandó ya; no duplica) y,
  // desde el 1 de septiembre, borrar los archivos entregados el curso anterior.
  const tareas = await admin.rpc("kiru_tareas_tarea_horaria", {});
  if (tareas.error) console.error("Tareas de asignaturas:", tareas.error.code, tareas.error.message);
  const entregas = await purgeOldSubmissionFiles(admin);
  return NextResponse.json({ ok: true, resultado: data, supervision: supervision.data ?? null, horarios: horarios.data ?? null, tareas: tareas.data ?? null, entregas });
}

/** Archivos de entregas de cursos anteriores: se borran del almacén y se marcan (la entrega se queda). */
async function purgeOldSubmissionFiles(admin: NonNullable<ReturnType<typeof serviceClient>>): Promise<number | string> {
  let removed = 0;
  for (let round = 0; round < 5; round += 1) {
    const { data, error } = await admin.rpc("kiru_entregas_caducadas", { p_limit: 200 });
    if (error) { console.error("Entregas caducadas:", error.code, error.message); return "error"; }
    const paths = (data ?? []).map((row) => row.storage_path);
    if (!paths.length) break;
    const storage = await admin.storage.from("kiru-entregas").remove(paths);
    if (storage.error) { console.error("Borrar entregas:", storage.error.message); return "error"; }
    const marked = await admin.rpc("kiru_entregas_marcar_borradas", { p_paths: paths });
    if (marked.error) { console.error("Marcar entregas:", marked.error.code, marked.error.message); return "error"; }
    removed += marked.data ?? 0;
  }
  return removed;
}
