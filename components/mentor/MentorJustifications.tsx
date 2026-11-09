"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Image as ImageIcon, MessageSquare, Paperclip, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  MethodologyWarningRow, SkillcoinReviewFileRow, SkillcoinReviewMessageRow, SkillcoinReviewRow,
} from "@/lib/database.types";
import {
  COMPETENCIA_LABEL, EVIDENCE_ACCEPT, EVIDENCE_BUCKET, MAX_EVIDENCE_BYTES, MAX_FILES_PER_MESSAGE, MENTOR_STATUS_LABEL,
  RESOLUTION_LABEL, WARNING_LEVEL_LABEL, WARNING_STATUS_LABEL, evidenceMime, formatDateTime, formatDay, formatSize,
  safeFileName, warningCountsUntil, weekLabel,
} from "@/lib/supervision";

const primaryButton = "inline-flex items-center gap-1.5 rounded-xl bg-[#242321] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#3A3835] disabled:opacity-50";
const secondaryButton = "inline-flex items-center gap-1.5 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] px-4 py-2.5 text-xs font-bold text-[#45433F] transition hover:bg-[#F3F0EA] disabled:opacity-50";
const field = "w-full rounded-xl border border-[#E7E3DC] bg-white px-3 py-2.5 text-sm text-[#292825] outline-none focus:border-[#806C50]";

type Data = {
  reviews: SkillcoinReviewRow[];
  messages: SkillcoinReviewMessageRow[];
  files: SkillcoinReviewFileRow[];
  warnings: MethodologyWarningRow[];
  students: Record<string, string>;
  sessionDates: Record<string, string | null>;
};

const OPEN_FOR_ANSWER: SkillcoinReviewRow["status"][] = ["pendiente_respuesta", "respondida"];

/** Cuántas solicitudes esperan respuesta del mentor (para el menú y el aviso del panel). */
export function usePendingJustifications(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count: pending } = await supabase.from("kiru_skillcoin_reviews")
        .select("id", { count: "exact", head: true })
        .eq("mentor_id", user.id).eq("status", "pendiente_respuesta");
      if (alive) setCount(pending ?? 0);
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 120_000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [enabled]);
  return count;
}

async function loadData(): Promise<Data> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
  const [reviewsResult, warningsResult] = await Promise.all([
    supabase.from("kiru_skillcoin_reviews").select("*").eq("mentor_id", user.id).order("created_at", { ascending: false }),
    supabase.from("kiru_methodology_warnings").select("*").eq("mentor_id", user.id).order("created_at", { ascending: false }),
  ]);
  if (reviewsResult.error) throw reviewsResult.error;
  if (warningsResult.error) throw warningsResult.error;
  const reviews = reviewsResult.data ?? [];
  const ids = reviews.map((r) => r.id);
  const studentIds = [...new Set(reviews.map((r) => r.student_id))];
  const logIds = [...new Set(reviews.map((r) => r.session_log_id).filter((id): id is string => !!id))];
  const [messagesResult, filesResult, studentsResult, logsResult] = await Promise.all([
    ids.length ? supabase.from("kiru_skillcoin_review_messages").select("*").in("review_id", ids).order("created_at") : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("kiru_skillcoin_review_files").select("*").in("review_id", ids).order("created_at") : Promise.resolve({ data: [], error: null }),
    studentIds.length ? supabase.from("profiles").select("id,full_name").in("id", studentIds) : Promise.resolve({ data: [], error: null }),
    logIds.length ? supabase.from("kiru_session_logs").select("id,session_date").in("id", logIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (messagesResult.error) throw messagesResult.error;
  if (filesResult.error) throw filesResult.error;
  return {
    reviews,
    warnings: warningsResult.data ?? [],
    messages: (messagesResult.data ?? []) as SkillcoinReviewMessageRow[],
    files: (filesResult.data ?? []) as SkillcoinReviewFileRow[],
    students: Object.fromEntries(((studentsResult.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])),
    sessionDates: Object.fromEntries(((logsResult.data ?? []) as { id: string; session_date: string | null }[]).map((l) => [l.id, l.session_date])),
  };
}

/**
 * «Justificaciones de SkillCoins» (menú ☰ del mentor): las solicitudes de
 * coordinación sobre una nota concreta, la respuesta del mentor con texto,
 * criterios y evidencias, y los avisos metodológicos. Responder nunca cambia la
 * nota ni el registro de la sesión.
 */
export default function MentorJustifications({ notify, initialReview }: { notify: (text: string) => void; initialReview?: string | null }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initialReview ?? null);

  const reload = useCallback(async () => {
    try { setData(await loadData()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar tus justificaciones."); }
  }, []);
  useEffect(() => {
    let alive = true;
    loadData()
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "No se pudieron cargar tus justificaciones."); });
    return () => { alive = false; };
  }, []);

  const open = data?.reviews.filter((r) => r.status !== "cerrada") ?? [];
  const closed = data?.reviews.filter((r) => r.status === "cerrada") ?? [];
  const review = data?.reviews.find((r) => r.id === selected) ?? null;

  return (
    <section className="space-y-5 rounded-3xl border border-[#E7E3DC] bg-white p-6 shadow-xs sm:p-8">
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C50]">Supervisión metodológica</span>
        <h2 className="mt-0.5 font-serif text-xl font-bold text-[#292825]">Justificaciones de SkillCoins</h2>
      </div>
      <p className="text-sm leading-relaxed text-[#45433F]">
        A veces coordinación te pedirá que expliques una puntuación de SkillCoins. No es una sanción: sirve para que todos apliquemos los mismos criterios. Tu respuesta no cambia la nota ni el registro de la sesión.
      </p>

      {error && <p className="rounded-2xl border border-[#D9B3AA] bg-white p-4 text-xs text-[#9A4B3F]">{error}</p>}
      {!data && !error && <p className="text-xs text-[#77736B]">Cargando…</p>}

      {data && review && (
        <ReviewDetail
          key={review.id}
          review={review}
          data={data}
          onBack={() => setSelected(null)}
          onSaved={async (text) => { notify(text); await reload(); }}
          notify={notify}
        />
      )}

      {data && !review && (
        <>
          <ReviewList title="Pendientes y en curso" empty="No tienes ninguna solicitud abierta." reviews={open} data={data} onOpen={setSelected} />
          {closed.length > 0 && <ReviewList title="Historial" empty="" reviews={closed} data={data} onOpen={setSelected} />}
          <WarningList warnings={data.warnings} />
        </>
      )}
    </section>
  );
}

