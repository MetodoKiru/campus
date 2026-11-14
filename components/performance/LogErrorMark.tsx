"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { LogErrorKind, LogErrorMarkRow } from "@/lib/database.types";
import { LOG_ERROR_KIND_LABEL, errorMessage, fmtDay } from "@/lib/desempeno";

/**
 * Botón «Error en el registro» dentro de un registro de sesión abierto
 * (Coordinación y Administración). Si ya hay una marca, la enseña.
 */
export default function LogErrorMark({ logId, notify }: { logId: string; notify?: (text: string, type: "success" | "error") => void }) {
  const [mark, setMark] = useState<LogErrorMarkRow | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LogErrorKind | "">("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    supabase.from("kiru_log_error_marks").select("*").eq("session_log_id", logId).neq("status", "retirada").maybeSingle()
      .then(({ data }) => { if (alive) setMark((data as LogErrorMarkRow | null) ?? null); });
    return () => { alive = false; };
  }, [logId]);

  if (mark === undefined) return null;
  if (mark) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-900">
        <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Error marcado el {fmtDay(mark.marked_at)}: {LOG_ERROR_KIND_LABEL[mark.kind]}</p>
        <p className="mt-0.5">{mark.status === "respondida" ? `Contestado el ${fmtDay(mark.replied_at)}.` : `Plazo del mentor: ${fmtDay(mark.due_at)}.`} Se gestiona en «Seguimiento».</p>
      </div>
    );
  }

  const save = async () => {
    if (!kind) { setError("Elige qué tipo de error es."); return; }
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("kiru_log_error_mark", { p_log: logId, p_kind: kind, p_comment: comment });
    setBusy(false);
    if (rpcError) { setError(errorMessage(rpcError, "No se pudo marcar.")); return; }
    notify?.("Error marcado. El mentor tiene 2 días laborables para corregirlo o contestar.", "success");
    const { data: row } = await supabase.from("kiru_log_error_marks").select("*").eq("id", data as string).maybeSingle();
    setMark((row as LogErrorMarkRow | null) ?? null);
    setOpen(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-slate-500 hover:text-amber-800 inline-flex items-center gap-1">
        <AlertTriangle className="h-3.5 w-3.5" /> Error en el registro
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-[#FAF8F5] p-3 space-y-2">
      <p className="text-[11px] text-slate-600">El mentor recibirá un aviso y tendrá 2 días laborables para corregirlo o contestar. Si contesta tarde o no contesta, cuenta en su desempeño.</p>
      <select value={kind} onChange={(e) => setKind(e.target.value as LogErrorKind | "")} aria-label="Tipo de error" className="w-full p-2 rounded-xl border border-slate-200 bg-white text-xs">
        <option value="">Qué tipo de error es…</option>
        {(Object.keys(LOG_ERROR_KIND_LABEL) as LogErrorKind[]).map((k) => <option key={k} value={k}>{LOG_ERROR_KIND_LABEL[k]}</option>)}
      </select>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={2} placeholder="Qué tiene que corregir el mentor" className="w-full p-2 rounded-xl border border-slate-200 bg-white text-xs" />
      {error && <p className="text-[11px] text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || !comment.trim()} onClick={() => void save()} className="rounded-xl bg-cyan-800 px-3 py-2 text-[11px] font-semibold text-white hover:bg-cyan-900 disabled:opacity-50">Marcar el error</button>
        <button disabled={busy} onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
      </div>
    </div>
  );
}
