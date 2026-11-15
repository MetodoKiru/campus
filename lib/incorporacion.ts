/**
 * Incorporación de familias: los 3 primeros pasos que ve una familia en el campus.
 *   1. Disponibilidad para la llamada semanal.
 *   2. Evaluación inicial (se repite cada 3 meses).
 *   3. Información extra, voluntaria (contactos del colegio, psicólogo… y archivos).
 */
export type OnboardingStepState = "pendiente" | "hecho" | "saltado" | "en_espera";

export type FamilyOnboardingKid = {
  studentId: string;
  studentName: string;
  calls: { state: OnboardingStepState; formUrl: string };
  evaluation: {
    state: OnboardingStepState;
    /** Enlace directo si ya está abierta; si no, se abre con la acción «abrir_evaluacion». */
    link: string | null;
    canOpen: boolean;
  };
  info: { state: OnboardingStepState; formUrl: string; sentAt: string | null };
};

export type FamilyOnboardingPayload = { kids: FamilyOnboardingKid[] };

export const onboardingDone = (k: FamilyOnboardingKid) =>
  [k.calls.state, k.evaluation.state, k.info.state].every((s) => s === "hecho" || s === "saltado");

export const onboardingCount = (k: FamilyOnboardingKid) =>
  [k.calls.state, k.evaluation.state, k.info.state].filter((s) => s === "hecho" || s === "saltado").length;

/** Coordinación/administración: lo que ha mandado una familia en el paso 3. */
export type FamilyInfoView = {
  id: string; studentId: string | null; studentName: string; email: string; receivedAt: string;
  files: { name: string; url: string }[]; answers: { label: string; value: string }[];
};
