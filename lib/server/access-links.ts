import { createHash, randomBytes } from "node:crypto";

/** Días que vale un enlace «Crea tu PIN» desde que sale en el correo. */
export const ACCESS_LINK_DAYS = 14;

/** 32 bytes al azar en base64url: 43 caracteres imposibles de adivinar. */
export function newAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export const ACCESS_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** En la base solo se guarda la huella; el enlace solo existe en el correo. */
export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** El PIN del campus son 6 números, como en las cuentas que crea administración. */
export function pinProblem(pin: string): string | null {
  if (!/^[0-9]{6}$/.test(pin)) return "El PIN tiene que tener exactamente 6 números.";
  if (/^(\d)\1{5}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
    return "Ese PIN es muy fácil de adivinar. Elige otro.";
  }
  return null;
}

/**
 * Nombre de pila + primer apellido, solo minúsculas, números y puntos:
 * «Carmen Blanco» → «carmen.blanco», «Miguel Ángel Arévalo Galán» → «miguel.arevalo».
 * Con 4 palabras o más se entiende que hay nombre compuesto y dos apellidos.
 */
export function usernameBase(fullName: string): string {
  const parts = fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const surname = parts.length >= 4 ? parts[parts.length - 2] : parts[1];
  const base = [parts[0], surname].filter(Boolean).join(".").slice(0, 34).replace(/\.+$/, "");
  return base.length >= 3 ? base : `mentor.${base}`.replace(/\.$/, "");
}
