/**
 * Lógica del alta automática de familias (POST /api/familias/alta), separada
 * de Supabase para poder probarla: la ruta le pasa un «almacén» con las
 * operaciones de base de datos y las pruebas (tests/family-intake.test.mjs)
 * le pasan uno en memoria. Este fichero no importa nada a propósito.
 */

export type GuardianIn = { fullName: string; email: string; relationship: string | null };

export type IntakeInput = {
  submissionId: string;
  studentName: string;
  guardians: GuardianIn[];
  /**
   * Decisión manual de Sofía cuando ya había un alumno con el mismo nombre:
   * el id de ese alumno (es el mismo) o «nuevo» (es otro niño). Sin ella,
   * un nombre repetido deja el alta en revisión.
   */
  studentDecision: { kind: "existing"; studentId: string } | { kind: "new" } | null;
  /** Correos de tutores a los que hay que generar un enlace nuevo (reenvío). Los demás no se tocan. */
  resendTo: string[];
  /** Generar un enlace nuevo para el alumno (reenvío). */
  resendStudent: boolean;
};

export type Link = { accessUrl: string; expiresAt: string };

export type Account = { id: string; fullName: string; username: string | null; role: string; isActive: boolean };

export interface IntakeStore {
  findAccountIdByEmail(email: string): Promise<string | null>;
  getProfile(id: string): Promise<Account | null>;
  hasSignedIn(id: string): Promise<boolean>;
  /** Crea cuenta + perfil con usuario libre. null si no se pudo. */
  createAccount(role: "padre" | "alumno", fullName: string, email: string | null): Promise<string | null>;
  deleteAccount(id: string): Promise<void>;
  getIntake(submissionId: string): Promise<string | null>;
  /** "conflict" si otra llamada ya guardó ese número de envío. */
  saveIntake(submissionId: string, studentId: string): Promise<"ok" | "conflict" | "error">;
  /** Alumnos cuyo nombre normalizado es igual a este. */
  findStudentsNamed(fullName: string): Promise<Account[]>;
  guardianIdsOf(studentId: string): Promise<string[]>;
  linkGuardian(studentId: string, guardianId: string, relationship: string | null): Promise<boolean>;
  /** Enlace nuevo de un solo uso para ESA cuenta; solo invalida los anteriores de esa misma cuenta. */
  issueLink(profileId: string): Promise<Link | null>;
}

/**
 * - created: cuenta nueva + enlace.
 * - linked: la cuenta ya existía y se acaba de enlazar con el alumno; sin enlace.
 * - already: hecho en una llamada anterior; sin enlace.
 * - resent: enlace nuevo porque se pidió para este correo (resendTo).
 * - error: no se pudo; el motivo va en error.
 */
export type Status = "created" | "linked" | "already" | "resent" | "error";

export type GuardianOut = {
  email: string;
  fullName: string;
  status: Status;
  username?: string;
  hasSignedIn?: boolean;
  error?: string;
  accessUrl?: string;
  expiresAt?: string;
};

export type IntakeResult =
  | { kind: "review"; reason: string; candidates: { id: string; username: string | null; fullName: string }[] }
  | { kind: "failed"; status: number; error: string }
  | {
      kind: "ok";
      student: { id: string; fullName: string; username: string; status: Status; hasSignedIn: boolean } & Partial<Link>;
      guardians: GuardianOut[];
    };

export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const fail = (status: number, error: string): IntakeResult => ({ kind: "failed", status, error });

