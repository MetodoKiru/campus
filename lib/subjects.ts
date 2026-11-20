import { supabase } from "@/lib/supabase";
import type {
  FamilySubjectTaskRow, Json, SubjectAnswer, SubjectFileRow, SubjectItemKind, SubjectItemStatus, SubjectItemStatusRow,
  SubjectRow, SubjectSubmissionRow, SubjectTaskSummaryRow,
} from "@/lib/database.types";

export type { SubjectRow, SubjectItemStatusRow, SubjectSubmissionRow, SubjectFileRow, SubjectItemKind, SubjectAnswer, FamilySubjectTaskRow, SubjectTaskSummaryRow };

/** Almacén privado de las entregas de los alumnos: {alumno}/{tarea}/{archivo}. */
export const SUBMISSION_BUCKET = "kiru-entregas";
export const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_SUBMISSION = 5;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
};
export const SUBMISSION_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.doc,.docx,.odt,image/*,application/pdf";

export const KIND_LABEL: Record<SubjectItemKind, string> = { recurso: "Recurso", pregunta: "Pregunta", tarea: "Tarea" };
export const ANSWER_LABEL: Record<SubjectAnswer, string> = { si: "Sí", a_medias: "A medias", no: "No" };

export const STATUS_LABEL: Record<SubjectItemStatus, string> = {
  pendiente: "Pendiente",
  a_tiempo: "Entregada a tiempo",
  tarde: "Entregada tarde",
  no_entregada: "No entregada",
  sin_responder: "Sin responder",
  respondida: "Respondida",
  nuevo: "Nuevo",
  visto: "Visto",
};

/** Colores de cada estado (fondo, texto y borde). */
export const STATUS_STYLE: Record<SubjectItemStatus, string> = {
  pendiente: "bg-[#F3EEE5] text-[#6B5A40] border-[#E4D8C5]",
  a_tiempo: "bg-emerald-50 text-emerald-800 border-emerald-200",
  tarde: "bg-amber-50 text-amber-800 border-amber-200",
  no_entregada: "bg-rose-50 text-rose-800 border-rose-200",
  sin_responder: "bg-[#F3EEE5] text-[#6B5A40] border-[#E4D8C5]",
  respondida: "bg-emerald-50 text-emerald-800 border-emerald-200",
  nuevo: "bg-sky-50 text-sky-800 border-sky-200",
  visto: "bg-[#F7F5F1] text-[#6D6962] border-[#E7E3DC]",
};

/** Mensaje de error legible: el de la base de datos ya viene en castellano. */
function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message && !/^(JWT|new row|permission denied|violates)/i.test(error.message) ? error.message : fallback);
}

// --- Lecturas -------------------------------------------------------------------------------------

/** Asignaturas que puedes usar: las comunes, las tuyas y las de tus alumnos. */
export async function fetchSubjects(): Promise<SubjectRow[]> {
  const { data, error } = await supabase.from("kiru_subjects").select("*").is("archived_at", null)
    .order("sort_order").order("name");
  if (error) fail(error, "No se pudieron cargar las asignaturas.");
  return data ?? [];
}

/** Asignaturas activadas por alumno: { alumno: [asignatura, …] }. */
export async function fetchStudentSubjects(studentIds: string[]): Promise<Record<string, string[]>> {
  if (!studentIds.length) return {};
  const { data, error } = await supabase.from("kiru_student_subjects").select("student_id,subject_id").in("student_id", studentIds);
  if (error) fail(error, "No se pudieron cargar las asignaturas de los alumnos.");
  const result: Record<string, string[]> = {};
  for (const row of data ?? []) (result[row.student_id] ??= []).push(row.subject_id);
  return result;
}

