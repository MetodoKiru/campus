"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarClock, Check, ExternalLink, FileText, HelpCircle, Link2, Paperclip, Plus, Send, Trash2 } from "lucide-react";
import {
  ANSWER_LABEL, KIND_LABEL, STATUS_LABEL, STATUS_STYLE, archiveSubject, createSubject, defaultDueInput, dueInputToIso,
  fetchItems, fetchStudentSubjects, fetchSubjects, fetchSubmissions, formatDue, formatMoment, isoToDueInput, lateBy,
  openSubmissionFile, reviewItem, sendItem, setStudentSubject, updateItem,
  type SubjectFileRow, type SubjectItemKind, type SubjectItemStatusRow, type SubjectRow, type SubjectSubmissionRow,
} from "@/lib/subjects";

type Student = { id: string; username: string; name: string };

const KIND_ICON: Record<SubjectItemKind, typeof Link2> = { recurso: Link2, pregunta: HelpCircle, tarea: CalendarClock };
const input = "w-full p-2.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-xl text-xs focus:outline-none focus:border-[#B9A78C]";
const label = "text-[11px] font-bold uppercase tracking-wider text-[#6D6962]";

/**
 * Asignaturas del mentor: qué asignaturas ve cada alumno, crear asignaturas propias,
 * mandar recursos, preguntas y tareas con plazo, y el seguimiento de las entregas.
 */
