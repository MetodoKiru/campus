import { getKiruRecords, saveKiruRecord } from "@/lib/kiru-records";
import { supabase } from "@/lib/supabase";
import { EnglishActivityConfig, EnglishExercise, isCorrect } from "@/lib/english/generator";
import { EnglishSkill } from "@/lib/english/curriculum";

// A mentor assigns a task as a "task" record owned by the student. The student never
// edits that record: their answers live in a separate "progress" record with the same
// key, which RLS lets the student write and the student's mentors read.

export interface EnglishTask {
  kind: "english_task";
  version: 1;
  id: string;
  studentId: string;
  mentorId: string;
  title: string;
  skill: EnglishSkill;
  config: EnglishActivityConfig;
  exercises: EnglishExercise[];
  note?: string;
  /** Task whose results this one follows up (review of mistakes, next difficulty…). */
  followUpOf?: string;
  assignedAt: string;
}

export interface EnglishTaskProgress {
  module: "english_task";
  taskId: string;
  status: "in_progress" | "completed";
  /** Answer given for each exercise id. */
  answers: Record<string, string>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  score?: number;
  total?: number;
}

export interface EnglishTaskWithProgress {
  recordId: string;
  task: EnglishTask;
  progress: EnglishTaskProgress | null;
}

const recordKey = (taskId: string) => `english_task_${taskId}`;

function isEnglishTask(value: unknown): value is EnglishTask {
  const task = value as EnglishTask | null;
  return Boolean(task && task.kind === "english_task" && typeof task.id === "string" && Array.isArray(task.exercises));
}

function isEnglishProgress(value: unknown): value is EnglishTaskProgress {
  const progress = value as EnglishTaskProgress | null;
  return Boolean(progress && progress.module === "english_task" && typeof progress.taskId === "string" && progress.answers);
}

/** Tasks visible to the signed-in user (their own, or their students' for a mentor), newest first. */
export async function loadEnglishTasks(ownerId?: string): Promise<EnglishTaskWithProgress[]> {
  const [taskRecords, progressRecords] = await Promise.all([getKiruRecords<unknown>("task"), getKiruRecords<unknown>("progress")]);
  const progressByKey = new Map<string, EnglishTaskProgress>();
  for (const record of progressRecords) {
    if (isEnglishProgress(record.data)) progressByKey.set(`${record.owner_id}:${record.record_key}`, record.data);
  }
  return taskRecords
    .filter((record) => isEnglishTask(record.data) && (!ownerId || record.owner_id === ownerId))
    // The owner of the record is the source of truth for which student the task belongs to.
    .map((record) => ({ ...record, data: { ...(record.data as EnglishTask), studentId: record.owner_id } }))
    .map((record) => ({
      recordId: record.id,
      task: record.data,
      progress: progressByKey.get(`${record.owner_id}:${record.record_key}`) ?? null,
    }))
    .sort((a, b) => b.task.assignedAt.localeCompare(a.task.assignedAt));
}

export async function assignEnglishTask(task: EnglishTask): Promise<void> {
  await saveKiruRecord("task", recordKey(task.id), task, task.studentId);
}

// The task record belongs to the student, so deleteKiruRecord (own records only) cannot
// remove it for the mentor; RLS lets an assigned mentor delete it directly.
export async function deleteEnglishTask(recordId: string): Promise<void> {
  const { data, error } = await supabase.from("kiru_app_records").delete().eq("id", recordId).eq("record_type", "task").select("id");
  if (error) throw new Error(`No se pudo eliminar la tarea: ${error.message}`);
  if (!data?.length) throw new Error("No se pudo eliminar la tarea.");
}

export function scoreAnswers(exercises: EnglishExercise[], answers: Record<string, string>): number {
  return exercises.filter((exercise) => isCorrect(exercise, answers[exercise.id])).length;
}

/** Saves the student's answers so far; marks the task completed once every exercise is answered. */
export async function saveEnglishProgress(
  task: EnglishTask,
  answers: Record<string, string>,
  previous: EnglishTaskProgress | null,
): Promise<EnglishTaskProgress> {
  const now = new Date().toISOString();
  const finished = task.exercises.every((exercise) => answers[exercise.id] !== undefined);
  const progress: EnglishTaskProgress = {
    module: "english_task",
    taskId: task.id,
    status: finished ? "completed" : "in_progress",
    answers,
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
    ...(finished
      ? { completedAt: previous?.completedAt ?? now, score: scoreAnswers(task.exercises, answers), total: task.exercises.length }
      : {}),
  };
  await saveKiruRecord("progress", recordKey(task.id), progress);
  return progress;
}

export function gradeOutOfTen(score: number, total: number): string {
  return total ? ((score / total) * 10).toFixed(1) : "0.0";
}

// Answers are also kept in the browser until the server has them, so a dropped
// connection or a closed tab never loses work. The server copy is still the one that counts.
const backupKey = (taskId: string) => `kiru_english_answers_${taskId}`;

export function backupAnswers(taskId: string, answers: Record<string, string>): void {
  try {
    window.localStorage.setItem(backupKey(taskId), JSON.stringify(answers));
  } catch {
    // Private mode or full storage: the server save still happens.
  }
}

export function clearAnswersBackup(taskId: string): void {
  try {
    window.localStorage.removeItem(backupKey(taskId));
  } catch {
    // Nothing to clear.
  }
}

/** Answers saved in this browser that the server does not have yet, merged over the server's. */
export function answersWithBackup(task: EnglishTask, saved: Record<string, string>): { answers: Record<string, string>; unsynced: boolean } {
  let local: Record<string, string> = {};
  try {
    local = JSON.parse(window.localStorage.getItem(backupKey(task.id)) ?? "{}") as Record<string, string>;
  } catch {
    local = {};
  }
  const known = new Set(task.exercises.map((exercise) => exercise.id));
  const missing = Object.entries(local).filter(([id, value]) => known.has(id) && typeof value === "string" && saved[id] === undefined);
  return { answers: { ...saved, ...Object.fromEntries(missing) }, unsynced: missing.length > 0 };
}
