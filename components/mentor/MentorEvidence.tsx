"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, ChevronDown, ChevronUp, Clock, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  EvidenceExemptionCause, EvidenceExemptionRow, MaterialEvidenceFileRow, MaterialEvidenceMessageRow, MaterialEvidenceRow,
} from "@/lib/database.types";
import {
  EVIDENCE_KIND_HINT, EVIDENCE_KIND_LABEL, EVIDENCE_PHOTO_ACCEPT, EVIDENCE_PHOTO_MIMES, EVIDENCE_STATUS_LABEL, EXEMPTION_CAUSE_LABEL,
  bimesterLabel, errorMessage, fmtDay, signedPhotoUrls,
} from "@/lib/desempeno";
import { MAX_EVIDENCE_BYTES, evidenceMime, safeFileName } from "@/lib/supervision";

const primaryButton = "inline-flex items-center gap-1.5 rounded-xl bg-[#242321] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#3A3835] disabled:opacity-50";
const secondaryButton = "inline-flex items-center gap-1.5 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] px-4 py-2.5 text-xs font-bold text-[#45433F] transition hover:bg-[#F3F0EA] disabled:opacity-50";
const field = "w-full rounded-xl border border-[#E7E3DC] bg-white px-3 py-2.5 text-sm text-[#292825] outline-none focus:border-[#806C50]";

type Data = {
  evidence: MaterialEvidenceRow[];
  messages: MaterialEvidenceMessageRow[];
  files: MaterialEvidenceFileRow[];
  exemptions: EvidenceExemptionRow[];
  students: Record<string, string>;
  photos: Record<string, string>;
};

/** El mentor solo ve «Mis evidencias» cuando el sistema sale del modo oculto. */
export function useEvidenceVisible(enabled: boolean): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void supabase.rpc("kiru_evidence_visible").then(({ data }) => { if (alive) setVisible(data === true); });
    return () => { alive = false; };
  }, [enabled]);
  return visible;
}

async function loadData(): Promise<Data> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
  const { data: rows, error } = await supabase.from("kiru_material_evidence").select("*")
    .eq("mentor_id", user.id).order("due_at", { ascending: false }).limit(200);
  if (error) throw error;
  const evidence = (rows ?? []) as MaterialEvidenceRow[];
  const ids = evidence.map((e) => e.id);
  const studentIds = [...new Set(evidence.map((e) => e.student_id))];
  const [messages, files, exemptions, students] = await Promise.all([
    ids.length ? supabase.from("kiru_material_evidence_messages").select("*").in("evidence_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("kiru_material_evidence_files").select("*").in("evidence_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("kiru_evidence_exemptions").select("*").in("evidence_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    studentIds.length ? supabase.from("profiles").select("id,full_name").in("id", studentIds) : Promise.resolve({ data: [] }),
  ]);
  const fileRows = (files.data ?? []) as MaterialEvidenceFileRow[];
  const messageRows = (messages.data ?? []) as MaterialEvidenceMessageRow[];
  const sent = new Set(messageRows.filter((m) => m.sent_at || m.author_role !== "mentor").map((m) => m.id));
  const visibleFiles = fileRows.filter((f) => sent.has(f.message_id));
  return {
    evidence,
    messages: messageRows.filter((m) => sent.has(m.id)),
    files: visibleFiles,
    exemptions: (exemptions.data ?? []) as EvidenceExemptionRow[],
    students: Object.fromEntries(((students.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])),
    photos: await signedPhotoUrls(visibleFiles.filter((f) => !f.deleted_at).map((f) => f.storage_path)),
  };
}

/**
 * «Mis evidencias» (menú ☰ del mentor): las entregas bimestrales de «Descubrirme»
 * y «Misión» de cada alumno, la respuesta a las aclaraciones de Coordinación y la
 * propuesta de exención (que aprueba Administración).
 */
export default function MentorEvidence({ notify }: { notify: (text: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setData(await loadData()); setError(null); }
    catch (e) { setError(errorMessage(e, "No se pudieron cargar tus evidencias.")); }
  }, []);
  useEffect(() => {
    let alive = true;
    loadData()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(errorMessage(e, "No se pudieron cargar tus evidencias.")); });
    return () => { alive = false; };
  }, []);

  const groups = useMemo(() => {
    const list = data?.evidence ?? [];
    return {
      todo: list.filter((e) => e.status === "pendiente" || e.status === "aclaracion").sort((a, b) => a.due_at.localeCompare(b.due_at)),
      sent: list.filter((e) => e.status === "entregada"),
      done: list.filter((e) => e.status === "validada" || e.status === "exenta"),
    };
  }, [data]);

  return (
    <section className="space-y-5 rounded-3xl border border-[#E7E3DC] bg-white p-6 shadow-xs sm:p-8">
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C50]">Materiales Kiru</span>
        <h2 className="mt-0.5 font-serif text-xl font-bold text-[#292825]">Mis evidencias</h2>
      </div>
      <p className="text-sm leading-relaxed text-[#45433F]">
        Cada 2 meses, por cada alumno, envía una evidencia de «Descubrirme» y otra de la misión. Tienes 5 días desde que acaba el bimestre.
        En las fotos no debe salir la cara del alumno. Si no has podido hacerlo por una causa justificada, puedes proponer una exención.
      </p>
      {error && <p className="rounded-2xl border border-[#D9B3AA] bg-white p-4 text-xs text-[#9A4B3F]">{error}</p>}
      {!data && !error && <p className="text-xs text-[#77736B]">Cargando…</p>}
      {data && (
        <>
          <Group title="Por enviar" empty="No tienes ninguna evidencia pendiente." items={groups.todo} data={data} notify={notify} onSaved={reload} />
          {groups.sent.length > 0 && <Group title="Enviadas, en revisión" empty="" items={groups.sent} data={data} notify={notify} onSaved={reload} />}
          {groups.done.length > 0 && <Group title="Historial" empty="" items={groups.done} data={data} notify={notify} onSaved={reload} />}
        </>
      )}
    </section>
  );
}

