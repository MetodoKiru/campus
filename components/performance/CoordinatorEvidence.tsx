"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  EvidenceExemptionCause, EvidenceExemptionRow, MaterialEvidenceFileRow, MaterialEvidenceMessageRow, MaterialEvidenceRow, ObligationReminderRow,
} from "@/lib/database.types";
import { EVIDENCE_KIND_LABEL, EXEMPTION_CAUSE_LABEL, bimesterLabel, errorMessage, fmtDay, signedPhotoUrls } from "@/lib/desempeno";

type Person = { id: string; full_name: string };
type Loaded = {
  toReview: MaterialEvidenceRow[];
  overdue: MaterialEvidenceRow[];
  messages: MaterialEvidenceMessageRow[];
  files: MaterialEvidenceFileRow[];
  exemptions: EvidenceExemptionRow[];
  reminders: ObligationReminderRow[];
  photos: Record<string, string>;
};

async function fetchEvidence(): Promise<Loaded> {
  const nowIso = new Date().toISOString();
  const [review, overdue] = await Promise.all([
    supabase.from("kiru_material_evidence").select("*").eq("status", "entregada").order("submitted_at").limit(100),
    supabase.from("kiru_material_evidence").select("*").in("status", ["pendiente", "aclaracion"]).lt("due_at", nowIso).order("due_at").limit(100),
  ]);
  if (review.error) throw review.error;
  if (overdue.error) throw overdue.error;
  const toReview = (review.data ?? []) as MaterialEvidenceRow[];
  const late = (overdue.data ?? []) as MaterialEvidenceRow[];
  const ids = [...toReview, ...late].map((e) => e.id);
  const [messages, files, exemptions, reminders] = ids.length ? await Promise.all([
    supabase.from("kiru_material_evidence_messages").select("*").in("evidence_id", ids).order("created_at"),
    supabase.from("kiru_material_evidence_files").select("*").in("evidence_id", ids).order("created_at"),
    supabase.from("kiru_evidence_exemptions").select("*").in("evidence_id", ids),
    supabase.from("kiru_obligation_reminders").select("*").in("evidence_id", ids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const messageRows = ((messages.data ?? []) as MaterialEvidenceMessageRow[]).filter((m) => m.author_role !== "mentor" || m.sent_at);
  const sent = new Set(messageRows.map((m) => m.id));
  const fileRows = ((files.data ?? []) as MaterialEvidenceFileRow[]).filter((f) => sent.has(f.message_id));
  return {
    toReview, overdue: late, messages: messageRows, files: fileRows,
    exemptions: (exemptions.data ?? []) as EvidenceExemptionRow[],
    reminders: (reminders.data ?? []) as ObligationReminderRow[],
    photos: await signedPhotoUrls(fileRows.filter((f) => !f.deleted_at).map((f) => f.storage_path)),
  };
}

/**
 * Bandeja de evidencias de Coordinación (pestaña «Seguimiento»): entregas por
 * revisar (validar o pedir aclaración) y entregas vencidas con el paso de la
 * escalera de recordatorios en el que están. Una exención se propone aquí y la
 * aprueba Administración.
 */
export default function CoordinatorEvidence({ people, mentorFilter, notify }: {
  people: Person[]; mentorFilter: string; notify: (text: string, type: "success" | "error") => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetchEvidence().then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setError(errorMessage(e, "No se pudieron cargar las evidencias.")); });
    return () => { alive = false; };
  }, []);
  const reload = useCallback(async () => {
    try { setData(await fetchEvidence()); } catch (e) { setError(errorMessage(e, "No se pudieron cargar las evidencias.")); }
  }, []);
  const name = (id: string | null | undefined) => people.find((p) => p.id === id)?.full_name ?? "—";
  const visible = (e: MaterialEvidenceRow) => mentorFilter === "todos" || e.mentor_id === mentorFilter;

  if (error) return <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">{error}</p>;
  if (!data) return null;
  const toReview = data.toReview.filter(visible);
  const overdue = data.overdue.filter(visible);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-[#292825] flex items-center gap-2"><Camera className="h-4 w-4 text-cyan-800" /> Evidencias por revisar {toReview.length > 0 && <span className="text-amber-700">({toReview.length})</span>}</h3>
      <p className="text-[11px] text-slate-500">«Descubrirme» (mínimo 3 fotos sin la cara del alumno y una línea) y misión (1 foto o descripción), por alumno y bimestre. Lo enviado y aún sin revisar nunca perjudica al mentor.</p>
      {toReview.length === 0 && <p className="text-xs text-slate-500">No hay evidencias pendientes de revisar.</p>}
      {toReview.map((e) => (
        <ReviewCard key={e.id} evidence={e} mentor={name(e.mentor_id)} student={name(e.student_id)} data={data} notify={notify} onSaved={reload} />
      ))}
      {overdue.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-bold text-[#292825]">Sin entregar o sin aclarar ({overdue.length})</h3>
          <p className="text-[11px] text-slate-500">El campus avisa al mentor al vencer y a los 2 días laborables; al 3.er recordatorio te abre una revisión. Nunca se crea una incidencia sola.</p>
          {overdue.map((e) => (
            <OverdueCard key={e.id} evidence={e} mentor={name(e.mentor_id)} student={name(e.student_id)} data={data} notify={notify} onSaved={reload} />
          ))}
        </>
      )}
    </div>
  );
}

