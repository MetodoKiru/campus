import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";
import { PERIOD_COLS, mapPeriod, nextMonthOverlaps, parseAmounts } from "@/lib/server/special-periods";
import { DATE_RE, norm } from "@/lib/special-periods";

export const runtime = "nodejs";

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * La llama el script «Kiru renovaciones familias» (clave KIRU_ALTA_SECRET) antes
 * de preparar las renovaciones del día. Por cada familia (correo, alumno y fin de
 * la mensualidad) dice si la mensualidad siguiente cae en un periodo especial y,
 * si es así, si administración ya aprobó el plan en el campus y con qué importe.
 * · periodo = null → renovación normal.
 * · periodo y aprobado = false → no se manda precio: se pide el formulario.
 * · aprobado = true → propuesta con «precio» (null = la cuota de siempre).
 * También devuelve los periodos activos, que se configuran en /admin.
 */
export async function POST(request: Request) {
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  const admin = serviceClient();
  if (!admin || secret === "missing") return NextResponse.json({ error: "No configurado." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }

  const { data: rows, error } = await admin.from("kiru_special_periods").select(PERIOD_COLS).eq("is_active", true).order("starts_on");
  if (error) return NextResponse.json({ error: "No se pudieron leer los periodos." }, { status: 500 });
  const periods = (rows ?? []).map(mapPeriod);
  const panel = new URL("/padre?tab=vacaciones", request.url).toString();

  const families = (Array.isArray(body.familias) ? body.familias : []).slice(0, 500).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const f = item as Record<string, unknown>;
    const fin = text(f.fin, 10);
    const email = text(f.email, 254).toLowerCase();
    const alumno = text(f.alumno, 120);
    return email && alumno && DATE_RE.test(fin) ? [{ email, alumno, fin }] : [];
  });

  // Alumno del campus: por las renovaciones que ya conoce el campus (mismo correo y nombre de la hoja)
  // y, si no, por el correo de la familia y el nombre del hijo/a.
  const { data: known } = await admin.from("kiru_renewals").select("student_id,guardian_email,sheet_student").order("period_end", { ascending: false }).limit(2000);
  let users: { id: string; email: string }[] | null = null;
  async function resolve(email: string, alumno: string): Promise<string | null> {
    const hit = (known ?? []).find((k) => k.guardian_email.toLowerCase() === email && norm(k.sheet_student) === norm(alumno));
    if (hit) return hit.student_id;
    if (!users) {
      const { data } = await admin!.auth.admin.listUsers({ perPage: 1000 });
      users = (data?.users ?? []).map((u) => ({ id: u.id, email: (u.email ?? "").toLowerCase() }));
    }
    const guardians = users.filter((u) => u.email === email).map((u) => u.id);
    if (!guardians.length) return null;
    const { data: links } = await admin!.from("student_guardians").select("student_id").in("guardian_id", guardians);
    const ids = [...new Set((links ?? []).map((l) => l.student_id))];
    if (!ids.length) return null;
    const { data: kids } = await admin!.from("profiles").select("id,full_name").in("id", ids);
    const named = (kids ?? []).filter((k) => norm(k.full_name) === norm(alumno) || norm(k.full_name).startsWith(`${norm(alumno)} `));
    if (named.length === 1) return named[0].id;
    return !named.length && (kids ?? []).length === 1 ? kids![0].id : null;
  }

  const out = [];
  for (const f of families) {
    const p = periods.find((x) => nextMonthOverlaps(f.fin, x));
    if (!p) { out.push({ ...f, periodo: null }); continue; }
    const studentId = await resolve(f.email, f.alumno);
    let respondido = false, aprobado = false, precio: number | null = null;
    if (studentId) {
      const [{ data: answer }, { data: plan }] = await Promise.all([
        admin.from("kiru_special_period_family").select("id").eq("period_id", p.id).eq("student_id", studentId).maybeSingle(),
        admin.from("kiru_special_period_plans").select("status,amounts").eq("period_id", p.id).eq("student_id", studentId).maybeSingle(),
      ]);
      respondido = !!answer;
      aprobado = plan?.status === "aprobado";
      // La renovación que se prepara cubre [fin, fin + 1 mes): su línea es la que empieza en «fin».
      if (aprobado) precio = parseAmounts(plan!.amounts).find((a) => a.periodStart === f.fin)?.amount ?? null;
    }
    out.push({ ...f, periodo: p.name, inicio: p.startsOn, finPeriodo: p.endsOn, enCampus: !!studentId, respondido, aprobado, precio, enlace: panel });
  }

  return NextResponse.json({
    ok: true,
    periodos: periods.map((p) => ({ nombre: p.name, inicio: p.startsOn, fin: p.endsOn, enlace: panel })),
    familias: out,
  });
}
