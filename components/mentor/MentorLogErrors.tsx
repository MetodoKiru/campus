"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { LogErrorMarkRow } from "@/lib/database.types";
import { LOG_ERROR_KIND_LABEL, errorMessage, fmtDay } from "@/lib/desempeno";

const primaryButton = "inline-flex items-center gap-1.5 rounded-xl bg-[#242321] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#3A3835] disabled:opacity-50";
const field = "w-full rounded-xl border border-[#E7E3DC] bg-white px-3 py-2.5 text-sm text-[#292825] outline-none focus:border-[#806C50]";

type Loaded = { marks: LogErrorMarkRow[]; students: Record<string, string>; dates: Record<string, string | null> };

async function loadMarks(): Promise<Loaded> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
  const { data, error } = await supabase.from("kiru_log_error_marks").select("*")
    .eq("mentor_id", user.id).neq("status", "retirada").order("marked_at", { ascending: false }).limit(50);
  if (error) throw error;
  const marks = (data ?? []) as LogErrorMarkRow[];
  const studentIds = [...new Set(marks.map((m) => m.student_id).filter((id): id is string => !!id))];
  const logIds = [...new Set(marks.map((m) => m.session_log_id))];
  const [students, logs] = await Promise.all([
    studentIds.length ? supabase.from("profiles").select("id,full_name").in("id", studentIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    logIds.length ? supabase.from("kiru_session_logs").select("id,session_date").in("id", logIds) : Promise.resolve({ data: [] as { id: string; session_date: string | null }[] }),
  ]);
  return {
    marks,
    students: Object.fromEntries((students.data ?? []).map((p) => [p.id, p.full_name])),
    dates: Object.fromEntries((logs.data ?? []).map((l) => [l.id, l.session_date])),
  };
}

/**
 * «Errores en tus registros» (dentro de Justificaciones): lo que Coordinación ha
 * marcado en un registro de sesión y la respuesta del mentor. El plazo es de 2
 * días laborables.
 */
export default function MentorLogErrors({ notify }: { notify: (text: string) => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try { setData(await loadMarks()); setError(""); }
    catch (e) { setError(errorMessage(e, "No se pudieron cargar los errores marcados.")); }
  }, []);
  useEffect(() => {
    let alive = true;
    loadMarks()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(errorMessage(e, "No se pudieron cargar los errores marcados.")); });
    return () => { alive = false; };
  }, []);

  if (error) return <p className="rounded-2xl border border-[#D9B3AA] bg-white p-4 text-xs text-[#9A4B3F]">{error}</p>;
  if (!data || data.marks.length === 0) return null;
  const open = data.marks.filter((m) => m.status === "abierta");
  const answered = data.marks.filter((m) => m.status === "respondida");

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Errores en tus registros</h3>
      <p className="text-xs text-[#6D6962]">Coordinación ha visto algo que corregir en un registro de sesión. Corrígelo si hace falta y contesta aquí antes de que acabe el plazo.</p>
      <ul className="space-y-2">
        {open.map((m) => <OpenMark key={m.id} mark={m} student={data.students[m.student_id ?? ""]} date={data.dates[m.session_log_id] ?? null} notify={notify} onSaved={reload} />)}
        {answered.map((m) => (
          <li key={m.id} className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4">
            <p className="text-sm font-semibold text-[#292825] flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#806C50]" /> Registro del {fmtDay(data.dates[m.session_log_id] ?? null)} · {data.students[m.student_id ?? ""]?.split(" ")[0] ?? "Alumno"}</p>
            <p className="mt-1 text-[11px] text-[#77736B]">{LOG_ERROR_KIND_LABEL[m.kind]} · contestado el {fmtDay(m.replied_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OpenMark({ mark, student, date, notify, onSaved }: {
  mark: LogErrorMarkRow; student?: string; date: string | null; notify: (text: string) => void; onSaved: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const overdue = new Date(mark.due_at) < new Date();

  const send = async () => {
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("kiru_log_error_reply", { p_mark: mark.id, p_body: body });
    setBusy(false);
    if (rpcError) { setError(errorMessage(rpcError, "No se pudo enviar.")); return; }
    notify("Respuesta enviada a Coordinación.");
    await onSaved();
  };

  return (
    <li className="space-y-2 rounded-2xl border border-[#E4D8C5] bg-[#F3EEE5] p-4">
      <p className="text-sm font-semibold text-[#292825] flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-[#806C50]" /> Registro del {fmtDay(date)} · {student?.split(" ")[0] ?? "Alumno"}</p>
      <p className="text-[11px] text-[#77736B]">{LOG_ERROR_KIND_LABEL[mark.kind]} · {overdue ? <strong className="text-[#9A4B3F]">el plazo terminó el {fmtDay(mark.due_at)}</strong> : `contesta antes del ${fmtDay(mark.due_at)}`}</p>
      <p className="text-sm text-[#45433F] whitespace-pre-line">{mark.comment}</p>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="Qué has corregido o tu explicación" className={field} />
      {error && <p className="text-xs text-[#9A4B3F]">{error}</p>}
      <button disabled={busy || !body.trim()} onClick={() => void send()} className={primaryButton}>Enviar respuesta</button>
    </li>
  );
}