/** Recursos, preguntas y tareas de unos alumnos, con su estado. */
export async function fetchItems(studentIds: string[], options: { includeArchived?: boolean } = {}): Promise<SubjectItemStatusRow[]> {
  if (!studentIds.length) return [];
  let query = supabase.from("kiru_subject_items_status").select("*").in("student_id", studentIds);
  if (!options.includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
  if (error) fail(error, "No se pudieron cargar las tareas.");
  return data ?? [];
}

export async function fetchSubmissions(itemIds: string[]): Promise<{ submissions: SubjectSubmissionRow[]; files: SubjectFileRow[] }> {
  if (!itemIds.length) return { submissions: [], files: [] };
  const [subs, files] = await Promise.all([
    supabase.from("kiru_subject_submissions").select("*").in("item_id", itemIds).order("submitted_at"),
    supabase.from("kiru_subject_files").select("*").in("item_id", itemIds).order("created_at"),
  ]);
  if (subs.error) fail(subs.error, "No se pudieron cargar las entregas.");
  if (files.error) fail(files.error, "No se pudieron cargar los archivos.");
  return { submissions: subs.data ?? [], files: files.data ?? [] };
}

export async function fetchFamilyTasks(studentId: string): Promise<FamilySubjectTaskRow[]> {
  const { data, error } = await supabase.rpc("kiru_family_subject_tasks", { p_student: studentId });
  if (error) fail(error, "No se pudieron cargar las tareas.");
  return data ?? [];
}

export async function fetchTaskSummary(studentIds: string[], days = 30): Promise<Record<string, SubjectTaskSummaryRow>> {
  if (!studentIds.length) return {};
  const { data, error } = await supabase.rpc("kiru_subject_task_summary", { p_students: studentIds, p_days: days });
  if (error) fail(error, "No se pudo cargar el resumen de tareas.");
  return Object.fromEntries((data ?? []).map((row) => [row.student_id, row]));
}

/** Enlace temporal (5 minutos) para abrir un archivo entregado. */
export async function openSubmissionFile(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) fail(error, "No se pudo abrir el archivo.");
  return data.signedUrl;
}

// --- Mentor ------------------------------------------------------------------------------------------

export async function createSubject(name: string, common = false): Promise<string> {
  const { data, error } = await supabase.rpc("kiru_subject_create", { p_name: name, p_common: common });
  if (error || !data) fail(error, "No se pudo crear la asignatura.");
  return data;
}

export async function renameSubject(subjectId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc("kiru_subject_update", { p_subject: subjectId, p_name: name });
  if (error) fail(error, "No se pudo cambiar el nombre.");
}

export async function archiveSubject(subjectId: string): Promise<void> {
  const { error } = await supabase.rpc("kiru_subject_update", { p_subject: subjectId, p_archive: true });
  if (error) fail(error, "No se pudo archivar la asignatura.");
}

export async function makeSubjectCommon(subjectId: string): Promise<void> {
  const { error } = await supabase.rpc("kiru_subject_make_common", { p_subject: subjectId });
  if (error) fail(error, "No se pudo hacer común la asignatura.");
}

export async function setStudentSubject(studentId: string, subjectId: string, visible: boolean): Promise<void> {
  const { error } = await supabase.rpc("kiru_student_subject_set", { p_student: studentId, p_subject: subjectId, p_visible: visible });
  if (error) fail(error, "No se pudo guardar la asignatura.");
}

export type NewItem = {
  students: string[];
  subjectId: string;
  kind: SubjectItemKind;
  title: string;
  body?: string;
  url?: string;
  dueAt?: string | null;
  requiresFile?: boolean;
};

export async function sendItem(item: NewItem): Promise<string[]> {
  const { data, error } = await supabase.rpc("kiru_subject_item_send", {
    p_students: item.students,
    p_subject: item.subjectId,
    p_kind: item.kind,
    p_title: item.title,
    p_body: item.body ?? "",
    p_url: item.url || null,
    p_due_at: item.dueAt ?? null,
    p_requires_file: Boolean(item.requiresFile),
    p_time_zone: browserTimeZone(),
  });
  if (error) fail(error, "No se pudo enviar.");
  return data ?? [];
}

export async function updateItem(itemId: string, changes: { title?: string; body?: string; url?: string; dueAt?: string; archive?: boolean }): Promise<void> {
  const { error } = await supabase.rpc("kiru_subject_item_update", {
    p_item: itemId,
    p_title: changes.title ?? null,
    p_body: changes.body ?? null,
    p_url: changes.url ?? null,
    p_due_at: changes.dueAt ?? null,
    p_archive: changes.archive ?? null,
  });
  if (error) fail(error, "No se pudo guardar el cambio.");
}

export async function reviewItem(itemId: string, feedback: string): Promise<void> {
  const { error } = await supabase.rpc("kiru_subject_item_review", { p_item: itemId, p_feedback: feedback });
  if (error) fail(error, "No se pudo guardar la revisión.");
}