function StatusChip({ review }: { review: SkillcoinReviewRow }) {
  const style = review.status === "pendiente_respuesta"
    ? "border-[#806C50] bg-[#806C50] text-white"
    : review.status === "cerrada" ? "border-[#E7E3DC] bg-[#FAF8F5] text-[#6D6962]" : "border-[#E4D8C5] bg-[#F3EEE5] text-[#806C50]";
  return <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${style}`}>{MENTOR_STATUS_LABEL[review.status]}</span>;
}

function reviewTitle(review: SkillcoinReviewRow, data: Data): string {
  const student = data.students[review.student_id]?.split(" ")[0] ?? "Alumno";
  return `${student} · ${COMPETENCIA_LABEL[review.competencia]} ${review.score_snapshot}/10`;
}

function ReviewList({ title, empty, reviews, data, onOpen }: { title: string; empty: string; reviews: SkillcoinReviewRow[]; data: Data; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">{title}</h3>
      {reviews.length === 0 && <p className="text-xs text-[#77736B]">{empty}</p>}
      <ul className="space-y-2">
        {reviews.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-start gap-3 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-left transition hover:bg-[#F3F0EA]">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#292825]">{reviewTitle(r, data)}</span>
                <span className="mt-0.5 block text-[11px] text-[#77736B]">
                  {weekLabel(r.week)} · pedida el {formatDay(r.created_at)}
                  {r.due_date && r.status === "pendiente_respuesta" ? ` · responder antes del ${formatDay(r.due_date)}` : ""}
                </span>
                {r.status === "cerrada" && r.resolution && <span className="mt-1 block text-[11px] font-semibold text-[#45433F]">{RESOLUTION_LABEL[r.resolution]}</span>}
              </span>
              <StatusChip review={r} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewDetail({ review, data, onBack, onSaved, notify }: {
  review: SkillcoinReviewRow;
  data: Data;
  onBack: () => void;
  onSaved: (text: string) => Promise<void>;
  notify: (text: string) => void;
}) {
  const messages = data.messages.filter((m) => m.review_id === review.id);
  const files = data.files.filter((f) => f.review_id === review.id);
  const sessionDate = review.session_log_id ? data.sessionDates[review.session_log_id] : null;
  const canAnswer = OPEN_FOR_ANSWER.includes(review.status);
  const weekScores = (review.week_scores && typeof review.week_scores === "object" && !Array.isArray(review.week_scores)) ? review.week_scores as Record<string, unknown> : {};
  const warning = data.warnings.find((w) => w.review_id === review.id) ?? null;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-[#6D6962] hover:text-[#292825]">← Todas mis justificaciones</button>

      <div className="space-y-3 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#292825]">{reviewTitle(review, data)}</h3>
            <p className="text-[11px] text-[#77736B]">
              {sessionDate ? `Sesión del ${formatDay(sessionDate)}` : weekLabel(review.week)} · la pidió {review.requested_role === "admin" ? "Dirección" : "tu coordinador"} el {formatDay(review.created_at)}
            </p>
          </div>
          <StatusChip review={review} />
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Puntuación revisada</dt>
            <dd className="text-[#292825]">{COMPETENCIA_LABEL[review.competencia]}: <strong>{review.score_snapshot}/10</strong></dd>
          </div>
          {Object.keys(weekScores).length > 0 && (
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Las cuatro de esa semana</dt>
              <dd className="text-[#45433F]">
                {(["estudios", "compromiso", "organizacion", "bienestar"] as const)
                  .filter((key) => weekScores[key] !== undefined && weekScores[key] !== null)
                  .map((key) => `${COMPETENCIA_LABEL[key]} ${String(weekScores[key])}`).join(" · ")}
              </dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Motivo</dt>
            <dd className="whitespace-pre-line text-[#45433F]">{review.reason}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Qué te pregunta</dt>
            <dd className="whitespace-pre-line text-[#292825]">{review.question}</dd>
          </div>
          {review.due_date && (
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Plazo para responder</dt>
              <dd className="text-[#292825]">{formatDay(review.due_date)}</dd>
            </div>
          )}
        </dl>
      </div>

      {messages.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Conversación</h4>
          <ul className="space-y-3">
            {messages.map((m) => (
              <MessageItem key={m.id} message={m} files={files.filter((f) => f.message_id === m.id)} notify={notify} />
            ))}
          </ul>
        </div>
      )}

      {review.status === "cerrada" && review.resolution && (
        <div className="space-y-2 rounded-2xl border border-[#E4D8C5] bg-[#F3EEE5] p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-[#292825]">
            {review.resolution === "adecuada" ? <CheckCircle2 className="h-4 w-4 text-[#806C50]" /> : <AlertTriangle className="h-4 w-4 text-[#806C50]" />}
            Resolución: {RESOLUTION_LABEL[review.resolution]}
          </p>
          {review.resolution_note && <p className="whitespace-pre-line text-sm text-[#45433F]">{review.resolution_note}</p>}
          {review.resolved_at && <p className="text-[11px] text-[#77736B]">Cerrada el {formatDay(review.resolved_at)}</p>}
          {warning && <p className="text-xs text-[#45433F]">Se ha registrado un aviso metodológico: lo tienes abajo, en «Mis avisos metodológicos».</p>}
        </div>
      )}

      {canAnswer && <AnswerForm review={review} onSaved={onSaved} />}
      {review.status === "pendiente_valoracion" && (
        <p className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-xs text-[#45433F]">Coordinación está valorando tu respuesta. Si necesita algo más, te lo preguntará aquí y te llegará un correo.</p>
      )}
      {warning && review.status === "cerrada" && <WarningList warnings={[warning]} title="Aviso de esta revisión" />}
    </div>
  );
}

function MessageItem({ message, files, notify }: { message: SkillcoinReviewMessageRow; files: SkillcoinReviewFileRow[]; notify: (text: string) => void }) {
  const mine = message.author_role === "mentor";
  const openFile = async (file: SkillcoinReviewFileRow) => {
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(file.storage_path, 300);
    if (error || !data?.signedUrl) { notify("No se pudo abrir el archivo."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <li className={`space-y-2 rounded-2xl border p-4 ${mine ? "border-[#E7E3DC] bg-white" : "border-[#E4D8C5] bg-[#F3EEE5]"}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#77736B]">
        <MessageSquare className="h-3.5 w-3.5" />
        {mine ? "Tu respuesta" : message.author_role === "admin" ? "Dirección pregunta" : "Tu coordinador pregunta"} · {formatDateTime(message.created_at)}
      </p>
      <p className="whitespace-pre-line text-sm text-[#292825]">{message.body}</p>
      {message.criteria && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Criterios usados</p>
          <p className="whitespace-pre-line text-sm text-[#45433F]">{message.criteria}</p>
        </div>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file) => (
            <li key={file.id}>
              <button type="button" onClick={() => void openFile(file)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] px-3 py-1.5 text-[11px] font-semibold text-[#45433F] hover:bg-[#F3F0EA]">
                {file.mime_type.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                {file.file_name} <span className="font-normal text-[#77736B]">({formatSize(file.size_bytes)})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AnswerForm({ review, onSaved }: { review: SkillcoinReviewRow; onSaved: (text: string) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [criteria, setCriteria] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Si el texto se guardó pero algún archivo falló, se reintenta sobre el mismo mensaje.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const fileProblem = useMemo(() => {
    if (files.length > MAX_FILES_PER_MESSAGE) return `Como mucho ${MAX_FILES_PER_MESSAGE} archivos por respuesta.`;
    const big = files.find((f) => f.size > MAX_EVIDENCE_BYTES);
    if (big) return `«${big.name}» pesa más de 10 MB.`;
    const wrong = files.find((f) => !evidenceMime(f));
    if (wrong) return `«${wrong.name}» no es una foto, un PDF ni un Word (.docx).`;
    return null;
  }, [files]);

  const addFiles = (list: File[]) => {
    if (!list.length) return;
    setFiles((current) => [...current, ...list].slice(0, MAX_FILES_PER_MESSAGE + 1));
  };

  const uploadAll = async (messageId: string, toUpload: File[]): Promise<File[]> => {
    const failed: File[] = [];
    for (const [index, file] of toUpload.entries()) {
      const mime = evidenceMime(file)!;
      const path = `${review.id}/${messageId}/${Date.now().toString(36)}-${safeFileName(file.name, index)}`;
      const upload = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { contentType: mime, upsert: false });
      if (upload.error) { failed.push(file); continue; }
      const { error } = await supabase.rpc("kiru_sc_review_add_file", { p_message: messageId, p_path: path, p_name: file.name, p_mime: mime, p_size: file.size });
      if (error) failed.push(file);
    }
    return failed;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || fileProblem) return;
    setProblem(null);
    setBusy(true);
    try {
      let messageId = pendingMessage;
      if (!messageId) {
        if (!body.trim()) { setProblem("Escribe tu explicación."); return; }
        const { data, error } = await supabase.rpc("kiru_answer_sc_review", { p_review: review.id, p_body: body.trim(), p_criteria: criteria.trim() });
        if (error || !data) throw new Error(error?.message || "No se pudo enviar la respuesta.");
        messageId = data;
      }
      const failed = files.length ? await uploadAll(messageId, files) : [];
      if (failed.length) {
        setPendingMessage(messageId);
        setFiles(failed);
        setProblem(`Tu explicación se ha guardado, pero no se han podido subir ${failed.length === 1 ? "este archivo" : `estos ${failed.length} archivos`}. Pulsa «Reintentar archivos» (tienes 24 horas).`);
        return;
      }
      setBody(""); setCriteria(""); setFiles([]); setPendingMessage(null);
      await onSaved("Respuesta enviada. Tu coordinador recibirá un aviso.");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "No se pudo enviar la respuesta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[#E7E3DC] p-5">
      <h4 className="font-serif text-base font-bold text-[#292825]">{review.status === "respondida" ? "Añadir algo a tu respuesta" : "Tu respuesta"}</h4>
      {!pendingMessage && (
        <>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[#45433F]">Explicación</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={4000} required className={field}
              placeholder="Qué observaste en la sesión, qué hizo el alumno y por qué pusiste esa nota." />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[#45433F]">Criterios que usaste para puntuar (opcional)</span>
            <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={3} maxLength={2000} className={field}
              placeholder="Por ejemplo: qué tiene que pasar para poner un 8 en organización." />
          </label>
        </>
      )}

      <div className="space-y-2">
        <span className="block text-xs font-semibold text-[#45433F]">Evidencias (opcional)</span>
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#77736B]">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Fotos del cuaderno, ejercicios o documentos. Son datos de un menor: que no salgan caras, nombres completos ni datos de contacto. Solo las verán tu coordinador y Dirección.
        </p>
        <label className={`${secondaryButton} cursor-pointer`}>
          <Paperclip className="h-3.5 w-3.5" /> Añadir archivos
          <input type="file" multiple accept={EVIDENCE_ACCEPT} className="sr-only" onChange={(e) => { const chosen = Array.from(e.target.files ?? []); e.target.value = ""; addFiles(chosen); }} />
        </label>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs text-[#45433F]">
                <span className="min-w-0 flex-1 truncate">{file.name} <span className="text-[#77736B]">({formatSize(file.size)})</span></span>
                <button type="button" aria-label={`Quitar ${file.name}`} onClick={() => setFiles((list) => list.filter((_, i) => i !== index))} className="rounded-lg p-1 text-[#77736B] hover:bg-[#F3F0EA]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-[#77736B]">JPG, PNG, WEBP, HEIC, PDF o Word (.docx), hasta 10 MB cada uno y {MAX_FILES_PER_MESSAGE} por respuesta.</p>
      </div>

      {(fileProblem || problem) && <p className="rounded-xl border border-[#D9B3AA] bg-white p-3 text-xs text-[#9A4B3F]">{fileProblem ?? problem}</p>}
      <p className="text-[11px] text-[#77736B]">Una vez enviada, la respuesta queda guardada y no se puede editar ni borrar. Si quieres añadir algo, envía otra.</p>
      <button type="submit" disabled={busy || Boolean(fileProblem) || (pendingMessage ? files.length === 0 : !body.trim())} className={primaryButton}>
        {busy ? "Enviando…" : pendingMessage ? "Reintentar archivos" : "Enviar respuesta"}
      </button>
    </form>
  );
}

function WarningList({ warnings, title = "Mis avisos metodológicos" }: { warnings: MethodologyWarningRow[]; title?: string }) {
  const [now] = useState(() => Date.now());
  if (!warnings.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">{title}</h3>
      <p className="text-[11px] text-[#77736B]">Los avisos no son sanciones. Cada uno cuenta durante 6 meses para el nivel del siguiente; después sigue en tu historial pero ya no cuenta.</p>
      <ul className="space-y-2">
        {warnings.map((w) => {
          const until = warningCountsUntil(w.created_at);
          const counts = until.getTime() > now;
          return (
            <li key={w.id} className="space-y-2 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[#292825]">{WARNING_LEVEL_LABEL[w.level]} · {COMPETENCIA_LABEL[w.competencia]}</p>
                <span className="rounded-full border border-[#E7E3DC] bg-white px-2.5 py-1 text-[10px] font-bold text-[#45433F]">{WARNING_STATUS_LABEL[w.status]}</span>
              </div>
              <p className="text-[11px] text-[#77736B]">
                {formatDay(w.created_at)} · {counts ? `cuenta para el nivel hasta el ${formatDay(until.toISOString())}` : "ya no cuenta para el nivel"}
              </p>
              <p className="whitespace-pre-line text-sm text-[#45433F]"><strong className="font-semibold text-[#292825]">Criterio a revisar:</strong> {w.criterion}</p>
              {w.expected_improvements && <p className="whitespace-pre-line text-sm text-[#45433F]"><strong className="font-semibold text-[#292825]">Mejoras esperadas:</strong> {w.expected_improvements}</p>}
              {w.manual_reference && <p className="text-sm text-[#45433F]"><strong className="font-semibold text-[#292825]">Referencia del manual:</strong> {w.manual_reference}</p>}
              {w.recommended_action && <p className="whitespace-pre-line text-sm text-[#45433F]"><strong className="font-semibold text-[#292825]">Recomendación:</strong> {w.recommended_action}</p>}
              {w.meeting_at && <p className="text-sm text-[#45433F]"><strong className="font-semibold text-[#292825]">Reunión con coordinación:</strong> {formatDateTime(w.meeting_at)}{w.meeting_done_at ? " (hecha)" : ""}</p>}
              {w.assessment_kind && <p className="text-sm text-[#45433F]"><strong className="font-semibold text-[#292825]">Revisión metodológica:</strong> {w.assessment_kind === "prueba_conocimientos" ? "prueba de conocimientos" : "evaluación práctica"}{w.assessment_result ? ` · ${w.assessment_result}` : ""}</p>}
              {w.improvement_at && <p className="text-sm text-[#45433F]"><strong className="font-semibold text-[#292825]">Mejora registrada</strong> el {formatDay(w.improvement_at)}{w.improvement_note ? `: ${w.improvement_note}` : ""}</p>}
              {w.status === "resuelto" && w.resolution_note && <p className="whitespace-pre-line text-sm text-[#45433F]"><strong className="font-semibold text-[#292825]">Cierre:</strong> {w.resolution_note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
