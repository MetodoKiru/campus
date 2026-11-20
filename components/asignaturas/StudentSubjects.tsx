"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Camera, CheckCircle2, ExternalLink, FileText, HelpCircle, Link2, Paperclip, Send } from "lucide-react";
import {
  ANSWER_LABEL, STATUS_LABEL, STATUS_STYLE, SUBMISSION_ACCEPT, checkFiles, fetchItems, fetchStudentSubjects, fetchSubjects,
  fetchSubmissions, formatDue, formatMoment, lateBy, markSeen, openSubmissionFile, submitItem,
  type SubjectAnswer, type SubjectFileRow, type SubjectItemStatusRow, type SubjectRow, type SubjectSubmissionRow,
} from "@/lib/subjects";

/** Recursos fijos de las asignaturas de siempre (por código). */
export type FixedResources = Record<string, { desc: string; links: { title: string; url: string; note: string }[] }>;

type Data = {
  subjects: SubjectRow[];
  items: SubjectItemStatusRow[];
  submissions: SubjectSubmissionRow[];
  files: SubjectFileRow[];
};

function useStudentSubjects(studentId: string | null) {
  const [data, setData] = useState<Data>({ subjects: [], items: [], submissions: [], files: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    try {
      const [all, visible, items] = await Promise.all([fetchSubjects(), fetchStudentSubjects([studentId]), fetchItems([studentId])]);
      const mine = new Set(visible[studentId] ?? []);
      const detail = await fetchSubmissions(items.filter((i) => (i.submissions_count ?? 0) > 0).map((i) => i.id));
      setData({ subjects: all.filter((s) => mine.has(s.id)), items, ...detail });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar tus asignaturas.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(first);
  }, [load]);

  return { ...data, loading, error, reload: load };
}

/** Bloque de Inicio: lo que hay que entregar pronto y lo que va tarde. */
export function StudentPendingTasks({ studentId, onOpen }: { studentId: string | null; onOpen: () => void }) {
  const { items, loading } = useStudentSubjects(studentId);
  const pending = items
    .filter((i) => (i.kind === "tarea" && (i.status === "pendiente" || i.status === "no_entregada")) || (i.kind === "pregunta" && i.status === "sin_responder"))
    .sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  if (loading || !pending.length) return null;
  return (
    <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-serif text-base text-[#292825] font-bold flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Para entregar</h3>
        <button type="button" onClick={onOpen} className="text-xs font-bold text-[#8A775B] hover:underline">Ver asignaturas →</button>
      </div>
      <ul className="space-y-2">
        {pending.slice(0, 5).map((item) => (
          <li key={item.id}>
            <button type="button" onClick={onOpen} className="w-full text-left p-3 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] hover:bg-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A775B]">{item.subject_name}</p>
                <p className="text-xs font-semibold text-[#292825] truncate">{item.title}</p>
                {item.due_at && <p className="text-[11px] text-[#77736B]">Entrega: {formatDue(item.due_at, item.time_zone)}</p>}
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sección «Asignaturas» del alumno: solo las que su mentor tiene activadas. */
export default function StudentSubjects({ studentId, resources, notify }: {
  studentId: string | null;
  resources: FixedResources;
  notify: (text: string, type?: "success" | "error") => void;
}) {
  const { subjects, items, submissions, files, loading, error, reload } = useStudentSubjects(studentId);
  const [selected, setSelected] = useState<string | null>(null);
  // Si no ha elegido, se abre la primera asignatura con algo pendiente.
  const firstPending = items.find((i) => i.status === "pendiente" || i.status === "no_entregada" || i.status === "sin_responder")?.subject_id;
  const subject = subjects.find((s) => s.id === selected) ?? subjects.find((s) => s.id === firstPending) ?? subjects[0] ?? null;
  const subjectItems = useMemo(() => items.filter((i) => i.subject_id === subject?.id), [items, subject?.id]);
  const seenOnce = useRef(new Set<string>());

  // Al abrir una asignatura, lo nuevo pasa a «visto».
  useEffect(() => {
    const fresh = subjectItems.filter((i) => !i.seen_at && !seenOnce.current.has(i.id)).map((i) => i.id);
    if (!fresh.length) return;
    fresh.forEach((id) => seenOnce.current.add(id));
    void markSeen(fresh);
  }, [subjectItems]);

  if (loading) return <p className="text-xs text-[#8D887F]">Cargando tus asignaturas…</p>;
  if (error) return <p className="text-xs text-rose-700">{error}</p>;

  const counts = (id: string) => items.filter((i) => i.subject_id === id && (i.status === "pendiente" || i.status === "no_entregada" || i.status === "sin_responder")).length;
  const fixed = subject?.code ? resources[subject.code] : undefined;
  const tasks = subjectItems.filter((i) => i.kind !== "recurso");
  const resourcesSent = subjectItems.filter((i) => i.kind === "recurso");

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div>
        <h2 className="text-xl sm:text-2xl font-serif text-[#292825] font-bold">Asignaturas</h2>
        <p className="text-xs text-[#77736B]">Tus tareas, preguntas y recursos de tu mentor, por asignatura.</p>
      </div>

      {subjects.length === 0 ? (
        <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] text-xs text-[#77736B]">Tu mentor todavía no ha activado asignaturas para ti.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const n = counts(s.id);
              return (
                <button key={s.id} type="button" onClick={() => setSelected(s.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${subject?.id === s.id ? "bg-[#242321] text-white border-[#242321]" : "bg-white text-[#45433F] border-[#E7E3DC] hover:bg-[#FAF8F5]"}`}>
                  {s.name}
                  {n > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center ${subject?.id === s.id ? "bg-white text-[#242321]" : "bg-[#806C50] text-white"}`}>{n}</span>}
                </button>
              );
            })}
          </div>

          {subject && (
            <div className="bg-white rounded-3xl border border-[#E7E3DC] p-5 sm:p-8 space-y-6 shadow-xs">
              <div>
                <h3 className="text-2xl font-serif text-[#292825] font-bold">{subject.name}</h3>
                {(fixed?.desc || subject.description) && <p className="text-xs text-[#77736B] mt-1">{fixed?.desc || subject.description}</p>}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#6D6962]">Tareas y preguntas</h4>
                {tasks.length === 0 ? <p className="text-xs text-[#8D887F] italic">No tienes nada pendiente en esta asignatura.</p> : (
                  <ul className="space-y-3">
                    {tasks.map((item) => (
                      <StudentItem key={item.id} item={item} studentId={studentId}
                        submissions={submissions.filter((s) => s.item_id === item.id)} files={files.filter((f) => f.item_id === item.id)}
                        notify={notify} onDone={reload} />
                    ))}
                  </ul>
                )}
              </div>

              {(resourcesSent.length > 0 || (fixed?.links.length ?? 0) > 0) && (
                <div className="space-y-3 pt-4 border-t border-[#EEEAE4]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#6D6962]">Recursos</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {resourcesSent.map((r) => (
                      <div key={r.id} className="p-4 rounded-2xl border border-[#E2DED7] bg-blue-50/60 space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] text-[#77736B] font-bold uppercase">
                          <span className="flex items-center gap-1"><Link2 className="w-3 h-3" /> De tu mentor</span>
                          <span>{new Date(r.created_at).toLocaleDateString("es-ES")}</span>
                        </div>
                        <p className="text-xs font-semibold text-[#292825]">{r.title}</p>
                        {r.body && <p className="text-[11px] text-[#5F5B54] whitespace-pre-line">{r.body}</p>}
                        {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#8A775B] font-bold hover:underline">Abrir enlace <ExternalLink className="w-3 h-3" /></a>}
                      </div>
                    ))}
                    {fixed?.links.map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="p-4 rounded-2xl border border-[#E7E3DC] bg-[#F7F5F1] hover:bg-white transition space-y-1.5 group">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-xs text-[#292825] group-hover:text-[#8A775B]">{l.title}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-[#8D887F]" />
                        </div>
                        <p className="text-[11px] text-[#77736B] leading-relaxed">{l.note}</p>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StudentItem({ item, studentId, submissions, files, notify, onDone }: {
  item: SubjectItemStatusRow;
  studentId: string | null;
  submissions: SubjectSubmissionRow[];
  files: SubjectFileRow[];
  notify: (text: string, type?: "success" | "error") => void;
  onDone: () => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [chosen, setChosen] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(item.kind === "tarea" && (item.status === "pendiente" || item.status === "no_entregada"));
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const Icon = item.kind === "tarea" ? CalendarClock : HelpCircle;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...chosen, ...Array.from(list)];
    const problem = checkFiles(next);
    if (problem) { notify(problem, "error"); return; }
    setChosen(next);
  };

  const send = async (answer?: SubjectAnswer) => {
    if (!studentId || sending) return;
    setSending(true);
    try {
      await submitItem({ studentId, itemId: item.id, answer: answer ?? null, comment, files: chosen });
      setComment(""); setChosen([]);
      const late = item.kind === "tarea" && item.due_at && new Date() > new Date(item.due_at);
      notify(item.kind === "pregunta" ? "¡Respuesta enviada a tu mentor!" : late ? "Entregada. Ha llegado después del plazo y se marca como tarde." : "¡Entregada a tiempo!");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo entregar.", "error");
    } finally {
      setSending(false);
    }
  };

  const openFile = async (path: string) => {
    try { window.open(await openSubmissionFile(path), "_blank", "noopener,noreferrer"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo abrir el archivo.", "error"); }
  };

  const lastAnswer = submissions.length ? submissions[submissions.length - 1].answer : null;

  return (
    <li className="p-4 rounded-2xl border border-[#E7E3DC] bg-[#FDFCFA] space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A775B] flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {item.kind === "tarea" ? "Tarea" : "Pregunta de tu mentor"}</p>
          <p className="text-sm font-bold text-[#292825]">{item.title}</p>
          {item.body && <p className="text-xs text-[#5F5B54] whitespace-pre-line">{item.body}</p>}
          {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#8A775B] hover:underline">Abrir enlace <ExternalLink className="w-3 h-3" /></a>}
          {item.due_at && <p className="text-xs text-[#45433F]">Entrega: <strong>{formatDue(item.due_at, item.time_zone)}</strong>{item.requires_file && " · con foto o archivo"}</p>}
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-bold ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      </div>

      {submissions.length > 0 && (
        <div className="text-[11px] text-[#5F5B54] space-y-1.5 border-t border-[#EEEAE4] pt-2">
          {submissions.map((s) => (
            <div key={s.id}>
              <p>{item.kind === "pregunta" ? "Respondiste" : "Entregaste"} el <strong>{formatMoment(s.submitted_at)}</strong>
                {s.late && <span className="text-amber-700 font-bold"> ({lateBy(s.due_at_snapshot, s.submitted_at)})</span>}
                {s.answer && <>: <strong>{ANSWER_LABEL[s.answer]}</strong></>}</p>
              {s.comment && <p className="italic">«{s.comment}»</p>}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {files.filter((f) => f.submission_id === s.id).map((f) => f.deleted_at
                  ? <span key={f.id} className="text-[#A39E95] italic">{f.file_name} (eliminado a fin de curso)</span>
                  : <button key={f.id} type="button" onClick={() => void openFile(f.storage_path)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[#E7E3DC] bg-white font-semibold"><Paperclip className="w-3 h-3" /> {f.file_name}</button>)}
              </div>
            </div>
          ))}
          {item.reviewed_at && (
            <p className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Tu mentor lo ha revisado{item.feedback ? `: «${item.feedback}»` : "."}</span>
            </p>
          )}
        </div>
      )}

      {item.kind === "pregunta" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(["si", "a_medias", "no"] as SubjectAnswer[]).map((a) => (
              <button key={a} type="button" disabled={sending} onClick={() => void send(a)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border ${lastAnswer === a ? "bg-[#242321] text-white border-[#242321]" : "bg-white text-[#45433F] border-[#E7E3DC] hover:bg-[#FAF8F5]"} disabled:opacity-50`}>
                {ANSWER_LABEL[a]}
              </button>
            ))}
          </div>
          <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Si quieres, explica algo a tu mentor (antes de pulsar la respuesta)"
            className="w-full p-2.5 bg-white border border-[#E7E3DC] rounded-xl text-xs focus:outline-none" />
        </div>
      )}

      {item.kind === "tarea" && (
        open ? (
          <div className="space-y-2.5 border-t border-[#EEEAE4] pt-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => cameraRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E7E3DC] bg-white text-xs font-bold"><Camera className="w-3.5 h-3.5" /> Hacer foto</button>
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E7E3DC] bg-white text-xs font-bold"><FileText className="w-3.5 h-3.5" /> Subir archivo</button>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <input ref={fileRef} type="file" accept={SUBMISSION_ACCEPT} multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {chosen.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {chosen.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#F3EEE5] text-[11px] font-semibold text-[#4A4032]">
                    {f.name}
                    <button type="button" onClick={() => setChosen((prev) => prev.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`} className="ml-1 text-[#8A775B]">×</button>
                  </li>
                ))}
              </ul>
            )}
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} placeholder="Comentario para tu mentor (opcional)"
              className="w-full p-2.5 bg-white border border-[#E7E3DC] rounded-xl text-xs focus:outline-none" />
            <button type="button" disabled={sending || (item.requires_file && chosen.length === 0) || (!chosen.length && !comment.trim())} onClick={() => void send()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#242321] text-white text-xs font-bold disabled:opacity-40">
              <Send className="w-3.5 h-3.5" /> {sending ? "Enviando…" : submissions.length ? "Añadir a la entrega" : "Entregar"}
            </button>
            {item.requires_file && chosen.length === 0 && <p className="text-[11px] text-[#8D887F]">Esta tarea necesita una foto, un PDF o un documento.</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-[#8A775B] hover:underline">
            {submissions.length ? "Añadir algo más a la entrega" : "Entregar"}
          </button>
        )
      )}
    </li>
  );
}
