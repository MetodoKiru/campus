// Teléfonos de Método Kiru: siempre formato español (+34) y validados como número
// español (móvil o fijo de 9 cifras que empieza por 6, 7, 8 o 9). Un número que no
// cumpla se guarda vacío, para no arrastrar teléfonos mal escritos.

/** Deja solo las cifras nacionales (9 dígitos) de un teléfono español, o "" si no es válido. */
function spanishDigits(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("0034")) digits = digits.slice(4);
  else if (digits.startsWith("34") && digits.length === 11) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 10) digits = digits.slice(1);
  return /^[6789]\d{8}$/.test(digits) ? digits : "";
}

/** Normaliza a «+34 XXX XX XX XX»; "" si no es un teléfono español válido. */
export function normalizeSpanishPhone(raw: string): string {
  const d = spanishDigits(raw);
  if (!d) return "";
  return `+34 ${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

/** Forma compacta «+34XXXXXXXXX» (sin espacios); "" si no es válido. */
export function spanishPhoneCompact(raw: string): string {
  const d = spanishDigits(raw);
  return d ? `+34${d}` : "";
}

/** ¿Es un teléfono español válido? */
export function isSpanishPhone(raw: string): boolean {
  return spanishDigits(raw) !== "";
}

/** Solo cifras con prefijo 34 (sin «+») para enlaces de wa.me; "" si no es válido. */
export function waDigits(raw: string): string {
  const d = spanishDigits(raw);
  return d ? `34${d}` : "";
}
