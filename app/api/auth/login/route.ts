import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Best-effort per-instance limiter. For stronger production protection, add a shared
// rate-limit service (serverless instances do not share this in-memory map).
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

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

  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera 15 minutos antes de volver a intentarlo." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
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
    return NextResponse.json(
      { error: "La cuenta todavía no está configurada para acceder. Contacta con administración." },
      { status: 403 }
    );
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
