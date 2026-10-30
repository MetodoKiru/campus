import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Días que vale un enlace «Crea tu PIN» desde que sale en el correo de bienvenida. */
export const ACCESS_LINK_DAYS = 14;
/** Horas que vale el enlace de «¿Has olvidado tu PIN?». */
export const RESET_LINK_HOURS = 24;

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

/**
 * Crea un enlace «Crea tu PIN» de un solo uso para esa cuenta. Los anteriores
 * sin usar dejan de valer. Devuelve null si no se pudo guardar.
 */
export async function issueAccessLink(
  admin: SupabaseClient<Database>,
  profileId: string,
  baseUrl: string,
  validForMs: number,
): Promise<{ accessUrl: string; expiresAt: string } | null> {
  await admin.from("kiru_access_links").delete().eq("profile_id", profileId).is("used_at", null);
  const token = newAccessToken();
  const expiresAt = new Date(Date.now() + validForMs).toISOString();
  const { error } = await admin
    .from("kiru_access_links")
    .insert({ profile_id: profileId, token_hash: hashAccessToken(token), expires_at: expiresAt });
  if (error) return null;
  return { accessUrl: new URL(`/acceso#t=${token}`, baseUrl).toString(), expiresAt };
}
