import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";

export const runtime = "nodejs";

type Status = "activo" | "en_pausa" | "baja";
const STATUSES: Status[] = ["activo", "en_pausa", "baja"];

/**
 * «Mis alumnos» del panel de administración.
 *
 * GET: todos los alumnos con su estado (activo / en pausa / baja), mentor, familia
 * y la renovación abierta (si la familia ya dijo «he pagado» o «no renueva»).
 *
 * POST (solo administración):
 *  · { accion: "estado", studentId, estado }: pone al alumno activo, en pausa o de baja.
 *    En pausa o baja dejan de salir clases nuevas, evaluaciones y avisos.
 *  · { accion: "pagado", studentId }: marca «ha pagado» en su renovación abierta, como
 *    si la familia hubiera pulsado «he pagado» (llega a la hoja igual), y lo deja activo.
 *  · { accion: "no_renueva", studentId }: marca «no renueva» en su renovación abierta.
 *
 * La hoja Contabilidad lo lee cada 10 minutos (/api/renovaciones, acción «estados»)
 * y no manda renovaciones ni recordatorios a quien está en pausa o de baja.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const [profiles, students, mentors, guardians, renewals, evalSettings] = await Promise.all([
    admin.from("profiles").select("id,full_name,username,role,is_active"),
    admin.from("students").select("profile_id,service_status,service_status_source,service_status_synced_at,municipality,updated_at"),
    admin.from("student_mentors").select("student_id,mentor_id"),
    admin.from("student_guardians").select("student_id,guardian_id"),
    admin.from("kiru_renewals").select("id,student_id,period_end,plan,plan_source,plan_at,paid_reported_at,paid_source,closed_at,keep_label,keep_price")
      .order("period_end", { ascending: false }),
    admin.from("kiru_evaluation_students").select("student_id,paused"),
  ]);
  const failed = [profiles, students, mentors, guardians, renewals].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: `No se pudieron cargar los alumnos: ${failed.error.message}` }, { status: 500 });

  const people = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const studentRow = new Map((students.data ?? []).map((s) => [s.profile_id, s]));
  const mentorOf = new Map((mentors.data ?? []).map((m) => [m.student_id, m.mentor_id]));
  const familyOf = new Map<string, string[]>();
  for (const g of guardians.data ?? []) familyOf.set(g.student_id, [...(familyOf.get(g.student_id) ?? []), people.get(g.guardian_id)?.full_name ?? "—"]);
  // La renovación que cuenta: la abierta más reciente; si no hay, la última cerrada.
  const renewalOf = new Map<string, NonNullable<typeof renewals.data>[number]>();
  for (const r of renewals.data ?? []) {
    const current = renewalOf.get(r.student_id);
    if (!current || (current.closed_at && !r.closed_at)) renewalOf.set(r.student_id, r);
  }
  // Si la tabla de evaluaciones aún no existe, no se rompe la lista.
  const evalPaused = new Set((evalSettings.error ? [] : evalSettings.data ?? []).filter((e) => e.paused).map((e) => e.student_id));

  const alumnos = (profiles.data ?? []).filter((p) => p.role === "alumno").map((p) => {
    const st = studentRow.get(p.id);
    const renewal = renewalOf.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.full_name,
      username: p.username,
      accountActive: p.is_active,
      status: (st?.service_status ?? "activo") as Status,
      statusFromSheet: st?.service_status_source === "familias",
      statusSyncedAt: st?.service_status_synced_at ?? null,
      municipality: st?.municipality ?? "",
      mentor: mentorOf.has(p.id) ? people.get(mentorOf.get(p.id)!)?.full_name ?? null : null,
      family: familyOf.get(p.id) ?? [],
      evaluationsPaused: evalPaused.has(p.id),
      renewal: renewal && {
        id: renewal.id,
        periodEnd: renewal.period_end,
        plan: renewal.plan,
        planSource: renewal.plan_source,
        paidAt: renewal.paid_reported_at,
        paidSource: renewal.paid_source,
        closed: Boolean(renewal.closed_at),
        label: renewal.keep_label,
        price: renewal.keep_price,
      },
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "es"));

  return NextResponse.json({ alumnos });
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, ["admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user } = auth;

  let body: { accion?: unknown; studentId?: unknown; estado?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const studentId = typeof body.studentId === "string" && /^[0-9a-f-]{36}$/i.test(body.studentId) ? body.studentId : null;
  if (!studentId) return NextResponse.json({ error: "Falta el alumno." }, { status: 400 });

  const { data: profile } = await admin.from("profiles").select("id,full_name,role").eq("id", studentId).maybeSingle();
  if (!profile || profile.role !== "alumno") return NextResponse.json({ error: "No encontramos a ese alumno." }, { status: 404 });

  const setStatus = async (estado: Status) => {
    const { data: existing } = await admin.from("students").select("service_status").eq("profile_id", studentId).maybeSingle();
    if (existing?.service_status === estado) return null;
    const { error } = existing
      ? await admin.from("students").update({ service_status: estado }).eq("profile_id", studentId)
      : await admin.from("students").insert({ profile_id: studentId, service_status: estado });
    if (error) return error.message;
    // Igual que cuando cambia la hoja: se rehacen las clases (en pausa o baja se anulan las futuras).
    await admin.rpc("kiru_clases_generar", {});
    return null;
  };

  const openRenewal = async () => {
    const { data } = await admin.from("kiru_renewals").select("id,plan,paid_reported_at,closed_at,campus_seq")
      .eq("student_id", studentId).is("closed_at", null).order("period_end", { ascending: false }).limit(1).maybeSingle();
    return data;
  };

  if (body.accion === "estado") {
    const estado = STATUSES.find((s) => s === body.estado);
    if (!estado) return NextResponse.json({ error: "Estado no válido." }, { status: 400 });
    const problem = await setStatus(estado);
    if (problem) return NextResponse.json({ error: `No se pudo cambiar el estado: ${problem}` }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.accion === "pagado") {
    const r = await openRenewal();
    if (r && !r.paid_reported_at) {
      const { error } = await admin.from("kiru_renewals")
        .update({ paid_reported_at: new Date().toISOString(), paid_source: "campus", paid_by: user.id, campus_seq: r.campus_seq + 1 })
        .eq("id", r.id);
      if (error) return NextResponse.json({ error: `No se pudo marcar el pago: ${error.message}` }, { status: 500 });
    }
    const problem = await setStatus("activo");
    if (problem) return NextResponse.json({ error: `Pago marcado, pero no se pudo activar: ${problem}` }, { status: 500 });
    return NextResponse.json({ ok: true, renovacion: Boolean(r) });
  }

  if (body.accion === "no_renueva") {
    const r = await openRenewal();
    if (!r) return NextResponse.json({ error: "No hay ninguna renovación abierta para este alumno." }, { status: 409 });
    if (r.plan !== "no_renueva") {
      const { error } = await admin.from("kiru_renewals")
        .update({ plan: "no_renueva", plan_source: "campus", plan_at: new Date().toISOString(), plan_by: user.id, campus_seq: r.campus_seq + 1 })
        .eq("id", r.id);
      if (error) return NextResponse.json({ error: `No se pudo guardar: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
}
