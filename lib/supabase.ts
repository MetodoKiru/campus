import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Keep Next.js prerender/build from crashing if Preview env vars are missing.
// Real authentication/data requests still require the real Supabase variables
// to be configured in Vercel for the environment being deployed.
const clientUrl = supabaseUrl || "http://127.0.0.1:54321";
const clientKey = supabaseAnonKey || "build-placeholder-anon-key";

// La sesión se guarda por pestaña (sessionStorage), no en todo el navegador:
// así se puede tener abierta una cuenta distinta en cada pestaña (admin en una,
// mentor en otra) sin que una pise a la otra. Al cerrar la pestaña se cierra la sesión.
const tabStorage = typeof window !== "undefined" ? window.sessionStorage : undefined;

export const supabase = createClient<Database>(clientUrl, clientKey, {
  auth: { storage: tabStorage, persistSession: true },
});
