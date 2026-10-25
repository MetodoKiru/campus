// Utilidades compartidas para los registros de sesión que llegan del formulario
// de Google «Registro de sesión» (hoja «Registro de sesión (respuestas)»).

/** Una pregunta del formulario con su respuesta, en el orden de la hoja. */
export type SessionAnswer = { q: string; a: string };

/** Minúsculas, sin tildes y sin espacios repetidos: «Álvaro » y «alvaro» son iguales. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca una persona por el nombre escrito en el formulario: primero el nombre
 * completo y, si en el formulario solo pone el nombre de pila («Paula»), por el
 * nombre de pila de la cuenta («Paula Ybarra»).
 */
export function matchByName<T extends { full_name: string }>(written: string, people: T[]): T[] {
  const wanted = normalizeName(written);
  if (!wanted) return [];
  const exact = people.filter((p) => normalizeName(p.full_name) === wanted);
  if (exact.length || wanted.includes(" ")) return exact;
  return people.filter((p) => normalizeName(p.full_name).split(" ")[0] === wanted);
}

/** Devuelve la respuesta cuya pregunta empieza por el texto indicado (sin tildes ni mayúsculas). */
export function findAnswer(answers: SessionAnswer[], questionStart: string): string {
  const wanted = normalizeName(questionStart);
  return answers.find((item) => normalizeName(item.q).startsWith(wanted))?.a ?? "";
}

export function parseAnswers(value: unknown): SessionAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SessionAnswer => Boolean(item) && typeof item.q === "string" && typeof item.a === "string");
}

const DAY = 24 * 60 * 60 * 1000;

/** Días enteros entre hoy y una fecha (AAAA-MM-DD o ISO). */
export function daysSince(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const time = new Date(value.length === 10 ? `${value}T12:00:00` : value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((now - time) / DAY));
}

/** Un registro va «con retraso» si se envió más de un día después de la sesión. */
export function isLate(sessionDate: string | null, submittedAt: string): boolean {
  if (!sessionDate) return false;
  const session = new Date(`${sessionDate}T23:59:59`).getTime();
  return new Date(submittedAt).getTime() - session > DAY;
}
