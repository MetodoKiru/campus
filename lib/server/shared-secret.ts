import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comprueba la clave compartida que manda un Apps Script en la cabecera
 * «Authorization: Bearer …». Compara huellas de igual longitud para no revelar
 * nada por el tiempo de respuesta. Una clave de menos de 24 caracteres en
 * Vercel se trata como no configurada.
 */
export function sharedSecretStatus(request: Request, expected: string | undefined): "missing" | "invalid" | "ok" {
  if (!expected || expected.length < 24) return "missing";
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!given) return "invalid";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) ? "ok" : "invalid";
}