function Group({ title, empty, items, data, notify, onSaved }: {
  title: string; empty: string; items: MaterialEvidenceRow[]; data: Data; notify: (t: string) => void; onSaved: () => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">{title}</h3>
      {items.length === 0 && <p className="text-xs text-[#77736B]">{empty}</p>}
      <ul className="space-y-2">
        {items.map((e) => <EvidenceCard key={e.id} evidence={e} data={data} notify={notify} onSaved={onSaved} />)}
      </ul>
    </div>
  );
}

function EvidenceCard({ evidence, data, notify, onSaved }: {
  evidence: MaterialEvidenceRow; data: Data; notify: (t: string) => void; onSaved: () => Promise<void>;
}) {
  const open = evidence.status === "pendiente" || evidence.status === "aclaracion";
  const [expanded, setExpanded] = useState(evidence.status === "aclaracion");
  const messages = data.messages.filter((m) => m.evidence_id === evidence.id);
  const files = data.files.filter((f) => f.evidence_id === evidence.id);
  const exemption = data.exemptions.filter((x) => x.evidence_id === evidence.id).at(-1) ?? null;
  const student = data.students[evidence.student_id]?.split(" ")[0] ?? "Alumno";
  const due = evidence.status === "aclaracion" ? evidence.clarification_due_at : evidence.due_at;
  const late = open && due ? new Date(due) < new Date() : false;
  const notStarted = new Date(`${evidence.bimester_end}T00:00:00`) > new Date();

  return (
    <li className={`rounded-2xl border p-4 ${evidence.status === "aclaracion" ? "border-[#E4D8C5] bg-[#F3EEE5]" : "border-[#E7E3DC] bg-[#FAF8F5]"}`}>
      <button type="button" onClick={() => setExpanded(!expanded)} className="flex w-full items-start gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#292825]">{student} · {EVIDENCE_KIND_LABEL[evidence.kind]}</span>
          <span className="mt-0.5 block text-[11px] text-[#77736B]">
            Bimestre {bimesterLabel(evidence)}
            {open && due ? <> · {late ? <strong className="text-[#9A4B3F]">plazo vencido el {fmtDay(due)}</strong> : `enviar antes del ${fmtDay(due)}`}</> : null}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-[#E7E3DC] bg-white px-2.5 py-1 text-[10px] font-bold text-[#6D6962]">{EVIDENCE_STATUS_LABEL[evidence.status]}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-[#77736B]" /> : <ChevronDown className="h-4 w-4 text-[#77736B]" />}
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[#E7E3DC] pt-3">
          <p className="text-xs text-[#6D6962]">{EVIDENCE_KIND_HINT[evidence.kind]}</p>
          {messages.map((m) => (
            <div key={m.id} className="rounded-xl bg-white p-3 text-xs text-[#45433F]">
              <p className="text-[10px] font-semibold text-[#77736B]">
                {m.author_role === "mentor" ? "Tú" : m.author_role === "sistema" ? "Campus" : m.author_role === "admin" ? "Administración" : "Coordinación"} · {fmtDay(m.sent_at ?? m.created_at)}
              </p>
              {m.body && <p className="mt-1 whitespace-pre-line">{m.body}</p>}
              <Photos files={files.filter((f) => f.message_id === m.id)} urls={data.photos} />
            </div>
          ))}
          {evidence.status === "exenta" && evidence.exempt_reason && <p className="text-xs text-[#6D6962] flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> {evidence.exempt_reason}</p>}
          {evidence.status === "validada" && <p className="text-xs text-[#45433F] flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#806C50]" /> Validada el {fmtDay(evidence.validated_at)}</p>}
          {open && notStarted && evidence.status === "pendiente" && (
            <p className="text-xs text-[#6D6962] flex items-center gap-1.5"><Clock className="h-4 w-4" /> El bimestre aún no ha terminado: puedes enviarla cuando quieras antes del plazo.</p>
          )}
          {open && <SendForm evidence={evidence} notify={notify} onSaved={onSaved} />}
          {open && (exemption?.status === "propuesta"
            ? <p className="text-xs text-[#6D6962]">Exención propuesta ({EXEMPTION_CAUSE_LABEL[exemption.cause]}), pendiente de Administración.</p>
            : <ExemptionForm evidence={evidence} notify={notify} onSaved={onSaved} />)}
        </div>
      )}
    </li>
  );
}

function Photos({ files, urls }: { files: MaterialEvidenceFileRow[]; urls: Record<string, string> }) {
  if (!files.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => f.deleted_at || !urls[f.storage_path]
        ? <span key={f.id} className="rounded-lg border border-[#E7E3DC] px-2 py-1 text-[10px] text-[#77736B]">{f.deleted_at ? "foto eliminada (fin de curso)" : f.file_name}</span>
        : (
          <a key={f.id} href={urls[f.storage_path]} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[f.storage_path]} alt={f.file_name} className="h-20 w-20 rounded-lg border border-[#E7E3DC] object-cover" />
          </a>
        ))}
    </div>
  );
}

