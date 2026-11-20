import { NextResponse } from "next/server";
import type { FamilyInfoView, FamilyOnboardingPayload } from "@/lib/incorporacion";
import { scopeStudents } from "@/lib/server/evaluations";
import { familyKids, onboardingFor, onboardingRow, openInitialEvaluation } from "@/lib/server/incorporacion";
import { requireStaff, UUID_RE } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });


/**
 * Primeros pasos de la familia.
 * · Familia: el estado de sus 3 pasos por cada hijo/a.
 * · Coordinación (sus alumnos) y administración (todos): la información extra que han enviado.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["padre", "coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;

  if (role === "padre") {
    const kids = await familyKids(admin, user.id);
    const payload: FamilyOnboardingPayload = {
      kids: await Promise.all(kids.map((k) => onboardingFor(admin, request.url, k, user.email ?? ""))),
    };
    return NextResponse.json(payload);
  }

  const scope = await scopeStudents(admin, role, user.id);
  let q = admin.from("kiru_family_info").select("*").order("received_at", { ascending: false }).limit(200);
  if (scope) q = q.in("student_id", scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  const ids = [...new Set((data ?? []).map((r) => r.student_id).filter((x): x is string => !!x))];
  const { data: people } = ids.length ? await admin.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const items: FamilyInfoView[] = (data ?? []).map((r) => {
    const answers = (r.answers && typeof r.answers === "object" && !Array.isArray(r.answers) ? r.answers : {}) as Record<string, unknown>;
    const files = Array.isArray(r.files) ? r.files : [];
    return {
      id: r.id, studentId: r.student_id, studentName: (r.student_id && who.get(r.student_id)) || r.student_name || "Sin enlazar",
      email: r.email, receivedAt: r.received_at,
      files: files.filter((f): f is { name: string; url: string } => !!f && typeof f === "object" && typeof (f as { url?: unknown }).url === "string")
        .map((f) => ({ name: String(f.name ?? "Archivo"), url: f.url })),
      answers: Array.isArray(answers._lista)
        ? (answers._lista as unknown[]).filter((a): a is { label: string; value: string } => !!a && typeof a === "object")
          .map((a) => ({ label: String(a.label ?? ""), value: String(a.value ?? "") }))
        : [],
    };
  });
  return NextResponse.json({ items });
}

/** Familia: abrir ya la evaluación inicial o decir «no tenemos nada más que añadir» en el paso 3. */
export async function POST(request: Request) {
  const auth = await requireStaff(request, ["padre"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;
  const body = (await request.json().catch(() => ({}))) as { action?: string; studentId?: string };
  const studentId = typeof body.studentId === "string" && UUID_RE.test(body.studentId) ? body.studentId : "";
  if (!studentId) return fail("Falta el alumno.");
  const kids = await familyKids(admin, user.id);
  if (!kids.some((k) => k.id === studentId)) return fail("Este alumno no está vinculado a tu cuenta.", 403);

  if (body.action === "abrir_evaluacion") {
    const link = await openInitialEvaluation(admin, request.url, studentId);
    if (!link) return fail("La evaluación todavía no se puede abrir. Os avisaremos por correo cuando esté lista.");
    return NextResponse.json({ link });
  }
  if (body.action === "saltar_info" || body.action === "recuperar_info") {
    await onboardingRow(admin, studentId);
    await admin.from("kiru_family_onboarding")
      .update({ info_skipped_at: body.action === "saltar_info" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq("student_id", studentId);
    return NextResponse.json({ ok: true });
  }
  return fail("Acción no válida.");
}
