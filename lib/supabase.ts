import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Keep Next.js prerender/build from crashing if Preview env vars are missing.
// Real authentication/data requests still require the real Supabase variables
// to be configured in Vercel for the environment being deployed.
const clientUrl = supabaseUrl || "http://127.0.0.1:54321";
const clientKey = supabaseAnonKey || "build-placeholder-anon-key";

export const supabase = createClient(clientUrl, clientKey);
