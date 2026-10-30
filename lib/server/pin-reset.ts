/** Roles que pueden recuperar el PIN solos por correo. Administración no (lo hace desde Supabase) y los alumnos no tienen correo propio. */
export const SELF_RESET_ROLES = ["mentor", "padre", "coordinador", "formador"] as const;

/** Entre dos peticiones de la misma cuenta, y cuántas como mucho al día: así nadie puede llenarle el buzón a otro. */
export const RESET_COOLDOWN_MINUTES = 10;
export const RESET_MAX_PER_DAY = 3;
/** Una petición que el script no recoge en este tiempo ya no se envía. */
export const RESET_PENDING_HOURS = 2;

/** A dónde va cada rol al entrar. */
export function homeForRole(role: string): string {
  if (role === "alumno" || role === "mentor" || role === "padre" || role === "formador" || role === "coordinador" || role === "admin") return `/${role}`;
  return "/";
}