function Thread({ evidence, data }: { evidence: MaterialEvidenceRow; data: Loaded }) {
  const messages = data.messages.filter((m) => m.evidence_id === evidence.id);
  return (
    <div className="space-y-2">
      {messages.map((m) => {
        const files = data.files.filter((f) => f.message_id === m.id);
        return (
          <div key={m.id} className="rounded-xl bg-[#FAF8F5] border border-[#EFEBE4] p-2.5 text-xs text-slate-700">
            <p className="text-[10px] font-semibold text-slate-500">{m.author_role === "mentor" ? "Mentor" : m.author_role === "sistema" ? "Campus" : m.author_role === "admin" ? "Administración" : "Coordinación"} · {fmtDay(m.sent_at ?? m.created_at)}</p>
            {m.body && <p className="mt-0.5 whitespace-pre-line">{m.body}</p>}
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f) => data.photos[f.storage_path]
                  ? (
                    <a key={f.id} href={data.photos[f.storage_path]} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={data.photos[f.storage_path]} alt={f.file_name} className="h-24 w-24 rounded-lg border border-slate-200 object-cover" />
                    </a>
                  )
                  : <span key={f.id} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-500">{f.deleted_at ? "foto eliminada (fin de curso)" : f.file_name}</span>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReviewCard({ evidence, mentor, student, data, notify, onSaved }: {
  evidence: MaterialEvidenceRow; mentor: string; student: string; data: Loaded;
  notify: (text: string, type: "success" | "error") => void; onSaved: () => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (action: "validar" | "aclaracion") => {
    setBusy(true);
    const { error } = await supabase.rpc("kiru_evidence_review", { p_evidence: evidence.id, p_action: action, p_comment: comment });
    setBusy(false);
    if (error) { notify(errorMessage(error, "No se pudo guardar."), "error"); return; }
    notify(action === "validar" ? "Evidencia validada." : "Aclaración pedida: el mentor tiene 2 días laborables.", "success");
    await onSaved();
  };
  return (
    <article className="bg-white rounded-2xl border border-[#E7E3DC] p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-900">{mentor} · {EVIDENCE_KIND_LABEL[evidence.kind]} de {student}</p>
          <p className="text-[11px] text-slate-500">Bimestre {bimesterLabel(evidence)} · enviada el {fmtDay(evidence.submitted_at)}{evidence.submitted_at && evidence.submitted_at > evidence.due_at ? " (fuera de plazo)" : ""}</p>
        </div>
      </div>
      <Thread evidence={evidence} data={data} />
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Comentario (obligatorio si pides aclaración)" className="flex-1 p-2.5 rounded-xl border border-slate-200 bg-white text-xs" />
        <button disabled={busy} onClick={() => void act("validar")} className="rounded-xl bg-cyan-800 px-3 py-2 text-[11px] font-semibold text-white hover:bg-cyan-900 disabled:opacity-50 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Validar</button>
        <button disabled={busy || !comment.trim()} onClick={() => void act("aclaracion")} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Pedir aclaración</button>
      </div>
    </article>
  );
}

function OverdueCard({ evidence, mentor, student, data, notify, onSaved }: {
  evidence: MaterialEvidenceRow; mentor: string; student: string; data: Loaded;
  notify: (text: string, type: "success" | "error") => void; onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [cause, setCause] = useState<EvidenceExemptionCause | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const step = Math.max(0, ...data.reminders.filter((r) => r.evidence_id === evidence.id).map((r) => r.step));
  const proposed = data.exemptions.some((x) => x.evidence_id === evidence.id && x.status === "propuesta");
  const propose = async () => {
    if (!cause) { notify("Elige la causa.", "error"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("kiru_evidence_exemption_propose", { p_evidence: evidence.id, p_cause: cause, p_note: note });
    setBusy(false);
    if (error) { notify(errorMessage(error, "No se pudo proponer."), "error"); return; }
    notify("Exención propuesta. La aprobará o rechazará Administración.", "success");
    await onSaved();
  };
  return (
    <article className="bg-white rounded-2xl border border-amber-200 p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-900">{mentor} · {EVIDENCE_KIND_LABEL[evidence.kind]} de {student}</p>
          <p className="text-[11px] text-slate-500">
            Bimestre {bimesterLabel(evidence)} · {evidence.status === "aclaracion" ? `aclaración pedida, plazo ${fmtDay(evidence.clarification_due_at)}` : `vencía el ${fmtDay(evidence.due_at)}`}
          </p>
        </div>
        <span className={`text-[10px] rounded-full border px-2 py-0.5 font-semibold ${step >= 3 ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {step === 0 ? "Sin recordatorios aún" : step >= 3 ? "3.er recordatorio: revisión abierta" : `${step}.º recordatorio enviado`}
        </span>
      </div>
      {evidence.status === "aclaracion" && <Thread evidence={evidence} data={data} />}
      {proposed ? <p className="text-[11px] text-slate-500">Exención propuesta, pendiente de Administración.</p> : open ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={cause} onChange={(e) => setCause(e.target.value as EvidenceExemptionCause | "")} aria-label="Causa" className="p-2 rounded-xl border border-slate-200 bg-white text-xs">
            <option value="">Causa…</option>
            {(Object.keys(EXEMPTION_CAUSE_LABEL) as EvidenceExemptionCause[]).map((c) => <option key={c} value={c}>{EXEMPTION_CAUSE_LABEL[c]}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Explícalo brevemente" className="flex-1 p-2 rounded-xl border border-slate-200 bg-white text-xs" />
          <button disabled={busy || !note.trim()} onClick={() => void propose()} className="rounded-xl bg-cyan-800 px-3 py-2 text-[11px] font-semibold text-white hover:bg-cyan-900 disabled:opacity-50">Proponer exención</button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800">Proponer exención (la aprueba Administración)</button>
      )}
    </article>
  );
}
