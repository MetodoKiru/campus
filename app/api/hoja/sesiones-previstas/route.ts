import { NextResponse } from "next/server";
import { DAY_RE, serviceClient } from "@/lib/server/classes";
import { UUID_RE } from "@/lib/server/require-staff";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

/**
 * Sesiones previstas de un alumno en un periodo, para el script de
 * liquidaciones (clave KIRU_REGISTROS_SECRET). «hasta» no se incluye, igual que
 * el fin de periodo del campus. Cuenta el horario semanal activo, resta solo los
 * días sin clase de Kiru y mantiene los festivos. En pausa o baja devuelve 0.
 * GET /api/hoja/sesiones-previstas?alumno=<ID campus>&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 */
export async function GET(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_REGISTROS_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "No está configurado." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const student = params.get("alumno") ?? "";
  const from = params.get("desde") ?? "";
  const until = params.get("hasta") ?? "";
  if (!UUID_RE.test(student) || !DAY_RE.test(from) || !DAY_RE.test(until)) {
    return NextResponse.json({ error: "Indica alumno (ID campus), desde y hasta (AAAA-MM-DD)." }, { status: 400 });
  }
  const { data, error } = await admin.rpc("kiru_sesiones_previstas", { p_student: student, p_from: from, p_until: until });
  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "23514" ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? "No se pudo calcular." : error.message }, { status });
  }
  return NextResponse.json(data);
}
