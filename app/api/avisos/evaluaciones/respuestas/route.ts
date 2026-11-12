import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

const MAX_PER_CALL = 50;

/**
 * Copia de seguridad de las respuestas de las evaluaciones en una hoja de Google.
 * La llama el Apps Script «Evaluaciones» (misma clave KIRU_ALTA_SECRET):
 *  - con {} devuelve las respuestas de Jotform que aún no están en la hoja;
 *  - con {confirmar: [ids]} las marca como copiadas, solo después de escribirlas.
 * Si el Apps Script falla a medias, las no confirmadas salen otra vez la próxima vez.
 */
export async function POST(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "No está configurado." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { confirmar?: unknown };

  if (Array.isArray(body.confirmar)) {
    const ids = body.confirmar.filter((x): x is string => typeof x === "string").slice(0, MAX_PER_CALL);
    if (!ids.length) return NextResponse.json({ ok: true, marked: 0 });
    const { data, error } = await admin.from("kiru_evaluations")
      .update({ sheet_exported_at: new Date().toISOString() }).in("id", ids).is("sheet_exported_at", null).select("id");
    if (error) return NextResponse.json({ error: "No se pudieron marcar." }, { status: 500 });
    return NextResponse.json({ ok: true, marked: data?.length ?? 0 });
  }

  const { data: rows, error } = await admin.from("kiru_evaluations")
    .select("id,student_id,target,cycle,mentor_id,due_on,completed_at,submission_id,answers,late")
    .eq("completed_via", "formulario").is("sheet_exported_at", null).not("answers", "is", null)
    .order("completed_at").limit(MAX_PER_CALL);
  if (error) return NextResponse.json({ error: "No se pudieron leer las respuestas." }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ ok: true, respuestas: [] });

  const ids = [...new Set(rows.flatMap((r) => [r.student_id, r.mentor_id]).filter((x): x is string => !!x))];
  const { data: people } = await admin.from("profiles").select("id,full_name").in("id", ids);
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return NextResponse.json({
    ok: true,
    respuestas: rows.map((r) => ({
      id: r.id,
      target: r.target,
      studentName: name.get(r.student_id) ?? "",
      mentorName: r.mentor_id ? name.get(r.mentor_id) ?? "" : "",
      cycle: r.cycle,
      dueOn: r.due_on,
      completedAt: r.completed_at,
      submissionId: r.submission_id ?? "",
      late: r.late,
      answers: r.answers,
    })),
  });
}
