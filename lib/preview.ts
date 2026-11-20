/**
 * «Ver el campus como…»: administración abre el panel de un alumno, una familia,
 * un mentor, un coordinador o un formador para ver CÓMO es, sin datos de nadie.
 *
 * Mientras la vista previa está activa (solo en esa pestaña):
 *  · toda lectura de la base de datos devuelve una lista vacía (salvo un «Alumno de
 *    ejemplo» inventado, para que familia y mentor vean su panel con alguien), así
 *    que no se ve ningún dato confidencial (ni siquiera los que administración ve);
 *  · todo intento de guardar, borrar o subir algo se rechaza sin tocar nada;
 *  · las rutas /api del campus responden «vista previa» en lugar de datos.
 * Solo se deja pasar el inicio de sesión (/auth/v1), para saber quién es.
 *
 * Se activa con ?previa=<rol> y se recuerda en la pestaña (sessionStorage) para
 * que siga activa al moverse dentro del panel. Se apaga al volver a /admin o
 * /previsualizacion, o con el botón «Salir de la vista previa».
 */

export const PREVIEW_ROLES = ["alumno", "padre", "mentor", "coordinador", "formador"] as const;
export type PreviewRole = (typeof PREVIEW_ROLES)[number];

export const PREVIEW_LABEL: Record<PreviewRole, string> = {
  alumno: "un alumno",
  padre: "una familia",
  mentor: "un mentor",
  coordinador: "un coordinador",
  formador: "un formador",
};

/** Nombre que se muestra en la cabecera de cada panel durante la vista previa. */
export const PREVIEW_NAME: Record<PreviewRole, string> = {
  alumno: "Alumno de ejemplo",
  padre: "Familia de ejemplo",
  mentor: "Mentor de ejemplo",
  coordinador: "Coordinador de ejemplo",
  formador: "Formador de ejemplo",
};

const FLAG = "kiru_preview_role";
const OUTSIDE = ["/admin", "/previsualizacion"];

const isRole = (value: unknown): value is PreviewRole => typeof value === "string" && (PREVIEW_ROLES as readonly string[]).includes(value);

/** Rol que se está previsualizando en esta pestaña, o null si no hay vista previa. */
export function previewRole(): PreviewRole | null {
  if (typeof window === "undefined") return null;
  try {
    if (OUTSIDE.some((p) => window.location.pathname.startsWith(p))) {
      window.sessionStorage.removeItem(FLAG);
      return null;
    }
    const fromUrl = new URLSearchParams(window.location.search).get("previa");
    if (isRole(fromUrl)) {
      window.sessionStorage.setItem(FLAG, fromUrl);
      return fromUrl;
    }
    const saved = window.sessionStorage.getItem(FLAG);
    return isRole(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function endPreview() {
  try { window.sessionStorage.removeItem(FLAG); } catch { /* nada */ }
}

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

/** Alumno ficticio para que la familia y el mentor vean su panel con un hijo/alumno. */
export const PREVIEW_STUDENT_ID = "00000000-0000-4000-8000-00000000e1e1";

/** Filas inventadas que se devuelven en la vista previa (nunca datos reales). */
function sampleRows(table: string): unknown[] {
  const now = new Date().toISOString();
  switch (table) {
    case "student_guardians":
      return [{ student_id: PREVIEW_STUDENT_ID, guardian_id: "preview" }];
    case "student_mentors":
      return [{ student_id: PREVIEW_STUDENT_ID, mentor_id: "preview", assigned_at: now }];
    case "profiles":
      return [{ id: PREVIEW_STUDENT_ID, full_name: "Alumno de ejemplo", username: "alumno.ejemplo", role: "alumno", is_active: true }];
    default:
      return [];
  }
}

const BLOCKED_SAVE = "Vista previa: aquí no se guarda nada.";
const NO_DATA = "Vista previa: aquí aparecerían los datos reales.";

function requestInfo(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  return { url, method, accept: headers.get("accept") ?? "" };
}

/**
 * Respuesta de mentira para una petición hecha durante la vista previa, o null
 * si la petición puede salir de verdad (inicio de sesión y archivos de la web).
 */
function previewResponse(input: RequestInfo | URL, init?: RequestInit): Response | null {
  const { url, method, accept } = requestInfo(input, init);
  let path: string;
  try { path = new URL(url, window.location.href).pathname; } catch { return null; }

  if (path.includes("/auth/v1/")) return null;

  if (path.includes("/rest/v1/")) {
    if ((method === "GET" || method === "HEAD") && !path.includes("/rest/v1/rpc/")) {
      // .single() pide un objeto: se contesta «no hay fila», como si no existiera.
      if (accept.includes("vnd.pgrst.object")) return json({ code: "PGRST116", message: NO_DATA, details: null, hint: null }, 406);
      const table = path.split("/rest/v1/")[1]?.split("/")[0] ?? "";
      const rows = sampleRows(table);
      return json(rows, 200, { "Content-Range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" });
    }
    return json({ code: "PREVIEW", message: BLOCKED_SAVE, details: null, hint: null }, 403);
  }
  if (path.includes("/storage/v1/") || path.includes("/functions/v1/")) return json({ error: NO_DATA, message: NO_DATA }, 403);
  if (path.startsWith("/api/")) return json({ error: method === "GET" ? NO_DATA : BLOCKED_SAVE }, 403);
  return null;
}

let installed = false;

/** Envuelve fetch una sola vez, al cargar la web, antes de que ningún panel pida datos. */
export function installPreviewGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (previewRole()) {
      const fake = previewResponse(input, init);
      if (fake) return Promise.resolve(fake);
    }
    return original(input, init);
  };
}

installPreviewGuard();
