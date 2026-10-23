import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type CandidateStaffSuccess = {
  ok: true;
  admin: SupabaseClient;
  user: User;
  role: "admin" | "formador";
};

type CandidateStaffFailure = {
  ok: false;
  response: NextResponse;
};

export async function requireCandidateStaff(request: Request): Promise<CandidateStaffSuccess | CandidateStaffFailure> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: "El servicio no está configurado." }, { status: 503 }),
    };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 }),
    };
  }

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "La sesión no es válida o ha caducado." }, { status: 401 }),
    };
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  const role = profile?.role;
  if (
    profileError ||
    !profile ||
    !profile.is_active ||
    (role !== "admin" && role !== "formador") ||
    data.user.app_metadata?.kiru_role !== role
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No tienes permisos para acceder a las candidaturas." }, { status: 403 }),
    };
  }

  return { ok: true, admin, user: data.user, role };
}