// --- Alumno ------------------------------------------------------------------------------------------

export async function markSeen(itemIds: string[]): Promise<void> {
  if (!itemIds.length) return;
  const { error } = await supabase.rpc("kiru_subject_item_seen", { p_items: itemIds });
  if (error) console.error("No se pudo marcar como visto.", error.message);
}

/** El tipo que se guarda: el del navegador o, si no lo sabe (p. ej. HEIC), el de la extensión. */
export function submissionMime(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type && Object.values(MIME_BY_EXTENSION).includes(file.type)) return file.type;
  return MIME_BY_EXTENSION[extension] ?? null;
}

/** Nombre seguro para la ruta del almacén: sin tildes, espacios ni barras. */
function safeFileName(name: string, index: number): string {
  const clean = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(-100);
  return `${Date.now()}-${index + 1}-${clean || "archivo"}`;
}

/**
 * Las fotos del móvil pesan mucho: se reducen a 1600 px y JPEG antes de subirlas.
 * Si el navegador no sabe leerla (p. ej. HEIC en Chrome), se sube tal cual.
 */
async function shrinkPhoto(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600 * 1024 || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Comprueba los archivos antes de subir: devuelve el error o null. */
export function checkFiles(files: File[]): string | null {
  if (files.length > MAX_FILES_PER_SUBMISSION) return `Como mucho ${MAX_FILES_PER_SUBMISSION} archivos por entrega.`;
  for (const file of files) {
    if (!submissionMime(file)) return `«${file.name}» no es una foto, un PDF ni un documento de texto.`;
    if (file.size > MAX_SUBMISSION_BYTES && !/^image\//.test(file.type)) return `«${file.name}» pesa más de 10 MB.`;
  }
  return null;
}

/** Entregar una tarea o responder una pregunta: sube los archivos y registra la entrega. */
export async function submitItem(input: { studentId: string; itemId: string; answer?: SubjectAnswer | null; comment?: string; files?: File[] }): Promise<void> {
  const uploaded: { path: string; name: string; mime: string; size: number }[] = [];
  const files = input.files ?? [];
  const problem = checkFiles(files);
  if (problem) throw new Error(problem);
  for (const [index, original] of files.entries()) {
    const file = await shrinkPhoto(original);
    if (file.size > MAX_SUBMISSION_BYTES) throw new Error(`«${original.name}» pesa más de 10 MB.`);
    const mime = submissionMime(file) ?? "application/octet-stream";
    const path = `${input.studentId}/${input.itemId}/${safeFileName(file.name, index)}`;
    const { error } = await supabase.storage.from(SUBMISSION_BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (error) throw new Error(`No se pudo subir «${original.name}». Comprueba la conexión y vuelve a intentarlo.`);
    uploaded.push({ path, name: original.name, mime, size: file.size });
  }
  const { error } = await supabase.rpc("kiru_subject_submit", {
    p_item: input.itemId,
    p_answer: input.answer ?? null,
    p_comment: input.comment ?? "",
    p_files: uploaded as unknown as Json,
  });
  if (error) fail(error, "No se pudo registrar la entrega.");
}

// --- Fechas ----------------------------------------------------------------------------------------------

export function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid"; } catch { return "Europe/Madrid"; }
}

/** «mar 24 nov, 20:00» en la zona horaria del envío. */
export function formatDue(value: string | null | undefined, timeZone = "Europe/Madrid"): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone });
  } catch {
    return new Date(value).toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
}

export function formatMoment(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Cuánto tiempo pasó del plazo: «2 h tarde», «1 día tarde». */
export function lateBy(due: string | null, submitted: string | null): string {
  if (!due || !submitted) return "";
  const minutes = Math.round((new Date(submitted).getTime() - new Date(due).getTime()) / 60000);
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min tarde`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h tarde`;
  return `${Math.round(hours / 24)} días tarde`;
}

/** Valor por defecto del selector de fecha: dentro de 7 días a las 20:00 (hora del navegador). */
export function defaultDueInput(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(20, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T20:00`;
}

/** Del selector «AAAA-MM-DDTHH:MM» (hora local del navegador) a ISO. */
export function dueInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isoToDueInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
