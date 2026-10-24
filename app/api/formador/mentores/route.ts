import { NextResponse } from "next/server";
import type { MentorOnboardingRow } from "@/lib/database.types";
import { EMAIL_RE, UUID_RE, requireStaff } from "@/lib/server/require-staff";

export const runtime = "nodejs";
const STAFF = ["formador", "admin"] as const;

/** Lista los mentores en incorporación con lo que le falta a cada uno. */
export async function GET(request: Request) {
  const auth = await requireStaff(request, STAFF);
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const { data: rows, error } = await admin
    .from("kiru_mentor_onboarding")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "No se pudieron cargar los mentores en incorporación." }, { status: 500 });

  const profileIds = (rows ?? []).map((row) => row.profile_id).filter((id): id is string => Boolean(id));
  const [profilesResult, assignmentsResult] = profileIds.length
    ? await Promise.all([
        admin.from("profiles").select("id,username,is_active").in("id", profileIds),
        admin.from("student_mentors").select("mentor_id").in("mentor_id", profileIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (profilesResult.error || assignmentsResult.error) {
    return NextResponse.json({ error: "No se pudo comprobar el estado de las cuentas." }, { status: 500 });
  }

  const profileById = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));
  const studentCount = new Map<string, number>();
  for (const a of assignmentsResult.data ?? []) studentCount.set(a.mentor_id, (studentCount.get(a.mentor_id) ?? 0) + 1);

  const lastSignIn = new Map<string, string | null>();
  await Promise.all(profileIds.map(async (id) => {
    const { data } = await admin.auth.admin.getUserById(id);
    lastSignIn.set(id, data.user?.last_sign_in_at ?? null);
  }));

  const mentors = (rows ?? []).map((row) => {
    const profile = row.profile_id ? profileById.get(row.profile_id) : undefined;
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
      createdAt: row.created_at,
      confidentialitySignedAt: row.confidentiality_signed_at,
      certificateCheckedAt: row.certificate_checked_at,
      account: profile ? { username: profile.username, isActive: profile.is_active, lastSignInAt: lastSignIn.get(profile.id) ?? null } : null,
      students: profile ? studentCount.get(profile.id) ?? 0 : 0,
    };
  });
  return NextResponse.json({ mentors });
}

/** Da de alta la ficha de un mentor seleccionado (aún sin cuenta). */
export async function POST(request: Request) {
  const auth = await requireStaff(request, STAFF);
  if (!auth.ok) return auth.response;

  let body: { fullName?: unknown; email?: unknown; phone?: unknown; notes?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!fullName || fullName.length > 160 || !EMAIL_RE.test(email) || (phone && phone.length > 30) || notes.length > 2000) {
    return NextResponse.json({ error: "Revisa el nombre, el correo y el teléfono." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("kiru_mentor_onboarding")
    .insert({ full_name: fullName, email, phone, notes, created_by: auth.user.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya hay una ficha abierta con ese correo." }, { status: 409 });
    return NextResponse.json({ error: "No se pudo crear la ficha." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

/** Marca o desmarca confidencialidad y certificado, guarda notas o archiva la ficha. */
export async function PATCH(request: Request) {
  const auth = await requireStaff(request, STAFF);
  if (!auth.ok) return auth.response;

  let body: { id?: unknown; confidentiality?: unknown; certificate?: unknown; notes?: unknown; archived?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Ficha no válida." }, { status: 400 });

  const now = new Date().toISOString();
  const updates: Partial<MentorOnboardingRow> = {};
  if (typeof body.confidentiality === "boolean") {
    updates.confidentiality_signed_at = body.confidentiality ? now : null;
    updates.confidentiality_checked_by = body.confidentiality ? auth.user.id : null;
  }
  if (typeof body.certificate === "boolean") {
    updates.certificate_checked_at = body.certificate ? now : null;
    updates.certificate_checked_by = body.certificate ? auth.user.id : null;
  }
  if (typeof body.notes === "string") {
    if (body.notes.length > 2000) return NextResponse.json({ error: "Las notas son demasiado largas." }, { status: 400 });
    updates.notes = body.notes.trim();
  }
  if (typeof body.archived === "boolean") updates.archived_at = body.archived ? now : null;
  if (!Object.keys(updates).length) return NextResponse.json({ error: "No hay cambios para guardar." }, { status: 400 });

  const { data, error } = await auth.admin.from("kiru_mentor_onboarding").update(updates).eq("id", id).select("id");
  if (error) return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "No se encontró la ficha." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
