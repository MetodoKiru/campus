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
  const { data, error } = await admin.rpc("kiru_clases_tarea_diaria", {});
  if (error) {
    console.error("Tarea diaria de clases:", error.code, error.message);
    return NextResponse.json({ error: "La tarea diaria falló." }, { status: 500 });
  }
  // Recordatorios de justificaciones de SkillCoins (no duplica si ya los mandó pg_cron).
  const supervision = await admin.rpc("kiru_supervision_tarea_diaria", {});
  if (supervision.error) console.error("Tarea diaria de supervisión:", supervision.error.code, supervision.error.message);
  return NextResponse.json({ ok: true, resultado: data, supervision: supervision.data ?? null });
}
