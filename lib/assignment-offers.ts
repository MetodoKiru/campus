// Propuestas de alumno a mentores: estados, plazos y mensajes de WhatsApp.
// Lo comparten el panel de administración/coordinación y las rutas del servidor.

/** Plazo para responder a una propuesta antes de que cuente como «Sin respuesta». */
export const NO_RESPONSE_HOURS = 72;

export type OfferAnswer = "si" | "ajustar" | "no";
export type OfferDecision = "seleccionado" | "sustituto" | "no_seleccionado";

export const ANSWER_LABEL: Record<OfferAnswer, string> = {
  si: "Disponible",
  ajustar: "Propone otro horario",
  no: "No disponible",
};

export const DECISION_LABEL: Record<OfferDecision, string> = {
  seleccionado: "Seleccionado",
  sustituto: "Sustituto previsto",
  // Solo para este alumno: el mentor sigue en el equipo y recibe otras propuestas.
  no_seleccionado: "No seleccionado para este alumno",
};

/** Código opaco de la oferta: nunca lleva nombre ni dato del alumno. */
export const OFFER_CODE_RE = /^OF-[0-9a-f]{20}$/;

export type StaffOffer = {
  id: string;
  code: string;
  studentLabel: string;
  mentorId: string | null;
  mentorName: string;
  mentorEmail: string;
  mentorPhone: string;
  course: string;
  studentProfile: string;
  zone: string;
  intensity: string;
  slots: string;
  sentAt: string;
  response: OfferAnswer | null;
  responseDetail: string;
  respondedAt: string | null;
  responseSource: "correo" | "campus" | null;
  reminderSentAt: string | null;
  callRequestedAt: string | null;
  callDoneAt: string | null;
  callNotes: string;
  decision: OfferDecision | null;
  decisionNote: string;
  decidedAt: string | null;
  closedAt: string | null;
};

export type OfferEvent = { offerId: string; action: string; detail: string; actorName: string; createdAt: string };

export type OfferStage =
  | "cerrada" | "seleccionado" | "sustituto" | "no_seleccionado"
  | "llamada_hecha" | "llamada_solicitada"
  | "si" | "ajustar" | "no"
  | "esperando" | "sin_respuesta";

export const STAGE_LABEL: Record<OfferStage, string> = {
  cerrada: "Cerrada",
  seleccionado: DECISION_LABEL.seleccionado,
  sustituto: DECISION_LABEL.sustituto,
  no_seleccionado: DECISION_LABEL.no_seleccionado,
  llamada_hecha: "Llamada hecha",
  llamada_solicitada: "Llamada solicitada",
  si: ANSWER_LABEL.si,
  ajustar: ANSWER_LABEL.ajustar,
  no: ANSWER_LABEL.no,
  esperando: "Esperando respuesta",
  sin_respuesta: "Sin respuesta",
};

export function hoursSince(iso: string, now = Date.now()): number {
  return (now - new Date(iso).getTime()) / 36e5;
}

/** Estado que se enseña. «Sin respuesta» sale del plazo; no se guarda. */
export function offerStage(o: Pick<StaffOffer, "closedAt" | "decision" | "callDoneAt" | "callRequestedAt" | "response" | "sentAt">, now = Date.now()): OfferStage {
  if (o.closedAt) return "cerrada";
  if (o.decision) return o.decision;
  if (o.callDoneAt) return "llamada_hecha";
  if (o.callRequestedAt) return "llamada_solicitada";
  if (o.response) return o.response;
  return hoursSince(o.sentAt, now) >= NO_RESPONSE_HOURS ? "sin_respuesta" : "esperando";
}

/** Horas que quedan para responder (0 si ya pasó el plazo). */
export function hoursLeft(sentAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil(NO_RESPONSE_HOURS - hoursSince(sentAt, now)));
}

/** Teléfono para wa.me: solo cifras y con prefijo de España si viene sin él. */
export function waPhone(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^[6789]\d{8}$/.test(digits)) digits = "34" + digits;
  return /^\d{10,15}$/.test(digits) ? digits : "";
}

export type WhatsAppKind = "nueva" | "recordatorio" | "llamada";

/**
 * Mensajes preparados. Solo llevan curso y municipio: nada que identifique al
 * alumno. Administración los revisa y los envía a mano desde WhatsApp.
 */
export function whatsappText(kind: WhatsAppKind, o: Pick<StaffOffer, "mentorName" | "course" | "zone">): string {
  const name = (o.mentorName || "").trim().split(/\s+/)[0] || "";
  const hola = name ? `Hola ${name}` : "Hola";
  const que = [o.course, o.zone].map((x) => (x || "").trim()).filter(Boolean).join(", ");
  const alumno = que ? `un posible alumno (${que})` : "un posible alumno";
  if (kind === "nueva") {
    return `${hola}, te escribimos de Método Kiru. Te acabamos de enviar un correo con ${alumno} que podría encajar contigo. ` +
      "¿Puedes mirarlo y responder desde el correo o desde tu panel del campus (menú ☰ → Asignación de alumnos)? " +
      "Si no te encaja, pulsar «No puedo» también nos ayuda. ¡Gracias!";
  }
  if (kind === "recordatorio") {
    return `${hola}, te escribimos de Método Kiru. Hace unos días te enviamos una propuesta con ${alumno} y todavía no tenemos tu respuesta. ` +
      "¿Puedes contestar hoy desde el correo o desde tu panel del campus? Si no te encaja, pulsa «No puedo» y buscamos otra opción. ¡Gracias!";
  }
  return `${hola}, gracias por responder a la propuesta de alumno${que ? ` (${que})` : ""}. ` +
    "Antes de confirmar la asignación nos gustaría hablar contigo unos 10 minutos. ¿Qué día y hora te vienen bien esta semana?";
}

/** Enlace que abre WhatsApp con el destinatario y el mensaje; nunca envía nada solo. */
export function whatsappLink(phone: string, text: string): string {
  const p = waPhone(phone);
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : "";
}

export function mailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