function SendForm({ evidence, notify, onSaved }: { evidence: MaterialEvidenceRow; notify: (t: string) => void; onSaved: () => Promise<void> }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = (list: FileList | null) => {
    const chosen = Array.from(list ?? []);
    const bad = chosen.find((f) => !EVIDENCE_PHOTO_MIMES.includes(evidenceMime(f) ?? "") || f.size > MAX_EVIDENCE_BYTES);
    if (bad) { setError(`«${bad.name}» no vale: solo fotos (JPG, PNG, WEBP o HEIC) de hasta 10 MB.`); return; }
    setError("");
    setFiles(chosen.slice(0, 10));
  };

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const { data: messageId, error: startError } = await supabase.rpc("kiru_evidence_start", { p_evidence: evidence.id, p_body: body });
      if (startError || !messageId) throw startError ?? new Error("No se pudo empezar la entrega.");
      for (const [index, file] of files.entries()) {
        const path = `material/${evidence.id}/${messageId}/${safeFileName(file.name, index)}`;
        const mime = evidenceMime(file) ?? "image/jpeg";
        const { error: uploadError } = await supabase.storage.from("kiru-evidencias").upload(path, file, { contentType: mime, upsert: false });
        if (uploadError) throw new Error(`No se pudo subir «${file.name}». Inténtalo de nuevo.`);
        const { error: fileError } = await supabase.rpc("kiru_evidence_add_file", { p_message: messageId, p_path: path, p_name: file.name, p_mime: mime, p_size: file.size });
        if (fileError) throw fileError;
      }
      const { error: sendError } = await supabase.rpc("kiru_evidence_send", { p_message: messageId });
      if (sendError) throw sendError;
      notify("Evidencia enviada a Coordinación.");
      setBody(""); setFiles([]);
      await onSaved();
    } catch (e) {
      setError(errorMessage(e, "No se pudo enviar la evidencia."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-[#E7E3DC] bg-white p-3">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000}
        placeholder={evidence.status === "aclaracion" ? "Tu respuesta a Coordinación" : evidence.kind === "descubrirme" ? "Qué ha trabajado el alumno (una línea)" : "Descripción de la misión"}
        className={field} />
      <label className={`${secondaryButton} cursor-pointer`}>
        <Camera className="h-4 w-4" /> {files.length ? `${files.length} foto${files.length > 1 ? "s" : ""} elegida${files.length > 1 ? "s" : ""}` : "Añadir fotos"}
        <input type="file" accept={EVIDENCE_PHOTO_ACCEPT} multiple className="sr-only" onChange={(e) => pick(e.target.files)} />
      </label>
      {error && <p className="text-xs text-[#9A4B3F]">{error}</p>}
      <div><button type="button" disabled={busy} onClick={() => void send()} className={primaryButton}>{busy ? "Enviando…" : "Enviar"}</button></div>
    </div>
  );
}

function ExemptionForm({ evidence, notify, onSaved }: { evidence: MaterialEvidenceRow; notify: (t: string) => void; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [cause, setCause] = useState<EvidenceExemptionCause | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-[#6D6962] hover:text-[#292825]">No he podido hacerla: proponer una exención</button>;
  }
  const save = async () => {
    if (!cause) { setError("Elige la causa."); return; }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("kiru_evidence_exemption_propose", { p_evidence: evidence.id, p_cause: cause, p_note: note });
    setBusy(false);
    if (rpcError) { setError(errorMessage(rpcError, "No se pudo enviar la propuesta.")); return; }
    notify("Exención propuesta. La revisará Administración.");
    await onSaved();
  };
  return (
    <div className="space-y-2 rounded-xl border border-[#E7E3DC] bg-white p-3">
      <select value={cause} onChange={(e) => setCause(e.target.value as EvidenceExemptionCause | "")} aria-label="Causa" className={field}>
        <option value="">Causa…</option>
        {(Object.keys(EXEMPTION_CAUSE_LABEL) as EvidenceExemptionCause[]).map((c) => <option key={c} value={c}>{EXEMPTION_CAUSE_LABEL[c]}</option>)}
      </select>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Explícalo brevemente" className={field} />
      {error && <p className="text-xs text-[#9A4B3F]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || !note.trim()} onClick={() => void save()} className={primaryButton}>Proponer exención</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className={secondaryButton}>Cancelar</button>
      </div>
    </div>
  );
}
