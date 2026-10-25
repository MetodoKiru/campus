import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";

export const runtime = "nodejs";

/**
 * Última vez que cada mentor entró al campus. Ese dato solo está en auth.users,
 * que no se puede leer desde el navegador. El coordinador recibe solo los de sus
 * mentores; administración, los de todos.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, ["coordinador", "admin"]);
  if (!auth.ok) return auth.response;
  const { admin, user, role } = auth;

  const mentorsResult = role === "admin"
    ? await admin.from("profiles").select("id").eq("role", "mentor")
    : await admin.from("kiru_coordinator_mentors").select("id:mentor_id").eq("coordinator_id", user.id);
  if (mentorsResult.error) return NextResponse.json({ error: "No se pudieron cargar los mentores." }, { status: 500 });

  const lastSignIn: Record<string, string | null> = {};
  await Promise.all((mentorsResult.data ?? []).map(async ({ id }) => {
    const { data } = await admin.auth.admin.getUserById(id);
    lastSignIn[id] = data.user?.last_sign_in_at ?? null;
  }));
  return NextResponse.json({ lastSignIn });
}
