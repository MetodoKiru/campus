// Pasos del menú del mentor y sus estados. Lo comparten el panel y las rutas del servidor.

export type StepId = "certificado" | "nuestro_equipo" | "llamadas" | "asignacion";

/**
 * Apartados del menú ☰. «Reuniones» y «Crece con Kiru» se abren al completar la
 * incorporación; «Registro de sesiones», «Mis pagos» y «Justificaciones de SkillCoins» están siempre (coordinación
 * puede pedir una justificación a cualquier mentor con alumnos).
 */
export type MentorSection = "reuniones" | "crece" | "justificaciones" | "sesiones" | "pagos" | "disponibilidad";
export const MENTOR_SECTIONS: MentorSection[] = ["reuniones", "crece", "justificaciones", "sesiones", "pagos", "disponibilidad"];

/** Estados que se enseñan al mentor. Cada uno sale de un dato real de la base. */
export type StepStatus = "pendiente" | "en_curso" | "enviado" | "en_revision" | "completado" | "requiere_correccion";

export const STATUS_LABEL: Record<StepStatus, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  enviado: "Enviado",
  en_revision: "En revisión",
  completado: "Completado",
  requiere_correccion: "Requiere corrección",
};

export const STEPS: { id: StepId; number: number; title: string }[] = [
  { id: "certificado", number: 1, title: "Certificado de delitos sexuales" },
  { id: "nuestro_equipo", number: 2, title: "Nuestro Equipo" },
  { id: "llamadas", number: 3, title: "Llamadas con las familias" },
  { id: "asignacion", number: 4, title: "Asignación de alumnos" },
];

export type OfferResponse = "si" | "ajustar" | "no";

/** Las tres respuestas del correo «Posible alumno para ti», con el mismo texto que sus botones. */
export const OFFER_RESPONSE_LABEL: Record<OfferResponse, string> = {
  si: "Sí, me comprometo",
  ajustar: "Puedo, ajustando días/horas",
  no: "No puedo",
};

export type MentorOffer = {
  id: string;
  course: string;
  studentProfile: string;
  zone: string;
  intensity: string;
  slots: string;
  sentAt: string;
  response: OfferResponse | null;
  responseDetail: string;
  respondedAt: string | null;
  /** Administración la cerró: ya no se puede responder. */
  closed: boolean;
};

export type MentorPanelData = {
  steps: Record<StepId, { status: StepStatus; date: string | null; note: string }>;
  offers: MentorOffer[];
  /** Nombre de la cuenta, para proponerlo al entregar el certificado. */
  mentorName: string;
  /** Última entrega del certificado desde el panel (vacía si lo entregó por otro canal). */
  certificate: { holderName: string; hasDocument: boolean };
  /** Enlace público del formulario «Nuestro Equipo» (Google Forms). */
  teamFormUrl: string;
  /** Formulario de llamadas en Jotform: vacío hasta que se definan sus campos. */
  callsFormUrl: string;
  /**
   * «Reuniones con tu coordinador» y «Crece con Kiru» se abren con la
   * incorporación completa o con una autorización expresa de administración
   * (que no cambia el estado de los pasos).
   */
  growth: { unlocked: boolean; onboardingComplete: boolean; viaException: boolean };
};
