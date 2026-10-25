import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { UUID_RE, requireStaff } from "@/lib/server/require-staff";

export const runtime = "nodejs";

/**
 * Crea la cuenta de campus de un mentor en incorporación. Solo se permite cuando
 * el acuerdo de confidencialidad y el certificado están comprobados. El PIN se
 * genera aquí y se devuelve una única vez para que el formador se lo entregue.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ["formador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Ficha no válida." }, { status: 400 });

  let body: { username?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    return NextResponse.json({ error: "El usuario debe tener entre 3 y 40 letras minúsculas, números, puntos o guiones." }, { status: 400 });
  }

  const { data: row, error: rowError } = await admin.from("kiru_mentor_onboarding").select("*").eq("id", id).maybeSingle();
  if (rowError || !row || row.archived_at) return NextResponse.json({ error: "No se encontró la ficha." }, { status: 404 });
  if (row.profile_id) return NextResponse.json({ error: "Este mentor ya tiene cuenta." }, { status: 409 });
  if (!row.confidentiality_signed_at || !row.certificate_checked_at) {
    return NextResponse.json({ error: "Antes de crear la cuenta tienen que estar comprobados la confidencialidad y el certificado." }, { status: 409 });
  }

  const { data: duplicate } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (duplicate) return NextResponse.json({ error: "Ese nombre de usuario ya existe." }, { status: 409 });

  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: row.email,
    password: pin,
    email_confirm: true,
    user_metadata: { full_name: row.full_name },
    app_metadata: { kiru_role: "mentor" },
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: "No se pudo crear la cuenta. Puede que ese correo ya tenga una." }, { status: 400 });
  }

  const userId = created.user.id;
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, full_name: row.full_name, username, role: "mentor", is_active: true }, { onConflict: "id" });
  // Solo se enlaza si la ficha sigue sin cuenta, por si dos personas pulsan a la vez.
  const link = profileError
    ? null
    : await admin.from("kiru_mentor_onboarding").update({ profile_id: userId }).eq("id", id).is("profile_id", null).select("id");
  if (profileError || !link || link.error || !link.data?.length) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "No se pudo completar el alta. No se ha creado la cuenta; inténtalo de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, username, pin }, { status: 201 });
}