export default function MentorSubjects({ students, selectedStudentId, notify }: {
  students: Student[];
  selectedStudentId: string | null;
  notify: (text: string) => void;
}) {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [visible, setVisible] = useState<Record<string, string[]>>({});
  const [items, setItems] = useState<SubjectItemStatusRow[]>([]);
  const [submissions, setSubmissions] = useState<SubjectSubmissionRow[]>([]);
  const [files, setFiles] = useState<SubjectFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSubject, setNewSubject] = useState("");
  const [busy, setBusy] = useState(false);

  const student = students.find((s) => s.id === selectedStudentId) ?? null;
  const studentIds = useMemo(() => students.map((s) => s.id), [students]);

  const load = useCallback(async () => {
    try {
      const [subjectRows, visibleRows, itemRows] = await Promise.all([fetchSubjects(), fetchStudentSubjects(studentIds), fetchItems(studentIds)]);
      setSubjects(subjectRows);
      setVisible(visibleRows);
      setItems(itemRows);
      const withAnswers = itemRows.filter((i) => i.kind !== "recurso" && (i.submissions_count ?? 0) > 0).map((i) => i.id);
      const detail = await fetchSubmissions(withAnswers);
      setSubmissions(detail.submissions);
      setFiles(detail.files);
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudieron cargar las asignaturas.");
    } finally {
      setLoading(false);
    }
  }, [studentIds, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const studentSubjects = student ? visible[student.id] ?? [] : [];
  // Las comunes, las del mentor y las que ya tiene activadas el alumno (la base de datos no devuelve otras).
  const usable = subjects;

  const toggle = async (subjectId: string) => {
    if (!student) return;
    const on = !studentSubjects.includes(subjectId);
    setVisible((prev) => ({ ...prev, [student.id]: on ? [...studentSubjects, subjectId] : studentSubjects.filter((id) => id !== subjectId) }));
    try { await setStudentSubject(student.id, subjectId, on); notify(on ? "Asignatura activada para el alumno." : "Asignatura quitada del panel del alumno."); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo guardar."); void load(); }
  };

  const addSubject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newSubject.trim() || busy) return;
    setBusy(true);
    try {
      const id = await createSubject(newSubject.trim());
      if (student) await setStudentSubject(student.id, id, true);
      setNewSubject("");
      notify(student ? `Asignatura creada y activada para ${student.name}.` : "Asignatura creada.");
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo crear la asignatura."); }
    finally { setBusy(false); }
  };

  const removeOwnSubject = async (subject: SubjectRow) => {
    if (!window.confirm(`¿Archivar «${subject.name}»? Desaparece de los paneles de tus alumnos; lo enviado se conserva.`)) return;
    try { await archiveSubject(subject.id); notify("Asignatura archivada."); await load(); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo archivar."); }
  };

  if (!students.length) {
    return <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] text-xs text-[#77736B]">Cuando tengas alumnos asignados podrás elegir sus asignaturas y mandarles tareas.</div>;
  }

  const studentItems = items.filter((i) => i.student_id === student?.id);

  return (
    <div className="space-y-5">
      {/* 1. Asignaturas visibles */}
      <section className="bg-white p-5 sm:p-7 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
        <div>
          <h2 className="text-xl font-serif text-[#292825] font-bold">Asignaturas de {student?.name ?? "tu alumno"}</h2>
          <p className="text-xs text-[#77736B] mt-1">Activa las que cursa. Solo esas aparecen en su panel. Puedes crear asignaturas nuevas con el nombre que quieras; solo las ven tus alumnos.</p>
        </div>
        {loading ? <p className="text-xs text-[#8D887F]">Cargando…</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {usable.map((subject) => {
              const on = studentSubjects.includes(subject.id);
              const own = Boolean(subject.owner_mentor_id);
              return (
                <div key={subject.id} className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${on ? "bg-[#F3EEE5]/60 border-[#D9C8AE]" : "bg-[#FAF8F5] border-[#E7E3DC]"}`}>
                  <button type="button" onClick={() => void toggle(subject.id)} className="flex-1 flex items-center justify-between gap-2 text-left">
                    <span className={`text-xs ${on ? "font-bold text-[#4A4032]" : "font-medium text-[#6D6962]"}`}>
                      {subject.name}{own && <span className="ml-1.5 text-[10px] font-semibold text-[#8A775B]">(propia)</span>}
                    </span>
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${on ? "bg-[#806C50] border-[#806C50] text-white" : "bg-white border-[#D6D1C8]"}`} aria-label={on ? "Activada" : "Desactivada"}>
                      {on && <Check className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                  {own && (
                    <button type="button" onClick={() => void removeOwnSubject(subject)} title="Archivar asignatura" className="p-1 text-[#A39E95] hover:text-rose-700">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <form onSubmit={addSubject} className="flex flex-col sm:flex-row gap-2">
          <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} maxLength={80} placeholder="Nueva asignatura, p. ej. «Valenciano» o «Lengua – redacciones»" className={input} />
          <button type="submit" disabled={busy || newSubject.trim().length < 2} className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#242321] text-white text-xs font-bold disabled:opacity-40">
            <Plus className="w-3.5 h-3.5" /> Nueva asignatura
          </button>
        </form>
      </section>

      {/* 2. Enviar */}
      {student && (
        <SendForm
          student={student}
          students={students}
          subjects={subjects.filter((s) => studentSubjects.includes(s.id))}
          notify={notify}
          onSent={load}
        />
      )}

      {/* 3. Seguimiento */}
      {student && (
        <FollowUp
          items={studentItems}
          submissions={submissions}
          files={files}
          notify={notify}
          onChanged={load}
        />
      )}
    </div>
  );
}

function SendForm({ student, students, subjects, notify, onSent }: {
  student: Student;
  students: Student[];
  subjects: SubjectRow[];
  notify: (text: string) => void;
  onSent: () => Promise<void>;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [kind, setKind] = useState<SubjectItemKind>("tarea");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [due, setDue] = useState(defaultDueInput);
  const [requiresFile, setRequiresFile] = useState(true);
  const [targets, setTargets] = useState<string[]>([student.id]);
  const [sending, setSending] = useState(false);

  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0];

  useEffect(() => {
    const timer = window.setTimeout(() => setTargets([student.id]), 0);
    return () => window.clearTimeout(timer);
  }, [student.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject || !title.trim() || sending) return;
    const dueAt = kind === "tarea" ? dueInputToIso(due) : null;
    if (kind === "tarea" && (!dueAt || new Date(dueAt).getTime() < Date.now())) { notify("No se puede: elige una fecha y hora de entrega futura."); return; }
    setSending(true);
    try {
      await sendItem({ students: targets.length ? targets : [student.id], subjectId: subject.id, kind, title: title.trim(), body, url, dueAt, requiresFile: kind === "tarea" && requiresFile });
      setTitle(""); setBody(""); setUrl("");
      notify(`${KIND_LABEL[kind]} enviada${targets.length > 1 ? ` a ${targets.length} alumnos` : ""}.`);
      await onSent();
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo enviar."); }
    finally { setSending(false); }
  };

  if (!subjects.length) {
    return <section className="bg-white p-5 rounded-3xl border border-[#E7E3DC] text-xs text-[#77736B]">Activa al menos una asignatura arriba para poder mandar recursos, preguntas o tareas.</section>;
  }

  return (
    <section className="bg-white p-5 sm:p-7 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
      <div>
        <h2 className="text-lg font-serif text-[#292825] font-bold">Enviar al alumno</h2>
        <p className="text-xs text-[#77736B] mt-1">Le aparece dentro de la asignatura y, si es pregunta o tarea, le llega un aviso a la campanita.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-1.5 bg-[#FAF8F5] border border-[#E7E3DC] p-1 rounded-xl w-fit text-xs font-bold">
          {(["tarea", "pregunta", "recurso"] as SubjectItemKind[]).map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <button key={k} type="button" onClick={() => setKind(k)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${kind === k ? "bg-[#242321] text-white" : "text-[#6D6962] hover:bg-white"}`}>
                <Icon className="w-3.5 h-3.5" /> {k === "recurso" ? "Enlace o recurso" : k === "pregunta" ? "¿Has hecho esto?" : "Tarea con entrega"}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1.5 block">
            <span className={label}>Asignatura</span>
            <select value={subject?.id ?? ""} onChange={(e) => setSubjectId(e.target.value)} className={input}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {kind === "tarea" && (
            <label className="space-y-1.5 block">
              <span className={label}>Fecha y hora de entrega</span>
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} required className={input} />
            </label>
          )}
        </div>
        <label className="space-y-1.5 block">
          <span className={label}>{kind === "pregunta" ? "Pregunta" : kind === "tarea" ? "Qué tiene que hacer" : "Título"}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required className={input}
            placeholder={kind === "pregunta" ? "¿Has hecho los ejercicios de la página 40?" : kind === "tarea" ? "Haz la redacción que te dije" : "Vídeo sobre la Revolución Francesa"} />
        </label>
        <label className="space-y-1.5 block">
          <span className={label}>Explicación (opcional)</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} className={input} placeholder="Instrucciones, páginas, extensión…" />
        </label>
        {kind !== "pregunta" && (
          <label className="space-y-1.5 block">
            <span className={label}>Enlace {kind === "recurso" ? "" : "(opcional)"}</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={1000} className={input} placeholder="https://…" />
          </label>
        )}
        {kind === "tarea" && (
          <label className="flex items-center gap-2 text-xs text-[#45433F]">
            <input type="checkbox" checked={requiresFile} onChange={(e) => setRequiresFile(e.target.checked)} />
            Tiene que entregar una foto, un PDF o un documento (si no, basta con marcarla como hecha)
          </label>
        )}
        {students.length > 1 && (
          <div className="space-y-1.5">
            <span className={label}>Para</span>
            <div className="flex flex-wrap gap-2">
              {students.map((s) => {
                const on = targets.includes(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => setTargets((prev) => on ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${on ? "bg-[#242321] text-white border-[#242321]" : "bg-[#FAF8F5] text-[#555149] border-[#E7E3DC]"}`}>
                    {s.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[#8D887F]">Si un alumno no tenía activada la asignatura, se le activa al enviarle esto.</p>
          </div>
        )}
        <button type="submit" disabled={sending || !title.trim()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#242321] text-white text-xs font-bold disabled:opacity-40">
          <Send className="w-3.5 h-3.5" /> {sending ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </section>
  );
}

function FollowUp({ items, submissions, files, notify, onChanged }: {
  items: SubjectItemStatusRow[];
  submissions: SubjectSubmissionRow[];
  files: SubjectFileRow[];
  notify: (text: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<"todo" | "tareas" | "revisar">("tareas");
  const shown = items.filter((i) => filter === "todo" ? true : filter === "tareas" ? i.kind !== "recurso"
    : i.kind !== "recurso" && (i.submissions_count ?? 0) > 0 && !i.reviewed_at);
  const tasks = items.filter((i) => i.kind === "tarea");
  const counts = {
    a_tiempo: tasks.filter((i) => i.status === "a_tiempo").length,
    tarde: tasks.filter((i) => i.status === "tarde").length,
    no_entregada: tasks.filter((i) => i.status === "no_entregada").length,
    pendiente: tasks.filter((i) => i.status === "pendiente").length,
  };

  return (
    <section className="bg-white p-5 sm:p-7 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-serif text-[#292825] font-bold">Seguimiento</h2>
          <p className="text-xs text-[#77736B] mt-1">La hora de entrega la apunta el campus. Si entrega después del plazo queda «tarde»; si no entrega nada, «no entregada».</p>
        </div>
        <div className="flex bg-[#FAF8F5] border border-[#E7E3DC] p-1 rounded-xl text-xs font-bold w-fit">
          {([["tareas", "Tareas y preguntas"], ["revisar", "Por revisar"], ["todo", "Todo"]] as const).map(([key, text]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-lg ${filter === key ? "bg-[#242321] text-white" : "text-[#6D6962]"}`}>{text}</button>
          ))}
        </div>
      </div>
      {tasks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(["a_tiempo", "tarde", "no_entregada", "pendiente"] as const).map((key) => (
            <div key={key} className={`p-3 rounded-2xl border ${STATUS_STYLE[key]}`}>
              <p className="text-xl font-bold">{counts[key]}</p>
              <p className="text-[11px] font-semibold">{STATUS_LABEL[key]}</p>
            </div>
          ))}
        </div>
      )}
      {shown.length === 0 ? <p className="text-xs text-[#8D887F]">Nada por aquí todavía.</p> : (
        <ul className="space-y-3">
          {shown.map((item) => (
            <MentorItem key={item.id} item={item} submissions={submissions.filter((s) => s.item_id === item.id)}
              files={files.filter((f) => f.item_id === item.id)} notify={notify} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MentorItem({ item, submissions, files, notify, onChanged }: {
  item: SubjectItemStatusRow;
  submissions: SubjectSubmissionRow[];
  files: SubjectFileRow[];
  notify: (text: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [feedback, setFeedback] = useState(item.feedback);
  const [editingDue, setEditingDue] = useState(false);
  const [due, setDue] = useState(isoToDueInput(item.due_at));
  const Icon = KIND_ICON[item.kind];

  const open = async (path: string) => {
    try { window.open(await openSubmissionFile(path), "_blank", "noopener,noreferrer"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo abrir el archivo."); }
  };
  const review = async () => {
    try { await reviewItem(item.id, feedback); notify("Marcada como revisada. El alumno recibe tu comentario."); await onChanged(); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo guardar."); }
  };
  const archive = async () => {
    if (!window.confirm("¿Quitarla del panel del alumno? Las entregas se conservan.")) return;
    try { await updateItem(item.id, { archive: true }); notify("Quitada del panel del alumno."); await onChanged(); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo quitar."); }
  };
  const saveDue = async () => {
    const iso = dueInputToIso(due);
    if (!iso) return;
    try { await updateItem(item.id, { dueAt: iso }); setEditingDue(false); notify("Plazo cambiado."); await onChanged(); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo cambiar el plazo."); }
  };

  return (
    <li className="p-4 rounded-2xl border border-[#E7E3DC] bg-[#FDFCFA] space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A775B] flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" /> {KIND_LABEL[item.kind]} · {item.subject_name}
          </p>
          <p className="text-sm font-bold text-[#292825]">{item.title}</p>
          {item.body && <p className="text-xs text-[#5F5B54] whitespace-pre-line">{item.body}</p>}
          {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#8A775B] hover:underline">Abrir enlace <ExternalLink className="w-3 h-3" /></a>}
          {item.kind === "tarea" && (
            <p className="text-xs text-[#45433F] flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Entrega: <strong>{formatDue(item.due_at, item.time_zone)}</strong>
              <button type="button" onClick={() => setEditingDue((v) => !v)} className="text-[11px] text-[#8A775B] font-bold hover:underline ml-1">cambiar</button>
            </p>
          )}
          {editingDue && (
            <div className="flex gap-2 pt-1">
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={input} />
              <button type="button" onClick={() => void saveDue()} className="px-3 rounded-xl bg-[#242321] text-white text-xs font-bold">Guardar</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
          <button type="button" onClick={() => void archive()} title="Quitar del panel del alumno" className="p-1 text-[#A39E95] hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {submissions.length > 0 && (
        <div className="space-y-2 border-t border-[#EEEAE4] pt-3">
          {submissions.map((s) => {
            const subFiles = files.filter((f) => f.submission_id === s.id);
            return (
              <div key={s.id} className="text-xs text-[#45433F] space-y-1">
                <p className="text-[11px] text-[#77736B]">
                  Entregado el <strong>{formatMoment(s.submitted_at)}</strong>
                  {s.late && <span className="ml-1.5 text-amber-700 font-bold">({lateBy(s.due_at_snapshot, s.submitted_at)})</span>}
                </p>
                {s.answer && <p>Respuesta: <strong>{ANSWER_LABEL[s.answer]}</strong></p>}
                {s.comment && <p className="whitespace-pre-line">«{s.comment}»</p>}
                {subFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {subFiles.map((f) => f.deleted_at ? (
                      <span key={f.id} className="text-[11px] text-[#A39E95] italic">{f.file_name} (archivo eliminado a fin de curso)</span>
                    ) : (
                      <button key={f.id} type="button" onClick={() => void open(f.storage_path)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E7E3DC] bg-white text-[11px] font-semibold hover:border-[#B9A78C]">
                        {f.mime_type.startsWith("image/") ? <Paperclip className="w-3 h-3" /> : <FileText className="w-3 h-3" />} {f.file_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {item.kind === "tarea" && (
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} placeholder="Comentario para el alumno (opcional)" className={input} />
              <button type="button" onClick={() => void review()} className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#806C50] text-white text-xs font-bold">
                <Check className="w-3.5 h-3.5" /> {item.reviewed_at ? "Actualizar revisión" : "Marcar revisada"}
              </button>
            </div>
          )}
          {item.reviewed_at && <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1"><BookOpen className="w-3 h-3" /> Revisada el {formatMoment(item.reviewed_at)}</p>}
        </div>
      )}
    </li>
  );
}