export async function runFamilyIntake(store: IntakeStore, input: IntakeInput): Promise<IntakeResult> {
  // 1. ¿Qué alumno es? Nunca se adivina por el nombre.
  let studentId = await store.getIntake(input.submissionId);
  let studentStatus: Status = "already";

  if (!studentId) {
    let createdNow = false;
    if (input.studentDecision?.kind === "existing") {
      const chosen = await store.getProfile(input.studentDecision.studentId);
      if (!chosen || chosen.role !== "alumno") return fail(400, "El id de alumno indicado no es de ningún alumno del campus.");
      studentId = chosen.id;
    } else {
      if (input.studentDecision?.kind !== "new") {
        const sameName = await store.findStudentsNamed(input.studentName);
        if (sameName.length) {
          return {
            kind: "review",
            reason: "Ya hay en el campus un alumno con el mismo nombre. Puede ser el mismo niño o uno distinto: hace falta que alguien lo decida.",
            candidates: sameName.map((s) => ({ id: s.id, username: s.username, fullName: s.fullName })),
          };
        }
      }
      studentId = await store.createAccount("alumno", input.studentName, null);
      if (!studentId) return fail(500, "No se pudo crear la cuenta del alumno.");
      createdNow = true;
    }
    const saved = await store.saveIntake(input.submissionId, studentId);
    if (saved !== "ok") {
      // Otra llamada simultánea ya ha dado de alta esta respuesta: se usa su alumno.
      if (createdNow) await store.deleteAccount(studentId);
      studentId = await store.getIntake(input.submissionId);
      if (!studentId) return fail(500, "No se pudo guardar el alta del alumno.");
    } else if (createdNow) {
      studentStatus = "created";
    }
  }

  const student = await store.getProfile(studentId);
  if (!student || student.role !== "alumno" || !student.username) {
    return fail(409, "La cuenta del alumno no está bien. Revísala en el panel de administración.");
  }
  const studentSignedIn = studentStatus === "created" ? false : await store.hasSignedIn(student.id);
  let studentLink: Link | null = null;
  if (studentStatus === "created" || (input.resendStudent && !studentSignedIn)) {
    studentLink = await store.issueLink(student.id);
    if (!studentLink) return fail(500, "No se pudo generar el enlace del alumno.");
    if (studentStatus !== "created") studentStatus = "resent";
  }

  // 2. Tutores: cada uno por separado. Un tutor nunca toca el enlace de otro.
  const alreadyLinked = new Set(await store.guardianIdsOf(student.id));
  const resendTo = new Set(input.resendTo.map((e) => e.toLowerCase()));
  const guardians: GuardianOut[] = [];
  for (const g of input.guardians) {
    const out: GuardianOut = { email: g.email, fullName: g.fullName, status: "error" };
    guardians.push(out);

    let id = await store.findAccountIdByEmail(g.email);
    let created = false;
    if (!id) {
      id = await store.createAccount("padre", g.fullName, g.email);
      if (id) created = true;
      else id = await store.findAccountIdByEmail(g.email); // creada a la vez por otra llamada
      if (!id) { out.error = "No se pudo crear la cuenta."; continue; }
    }

    const profile = await store.getProfile(id);
    if (!profile || profile.role !== "padre") {
      out.error = `Ese correo ya es de una cuenta de ${profile?.role ?? "otro tipo"} del campus. No se ha tocado.`;
      continue;
    }
    if (!profile.isActive) { out.error = "La cuenta de familia está desactivada. Actívala en el panel de administración."; continue; }
    if (!profile.username) { out.error = "La cuenta de familia no tiene usuario. Revísala en el panel de administración."; continue; }
    out.username = profile.username;
    const signedIn = created ? false : await store.hasSignedIn(id);
    out.hasSignedIn = signedIn;

    const wasLinked = alreadyLinked.has(id);
    if (!wasLinked && !(await store.linkGuardian(student.id, id, g.relationship))) {
      out.error = "No se pudo enlazar con el alumno.";
      continue;
    }

    let status: Status = created ? "created" : wasLinked ? "already" : "linked";
    if (created || (resendTo.has(g.email) && !signedIn)) {
      const link = await store.issueLink(id);
      if (!link) { out.error = "Cuenta enlazada, pero no se pudo generar el enlace de acceso."; continue; }
      if (!created) status = "resent";
      out.accessUrl = link.accessUrl;
      out.expiresAt = link.expiresAt;
    }
    out.status = status;
  }

  return {
    kind: "ok",
    student: {
      id: student.id,
      fullName: student.fullName,
      username: student.username,
      status: studentStatus,
      hasSignedIn: studentSignedIn,
      ...(studentLink ?? {}),
    },
    guardians,
  };
}
