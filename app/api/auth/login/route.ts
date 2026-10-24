import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Resolves a Kiru username to its Supabase Auth email on the server.
 * The service-role key must remain server-only and must never use NEXT_PUBLIC_.
 */
export async function POST(request: Request) {
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "El acceso seguro aún no está configurado. Contacta con administración." },
      { status: 503 }
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || username.length > 80 || password.length > 256) {
    return NextResponse.json({ error: "Introduce tu usuario y contraseña." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Do not reveal whether a username exists.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, username, is_active")
    .eq("username", username)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
  const email = authUserData.user?.email;
  if (authUserError || !email) {
    // Same answer as a wrong password, so the response never confirms that a username exists.
    console.error("Kiru login: profile without a usable Auth email", profile.id);
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  // Only return the session to the person who has just proved their password.
  return NextResponse.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    user: { id: data.user.id },
  });
}
