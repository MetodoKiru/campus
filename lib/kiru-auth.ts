import { supabase } from "./supabase";

export type KiruRole = "admin" | "mentor" | "padre" | "alumno";

export interface KiruProfile {
  id: string;
  full_name: string;
  role: KiruRole;
  is_active: boolean;
}

/**
 * Inicia sesión con Supabase Auth. La contraseña nunca se guarda en localStorage.
 * La aplicación debe tener el usuario creado en Supabase Auth y su perfil asociado.
 */
export async function signInKiru(email: string, password: string): Promise<KiruProfile> {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (authError || !authData.user) {
    throw new Error("No se ha podido iniciar sesión. Comprueba el correo y la contraseña.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    throw new Error("La cuenta no tiene un perfil de Método Kiru asociado. Contacta con administración.");
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error("Esta cuenta está desactivada. Contacta con administración.");
  }

  const allowedRoles: KiruRole[] = ["admin", "mentor", "padre", "alumno"];
  if (!allowedRoles.includes(profile.role as KiruRole)) {
    await supabase.auth.signOut();
    throw new Error("El perfil de esta cuenta no tiene un rol válido.");
  }

  return profile as KiruProfile;
}

export async function getKiruSessionProfile(): Promise<KiruProfile | null> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;
  return data as KiruProfile;
}

export async function signOutKiru(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("No se ha podido cerrar la sesión. Inténtalo de nuevo.");
}

export function routeForKiruRole(role: KiruRole): string {
  switch (role) {
    case "admin": return "/admin";
    case "mentor": return "/mentor";
    case "padre": return "/padre";
    case "alumno": return "/alumno";
  }
}
