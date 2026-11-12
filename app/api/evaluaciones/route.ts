import { NextResponse } from "next/server";
import type { EvaluationRow } from "@/lib/database.types";
import { requireStaff, UUID_RE } from "@/lib/server/require-staff";
import {
  EVAL_BUCKET, isDate, madridTodayIso, mentorWindow,
  type EvalMode, type FamilyEvaluationView, type MentorEvaluationView, type StaffEvaluationsPayload, type StaffEvaluationView,
} from "@/lib/evaluations";
import {
  evaluationLink, firstNameOf, holidaysFor, loadEvalSettings, notifyEval, saveEvalSettings, scopeStudents, supervisorsOf,
} from "@/lib/server/evaluations";

export const runtime = "nodejs";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ACTIVE = ["programada", "abierta"] as const;
const MIME: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
};

type Admin = Extract<Awaited<ReturnType<typeof requireStaff>>, { ok: true }>["admin"];

async function names(admin: Admin, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const { data } = unique.length ? await admin.from("profiles").select("id,full_name").in("id", unique) : { data: [] };
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

/**
 * Evaluaciones trimestrales: lo que ve cada panel.
 * · Familia: el formulario pendiente de cada hijo/a (con enlace que comprueba el plazo).
 * · Mentor: su formulario (abierto 5 días) y la evaluación en papel de sus alumnos.
 * · Coordinación (sus alumnos) y administración (todos): seguimiento y ajustes.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["padre", "mentor", "coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;
  const today = madridTodayIso();

  if (role === "padre") {
    const { data: links } = await admin.from("student_guardians").select("student_id").eq("guardian_id", user.id);
    const kids = (links ?? []).map((l) => l.student_id);
    if (!kids.length) return NextResponse.json({ evaluations: [] });
    const { data: rows } = await admin.from("kiru_evaluations").select("*")
      .in("student_id", kids).eq("target", "familia").eq("status", "abierta").order("due_on");
    const who = await names(admin, kids);
    const holidays = await holidaysFor(admin, (rows ?? []).map((r) => r.due_on));
    const evaluations: FamilyEvaluationView[] = (rows ?? []).map((r) => ({
      id: r.id, studentId: r.student_id, studentName: firstNameOf(who.get(r.student_id) ?? ""), cycle: r.cycle, dueOn: r.due_on,
      status: r.status, link: evaluationLink(request.url, r.token), holiday: holidays.get(r.due_on) ?? null,
    }));
    return NextResponse.json({ evaluations });
  }

  if (role === "mentor") {
    const settings = await loadEvalSettings(admin);
    const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
    const { data: rows } = await admin.from("kiru_evaluations").select("*")
      .eq("mentor_id", user.id).in("target", ["mentor", "alumno"])
      .or(`status.in.(programada,abierta),completed_at.gte.${since}`).order("due_on");
    const who = await names(admin, (rows ?? []).map((r) => r.student_id));
    const evaluations: MentorEvaluationView[] = (rows ?? [])
      // Del formulario del mentor solo se enseña lo que está cerca (se abre 2 días antes).
      .filter((r) => r.target === "alumno" || r.status !== "programada" || r.due_on <= addWeek(today))
      .map((r) => {
        const w = r.target === "mentor" ? mentorWindow(r.due_on) : null;
        const inWindow = !!w && r.status === "abierta" && today >= w.opensOn && today <= w.closesOn;
        return {
          id: r.id, studentId: r.student_id, studentName: who.get(r.student_id) ?? "", target: r.target as "mentor" | "alumno",
          cycle: r.cycle, dueOn: r.due_on, status: r.status,
          opensOn: w?.opensOn ?? null, closesOn: w?.closesOn ?? null, link: inWindow ? evaluationLink(request.url, r.token) : null,
          academicStatus: r.academic_status, academicName: r.academic_name, academicMine: r.academic_by === user.id,
          scans: r.scan_paths.length, givenBy: r.given_by, hasFixedTest: !!settings.fixedTestPath,
        };
      });
    return NextResponse.json({ evaluations });
  }

  // Coordinación y administración.
  const scope = await scopeStudents(admin, role, user.id);
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  let q = admin.from("kiru_evaluations").select("*").neq("status", "cancelada").gte("due_on", since).order("due_on");
  if (scope) q = q.in("student_id", scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]);
  const { data: rows } = await q;
  let sq = admin.from("profiles").select("id,full_name").eq("role", "alumno").eq("is_active", true).order("full_name");
  if (scope) sq = sq.in("id", scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]);
  const { data: studentRows } = await sq;
  const studentIds = (studentRows ?? []).map((s) => s.id);
  const [{ data: overrides }, { data: firstLogs }] = await Promise.all([
    studentIds.length ? admin.from("kiru_evaluation_students").select("*").in("student_id", studentIds) : Promise.resolve({ data: [] }),
    studentIds.length ? admin.from("kiru_session_logs").select("student_id,session_date").in("student_id", studentIds).not("session_date", "is", null).order("session_date").limit(2000) : Promise.resolve({ data: [] }),
  ]);
  const firstSession = new Map<string, string>();
  for (const l of firstLogs ?? []) if (l.student_id && l.session_date && !firstSession.has(l.student_id)) firstSession.set(l.student_id, l.session_date);
  const who = await names(admin, [...(rows ?? []).flatMap((r) => [r.student_id, r.mentor_id, r.academic_by])]);
  const holidays = await holidaysFor(admin, (rows ?? []).map((r) => r.due_on));
  const settings = role === "admin" ? await loadEvalSettings(admin) : null;
  const payload: StaffEvaluationsPayload = {
    role: role as "admin" | "coordinador",
    rows: (rows ?? []).map((r): StaffEvaluationView => ({
      id: r.id, studentId: r.student_id, studentName: who.get(r.student_id) ?? "", target: r.target, cycle: r.cycle,
      mentorId: r.mentor_id, mentorName: r.mentor_id ? who.get(r.mentor_id) ?? "" : "", dueOn: r.due_on, originalDueOn: r.original_due_on,
      status: r.status, completedAt: r.completed_at, completedVia: r.completed_via, late: r.late,
      academicStatus: r.academic_status, academicName: r.academic_name, academicByName: r.academic_by ? who.get(r.academic_by) ?? "" : "",
      scans: r.scan_paths.length, givenBy: r.given_by, note: r.note, holiday: holidays.get(r.due_on) ?? null,
    })),
    students: (studentRows ?? []).map((s) => {
      const o = (overrides ?? []).find((x) => x.student_id === s.id);
      return {
        studentId: s.id, studentName: s.full_name, familyStartOn: o?.family_start_on ?? null, firstSession: firstSession.get(s.id) ?? null,
        skipInitial: o?.skip_initial ?? false, paused: o?.paused ?? false,
      };
    }),
    settings: settings ? { mode: settings.mode, testStudents: settings.testStudents, hasFixedTest: !!settings.fixedTestPath } : null,
    allStudents: (studentRows ?? []).map((s) => ({ id: s.id, name: s.full_name })),
  };
  return NextResponse.json(payload);
}

function addWeek(today: string) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** Puede tocar esta evaluación: el mentor, la suya; coordinación, las de sus alumnos; admin, todas. */
async function canTouch(admin: Admin, role: string, userId: string, e: EvaluationRow) {
  if (role === "admin") return true;
  if (role === "mentor") return e.mentor_id === userId && e.target === "alumno";
  if (role === "coordinador") {
    const scope = await scopeStudents(admin, role, userId);
    return !!scope?.includes(e.student_id);
  }
  return false;
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, ["mentor", "coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;
  const staff = role === "admin" || role === "coordinador";
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("Petición no válida."); }
  const action = text(body.accion, 40);

  // Ajustes generales (solo administración).
  if (action === "ajustes") {
    if (role !== "admin") return fail("Solo administración cambia estos ajustes.", 403);
    const mode = body.modo as EvalMode;
    if (!["apagado", "prueba", "activo"].includes(mode)) return fail("Modo no válido.");
    const tests = Array.isArray(body.alumnosPrueba) ? body.alumnosPrueba.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, 50) : [];
    const { error } = await saveEvalSettings(admin, { modo: mode, alumnos_prueba: tests });
    if (error) return fail("No se pudieron guardar los ajustes.", 500);
    return NextResponse.json({ ok: true });
  }

  if (action === "test_fijo_subir" || action === "test_fijo_confirmar" || action === "test_fijo_ver") {
    if (action !== "test_fijo_ver" && role !== "admin") return fail("Solo administración sube el test fijo.", 403);
    if (action === "test_fijo_subir") {
      const path = `test-fijo/test-${Date.now()}.pdf`;
      const { data, error } = await admin.storage.from(EVAL_BUCKET).createSignedUploadUrl(path);
      if (error || !data) return fail("No se pudo preparar la subida.", 500);
      return NextResponse.json({ path, token: data.token });
    }
    const settings = await loadEvalSettings(admin);
    if (action === "test_fijo_confirmar") {
      const path = text(body.path, 200);
      if (!path.startsWith("test-fijo/")) return fail("Archivo no válido.");
      const { error } = await saveEvalSettings(admin, { test_fijo_path: path });
      if (error) return fail("No se pudo guardar.", 500);
      if (settings.fixedTestPath && settings.fixedTestPath !== path) await admin.storage.from(EVAL_BUCKET).remove([settings.fixedTestPath]);
      return NextResponse.json({ ok: true });
    }
    if (!settings.fixedTestPath) return fail("Todavía no se ha subido el test fijo.", 404);
    const { data } = await admin.storage.from(EVAL_BUCKET).createSignedUrl(settings.fixedTestPath, 300);
    return data ? NextResponse.json({ url: data.signedUrl }) : fail("No se pudo abrir el archivo.", 500);
  }

  // Ajustes de un alumno.
  if (action === "alumno_ajustes") {
    if (!staff) return fail("No tienes permisos.", 403);
    const studentId = text(body.studentId, 40);
    if (!UUID_RE.test(studentId)) return fail("Alumno no válido.");
    const scope = await scopeStudents(admin, role, user.id);
    if (scope && !scope.includes(studentId)) return fail("Ese alumno no es de tu grupo.", 403);
    const start = body.familyStartOn === null || body.familyStartOn === "" ? null : body.familyStartOn;
    if (start !== null && !isDate(start)) return fail("Fecha no válida.");
    const { error } = await admin.from("kiru_evaluation_students").upsert({
      student_id: studentId, family_start_on: start as string | null, skip_initial: body.skipInitial === true, paused: body.paused === true,
      updated_by: user.id, updated_at: new Date().toISOString(),
    });
    if (error) return fail("No se pudo guardar.", 500);
    return NextResponse.json({ ok: true });
  }

  // El resto de acciones son sobre una evaluación.
  const id = text(body.evaluationId, 40);
  if (!UUID_RE.test(id)) return fail("Evaluación no válida.");
  const { data: e } = await admin.from("kiru_evaluations").select("*").eq("id", id).maybeSingle();
  if (!e) return fail("No encontramos esa evaluación.", 404);
  if (!(await canTouch(admin, role, user.id, e))) return fail("No tienes permisos para esta evaluación.", 403);
  const now = new Date().toISOString();
  const kid = async () => firstNameOf((await names(admin, [e.student_id])).get(e.student_id) ?? "");

  switch (action) {
    case "subir": {
      // Enlace firmado para subir directamente al almacén (sin pasar por Vercel, que limita a 4,5 MB).
      const which = text(body.which, 20);
      const mime = text(body.mime, 40);
      if (e.target !== "alumno") return fail("Esta evaluación no lleva archivos.");
      if (which !== "academica" && which !== "escaneo") return fail("Archivo no válido.");
      if (!MIME[mime] || (which === "academica" && mime !== "application/pdf")) {
        return fail(which === "academica" ? "La prueba académica tiene que ser un PDF." : "Sube un PDF o fotos (JPG, PNG, HEIC).");
      }
      if (which === "academica" && e.academic_status === "aprobada" && !staff) return fail("La prueba académica ya está aprobada.");
      const path = `${e.student_id}/${e.id}/${which}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${MIME[mime]}`;
      const { data, error } = await admin.storage.from(EVAL_BUCKET).createSignedUploadUrl(path);
      if (error || !data) return fail("No se pudo preparar la subida.", 500);
      return NextResponse.json({ path, token: data.token });
    }
    case "academica_confirmar": {
      const path = text(body.path, 300);
      if (!path.startsWith(`${e.student_id}/${e.id}/academica-`)) return fail("Archivo no válido.");
      const name = text(body.name, 200) || "Prueba académica";
      const status = staff ? "aprobada" : "por_aprobar";
      const previous = e.academic_path;
      const { error } = await admin.from("kiru_evaluations").update({
        academic_path: path, academic_name: name, academic_by: user.id, academic_status: status,
        academic_reviewed_by: staff ? user.id : null, academic_reviewed_at: staff ? now : null, updated_at: now,
      }).eq("id", e.id);
      if (error) return fail("No se pudo guardar.", 500);
      if (previous && previous !== path) await admin.storage.from(EVAL_BUCKET).remove([previous]);
      if (!staff) {
        await notifyEval(admin, e, await supervisorsOf(admin, e.student_id), `academica_por_aprobar_${Date.now()}`,
          `Aprobar la prueba académica de ${await kid()}`,
          `El mentor ha subido «${name}» para la evaluación en papel. Revísala en «Evaluaciones» y apruébala para que pueda imprimirla.`);
      }
      return NextResponse.json({ ok: true, status });
    }
    case "academica_revisar": {
      if (!staff) return fail("La aprueba coordinación o administración.", 403);
      if (e.academic_status !== "por_aprobar") return fail("No hay ninguna prueba pendiente de aprobar.");
      const approve = body.aprobar === true;
      const { error } = await admin.from("kiru_evaluations").update(approve
        ? { academic_status: "aprobada", academic_reviewed_by: user.id, academic_reviewed_at: now, updated_at: now }
        : { academic_status: "sin_elegir", academic_path: null, academic_name: "", academic_by: null, academic_reviewed_by: user.id, academic_reviewed_at: now, updated_at: now },
      ).eq("id", e.id);
      if (error) return fail("No se pudo guardar.", 500);
      if (!approve && e.academic_path) await admin.storage.from(EVAL_BUCKET).remove([e.academic_path]);
      if (e.mentor_id) {
        const reason = text(body.motivo, 300);
        await notifyEval(admin, e, [e.mentor_id], `academica_${approve ? "ok" : "no"}_${Date.now()}`,
          approve ? `Prueba académica aprobada · ${await kid()}` : `Hay que elegir otra prueba académica · ${await kid()}`,
          approve ? "Ya puedes imprimirla desde «Evaluaciones»." : `Coordinación ha pedido otra prueba.${reason ? ` Motivo: ${reason}` : ""}`);
      }
      return NextResponse.json({ ok: true });
    }
    case "escaneo_confirmar": {
      const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string" && p.startsWith(`${e.student_id}/${e.id}/escaneo-`)).slice(0, 20) : [];
      if (!paths.length) return fail("No se recibió ningún archivo.");
      const givenBy = text(body.givenBy, 120) || "Mentor habitual";
      const { error } = await admin.from("kiru_evaluations").update({
        scan_paths: [...e.scan_paths, ...paths], scan_by: user.id, scan_at: now, given_by: givenBy,
        status: "completada", completed_at: e.completed_at ?? now, completed_by: e.completed_by ?? user.id, completed_via: e.completed_via ?? "escaneo",
        updated_at: now,
      }).eq("id", e.id);
      if (error) return fail("No se pudo guardar.", 500);
      return NextResponse.json({ ok: true });
    }
    case "descargar": {
      const which = text(body.which, 20);
      let path: string | null = null;
      if (which === "academica") {
        if (role === "mentor" && e.academic_status !== "aprobada" && e.academic_by !== user.id) return fail("La prueba académica aún no está aprobada.");
        path = e.academic_path;
      } else if (which === "escaneo") {
        const i = Number(body.index ?? 0);
        path = Number.isInteger(i) ? e.scan_paths[i] ?? null : null;
      } else if (which === "test_fijo") {
        path = (await loadEvalSettings(admin)).fixedTestPath;
      }
      if (!path) return fail("Ese archivo todavía no está subido.", 404);
      const { data } = await admin.storage.from(EVAL_BUCKET).createSignedUrl(path, 300);
      return data ? NextResponse.json({ url: data.signedUrl }) : fail("No se pudo abrir el archivo.", 500);
    }
    case "mover": {
      if (!staff) return fail("La fecha la cambia coordinación.", 403);
      const due = body.dueOn;
      if (!isDate(due)) return fail("Fecha no válida.");
      if (e.status === "completada") return fail("Esta evaluación ya está hecha.");
      // Con la fecha nueva vuelve a empezar: se abre ese día y los avisos salen otra vez.
      const { error } = await admin.from("kiru_evaluations").update({
        due_on: due, status: "programada", opened_at: null, opened_on: null, steps: [], moved_by: user.id,
        note: text(body.note, 1000) || e.note, updated_at: now,
      }).eq("id", e.id);
      if (error) return fail("No se pudo cambiar la fecha.", 500);
      return NextResponse.json({ ok: true });
    }
    case "completar": {
      if (!staff) return fail("Solo coordinación puede marcarla como hecha a mano.", 403);
      if (e.status === "completada") return NextResponse.json({ ok: true });
      const { error } = await admin.from("kiru_evaluations").update({
        status: "completada", completed_at: now, completed_by: user.id, completed_via: "manual", note: text(body.note, 1000) || e.note, updated_at: now,
      }).eq("id", e.id);
      if (error) return fail("No se pudo guardar.", 500);
      return NextResponse.json({ ok: true });
    }
    case "cancelar": {
      if (!staff) return fail("No tienes permisos.", 403);
      if (!(ACTIVE as readonly string[]).includes(e.status) && e.status !== "sin_respuesta") return fail("No se puede cancelar.");
      const { error } = await admin.from("kiru_evaluations").update({ status: "cancelada", note: text(body.note, 1000) || e.note, updated_at: now }).eq("id", e.id);
      if (error) return fail("No se pudo guardar.", 500);
      return NextResponse.json({ ok: true });
    }
    default:
      return fail("Acción no válida.");
  }
}
